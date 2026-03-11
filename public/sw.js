/**
 * ROOMRISE PWA SERVICE WORKER
 * 
 * Handles:
 * 1. Push notification events (showNotification)
 * 2. Notification click events (deep link navigation)
 * 3. Foreground notification broadcast to app
 * 
 * IMPORTANT: This file runs in a separate thread from the main app
 * 
 * SYNC NOTE: Notifications are PRE-RENDERED by channex-webhook using
 * shared renderNotification.ts - sw.js should NOT add emoji/format text.
 * 
 * FORMAT RULES:
 * - Title/body come pre-rendered (NO emoji, NO "Roomrise")
 * - Icon = OTA logo URL from payload
 * - Deep link = actual page route
 */

// SW Version for cache busting
const SW_VERSION = '3.0.0'; // Bumped for new notification format

// ============================================
// PUSH EVENT HANDLER
// ============================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  if (!event.data) {
    console.warn('[SW] Push event but no data');
    return;
  }
  
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.error('[SW] Failed to parse push data:', e);
    payload = {
      title: 'Thông báo',
      body: event.data.text() || 'Bạn có thông báo mới',
      icon: '/favicon.png',
      data: {}
    };
  }
  
  // Use PRE-RENDERED values from channex-webhook (via shared renderer)
  // Do NOT add emoji or reformat - the webhook already did this
  const {
    title = 'Thông báo',
    body = 'Bạn có thông báo mới',
    icon = '/favicon.png',     // OTA logo from renderer
    badge = '/favicon.png',
    tag = `roomrise-${Date.now()}`,
    data = {},
    // Pre-rendered options from shared renderer
    requireInteraction: payloadRequireInteraction,
    silent: payloadSilent,
    vibrate: payloadVibrate,
    actions = []
  } = payload;

  // Extract event type and deep_link
  const eventType = data.event_type || payload.event_type || 'UNKNOWN';
  const deepLink = data.deep_link || payload.deep_link || '/';
  const isPreRendered = data._pre_rendered === true;
  
  console.log('[SW] Processing notification:', { 
    title, 
    body: body?.substring(0, 50), 
    eventType, 
    isPreRendered,
    tag,
    icon,
    deepLink,
  });
  
  // Build notification options
  const notificationOptions = {
    body,
    icon,        // Use icon from payload (OTA logo)
    badge,
    tag,
    data: {
      ...data,
      event_type: eventType,
      deep_link: deepLink,     // Ensure deep_link is in data
      timestamp: Date.now(),
      sw_version: SW_VERSION
    },
    requireInteraction: payloadRequireInteraction ?? (eventType === 'BOOKING_NEW' || eventType === 'BOOKING_CANCELLED'),
    vibrate: payloadVibrate ?? getDefaultVibratePattern(eventType),
    actions: actions.length > 0 ? actions : getDefaultActions(eventType),
    renotify: true,
    silent: payloadSilent ?? (eventType === 'BOOKING_MODIFIED')
  };
  
  // Show notification AND broadcast to app for foreground handling
  event.waitUntil(
    Promise.all([
      // Always show native notification (works in background)
      self.registration.showNotification(title, notificationOptions)
        .then(() => {
          console.log('[SW] Notification shown:', title);
        })
        .catch((err) => {
          console.error('[SW] Failed to show notification:', err);
        }),
      
      // Broadcast to all app windows for foreground handling
      broadcastToClients({
        type: 'PUSH_RECEIVED',
        payload: {
          title,
          body,
          event_type: eventType,
          deep_link: deepLink,
          entity_id: data.entity_id,
          _pre_rendered: isPreRendered,
          ...data
        }
      })
    ])
  );
});

/**
 * Get default vibrate pattern - FALLBACK only if not pre-rendered
 */
function getDefaultVibratePattern(eventType) {
  switch (eventType) {
    case 'BOOKING_CANCELLED':
      return [200, 100, 200, 100, 200]; // Urgent
    case 'BOOKING_NEW':
      return [100, 50, 100, 50, 200]; // Celebratory
    default:
      return [100, 50, 100]; // Standard
  }
}

// ============================================
// BROADCAST TO ALL CLIENTS (for foreground handling)
// ============================================
async function broadcastToClients(message) {
  try {
    const clientList = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });
    
    console.log('[SW] Broadcasting to', clientList.length, 'clients:', message.type);
    
    for (const client of clientList) {
      client.postMessage(message);
    }
  } catch (err) {
    console.error('[SW] Broadcast error:', err);
  }
}

