/**
 * useEmailRealtimeOperational
 * 
 * Supabase Realtime subscription for Email operational inbox.
 * Subscribes to V2 unified tables:
 * - email_threads (content + operational changes)
 * - email_messages (new messages)
 * 
 * Features:
 * - Debounced invalidation (300ms) to prevent UI flicker
 * - Auto cleanup on unmount
 * - Focused thread_id filtering for message updates
 */
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseEmailRealtimeOptions {
    /** Currently viewed thread ID — enables message-level realtime */
    activeThreadId?: string | null;
    /** Whether realtime is enabled (default: true) */
    enabled?: boolean;
}

export function useEmailRealtimeOperational(options: UseEmailRealtimeOptions = {}) {
    const { activeThreadId = null, enabled = true } = options;
    const queryClient = useQueryClient();

    // Debounce refs
    const threadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const messageDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);

    const invalidateThreadQueries = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['email-operational-threads'] });
        queryClient.invalidateQueries({ queryKey: ['email-operational-analytics'] });
    }, [queryClient]);

    const invalidateMessageQueries = useCallback((threadId?: string) => {
        if (threadId) {
            queryClient.invalidateQueries({
                queryKey: ['email-operational-messages', threadId],
                exact: false,
            });
        }
        queryClient.invalidateQueries({
            predicate: (query) => (query.queryKey[0] as string) === 'email-operational-messages',
        });
    }, [queryClient]);

    useEffect(() => {
        if (!enabled) return;

        const channel = supabase.channel('email-realtime-operational');

        // ── email_threads: INSERT/UPDATE (sync + operational changes) ──
        channel.on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'email_threads',
            },
            (_payload) => {
                if (threadDebounceRef.current) clearTimeout(threadDebounceRef.current);
                threadDebounceRef.current = setTimeout(() => {
                    invalidateThreadQueries();
                    threadDebounceRef.current = null;
                }, 300);
            }
        );

        // ── email_messages: INSERT/UPDATE (new synced messages + body updates) ──
        channel.on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'email_messages',
            },
            (payload) => {
                const newMsg = payload.new as { thread_id?: string } | undefined;
                const msgThreadId = newMsg?.thread_id;

                if (messageDebounceRef.current) clearTimeout(messageDebounceRef.current);
                messageDebounceRef.current = setTimeout(() => {
                    invalidateThreadQueries();
                    if (msgThreadId) {
                        invalidateMessageQueries(msgThreadId);
                    }
                    messageDebounceRef.current = null;
                }, 300);
            }
        );

        channel.subscribe();

        channelRef.current = channel;

        return () => {
            if (threadDebounceRef.current) clearTimeout(threadDebounceRef.current);
            if (messageDebounceRef.current) clearTimeout(messageDebounceRef.current);
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [enabled, invalidateThreadQueries, invalidateMessageQueries]);

    // ── Active thread message-specific subscription ──
    useEffect(() => {
        if (!activeThreadId || !enabled) return;
        invalidateMessageQueries(activeThreadId);
    }, [activeThreadId, enabled, invalidateMessageQueries]);
}
