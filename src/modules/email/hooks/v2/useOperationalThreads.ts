import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EmailThreadV2, EmailAnalyticsV1, EmailTagV2 } from '@/types/email-v2';
import { toast } from 'sonner';

/**
 * Unified folder set — NO legacy duplicates.
 * Legacy tags are normalized to these in the query layer.
 */
export type OperationalFolder =
    | 'ACTION_REQUIRED'
    | 'BOOKING_SYSTEM'
    | 'GUEST_MESSAGE'
    | 'DISPUTE_REFUND'
    | 'FINANCE_PAYOUT'
    | 'ADS_SPAM'
    | 'INTERNAL_OTHER'
    | 'AI_NEEDS_REVIEW'
    | 'ALL';

interface UseOperationalThreadsOptions {
    folder: OperationalFolder;
    page: number;
    pageSize?: number;
}

/**
 * Normalize legacy tags → unified taxonomy.
 * This is the SINGLE place where mapping happens.
 * UI and filters only ever see the unified set.
 */
function normalizeTag(rawTag: string | null | undefined): EmailTagV2 {
    const t = (rawTag ?? '').toUpperCase();
    switch (t) {
        // New taxonomy (pass through)
        case 'BOOKING_SYSTEM': return 'BOOKING_SYSTEM';
        case 'GUEST_MESSAGE': return 'GUEST_MESSAGE';
        case 'DISPUTE_REFUND': return 'DISPUTE_REFUND';
        case 'FINANCE_PAYOUT': return 'FINANCE_PAYOUT';
        case 'ADS_SPAM': return 'ADS_SPAM';
        case 'INTERNAL_OTHER': return 'INTERNAL_OTHER';
        // Legacy → new mapping
        case 'GUEST_REPLY': return 'GUEST_MESSAGE';
        case 'DISPUTE': return 'DISPUTE_REFUND';
        case 'FINANCE_ALERT': return 'FINANCE_PAYOUT';
        case 'BOOKING_EXCEPTION': return 'BOOKING_SYSTEM';
        case 'SILENT': return 'ADS_SPAM';
        case 'VIP_PARTNER': return 'BOOKING_SYSTEM';
        case 'OTHER': return 'INTERNAL_OTHER';
        default: return 'INTERNAL_OTHER';
    }
}

/**
 * Extract sender from from_json (can be object or array).
 */
function extractSenderFromJson(
    fromJson: unknown,
): { name: string | null; email: string | null } | null {
    if (!fromJson) return null;
    let entry: { email?: string; name?: string } | null = null;
    if (Array.isArray(fromJson)) {
        entry = (fromJson as Array<{ email?: string; name?: string }>)[0] ?? null;
    } else if (typeof fromJson === 'object') {
        entry = fromJson as { email?: string; name?: string };
    }
    if (!entry) return null;
    return { name: entry.name || null, email: entry.email || null };
}

/**
 * Maps an overlay view row to EmailThreadV2.
 * The view already merges V1 content with V2 operational state,
 * so no client-side classification is needed.
 */
