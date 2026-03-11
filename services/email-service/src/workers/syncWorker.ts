/**
 * Sync Worker – Polling-based thread-first sync
 * ═══════════════════════════════════════════════════════════
 * Runs periodically for each ACTIVE account.
 * - Lists newest threads from INBOX
 * - Upserts thread metadata + message headers
 * - Body is NOT fetched here (lazy-load on thread open)
 * - Rate-limit backoff: 429/5xx → exponential delay
 * - Circuit breaker: 3+ consecutive errors → status=ERROR
 *
 * SECURITY FIX v2:
 *   - Concurrency lock via syncing_since column
 *   - Config from env vars (SYNC_CRON, SYNC_MAX_THREADS, etc.)
 */
import { serviceSupabase } from '../lib/supabase';
import {
  getGmailClient,
  listThreads,
  getThread,
  parseEmailHeader,
  parseParticipants,
} from '../lib/gmail';
import { audit } from '../lib/audit';
import cron from 'node-cron';

// ── Tunable config (env → fallback defaults) ────────────────
const SYNC_CRON = process.env.SYNC_CRON ?? '*/2 * * * *';
const SYNC_MAX_THREADS = Number(process.env.SYNC_MAX_THREADS) || 50;
const SYNC_INTER_DELAY = Number(process.env.SYNC_INTER_ACCOUNT_DELAY_MS) || 500;
const MAX_CONSECUTIVE_ERRORS = Number(process.env.SYNC_MAX_CONSECUTIVE_ERRORS) || 3;
const BACKOFF_BASE_MS = Number(process.env.SYNC_BACKOFF_BASE_MS) || 2000;
const SYNC_LOCK_STALE_MIN = Number(process.env.SYNC_LOCK_STALE_MIN) || 10;

/**
 * Acquire sync lock via syncing_since column.
 * Returns true if lock acquired, false if already running.
 */
async function acquireSyncLock(accountId: string): Promise<boolean> {
  const staleThreshold = new Date(Date.now() - SYNC_LOCK_STALE_MIN * 60 * 1000).toISOString();

  // Atomic: set syncing_since only if NULL or stale
  const { data, error } = await serviceSupabase
    .from('email_accounts')
    .update({ syncing_since: new Date().toISOString() })
    .eq('id', accountId)
    .or(`syncing_since.is.null,syncing_since.lt.${staleThreshold}`)
    .select('id')
    .maybeSingle();

  return !error && !!data;
}

async function releaseSyncLock(accountId: string): Promise<void> {
  await serviceSupabase
    .from('email_accounts')
    .update({ syncing_since: null })
    .eq('id', accountId);
}

/**
 * Sync a single account's INBOX threads.
 */
