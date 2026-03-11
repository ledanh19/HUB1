/**
 * channex-messages-webhook — "Always-200" queue-based receiver
 * ─────────────────────────────────────────────────────────────
 * This endpoint is called by Channex for OTA message events.
 *
 * Design contract:
 *  1. ALWAYS return HTTP 200 to prevent Channex from auto-disabling.
 *  2. Validate x-webhook-secret but NEVER respond 401/403.
 *     Invalid requests → is_valid=false + reject_reason, still 200.
 *  3. All heavy processing is deferred — we only INSERT into
 *     webhook_events (queue) and return immediately.
 *  4. Never call external APIs in the request path.
 *  5. Never throw — all errors are caught and logged.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS (allow Channex + browser health checks) ──────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-channex-signature",
  "Access-Control-Max-Age": "86400",
};

/** Structured log helper — always JSON for observability */
function log(
  level: "info" | "warn" | "error",
  requestId: string,
  note: string,
  extra?: Record<string, unknown>,
) {
  const entry = {
    level,
    request_id: requestId,
    kind: "messages",
    ts: new Date().toISOString(),
    note,
    ...extra,
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/** Always-200 JSON response */
function ok200(requestId: string, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: true, request_id: requestId, ...extra }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();

  // ─── CORS preflight ─────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ─── Health check (GET) ─────────────────────────────────────
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, kind: "messages", ts: receivedAt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ─── Everything below is POST handling ──────────────────────
  try {
    // 1. Read environment — if missing, still 200 but log error
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const WEBHOOK_SECRET = Deno.env.get("CHANNEX_WEBHOOK_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      log("error", requestId, "Missing SUPABASE env vars — cannot queue event");
      return ok200(requestId, { queued: false, reason: "CONFIG_MISSING" });
    }

    // 2. Extract headers safely
    const incomingSecret = req.headers.get("x-webhook-secret") || "";
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("webhook_secret") || "";
    const userAgent = req.headers.get("user-agent") || "";
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const contentType = req.headers.get("content-type") || "";

    // 3. Safe header subset for storage (never store the secret value itself)
    const headerSubset: Record<string, string> = {
      "content-type": contentType,
      "user-agent": userAgent,
      "x-forwarded-for": req.headers.get("x-forwarded-for") || "",
      "has-webhook-secret": incomingSecret ? "true" : "false",
      "has-query-secret": querySecret ? "true" : "false",
    };

    // 4. Read body safely
    let payload: unknown = null;
    try {
      const bodyText = await req.text();
      if (bodyText) {
        try {
          payload = JSON.parse(bodyText);
        } catch {
          // Not valid JSON — wrap as raw text
          payload = { raw: bodyText.substring(0, 10000) };
          log("warn", requestId, "Body is not valid JSON, stored as raw text");
        }
      }
    } catch (bodyErr) {
      log("warn", requestId, "Failed to read request body", {
        error: bodyErr instanceof Error ? bodyErr.message : String(bodyErr),
      });
      payload = { raw_error: "BODY_READ_FAILED" };
    }

    // 5. Validate secret — but NEVER reject
    let isValid = true;
    let rejectReason: string | null = null;

    if (!WEBHOOK_SECRET) {
      // Secret not configured on our side — accept but flag
      isValid = false;
      rejectReason = "SECRET_NOT_CONFIGURED";
      log("warn", requestId, "CHANNEX_WEBHOOK_SECRET env not set — accepting but flagging");
    } else {
      const secretMatch =
        (incomingSecret && incomingSecret === WEBHOOK_SECRET) ||
        (querySecret && querySecret === WEBHOOK_SECRET);

      if (!incomingSecret && !querySecret) {
        isValid = false;
        rejectReason = "SECRET_MISSING";
        log("warn", requestId, "No webhook secret provided by caller");
      } else if (!secretMatch) {
        isValid = false;
        rejectReason = "SECRET_MISMATCH";
        log("warn", requestId, "Webhook secret does not match");
      }
    }

    // 6. Extract event_type and property_id for observability
    let eventType = "unknown";
    let propertyId: string | null = null;
    let dedupeKey: string | null = null;

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const p = payload as Record<string, unknown>;
      eventType = (p.event as string) || (p.event_type as string) || "message";

      // Try common Channex payload paths for property_id
      const rawPropertyId = (p.property_id as string | undefined)
        || (((p.relationships as Record<string, unknown>)?.property as Record<string, unknown>)
              ?.data as Record<string, unknown>)?.id as string | undefined
        || null;
      propertyId = typeof rawPropertyId === "string" ? rawPropertyId : null;

      // Build dedupe key from message id if available
      const msgId =
        (p.payload as Record<string, unknown>)?.id ||
        (p.data as Record<string, unknown>)?.id ||
        null;
      if (msgId) {
        dedupeKey = `channex:messages:${msgId}`;
      }
    }

    log("info", requestId, "Webhook received", {
      is_valid: isValid,
      reject_reason: rejectReason,
      event_type: eventType,
      property_id: propertyId,
      ip,
    });

    // 7. Insert into webhook_events queue — single fast DB write
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const insertData: Record<string, unknown> = {
        provider: "channex",
        event_type: eventType,
        kind: "messages",
        request_id: requestId,
        received_at: receivedAt,
        is_valid: isValid,
        reject_reason: rejectReason,
        headers: headerSubset,
        payload,
        ip,
        user_agent: userAgent,
        status: isValid ? "PENDING" : "REJECTED",
        dedupe_key: dedupeKey,
      };

      const { error: insertError } = await supabase
        .from("webhook_events")
        .insert(insertData);

      if (insertError) {
        // If dedupe conflict, that's fine — means we already processed this event
        if (insertError.code === "23505") {
          log("info", requestId, "Duplicate event — already queued", {
            dedupe_key: dedupeKey,
          });
          return ok200(requestId, { queued: false, reason: "DUPLICATE" });
        }
        log("error", requestId, "Failed to insert webhook_events", {
          error: insertError.message,
          code: insertError.code,
        });
        // Still return 200!
        return ok200(requestId, { queued: false, reason: "DB_ERROR" });
      }

      log("info", requestId, "Event queued successfully", {
        is_valid: isValid,
        event_type: eventType,
        property_id: propertyId,
      });

      return ok200(requestId, {
        queued: true,
        is_valid: isValid,
        event_type: eventType,
      });
    } catch (dbErr) {
      log("error", requestId, "DB exception during insert", {
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
      return ok200(requestId, { queued: false, reason: "DB_EXCEPTION" });
    }
  } catch (outerErr) {
    // ─── Absolute last-resort catch — NEVER let anything escape ──
    log("error", requestId, "Unhandled outer exception", {
      error: outerErr instanceof Error ? outerErr.message : String(outerErr),
    });
    return ok200(requestId, { queued: false, reason: "UNHANDLED_ERROR" });
  }
});
