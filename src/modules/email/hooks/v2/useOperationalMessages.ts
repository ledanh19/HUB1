import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchEmailThreadDetail } from '../../api';
import type { EmailMessageV2 } from '@/types/email-v2';

interface UseOperationalMessagesOptions {
    threadId: string | null;
    /** Thread snippet — used as body fallback when messages have no body */
    threadSnippet?: string | null;
    page?: number;
    pageSize?: number;
}

/**
 * Maps an overlay view message row to V2 EmailMessageV2 shape.
 * The view merges V1 mirror content with V2 operational fields.
 */
function viewMessageToV2(row: Record<string, unknown>): EmailMessageV2 {
    // from_json can be: {email,name} | [{email,name}] | null
    const rawFrom = row.from_json;
    let fromEntry: { email?: string; name?: string } | null = null;
    if (Array.isArray(rawFrom)) {
        fromEntry = (rawFrom as Array<{ email?: string; name?: string }>)[0] ?? null;
    } else if (rawFrom && typeof rawFrom === 'object') {
        fromEntry = rawFrom as { email?: string; name?: string };
    }
    // IMPORTANT: prefer email over name — sender is used downstream as email address fallback
    const sender = fromEntry?.email || fromEntry?.name || null;

    // to_json: always array [{email,name}]
    const rawTo = row.to_json;
    const toArr = Array.isArray(rawTo) ? rawTo : [];
    const recipients = toArr.map((r: { email?: string; name?: string }) => ({
        name: r.name || '',
        email: r.email || '',
    }));

    return {
        id: row.id as string,
        tenant_id: (row.tenant_id as string) ?? '',
        email_account_id: (row.email_account_id as string) ?? '',
        thread_id: (row.thread_id as string) ?? '',
        provider_message_id: (row.provider_message_id as string) ?? '',
        direction: (row.direction as 'INBOUND' | 'OUTBOUND') ?? 'INBOUND',
        sender,
        recipients,
        // Body from overlay view (prefers V2, falls back to V1)
        body_html: (row.body_html as string) ?? null,
        body_text: (row.body_text as string) ?? null,
        // sent_at from overlay view (prefers V2 sent_at, falls back to V1 date)
        sent_at: (row.sent_at as string) ?? null,
        gmail_internal_date: (row.gmail_internal_date as number) ?? null,
        message_id: (row.message_id as string) ?? null,
        in_reply_to: (row.in_reply_to as string) ?? null,
        created_at: (row.created_at as string) ?? '',
    };
}

export function useOperationalMessages({
    threadId,
    threadSnippet,
    page = 1,
    pageSize = 50,
}: UseOperationalMessagesOptions) {
    const queryClient = useQueryClient();
    // Track which threads we've already triggered body fetch for
    const fetchedBodiesRef = useRef<Set<string>>(new Set());

    const query = useQuery({
        queryKey: ['email-operational-messages', threadId, page, pageSize],
        queryFn: async () => {
            if (!threadId) return { messages: [], total: 0 };

            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            // Query email_messages directly (V2 unified table)
            const { data, count, error } = await supabase
                .from('email_messages')
                .select('*', { count: 'exact' })
                .eq('thread_id', threadId)
                .order('sent_at', { ascending: true, nullsFirst: false })
                .range(from, to);

            if (error) throw error;

            let messages = (data ?? []).map((row) => viewMessageToV2(row as Record<string, unknown>));

            // If ALL messages have no body, inject the thread snippet as the body
            // of the first message — this gives the user at least some content
            if (threadSnippet && messages.length > 0) {
                const allEmpty = messages.every(m => !m.body_text && !m.body_html);
                if (allEmpty) {
                    messages = messages.map((m, i) => i === 0
                        ? { ...m, body_text: threadSnippet }
                        : m
                    );
                }
            }

            return { messages, total: count ?? 0 };
        },
        enabled: !!threadId,
        staleTime: 30_000,
        refetchInterval: 15_000,
    });

    // ── Body Fetch Trigger ──
    // When messages have null bodies, call V1 detail endpoint to trigger
    // Gmail body lazy-load. V1 endpoint fetches from Gmail → writes to
    // email_messages_mirror.body_plain + body_html_sanitized →
    // overlay view picks them up on next query.
    useEffect(() => {
        if (!threadId || !query.data?.messages?.length) return;

        // Skip if we already triggered for this thread
        if (fetchedBodiesRef.current.has(threadId)) return;

        const hasEmptyBodies = query.data.messages.some(
            m => !m.body_text && !m.body_html
        );

        if (!hasEmptyBodies) return;

        // Mark as in-progress to prevent duplicate fetches
        fetchedBodiesRef.current.add(threadId);

        // Fire V1 detail endpoint (triggers Gmail body fetch behind the scenes)
        fetchEmailThreadDetail(threadId)
            .then(() => {
                // Bodies are now populated in V1 mirror — invalidate to re-read overlay
                queryClient.invalidateQueries({
                    queryKey: ['email-operational-messages', threadId],
                });
            })
            .catch((err) => {
                console.warn('[BODY_FETCH_TRIGGER]', err);
                // Remove from set so it can retry next time
                fetchedBodiesRef.current.delete(threadId);
            });
    }, [threadId, query.data?.messages, queryClient]);

    return query;
}

