import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * CHECK WEBHOOK HEALTH
 * 
 * Purpose: Monitor webhook health and alert when webhooks stop arriving.
 * 
 * This function should be called periodically (e.g., every 15 minutes via cron)
 * to check if webhooks are being received.
 * 
 * Flow:
 * 1. Call check_webhook_health RPC to analyze recent webhook events
 * 2. If status is CRITICAL, log alert and optionally send notification
 * 3. Return health status
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Check Webhook Health Started ===");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse parameters
    let params: any = {};
    if (req.method === "POST") {
      try {
        params = await req.json();
      } catch {
        params = {};
      }
    } else {
      const url = new URL(req.url);
      params = Object.fromEntries(url.searchParams);
    }

    const provider = params.provider || "channex";
    const windowMinutes = parseInt(params.window_minutes || "60");

    console.log(`[Health] Checking health for provider: ${provider}, window: ${windowMinutes} minutes`);

    // Call RPC to check health
    const { data: healthResult, error: rpcError } = await supabase
      .rpc("check_webhook_health", {
        p_provider: provider,
        p_window_minutes: windowMinutes,
      });

    if (rpcError) {
      console.error("[Health] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ success: false, error: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const status = healthResult?.status || "UNKNOWN";
    const eventsInWindow = healthResult?.events_in_window || 0;
    const lastEventAt = healthResult?.last_event_at;

    console.log(`[Health] Status: ${status}, Events in window: ${eventsInWindow}`);

    // If CRITICAL, log alert (and optionally send notification)
    if (status === "CRITICAL") {
      console.error(`🚨 [Health] CRITICAL: No webhook events in last ${windowMinutes} minutes!`);
      
      // TODO: Send alert notification (Slack, email, etc.)
      // For now, we just log it. Can integrate with notification system later.
    } else if (status === "WARNING") {
      console.warn(`⚠️ [Health] WARNING: Low webhook activity - only ${eventsInWindow} events in last ${windowMinutes} minutes`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status,
        provider,
        events_in_window: eventsInWindow,
        last_event_at: lastEventAt,
        window_minutes: windowMinutes,
        message: status === "HEALTHY" 
          ? "Webhook health is normal"
          : status === "WARNING"
          ? "Webhook activity is low"
          : "No recent webhook events detected - check Channex configuration",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Health] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
