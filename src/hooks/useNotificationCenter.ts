/**
 * USE NOTIFICATION CENTER HOOK
 *
 * Comprehensive notification management hook that handles:
 * 1. Realtime event notifications (foreground)
 * 2. Push notification subscription management
 * 3. Notification list with reconciliation
 * 4. Deep link navigation from SW clicks
 * 5. iOS PWA installation guidance
 *
 * Designed to work alongside existing NotificationBell component
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppNavigate } from '@/lib/navigation/useAppNavigate';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "sonner";
import { realtimeManager } from '@/lib/realtimeManager';
import {
  isPushSupported,
  isInstalledPWA,
  isIOSSafari,
  getRegistrationStatus,
  setupPushNotifications,
  disablePushNotifications,
  setupServiceWorkerMessageHandler,
  type RegistrationStatus,
} from '@/pwa/registerSW';

// ============================================
// TYPES
// ============================================

export type NotificationEventType =
  | 'BOOKING_NEW'
  | 'BOOKING_MODIFIED'
  | 'BOOKING_CANCELLED'
  | 'MESSAGE_INBOUND';

export interface NotificationItem {
  id: string;
  event_type: NotificationEventType;
  title: string;
  body: string;
  entity_id: string;
  deep_link: string;
  created_at: string;
  read: boolean;
  source: 'realtime' | 'push' | 'polling';
}

export interface NotificationCenterState {
  // Push notification status
  pushSupported: boolean;
  pushEnabled: boolean;
  pushPermission: NotificationPermission | 'unsupported';
  isInstalledPWA: boolean;
  isIOSSafari: boolean;

  // Notification list
  notifications: NotificationItem[];
  unreadCount: number;

  // Loading states
  isEnablingPush: boolean;
  isLoadingNotifications: boolean;

  // Error state
  error: string | null;
}

export interface NotificationCenterActions {
  enablePush: () => Promise<boolean>;
  disablePush: () => Promise<boolean>;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  navigateToEntity: (notification: NotificationItem) => void;
  refreshStatus: () => Promise<void>;
}

// ============================================
// CONSTANTS
// ============================================

const MAX_NOTIFICATIONS = 50;
const NS = 'rrch:v1';

/**
 * Safely parse a lastReadAt string into a numeric timestamp.
 */
