/**
 * email-backfill-v2 – Bulk Gmail import into V2 tables
 * ═══════════════════════════════════════════════════════════
 * Idempotent, resumable, rate-limit safe.
 * 
 * POST { accountId, startDate?, maxPagesPerRun?, pageToken? }
 * 
 * Behavior:
 * 1) Reads/creates email_sync_state for the account
 * 2) Lists Gmail messages page-by-page (max_pages_per_run)
 * 3) For each message: fetch full → upsert thread + message + participants
 * 4) Saves cursor after each page for resume
 * 5) When no nextPageToken → marks backfill_done=true
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  authenticate, requireEmailManage, getServiceClient,
  getAccountAccessToken, parseEmailHeader, parseParticipants,
  decodeRFC2047, extractBody
} from "../_shared/email-helpers.ts";
import { classifyEmailTagV2 } from "../_shared/email-classifier.ts";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const DEFAULT_MAX_PAGES = 3;
const MESSAGES_PER_PAGE = 50; // Gmail max per page
const INTER_MESSAGE_DELAY_MS = 100; // Rate limit safety

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrelight();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    // Auth
    const auth = await authenticate(req);
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!requireEmailManage(auth)) return errorResponse("Insufficient permissions", 403);

    const body = await req.json().catch(() => ({}));
    const { accountId, startDate, maxPagesPerRun } = body;
    if (!accountId) return errorResponse("Missing accountId", 400);

    const svc = getServiceClient();
    const maxPages = maxPagesPerRun ?? DEFAULT_MAX_PAGES;

    // ── 1. Get account ────────────────────────────────────────
    const { accessToken, account } = await getAccountAccessToken(accountId);
    const tenantId = account.tenant_id as string;
    const accountEmail = account.email_address as string;

    console.log(`[BACKFILL] Starting for ${accountEmail} (${accountId})`);

    // ── 2. Get or create sync state ───────────────────────────
    let { data: syncState } = await svc
      .from("email_sync_state")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();

    if (!syncState) {
      const defaultStartDate = startDate ?? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const { data: newState, error: insertErr } = await svc
        .from("email_sync_state")
        .insert({
          tenant_id: tenantId,
          account_id: accountId,
          backfill_start_date: defaultStartDate,
          backfill_done: false,
        })
        .select("*")
        .single();

      if (insertErr) {
        // Could be race condition — re-fetch
        const { data: existing } = await svc
          .from("email_sync_state")
          .select("*")
          .eq("account_id", accountId)
          .single();
        syncState = existing;
      } else {
        syncState = newState;
      }
    }

    if (!syncState) return errorResponse("Failed to get/create sync state", 500);

    if (syncState.backfill_done) {
      return jsonResponse({
        success: true,
        message: "Backfill already completed",
        backfill_done: true,
        total_threads_synced: syncState.total_threads_synced,
        total_messages_synced: syncState.total_messages_synced,
      });
    }

    // ── 3. Build Gmail query ──────────────────────────────────
    const queryDate = startDate ?? syncState.backfill_start_date ?? "2025-09-01";
    const gmailQuery = `after:${queryDate}`;
    let pageToken: string | undefined = body.pageToken ?? syncState.backfill_cursor ?? undefined;

    let pagesProcessed = 0;
    let threadsUpserted = 0;
    let messagesUpserted = 0;
    let nextPageToken: string | undefined;

    // ── 4. Page loop ──────────────────────────────────────────
    while (pagesProcessed < maxPages) {
      console.log(`[BACKFILL] Page ${pagesProcessed + 1}/${maxPages}, cursor: ${pageToken ?? "START"}`);

      // List messages (not threads — gives us individual message IDs for full fetch)
      const listParams = new URLSearchParams({
        maxResults: String(MESSAGES_PER_PAGE),
        q: gmailQuery,
      });
      if (pageToken) listParams.set("pageToken", pageToken);

      const listRes = await fetch(`${GMAIL_API}/messages?${listParams}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!listRes.ok) {
        const err = await listRes.json();
        if (listRes.status === 429) {
          console.warn("[BACKFILL] Rate limited, stopping this run");
          break;
        }
        throw new Error(err.error?.message ?? `Gmail list ${listRes.status}`);
      }

      const listData = await listRes.json();
      const messageItems = (listData.messages ?? []) as Array<{ id: string; threadId: string }>;
      nextPageToken = listData.nextPageToken;

      if (messageItems.length === 0) {
        console.log("[BACKFILL] No more messages");
        break;
      }

      console.log(`[BACKFILL] Got ${messageItems.length} messages, nextPageToken: ${nextPageToken ?? "NONE"}`);

      // Group by threadId for efficient thread upsert
      const threadGroups = new Map<string, Array<{ id: string; threadId: string }>>();
      for (const item of messageItems) {
        const existing = threadGroups.get(item.threadId) ?? [];
        existing.push(item);
        threadGroups.set(item.threadId, existing);
      }

      // Process each thread group
      for (const [gmailThreadId, threadMessages] of threadGroups) {
        try {
          // Fetch full thread (gets all messages with body)
          const threadRes = await fetch(
            `${GMAIL_API}/threads/${gmailThreadId}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (!threadRes.ok) {
            if (threadRes.status === 429) {
              console.warn("[BACKFILL] Rate limited on thread fetch");
              // Save cursor and exit
              await saveCursor(svc, accountId, pageToken, threadsUpserted, messagesUpserted);
              return jsonResponse({
                success: true,
                rate_limited: true,
                pages_processed: pagesProcessed,
                threads_upserted: threadsUpserted,
                messages_upserted: messagesUpserted,
                next_cursor: pageToken,
              });
            }
            const errBody = await threadRes.text();
            console.error(`[BACKFILL] Thread fetch error ${threadRes.status}: ${errBody}`);
            continue;
          }

          const threadData = await threadRes.json();
          const messages = (threadData.messages ?? []) as Array<Record<string, unknown>>;
          if (!messages.length) continue;

          // ── Upsert thread ─────────────────────────────────
          const firstMsg = messages[0];
          const lastMsg = messages[messages.length - 1];
          const firstHeaders = ((firstMsg.payload as Record<string, unknown>)?.headers ?? []) as Array<{ name: string; value: string }>;

          // Build participants
          const participantsSet = new Map<string, { name: string; email: string }>();
          for (const msg of messages) {
            const hdrs = ((msg.payload as Record<string, unknown>)?.headers ?? []) as Array<{ name: string; value: string }>;
            for (const field of ["From", "To", "Cc"]) {
              const val = parseEmailHeader(hdrs, field);
              for (const p of parseParticipants(val)) {
                if (p.email) participantsSet.set(p.email.toLowerCase(), p);
              }
            }
          }

          const subject = decodeRFC2047(parseEmailHeader(firstHeaders, "Subject"));
          const participantsArray = Array.from(participantsSet.values());
          const primaryParticipant = participantsArray.length > 0
            ? (participantsArray[0].name || participantsArray[0].email)
            : "Unknown";

          const lastMessageDate = lastMsg.internalDate
            ? new Date(Number(lastMsg.internalDate)).toISOString()
            : new Date().toISOString();

          const labels = (lastMsg.labelIds ?? []) as string[];
          const snippet = (messages.map(m => m.snippet).filter(Boolean).pop() ?? "") as string;

          const classResult = classifyEmailTagV2({
            subject,
            snippet,
            labels,
            senderEmail: participantsArray[0]?.email ?? "",
          });
          const tag = classResult.tag;

          // Check for MANUAL tag (don't overwrite)
          const { data: existingThread } = await svc
            .from("email_threads")
            .select("id, tag_source")
            .eq("email_account_id", accountId)
            .eq("provider_thread_id", gmailThreadId)
            .maybeSingle();

          const isManualTag = existingThread?.tag_source === "MANUAL";

          const threadPayload: Record<string, unknown> = {
            tenant_id: tenantId,
            email_account_id: accountId,
            provider_thread_id: gmailThreadId,
            subject,
            primary_participant: primaryParticipant,
            last_message_at: lastMessageDate,
          };
          if (!isManualTag) {
            threadPayload.tag = tag;
            threadPayload.tag_source = "AI_RULES";
            threadPayload.priority = classResult.priority;
          }

          const { data: upsertedThread, error: threadErr } = await svc
            .from("email_threads")
            .upsert(threadPayload, { onConflict: "email_account_id,provider_thread_id" })
            .select("id")
            .single();

          if (threadErr) {
            console.error(`[BACKFILL] Thread upsert error: ${threadErr.message}`);
            continue;
          }
          if (!upsertedThread) continue;

          threadsUpserted++;

          // ── Upsert messages ───────────────────────────────
          for (const msg of messages) {
            const hdrs = ((msg.payload as Record<string, unknown>)?.headers ?? []) as Array<{ name: string; value: string }>;
            const msgDate = msg.internalDate
              ? new Date(Number(msg.internalDate)).toISOString()
              : lastMessageDate;

            const fromVal = parseEmailHeader(hdrs, "From");
            const fromParsed = parseParticipants(fromVal);
            const fromEmail = fromParsed[0]?.email?.toLowerCase() ?? "";
            const direction = fromEmail === accountEmail.toLowerCase() ? "OUTBOUND" : "INBOUND";

            const bodies = extractBody(msg.payload as Record<string, unknown>);
            const msgSubject = decodeRFC2047(parseEmailHeader(hdrs, "Subject"));

            const { error: msgErr } = await svc.from("email_messages").upsert({
              tenant_id: tenantId,
              email_account_id: accountId,
              thread_id: upsertedThread.id,
              provider_message_id: msg.id as string,
              direction,
              sender: fromEmail,
              recipients: [
                ...parseParticipants(parseEmailHeader(hdrs, "To")),
                ...parseParticipants(parseEmailHeader(hdrs, "Cc")),
                ...parseParticipants(parseEmailHeader(hdrs, "Bcc")),
              ],
              sent_at: msgDate,
              gmail_internal_date: msg.internalDate ? Number(msg.internalDate) : null,
              subject: msgSubject,
              message_id: parseEmailHeader(hdrs, "Message-ID"),
              in_reply_to: parseEmailHeader(hdrs, "In-Reply-To"),
              body_text: bodies.plain ?? null,
            }, { onConflict: "email_account_id,provider_message_id" });

            if (msgErr) {
              console.error(`[BACKFILL] Message upsert error: ${msgErr.message}`);
            } else {
              messagesUpserted++;
            }
          }

          // ── Upsert participants ───────────────────────────
          for (const [email, participant] of participantsSet) {
            // Determine role
            const role = email === accountEmail.toLowerCase()
              ? "INTERNAL"
              : (email.includes("booking.com") || email.includes("agoda.com") || email.includes("expedia.com") || email.includes("traveloka.com") || email.includes("airbnb.com"))
                ? "OTA"
                : "GUEST";

            await svc.from("email_thread_participants").upsert({
              thread_id: upsertedThread.id,
              email,
              role,
            }, { onConflict: "thread_id,email" }).then(({ error }) => {
              if (error) console.error(`[BACKFILL] Participant upsert error: ${error.message}`);
            });
          }

        } catch (threadErr) {
          console.error(`[BACKFILL] Thread processing error: ${(threadErr as Error).message}`);
        }

        // Rate limit safety
        await new Promise(r => setTimeout(r, INTER_MESSAGE_DELAY_MS));
      }

      pagesProcessed++;
      pageToken = nextPageToken;

      // Save cursor after each page
      await saveCursor(svc, accountId, pageToken, threadsUpserted, messagesUpserted);

      if (!nextPageToken) {
        console.log("[BACKFILL] No more pages — marking done");
        await svc
          .from("email_sync_state")
          .update({
            backfill_done: true,
            backfill_cursor: null,
            last_synced_at: new Date().toISOString(),
            total_threads_synced: (syncState.total_threads_synced ?? 0) + threadsUpserted,
            total_messages_synced: (syncState.total_messages_synced ?? 0) + messagesUpserted,
          })
          .eq("account_id", accountId);
        break;
      }
    }

    console.log(`[BACKFILL] Run complete: ${pagesProcessed} pages, ${threadsUpserted} threads, ${messagesUpserted} messages`);

    return jsonResponse({
      success: true,
      backfill_done: !nextPageToken,
      pages_processed: pagesProcessed,
      threads_upserted: threadsUpserted,
      messages_upserted: messagesUpserted,
      next_cursor: nextPageToken ?? null,
      total_threads_synced: (syncState.total_threads_synced ?? 0) + threadsUpserted,
      total_messages_synced: (syncState.total_messages_synced ?? 0) + messagesUpserted,
    });

  } catch (err) {
    console.error("[BACKFILL_ERROR]", (err as Error).message, (err as Error).stack);
    return errorResponse((err as Error).message ?? "Backfill failed", 500);
  }
});

// ─── Helper: save cursor to sync state ────────────────────────
async function saveCursor(
  svc: ReturnType<typeof getServiceClient>,
  accountId: string,
  cursor: string | undefined,
  threadsUpserted: number,
  messagesUpserted: number
): Promise<void> {
  const { data: current } = await svc
    .from("email_sync_state")
    .select("total_threads_synced, total_messages_synced")
    .eq("account_id", accountId)
    .single();

  await svc
    .from("email_sync_state")
    .update({
      backfill_cursor: cursor ?? null,
      total_threads_synced: (current?.total_threads_synced ?? 0) + threadsUpserted,
      total_messages_synced: (current?.total_messages_synced ?? 0) + messagesUpserted,
    })
    .eq("account_id", accountId);
}
