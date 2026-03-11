/**
 * SHARED NOTIFICATION RENDERER - DENO VERSION
 * 
 * Deno-compatible version of renderNotification for Edge Functions.
 * 
 * IMPORTANT: Config is synced from src/modules/notifications/notificationConfig.json
 * Run 'npm run sync-config' before deploy to ensure FE and Edge use same config.
 * 
 * Used by:
 * - channex-webhook (generates push payload + filter decision)
 * - send-push (optional validation)
 */

// Load config from JSON file (synced during predeploy)
import notificationConfig from "./notificationConfig.json" with { type: "json" };

// Log config hash for drift detection
const CONFIG_HASH = (notificationConfig as { _configHash?: string })._configHash || 'NO_HASH';
console.log(`[NotificationConfig] Edge config hash: ${CONFIG_HASH}`);

// Export for external verification
export const getConfigHash = () => CONFIG_HASH;

// ============================================
// TYPES
// ============================================

export type NotificationEventType = 
  | 'BOOKING_NEW' 
  | 'BOOKING_MODIFIED' 
  | 'BOOKING_CANCELLED'
  | 'MESSAGE_INBOUND'
  | 'PUSH_TEST';

export interface NotificationInput {
  eventType: NotificationEventType;
  guestName?: string;
  checkInDate?: string;
  nights?: number;
  otaSource?: string;
  otaPropertyName?: string;     // Property name from OTA
  otaRoomTypeName?: string;     // Room type from OTA
  totalAmount?: number;
  roomType?: string;
  messageBody?: string;
  messagePreview?: string;      // Truncated message (80-120 chars)
  threadId?: string;            // For message deep links
  conversationId?: string;      // Internal conversation ID
  bookingId?: string;
  changeId?: string;
}

export interface RenderedNotification {
  title: string;
  body: string;
  emoji: string;
  labelVi: string;
  tag: string;
  requireInteraction: boolean;
  vibratePattern: number[];
  silent: boolean;
  icon: string;   // OTA logo URL for notification icon
  deepLink: string;
  eventType: NotificationEventType;
}

// ============================================
// CONFIGURATION - FROM JSON (Single Source of Truth)
// ============================================

interface EventConfigItem {
  emoji: string;
  labelVi: string;
  titlePrefix: string;
  requireInteraction: boolean;
  vibratePattern: number[];
  silent: boolean;
}

export const EVENT_CONFIG: Record<NotificationEventType, EventConfigItem> = 
  notificationConfig.eventConfig as Record<NotificationEventType, EventConfigItem>;

// Filter config
const TECH_FIELDS: Set<string> = new Set(
  notificationConfig.filterConfig.techFields.map((f: string) => f.toLowerCase())
);

const OPS_FIELDS: Set<string> = new Set(
  notificationConfig.filterConfig.opsFields.map((f: string) => f.toLowerCase())
);

const WINDOW_SECONDS: number = notificationConfig.filterConfig.windowSeconds;

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function formatCheckInDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    // Short format: dd/MM only
    return date.toLocaleDateString('vi-VN', { 
      day: '2-digit', 
      month: '2-digit',
    });
  } catch {
    return '';
  }
}

