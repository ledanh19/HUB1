import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * PROCESS WEBHOOK RETRIES
 * 
 * Purpose: Process failed webhooks from the retry queue with exponential backoff.
 * 
 * This function should be called periodically (e.g., every 5 minutes via cron)
 * to process pending webhook retries.
 * 
 * Flow:
 * 1. Get pending retries from queue (using get_pending_webhook_retries RPC)
 * 2. For each retry, attempt to reprocess the webhook
 * 3. Update retry status based on result
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Process Webhook Retries Started ===");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const channexApiKey = Deno.env.get("CHANNEX_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse limit from request
    let limit = 10;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        limit = body.limit || 10;
      } catch {
        // Use default
      }
    }

    // Get pending retries using RPC
    const { data: pendingRetries, error: rpcError } = await supabase
      .rpc("get_pending_webhook_retries", { p_limit: limit });

    if (rpcError) {
      console.error("[Retries] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ success: false, error: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pendingRetries || pendingRetries.length === 0) {
      console.log("[Retries] No pending retries to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending retries" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Retries] Processing ${pendingRetries.length} pending retries`);

    const results: Array<{ id: string; status: string; error?: string; error_code?: string }> = [];

    for (const retry of pendingRetries) {
      console.log(`[Retries] Processing retry ${retry.id} (attempt ${retry.retry_count + 1}/${retry.max_retries})`);

      try {
        // Extract booking ID from payload
        const payload = retry.payload as any;
        const notificationPayload = payload?.payload || {};
        const bookingId = notificationPayload.booking_id || payload?.booking_id || payload?.data?.id;

        if (!bookingId) {
          throw new Error("No booking ID found in payload");
        }

        // Fetch booking from Channex API
        if (!channexApiKey) {
          throw new Error("CHANNEX_API_KEY not configured");
        }

        const bookingResponse = await fetch(
          `https://app.channex.io/api/v1/bookings/${bookingId}?include=property,rooms`,
          {
            headers: {
              "user-api-key": channexApiKey,
              "Content-Type": "application/json",
            },
          }
        );

        if (!bookingResponse.ok) {
          const errorText = await bookingResponse.text();
          throw new Error(`Channex API error: ${bookingResponse.status} - ${errorText}`);
        }

        const bookingJson = await bookingResponse.json();
        const booking = bookingJson.data;

        if (!booking) {
          throw new Error("Empty booking data from Channex");
        }

        // Call sync-channex-bookings to process
        const syncResponse = await fetch(
          `${supabaseUrl}/functions/v1/sync-channex-bookings`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "apikey": supabaseServiceKey,
            },
            body: JSON.stringify({
              mode: "single_booking",
              booking_id: bookingId,
              sync_source: "RETRY",
            }),
          }
        );

        if (!syncResponse.ok) {
          const errorText = await syncResponse.text();
          throw new Error(`Sync failed: ${errorText}`);
        }

        const syncResult = await syncResponse.json();
        if (!syncResult?.success) {
          throw new Error(`Sync returned success=false: ${JSON.stringify(syncResult)}`);
        }

        // Success - mark as completed and clear previous error metadata
        await supabase
          .from("webhook_retry_queue")
          .update({
            status: "COMPLETED",
            last_error: null,
            error_code: null,
            next_retry_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", retry.id);

        // Also update original webhook event
        if (retry.webhook_event_id) {
          await supabase
            .from("webhook_events")
            .update({
              status: "PROCESSED",
              processed_at: new Date().toISOString(),
              error: null,
            })
            .eq("id", retry.webhook_event_id);
        }

        results.push({ id: retry.id, status: "COMPLETED" });
        console.log(`[Retries] Successfully processed retry ${retry.id}`);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Retries] Error processing retry ${retry.id}:`, errorMessage);

        // Categorize error for better debugging
        let errorCode = "UNKNOWN";
        if (errorMessage.includes("CHANNEX_API_KEY")) errorCode = "CONFIG_ERROR";
        else if (errorMessage.includes("Channex API error")) errorCode = "API_ERROR";
        else if (errorMessage.includes("mapping") || errorMessage.includes("property")) errorCode = "MAPPING_MISSING";
        else if (errorMessage.includes("Sync failed")) errorCode = "SYNC_ERROR";
        else if (errorMessage.includes("booking ID")) errorCode = "VALIDATION_FAIL";

        // Update retry with error - retry_count was already incremented by RPC
        // So we compare current count against max
        const currentRetryCount = (retry.retry_count || 0);
        const maxRetries = retry.max_retries || 3;
        // Since RPC already set status to PROCESSING, we need to decide new status
        // The RPC increments on existing records, for new it's 0
        // Here we're in the processing phase, so if current >= max, it's failed
        const isFailed = currentRetryCount >= maxRetries;

        // Calculate next retry time with exponential backoff: 2^n minutes (max 64 min)
        const backoffMinutes = Math.pow(2, Math.min(currentRetryCount + 1, 6));
        const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

        await supabase
          .from("webhook_retry_queue")
          .update({
            status: isFailed ? "FAILED" : "PENDING",
            retry_count: currentRetryCount + 1,
            last_error: errorMessage,
            error_code: errorCode,
            next_retry_at: nextRetryAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", retry.id);

        results.push({ 
          id: retry.id, 
          status: isFailed ? "FAILED" : "PENDING",
          error: errorMessage,
          error_code: errorCode,
        });
      }

      // Rate limiting between retries
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const completed = results.filter(r => r.status === "COMPLETED").length;
    const failed = results.filter(r => r.status === "FAILED").length;
    const pending = results.filter(r => r.status === "PENDING").length;

    console.log(`[Retries] Complete. Completed: ${completed}, Failed: ${failed}, Re-queued: ${pending}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        completed,
        failed,
        pending,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Retries] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
