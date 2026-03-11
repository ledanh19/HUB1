/**
 * email-threads – List threads (GET ?mode=list) or get detail (GET ?mode=detail&id=xxx)
 * Auth: JWT required, RBAC: admin/super_admin/cskh/sale
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  authenticate, requireEmailView, getServiceClient,
  getAccountAccessToken, gmailGetMessage, extractBody,
  sanitizeHtml, escapePostgrestValue, audit,
} from "../_shared/email-helpers.ts";

/** Extract attachment metadata from Gmail message payload */
function extractAttachments(payload: Record<string, unknown>): Array<{
  attachmentId: string; filename: string; mimeType: string; size: number;
}> {
  const result: Array<{ attachmentId: string; filename: string; mimeType: string; size: number }> = [];
  function walk(part: Record<string, unknown>) {
    const body = part.body as Record<string, unknown> | undefined;
    const filename = part.filename as string | undefined;
    if (filename && body?.attachmentId) {
      result.push({
        attachmentId: body.attachmentId as string,
        filename,
        mimeType: (part.mimeType as string) ?? "application/octet-stream",
        size: (body.size as number) ?? 0,
      });
    }
    const parts = part.parts as Record<string, unknown>[] | undefined;
    if (parts) parts.forEach(walk);
  }
  walk(payload);
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrelight();

  try {
    const auth = await authenticate(req);
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!requireEmailView(auth)) return errorResponse("Insufficient permissions", 403);

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "list";

    if (mode === "detail") {
      return await handleDetail(url, auth);
    }
    return await handleList(url);
  } catch (err) {
    console.error("[EMAIL_THREADS_ERROR]", err);
    return errorResponse("Internal error", 500);
  }
});

async function handleList(url: URL) {
  const svc = getServiceClient();
  const accountId = url.searchParams.get("account_id");
  const label = url.searchParams.get("label");
  const search = url.searchParams.get("search");
  const page = Number(url.searchParams.get("page") ?? "1");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = (page - 1) * limit;

  let query = svc
    .from("email_threads")
    .select("*, email_accounts(email_address, provider)", { count: "exact" })
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (accountId && accountId !== "all") {
    query = query.eq("email_account_id", accountId);
  }
  if (label) {
    query = query.filter("labels", "cs", `["${label}"]`);
  }
  if (search) {
    const safe = escapePostgrestValue(search);
    query = query.or(`subject.ilike.%${safe}%,snippet.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[EMAIL_THREADS_LIST_ERROR]", error.message, error.details, error.hint);
    return errorResponse("Failed to fetch threads", 500);
  }
  return jsonResponse({ threads: data, total: count ?? 0 });
}

async function handleDetail(url: URL, auth: { userId: string }) {
  const id = url.searchParams.get("id");
  if (!id) return errorResponse("Missing thread id", 400);

  const svc = getServiceClient();

  const { data: thread, error: tErr } = await svc
    .from("email_threads")
    .select("*, email_accounts(email_address, provider)")
    .eq("id", id)
    .single();

  if (tErr || !thread) return errorResponse("Thread not found", 404);

  // Fetch workflow (1:1)
  const { data: workflow } = await svc
    .from("email_thread_workflow")
    .select("*")
    .eq("thread_id", id)
    .maybeSingle();

  // Fetch notes
  const { data: notes } = await svc
    .from("email_thread_notes")
    .select("*")
    .eq("thread_id", id)
    .order("created_at", { ascending: false });

  const { data: messages, error: mErr } = await svc
    .from("email_messages")
    .select("*")
    .eq("thread_id", id)
    .order("sent_at", { ascending: true });

  if (mErr) return errorResponse("Failed to fetch messages", 500);

  // Lazy-load body for messages without content, or re-fetch attachments for messages missing attachment data
  const toFetch = (messages ?? []).filter(
    (m: Record<string, unknown>) =>
      (m.body_text === null && m.body_html === null) ||
      (m.has_attachments === true && (!m.attachments_json || (m.attachments_json as unknown[]).length === 0))
  );

  if (toFetch.length > 0) {
    try {
      const { accessToken } = await getAccountAccessToken(thread.email_account_id as string);

      for (const msg of toFetch) {
        try {
          const fullMsg = await gmailGetMessage(accessToken, msg.provider_message_id as string, "full");
          const body = extractBody(fullMsg.payload as Record<string, unknown>);
          const sanitizedHtml = body.html ? sanitizeHtml(body.html) : null;
          const attachments = extractAttachments(fullMsg.payload as Record<string, unknown>);

          await svc.from("email_messages").update({
            body_text: body.plain || null,
            body_html: sanitizedHtml,
            attachments_json: attachments,
            has_attachments: attachments.length > 0,
          }).eq("id", msg.id);

          msg.body_text = body.plain || null;
          msg.body_html = sanitizedHtml;
          msg.attachments_json = attachments;
          msg.has_attachments = attachments.length > 0;
        } catch (fetchErr) {
          console.error(`[BODY_FETCH_ERROR] message=${msg.id}`, fetchErr);
        }
      }

      await audit({
        action: "THREAD_BODY_FETCH",
        actorUserId: auth.userId,
        emailAccountId: thread.email_account_id as string,
        threadId: id,
        meta: { messages_fetched: toFetch.length },
      });
    } catch (err) {
      console.error("[THREAD_BODY_FETCH_GMAIL_ERROR]", err);
    }
  }

  return jsonResponse({ thread, messages, workflow: workflow ?? null, notes: notes ?? [] });
}
