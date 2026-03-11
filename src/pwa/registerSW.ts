// @ts-ignore - pushManager is available in browsers that support Push API
declare global {
  interface ServiceWorkerRegistration {
    pushManager: any;
  }
}

/**
 * PWA SERVICE WORKER REGISTRATION
 * 
 * Handles:
 * 1. Service Worker registration
 * 2. Push subscription management
 * 3. VAPID key conversion
 * 4. Subscription sync with backend
 * 5. ANTI-LOOP GUARDRAILS for resubscribe
 */

import { supabase } from '@/integrations/supabase/client';
import {
  canPerformResubscribe,
  recordResubscribeAttempt,
  recordResubscribeSuccess,
  recordResubscribeFailure,
  getAntiLoopState,
  type PushResponseFlags,
  type ResubscribeCheckResult,
} from './pushAntiLoop';

// ============================================
// TYPES
// ============================================

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface RegistrationStatus {
  supported: boolean;
  registered: boolean;
  subscribed: boolean;
  permission: NotificationPermission | 'unsupported';
  subscription?: PushSubscription | null;
  error?: string;
}

// VAPID key info from backend
export interface VapidKeyInfo {
  publicKey: string;
  fingerprint: string;
  version: string;
  subject: string;
  configured: boolean;
  validated?: boolean;
  error?: string;
}

// Re-export anti-loop types for consumers
export type { PushResponseFlags, ResubscribeCheckResult };
export { canPerformResubscribe, getAntiLoopState };

// ============================================
// CONFIGURATION
// ============================================

// VAPID public key - fetched from backend
let cachedVapidKey: string | null = null;
let cachedVapidInfo: VapidKeyInfo | null = null;

/**
 * Clear cached VAPID key (for re-fetching after key update)
 */
export function clearVapidKeyCache(): void {
  cachedVapidKey = null;
  cachedVapidInfo = null;
  console.log('[PWA] VAPID key cache cleared');
}

/**
 * Fetch VAPID public key info from backend
 */
export async function getVapidKeyInfo(): Promise<VapidKeyInfo | null> {
  try {
    const { data, error } = await supabase.functions.invoke('vapid-public-key');
    
    if (error) {
      console.error('[PWA] Failed to fetch VAPID info:', error);
      return null;
    }

    if (data?.publicKey) {
      cachedVapidInfo = data as VapidKeyInfo;
      cachedVapidKey = data.publicKey;
      console.log('[PWA] VAPID info fetched:', {
        fingerprint: data.fingerprint,
        version: data.version,
        validated: data.validated,
        keyLength: data.publicKey.length,
      });
      return cachedVapidInfo;
    }

    // Return error info if available
    if (data?.error) {
      console.error('[PWA] VAPID error from backend:', data.error, data.details);
      return {
        publicKey: '',
        fingerprint: '',
        version: '',
        subject: '',
        configured: false,
        error: data.details || data.error,
      };
    }

    console.error('[PWA] No VAPID key in response');
    return null;
  } catch (error) {
    console.error('[PWA] Error fetching VAPID info:', error);
    return null;
  }
}

/**
 * Fetch VAPID public key from backend
 */
async function getVapidPublicKey(): Promise<string | null> {
  if (cachedVapidKey) {
    return cachedVapidKey;
  }

  const info = await getVapidKeyInfo();
  return info?.publicKey || null;
}

// Initialize VAPID key fetch
getVapidPublicKey().then(key => {
  console.log('[PWA] VAPID config status:', {
    hasKey: !!key,
    keyLength: key?.length || 0,
    keyPreview: key ? `${key.substring(0, 10)}...` : 'NOT_SET',
  });
});

// SW path
const SW_PATH = '/sw.js';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert URL-safe base64 to Uint8Array (required for VAPID)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Check if running as installed PWA
 */
export function isInstalledPWA(): boolean {
  // Check display-mode media query
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  // iOS Safari standalone mode
  if ((navigator as any).standalone === true) {
    return true;
  }
  // Check URL param (set in manifest start_url)
  if (window.location.search.includes('source=pwa')) {
    return true;
  }
  return false;
}

/**
 * Detect iOS Safari
 */
export function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[PWA] Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, {
      scope: '/',
    });

    console.log('[PWA] Service Worker registered:', registration.scope);
    swRegistration = registration;

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW available, trigger update notification
            console.log('[PWA] New Service Worker available');
            window.dispatchEvent(new CustomEvent('sw-update-available'));
          }
        });
      }
    });

    return registration;
  } catch (error) {
    console.error('[PWA] Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Get current SW registration
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) {
    return swRegistration;
  }

  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    swRegistration = registration;
    return registration;
  } catch (error) {
    console.error('[PWA] Failed to get SW registration:', error);
    return null;
  }
}