function viewRowToV2(
    row: Record<string, unknown>,
    latestInboundSender?: { name: string | null; email: string | null } | null,
): EmailThreadV2 {
    const participants = row.participants as Array<{ email?: string; name?: string }> | null;

    // Priority: latest inbound sender > V2 primary_participant > smart selection > fallback
    let primaryParticipant = (row.v2_primary_participant as string) ?? null;

    // Use latest inbound sender if available
    if (latestInboundSender) {
        primaryParticipant = latestInboundSender.name || latestInboundSender.email || primaryParticipant;
    }

    // Fallback: smart participant selection from V1 participants if no primary yet
    if (!primaryParticipant && participants && participants.length > 0) {
        const OTA_SYSTEM_PATTERNS = [
            'noreply', 'no-reply', 'donotreply', 'mailer-daemon',
            'notifications@', 'alert@', 'system@', 'postmaster@',
        ];

        const bestParticipant = participants.find((p) => {
            const email = (p.email ?? '').toLowerCase();
            if (!email) return false;
            return !OTA_SYSTEM_PATTERNS.some(pat => email.includes(pat));
        });

        if (bestParticipant) {
            primaryParticipant = bestParticipant.name || bestParticipant.email || null;
        } else {
            const first = participants[0];
            primaryParticipant = first?.name || first?.email || null;
        }
    }

    return {
        id: row.id as string,
        tenant_id: (row.tenant_id as string) ?? '',
        email_account_id: (row.email_account_id as string) ?? '',
        provider_thread_id: (row.provider_thread_id as string) ?? '',
        subject: (row.subject as string) ?? null,
        primary_participant: primaryParticipant,
        last_message_at: (row.last_message_at as string) ?? null,
        // Operational fields from V2 overlay (already coalesced in view)
        workflow_status: (row.workflow_status as EmailThreadV2['workflow_status']) ?? 'OPEN',
        priority: (row.priority as EmailThreadV2['priority']) ?? 'MEDIUM',
        owner_id: (row.owner_id as string) ?? null,
        // ★ Normalize legacy tags → unified taxonomy
        tag: normalizeTag(row.tag as string),
        tag_source: (row.tag_source as EmailThreadV2['tag_source']) ?? 'SYSTEM',
        is_muted: (row.is_muted as boolean) ?? false,
        manual_override: (row.manual_override as boolean) ?? false,
        status_updated_by: (row.status_updated_by as string) ?? null,
        status_updated_at: (row.status_updated_at as string) ?? null,
        snippet: (row.snippet as string) ?? null,
        created_at: (row.created_at as string) ?? '',
        updated_at: (row.updated_at as string) ?? '',
        // AI Suggestion fields (from overlay view LATERAL join)
        ai_suggested_tag: (row.ai_suggested_tag as string) ?? null,
        ai_confidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
        ai_apply_status: (row.ai_apply_status as EmailThreadV2['ai_apply_status']) ?? null,
        ai_reasons: (row.ai_reasons as string[]) ?? null,
        ai_model: (row.ai_model as string) ?? null,
        ai_scored_at: (row.ai_scored_at as string) ?? null,
    };
}

/**
 * Shared cache key for the raw email_threads fetch.
 * Folder/page/pageSize variations share the same raw data
 * but produce different slices.
 */
const RAW_THREADS_KEY = 'email-raw-threads-v2';

/**
 * Fetch and cache ALL threads + inbound senders.
 * This is folder/page agnostic — cached once, reused across pages.
 */
async function fetchAllThreadsWithSenders(): Promise<EmailThreadV2[]> {
    // Step 1: Fetch threads from V2 unified table
    const { data: threadData, error: threadErr } = await supabase
        .from('email_threads')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false });

    if (threadErr) throw threadErr;
    const rawThreads = threadData ?? [];

    // Step 2: Build map of latest INBOUND sender per thread_id
    const threadIds = rawThreads.map((t) => t.id as string);
    const latestInboundMap = new Map<string, { name: string | null; email: string | null }>();

    if (threadIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inboundMsgs } = await (supabase as any)
            .from('email_messages')
            .select('thread_id, from_json, sent_at')
            .eq('direction', 'INBOUND')
            .in('thread_id', threadIds)
            .order('sent_at', { ascending: false });

        if (inboundMsgs) {
            for (const msg of inboundMsgs) {
                const tid = msg.thread_id as string;
                if (!latestInboundMap.has(tid)) {
                    const sender = extractSenderFromJson(msg.from_json);
                    if (sender) {
                        latestInboundMap.set(tid, sender);
                    }
                }
            }
        }
    }

    // Step 3: Map threads using overlay view data (no client-side classification)
    return rawThreads.map((row) => {
        const rowId = row.id as string;
        const latestSender = latestInboundMap.get(rowId) ?? null;
        return viewRowToV2(row as Record<string, unknown>, latestSender);
    });
}

/**
 * Filter threads by folder — pure function, no side effects.
 */
