/**
 * channex-webhook — "Always-200" queue-based receiver for BOOKING events
 * ──────────────────────────────────────────────────────────────────────
 * Design contract:
 *  1. ALWAYS return HTTP 200 to prevent Channex from auto-disabling.
 *  2. Validate x-webhook-secret but NEVER respond 401/403.
 *  3. All heavy processing is deferred — only INSERT into webhook_events.
 *  4. Never call external APIs in the request path.
 *  5. Never throw — all errors are caught and logged.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-channex-signature",
  "Access-Control-Max-Age": "86400",
};

function log(
  level: "info" | "warn" | "error",
  requestId: string,
  note: string,
  extra?: Record<string, unknown>,
) {
  const entry = {
    level,
    request_id: requestId,
    kind: "bookings",
    ts: new Date().toISOString(),
    note,
    ...extra,
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function ok200(requestId: string, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ ok: true, request_id: requestId, ...extra }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const receivedAt = new Date().toISOString();

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Health check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, kind: "bookings", ts: receivedAt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const WEBHOOK_SECRET = Deno.env.get("CHANNEX_WEBHOOK_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      log("error", requestId, "Missing SUPABASE env vars");
      return ok200(requestId, { queued: false, reason: "CONFIG_MISSING" });
    }

    // Extract headers safely
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

    const headerSubset: Record<string, string> = {
      "content-type": contentType,
      "user-agent": userAgent,
      "x-forwarded-for": req.headers.get("x-forwarded-for") || "",
      "has-webhook-secret": incomingSecret ? "true" : "false",
      "has-query-secret": querySecret ? "true" : "false",
    };

    // Read body safely
    let payload: unknown = null;
    try {
      const bodyText = await req.text();
      if (bodyText) {
        try {
          payload = JSON.parse(bodyText);
        } catch {
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

    // Soft secret validation — NEVER reject
    let isValid = true;
    let rejectReason: string | null = null;

    if (!WEBHOOK_SECRET) {
      isValid = false;
      rejectReason = "SECRET_NOT_CONFIGURED";
      log("warn", requestId, "CHANNEX_WEBHOOK_SECRET not set");
    } else {
      const secretMatch =
        (incomingSecret && incomingSecret === WEBHOOK_SECRET) ||
        (querySecret && querySecret === WEBHOOK_SECRET);

      if (!incomingSecret && !querySecret) {
        isValid = false;
        rejectReason = "SECRET_MISSING";
        log("warn", requestId, "No webhook secret provided");
      } else if (!secretMatch) {
        isValid = false;
        rejectReason = "SECRET_MISMATCH";
        log("warn", requestId, "Webhook secret mismatch");
      }
    }

    // Extract observability fields
    let eventType = "unknown";
    let propertyId: string | null = null;
    let dedupeKey: string | null = null;

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const p = payload as Record<string, unknown>;
      eventType = (p.event as string) || (p.event_type as string) || "booking";

      // Channex booking payloads
      const attrs = (p.payload as Record<string, unknown>)?.attributes as Record<string, unknown> | undefined;
      propertyId =
        (attrs?.property_id as string) ||
        (p.property_id as string) ||
        null;

      const bookingId =
        (p.payload as Record<string, unknown>)?.id ||
        (p.data as Record<string, unknown>)?.id ||
        null;
      if (bookingId) {
        dedupeKey = `channex:bookings:${bookingId}`;
      }
    }

    log("info", requestId, "Webhook received", {
      is_valid: isValid,
      reject_reason: rejectReason,
      event_type: eventType,
      property_id: propertyId,
      ip,
    });

    // Single fast DB insert
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { error: insertError } = await supabase
        .from("webhook_events")
        .insert({
          provider: "channex",
          event_type: eventType,
          kind: "bookings",
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
        });

      if (insertError) {
        if (insertError.code === "23505") {
          log("info", requestId, "Duplicate event", { dedupe_key: dedupeKey });
          return ok200(requestId, { queued: false, reason: "DUPLICATE" });
        }
        log("error", requestId, "DB insert failed", {
          error: insertError.message,
          code: insertError.code,
        });
        return ok200(requestId, { queued: false, reason: "DB_ERROR" });
      }

      log("info", requestId, "Event queued", {
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
      log("error", requestId, "DB exception", {
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
      return ok200(requestId, { queued: false, reason: "DB_EXCEPTION" });
    }
  } catch (outerErr) {
    log("error", requestId, "Unhandled exception", {
      error: outerErr instanceof Error ? outerErr.message : String(outerErr),
    });
    return ok200(requestId, { queued: false, reason: "UNHANDLED_ERROR" });
  }
});
