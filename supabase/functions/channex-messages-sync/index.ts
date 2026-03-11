import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  renderNotification,
  type NotificationInput,
} from "../_shared/renderNotification.ts";

interface ChannexThread {
  id: string;
  attributes: {
    guest_name?: string;
    guest_email?: string;
    guest_phone?: string;
    ota_name?: string;
    is_closed?: boolean;
    is_messaging_supported?: boolean;
    last_message_received_at?: string;
    inserted_at: string;
    updated_at?: string;
  };
  relationships?: {
    booking?: { data?: { id: string } };
    property?: { data?: { id: string } };
  };
}

interface ChannexMessage {
  id: string;
  attributes: {
    content?: string;
    body?: string;
    message?: string;
    text?: string;
    inserted_at: string;
    updated_at?: string;
    sender?: string;
    sender_type?: string;
    direction?: string;
    attachments?: unknown[];
  };
  relationships?: {
    message_thread?: { data?: { id: string } };
  };
}

interface SyncFilters {
  property_id?: string;
  is_closed?: boolean;
  page?: number;
  limit?: number;
  since?: string;
  run_type?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCorsPrelight();
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const CHANNEX_USER_API_KEY = Deno.env.get("CHANNEX_USER_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !CHANNEX_USER_API_KEY) {
      console.error("[SYNC] Missing required environment variables");
      return errorResponse("Missing configuration", 500);
    }

    // JWT Validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error(`[SYNC][${runId}] Missing or invalid Authorization header`);
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    
    if (userError || !user) {
      const errorMessage = userError?.message || "Invalid JWT";
      const isExpired = errorMessage.toLowerCase().includes("expired");
      console.error(`[SYNC][${runId}] JWT validation failed:`, errorMessage);
      return jsonResponse({ 
        error: isExpired ? "Session expired. Please refresh and try again." : "Unauthorized",
        code: "JWT_ERROR"
      }, 401);
    }

    const userId = user.id;
    console.log(`[SYNC][${runId}] Authenticated user: ${userId}`);

    // Use service role client for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body for optional filters
    let filters: SyncFilters = {};
    try {
      const body = await req.json();
      filters = body.filters || {};
    } catch {
      // No body or invalid JSON, use defaults
    }

    const runType = filters.run_type || "MANUAL";
    console.log(`[SYNC][${runId}] Starting messages sync - Type: ${runType}, Filters:`, filters);

    // Update sync state to SYNCING
    await supabase.from("sync_state").upsert({
      key: "channex_messages",
      status: "SYNCING",
      last_sync_started_at: startedAt,
      value_json: { run_id: runId, filters },
      updated_at: startedAt,
    }, { onConflict: "key" });

    // Step 1: Fetch message threads
    const threadsUrl = new URL("https://app.channex.io/api/v1/message_threads");
    
    if (filters.property_id) {
      threadsUrl.searchParams.append("filter[property_id]", filters.property_id);
    }
    if (filters.is_closed !== undefined) {
      threadsUrl.searchParams.append("filter[is_closed]", String(filters.is_closed));
    }
    // Filter by last_message_received_at if since provided (faster incremental sync)
    if (filters.since) {
      threadsUrl.searchParams.append("filter[last_message_received_at_gte]", filters.since);
    }
    threadsUrl.searchParams.append("pagination[page]", String(filters.page || 1));
    threadsUrl.searchParams.append("pagination[limit]", String(filters.limit || 100));
    threadsUrl.searchParams.append("order[last_message_received_at]", "desc");

    console.log(`[SYNC][${runId}] Fetching threads from Channex:`, threadsUrl.toString());

