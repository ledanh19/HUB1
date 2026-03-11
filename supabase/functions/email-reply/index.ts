/**
 * email-reply – Send reply/forward within a thread (POST)
 * Auth: JWT required, RBAC: admin/super_admin/cskh
 * Body: { threadId, body, bodyHtml?, to, cc?, bcc?, reply_all?, isForward?, attachments? }
 * 
 * Attachments: Array<{ name, mimeType, base64 }>
 * Builds proper RFC2822 MIME (multipart/mixed when attachments present).
 * Supports HTML body via multipart/alternative.
 * Forward: uses "Fwd:" prefix, no In-Reply-To/References, RFC2047 Subject encoding.
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  authenticate, requireEmailReply, getServiceClient,
  getAccountAccessToken, gmailSendMessage, encodeUtf8ToBase64Url, audit,
} from "../_shared/email-helpers.ts";

/** Encode string to base64, wrapped at 76 chars per RFC2045 */
function encodeBodyBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  const b64 = btoa(binary);
  return b64.replace(/(.{76})/g, '$1\r\n');
}

/**
 * RFC 2047 encode a header value if it contains non-ASCII characters.
 * Uses Base64 encoding: =?UTF-8?B?<base64>?=
 * Splits into multiple encoded-words if needed (max 75 chars per encoded-word).
 */
function encodeRFC2047(value: string): string {
  // Check if value contains non-ASCII
  const hasNonAscii = /[^\x00-\x7F]/.test(value);
  if (!hasNonAscii) return value;

  // Encode entire value as UTF-8 Base64
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary);

  // Split into chunks of ~45 base64 chars to keep encoded-word under 75 chars
  // "=?UTF-8?B?" = 10 chars, "?=" = 2 chars, so payload max ~63 chars
  const maxPayload = 56; // conservative
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += maxPayload) {
    chunks.push(b64.substring(i, i + maxPayload));
  }

  return chunks.map(c => `=?UTF-8?B?${c}?=`).join('\r\n ');
}

