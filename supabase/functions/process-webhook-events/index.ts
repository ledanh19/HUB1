/**
 * process-webhook-events — Process PENDING webhook events from the queue
 * ──────────────────────────────────────────────────────────────────────
 * Called automatically via pg_net trigger when new PENDING events arrive,
 * or manually/via cron as a fallback.
 *
 * For each PENDING event:
 *  - bookings → call sync-channex-bookings (single_booking mode)
 *             → fire-and-forget push notification for booking changes
 *  - messages → call channex-messages-sync
 *  - ari      → mark as PROCESSED (handled by inventory sync)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderNotification,
  shouldTriggerPush,
  type NotificationInput,
  type BookingChangeForFilter,
} from "../_shared/renderNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const runId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "CONFIG_MISSING" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse optional body for specific event_id
    let specificEventId: string | null = null;
    let batchSize = 20;
    try {
      const body = await req.json();
      specificEventId = body.event_id || null;
      batchSize = body.batch_size || 20;
    } catch {
      // No body
    }

    // Fetch PENDING events
    let query = supabase
      .from("webhook_events")
      .select("id, kind, event_type, payload, provider, request_id")
      .eq("status", "PENDING")
      .eq("is_valid", true)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (specificEventId) {
      query = supabase
        .from("webhook_events")
        .select("id, kind, event_type, payload, provider, request_id")
        .eq("id", specificEventId)
        .eq("status", "PENDING");
    }

    const { data: events, error: fetchError } = await query;

    if (fetchError) {
      console.error(`[ProcessWebhook][${runId}] Fetch error:`, fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!events || events.length === 0) {
      console.log(`[ProcessWebhook][${runId}] No PENDING events to process`);
      return new Response(
        JSON.stringify({ ok: true, processed: 0, run_id: runId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[ProcessWebhook][${runId}] Processing ${events.length} events`);

    let processed = 0;
    let failed = 0;
    const results: Array<{ id: string; kind: string; status: string; error?: string }> = [];

    for (const event of events) {
      try {
        // Mark as PROCESSING
        await supabase
          .from("webhook_events")
          .update({ status: "PROCESSING" })
          .eq("id", event.id);

        let success = false;
        let errorMsg: string | null = null;

        if (event.kind === "bookings") {
          const result = await processBookingEvent(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            supabase,
            event,
          );
          success = result.success;
          errorMsg = result.error || null;

          // Fire-and-forget push notification for successful booking syncs
          if (success) {
            fireAndForgetBookingPush(
              supabase,
              SUPABASE_URL,
              SUPABASE_SERVICE_ROLE_KEY,
              event,
              runId,
            );
          }
        } else if (event.kind === "messages") {
          const result = await processMessageEvent(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            event,
          );
          success = result.success;
          errorMsg = result.error || null;
        } else if (event.kind === "ari") {
          // ARI events are processed by inventory sync cron
          success = true;
        } else {
          // Unknown kind — mark processed to avoid stuck
          success = true;
          console.warn(`[ProcessWebhook][${runId}] Unknown kind: ${event.kind}`);
        }

        // Update status
        await supabase
          .from("webhook_events")
          .update({
            status: success ? "PROCESSED" : "FAILED",
            ...(errorMsg ? { reject_reason: errorMsg } : {}),
          })
          .eq("id", event.id);

        if (success) processed++;
        else failed++;

        results.push({
          id: event.id,
          kind: event.kind || "unknown",
          status: success ? "PROCESSED" : "FAILED",
          ...(errorMsg ? { error: errorMsg } : {}),
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[ProcessWebhook][${runId}] Error processing ${event.id}:`, errMsg);

        await supabase
          .from("webhook_events")
          .update({ status: "FAILED", reject_reason: errMsg })
          .eq("id", event.id);

        failed++;
        results.push({
          id: event.id,
          kind: event.kind || "unknown",
          status: "FAILED",
          error: errMsg,
        });
      }
    }

    const elapsed = Date.now() - startedAt;
    console.log(
      `[ProcessWebhook][${runId}] Done: ${processed} processed, ${failed} failed in ${elapsed}ms`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        run_id: runId,
        processed,
        failed,
        elapsed_ms: elapsed,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (outerErr) {
    const errMsg = outerErr instanceof Error ? outerErr.message : String(outerErr);
    console.error(`[ProcessWebhook][${runId}] Unhandled:`, errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Process a booking webhook event ────────────────────────────
async function processBookingEvent(
  supabaseUrl: string,
  serviceKey: string,
  supabase: any,
  event: any,
): Promise<{ success: boolean; error?: string }> {
  const payload = event.payload;
  if (!payload) return { success: false, error: "EMPTY_PAYLOAD" };

  // Extract booking ID from Channex webhook payload
  // Channex sends: { event: "booking", payload: { booking_id: "...", property_id: "..." } }
  // Try multiple extraction paths for robustness
  let bookingId: string | null = null;

  try {
    const p = typeof payload === 'string' ? JSON.parse(payload) : payload;

    // Path 1: p.payload.booking_id (standard Channex format)
    bookingId = p?.payload?.booking_id || null;
    // Path 2: p.payload.id
    if (!bookingId) bookingId = p?.payload?.id || null;
    // Path 3: p.data.id
    if (!bookingId) bookingId = p?.data?.id || null;
    // Path 4: top-level
    if (!bookingId) bookingId = p?.booking_id || null;
    // Path 5: top-level id
    if (!bookingId) bookingId = p?.id || null;
  } catch {
    // If payload is truly unparseable
    console.warn(`[ProcessBooking] Cannot parse payload for event ${event.id}`);
  }

  if (!bookingId) {
    console.warn(`[ProcessBooking] No booking ID found in event ${event.id}`, JSON.stringify(payload).substring(0, 500));
    return { success: false, error: "NO_BOOKING_ID" };
  }

  console.log(`[ProcessBooking] Extracted booking_id=${bookingId} from event ${event.id}`);
  return await callSyncBooking(supabaseUrl, serviceKey, bookingId);
}

async function callSyncBooking(
  supabaseUrl: string,
  serviceKey: string,
  bookingId: string,
): Promise<{ success: boolean; error?: string }> {
  console.log(`[ProcessBooking] Syncing booking ${bookingId}`);

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/sync-channex-bookings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          mode: "single_booking",
          booking_id: bookingId,
          run_type: "WEBHOOK",
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`[ProcessBooking] Sync failed for ${bookingId}:`, text);
      return { success: false, error: `SYNC_ERROR_${response.status}` };
    }

    const result = await response.json();
    console.log(`[ProcessBooking] Sync result for ${bookingId}:`, JSON.stringify(result).substring(0, 500));
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ── Process a message webhook event ───────────────────────────
async function processMessageEvent(
  supabaseUrl: string,
  serviceKey: string,
  event: any,
): Promise<{ success: boolean; error?: string }> {
  console.log(`[ProcessMessage] Processing message event ${event.id}`);

  try {
    // Call channex-messages-sync to fetch latest messages
    const response = await fetch(
      `${supabaseUrl}/functions/v1/channex-messages-sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          filters: {
            run_type: "WEBHOOK",
            limit: 10,
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`[ProcessMessage] Sync failed:`, text);
      return { success: false, error: `SYNC_ERROR_${response.status}` };
    }

    const result = await response.json();
    console.log(`[ProcessMessage] Sync result:`, JSON.stringify(result).substring(0, 500));
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ── Fire-and-forget push notification for booking changes ─────
// This runs after processBookingEvent succeeds.
// It queries the latest booking_change created by sync,
// checks shouldTriggerPush, renders the notification, and calls send-push.
// NEVER throws — all errors are caught and logged.
function fireAndForgetBookingPush(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  event: any,
  runId: string,
): void {
  // Extract booking ID from event payload to identify the booking_change
  const extractBookingId = (payload: any): string | null => {
    if (!payload) return null;
    const p = typeof payload === "string" ? JSON.parse(payload) : payload;
    return (
      p?.payload?.booking_id ||
      p?.payload?.id ||
      p?.data?.id ||
      p?.booking_id ||
      p?.id ||
      null
    );
  };

  // Map change_type to push event type
  const mapChangeTypeToEventType = (changeType: string, status?: string): string => {
    if (changeType === "INSERT") return "BOOKING_NEW";
    if (changeType === "STATUS_CHANGE" && status === "CANCELLED") return "BOOKING_CANCELLED";
    return "BOOKING_MODIFIED";
  };

  // Async IIFE — fire and forget
  (async () => {
    try {
      const channexBookingId = extractBookingId(event.payload);
      if (!channexBookingId) {
        console.log(`[PushTrigger][${runId}] No booking ID found in event ${event.id}, skip push`);
        return;
      }

      // Find the unified_booking_id from bookings_mirror using provider_booking_id
      const { data: booking, error: bookingError } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, guest_name, check_in_date, nights, ota_source, total_amount_gross, total_amount_net, room_type, booking_status")
        .eq("provider_booking_id", channexBookingId)
        .maybeSingle();

      if (bookingError || !booking) {
        console.log(`[PushTrigger][${runId}] Booking not found for provider_booking_id=${channexBookingId}: ${bookingError?.message || "no match"}`);
        return;
      }

      // Query latest booking_change for this unified_booking_id (created by sync)
      const { data: changes, error: changeError } = await supabase
        .from("booking_changes")
        .select("id, change_type, unified_booking_id, created_at, changed_fields, after_data")
        .eq("unified_booking_id", booking.unified_booking_id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (changeError || !changes || changes.length === 0) {
        console.log(`[PushTrigger][${runId}] No booking_changes for ${booking.unified_booking_id}`);
        return;
      }

      const latestChange = changes[0] as BookingChangeForFilter;
      const recentChanges = changes.slice(1) as BookingChangeForFilter[];

      // STALE GUARD: Skip push for changes older than 2 minutes.
      // This prevents push spam during webhook replays or bulk re-syncs.
      const changeAgeMs = Date.now() - Date.parse(latestChange.created_at);
      if (changeAgeMs > 2 * 60 * 1000) {
        console.log(JSON.stringify({
          tag: "PushTrigger",
          run_id: runId,
          change_id: latestChange.id,
          push_attempted: false,
          reason: "STALE_CHANGE_SKIP",
          change_age_ms: changeAgeMs,
        }));
        return;
      }

      // Check if this change should trigger a push notification
      const pushDecision = shouldTriggerPush(latestChange, recentChanges);
      if (!pushDecision.shouldPush) {
        console.log(JSON.stringify({
          tag: "PushTrigger",
          run_id: runId,
          change_id: latestChange.id,
          event_type: pushDecision.eventType,
          push_attempted: false,
          reason: pushDecision.reason,
        }));
        return;
      }

      // Determine push event type
      const bookingStatus = booking.booking_status || (latestChange.after_data as any)?.booking_status;
      const eventType = mapChangeTypeToEventType(latestChange.change_type, bookingStatus);

      // Render notification using shared renderer
      const rendered = renderNotification({
        eventType: eventType as NotificationInput["eventType"],
        guestName: booking.guest_name || undefined,
        checkInDate: booking.check_in_date || undefined,
        nights: booking.nights || undefined,
        otaSource: booking.ota_source || undefined,
        totalAmount: booking.total_amount_gross || booking.total_amount_net || undefined,
        roomType: booking.room_type || undefined,
        bookingId: booking.unified_booking_id,
        changeId: latestChange.id,
      });

      // Call send-push with AbortController timeout (2s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      try {
        const pushResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              event_type: eventType,
              idempotency_key: `booking_change:${latestChange.id}`,
              broadcast_all: true,
              payload: {
                title: rendered.title,
                body: rendered.body,
                icon: rendered.icon,
                tag: rendered.tag,
                deep_link: rendered.deepLink,
                entity_id: booking.unified_booking_id,
                data: {
                  event_type: eventType,
                  deep_link: rendered.deepLink,
                  entity_id: booking.unified_booking_id,
                  guest_name: booking.guest_name,
                  ota_source: booking.ota_source,
                  _pre_rendered: true,
                  requireInteraction: rendered.requireInteraction,
                  vibrate: rendered.vibratePattern,
                  silent: rendered.silent,
                },
              },
              source_table: "booking_changes",
              source_record_id: latestChange.id,
            }),
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        const pushStatus = pushResponse.ok ? "OK" : `ERROR_${pushResponse.status}`;
        console.log(JSON.stringify({
          tag: "PushTrigger",
          run_id: runId,
          change_id: latestChange.id,
          event_type: eventType,
          unified_booking_id: booking.unified_booking_id,
          push_attempted: true,
          push_status: pushStatus,
        }));
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        const errName = fetchErr instanceof Error ? fetchErr.name : "Unknown";
        console.log(JSON.stringify({
          tag: "PushTrigger",
          run_id: runId,
          change_id: latestChange.id,
          event_type: eventType,
          push_attempted: true,
          push_status: errName === "AbortError" ? "TIMEOUT" : "FETCH_ERROR",
          error: errName,
        }));
      }
    } catch (outerErr) {
      console.error(`[PushTrigger][${runId}] Unexpected error:`, outerErr);
    }
  })();
}
