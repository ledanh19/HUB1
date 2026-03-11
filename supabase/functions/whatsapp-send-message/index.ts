import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
};

// Meta Graph API version
const GRAPH_API_VERSION = "v22.0";

interface SendWhatsAppRequest {
  client_message_id?: string;
  conversation_id: string;
  body: string;
  // Template fields (required when outside 24h window)
  template_name?: string;
  template_language?: string;
  template_components?: unknown[];
}

// ============================================================================
// Exponential backoff retry helper
// ============================================================================
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // Don't retry on client errors (4xx) except 429
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }
      // Retry on server errors (5xx) and 429
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`[WA-SEND] Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
      lastError = new Error(`HTTP ${response.status}: ${await response.text()}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error(`[WA-SEND][${requestId}] Missing SUPABASE env vars`);
      return new Response(
        JSON.stringify({ error: "Missing configuration" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ====================================================================
    // Auth — extract userId from Bearer token (same pattern as channex-send)
    // ====================================================================
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    if (!userId) {
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
    let request: SendWhatsAppRequest;
    try {
      request = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const idempotencyKey =
      req.headers.get("idempotency-key") ||
      request.client_message_id ||
      `${request.conversation_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { conversation_id, body, template_name, template_language, template_components } = request;

    if (!conversation_id || (!body && !template_name)) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: conversation_id and (body or template_name)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ====================================================================
    // Message sanitization (same as channex-send-message)
    // ====================================================================
    const MAX_MESSAGE_LENGTH = 4096; // WhatsApp limit is 4096 chars
    let sanitizedBody = (body || "")
      .replace(/\0/g, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .trim();

    if (!sanitizedBody && !template_name) {
      return new Response(
        JSON.stringify({ error: "Message body is empty after sanitization" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (sanitizedBody.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({
          error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`,
          current_length: sanitizedBody.length,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[WA-SEND][${requestId}] Send request, idempotency_key: ${idempotencyKey}, length: ${sanitizedBody.length}`,
    );

    // ====================================================================
    // Rate limit (reuse existing check_rate_limit RPC)
    // ====================================================================
    const rateLimitKey = `send_message:${conversation_id}:${userId}`;
    const { data: rateLimitResult, error: rateLimitError } = await supabase.rpc(
      "check_rate_limit",
      {
        p_bucket_key: rateLimitKey,
        p_window_seconds: 5,
        p_max_requests: 1,
      },
    );

    if (rateLimitError) {
      console.warn(
        `[WA-SEND][${requestId}] Rate limit check failed (allowing):`,
        rateLimitError,
      );
    } else if (rateLimitResult === false) {
      console.warn(
        `[WA-SEND][${requestId}] Rate limit exceeded for user ${userId}`,
      );
      await supabase.from("message_events").insert({
        request_id: requestId,
        conversation_id,
        event_type: "SEND_RATE_LIMITED",
        payload: { user_id: userId, bucket_key: rateLimitKey, channel: "whatsapp" },
      });
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Please wait a few seconds.",
          retry_after: 5,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "5",
          },
        },
      );
    }

    // ====================================================================
    // Lookup conversation
    // ====================================================================
    const { data: conv } = await supabase
      .from("conversations")
      .select(
        "id, channel_type, channel_provider, external_conversation_id, guest_phone, wa_customer_phone, wa_phone_number_id, last_inbound_at, metadata",
      )
      .eq("id", conversation_id)
      .single();

    if (!conv) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (conv.channel_type !== "WHATSAPP") {
      return new Response(
        JSON.stringify({
          error: "This endpoint is for WhatsApp conversations only",
          channel_type: conv.channel_type,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Extract customer phone and phone_number_id
    // Normalize phone: strip non-digits to match webhook's normalizePhone()
    const rawPhone =
      conv.wa_customer_phone ||
      conv.guest_phone ||
      (conv.metadata as any)?.wa_customer_id;
    const customerPhone = rawPhone ? rawPhone.replace(/[^\d]/g, "") : null;
    const phoneNumberId =
      conv.wa_phone_number_id ||
      (conv.metadata as any)?.phone_number_id;

    if (!customerPhone || !phoneNumberId) {
      return new Response(
        JSON.stringify({
          error: "Missing WhatsApp phone info on conversation",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ====================================================================
    // Get WhatsApp integration config (access_token from Vault ref)
    // ====================================================================
    const { data: integration } = await supabase
      .from("whatsapp_integrations")
      .select("id, access_token_ref, tenant_id")
      .eq("phone_number_id", phoneNumberId)
      .eq("status", "active")
      .single();

    if (!integration) {
      return new Response(
        JSON.stringify({
          error: "No active WhatsApp integration for this phone number",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Resolve access token from Vault reference
    // The access_token_ref stores the key name in Deno.env or Supabase Vault
    const accessToken = Deno.env.get(integration.access_token_ref) ||
      Deno.env.get("WHATSAPP_ACCESS_TOKEN"); // Fallback for simpler setup

    if (!accessToken) {
      console.error(
        `[WA-SEND][${requestId}] Cannot resolve access_token_ref: ${integration.access_token_ref}`,
      );
      return new Response(
        JSON.stringify({ error: "WhatsApp access token not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ====================================================================
    // 24h window check
    // ====================================================================
    const lastInbound = conv.last_inbound_at
      ? new Date(conv.last_inbound_at)
      : null;
    const now = new Date();
    const isWithin24h =
      lastInbound && now.getTime() - lastInbound.getTime() < 24 * 60 * 60 * 1000;

    if (!isWithin24h && !template_name) {
      return new Response(
        JSON.stringify({
          error:
            "Outside 24-hour messaging window. A template message is required.",
          last_inbound_at: conv.last_inbound_at,
          requires_template: true,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ====================================================================
    // Idempotency check (same pattern as channex-send-message)
    // ====================================================================
    const { data: existingMessage } = await supabase
      .from("outbound_messages")
      .select("id, status, external_message_id, sent_at")
      .eq("client_message_id", idempotencyKey)
      .single();

    if (existingMessage) {
      if (existingMessage.status === "SENT") {
        console.log(
          `[WA-SEND][${requestId}] Idempotency hit — already sent:`,
          idempotencyKey,
        );
        await supabase.from("message_events").insert({
          request_id: requestId,
          conversation_id,
          outbound_id: existingMessage.id,
          event_type: "SEND_IDEMPOTENT_HIT",
          payload: {
            client_message_id: idempotencyKey,
            status: existingMessage.status,
            channel: "whatsapp",
          },
        });
        return new Response(
          JSON.stringify({
            success: true,
            status: "already_sent",
            idempotent: true,
            outbound_id: existingMessage.id,
            external_message_id: existingMessage.external_message_id,
            sent_at: existingMessage.sent_at,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (existingMessage.status === "SENDING") {
        return new Response(
          JSON.stringify({
            error: "Message is already being sent",
            outbound_id: existingMessage.id,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      // FAILED → allow retry
    }

    // ====================================================================
    // Create/update outbound_messages record
    // ====================================================================
    const { data: outboundData, error: upsertError } = await supabase
      .from("outbound_messages")
      .upsert(
        {
          client_message_id: idempotencyKey,
          conversation_id,
          channel_provider: "meta",
          body: sanitizedBody || `[Template: ${template_name}]`,
          attachments: [],
          status: "SENDING",
          retry_count: existingMessage
            ? ((existingMessage as any).retry_count || 0) + 1
            : 0,
          error: null,
          created_by: userId,
        },
        { onConflict: "client_message_id" },
      )
      .select("id")
      .single();

    if (upsertError) {
      console.error(
        `[WA-SEND][${requestId}] Error creating outbound record:`,
        upsertError,
      );
      return new Response(
        JSON.stringify({ error: "Failed to create message record" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const outboundId = outboundData?.id;

    // Log send requested
    await supabase.from("message_events").insert({
      request_id: requestId,
      conversation_id,
      outbound_id: outboundId,
      event_type: "SEND_REQUESTED",
      payload: {
        client_message_id: idempotencyKey,
        channel: "whatsapp",
        is_template: !!template_name,
        within_24h: isWithin24h,
      },
    });

    // ====================================================================
    // Build Graph API request body
    // ====================================================================
    let graphBody: Record<string, unknown>;

    if (template_name && !isWithin24h) {
      // Template message (outside 24h window)
      graphBody = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: customerPhone,
        type: "template",
        template: {
          name: template_name,
          language: { code: template_language || "vi" },
          components: template_components || [],
        },
      };
    } else {
      // Free-form text message (within 24h window)
      graphBody = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: customerPhone,
        type: "text",
        text: {
          preview_url: false,
          body: sanitizedBody,
        },
      };
    }

    // ====================================================================
    // Call Meta Graph API with retry
    // ====================================================================
    console.log(
      `[WA-SEND][${requestId}] Calling Graph API for phone_number_id:`,
      phoneNumberId,
    );

    let graphResponse: Response;
    try {
      graphResponse = await fetchWithRetry(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(graphBody),
        },
        3, // max retries
      );
    } catch (retryErr) {
      const errorMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.error(
        `[WA-SEND][${requestId}] Graph API failed after retries:`,
        errorMsg,
      );
      await supabase
        .from("outbound_messages")
        .update({
          status: "FAILED",
          error: `Graph API Error (after retries): ${errorMsg}`,
        })
        .eq("client_message_id", idempotencyKey);

      await supabase.from("message_events").insert({
        request_id: requestId,
        conversation_id,
        outbound_id: outboundId,
        event_type: "SEND_FAILED",
        payload: { error: errorMsg, channel: "whatsapp", retried: true },
      });

      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp message", details: errorMsg }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      console.error(
        `[WA-SEND][${requestId}] Graph API error:`,
        graphResponse.status,
        errorText,
      );

      await supabase
        .from("outbound_messages")
        .update({
          status: "FAILED",
          error: `Graph API Error: ${graphResponse.status} - ${errorText}`,
        })
        .eq("client_message_id", idempotencyKey);

      await supabase.from("message_events").insert({
        request_id: requestId,
        conversation_id,
        outbound_id: outboundId,
        event_type: "SEND_FAILED",
        payload: {
          error: errorText,
          status_code: graphResponse.status,
          channel: "whatsapp",
        },
      });

      return new Response(
        JSON.stringify({
          error: "Failed to send WhatsApp message",
          details: errorText,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ====================================================================
    // SUCCESS — Parse response and update records
    // ====================================================================
    const graphData = await graphResponse.json();
    const wamid = graphData.messages?.[0]?.id || null;
    const sentAt = new Date().toISOString();

    console.log(
      `[WA-SEND][${requestId}] Message sent successfully, wamid:`,
      wamid,
    );

    // Update outbound → SENT
    await supabase
      .from("outbound_messages")
      .update({
        status: "SENT",
        external_message_id: wamid,
        sent_at: sentAt,
        error: null,
      })
      .eq("client_message_id", idempotencyKey);

    // Insert into messages table (OUTBOUND, same pattern as channex-send)
    let linkedMessageId: string | null = null;
    if (wamid) {
      const { data: mirrorData } = await supabase
        .from("messages")
        .upsert(
          {
            external_message_id: wamid,
            conversation_id,
            direction: "OUTBOUND",
            sender_type: "AGENT",
            body: sanitizedBody || `[Template: ${template_name}]`,
            attachments: [],
            sent_at: sentAt,
            synced_at: sentAt,
            sender_id: userId,
            // WhatsApp-specific
            channel_type: "WHATSAPP",
            wamid,
            wa_phone_number_id: phoneNumberId,
            wa_status: "SENT",
          },
          { onConflict: "external_message_id" },
        )
        .select("id")
        .single();

      linkedMessageId = mirrorData?.id ?? null;

      // Update conversation timestamps
      await supabase
        .from("conversations")
        .update({
          last_message_at: sentAt,
          last_outbound_at: sentAt,
          unread_count: 0, // Reset unread when agent replies
        })
        .eq("id", conversation_id);
    }

    // Log success
    await supabase.from("message_events").insert({
      request_id: requestId,
      conversation_id,
      outbound_id: outboundId,
      event_type: "SEND_SUCCESS",
      payload: {
        wamid,
        linked_message_id: linkedMessageId,
        channel: "whatsapp",
        is_template: !!template_name,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        outbound_id: outboundId,
        wamid,
        external_message_id: wamid,
        client_message_id: idempotencyKey,
        sent_at: sentAt,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[WA-SEND][${requestId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({ error: errorMessage, request_id: requestId }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