export async function syncAccount(accountId: string, actorUserId?: string): Promise<void> {
  // ── Concurrency lock ────────────────────────────────────
  const locked = await acquireSyncLock(accountId);
  if (!locked) {
    console.log(`[SYNC] Skipping ${accountId} – already syncing`);
    return;
  }

  const { data: account, error } = await serviceSupabase
    .from('email_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    await releaseSyncLock(accountId);
    throw new Error(`Account not found: ${accountId}`);
  }
  if (account.status !== 'ACTIVE') {
    await releaseSyncLock(accountId);
    return;
  }

  const userId = actorUserId ?? account.created_by;
  let consecutiveErrors = 0;

  try {
    await audit({
      action: 'SYNC_START',
      actorUserId: userId,
      emailAccountId: accountId,
    });

    const gmail = await getGmailClient(accountId);

    // List threads (newest from INBOX, count configurable)
    const { threads } = await listThreads(gmail, {
      maxResults: SYNC_MAX_THREADS,
      labelIds: ['INBOX'],
    });

    let syncedCount = 0;

    for (const threadItem of threads) {
      try {
        // Fetch thread metadata
        const threadData = await getThread(gmail, threadItem.id, 'metadata');
        if (!threadData.messages?.length) continue;

        const firstMsg = threadData.messages[0];
        const lastMsg = threadData.messages[threadData.messages.length - 1];
        const headers = firstMsg.payload?.headers ?? [];

        // Build participants set
        const participantsSet = new Map<string, { name: string; email: string }>();
        for (const msg of threadData.messages) {
          const msgHeaders = msg.payload?.headers ?? [];
          for (const field of ['From', 'To', 'Cc']) {
            const val = parseEmailHeader(msgHeaders, field);
            for (const p of parseParticipants(val)) {
              if (p.email) participantsSet.set(p.email.toLowerCase(), p);
            }
          }
        }

        const subject = parseEmailHeader(headers, 'Subject');
        const snippet = threadData.messages
          .map((m) => m.snippet)
          .filter(Boolean)
          .pop() ?? '';
        const lastMessageDate = lastMsg.internalDate
          ? new Date(Number(lastMsg.internalDate)).toISOString()
          : new Date().toISOString();

        // Count unread
        const unreadCount = threadData.messages.filter(
          (m) => m.labelIds?.includes('UNREAD')
        ).length;

        // Labels from last message
        const labels = lastMsg.labelIds ?? [];

        // Upsert thread
        const { data: upsertedThread } = await serviceSupabase
          .from('email_threads')
          .upsert(
            {
              tenant_id: account.tenant_id,
              email_account_id: accountId,
              provider_thread_id: threadItem.id,
              subject,
              snippet,
              participants: Array.from(participantsSet.values()),
              last_message_at: lastMessageDate,
              unread_count: unreadCount,
              labels,
            },
            { onConflict: 'email_account_id,provider_thread_id' }
          )
          .select('id')
          .single();

        if (!upsertedThread) continue;

        // Upsert messages (headers only, body lazy-loaded)
        for (const msg of threadData.messages) {
          const msgHeaders = msg.payload?.headers ?? [];
          const msgDate = msg.internalDate
            ? new Date(Number(msg.internalDate)).toISOString()
            : lastMessageDate;

          const fromVal = parseEmailHeader(msgHeaders, 'From');
          const toVal = parseEmailHeader(msgHeaders, 'To');
          const ccVal = parseEmailHeader(msgHeaders, 'Cc');
          const bccVal = parseEmailHeader(msgHeaders, 'Bcc');

          // Determine direction
          const fromEmail = parseParticipants(fromVal)[0]?.email?.toLowerCase() ?? '';
          const direction = fromEmail === account.email_address.toLowerCase()
            ? 'OUTBOUND'
            : 'INBOUND';

          const hasAttachments = (msg.payload?.parts ?? []).some(
            (p) => p.filename && p.filename.length > 0
          );

          await serviceSupabase
            .from('email_messages')
            .upsert(
              {
                tenant_id: account.tenant_id,
                email_account_id: accountId,
                thread_id: upsertedThread.id,
                provider_message_id: msg.id!,
                direction,
                from_json: parseParticipants(fromVal),
                to_json: parseParticipants(toVal),
                cc_json: parseParticipants(ccVal),
                bcc_json: parseParticipants(bccVal),
                date: msgDate,
                subject: parseEmailHeader(msgHeaders, 'Subject'),
                headers: {
                  'Message-ID': parseEmailHeader(msgHeaders, 'Message-ID'),
                  'In-Reply-To': parseEmailHeader(msgHeaders, 'In-Reply-To'),
                  'References': parseEmailHeader(msgHeaders, 'References'),
                  'Reply-To': parseEmailHeader(msgHeaders, 'Reply-To'),
                  'From': parseEmailHeader(msgHeaders, 'From'),
                  'Sender': parseEmailHeader(msgHeaders, 'Sender'),
                  'Authentication-Results': parseEmailHeader(msgHeaders, 'Authentication-Results'),
                },
                has_attachments: hasAttachments,
                // body_plain + body_html_sanitized left null → lazy-load
              },
              { onConflict: 'email_account_id,provider_message_id' }
            );
        }

        syncedCount++;
        consecutiveErrors = 0; // Reset on success
      } catch (threadErr: any) {
        consecutiveErrors++;
        console.error(`[SYNC_THREAD_ERROR] thread=${threadItem.id}`, threadErr);

        // Rate limit backoff
        if (threadErr.code === 429 || threadErr.status === 429) {
          const backoff = BACKOFF_BASE_MS * Math.pow(2, consecutiveErrors);
          console.warn(`[RATE_LIMIT] Backing off ${backoff}ms for account ${accountId}`);
          await sleep(backoff);
        }

        // Circuit breaker
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          await serviceSupabase
            .from('email_accounts')
            .update({
              status: 'ERROR',
              error_code: threadErr.message ?? 'CONSECUTIVE_SYNC_ERRORS',
              error_at: new Date().toISOString(),
            })
            .eq('id', accountId);

          await audit({
            action: 'ACCOUNT_ERROR',
            actorUserId: userId,
            emailAccountId: accountId,
            meta: { error: threadErr.message, consecutive_errors: consecutiveErrors },
          });
          await releaseSyncLock(accountId);
          return;
        }
      }
    }

    // Update sync state
    await serviceSupabase
      .from('email_accounts')
      .update({
        last_sync_at: new Date().toISOString(),
        error_code: null,
        error_at: null,
      })
      .eq('id', accountId);

    await audit({
      action: 'SYNC_COMPLETE',
      actorUserId: userId,
      emailAccountId: accountId,
      meta: { threads_synced: syncedCount },
    });
  } catch (err: any) {
    console.error(`[SYNC_ACCOUNT_ERROR] account=${accountId}`, err);

    await serviceSupabase
      .from('email_accounts')
      .update({
        error_code: err.message ?? 'SYNC_FAILURE',
        error_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    await audit({
      action: 'SYNC_ERROR',
      actorUserId: userId,
      emailAccountId: accountId,
      meta: { error: err.message },
    });
  } finally {
    await releaseSyncLock(accountId);
  }
}

/**
 * Sync all ACTIVE accounts.
 */
async function syncAllAccounts(): Promise<void> {
  const { data: accounts, error } = await serviceSupabase
    .from('email_accounts')
    .select('id')
    .eq('status', 'ACTIVE');

  if (error || !accounts) {
    console.error('[SYNC_ALL_ERROR] Failed to list accounts', error);
    return;
  }

  console.log(`[SYNC] Starting sync for ${accounts.length} accounts`);
  for (const account of accounts) {
    await syncAccount(account.id);
    // Small delay between accounts to avoid burst
    await sleep(SYNC_INTER_DELAY);
  }
  console.log('[SYNC] Completed sync cycle');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the cron job – schedule configurable via SYNC_CRON env.
 */
export function startSyncScheduler(): void {
  console.log(`[SYNC] Scheduler started – cron: ${SYNC_CRON}`);
  cron.schedule(SYNC_CRON, async () => {
    await syncAllAccounts();
  });
}

// Allow direct execution: `tsx src/workers/syncWorker.ts`
if (require.main === module) {
  syncAllAccounts().then(() => {
    console.log('[SYNC] Manual sync completed');
    process.exit(0);
  });
}
