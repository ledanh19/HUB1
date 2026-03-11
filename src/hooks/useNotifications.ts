/**
 * useNotifications — Hook to fetch and manage unified notifications
 * 
 * Reads from the `notifications` table (unified event layer).
 * Per-user read state stored in `notification_read_states` table.
 * 
 * Does NOT replace booking notification flow — booking still reads booking_changes directly.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeSubscription } from '@/lib/realtimeManager';
import { useCallback } from 'react';

export interface NotificationRow {
  id: string;
  tenant_id: string;
  source_module: 'BOOKING' | 'EMAIL' | 'MESSAGE';
  event_type: string;
  dedupe_key: string;
  title: string;
  body: string | null;
  icon: string | null;
  deep_link: string;
  source_table: string | null;
  source_record_id: string | null;
  metadata: Record<string, unknown> | null;
  priority: string;
  read_at: string | null; // Deprecated: use per-user read state
  is_archived: boolean;
  created_at: string;
  // Joined per-user read state
  user_read_at?: string | null;
}

const NOTIFICATIONS_QUERY_KEY = 'unified-notifications';
const NOTIFICATION_WINDOW_DAYS = 14;

export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  // Fetch recent notifications with per-user read state
  const query = useQuery({
    queryKey: [NOTIFICATIONS_QUERY_KEY, userId],
    enabled: !!userId,
    queryFn: async () => {
      const since = new Date(Date.now() - NOTIFICATION_WINDOW_DAYS * 86400000).toISOString();
      
      // Fetch notifications
      const { data: notifications, error: notifErr } = await supabase
        .from('notifications')
        .select('*')
        .gte('created_at', since)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(100);

      if (notifErr) throw notifErr;
      const notifs = (notifications ?? []) as NotificationRow[];
      if (notifs.length === 0) return [];

      // Fetch per-user read states for these notifications
      const notifIds = notifs.map(n => n.id);
      const { data: readStates, error: readErr } = await supabase
        .from('notification_read_states')
        .select('notification_id, read_at')
        .in('notification_id', notifIds);

      if (readErr) {
        console.warn('[useNotifications] Read states fetch error:', readErr.message);
        // Graceful fallback: treat all as unread
        return notifs.map(n => ({ ...n, user_read_at: null }));
      }

      // Build read state map
      const readMap = new Map<string, string>();
      (readStates ?? []).forEach((rs: any) => {
        readMap.set(rs.notification_id, rs.read_at);
      });

      // Merge read state into notifications
      return notifs.map(n => ({
        ...n,
        user_read_at: readMap.get(n.id) ?? null,
      }));
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  // Realtime subscription for new notifications
  const handleRealtimeEvent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY_KEY, userId] });
  }, [queryClient, userId]);

  useRealtimeSubscription('notifications', handleRealtimeEvent, {
    eventTypes: ['INSERT'],
    enabled: !!userId,
  });

  // Mark single notification as read (per-user)
  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!userId) throw new Error('No user');
      // INSERT ON CONFLICT DO NOTHING — idempotent
      const { error } = await supabase
        .from('notification_read_states')
        .upsert(
          { notification_id: notificationId, user_id: userId, read_at: new Date().toISOString() },
          { onConflict: 'notification_id,user_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY_KEY, userId] });
    },
  });

  // Mark all visible as read (per-user)
  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('No user');
      const notifs = query.data ?? [];
      const unreadNotifs = notifs.filter(n => !n.user_read_at);
      if (unreadNotifs.length === 0) return;

      // Batch insert read states
      const readStates = unreadNotifs.map(n => ({
        notification_id: n.id,
        user_id: userId,
        read_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('notification_read_states')
        .upsert(readStates, { onConflict: 'notification_id,user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY_KEY, userId] });
    },
  });

  const notifications = query.data ?? [];
  const emailNotifications = notifications.filter(n => n.source_module === 'EMAIL');
  const unreadEmailCount = emailNotifications.filter(n => !n.user_read_at).length;

  return {
    notifications,
    emailNotifications,
    unreadEmailCount,
    isLoading: query.isLoading,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
  };
}