function filterByFolder(threads: EmailThreadV2[], folder: OperationalFolder): EmailThreadV2[] {
    if (folder === 'ACTION_REQUIRED') {
        return threads.filter(t =>
            t.workflow_status !== 'DONE' &&
            t.tag !== 'ADS_SPAM' &&
            !t.is_muted
        );
    }
    if (folder === 'ALL') {
        return threads;
    }
    if (folder === 'AI_NEEDS_REVIEW') {
        // Show threads that need human review:
        // 1. Tag is INTERNAL_OTHER with AI_RULES source (low-confidence fallback)
        // 2. Has a pending AI suggestion with mid-range confidence
        // 3. Sensitive tags (DISPUTE/FINANCE) with AI suggestion
        return threads.filter(t => {
            // Case 1: Classifier fell through to INTERNAL_OTHER with AI_RULES
            // (confidence was 0.30 — definitely needs review)
            if (t.tag === 'INTERNAL_OTHER' && t.tag_source === 'AI_RULES') return true;

            // Case 2: Legacy OTHER with SYSTEM source (never reclassified)
            if (t.tag === 'INTERNAL_OTHER' && t.tag_source === 'SYSTEM') return true;

            // Case 3: Has pending AI suggestion
            if (t.ai_suggested_tag && t.ai_apply_status === 'SUGGESTED') {
                const conf = t.ai_confidence ?? 0;
                if (conf >= 0.50 && conf < 0.85) return true;
                if (['DISPUTE_REFUND', 'FINANCE_PAYOUT'].includes(t.ai_suggested_tag)) return true;
            }

            return false;
        });
    }
    // Direct tag match
    return threads.filter(t => t.tag === folder);
}

export function useOperationalThreads({ folder, page, pageSize = 10 }: UseOperationalThreadsOptions) {
    // Step A: Shared raw-data query — fetches once, cached 60s
    const rawQuery = useQuery({
        queryKey: [RAW_THREADS_KEY],
        queryFn: fetchAllThreadsWithSenders,
        staleTime: 60_000,
        refetchInterval: 30_000,
        retry: 1,
    });

    const allThreads = rawQuery.data;

    // Step B: Derived query — filter + paginate.
    // Uses `select` (derived data) approach: reads from raw cache, no extra fetch.
    return useQuery({
        queryKey: ['email-operational-threads', folder, page, pageSize],
        queryFn: () => {
            // If raw data not loaded yet, return empty
            if (!allThreads) return { threads: [] as EmailThreadV2[], total: 0 };

            // Apply folder filter
            const filtered = filterByFolder(allThreads, folder);
            const total = filtered.length;

            // Paginate: enforce pageSize
            const from = (page - 1) * pageSize;
            const sliced = filtered.slice(from, from + pageSize);

            return { threads: sliced, total };
        },
        // Enable only when raw data is available
        enabled: !!allThreads,
        // No staleTime for derived query — it re-computes instantly from cache
        staleTime: 0,
        // No placeholder — avoids showing stale page data during navigation
        placeholderData: undefined,
        // Structural sharing can merge identical-looking slices; disable to
        // guarantee each page/folder combo gets its own identity.
        structuralSharing: false,
        retry: 0,
    });
}

// ── Analytics — compute from overlay view ──
export function useOperationalAnalytics() {
    return useQuery({
        queryKey: ['email-operational-analytics'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('email_threads')
                .select('*')
                .order('last_message_at', { ascending: false, nullsFirst: false });

            if (error) throw error;

            const threads = (data ?? []).map((row) => viewRowToV2(row as Record<string, unknown>));

            // Compute analytics — tags are already normalized
            const actionRequired = threads.filter(t =>
                t.workflow_status !== 'DONE' &&
                t.tag !== 'ADS_SPAM' &&
                !t.is_muted
            );
            const perTag: Record<string, number> = {};
            for (const t of threads.filter(t => t.workflow_status !== 'DONE')) {
                perTag[t.tag] = (perTag[t.tag] ?? 0) + 1;
            }

            return {
                total_action_required: actionRequired.length,
                threads_open_gt_8h: threads.filter(t =>
                    t.workflow_status !== 'DONE' &&
                    t.tag !== 'SILENT' &&
                    t.last_message_at &&
                    (Date.now() - new Date(t.last_message_at).getTime()) > 8 * 3600_000
                ).length,
                threads_per_tag: perTag,
                threads_per_owner: {},
            } as EmailAnalyticsV1;
        },
        staleTime: 3 * 60_000,
        refetchInterval: 60_000,
    });
}

