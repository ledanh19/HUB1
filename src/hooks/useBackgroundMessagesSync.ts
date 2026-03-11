import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const SYNC_INTERVAL_MS = 60000; // 60 seconds background sync
const INITIAL_SYNC_DELAY_MS = 2000; // Wait 2s after mount for initial sync
const MAX_BACKOFF_MS = 5 * 60 * 1000; // Max 5 min between retries on failure

/**
 * Background sync hook for OTA messages
 * Runs at app level to keep messages synced even when not on the messages page
 * This ensures users always see the latest messages when they navigate to OTA Messages
 * 
 * Two mechanisms:
 * 1. Periodic polling every 60s (fallback if webhook fails)
 * 2. Realtime subscription to conversations table (instant updates when webhook works)
 * 
 * Error handling:
 * - Uses exponential backoff on consecutive Edge Function failures
 * - Suppresses noisy console errors after first failure to avoid spam
 */
export function useBackgroundMessagesSync() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const lastSyncRef = useRef<string | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const backoffTimerRef = useRef<NodeJS.Timeout | null>(null);

  const syncMessages = useCallback(async (silent = true) => {
    if (isSyncingRef.current) {
      return; // Skip silently — no need to log every skipped poll
    }

    isSyncingRef.current = true;

    try {
      // Only sync messages received after last sync to be faster
      const sinceDate = lastSyncRef.current
        ? new Date(new Date(lastSyncRef.current).getTime() - 60000).toISOString() // 1 min overlap for safety
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24 hours on first sync

      const { data, error } = await supabase.functions.invoke('channex-messages-sync', {
        body: {
          filters: {
            limit: 50,
            since: sinceDate,
          },
        },
      });

      if (error) {
        // Edge Function returned an error response (not a network error)
        consecutiveFailuresRef.current++;
        if (consecutiveFailuresRef.current <= 1) {
          console.warn('[BackgroundSync] Sync error:', error.message || error);
        }
        // Schedule retry with backoff instead of waiting for next interval
        scheduleBackoffRetry();
        return;
      }

      // Success — reset failure counter
      consecutiveFailuresRef.current = 0;
      lastSyncRef.current = new Date().toISOString();

      // Invalidate queries to refresh UI if any new messages
      if (data?.messages_synced > 0) {
        console.log('[BackgroundSync] Synced', data.messages_synced, 'messages');
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['messages'] });
      }

    } catch (err: unknown) {
      // Network-level errors (FunctionsFetchError, CORS, etc.)
      consecutiveFailuresRef.current++;
      if (consecutiveFailuresRef.current <= 1) {
        // Only warn on first failure to avoid console spam every 60s
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('[BackgroundSync] Edge Function unreachable:', errMsg);
      }
      // Schedule retry with backoff
      scheduleBackoffRetry();
    } finally {
      isSyncingRef.current = false;
    }
  }, [queryClient]);

  // Schedule a one-off retry with exponential backoff
  const scheduleBackoffRetry = useCallback(() => {
    // Clear any existing backoff timer
    if (backoffTimerRef.current) {
      clearTimeout(backoffTimerRef.current);
    }
    const delay = Math.min(
      SYNC_INTERVAL_MS * Math.pow(2, consecutiveFailuresRef.current - 1),
      MAX_BACKOFF_MS
    );
    backoffTimerRef.current = setTimeout(() => {
      syncMessages(true);
    }, delay);
  }, [syncMessages]);

  // Realtime subscription for instant updates when webhook pushes new messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('global-conversations')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          // Invalidate queries to refresh UI immediately
          queryClient.invalidateQueries({ queryKey: ['conversations'] });

          // If it's a conversation update (new message), also invalidate messages
          if (payload.eventType === 'UPDATE' && payload.new) {
            const conv = payload.new as { id: string; unread_count?: number };
            if (conv.unread_count && conv.unread_count > 0) {
              queryClient.invalidateQueries({ queryKey: ['messages', conv.id] });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const msg = payload.new as { conversation_id: string };
          queryClient.invalidateQueries({ queryKey: ['messages', msg.conversation_id] });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  useEffect(() => {
    // Only run for authenticated users
    if (!user) {
      return;
    }

    // Initial sync after short delay (let the app settle)
    const initialTimeout = setTimeout(() => {
      syncMessages(true);
    }, INITIAL_SYNC_DELAY_MS);

    // Set up periodic sync
    intervalRef.current = setInterval(() => {
      // Skip periodic sync if we're in backoff mode (consecutive failures)
      if (consecutiveFailuresRef.current > 0) return;
      syncMessages(true);
    }, SYNC_INTERVAL_MS);

    // Cleanup
    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (backoffTimerRef.current) {
        clearTimeout(backoffTimerRef.current);
        backoffTimerRef.current = null;
      }
    };
  }, [user, syncMessages]);

  // Also sync on tab visibility change (when user comes back to tab)
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Reset failure counter on tab focus — user is actively looking, give it a fresh try
        consecutiveFailuresRef.current = 0;
        syncMessages(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, syncMessages]);

  return { syncMessages };
}