// ============================================
// PUSH SUBSCRIPTION MANAGEMENT
// ============================================

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  // Request permission
  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const vapidKey = await getVapidPublicKey();
  
  if (!vapidKey) {
    console.error('[PWA] VAPID_PUBLIC_KEY not configured');
    return null;
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    console.error('[PWA] No SW registration available');
    return null;
  }

  try {
    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Create new subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });
      console.log('[PWA] Push subscription created:', subscription.endpoint);
    } else {
      console.log('[PWA] Existing push subscription found');
    }

    return subscription;
  } catch (error) {
    console.error('[PWA] Push subscription failed:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return false;
  }

  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('[PWA] Push subscription removed');
      return true;
    }
    return false;
  } catch (error) {
    console.error('[PWA] Unsubscribe failed:', error);
    return false;
  }
}

/**
 * Get current push subscription
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await getServiceWorkerRegistration();
  if (!registration) {
    return null;
  }

  try {
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('[PWA] Failed to get subscription:', error);
    return null;
  }
}

// ============================================
// BACKEND SYNC
// ============================================

/**
 * Save push subscription to backend
 */
export async function savePushSubscriptionToBackend(
  subscription: PushSubscription
): Promise<boolean> {
  const subscriptionJson = subscription.toJSON() as PushSubscriptionJSON;

  if (!subscriptionJson.keys?.p256dh || !subscriptionJson.keys?.auth) {
    console.error('[PWA] Invalid subscription keys');
    return false;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('[PWA] No authenticated user');
      return false;
    }

    // Call the push-subscribe Edge Function
    const { data, error } = await supabase.functions.invoke('push-subscribe', {
      body: {
        action: 'subscribe',
        endpoint: subscriptionJson.endpoint,
        p256dh: subscriptionJson.keys.p256dh,
        auth: subscriptionJson.keys.auth,
        userAgent: navigator.userAgent,
      },
    });

    if (error) {
      console.error('[PWA] Failed to save subscription to backend:', error);
      return false;
    }

    console.log('[PWA] Subscription saved to backend:', data);
    return true;
  } catch (error) {
    console.error('[PWA] Backend sync error:', error);
    return false;
  }
}

/**
 * Remove push subscription from backend
 */
export async function removePushSubscriptionFromBackend(
  endpoint: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('push-subscribe', {
      body: {
        action: 'unsubscribe',
        endpoint,
      },
    });

    if (error) {
      console.error('[PWA] Failed to remove subscription from backend:', error);
      return false;
    }

    console.log('[PWA] Subscription removed from backend:', data);
    return true;
  } catch (error) {
    console.error('[PWA] Backend removal error:', error);
    return false;
  }
}

// ============================================
// FULL REGISTRATION FLOW
// ============================================

/**
 * Get current registration status
 */
export async function getRegistrationStatus(): Promise<RegistrationStatus> {
  if (!isPushSupported()) {
    return {
      supported: false,
      registered: false,
      subscribed: false,
      permission: 'unsupported',
    };
  }

  const registration = await getServiceWorkerRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;

  return {
    supported: true,
    registered: !!registration,
    subscribed: !!subscription,
    permission: Notification.permission,
    subscription,
  };
}

/**
 * Full push notification setup
 * 1. Register SW
 * 2. Request permission
 * 3. Subscribe to push
 * 4. Save to backend
 */