function parseLastReadAt(v: string | null | undefined): number {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Migrate a legacy localStorage key to the new namespaced key.
 */
function migrateLegacyKey(oldKey: string, newKey: string): void {
  const oldVal = localStorage.getItem(oldKey);
  if (oldVal !== null && localStorage.getItem(newKey) === null) {
    localStorage.setItem(newKey, oldVal);
  }
  localStorage.removeItem(oldKey);
}

// Per-user namespaced localStorage key helpers
function getStorageKey(userId: string | null): string {
  return `${NS}:pwa_notifications:${userId ?? 'anon'}`;
}
function getLastReadKey(userId: string | null): string {
  return `${NS}:pwa_notifications_last_read:${userId ?? 'anon'}`;
}

// Event type configuration
const EVENT_CONFIG: Record<
  NotificationEventType,
  { title: string; icon: string; color: string }
> = {
  BOOKING_NEW: {
    title: 'Đặt phòng mới',
    icon: '🆕',
    color: 'green',
  },
  BOOKING_MODIFIED: {
    title: 'Đặt phòng thay đổi',
    icon: '✏️',
    color: 'blue',
  },
  BOOKING_CANCELLED: {
    title: 'Đặt phòng hủy',
    icon: '❌',
    color: 'red',
  },
  MESSAGE_INBOUND: {
    title: 'Tin nhắn mới',
    icon: '💬',
    color: 'purple',
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build deep link from event type and entity
 */
function buildDeepLink(eventType: NotificationEventType, entityId: string): string {
  switch (eventType) {
    case 'BOOKING_NEW':
    case 'BOOKING_MODIFIED':
    case 'BOOKING_CANCELLED':
      return `/bookings?highlight=${entityId}`;
    case 'MESSAGE_INBOUND':
      return `/messages?conversation=${entityId}`;
    default:
      return '/';
  }
}

/**
 * Load notifications from localStorage (per-user)
 */
function loadStoredNotifications(userId: string | null): NotificationItem[] {
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[NotificationCenter] Failed to load stored notifications:', e);
  }
  return [];
}

/**
 * Save notifications to localStorage (per-user)
 */
function saveNotificationsForUser(userId: string | null, notifications: NotificationItem[]): void {
  if (!userId) return; // Never write anon keys
  try {
    // Keep only the most recent MAX_NOTIFICATIONS
    const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(trimmed));
  } catch (e) {
    console.error('[NotificationCenter] Failed to save notifications:', e);
  }
}

/**
 * Get last read timestamp (per-user)
 */
function getLastReadAtForUser(userId: string | null): string {
  return localStorage.getItem(getLastReadKey(userId)) || new Date(0).toISOString();
}

/**
 * Set last read timestamp (per-user)
 */
function setLastReadAtForUser(userId: string | null, timestamp: string): void {
  if (!userId) return; // Never write anon keys
  localStorage.setItem(getLastReadKey(userId), timestamp);
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useNotificationCenter(): NotificationCenterState & NotificationCenterActions {
  const { user } = useAuth();
  const { appNavigate } = useAppNavigate();
  const userId = user?.id ?? null;

  // State
  const [state, setState] = useState<NotificationCenterState>({
    pushSupported: isPushSupported(),
    pushEnabled: false,
    pushPermission: 'default',
    isInstalledPWA: isInstalledPWA(),
    isIOSSafari: isIOSSafari(),
    notifications: loadStoredNotifications(userId),
    unreadCount: 0,
    isEnablingPush: false,
    isLoadingNotifications: false,
    error: null,
  });

  // Refs for cleanup
  const swMessageCleanup = useRef<(() => void) | null>(null);

  // ============================================
  // RELOAD ON USER CHANGE (per-user isolation)
  // ============================================
  useEffect(() => {
    if (userId) {
      // Migrate R1/R2 legacy keys -> v1 namespaced keys (one-time, idempotent)
      migrateLegacyKey(`roomrise_notifications_${userId}`, getStorageKey(userId));
      migrateLegacyKey(`roomrise_notifications_last_read_${userId}`, getLastReadKey(userId));
      // Clean up shared/anon legacy keys
      localStorage.removeItem('roomrise_notifications');
      localStorage.removeItem('roomrise_notifications_last_read');
      localStorage.removeItem('roomrise_notifications_anon');
      localStorage.removeItem('roomrise_notifications_last_read_anon');

      // Load from namespaced keys
      const loaded = loadStoredNotifications(userId);
      const lastReadTs = parseLastReadAt(localStorage.getItem(getLastReadKey(userId)));
      const unread = loaded.filter(
        (n) => !n.read && new Date(n.created_at).getTime() > lastReadTs
      ).length;
      setState((prev) => ({
        ...prev,
        notifications: loaded,
        unreadCount: unread,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        notifications: [],
        unreadCount: 0,
      }));
    }
  }, [userId]);

  // ============================================
  // CALCULATE UNREAD COUNT
  // ============================================
  useEffect(() => {
    const lastReadTs = parseLastReadAt(localStorage.getItem(getLastReadKey(userId)));
    const unread = state.notifications.filter(
      (n) => !n.read && new Date(n.created_at).getTime() > lastReadTs
    ).length;

    if (unread !== state.unreadCount) {
      setState((prev) => ({ ...prev, unreadCount: unread }));
    }
  }, [state.notifications]);

  // ============================================
  // CHECK PUSH STATUS ON MOUNT
  // ============================================
  useEffect(() => {
    if (!user) return;

    const checkStatus = async () => {
      const status = await getRegistrationStatus();
      setState((prev) => ({
        ...prev,
        pushSupported: status.supported,
        pushEnabled: status.subscribed,
        pushPermission: status.permission,
        isInstalledPWA: isInstalledPWA(),
      }));
    };

    checkStatus();
  }, [user]);

  // ============================================
  // SETUP SW MESSAGE HANDLER (for deep links)
  // ============================================
  useEffect(() => {
    if (!user) return;

    const cleanup = setupServiceWorkerMessageHandler((data) => {
      console.log('[NotificationCenter] SW click received:', data);

      if (data.url) {
        // Navigate to the deep link
        appNavigate(data.url);

        // Show toast
        toast.info("Thông báo", { description: "Đang mở chi tiết..." });
      }
    });

    swMessageCleanup.current = cleanup;

    return () => {
      if (swMessageCleanup.current) {
        swMessageCleanup.current();
      }
    };
  }, [user, appNavigate, toast]);

  // ============================================
  // ACTIONS (moved before realtime effect to avoid TDZ)
  // ============================================

  const addNotification = useCallback((notification: NotificationItem) => {
    setState((prev) => {
      // Check for duplicate
      if (prev.notifications.some((n) => n.id === notification.id)) {
        return prev;
      }

      const newNotifications = [notification, ...prev.notifications].slice(
        0,
        MAX_NOTIFICATIONS
      );

      // Save to per-user localStorage
      saveNotificationsForUser(userId, newNotifications);

      return {
        ...prev,
        notifications: newNotifications,
      };
    });
  }, [userId]);

  // ============================================
  // REALTIME SUBSCRIPTION — via centralized realtimeManager
  // Avoids duplicate channels (NotificationBell also uses realtimeManager).
  // ============================================
  useEffect(() => {
    if (!userId) return; // Gate on userId, not just user object

    // Subscribe to booking_changes via centralized manager
    const unsubBookings = realtimeManager.subscribe(
      'booking_changes',
      (event) => {
        const change = event.payload.new as {
          id: string;
          change_type: string;
          unified_booking_id: string;
          after_data: Record<string, unknown>;
          created_at: string;
        };

        let eventType: NotificationEventType;
        const changeType = change.change_type?.toUpperCase();
        const afterStatus = (change.after_data?.booking_status as string)?.toUpperCase();

        if (changeType === 'INSERT') {
          eventType = 'BOOKING_NEW';
        } else if (afterStatus === 'CANCELLED' || afterStatus === 'CANCELED') {
          eventType = 'BOOKING_CANCELLED';
        } else {
          eventType = 'BOOKING_MODIFIED';
        }

        const guestName = (change.after_data?.guest_name as string) || '';
        const shortBookingId = change.unified_booking_id?.substring(0, 8) || 'N/A';
        const notificationBody = guestName
          ? `${guestName} - #${shortBookingId}`
          : `Booking #${shortBookingId}`;

        const notification: NotificationItem = {
          id: change.id,
          event_type: eventType,
          title: EVENT_CONFIG[eventType].title,
          body: notificationBody,
          entity_id: change.unified_booking_id,
          deep_link: buildDeepLink(eventType, change.unified_booking_id),
          created_at: change.created_at,
          read: false,
          source: 'realtime',
        };

        console.log('[NotificationCenter] Booking event via realtimeManager:', {
          changeType,
          afterStatus,
          eventType,
          id: change.id,
        });

        addNotification(notification);
      },
      { eventTypes: ['INSERT'] },
    );

    // Subscribe to messages via centralized manager
    const unsubMessages = realtimeManager.subscribe(
      'messages',
      (event) => {
        const message = event.payload.new as {
          id: string;
          conversation_id: string;
          content: string;
          created_at: string;
        };

        const notification: NotificationItem = {
          id: message.id,
          event_type: 'MESSAGE_INBOUND',
          title: EVENT_CONFIG.MESSAGE_INBOUND.title,
          body: message.content?.substring(0, 100) || 'Tin nhắn mới',
          entity_id: message.conversation_id,
          deep_link: buildDeepLink('MESSAGE_INBOUND', message.conversation_id),
          created_at: message.created_at,
          read: false,
          source: 'realtime',
        };

        addNotification(notification);
      },
      { filter: 'direction=eq.INBOUND', eventTypes: ['INSERT'] },
    );

    return () => {
      unsubBookings();
      unsubMessages();
    };
  }, [userId, addNotification]);

  // ============================================
  // VISIBILITY / ONLINE: Refresh in-memory list on resume
  // ============================================
  useEffect(() => {
    if (!userId) return;

    const refreshFromStorage = () => {
      const loaded = loadStoredNotifications(userId);
      const lastReadTs = parseLastReadAt(localStorage.getItem(getLastReadKey(userId)));
      const unread = loaded.filter(
        (n) => !n.read && new Date(n.created_at).getTime() > lastReadTs
      ).length;
      setState((prev) => ({
        ...prev,
        notifications: loaded,
        unreadCount: unread,
      }));
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshFromStorage();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', refreshFromStorage);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', refreshFromStorage);
    };
  }, [userId]);

  const enablePush = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isEnablingPush: true, error: null }));

    try {
      const result = await setupPushNotifications();

      setState((prev) => ({
        ...prev,
        isEnablingPush: false,
        pushEnabled: result.success,
        pushPermission: result.status.permission,
        error: result.error || null,
      }));

      if (result.success) {
        toast.success("Thông báo đẩy đã bật", { description: "Bạn sẽ nhận thông báo khi có đặt phòng mới hoặc tin nhắn." });
      } else {
        toast.error("Không thể bật thông báo", { description: result.error || "Vui lòng thử lại." });
      }

      return result.success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState((prev) => ({
        ...prev,
        isEnablingPush: false,
        error: errorMessage,
      }));
      return false;
    }
  }, []);

  const disablePush = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isEnablingPush: true }));

    try {
      const success = await disablePushNotifications();

      setState((prev) => ({
        ...prev,
        isEnablingPush: false,
        pushEnabled: !success,
      }));

      if (success) {
        toast.info("Thông báo đẩy đã tắt", { description: "Bạn sẽ không còn nhận thông báo đẩy." });
      }

      return success;
    } catch (error) {
      setState((prev) => ({ ...prev, isEnablingPush: false }));
      return false;
    }
  }, []);

  const markAsRead = useCallback((id: string) => {
    setState((prev) => {
      const newNotifications = prev.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      saveNotificationsForUser(userId, newNotifications);
      return { ...prev, notifications: newNotifications };
    });
  }, [userId]);

  const markAllAsRead = useCallback(() => {
    const now = new Date().toISOString();
    setLastReadAtForUser(userId, now);

    setState((prev) => {
      const newNotifications = prev.notifications.map((n) => ({
        ...n,
        read: true,
      }));
      saveNotificationsForUser(userId, newNotifications);
      return { ...prev, notifications: newNotifications, unreadCount: 0 };
    });
  }, [userId]);

  const clearNotification = useCallback((id: string) => {
    setState((prev) => {
      const newNotifications = prev.notifications.filter((n) => n.id !== id);
      saveNotificationsForUser(userId, newNotifications);
      return { ...prev, notifications: newNotifications };
    });
  }, [userId]);

  const navigateToEntity = useCallback(
    (notification: NotificationItem) => {
      markAsRead(notification.id);
      appNavigate(notification.deep_link);
    },
    [markAsRead, appNavigate]
  );

  const refreshStatus = useCallback(async () => {
    const status = await getRegistrationStatus();
    setState((prev) => ({
      ...prev,
      pushSupported: status.supported,
      pushEnabled: status.subscribed,
      pushPermission: status.permission,
      isInstalledPWA: isInstalledPWA(),
    }));
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    ...state,
    enablePush,
    disablePush,
    markAsRead,
    markAllAsRead,
    clearNotification,
    navigateToEntity,
    refreshStatus,
  };
}

export default useNotificationCenter;

