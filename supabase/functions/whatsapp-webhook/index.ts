import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderNotification,
  type NotificationInput,
} from "../_shared/renderNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

// ============================================================================
// HMAC-SHA256 VERIFICATION (Meta X-Hub-Signature-256)
// ============================================================================
async function verifySignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;

  try {
    // Meta sends "sha256=<hex>"
    const expected = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(body),
    );
    const computedHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Timing-safe comparison
    if (expected.length !== computedHex.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ computedHex.charCodeAt(i);
    }
    return diff === 0;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

// ============================================================================
// PHONE NORMALIZATION — strip '+' and whitespace to prevent duplicate threads
// Meta usually sends bare international format (e.g. "84901234567"),
// but manual entries or some flows may include '+'. Normalize to digits only.
// ============================================================================
function normalizePhone(phone: string): string {
  // Remove everything except digits
  return phone.replace(/[^\d]/g, "");
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================================================
  // GET — Meta Webhook Verification Challenge
  // ========================================================================
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    console.log(`[WA-WEBHOOK][${requestId}] Verify request:`, {
      mode,
      token: token ? `${token.substring(0, 4)}...` : null,
    });

    if (mode !== "subscribe" || !token || !challenge) {
      return new Response("Missing parameters", { status: 400 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response("Server misconfiguration", { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up verify_token in whatsapp_integrations
    const { data: integration } = await supabase
      .from("whatsapp_integrations")
      .select("id, phone_number_id")
      .eq("verify_token", token)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!integration) {
      console.error(
        `[WA-WEBHOOK][${requestId}] No active integration found for verify_token`,
      );
      return new Response("Forbidden", { status: 403 });
    }

    console.log(
      `[WA-WEBHOOK][${requestId}] Verification succeeded for phone_number_id:`,
      integration.phone_number_id,
    );

    // Return challenge as plain text (Meta requirement)
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // ========================================================================
  // POST — Receive WhatsApp Webhook Events
  // ========================================================================
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  console.log(`[WA-WEBHOOK][${requestId}] Received webhook POST`);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[WA-WEBHOOK][${requestId}] Missing SUPABASE env vars`);
    return new Response("Server error", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Read raw body ONCE
  const bodyText = await req.text();

  // ======================================================================
  // Step 1: Log raw payload FIRST (before any processing)
  // ======================================================================
  let rawLogId: string | null = null;
  try {
    const parsedForLog = JSON.parse(bodyText);
    const { data: logRow } = await supabase
      .from("webhook_events_log")
      .insert({
        channel: "whatsapp",
        payload_json: parsedForLog,
        signature_valid: false, // updated after verification
        processing_status: "received",
      })
      .select("id")
      .single();
    rawLogId = logRow?.id ?? null;
  } catch {
    // Don't fail on log insert — continue processing
    console.warn(`[WA-WEBHOOK][${requestId}] Failed to log raw payload`);
  }

  // ======================================================================
  // Step 2: Verify X-Hub-Signature-256
  // ======================================================================

  // Resolve app_secret: SaaS model uses a single Meta App, so one APP_SECRET
  // is correct for all tenants. Per-tenant app_secret_ref is for BYOA (Bring
  // Your Own App) — deferred to Stage 2. For now the platform APP_SECRET
  // is shared across tenants (each tenant has their own access_token, NOT
  // their own app_secret).
  const WHATSAPP_APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET");

  if (!WHATSAPP_APP_SECRET) {
    console.error(
      `[WA-WEBHOOK][${requestId}] CRITICAL: WHATSAPP_APP_SECRET not configured`,
    );
    if (rawLogId) {
      await supabase
        .from("webhook_events_log")
        .update({
          processing_status: "failed",
          error_message: "APP_SECRET not configured",
        })
        .eq("id", rawLogId);
    }
    return new Response(
      JSON.stringify({ error: "Webhook not configured" }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const hubSignature = req.headers.get("x-hub-signature-256");
  const signatureValid = await verifySignature(
    bodyText,
    hubSignature,
    WHATSAPP_APP_SECRET,
  );

  // Update log with signature result
  if (rawLogId) {
    await supabase
      .from("webhook_events_log")
      .update({ signature_valid: signatureValid })
      .eq("id", rawLogId);
  }

  if (!signatureValid) {
    console.error(
      `[WA-WEBHOOK][${requestId}] Invalid X-Hub-Signature-256 — rejecting`,
    );
    if (rawLogId) {
      await supabase
        .from("webhook_events_log")
        .update({
          processing_status: "failed",
          error_message: "Invalid signature",
        })
        .eq("id", rawLogId);
    }
    return new Response(
      JSON.stringify({ error: "Invalid signature", request_id: requestId }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  console.log(`[WA-WEBHOOK][${requestId}] Signature verified successfully`);

  // ======================================================================
  // Step 2b: Basic rate limiting (per source IP, DB-backed)
  // ======================================================================
  try {
    const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";
    const rateLimitKey = `wa_webhook:${sourceIp}`;
    const { data: rlOk, error: rlErr } = await supabase.rpc("check_rate_limit", {
      p_bucket_key: rateLimitKey,
      p_window_seconds: 10,
      p_max_requests: 60, // 60 events per 10s per IP — generous for Meta bursts
    });
    if (!rlErr && rlOk === false) {
      console.warn(`[WA-WEBHOOK][${requestId}] Rate limited IP: ${sourceIp}`);
      if (rawLogId) {
        await supabase.from("webhook_events_log").update({
          processing_status: "failed",
          error_message: "Rate limited",
        }).eq("id", rawLogId);
      }
      return new Response(
        JSON.stringify({ error: "Too many requests" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch {
    // Rate limit check failure should not block webhook processing
    console.warn(`[WA-WEBHOOK][${requestId}] Rate limit check skipped`);
  }

  // ======================================================================
  // Step 3: Parse payload
  // ======================================================================
  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    console.error(`[WA-WEBHOOK][${requestId}] Invalid JSON`);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Meta webhook structure:
  // { object: "whatsapp_business_account", entry: [{ id, changes: [{ value, field }] }] }
  if (payload.object !== "whatsapp_business_account") {
    console.log(
      `[WA-WEBHOOK][${requestId}] Ignoring non-WhatsApp object:`,
      payload.object,
    );
    return new Response(JSON.stringify({ status: "ignored" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const entries = payload.entry || [];
  let processedMessages = 0;
  let processedStatuses = 0;

  for (const entry of entries) {
    const changes = entry.changes || [];

    for (const change of changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      if (!value) continue;

      const phoneNumberId =
        value.metadata?.phone_number_id ?? null;
      const displayPhone =
        value.metadata?.display_phone_number ?? null;

      // ================================================================
      // Resolve tenant from phone_number_id
      // ================================================================
      let tenantId: string | null = null;
      if (phoneNumberId) {
        const { data: integration } = await supabase
          .from("whatsapp_integrations")
          .select("id, tenant_id")
          .eq("phone_number_id", phoneNumberId)
          .eq("status", "active")
          .single();

        tenantId = integration?.tenant_id ?? null;

        if (!tenantId) {
          console.warn(
            `[WA-WEBHOOK][${requestId}] No tenant for phone_number_id=${phoneNumberId}`,
          );
        }
      }

      // Update log with phone info
      if (rawLogId) {
        await supabase
          .from("webhook_events_log")
          .update({
            phone_number_id: phoneNumberId,
            tenant_id: tenantId,
          })
          .eq("id", rawLogId);
      }

      // ==============================================================
      // Process INBOUND MESSAGES
      // ==============================================================
      const messages = value.messages || [];
      for (const msg of messages) {
        try {
          const wamid: string = msg.id; // WhatsApp message ID
          const from: string = normalizePhone(msg.from); // Customer phone (e.g. "84901234567")
          const timestamp: string = msg.timestamp; // Unix epoch seconds
          const msgType: string = msg.type; // text, image, document, etc.

          // Extract body based on type
          let body = "";
          let attachments: unknown[] = [];
          switch (msgType) {
            case "text":
              body = msg.text?.body || "";
              break;
            case "image":
              body = msg.image?.caption || "[Hình ảnh]";
              attachments = [
                {
                  type: "image",
                  mime_type: msg.image?.mime_type,
                  sha256: msg.image?.sha256,
                  id: msg.image?.id,
                },
              ];
              break;
            case "document":
              body = msg.document?.caption || `[Tài liệu: ${msg.document?.filename || "file"}]`;
              attachments = [
                {
                  type: "document",
                  mime_type: msg.document?.mime_type,
                  filename: msg.document?.filename,
                  sha256: msg.document?.sha256,
                  id: msg.document?.id,
                },
              ];
              break;
            case "audio":
              body = "[Tin nhắn thoại]";
              attachments = [
                { type: "audio", mime_type: msg.audio?.mime_type, id: msg.audio?.id },
              ];
              break;
            case "video":
              body = msg.video?.caption || "[Video]";
              attachments = [
                {
                  type: "video",
                  mime_type: msg.video?.mime_type,
                  id: msg.video?.id,
                },
              ];
              break;
            case "location":
              body = `[Vị trí: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
              break;
            case "contacts":
              body = "[Danh bạ]";
              break;
            case "sticker":
              body = "[Sticker]";
              attachments = [
                { type: "sticker", id: msg.sticker?.id },
              ];
              break;
            case "reaction":
              body = `[Reaction: ${msg.reaction?.emoji || ""}]`;
              break;
            default:
              body = `[${msgType}]`;
          }

          const sentAt = timestamp
            ? new Date(parseInt(timestamp) * 1000).toISOString()
            : new Date().toISOString();

          // Build deterministic external_conversation_id
          // Format: wa:{phone_number_id}:{from}
          const externalConversationId = `wa:${phoneNumberId}:${from}`;

          console.log(`[WA-WEBHOOK][${requestId}] Processing message:`, {
            wamid,
            from,
            type: msgType,
            externalConversationId,
          });

          // =============================================================
          // Find or create conversation
          // =============================================================
          let internalConversationId: string | null = null;

          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id, unread_count")
            .eq("external_conversation_id", externalConversationId)
            .single();

          if (existingConv) {
            internalConversationId = existingConv.id;

            // Update timestamps — reuse same RPC as Channex webhook
            const { error: updateError } = await supabase.rpc(
              "update_conversation_timestamps_safe",
              {
                p_conversation_id: internalConversationId,
                p_last_message_at: sentAt,
                p_last_inbound_at: sentAt,
                p_last_outbound_at: null,
                p_increment_unread: true,
              },
            );

            if (updateError) {
              console.warn(
                `[WA-WEBHOOK][${requestId}] RPC fallback for conversation update:`,
                updateError,
              );
              // Fallback
              await supabase
                .from("conversations")
                .update({
                  last_message_at: sentAt,
                  last_inbound_at: sentAt,
                  unread_count: (existingConv.unread_count || 0) + 1,
                  synced_at: new Date().toISOString(),
                })
                .eq("id", internalConversationId);
            }
          } else {
            // Create new conversation
            const contactName =
              value.contacts?.[0]?.profile?.name || from;

            const { data: newConv, error: convError } = await supabase
              .from("conversations")
              .insert({
                external_conversation_id: externalConversationId,
                property_id: phoneNumberId || "unknown", // Use phoneNumberId as property grouping
                channel_type: "WHATSAPP",
                channel_provider: "meta",
                guest_name: contactName,
                guest_phone: from,
                wa_customer_phone: from,
                wa_phone_number_id: phoneNumberId,
                last_message_at: sentAt,
                last_inbound_at: sentAt,
                unread_count: 1,
                status: "OPEN",
                is_messaging_supported: true,
                metadata: {
                  wa_customer_id: from,
                  phone_number_id: phoneNumberId,
                  display_phone: displayPhone,
                },
                synced_at: new Date().toISOString(),
              })
              .select("id")
              .single();

            if (convError) {
              console.error(
                `[WA-WEBHOOK][${requestId}] Error creating conversation:`,
                convError,
              );
              // Race condition — try to fetch again
              const { data: retryConv } = await supabase
                .from("conversations")
                .select("id")
                .eq("external_conversation_id", externalConversationId)
                .single();
              internalConversationId = retryConv?.id ?? null;
            } else {
              internalConversationId = newConv?.id ?? null;
            }
          }

          if (!internalConversationId) {
            console.error(
              `[WA-WEBHOOK][${requestId}] Failed to get/create conversation for ${externalConversationId}`,
            );
            continue; // Process next message
          }

          // =============================================================
          // Upsert message — idempotent on wamid
          // =============================================================
          const { error: msgError } = await supabase.from("messages").upsert(
            {
              external_message_id: wamid,
              conversation_id: internalConversationId,
              direction: "INBOUND",
              sender_type: "GUEST",
              body,
              attachments,
              sent_at: sentAt,
              synced_at: new Date().toISOString(),
              // WhatsApp-specific columns
              channel_type: "WHATSAPP",
              wamid,
              wa_phone_number_id: phoneNumberId,
            },
            {
              onConflict: "external_message_id",
              ignoreDuplicates: true, // Idempotent: skip if already exists
            },
          );

          if (msgError) {
            console.error(
              `[WA-WEBHOOK][${requestId}] Error upserting message:`,
              msgError,
            );
            continue;
          }

          processedMessages++;

          // =============================================================
          // Push notification (same pattern as channex-messages-webhook)
          // =============================================================
          try {
            const timeBucket = Math.floor(Date.now() / 60000);
            const idempotencyKey = `whatsapp:${wamid}:MESSAGE_INBOUND:${timeBucket}`;

            const contactName =
              value.contacts?.[0]?.profile?.name || from;

            const messagePreview = body
              ? body.length > 100
                ? body.substring(0, 97) + "..."
                : body
              : "Tin nhắn mới từ WhatsApp";

            const notificationInput: NotificationInput = {
              eventType: "MESSAGE_INBOUND",
              guestName: contactName,
              otaSource: "WhatsApp",
              messageBody: body || undefined,
              messagePreview,
              conversationId: internalConversationId,
              changeId: wamid,
            };

            const rendered = renderNotification(notificationInput);

            console.log(`[WA-WEBHOOK][${requestId}] Triggering push:`, {
              title: rendered.title,
              body: rendered.body.substring(0, 50),
              idempotencyKey,
            });

            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const supabaseServiceKey = Deno.env.get(
              "SUPABASE_SERVICE_ROLE_KEY",
            )!;

            const pushResponse = await fetch(
              `${supabaseUrl}/functions/v1/send-push`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  event_type: "MESSAGE_INBOUND",
                  idempotency_key: idempotencyKey,
                  broadcast_all: true,
                  payload: {
                    title: rendered.title,
                    body: rendered.body,
                    icon: rendered.icon,
                    tag: rendered.tag,
                    requireInteraction: rendered.requireInteraction,
                    vibrate: rendered.vibratePattern,
                    silent: rendered.silent,
                    entity_id: internalConversationId,
                    data: {
                      event_type: "MESSAGE_INBOUND",
                      deep_link: rendered.deepLink,
                      conversation_id: internalConversationId,
                      guest_name: contactName,
                      message_preview: messagePreview,
                      channel_type: "WHATSAPP",
                      _pre_rendered: true,
                    },
                  },
                  source_table: "messages",
                  source_record_id: wamid,
                }),
              },
            );

            if (!pushResponse.ok) {
              const errorText = await pushResponse.text();
              console.error(
                `[WA-WEBHOOK][${requestId}] send-push failed:`,
                pushResponse.status,
                errorText,
              );
            }
          } catch (pushErr) {
            // Don't fail webhook for push errors
            console.error(
              `[WA-WEBHOOK][${requestId}] Push exception:`,
              pushErr,
            );
          }

          // Log message event for observability
          await supabase.from("message_events").insert({
            request_id: requestId,
            conversation_id: internalConversationId,
            event_type: "WEBHOOK_MESSAGE_RECEIVED",
            payload: {
              message_id: wamid,
              channel: "whatsapp",
              direction: "INBOUND",
              sender_type: "GUEST",
              from,
              msg_type: msgType,
            },
          });
        } catch (msgErr) {
          console.error(
            `[WA-WEBHOOK][${requestId}] Error processing message:`,
            msgErr,
          );
        }
      }

      // ==============================================================
      // Process STATUS UPDATES (sent/delivered/read/failed)
      // ==============================================================
      const statuses = value.statuses || [];
      for (const status of statuses) {
        try {
          const wamid: string = status.id;
          const recipientPhone: string = status.recipient_id;
          const statusValue: string = status.status; // sent, delivered, read, failed
          const timestamp: string = status.timestamp;
          const statusAt = timestamp
            ? new Date(parseInt(timestamp) * 1000).toISOString()
            : new Date().toISOString();

          console.log(`[WA-WEBHOOK][${requestId}] Status update:`, {
            wamid,
            status: statusValue,
            recipientPhone,
          });

          // Map Meta status → our status
          let ourStatus: string;
          switch (statusValue) {
            case "sent":
              ourStatus = "SENT";
              break;
            case "delivered":
              ourStatus = "DELIVERED";
              break;
            case "read":
              ourStatus = "READ";
              break;
            case "failed":
              ourStatus = "FAILED";
              break;
            default:
              ourStatus = statusValue.toUpperCase();
          }

          // Update outbound_messages by matching wamid in external_message_id
          const { data: outbound } = await supabase
            .from("outbound_messages")
            .select("id, conversation_id, status")
            .eq("external_message_id", wamid)
            .single();

          if (outbound) {
            // Only update status if it's a FORWARD progression (don't go backward)
            // sent → delivered → read → (done); failed is terminal
            const statusOrder: Record<string, number> = {
              QUEUED: 0,
              SENDING: 1,
              SENT: 2,
              DELIVERED: 3,
              READ: 4,
              FAILED: -1,
            };

            const currentRank = statusOrder[outbound.status] ?? -2;
            const newRank = statusOrder[ourStatus] ?? -2;

            // Allow update only if: moving forward, or incoming FAILED (always accept)
            const shouldUpdate =
              ourStatus === "FAILED" || newRank > currentRank;

            if (shouldUpdate) {
              await supabase
                .from("outbound_messages")
                .update({
                  status: ourStatus,
                  sent_at:
                    statusValue === "sent" ? statusAt : undefined,
                })
                .eq("id", outbound.id);

              // Also update the message's wa_status
              await supabase
                .from("messages")
                .update({ wa_status: ourStatus })
                .eq("wamid", wamid);
            } else {
              console.log(
                `[WA-WEBHOOK][${requestId}] Skipping backward status: ${outbound.status} → ${ourStatus}`,
              );
            }
          }

          // Log status event
          await supabase.from("message_events").insert({
            request_id: requestId,
            conversation_id: outbound?.conversation_id ?? null,
            event_type: "WEBHOOK_STATUS_UPDATE",
            payload: {
              wamid,
              status: statusValue,
              our_status: ourStatus,
              recipient: recipientPhone,
              channel: "whatsapp",
              errors: status.errors || null,
            },
          });

          processedStatuses++;
        } catch (statusErr) {
          console.error(
            `[WA-WEBHOOK][${requestId}] Error processing status:`,
            statusErr,
          );
        }
      }
    }
  }

  // Update webhook log
  if (rawLogId) {
    await supabase
      .from("webhook_events_log")
      .update({
        processing_status: "processed",
      })
      .eq("id", rawLogId);
  }

  // ======================================================================
  // Update last_webhook_received_at on ALL integrations that handled events
  // ======================================================================
  const touchedPhoneNumberIds = new Set<string>();
  for (const entry of entries) {
    for (const change of (entry.changes || [])) {
      const pnId = change.value?.metadata?.phone_number_id;
      if (pnId) touchedPhoneNumberIds.add(pnId);
    }
  }
  for (const pnId of touchedPhoneNumberIds) {
    try {
      await supabase
        .from("whatsapp_integrations")
        .update({
          last_webhook_received_at: new Date().toISOString(),
          last_error: null, // Clear error on successful processing
        })
        .eq("phone_number_id", pnId)
        .eq("status", "active");
    } catch {
      // Non-fatal — don't fail webhook for health-check update
    }
  }

  console.log(
    `[WA-WEBHOOK][${requestId}] Done: ${processedMessages} messages, ${processedStatuses} statuses`,
  );

  // CRITICAL: Return 200 immediately — Meta will retry on non-200
  return new Response(
    JSON.stringify({
      success: true,
      request_id: requestId,
      processed_messages: processedMessages,
      processed_statuses: processedStatuses,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
