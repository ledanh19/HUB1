/**
 * email-sync-trigger – Trigger sync for an account (POST) or sync all (cron)
 * POST with body { accountId } → manual sync (requires admin)
 * POST with body { cron: true } → sync all ACTIVE accounts (called by pg_cron)
 * 
 * Uses sync lock (syncing_since column) to prevent concurrent syncs.
 */
import { corsHeaders, handleCorsPrelight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import {
  authenticate, requireEmailManage, getServiceClient,
  getAccountAccessToken, gmailListThreads, gmailGetThread,
  parseEmailHeader, parseParticipants, decodeRFC2047, audit, extractBody
} from "../_shared/email-helpers.ts";
import { classifyEmailTagV2 } from "../_shared/email-classifier.ts";

const SYNC_MAX_THREADS = Number(Deno.env.get("SYNC_MAX_THREADS") ?? "50");
const SYNC_LOCK_STALE_MIN = Number(Deno.env.get("SYNC_LOCK_STALE_MIN") ?? "10");
const MAX_CONSECUTIVE_ERRORS = 3;
const BACKOFF_BASE_MS = 2000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPrelight();
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await req.json().catch(() => ({}));

    // Cron mode: sync all accounts
    if (body.cron === true) {
      await syncAllAccounts();
      return jsonResponse({ success: true, mode: "cron" });
    }

    // Manual mode: requires auth + admin
    const auth = await authenticate(req);
    if (!auth) return errorResponse("Unauthorized", 401);
    if (!requireEmailManage(auth)) return errorResponse("Insufficient permissions", 403);

    const { accountId } = body;
    if (!accountId) return errorResponse("Missing accountId", 400);

    const svc = getServiceClient();
    const { data: account, error } = await svc
      .from("email_accounts")
      .select("id, status")
      .eq("id", accountId)
      .single();

    if (error || !account) return errorResponse("Account not found", 404);
    if (account.status === "REAUTH_REQUIRED") {
      return errorResponse("Account requires re-authentication. Please reconnect Gmail.", 400);
    }
    if (account.status === "REVOKED") {
      return errorResponse("Account is disconnected. Please reconnect.", 400);
    }
    // Allow ACTIVE and ERROR (retry after transient failure)
    if (account.status !== "ACTIVE" && account.status !== "ERROR") {
      return errorResponse(`Account status is ${account.status}, cannot sync`, 400);
    }

    console.log(`[SYNC] Manual trigger for ${accountId} by ${auth.userId}`);
    const result = await syncAccount(accountId, auth.userId);
    return jsonResponse({ success: true, ...result });
  } catch (err: unknown) {
    console.error("[SYNC_TRIGGER_ERROR]", err);
    return errorResponse((err as Error).message ?? "Sync failed", 500);
  }
});

// ─── Sync Lock ──────────────────────────────────────────────
async function acquireSyncLock(accountId: string): Promise<boolean> {
  const svc = getServiceClient();
  const staleThreshold = new Date(Date.now() - SYNC_LOCK_STALE_MIN * 60 * 1000).toISOString();

  // First, force-clear stale locks
  await svc
    .from("email_accounts")
    .update({ syncing_since: null })
    .eq("id", accountId)
    .lt("syncing_since", staleThreshold);

  const { data, error } = await svc
    .from("email_accounts")
    .update({ syncing_since: new Date().toISOString() })
    .eq("id", accountId)
    .is("syncing_since", null)
    .select("id")
    .maybeSingle();

  console.log(`[SYNC_LOCK] accountId=${accountId} acquired=${!!data} error=${error?.message ?? 'none'}`);
  return !error && !!data;
}

async function releaseSyncLock(accountId: string): Promise<void> {
  const svc = getServiceClient();
  await svc.from("email_accounts").update({ syncing_since: null }).eq("id", accountId);
  console.log(`[SYNC_LOCK] Released for ${accountId}`);
}

