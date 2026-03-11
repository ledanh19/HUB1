import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API_VERSION = "v22.0";

// ============================================================================
// WhatsApp Test Send — Lightweight template-only send for Settings page testing
// Sends hello_world template to a specified phone number.
// Does NOT create conversation/message records — this is purely for verification.
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing server configuration" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ====================================================================
    // Auth check
    // ====================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
    } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ====================================================================
    // Parse request
    // ====================================================================
    const body = await req.json();
    const {
      to_phone,
      phone_number_id,
      template_name = "hello_world",
      language = "en_US",
    } = body;

    if (!to_phone || !phone_number_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: to_phone, phone_number_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Normalize phone — digits only
    const normalizedPhone = to_phone.replace(/[^\d]/g, "");
    if (normalizedPhone.length < 8) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[WA-TEST][${requestId}] Test send to ${normalizedPhone} via ${phone_number_id}`,
    );

    // ====================================================================
    // Lookup integration to get access_token_ref
    // ====================================================================
    const { data: integration, error: intError } = await supabase
      .from("whatsapp_integrations")
      .select("id, access_token_ref, tenant_id")
      .eq("phone_number_id", phone_number_id)
      .eq("status", "active")
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({
          error:
            "No active WhatsApp integration found for this phone_number_id",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify tenant ownership
    if (integration.tenant_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Forbidden — not your integration" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve access token
    const accessToken =
      Deno.env.get(integration.access_token_ref) ||
      Deno.env.get("WHATSAPP_ACCESS_TOKEN");

    if (!accessToken) {
      return new Response(
        JSON.stringify({
          error: `Access token not configured. ENV var "${integration.access_token_ref}" not found.`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ====================================================================
    // Call Meta Graph API — template message
    // ====================================================================
    const graphBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "template",
      template: {
        name: template_name,
        language: { code: language },
      },
    };

    const graphUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phone_number_id}/messages`;

    console.log(`[WA-TEST][${requestId}] Calling Graph API:`, graphUrl);

    const graphResponse = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(graphBody),
    });

    const graphData = await graphResponse.json();

    if (!graphResponse.ok) {
      const errorDetail =
        graphData?.error?.message || JSON.stringify(graphData);
      console.error(
        `[WA-TEST][${requestId}] Graph API error:`,
        graphResponse.status,
        errorDetail,
      );

      // Update integration with error
      await supabase
        .from("whatsapp_integrations")
        .update({
          last_error: `Test send failed: ${errorDetail}`,
          last_health_check_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      return new Response(
        JSON.stringify({
          error: "Graph API error",
          details: errorDetail,
          status_code: graphResponse.status,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const wamid = graphData?.messages?.[0]?.id || null;

    console.log(
      `[WA-TEST][${requestId}] Success! wamid:`,
      wamid,
    );

    // Update integration - clear error, set health check
    await supabase
      .from("whatsapp_integrations")
      .update({
        last_error: null,
        last_health_check_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    // Log to message_events for observability
    await supabase.from("message_events").insert({
      request_id: requestId,
      event_type: "TEST_SEND_SUCCESS",
      payload: {
        to_phone: normalizedPhone,
        phone_number_id,
        template_name,
        wamid,
        channel: "whatsapp",
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        wamid,
        to_phone: normalizedPhone,
        template_name,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[WA-TEST][${requestId}] Unexpected error:`, msg);
    return new Response(
      JSON.stringify({ error: msg, request_id: requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