    const threadsResponse = await fetch(threadsUrl.toString(), {
      method: "GET",
      headers: {
        "user-api-key": CHANNEX_USER_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!threadsResponse.ok) {
      const errorText = await threadsResponse.text();
      console.error(`[SYNC][${runId}] Channex API error (threads):`, threadsResponse.status, errorText);
      
      // Update sync state to FAILED
      await supabase.from("sync_state").upsert({
        key: "channex_messages",
        status: "FAILED",
        last_error: `API Error: ${threadsResponse.status} - ${errorText}`,
        last_sync_finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });

      // Log sync run
      await supabase.from("sync_runs").insert({
        provider: "channex",
        entity: "MESSAGES",
        run_type: runType,
        status: "FAILED",
        error_message: errorText,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        counts: { error: errorText },
      });

      return errorResponse("Failed to fetch threads from Channex: " + errorText);
    }

    const threadsData = await threadsResponse.json();
    const threads: ChannexThread[] = threadsData.data || [];

    console.log(`[SYNC][${runId}] Fetched ${threads.length} threads from Channex`);

    let conversationsUpserted = 0;
    let messagesUpserted = 0;
    let inboundCount = 0;
    let outboundCount = 0;
    const errors: string[] = [];

    // Step 2: Process each thread
    for (const thread of threads) {
      try {
        const threadId = thread.id;
        const propertyId = thread.relationships?.property?.data?.id || null;
        const bookingId = thread.relationships?.booking?.data?.id || null;

        // Upsert conversation/thread and get back the internal ID
        const { data: convData, error: convError } = await supabase
          .from("conversations")
          .upsert({
            external_conversation_id: threadId,
            property_id: propertyId || "unknown",
            channel_type: thread.attributes.ota_name || "OTA",
            channel_provider: "channex",
            unified_booking_id: bookingId,
            guest_name: thread.attributes.guest_name,
            guest_email: thread.attributes.guest_email,
            guest_phone: thread.attributes.guest_phone,
            status: thread.attributes.is_closed ? "CLOSED" : "OPEN",
            is_messaging_supported: thread.attributes.is_messaging_supported !== false,
            last_message_at: thread.attributes.last_message_received_at || thread.attributes.inserted_at,
            synced_at: new Date().toISOString(),
          }, {
            onConflict: "external_conversation_id",
            ignoreDuplicates: false,
          })
          .select("id")
          .single();

        if (convError) {
          console.error(`[SYNC][${runId}] Error upserting conversation:`, threadId, convError);
          errors.push(`Thread ${threadId}: ${convError.message}`);
          continue;
        }
        
        const internalConversationId = convData?.id;
        if (!internalConversationId) {
          errors.push(`Thread ${threadId}: Failed to get internal conversation ID`);
          continue;
        }
        conversationsUpserted++;

        // Step 3: Fetch messages for this thread
        const messagesUrl = new URL(`https://app.channex.io/api/v1/message_threads/${threadId}/messages`);
        messagesUrl.searchParams.append("pagination[limit]", "100");
        messagesUrl.searchParams.append("order[inserted_at]", "desc");

        const messagesResponse = await fetch(messagesUrl.toString(), {
          method: "GET",
          headers: {
            "user-api-key": CHANNEX_USER_API_KEY,
            "Content-Type": "application/json",
          },
        });

        if (!messagesResponse.ok) {
          const errorText = await messagesResponse.text();
          console.error(`[SYNC][${runId}] Error fetching messages for thread ${threadId}:`, messagesResponse.status, errorText);
          errors.push(`Thread ${threadId} messages: ${errorText}`);
          continue;
        }

        const messagesData = await messagesResponse.json();
        const messages: ChannexMessage[] = messagesData.data || [];

        let threadInbound = 0;
        let threadOutbound = 0;
        let lastInboundAt: string | null = null;
        let lastOutboundAt: string | null = null;

        // Process and upsert messages
        for (const message of messages) {
          const attrs = message.attributes as Record<string, unknown>;
          
          // Extract message content from multiple possible fields
          const messageContent = 
            attrs.message || 
            attrs.text || 
            attrs.content || 
            attrs.body || 
            "";
          
          // Map sender field - Channex uses "sender" with values like "property", "guest", "ota"
          // Normalize to lowercase for consistent comparison
          const rawSender = (attrs.sender as string) || (attrs.sender_type as string) || "unknown";
          const senderLower = rawSender.toLowerCase().trim();
          const isFromGuest = senderLower === "guest" || senderLower === "traveler" || 
                              senderLower === "customer" || senderLower === "traveller";
          const senderType = isFromGuest ? "GUEST" : 
                             senderLower === "property" || senderLower === "host" ? "AGENT" : 
                             senderLower === "ota" || senderLower === "system" ? "SYSTEM" : "AGENT";
          
          // Determine direction based on sender
          const direction = isFromGuest ? "INBOUND" : "OUTBOUND";
          const sentAt = attrs.inserted_at as string;

          // Track inbound/outbound counts and timestamps
          if (direction === "INBOUND") {
            threadInbound++;
            if (!lastInboundAt || sentAt > lastInboundAt) {
              lastInboundAt = sentAt;
            }
          } else {
            threadOutbound++;
            if (!lastOutboundAt || sentAt > lastOutboundAt) {
              lastOutboundAt = sentAt;
            }
          }

          // Check if message already exists (to avoid duplicate push notifications)
          const { data: existingMsg } = await supabase
            .from("messages")
            .select("id")
            .eq("external_message_id", message.id)
            .maybeSingle();
          
          const isNewMessage = !existingMsg;

          const { error: msgError } = await supabase
            .from("messages")
            .upsert({
              external_message_id: message.id,
              conversation_id: internalConversationId,
              direction: direction,
              sender_type: senderType,
              body: String(messageContent),
              attachments: (attrs.attachments as unknown[]) || [],
              sent_at: sentAt,
              synced_at: new Date().toISOString(),
            }, {
              onConflict: "external_message_id",
              ignoreDuplicates: false,
            });

          if (msgError) {
            console.error(`[SYNC][${runId}] Error upserting message:`, message.id, msgError);
            errors.push(`Message ${message.id}: ${msgError.message}`);
          } else {
            messagesUpserted++;
            
            // Send push notification for NEW INBOUND messages only
            if (isNewMessage && direction === "INBOUND") {
              console.log(`[SYNC][${runId}] New INBOUND message detected, sending push notification`);
              try {
                const guestName = thread.attributes.guest_name || "Khách";
                const otaName = thread.attributes.ota_name || "OTA";
                const messagePreview = String(messageContent).substring(0, 100);
                
                const notificationInput: NotificationInput = {
                  eventType: "MESSAGE_INBOUND",
                  guestName: guestName,
                  otaSource: otaName,
                  messageBody: messagePreview,
                };
                const rendered = renderNotification(notificationInput);
                
                // Call send-push function
                const pushResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  },
                  body: JSON.stringify({
                    event_type: "MESSAGE_INBOUND",
                    idempotency_key: `sync_msg:${message.id}`,
                    broadcast_all: true,
                    payload: {
                      title: rendered.title,
                      body: rendered.body,
                      icon: "/icons/icon-192x192.png",
                      badge: "/icons/icon-192x192.png",
                      tag: `roomrise-msg-${internalConversationId}`,
                      deep_link: `/ota-messages?conversation=${internalConversationId}`,
                      data: {
                        conversation_id: internalConversationId,
                        message_id: message.id,
                        guest_name: guestName,
                        ota_source: otaName,
                      },
                    },
                    source_table: "messages",
                    source_record_id: message.id,
                  }),
                });
                
                if (pushResponse.ok) {
                  const pushResult = await pushResponse.json();
                  console.log(`[SYNC][${runId}] Push sent for message ${message.id}:`, pushResult);
                } else {
                  console.error(`[SYNC][${runId}] Push failed for message ${message.id}:`, await pushResponse.text());
                }
              } catch (pushError) {
                console.error(`[SYNC][${runId}] Error sending push for message ${message.id}:`, pushError);
              }
            }
          }
        }

        inboundCount += threadInbound;
        outboundCount += threadOutbound;

        // Update conversation with last inbound/outbound timestamps
        if (lastInboundAt || lastOutboundAt) {
          await supabase
            .from("conversations")
            .update({
              last_inbound_at: lastInboundAt,
              last_outbound_at: lastOutboundAt,
            })
            .eq("id", internalConversationId);
        }

        // Log message event for observability
        await supabase.from("message_events").insert({
          request_id: runId,
          conversation_id: internalConversationId,
          event_type: "SYNC_COMPLETED",
          payload: {
            thread_id: threadId,
            messages_count: messages.length,
            inbound: threadInbound,
            outbound: threadOutbound,
          },
        });

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[SYNC][${runId}] Error processing thread:`, thread.id, err);
        errors.push(`Thread ${thread.id}: ${errorMessage}`);
      }
    }

    const finishedAt = new Date().toISOString();
    const status = errors.length > 0 ? "PARTIAL" : "SUCCESS";

    // Create sync run record with detailed counts
    await supabase.from("sync_runs").insert({
      provider: "channex",
      entity: "MESSAGES",
      run_type: runType,
      status: status,
      started_at: startedAt,
      finished_at: finishedAt,
      since: filters.since || null,
      counts: {
        conversations: conversationsUpserted,
        messages: messagesUpserted,
        inbound: inboundCount,
        outbound: outboundCount,
        errors: errors.length,
      },
      error_message: errors.length > 0 ? errors.slice(0, 10).join("; ") : null,
    });

    // Update sync state to SUCCESS
    await supabase.from("sync_state").upsert({
      key: "channex_messages",
      status: status,
      last_sync_finished_at: finishedAt,
      last_successful_sync_at: status === "SUCCESS" ? finishedAt : undefined,
      value_json: { 
        run_id: runId,
        conversations: conversationsUpserted,
        messages: messagesUpserted,
      },
      updated_at: finishedAt,
    }, { onConflict: "key" });

    console.log(`[SYNC][${runId}] Complete: ${conversationsUpserted} threads, ${messagesUpserted} messages (${inboundCount} in, ${outboundCount} out)`);

    return jsonResponse({
      success: true,
      run_id: runId,
      threads_synced: conversationsUpserted,
      messages_synced: messagesUpserted,
      inbound_count: inboundCount,
      outbound_count: outboundCount,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SYNC][${runId}] Unexpected error:`, error);
    return errorResponse(errorMessage);
  }
});