export async function setupPushNotifications(): Promise<{
  success: boolean;
  status: RegistrationStatus;
  error?: string;
}> {
  // Check support
  if (!isPushSupported()) {
    return {
      success: false,
      status: {
        supported: false,
        registered: false,
        subscribed: false,
        permission: 'unsupported',
      },
      error: 'Push notifications not supported in this browser',
    };
  }

  // Check VAPID key
  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    return {
      success: false,
      status: await getRegistrationStatus(),
      error: 'Push notifications not configured (missing VAPID key)',
    };
  }

  try {
    // 1. Register SW
    const registration = await registerServiceWorker();
    if (!registration) {
      return {
        success: false,
        status: await getRegistrationStatus(),
        error: 'Failed to register service worker',
      };
    }

    // 2. Request permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        status: await getRegistrationStatus(),
        error: permission === 'denied' 
          ? 'Notification permission denied' 
          : 'Notification permission not granted',
      };
    }

    // 3. Subscribe to push
    const subscription = await subscribeToPush();
    if (!subscription) {
      return {
        success: false,
        status: await getRegistrationStatus(),
        error: 'Failed to subscribe to push notifications',
      };
    }

    // 4. Save to backend
    const saved = await savePushSubscriptionToBackend(subscription);
    if (!saved) {
      return {
        success: false,
        status: await getRegistrationStatus(),
        error: 'Failed to save subscription to server',
      };
    }

    return {
      success: true,
      status: await getRegistrationStatus(),
    };
  } catch (error) {
    console.error('[PWA] Setup failed:', error);
    return {
      success: false,
      status: await getRegistrationStatus(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Disable push notifications
 * 1. Unsubscribe from push
 * 2. Remove from backend
 */
export async function disablePushNotifications(): Promise<boolean> {
  try {
    const subscription = await getCurrentPushSubscription();
    
    if (subscription) {
      // Remove from backend first
      await removePushSubscriptionFromBackend(subscription.endpoint);
      
      // Then unsubscribe locally
      await unsubscribeFromPush();
    }

    return true;
  } catch (error) {
    console.error('[PWA] Failed to disable push:', error);
    return false;
  }
}

// ============================================
// SMART RESUBSCRIBE WITH ANTI-LOOP
// ============================================

/**
 * Handle push response and potentially resubscribe
 * This is the main entry point for handling push errors from test-push or real push
 * 
 * @param response - Response from send-push or test-push API
 * @returns Result of the operation
 */
export async function handlePushResponseAndMaybeResubscribe(
  response: PushResponseFlags
): Promise<{
  action: 'none' | 'resubscribed' | 'cooldown' | 'error';
  message: string;
  newSubscription?: PushSubscription | null;
}> {
  console.log('[PWA] Handling push response:', response);
  
  // Check anti-loop guardrails
  const check = canPerformResubscribe(response);
  
  if (!check.canResubscribe) {
    console.log('[PWA] Resubscribe blocked:', check.reason);
    
    if (check.waitMs && check.waitMs > 0) {
      return {
        action: 'cooldown',
        message: `Vui lòng thử lại sau ${Math.ceil(check.waitMs / 1000 / 60)} phút. ${check.reason}`,
      };
    }
    
    return {
      action: 'none',
      message: check.reason,
    };
  }
  
  // All checks passed, perform resubscribe
  console.log('[PWA] Performing smart resubscribe...');
  recordResubscribeAttempt();
  
  try {
    // Step 1: Get SW registration
    const registration = await navigator.serviceWorker.ready;
    
    // Step 2: Unsubscribe old subscription if exists
    const oldSubscription = await registration.pushManager.getSubscription();
    if (oldSubscription) {
      console.log('[PWA] Unsubscribing old subscription...');
      await oldSubscription.unsubscribe();
    }
    
    // Step 3: Get VAPID key
    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) {
      recordResubscribeFailure('VAPID key not available');
      return {
        action: 'error',
        message: 'VAPID key not configured',
      };
    }
    
    // Step 4: Create new subscription
    console.log('[PWA] Creating new subscription...');
    const newSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });
    
    console.log('[PWA] New subscription created:', newSubscription.endpoint);
    
    // Step 5: Save to backend (upsert by endpoint)
    const saved = await savePushSubscriptionToBackend(newSubscription);
    if (!saved) {
      recordResubscribeFailure('Backend sync failed');
      return {
        action: 'error',
        message: 'Failed to sync new subscription to server',
        newSubscription,
      };
    }
    
    // Step 6: Verify with a test push (optional, only once)
    console.log('[PWA] Resubscribe complete, verifying...');
    
    // Record success
    recordResubscribeSuccess();
    
    return {
      action: 'resubscribed',
      message: 'Push subscription renewed successfully',
      newSubscription,
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PWA] Resubscribe failed:', error);
    recordResubscribeFailure(errorMsg);
    
    return {
      action: 'error',
      message: `Resubscribe failed: ${errorMsg}`,
    };
  }
}

/**
 * Force resubscribe (bypass some checks, for admin use)
 * Still respects cooldown to prevent abuse
 */
export async function forceResubscribe(): Promise<{
  success: boolean;
  message: string;
  subscription?: PushSubscription | null;
}> {
  // Still check cooldown
  const antiLoopState = getAntiLoopState();
  if (antiLoopState.inCooldown) {
    return {
      success: false,
      message: `Cooldown active. Wait ${Math.ceil(antiLoopState.cooldownRemaining / 1000)} seconds.`,
    };
  }
  
  const result = await handlePushResponseAndMaybeResubscribe({
    needResubscribe: true,
  });
  
  return {
    success: result.action === 'resubscribed',
    message: result.message,
    subscription: result.newSubscription,
  };
}

