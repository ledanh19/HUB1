import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
};

interface SendMessageRequest {
  client_message_id?: string;
  conversation_id: string;
  thread_id?: string; // external_conversation_id from Channex
  body: string;
  attachments?: unknown[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const CHANNEX_USER_API_KEY = Deno.env.get("CHANNEX_USER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!CHANNEX_USER_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error(`[SEND][${requestId}] Missing required environment variables`);
      return new Response(
        JSON.stringify({ error: "Missing configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user from auth token
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Parse request body
    let request: SendMessageRequest;
    try {
      request = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get idempotency key from header or body
    const idempotencyKey = req.headers.get("idempotency-key") || 
                           request.client_message_id || 
                           `${request.conversation_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { conversation_id, thread_id, body, attachments } = request;

    if (!conversation_id || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: conversation_id, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // MESSAGE SANITIZATION (OPS-GRADE REQUIREMENT)
    // Strip null bytes, control chars, enforce max length
    // =========================================================================
    const MAX_MESSAGE_LENGTH = 2000;
    
    // Sanitize message body
    let sanitizedBody = body
      .replace(/\0/g, '')  // Remove null bytes
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars (except \n, \r, \t)
      .trim();
    
    if (!sanitizedBody) {
      return new Response(
        JSON.stringify({ error: "Message body is empty after sanitization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (sanitizedBody.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ 
          error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.`,
          current_length: sanitizedBody.length 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SEND][${requestId}] Sending message, idempotency_key: ${idempotencyKey}, length: ${sanitizedBody.length}`);

    // =========================================================================
    // SERVER-SIDE RATE LIMITING (DO NOT RELY ON UI)
    // Check: max 1 message per 5 seconds per (conversation, user)
    // =========================================================================
    if (userId) {
      const rateLimitKey = `send_message:${conversation_id}:${userId}`;
      
      // Call the check_rate_limit function from DB
      const { data: rateLimitResult, error: rateLimitError } = await supabase
        .rpc('check_rate_limit', {
          p_bucket_key: rateLimitKey,
          p_window_seconds: 5,
          p_max_requests: 1
        });
      
      if (rateLimitError) {
        console.warn(`[SEND][${requestId}] Rate limit check failed (allowing):`, rateLimitError);
        // Log but don't block if rate limit check itself fails
      } else if (rateLimitResult === false) {
        console.warn(`[SEND][${requestId}] Rate limit exceeded for user ${userId} on conversation ${conversation_id}`);
        
        // Log rate limit event
        await supabase.from("message_events").insert({
          request_id: requestId,
          conversation_id: conversation_id,
          event_type: "SEND_RATE_LIMITED",
          payload: { user_id: userId, bucket_key: rateLimitKey },
        });
        
        return new Response(
          JSON.stringify({ 
            error: "Rate limit exceeded. Please wait a few seconds before sending another message.",
            retry_after: 5 
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "5" } }
        );
      }
    }

    // Get conversation to find external_conversation_id if not provided
    let externalThreadId = thread_id;
    let internalConversationId = conversation_id;

    if (!externalThreadId) {
      // Try to get by internal ID first
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, external_conversation_id")
        .eq("id", conversation_id)
        .single();

      if (conv) {
        externalThreadId = conv.external_conversation_id;
        internalConversationId = conv.id;
      } else {
        // Maybe conversation_id is the external ID
        const { data: conv2 } = await supabase
          .from("conversations")
          .select("id, external_conversation_id")
          .eq("external_conversation_id", conversation_id)
          .single();

        if (conv2) {
          externalThreadId = conv2.external_conversation_id;
          internalConversationId = conv2.id;
        }
      }
    }

    if (!externalThreadId) {
      return new Response(
        JSON.stringify({ error: "Could not find conversation thread ID" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for idempotency - if message already exists with same client_message_id
    const { data: existingMessage } = await supabase
      .from("outbound_messages")
      .select("id, status, external_message_id, sent_at")
      .eq("client_message_id", idempotencyKey)
      .single();

    if (existingMessage) {
      if (existingMessage.status === "SENT") {
        console.log(`[SEND][${requestId}] Message already sent (idempotency):`, idempotencyKey);
        
        // Log idempotency hit
        await supabase.from("message_events").insert({
          request_id: requestId,
          conversation_id: internalConversationId,
          outbound_id: existingMessage.id,
          event_type: "SEND_IDEMPOTENT_HIT",
          payload: { client_message_id: idempotencyKey, status: existingMessage.status },
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
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If status is SENDING, prevent duplicate sends
      if (existingMessage.status === "SENDING") {
        console.log(`[SEND][${requestId}] Message already sending:`, idempotencyKey);
        return new Response(
          JSON.stringify({ error: "Message is already being sent", outbound_id: existingMessage.id }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If FAILED, allow retry - will update below
    }

    // Create or update outbound message record with CAS (Compare-And-Swap) logic
    const { data: outboundData, error: upsertError } = await supabase
      .from("outbound_messages")
      .upsert({
        client_message_id: idempotencyKey,
        conversation_id: internalConversationId,
        channel_provider: "channex",
        body: sanitizedBody,  // Use sanitized body
        attachments: attachments || [],
        status: "SENDING",
        retry_count: existingMessage ? (existingMessage as any).retry_count + 1 : 0,
        error: null,
        created_by: userId, // Track who sent the message
      }, {
        onConflict: "client_message_id",
      })
      .select("id")
      .single();

    if (upsertError) {
      console.error(`[SEND][${requestId}] Error creating outbound message record:`, upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to create message record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const outboundId = outboundData?.id;

    // Log send requested event
    await supabase.from("message_events").insert({
      request_id: requestId,
      conversation_id: internalConversationId,
      outbound_id: outboundId,
      event_type: "SEND_REQUESTED",
      payload: { client_message_id: idempotencyKey, thread_id: externalThreadId },
    });

    // Send message to Channex API
    console.log(`[SEND][${requestId}] Calling Channex API for thread:`, externalThreadId);
    
    const channexResponse = await fetch(
      `https://app.channex.io/api/v1/message_threads/${externalThreadId}/messages`,
      {
        method: "POST",
        headers: {
          "user-api-key": CHANNEX_USER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            message: sanitizedBody,  // Use sanitized body
          },
        }),
      }
    );

    if (!channexResponse.ok) {
      const errorText = await channexResponse.text();
      console.error(`[SEND][${requestId}] Channex API error:`, channexResponse.status, errorText);

      // Update status to FAILED
      await supabase
        .from("outbound_messages")
        .update({ 
          status: "FAILED", 
          error: `Channex API Error: ${channexResponse.status} - ${errorText}` 
        })
        .eq("client_message_id", idempotencyKey);

      // Log failure event
      await supabase.from("message_events").insert({
        request_id: requestId,
        conversation_id: internalConversationId,
        outbound_id: outboundId,
        event_type: "SEND_FAILED",
        payload: { error: errorText, status_code: channexResponse.status },
      });

      return new Response(
        JSON.stringify({ error: "Failed to send message to Channex", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const channexData = await channexResponse.json();
    const externalMessageId = channexData.data?.id;
    const sentAt = new Date().toISOString();

    console.log(`[SEND][${requestId}] Message sent successfully, External ID:`, externalMessageId);

    // Update outbound message status to SENT
    await supabase
      .from("outbound_messages")
      .update({ 
        status: "SENT", 
        external_message_id: externalMessageId,
        sent_at: sentAt,
        error: null,
      })
      .eq("client_message_id", idempotencyKey);

    // Also add to messages table as OUTBOUND for the mirror
    let linkedMirrorMessageId: string | null = null;
    if (externalMessageId) {
      const { data: mirrorData } = await supabase
        .from("messages")
        .upsert({
          external_message_id: externalMessageId,
          conversation_id: internalConversationId,
          direction: "OUTBOUND",
          sender_type: "AGENT",
          body,
          attachments: attachments || [],
          sent_at: sentAt,
          synced_at: sentAt,
          sender_id: userId, // Track who sent the message
        }, {
          onConflict: "external_message_id",
        })
        .select("id")
        .single();

      linkedMirrorMessageId = mirrorData?.id || null;

      // Update conversation timestamps
      await supabase
        .from("conversations")
        .update({ 
          last_message_at: sentAt,
          last_outbound_at: sentAt,
          unread_count: 0, // Reset unread when agent replies
        })
        .eq("id", internalConversationId);
    }

    // Log success event
    await supabase.from("message_events").insert({
      request_id: requestId,
      conversation_id: internalConversationId,
      outbound_id: outboundId,
      event_type: "SEND_SUCCESS",
      payload: { 
        external_message_id: externalMessageId,
        linked_mirror_message_id: linkedMirrorMessageId,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        outbound_id: outboundId,
        external_message_id: externalMessageId,
        client_message_id: idempotencyKey,
        sent_at: sentAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SEND][${requestId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({ error: errorMessage, request_id: requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