/** Build a proper RFC2822 MIME message */
function buildMimeMessage(opts: {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  inReplyTo?: string;
  references?: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: Array<{ name: string; mimeType: string; base64: string }>;
}): string {
  const mixedBoundary = `----=_Mixed_${crypto.randomUUID().replace(/-/g, '')}`;
  const altBoundary = `----=_Alt_${crypto.randomUUID().replace(/-/g, '')}`;
  const hasAttachments = opts.attachments && opts.attachments.length > 0;
  const hasHtml = opts.bodyHtml && opts.bodyHtml.trim().length > 0;

  const wrappedTextBody = encodeBodyBase64(opts.bodyText);

  // RFC 2047 encode subject for non-ASCII (Vietnamese, etc.)
  const encodedSubject = encodeRFC2047(opts.subject);

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : '',
    opts.bcc ? `Bcc: ${opts.bcc}` : '',
    `Subject: ${encodedSubject}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
    opts.references ? `References: ${opts.references}` : '',
    'MIME-Version: 1.0',
  ].filter(Boolean);

  // Case 1: Plain text only, no attachments
  if (!hasAttachments && !hasHtml) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push('Content-Transfer-Encoding: base64');
    return headers.join('\r\n') + '\r\n\r\n' + wrappedTextBody;
  }

  // Case 2: HTML body (no attachments) → multipart/alternative
  if (!hasAttachments && hasHtml) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    const wrappedHtmlBody = encodeBodyBase64(opts.bodyHtml!);
    const parts = [
      `--${altBoundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrappedTextBody}`,
      `--${altBoundary}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrappedHtmlBody}`,
      `--${altBoundary}--`,
    ];
    return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
  }

  // Case 3: With attachments → multipart/mixed
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

  const parts: string[] = [];

  // Text/HTML body part
  if (hasHtml) {
    // Nested multipart/alternative inside mixed
    const wrappedHtmlBody = encodeBodyBase64(opts.bodyHtml!);
    parts.push(
      `--${mixedBoundary}\r\n` +
      `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n` +
      `--${altBoundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrappedTextBody}\r\n` +
      `--${altBoundary}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrappedHtmlBody}\r\n` +
      `--${altBoundary}--`
    );
  } else {
    parts.push(
      `--${mixedBoundary}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n` +
      `Content-Transfer-Encoding: base64\r\n` +
      `\r\n` +
      wrappedTextBody
    );
  }

  // Attachment parts
  for (const att of opts.attachments!) {
    const wrappedAtt = att.base64.replace(/(.{76})/g, '$1\r\n');
    // RFC2047 encode filename for safe ASCII headers
    const safeFilename = att.name.replace(/[^\x20-\x7E]/g, '_');
    parts.push(
      `--${mixedBoundary}\r\n` +
      `Content-Type: ${att.mimeType}; name="${safeFilename}"\r\n` +
      `Content-Disposition: attachment; filename="${safeFilename}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n` +
      `\r\n` +
      wrappedAtt
    );
  }

  // Closing boundary
  parts.push(`--${mixedBoundary}--`);

  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrelight();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const auth = await authenticate(req);
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!requireEmailReply(auth)) return errorResponse("Insufficient permissions", 403);

    const { threadId, body: replyBody, bodyHtml, to, cc, bcc, attachments, isForward, client_request_id } = await req.json();
    if (!threadId || !replyBody || !to) {
      return errorResponse("Missing required fields: threadId, body, to", 400);
    }
    if (replyBody.length > 100000) return errorResponse("Body too long", 400);

    const svc = getServiceClient();

    // Fetch thread — try by id first, then by provider_thread_id as fallback
    let thread: Record<string, unknown> | null = null;
    let tErr: unknown = null;

    // Strategy 1: Direct ID match
    const { data: t1, error: e1 } = await svc
      .from("email_threads")
      .select("*")
      .eq("id", threadId)
      .maybeSingle();

    if (t1) {
      thread = t1;
    } else {
      // Strategy 2: Try provider_thread_id (for V1→V2 migration compat)
      const { data: t2, error: e2 } = await svc
        .from("email_threads")
        .select("*")
        .eq("provider_thread_id", threadId)
        .maybeSingle();

      if (t2) {
        thread = t2;
      } else {
        tErr = e1 || e2;
        console.error("[email-reply] Thread not found. threadId:", threadId, "e1:", e1, "e2:", e2);
      }
    }

    if (tErr || !thread) return errorResponse("Thread not found", 404);

    // Verify account + mailbox enforcement
    const { data: account, error: aErr } = await svc
      .from("email_accounts")
      .select("id, tenant_id, status, scope_level, email_address")
      .eq("id", thread.email_account_id)
      .single();
    if (aErr || !account) return errorResponse("Email account not found", 404);
    if (account.status !== "ACTIVE") return errorResponse("Email account is not active", 400);
    if (account.scope_level === "READ_ONLY") {
      return errorResponse("Account has READ_ONLY scope. Reconnect with REPLY scope.", 403);
    }

    // Use account's tenant_id (not auth.userId!)
    const tenantId = account.tenant_id as string;

    // ── IDEMPOTENCY GUARD ──
    // Must run BEFORE Gmail API call to prevent double-send
    if (client_request_id) {
      const { data: existing } = await svc
        .from("email_messages")
        .select("id, status")
        .eq("tenant_id", tenantId)
        .eq("email_account_id", thread.email_account_id as string)
        .eq("client_request_id", client_request_id)
        .maybeSingle();

      if (existing) {
        console.log(`[EMAIL_SEND] Idempotency hit: client_request_id=${client_request_id}, existing_id=${existing.id}`);
        return jsonResponse({ success: true, message: existing, already_processed: true });
      }

      // Insert PENDING intent row (claim the idempotency key)
      const { error: intentErr } = await svc.from("email_messages").insert({
        tenant_id: tenantId,
        email_account_id: thread.email_account_id,
        thread_id: threadId, // This is V1 mirror thread_id — V2 thread lookup handled below
        provider_message_id: `pending-${client_request_id}`,
        direction: "OUTBOUND",
        status: "PENDING",
        sender: account.email_address,
        recipients: to.split(",").map((e: string) => ({ name: "", email: e.trim() })),
        body_text: replyBody,
        body_html: bodyHtml || null,
        client_request_id,
      }).select().single();

      if (intentErr) {
        // Unique constraint violation = already processing
        if (intentErr.code === "23505") {
          console.log(`[EMAIL_SEND] Idempotency conflict: ${client_request_id}`);
          return jsonResponse({ success: true, already_processed: true });
        }
        console.warn("[EMAIL_SEND] Intent insert error:", intentErr);
        // Continue without V2 idempotency — still send via V1 path
      }
    }

    // Get last message for threading headers
    const { data: lastMessage } = await svc
      .from("email_messages")
      .select("headers, subject, provider_message_id")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    let subject: string;
    let inReplyTo: string | undefined;
    let references: string | undefined;

    if (isForward) {
      const origSubject = lastMessage?.subject ?? thread.subject ?? "";
      subject = origSubject.startsWith("Fwd:") ? origSubject : `Fwd: ${origSubject}`;
      inReplyTo = undefined;
      references = undefined;
    } else {
      const messageId = (lastMessage?.headers as Record<string, string>)?.["Message-ID"] ?? "";
      const existingRefs = (lastMessage?.headers as Record<string, string>)?.["References"] ?? "";
      references = existingRefs ? `${existingRefs} ${messageId}` : messageId;
      inReplyTo = messageId;
      subject = lastMessage?.subject?.startsWith("Re:")
        ? lastMessage.subject
        : `Re: ${lastMessage?.subject ?? thread.subject ?? ""}`;
    }

    console.log(`[EMAIL_SEND] mode=${isForward ? 'FORWARD' : 'REPLY'}, subject="${subject}", to=${to}, hasHtml=${!!bodyHtml}, attachments=${attachments?.length ?? 0}`);

    // Get access token + send via Gmail API
    const { accessToken } = await getAccountAccessToken(thread.email_account_id as string);

    const rawMessage = buildMimeMessage({
      from: account.email_address as string,
      to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject,
      inReplyTo,
      references,
      bodyText: replyBody,
      bodyHtml: bodyHtml || undefined,
      attachments: attachments as Array<{ name: string; mimeType: string; base64: string }> | undefined,
    });

    const encoded = encodeUtf8ToBase64Url(rawMessage);
    const gmailThreadId = isForward ? undefined : (thread.provider_thread_id as string);
    const sent = await gmailSendMessage(accessToken, encoded, gmailThreadId as string);

    const providerMessageId = (sent.id as string) ?? `local-${Date.now()}`;
    const nowIso = new Date().toISOString();

    // ── Write message to email_messages (SINGLE SOT) ──
    const { data: savedMsg } = await svc.from("email_messages").upsert({
      tenant_id: tenantId,
      email_account_id: thread.email_account_id,
      thread_id: threadId,
      provider_message_id: providerMessageId,
      direction: "OUTBOUND",
      status: "SENT",
      from_json: [{ name: "", email: account.email_address }],
      to_json: to.split(",").map((e: string) => ({ name: "", email: e.trim() })),
      cc_json: cc ? cc.split(",").map((e: string) => ({ name: "", email: e.trim() })) : [],
      sent_at: nowIso,
      subject,
      headers: {
        "Message-ID": sent.id,
        ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
        ...(references ? { References: references } : {}),
      },
      body_text: replyBody,
      body_html: bodyHtml || null,
      has_attachments: !!(attachments && attachments.length > 0),
      sender: account.email_address,
      recipients: to.split(",").map((e: string) => ({ name: "", email: e.trim() })),
      ...(client_request_id ? { client_request_id } : {}),
    }, { onConflict: "email_account_id,provider_message_id" })
      .select().single();

    // Update thread timestamp
    await svc.from("email_threads").update({
      last_message_at: nowIso,
    }).eq("id", threadId);

    // ── AUDIT ──
    await audit({
      action: isForward ? "REPLY_SEND" : "REPLY_SEND",
      actorUserId: auth.userId,
      emailAccountId: thread.email_account_id as string,
      threadId,
      messageId: savedMsg?.id,
      meta: {
        to, cc: cc ?? null, bcc: bcc ?? null, subject,
        provider_message_id: sent.id,
        has_attachments: !!(attachments?.length),
        is_forward: !!isForward,
        client_request_id: client_request_id ?? null,
      },
    });

    return jsonResponse({ success: true, message: savedMsg });
  } catch (err: unknown) {
    console.error("[REPLY_ERROR]", err);

    // If we have a PENDING intent in V2, mark it as FAILED
    // (Best-effort — don't let this error mask the original error)
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.client_request_id) {
        const svc = getServiceClient();
        await svc.from("email_messages")
          .update({
            status: "FAILED",
            error_message: err instanceof Error ? err.message : "Unknown error",
          })
          .eq("client_request_id", body.client_request_id)
          .eq("status", "PENDING");
      }
    } catch { /* ignore cleanup errors */ }

    const msg = err instanceof Error ? err.message : "Failed to send reply";
    return errorResponse(msg, 500);
  }
});