// ── Helper: patch a single thread in the list cache ──
function patchThreadInListCache(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    oldData: any,
    threadId: string,
    patch: Partial<EmailThreadV2>,
) {
    if (!oldData?.threads) return oldData;
    return {
        ...oldData,
        threads: oldData.threads.map((t: EmailThreadV2) =>
            t.id === threadId ? { ...t, ...patch } : t
        ),
    };
}

// ── Atomic workflow mutation — WITH OPTIMISTIC UPDATE ──
export function useUpdateWorkflowStatus(
    onThreadUpdated?: (updated: Partial<EmailThreadV2> & { id: string }) => void,
) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            threadId,
            newStatus,
        }: {
            threadId: string;
            newStatus: 'OPEN' | 'WAITING_GUEST' | 'INTERNAL_PENDING' | 'DONE';
        }) => {
            const { data: session } = await supabase.auth.getSession();
            const userId = session.session?.user?.id;
            if (!userId) throw new Error('Not authenticated');

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data, error } = await (supabase.rpc as any)('email_update_workflow', {
                    p_thread_id: threadId,
                    p_new_status: newStatus,
                    p_user_id: userId,
                });
                if (error) throw error;
                return data as unknown as EmailThreadV2;
            } catch {
                toast.error('Tính năng workflow sẽ được kích hoạt sau khi sync V2');
                return null;
            }
        },
        onMutate: async ({ threadId, newStatus }) => {
            await queryClient.cancelQueries({ queryKey: ['email-operational-threads'] });
            const previousData = queryClient.getQueriesData({ queryKey: ['email-operational-threads'] });
            const patch: Partial<EmailThreadV2> = {
                workflow_status: newStatus,
                status_updated_at: new Date().toISOString(),
            };
            queryClient.setQueriesData(
                { queryKey: ['email-operational-threads'] },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (old: any) => patchThreadInListCache(old, threadId, patch),
            );
            onThreadUpdated?.({ id: threadId, ...patch });
            return { previousData };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (_err: any, _vars: any, ctx: any) => {
            if (ctx?.previousData) {
                for (const [key, data] of ctx.previousData) {
                    queryClient.setQueryData(key, data);
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['email-operational-threads'] });
            queryClient.invalidateQueries({ queryKey: ['email-operational-analytics'] });
        },
    });
}

// ── Atomic priority mutation — WITH OPTIMISTIC UPDATE ──
export function useUpdatePriority(
    onThreadUpdated?: (updated: Partial<EmailThreadV2> & { id: string }) => void,
) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            threadId,
            newPriority,
        }: {
            threadId: string;
            newPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        }) => {
            const { data: session } = await supabase.auth.getSession();
            const userId = session.session?.user?.id;
            if (!userId) throw new Error('Not authenticated');

            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data, error } = await (supabase.rpc as any)('email_update_priority', {
                    p_thread_id: threadId,
                    p_new_priority: newPriority,
                    p_user_id: userId,
                });
                if (error) throw error;
                return data as unknown as EmailThreadV2;
            } catch {
                toast.error('Tính năng priority sẽ được kích hoạt sau khi sync V2');
                return null;
            }
        },
        onMutate: async ({ threadId, newPriority }) => {
            await queryClient.cancelQueries({ queryKey: ['email-operational-threads'] });
            const previousData = queryClient.getQueriesData({ queryKey: ['email-operational-threads'] });
            const patch: Partial<EmailThreadV2> = { priority: newPriority };
            queryClient.setQueriesData(
                { queryKey: ['email-operational-threads'] },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (old: any) => patchThreadInListCache(old, threadId, patch),
            );
            onThreadUpdated?.({ id: threadId, ...patch });
            return { previousData };
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (_err: any, _vars: any, ctx: any) => {
            if (ctx?.previousData) {
                for (const [key, data] of ctx.previousData) {
                    queryClient.setQueryData(key, data);
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['email-operational-threads'] });
        },
    });
}