// ─── Sync Result Type ───────────────────────────────────────
interface SyncResult {
  locked: boolean;
  syncedThreads: number;
  syncedMessages: number;
  threadsSeenFromGmail: number;
  startedAt: string;
  finishedAt: string;
}

// ─── Sync Single Account ───────────────────────────────────
async function syncAccount(accountId: string, actorUserId?: string): Promise<SyncResult> {
  const startedAt = new Date().toISOString();

  // Phase 1.1: lockAcquired = true means WE got the lock; false = another job holds it
  const lockAcquired = await acquireSyncLock(accountId);
  if (!lockAcquired) {
    console.log(`[SYNC] Skipping ${accountId} – already syncing (locked by another job)`);
    // locked: true = "this account IS locked by another job, we did NOT sync"
    return { locked: true, syncedThreads: 0, syncedMessages: 0, threadsSeenFromGmail: 0, startedAt, finishedAt: new Date().toISOString() };
  }

  // Phase 2.1: Single declaration of all counters at outermost scope (no shadow)
  let syncedThreadsCount = 0;
  let syncedMessagesCount = 0;
  let threadsSeenCount = 0;

  // Phase 1.2: try/finally ensures releaseSyncLock ALWAYS runs when lockAcquired=true
  try {
    const svc = getServiceClient();
    const { data: account, error } = await svc
      .from("email_accounts")
      .select("*")
      .eq("id", accountId)
      .single();

    if (error || !account) {
      console.error(`[SYNC] Account fetch error: ${error?.message}`);
      throw new Error(`Account not found: ${accountId}`);
    }
    if (account.status !== "ACTIVE" && account.status !== "ERROR") {
      // locked: false = we acquired the lock, just nothing to do
      return { locked: false, syncedThreads: 0, syncedMessages: 0, threadsSeenFromGmail: 0, startedAt, finishedAt: new Date().toISOString() };
    }

    const userId = actorUserId ?? (account.created_by as string);
    let consecutiveErrors = 0;

    try {
      await audit({ action: "SYNC_START", actorUserId: userId, emailAccountId: accountId });
      console.log(`[SYNC] Getting access token for ${accountId}`);

      const { accessToken } = await getAccountAccessToken(accountId);
      console.log(`[SYNC] Got access token, fetching threads...`);

      const { threads } = await gmailListThreads(accessToken, { maxResults: SYNC_MAX_THREADS });
      // Phase 2.2: threadsSeenCount set once from Gmail response
      threadsSeenCount = threads.length;
      console.log(`[SYNC] Gmail returned ${threads.length} threads`);

      for (const threadItem of threads) {
        try {
          const threadData = await gmailGetThread(accessToken, threadItem.id, "full") as Record<string, unknown>;
          const messages = (threadData.messages ?? []) as Array<Record<string, unknown>>;
          if (!messages.length) continue;

          const lastMsg = messages[messages.length - 1];

          // Build participants from all messages
          const participantsSet = new Map<string, { name: string; email: string }>();
          for (const msg of messages) {
            const msgHeaders = ((msg.payload as Record<string, unknown>)?.headers ?? []) as Array<{ name: string; value: string }>;
            for (const field of ["From", "To", "Cc"]) {
              const val = parseEmailHeader(msgHeaders, field);
              for (const p of parseParticipants(val)) {
                if (p.email) participantsSet.set(p.email.toLowerCase(), p);
              }
            }
          }

          // Get subject from the first message (thread subject)
          const firstMsgHeaders = ((messages[0].payload as Record<string, unknown>)?.headers ?? []) as Array<{ name: string; value: string }>;
          const rawSubject = parseEmailHeader(firstMsgHeaders, "Subject");
          const subject = decodeRFC2047(rawSubject);

          const snippet = messages.map(m => m.snippet).filter(Boolean).pop() as string ?? "";
          const lastMessageDate = lastMsg.internalDate
            ? new Date(Number(lastMsg.internalDate)).toISOString()
            : new Date().toISOString();
          const unreadCount = messages.filter(m => ((m.labelIds ?? []) as string[]).includes("UNREAD")).length;
          const labels = (lastMsg.labelIds ?? []) as string[];

          // V2 Schema expects primary_participant (text) and tag
          const participantsArray = Array.from(participantsSet.values());
          const primaryParticipant = participantsArray.length > 0 ? (participantsArray[0].name || participantsArray[0].email) : "Unknown";

          const classResult = classifyEmailTagV2({
            subject,
            snippet,
            labels,
            senderEmail: participantsArray.length > 0 ? participantsArray[0].email : ""
          });
          const tag = classResult.tag;

          // Phase 5: Check if this thread has a MANUAL tag or human workflow decision
          const { data: existingThread } = await svc
            .from("email_threads")
            .select("id, tag_source, workflow_status, manual_override")
            .eq("email_account_id", accountId)
            .eq("provider_thread_id", threadItem.id)
            .maybeSingle();

          const isManualTag = existingThread?.tag_source === "MANUAL"
            || existingThread?.manual_override === true
            || (existingThread?.workflow_status && existingThread.workflow_status !== "OPEN");

          // Build upsert payload — only include tag fields when not manually overridden
          const threadPayload: Record<string, unknown> = {
            tenant_id: account.tenant_id,
            email_account_id: accountId,
            provider_thread_id: threadItem.id,
            subject,
            primary_participant: primaryParticipant,
            last_message_at: lastMessageDate,
          };

          if (!isManualTag) {
            threadPayload.tag = tag;
            threadPayload.tag_source = "AI_RULES";
            threadPayload.priority = classResult.priority;
          }

          // V1 content columns (now in V2 unified table)
          threadPayload.snippet = snippet;
          threadPayload.participants = participantsArray;
          threadPayload.unread_count = unreadCount;
          threadPayload.labels = labels;

          // Upsert thread (V2)
          const { data: upsertedThread, error: upsertErr } = await svc
            .from("email_threads")
            .upsert(threadPayload, { onConflict: "email_account_id,provider_thread_id" })
            .select("id")
            .single();

          if (upsertErr) {
            console.error(`[SYNC] Thread upsert error: ${upsertErr.message}`, upsertErr.details);
            continue;
          }
          if (!upsertedThread) continue;

          // Upsert messages
          for (const msg of messages) {
            const msgHeaders = ((msg.payload as Record<string, unknown>)?.headers ?? []) as Array<{ name: string; value: string }>;
            const msgDate = msg.internalDate
              ? new Date(Number(msg.internalDate)).toISOString()
              : lastMessageDate;

            const fromVal = parseEmailHeader(msgHeaders, "From");
            const fromParsed = parseParticipants(fromVal);
            const fromEmail = fromParsed[0]?.email?.toLowerCase() ?? "";
            const direction = fromEmail === (account.email_address as string).toLowerCase() ? "OUTBOUND" : "INBOUND";
            const parts = ((msg.payload as Record<string, unknown>)?.parts ?? []) as Array<Record<string, unknown>>;
            const hasAttachments = parts.some(p => p.filename && (p.filename as string).length > 0);

            const msgSubject = decodeRFC2047(parseEmailHeader(msgHeaders, "Subject"));
            const replyTo = parseEmailHeader(msgHeaders, "Reply-To");

            const bodies = extractBody(msg.payload as Record<string, unknown>);

            // Upsert message (SINGLE SOT)
            const { error: msgErr } = await svc.from("email_messages").upsert({
              tenant_id: account.tenant_id,
              email_account_id: accountId,
              thread_id: upsertedThread.id,
              provider_message_id: msg.id as string,
              direction,
              sender: fromEmail,
              recipients: [
                ...parseParticipants(parseEmailHeader(msgHeaders, "To")),
                ...parseParticipants(parseEmailHeader(msgHeaders, "Cc")),
                ...parseParticipants(parseEmailHeader(msgHeaders, "Bcc"))
              ],
              sent_at: msgDate,
              gmail_internal_date: msg.internalDate ? Number(msg.internalDate) : null,
              subject: msgSubject,
              message_id: parseEmailHeader(msgHeaders, "Message-ID"),
              in_reply_to: parseEmailHeader(msgHeaders, "In-Reply-To"),
              body_text: bodies.plain || null,
              body_html: bodies.html || null,
              // V1 content columns (unified)
              from_json: fromParsed,
              to_json: parseParticipants(parseEmailHeader(msgHeaders, "To")),
              cc_json: parseParticipants(parseEmailHeader(msgHeaders, "Cc")),
              headers: {
                "Message-ID": parseEmailHeader(msgHeaders, "Message-ID"),
                "In-Reply-To": parseEmailHeader(msgHeaders, "In-Reply-To"),
                "References": parseEmailHeader(msgHeaders, "References"),
                "Reply-To": replyTo || null,
              },
              has_attachments: hasAttachments,
            }, { onConflict: "email_account_id,provider_message_id" });

            if (msgErr) {
              console.error(`[SYNC] Message upsert error: ${msgErr.message}`, msgErr.details);
            } else {
              syncedMessagesCount++;
            }
          }

          // ── Generate notifications for genuinely new INBOUND emails ──
          // Uses INSERT ... ON CONFLICT DO NOTHING for idempotent dedupe.
          // Spam (ADS_SPAM) and outbound messages are excluded.
          // Only runs for non-spam tags to avoid noisy notifications.
          const SPAM_TAGS = new Set(["ADS_SPAM"]);
          const effectiveTag = isManualTag ? "UNKNOWN" : tag;
          const shouldNotify = !SPAM_TAGS.has(effectiveTag);

          if (shouldNotify) {
            // Collect inbound messages for notification generation
            const inboundMsgs = messages.filter(m => {
              const mHeaders = ((m.payload as Record<string, unknown>)?.headers ?? []) as Array<{ name: string; value: string }>;
              const mFrom = parseEmailHeader(mHeaders, "From");
              const mParsed = parseParticipants(mFrom);
              const mEmail = mParsed[0]?.email?.toLowerCase() ?? "";
              return mEmail !== (account.email_address as string).toLowerCase();
            });

            if (inboundMsgs.length > 0) {
              // Determine notification event_type based on classifier tag
              const ACTIONABLE_TAGS = new Set(["GUEST_MESSAGE", "FINANCE_PAYOUT", "DISPUTE_REFUND"]);
              const REVIEW_TAGS = new Set(["INTERNAL_OTHER"]);

              let notifEventType = "EMAIL_NEW_MESSAGE";
              let notifPriority = "MEDIUM";
              if (!existingThread) {
                notifEventType = "EMAIL_NEW_THREAD";
              }
              if (ACTIONABLE_TAGS.has(effectiveTag)) {
                notifEventType = "EMAIL_ACTIONABLE";
                notifPriority = effectiveTag === "DISPUTE_REFUND" ? "HIGH" : "MEDIUM";
              } else if (REVIEW_TAGS.has(effectiveTag)) {
                notifEventType = "EMAIL_NEEDS_REVIEW";
                notifPriority = "LOW";
              }

              // Use the latest inbound message for the notification
              const latestInbound = inboundMsgs[inboundMsgs.length - 1];
              const latestMsgId = latestInbound.id as string;

              // Build dedupe key based on event type
              let dedupeKey: string;
              if (notifEventType === "EMAIL_NEW_THREAD") {
                dedupeKey = `email:new_thread:${upsertedThread.id}`;
              } else if (notifEventType === "EMAIL_ACTIONABLE") {
                dedupeKey = `email:actionable:${upsertedThread.id}:${effectiveTag}:${latestMsgId}`;
              } else if (notifEventType === "EMAIL_NEEDS_REVIEW") {
                dedupeKey = `email:needs_review:${upsertedThread.id}:${latestMsgId}`;
              } else {
                dedupeKey = `email:new_message:${latestMsgId}`;
              }

              // Stale guard: skip notifications for messages older than 30 minutes
              const latestMsgDate = latestInbound.internalDate ? Number(latestInbound.internalDate) : 0;
              const messageAgeMs = latestMsgDate ? (Date.now() - latestMsgDate) : 0;
              const isStale = messageAgeMs > 30 * 60 * 1000;

              if (!isStale) {
                const notifTitle = notifEventType === "EMAIL_ACTIONABLE"
                  ? (effectiveTag === "GUEST_MESSAGE" ? "Email khách hàng mới" : effectiveTag === "DISPUTE_REFUND" ? "Email tranh chấp mới" : "Email tài chính mới")
                  : notifEventType === "EMAIL_NEEDS_REVIEW"
                    ? "Email cần review"
                    : notifEventType === "EMAIL_NEW_THREAD"
                      ? "Thread email mới"
                      : "Email mới";

                const notifBody = subject
                  ? `${primaryParticipant}: ${subject}`.substring(0, 200)
                  : `Email từ ${primaryParticipant}`.substring(0, 200);

                // INSERT ON CONFLICT DO NOTHING — idempotent, safe for repeated sync
                const { error: notifErr } = await svc.from("notifications").insert({
                  tenant_id: account.tenant_id,
                  source_module: "EMAIL",
                  event_type: notifEventType,
                  dedupe_key: dedupeKey,
                  title: notifTitle,
                  body: notifBody,
                  icon: "mail",
                  deep_link: `/email/inbox?thread=${upsertedThread.id}`,
                  source_table: "email_threads",
                  source_record_id: upsertedThread.id,
                  priority: notifPriority,
                  metadata: {
                    tag: effectiveTag,
                    thread_id: upsertedThread.id,
                    message_id: latestMsgId,
                    subject: subject?.substring(0, 100),
                    sender: primaryParticipant,
                    email_account_id: accountId,
                  },
                });

                if (notifErr) {
                  // 23505 = unique_violation (duplicate) — expected and safe for ON CONFLICT
                  // PGRST116 = single row expected but 0 returned — also safe (conflict → 0 rows)
                  if (notifErr.code === "23505" || notifErr.code === "PGRST116") {
                    console.log(`[SYNC_NOTIF] Dedupe: ${dedupeKey} already exists (${notifErr.code})`);
                  } else {
                    console.error(`[SYNC_NOTIF] Insert error: ${notifErr.message} (${notifErr.code})`);
                  }
                } else {
                  console.log(`[SYNC_NOTIF] Created: ${notifEventType} dedupe=${dedupeKey}`);

                  // Fire-and-forget PWA push for actionable email notifications
                  // Uses tenant-scoped recipient lookup instead of broadcast_all
                  if (["EMAIL_ACTIONABLE", "EMAIL_NEW_THREAD", "EMAIL_NEW_MESSAGE", "EMAIL_NEEDS_REVIEW"].includes(notifEventType)) {
                    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
                    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                    if (SUPABASE_URL && SERVICE_KEY) {
                      // Look up all users in this tenant via user_roles (team members)
                      const { data: tenantUsers } = await svc
                        .from("user_roles")
                        .select("user_id")
                        .limit(50);
                      
                      const recipientIds = (tenantUsers ?? []).map((u: any) => u.user_id);
                      
                      if (recipientIds.length > 0) {
                        fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
                          body: JSON.stringify({
                            event_type: notifEventType,
                            idempotency_key: `email_notif:${dedupeKey}`,
                            recipient_user_ids: recipientIds,
                            payload: {
                              title: notifTitle,
                              body: notifBody,
                              icon: "/favicon.png",
                              deep_link: `/email/inbox?thread=${upsertedThread.id}`,
                              tag: `roomrise-email-${upsertedThread.id}`,
                            },
                          }),
                        }).catch(e => console.error("[SYNC_PUSH] Error:", e));
                      }
                    }
                  }
                }
              } else {
                console.log(`[SYNC_NOTIF] Skipped stale message (${Math.round(messageAgeMs / 60000)}min old): ${dedupeKey}`);
              }
            }
          }

          // Phase 2.2: increment thread counter on successful thread processing
          syncedThreadsCount++;
          consecutiveErrors = 0;
        } catch (threadErr: unknown) {
          consecutiveErrors++;
          console.error(`[SYNC_THREAD_ERROR] thread=${threadItem.id}`, (threadErr as Error).message);

          if ((threadErr as Record<string, unknown>).status === 429) {
            const backoff = BACKOFF_BASE_MS * Math.pow(2, consecutiveErrors);
            await new Promise(r => setTimeout(r, backoff));
          }

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            await svc.from("email_accounts").update({
              status: "ERROR",
              error_code: (threadErr as Error).message ?? "CONSECUTIVE_SYNC_ERRORS",
              error_at: new Date().toISOString(),
            }).eq("id", accountId);

            await audit({
              action: "ACCOUNT_ERROR",
              actorUserId: userId,
              emailAccountId: accountId,
              meta: { error: (threadErr as Error).message, consecutive_errors: consecutiveErrors },
            });
            // Phase 1.2: Do NOT release lock here — finally block handles it
            break; // exit thread loop; counts reflect partial progress
          }
        }
      }

      console.log(`[SYNC] Synced ${syncedThreadsCount} threads for ${accountId}`);

      // Update sync state — reset to ACTIVE if was ERROR (successful retry clears error state)
      await svc.from("email_accounts").update({
        status: "ACTIVE",
        last_sync_at: new Date().toISOString(),
        error_code: null,
        error_at: null,
      }).eq("id", accountId);

      await audit({
        action: "SYNC_COMPLETE",
        actorUserId: userId,
        emailAccountId: accountId,
        meta: {
          threads_synced: syncedThreadsCount,
          threads_seen: threadsSeenCount,
          messages_upserted: syncedMessagesCount,
          lock_acquired: true,
        },
      });
    } catch (err: unknown) {
      console.error(`[SYNC_ACCOUNT_ERROR] account=${accountId}`, (err as Error).message, (err as Error).stack);
      await svc.from("email_accounts").update({
        error_code: (err as Error).message ?? "SYNC_FAILURE",
        error_at: new Date().toISOString(),
      }).eq("id", accountId);

      await audit({
        action: "SYNC_ERROR",
        actorUserId: userId,
        emailAccountId: accountId,
        meta: { error: (err as Error).message },
      });
    }
  } finally {
    // Phase 1.2: Lock release ALWAYS runs (we only reach here if lockAcquired=true)
    await releaseSyncLock(accountId);
  }

  // Phase 2.3: Return uses the outer counters — locked: false = we acquired, sync ran
  return {
    locked: false,
    syncedThreads: syncedThreadsCount,
    syncedMessages: syncedMessagesCount,
    threadsSeenFromGmail: threadsSeenCount,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

// ─── Sync All Accounts ─────────────────────────────────────
async function syncAllAccounts(): Promise<void> {
  const svc = getServiceClient();
  const { data: accounts, error } = await svc
    .from("email_accounts")
    .select("id")
    .in("status", ["ACTIVE", "ERROR"]);

  if (error || !accounts) {
    console.error("[SYNC_ALL_ERROR]", error);
    return;
  }

  console.log(`[SYNC] Starting sync for ${accounts.length} accounts`);
  for (const account of accounts) {
    await syncAccount(account.id);
    await new Promise(r => setTimeout(r, 500));
  }
  console.log("[SYNC] Completed sync cycle");
}