// ============================================
// NOTIFICATION CLICK HANDLER
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  // Close the notification
  event.notification.close();
  
  const data = event.notification.data || {};
  const action = event.action;
  
  // PRIORITY 1: Use explicit deep_link from payload (pre-rendered by webhook)
  // PRIORITY 2: Build deep link from event_type + entity_id
  // PRIORITY 3: Default to home
  let targetUrl = '/';
  
  if (data.deep_link && data.deep_link.startsWith('/')) {
    // Use pre-rendered deep link (e.g., "/bookings/xxx" or "/ota-messages?thread=xxx")
    targetUrl = data.deep_link;
    console.log('[SW] Using pre-rendered deep_link:', targetUrl);
  } else if (data.event_type && data.entity_id) {
    // Fallback: construct deep link from event type
    targetUrl = buildDeepLink(data.event_type, data.entity_id, action);
    console.log('[SW] Built deep_link from event_type:', targetUrl);
  }
  
  console.log('[SW] Navigating to:', targetUrl);
  
  // Handle click action
  event.waitUntil(
    handleNotificationClick(targetUrl, data)
  );
});

// ============================================
// NOTIFICATION CLOSE HANDLER
// ============================================
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
  // Can track dismissals here for analytics
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build deep link URL based on event type (FALLBACK only)
 * Primary deep_link should come pre-rendered from webhook
 */
function buildDeepLink(eventType, entityId, action) {
  switch (eventType) {
    case 'BOOKING_NEW':
    case 'BOOKING_MODIFIED':
    case 'BOOKING_CANCELLED':
      // Navigate to booking detail page
      return `/bookings/${entityId}`;
    
    case 'MESSAGE_INBOUND':
      // Navigate to messages with conversation
      return `/ota-messages?conversation=${entityId}`;
    
    case 'EMAIL_ACTIONABLE':
    case 'EMAIL_NEW_THREAD':
    case 'EMAIL_NEW_MESSAGE':
    case 'EMAIL_NEEDS_REVIEW':
      // Navigate to email inbox with thread selected
      return `/email/inbox?thread=${entityId}`;
    
    default:
      return '/';
  }
}

/**
 * Get default notification actions based on event type
 */
function getDefaultActions(eventType) {
  switch (eventType) {
    case 'BOOKING_NEW':
      return [
        { action: 'view', title: 'Xem chi tiết' },
        { action: 'assign', title: 'Nhận xử lý' }
      ];
    
    case 'BOOKING_MODIFIED':
    case 'BOOKING_CANCELLED':
      return [
        { action: 'view', title: 'Xem chi tiết' }
      ];
    
    case 'MESSAGE_INBOUND':
      return [
        { action: 'reply', title: 'Trả lời' },
        { action: 'view', title: 'Xem tin nhắn' }
      ];
    
    case 'EMAIL_ACTIONABLE':
    case 'EMAIL_NEW_THREAD':
    case 'EMAIL_NEW_MESSAGE':
    case 'EMAIL_NEEDS_REVIEW':
      return [
        { action: 'view', title: 'Xem email' }
      ];
    
    default:
      return [];
  }
}

/**
 * Handle notification click - focus existing window or open new
 */
async function handleNotificationClick(url, data) {
  // Get all window clients
  const clientList = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });
  
  // Try to find an existing window with our app
  for (const client of clientList) {
    // Check if client is our app (same origin)
    if (client.url.startsWith(self.location.origin)) {
      // Found existing window, focus it and navigate
      await client.focus();
      
      // Post message to navigate
      client.postMessage({
        type: 'NOTIFICATION_CLICK',
        payload: {
          url,
          ...data
        }
      });
      
      return;
    }
  }
  
  // No existing window, open new one
  if (clients.openWindow) {
    return clients.openWindow(url);
  }
}

// ============================================
// INSTALL & ACTIVATE HANDLERS
// ============================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', SW_VERSION);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated version:', SW_VERSION);
  // Claim all clients immediately
  event.waitUntil(clients.claim());
});

// ============================================
// MESSAGE HANDLER (for debugging)
// ============================================
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'PING') {
    event.ports[0].postMessage({ type: 'PONG', version: SW_VERSION });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Log SW startup
console.log('[SW] Service Worker loaded, version:', SW_VERSION);