export function formatCurrency(amount: number | null | undefined): string {
  if (!amount || amount <= 0) return '';
  // Format: X.XXX.XXXđ (without ₫ symbol)
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

export function getOtaShortName(source: string | null | undefined): string {
  if (!source) return '';
  const upper = source.toUpperCase().trim();
  
  if (upper.includes('BOOKING')) return 'Booking.com';
  if (upper.includes('AGODA')) return 'Agoda';
  if (upper.includes('EXPEDIA')) return 'Expedia';
  if (upper.includes('CTRIP') || upper.includes('TRIP')) return 'Trip.com';
  if (upper.includes('TRAVELOKA')) return 'Traveloka';
  if (upper.includes('AIRBNB')) return 'Airbnb';
  
  return source;
}

/**
 * Normalize OTA source for logo matching
 */
export function normalizeOtaSource(source: string | null | undefined): string | undefined {
  if (!source) return undefined;
  const upper = source.toUpperCase().trim();
  if (upper.includes('CTRIP') || upper.includes('TRIP')) return 'CTRIP';
  if (upper.includes('AGODA')) return 'AGODA';
  if (upper.includes('BOOKING')) return 'BOOKING.COM';
  if (upper.includes('EXPEDIA')) return 'EXPEDIA';
  if (upper.includes('TRAVELOKA')) return 'TRAVELOKA';
  return upper;
}

// OTA Logo URLs (relative paths served by frontend)
const OTA_LOGO_URLS: Record<string, string> = {
  'BOOKING.COM': '/ota-logos/booking.png',
  'BOOKING': '/ota-logos/booking.png',
  'AGODA': '/ota-logos/agoda.png',
  'EXPEDIA': '/ota-logos/expedia.png',
  'CTRIP': '/ota-logos/ctrip.png',
  'TRIP.COM': '/ota-logos/ctrip.png',
  'TRAVELOKA': '/ota-logos/traveloka.png',
};

/**
 * Get OTA logo URL for notification icon
 */
export function getOtaLogoUrl(source: string | null | undefined): string {
  if (!source) return '/favicon.png';
  const normalized = normalizeOtaSource(source);
  if (normalized && OTA_LOGO_URLS[normalized]) {
    return OTA_LOGO_URLS[normalized];
  }
  return '/favicon.png';
}

// ============================================
// MAIN RENDERER FUNCTION
// FORMAT: NO emoji in title/body, NO "Roomrise"
// ============================================

export function renderNotification(input: NotificationInput): RenderedNotification {
  const { 
    eventType, 
    guestName = 'Khách', 
    checkInDate, 
    nights = 1, 
    otaSource,
    otaPropertyName,
    otaRoomTypeName,
    totalAmount,
    messageBody,
    messagePreview,
    threadId,
    conversationId,
    bookingId,
    changeId,
  } = input;
  
  const config = EVENT_CONFIG[eventType] || EVENT_CONFIG.PUSH_TEST;
  
  let title: string;
  let body: string;
  let icon: string = '/favicon.png';
  let deepLink: string = '/';
  
  if (eventType === 'MESSAGE_INBOUND') {
    // ===== MESSAGE FORMAT =====
    const otaName = getOtaShortName(otaSource);
    title = otaName ? `${otaName} • Tin nhắn mới` : 'Tin nhắn mới';
    
    // Body: Intro + property + preview
    const introLine = `Bạn có tin nhắn mới từ ${guestName}`;
    const preview = messagePreview || messageBody?.substring(0, 100) || '';
    const cleanPreview = preview.replace(/\n+/g, ' ').trim();
    
    const bodyLines: string[] = [introLine];
    if (otaPropertyName) bodyLines.push(otaPropertyName);
    if (cleanPreview) bodyLines.push(`"${cleanPreview}"`);
    body = bodyLines.join('\n');
    
    // Icon: OTA logo
    icon = getOtaLogoUrl(otaSource);
    
    // Deep link
    if (threadId) {
      deepLink = `/ota-messages?thread=${threadId}`;
    } else if (conversationId) {
      deepLink = `/ota-messages?conversation=${conversationId}`;
    } else {
      deepLink = bookingId ? `/ota-messages?booking=${bookingId}` : '/ota-messages';
    }
    
  } else {
    // ===== BOOKING FORMAT =====
    // Title: Clean Vietnamese (NO emoji, NO "Roomrise")
    switch (eventType) {
      case 'BOOKING_NEW':
        title = 'Đặt phòng mới';
        break;
      case 'BOOKING_MODIFIED':
        title = 'Thay đổi đặt phòng';
        break;
      case 'BOOKING_CANCELLED':
        title = 'Huỷ đặt phòng';
        break;
      default:
        title = 'Thông báo đặt phòng';
    }
    
    // Body format per event type:
    // NEW: "Quý vị có đặt phòng mới\n{booking_info}"
    // MODIFIED: "Một khách thay đổi kỳ lưu trú\n{booking_info}"
    // CANCELLED: "Một khách hủy kỳ lưu trú\n{booking_info}"
    
    let introLine: string;
    switch (eventType) {
      case 'BOOKING_NEW':
        introLine = 'Quý vị có đặt phòng mới';
        break;
      case 'BOOKING_MODIFIED':
        introLine = 'Một khách thay đổi kỳ lưu trú';
        break;
      case 'BOOKING_CANCELLED':
        introLine = 'Một khách hủy kỳ lưu trú';
        break;
      default:
        introLine = 'Thông báo đặt phòng';
    }
    
    // Build booking info line
    // Format: {guest_name} • CI: {dd/MM} • {n} đêm • {amount}
    const infoParts: string[] = [guestName];
    
    const checkInFormatted = formatCheckInDate(checkInDate);
    if (checkInFormatted) {
      infoParts.push(`CI: ${checkInFormatted}`);
    }
    
    if (nights && nights > 0) {
      infoParts.push(`${nights} đêm`);
    }
    
    // Always show amount for BOOKING_NEW and BOOKING_CANCELLED
    if (totalAmount && totalAmount > 0) {
      infoParts.push(formatCurrency(totalAmount));
    }
    
    const infoLine = infoParts.join(' • ');
    
    // Optional: OTA + property line
    const line3Parts: string[] = [];
    const otaName = getOtaShortName(otaSource);
    if (otaName) {
      line3Parts.push(otaName);
    }
    if (otaPropertyName) {
      line3Parts.push(otaPropertyName);
    }
    const line3 = line3Parts.length > 0 ? line3Parts.join(' • ') : '';
    
    // Optional: Room type line
    const line4 = otaRoomTypeName || '';
    
    // Combine body
    const bodyLines = [introLine, infoLine];
    if (line3) bodyLines.push(line3);
    if (line4) bodyLines.push(line4);
    body = bodyLines.join('\n');
    
    // Icon: OTA logo
    icon = getOtaLogoUrl(otaSource);
    
    // Deep link: /bookings/{booking_id}
    if (bookingId) {
      deepLink = `/bookings/${bookingId}`;
    } else {
      deepLink = '/bookings';
    }
  }
  
  const tag = eventType === 'MESSAGE_INBOUND'
    ? `roomrise-msg-${conversationId || threadId || changeId || Date.now()}`
    : `roomrise-${eventType.toLowerCase()}-${bookingId || changeId || Date.now()}`;
  
  return {
    title,
    body,
    emoji: config.emoji,       // Keep for Bell badge
    labelVi: config.labelVi,   // Keep for Bell label
    tag,
    requireInteraction: config.requireInteraction,
    vibratePattern: config.vibratePattern,
    silent: config.silent,
    icon,
    deepLink,
    eventType,
  };
}

// ============================================
// PUSH FILTER LOGIC (Same as Bell filter)
// ============================================

export interface BookingChangeForFilter {
  id: string;
  change_type: string;
  unified_booking_id: string;
  created_at: string;
  changed_fields?: string[] | null;
  after_data?: Record<string, unknown> | null;
}

export interface PushFilterResult {
  shouldPush: boolean;
  reason: string;
  eventType: NotificationEventType;
}

/**
 * Check if changed fields contain ANY operational fields
 */
function hasOpsFields(changedFields: string[]): boolean {
  return changedFields.some(field => OPS_FIELDS.has(field.toLowerCase()));
}

/**
 * Check if ALL changed fields are tech-only fields
 */
function isOnlyTechFields(changedFields: string[]): boolean {
  if (changedFields.length === 0) return true;
  return changedFields.every(field => TECH_FIELDS.has(field.toLowerCase()));
}

/**
 * Check if two timestamps are within WINDOW_SECONDS of each other
 */
function isWithinWindow(timestamp1: string, timestamp2: string): boolean {
  const t1 = new Date(timestamp1).getTime();
  const t2 = new Date(timestamp2).getTime();
  const diffMs = Math.abs(t1 - t2);
  return diffMs <= WINDOW_SECONDS * 1000;
}

/**
 * Determine if a booking change should trigger a push notification
 * 
 * IMPORTANT: This is the SHARED filter function used by:
 * - channex-webhook (push decision)
 * - NotificationBell uses identical logic in filterNotifications.ts
 * 
 * RULE: Push ONLY fires if Bell/feed would show this notification.
 * 
 * @param change - The current booking change
 * @param recentChanges - Recent changes for the same booking (from DB query)
 * @returns Decision with reason
 */
export function shouldTriggerPush(
  change: BookingChangeForFilter,
  recentChanges: BookingChangeForFilter[]
): PushFilterResult {
  const changeType = change.change_type.toUpperCase();
  const afterStatus = ((change.after_data?.booking_status as string) || '').toUpperCase();
  
  // Determine event type
  let eventType: NotificationEventType;
  if (changeType === 'INSERT') {
    eventType = 'BOOKING_NEW';
  } else if (afterStatus === 'CANCELLED' || afterStatus === 'CANCELED') {
    eventType = 'BOOKING_CANCELLED';
  } else {
    eventType = 'BOOKING_MODIFIED';
  }
  
  // RULE 1: NEW_BOOKING or CANCELLED → ALWAYS SHOW (in Bell and Push)
  if (eventType === 'BOOKING_NEW' || eventType === 'BOOKING_CANCELLED') {
    return {
      shouldPush: true,
      reason: 'PRIMARY_EVENT',
      eventType,
    };
  }
  
  // RULE 2: MODIFIED - check fields
  const changedFields = Array.isArray(change.changed_fields) ? change.changed_fields : [];
  
  // 2.1: If ANY ops fields changed → ALWAYS SHOW
  if (hasOpsFields(changedFields)) {
    return {
      shouldPush: true,
      reason: 'OPS_FIELDS_CHANGED',
      eventType,
    };
  }
  
  // 2.2: If only tech fields (or empty) → check for primary event nearby
  if (isOnlyTechFields(changedFields)) {
    // Check if there's a primary event (INSERT or CANCELLED) within window
    const hasPrimaryNearby = recentChanges.some(rc => {
      if (rc.id === change.id) return false; // Skip self
      
      const rcType = rc.change_type.toUpperCase();
      const rcStatus = ((rc.after_data?.booking_status as string) || '').toUpperCase();
      const isPrimary = rcType === 'INSERT' || rcStatus === 'CANCELLED' || rcStatus === 'CANCELED';
      
      if (!isPrimary) return false;
      
      return isWithinWindow(change.created_at, rc.created_at);
    });
    
    if (hasPrimaryNearby) {
      return {
        shouldPush: false,
        reason: 'TECH_ONLY_NEAR_PRIMARY',
        eventType,
      };
    }
    
    // 2.3: Tech-only updates without nearby primary → HIDE (internal sync)
    // These are technical sync updates that user doesn't need to see
    return {
      shouldPush: false,
      reason: 'TECH_ONLY_INTERNAL_UPDATE',
      eventType,
    };
  }
  
  // 2.4: Has unknown fields (not in TECH or OPS) → SHOW for traceability
  return {
    shouldPush: true,
    reason: 'UNKNOWN_FIELDS_UPDATE',
    eventType,
  };
}

/**
 * Alias: shouldShowInFeed = shouldTriggerPush
 * Bell and Push use the same logic - if Bell shows it, Push sends it.
 */
export const shouldShowInFeed = shouldTriggerPush;

