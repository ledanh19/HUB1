/**
 * usePushSubscription Hook
 * 
 * Automatically subscribes user to push notifications when logged in.
 * Uses the PWA registration utilities.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { 
  isPushSupported, 
  setupPushNotifications,
  getCurrentPushSubscription,
  getRegistrationStatus,
} from '@/pwa/registerSW';

export function usePushSubscription() {
  const { user } = useAuth();
  const hasSubscribed = useRef(false);

  useEffect(() => {
    // Only run once per user session
    if (!user || hasSubscribed.current) {
      return;
    }

    // Check if push is supported
    if (!isPushSupported()) {
      console.log('[Push] Push notifications not supported');
      return;
    }

    const trySubscribe = async () => {
      try {
        // Check current status first
        const status = await getRegistrationStatus();
        
        // If already subscribed, no need to do anything
        if (status.subscribed) {
          console.log('[Push] Already subscribed to push notifications');
          hasSubscribed.current = true;
          return;
        }

        // If permission already denied, don't try again
        if (status.permission === 'denied') {
          console.log('[Push] Notification permission denied by user');
          return;
        }

        // Auto-request permission and subscribe
        // On PWA (installed to home screen), prompt immediately after login
        if (status.permission === 'granted' || status.permission === 'default') {
          if (status.permission === 'default') {
            console.log('[Push] Requesting notification permission...');
          } else {
            console.log('[Push] Permission granted, auto-subscribing...');
          }
          
          const result = await setupPushNotifications();
          
          if (result.success) {
            console.log('[Push] Successfully subscribed to push notifications');
            hasSubscribed.current = true;
          } else {
            console.warn('[Push] Subscription failed:', result.error);
          }
        } else {
          console.log('[Push] Permission denied, user must re-enable in browser settings');
        }
      } catch (error) {
        console.error('[Push] Error during subscription:', error);
      }
    };

    // Delay subscription attempt to not block initial render
    const timeoutId = setTimeout(trySubscribe, 2000);

    return () => clearTimeout(timeoutId);
  }, [user]);

  // Reset when user logs out
  useEffect(() => {
    if (!user) {
      hasSubscribed.current = false;
    }
  }, [user]);
}
