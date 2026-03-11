/**
 * FOREGROUND PUSH NOTIFICATION HANDLER
 * 
 * Handles push notifications when app is in foreground (visible).
 * 
 * DESIGN DECISION (Option 1 - Requested by user):
 * - Foreground = System notification ONLY, toast DISABLED by default
 * - This avoids "double UI" (system notification + toast showing same content)
 * - User will always see system notification from sw.js showNotification()
 * 
 * If toast is needed in future, set ENABLE_FOREGROUND_TOAST = true
 * Toast will use shared renderer for 100% UI consistency.
 */

import { useEffect, useCallback } from 'react';
import { useAppNavigate } from '@/lib/navigation/useAppNavigate';
import { toast } from "sonner";
import {
  EVENT_CONFIG,
  type NotificationEventType,
} from '@/modules/notifications/renderNotification';

// ============================================
// CONFIGURATION
// ============================================

/**
 * Set to true to enable toast in addition to system notification
 * Default: false (system notification only)
 */
const ENABLE_FOREGROUND_TOAST = false;

// ============================================
// TYPES
// ============================================

interface PushPayload {
  type: 'PUSH_RECEIVED' | 'NOTIFICATION_CLICK';
  payload: {
    title: string;
    body: string;
    event_type?: string;
    deep_link?: string;
    entity_id?: string;
    guest_name?: string;
    ota_source?: string;
    check_in_date?: string;
    nights?: number;
    total_amount?: number;
    _pre_rendered?: boolean;
    [key: string]: unknown;
  };
}

// ============================================
// HOOK
// ============================================

export function useForegroundPush() {
  const { appNavigate } = useAppNavigate();

  // Handle push received in foreground
  const handlePushReceived = useCallback((payload: PushPayload['payload']) => {
    const eventType = (payload.event_type || 'PUSH_TEST') as NotificationEventType;
    const isPreRendered = payload._pre_rendered === true;

    console.log('[ForegroundPush] Received:', {
      eventType,
      title: payload.title,
      body: payload.body,
      isPreRendered,
      toastEnabled: ENABLE_FOREGROUND_TOAST,
    });

    // OPTION 1: Toast disabled by default to avoid double UI
    // System notification from sw.js is already showing
    if (!ENABLE_FOREGROUND_TOAST) {
      console.log('[ForegroundPush] Toast disabled - system notification will show from sw.js');

      // Still dispatch event for query invalidation
      window.dispatchEvent(new CustomEvent('push-notification-received', {
        detail: payload
      }));
      return;
    }

    // If toast is enabled, use shared renderer config for consistency
    const config = EVENT_CONFIG[eventType] || EVENT_CONFIG.PUSH_TEST;

    // Show toast notification using PRE-RENDERED title/body from webhook
    // This ensures 100% consistency with system notification
    if (eventType === 'BOOKING_CANCELLED') {
      toast.error(payload.title, { description: payload.body });
    } else {
      toast.info(payload.title, { description: payload.body });
    }

    // If there's a deep link, navigate after a short delay to let user see the toast
    if (payload.deep_link && eventType === 'BOOKING_NEW') {
      // Only auto-navigate for new bookings (most important)
      setTimeout(() => {
        appNavigate(payload.deep_link!);
      }, 2000);
    }

    // Also invalidate relevant queries to refresh data
    // This ensures the NotificationBell picks up the new data immediately
    window.dispatchEvent(new CustomEvent('push-notification-received', {
      detail: payload
    }));
  }, [appNavigate]);

  // Handle notification click (from SW postMessage)
  const handleNotificationClick = useCallback((payload: PushPayload['payload']) => {
    console.log('[ForegroundPush] Click received:', payload);

    if (payload.url || payload.deep_link) {
      const url = payload.url as string || payload.deep_link;
      appNavigate(url);
    }
  }, [appNavigate]);

  // Listen for Service Worker messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const data = event.data as PushPayload;

      if (!data || !data.type) {
        return;
      }

      console.log('[ForegroundPush] SW message:', data.type);

      switch (data.type) {
        case 'PUSH_RECEIVED':
          handlePushReceived(data.payload);
          break;
        case 'NOTIFICATION_CLICK':
          handleNotificationClick(data.payload);
          break;
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [handlePushReceived, handleNotificationClick]);

  return {
    // Export for manual testing
    showTestToast: (eventType: string, body: string) => {
      handlePushReceived({
        title: 'Test',
        body,
        event_type: eventType,
      });
    },
  };
}

export default useForegroundPush;