/**
 * Full re-subscribe flow for VAPID key change
 * 
 * This is used when VAPID keys are regenerated and ALL subscriptions need renewal.
 * Steps:
 * 1. Clear VAPID key cache
 * 2. Unsubscribe existing PushSubscription (if any)
 * 3. Delete old subscription record from backend
 * 4. Fetch fresh VAPID public key
 * 5. Subscribe again using NEW VAPID key
 * 6. Upload subscription to backend
 * 
 * @param deleteAllUserSubscriptions - If true, delete all subscriptions for user in backend
 */
export async function fullResubscribeWithNewVapidKey(
  deleteAllUserSubscriptions = true
): Promise<{
  success: boolean;
  message: string;
  vapidInfo?: VapidKeyInfo | null;
  subscription?: PushSubscription | null;
}> {
  console.log('[PWA] Starting full re-subscribe with new VAPID key...');
  
  try {
    // Step 1: Clear VAPID key cache to force fresh fetch
    clearVapidKeyCache();
    
    // Step 2: Get SW registration
    const registration = await navigator.serviceWorker.ready;
    
    // Step 3: Unsubscribe old subscription if exists
    const oldSubscription = await registration.pushManager.getSubscription();
    if (oldSubscription) {
      console.log('[PWA] Unsubscribing old subscription...');
      
      // Remove from backend first
      try {
        await removePushSubscriptionFromBackend(oldSubscription.endpoint);
      } catch (e) {
        console.warn('[PWA] Failed to remove old subscription from backend:', e);
      }
      
      // Unsubscribe locally
      await oldSubscription.unsubscribe();
      console.log('[PWA] Old subscription unsubscribed');
    }
    
    // Step 4: Delete ALL subscriptions for this user from backend (if requested)
    if (deleteAllUserSubscriptions) {
      console.log('[PWA] Deleting all user subscriptions from backend...');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const { error } = await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user.id);
          
          if (error) {
            console.warn('[PWA] Failed to delete all subscriptions:', error);
          } else {
            console.log('[PWA] All user subscriptions deleted');
          }
        }
      } catch (e) {
        console.warn('[PWA] Error deleting subscriptions:', e);
      }
    }
    
    // Step 5: Fetch fresh VAPID key info
    console.log('[PWA] Fetching fresh VAPID key...');
    const vapidInfo = await getVapidKeyInfo();
    
    if (!vapidInfo?.publicKey) {
      const errorMsg = vapidInfo?.error || 'VAPID key not available';
      console.error('[PWA] VAPID key fetch failed:', errorMsg);
      return {
        success: false,
        message: `VAPID key error: ${errorMsg}`,
        vapidInfo,
      };
    }
    
    if (!vapidInfo.validated) {
      console.warn('[PWA] VAPID key not validated by backend');
    }
    
    console.log('[PWA] VAPID key fetched:', {
      fingerprint: vapidInfo.fingerprint,
      version: vapidInfo.version,
    });
    
    // Step 6: Create new subscription with fresh VAPID key
    console.log('[PWA] Creating new subscription...');
    const newSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidInfo.publicKey).buffer as ArrayBuffer,
    });
    
    console.log('[PWA] New subscription created:', newSubscription.endpoint.substring(0, 50) + '...');
    
    // Step 7: Save to backend
    const saved = await savePushSubscriptionToBackend(newSubscription);
    if (!saved) {
      return {
        success: false,
        message: 'Failed to save new subscription to server',
        vapidInfo,
        subscription: newSubscription,
      };
    }
    
    console.log('[PWA] Full re-subscribe complete!');
    
    return {
      success: true,
      message: 'Push subscription renewed with new VAPID key',
      vapidInfo,
      subscription: newSubscription,
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PWA] Full re-subscribe failed:', error);
    
    return {
      success: false,
      message: `Re-subscribe failed: ${errorMsg}`,
    };
  }
}

// ============================================
// MESSAGE HANDLER (for deep links from SW)
// ============================================

/**
 * Setup listener for SW messages
 */
export function setupServiceWorkerMessageHandler(
  onNotificationClick: (data: { url: string; [key: string]: any }) => void
): () => void {
  if (!('serviceWorker' in navigator)) {
    return () => {};
  }

  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'NOTIFICATION_CLICK') {
      onNotificationClick(event.data.payload);
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);

  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
}

// ============================================
// AUTO-REGISTER ON MODULE LOAD
// ============================================

// Auto-register SW on module import (non-blocking)
if (typeof window !== 'undefined' && isPushSupported()) {
  // Register SW immediately, but don't auto-subscribe
  registerServiceWorker().catch(console.error);
}
