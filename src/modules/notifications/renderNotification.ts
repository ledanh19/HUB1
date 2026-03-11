/**
 * SHARED NOTIFICATION RENDERER
 * 
 * Single Source of Truth for notification UI rendering.
 * Used by:
 * - NotificationBell (popover feed)
 * - useForegroundPush (if toast enabled)
 * - channex-webhook (server-side pre-render for push payload)
 * - sw.js (receives pre-rendered data)
 * 
 * IMPORTANT: Changes here affect ALL notification UIs.
 * Test thoroughly on both Android and iOS PWA.
 * 
 * CONFIG SOURCE: notificationConfig.json (single source of truth)
 * Run 'npm run sync-config' before deploy to sync Edge Functions config.
 */

import notificationConfig from './notificationConfig.json';

// Log config hash for drift detection
const CONFIG_HASH = (notificationConfig as { _configHash?: string })._configHash || 'NO_HASH';
console.log(`[NotificationConfig] FE config hash: ${CONFIG_HASH}`);

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
  checkInDate?: string; // ISO date string
  nights?: number;
  otaSource?: string;
  otaPropertyName?: string;     // NEW: Property name from OTA
  otaRoomTypeName?: string;     // NEW: Room type from OTA
  totalAmount?: number;
  roomType?: string;
  messageBody?: string;
  messagePreview?: string;      // NEW: Truncated message (80-120 chars)
  threadId?: string;            // NEW: For message deep links
  conversationId?: string;      // NEW: Internal conversation ID
  bookingId?: string;
  changeId?: string;
}

export interface RenderedNotification {
  // Display text (NO emoji in title/body - clean format)
  title: string;
  body: string;
  
  // Visual indicators (for internal use only)
  emoji: string;
  labelVi: string;
  
  // Styling hints (for NotificationBell)
  badgeClass: string;
  isUrgent: boolean;
  
  // Push notification specific
  tag: string;
  requireInteraction: boolean;
  vibratePattern: number[];
  silent: boolean;
  icon: string;  // NEW: OTA logo URL for notification icon
  
  // Navigation
  deepLink: string;
  
  // Original data for reference
  eventType: NotificationEventType;
}

interface EventConfigItem {
  emoji: string;
  labelVi: string;
  titlePrefix: string;
  badgeClass: string;
  isUrgent: boolean;
  requireInteraction: boolean;
  vibratePattern: number[];
  silent: boolean;
}

// ============================================
// CONFIGURATION - FROM JSON (Single Source of Truth)
// ============================================

/**
 * Event type configuration - loaded from notificationConfig.json
 * This ensures FE and Edge Functions use identical config
 */
export const EVENT_CONFIG: Record<NotificationEventType, EventConfigItem> = 
  notificationConfig.eventConfig as Record<NotificationEventType, EventConfigItem>;

/**
 * Filter configuration - loaded from notificationConfig.json
 */
export const FILTER_CONFIG = notificationConfig.filterConfig;

/**
 * Tech fields set for quick lookup
 */
export const TECH_FIELDS: ReadonlySet<string> = new Set(
  notificationConfig.filterConfig.techFields.map((f: string) => f.toLowerCase())
);

/**
 * Ops fields set for quick lookup
 */
export const OPS_FIELDS: ReadonlySet<string> = new Set(
  notificationConfig.filterConfig.opsFields.map((f: string) => f.toLowerCase())
);

/**
 * Time window for filter dedup (in seconds)
 */
export const WINDOW_SECONDS: number = notificationConfig.filterConfig.windowSeconds;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format check-in date for display
 */
export function formatCheckInDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('vi-VN', { 
      day: '2-digit', 
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (!amount || amount <= 0) return '';
  return '₫' + new Intl.NumberFormat('vi-VN').format(amount);
}

/**
 * Get short OTA name for display
 */
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
 * Normalize OTA source for internal use (logo matching etc)
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

// ============================================
// OTA LOGO URLs (for notification icon)
// These are public URLs hosted in the app's assets
// ============================================

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
// FORMAT FUNCTIONS
// ============================================

/**
 * Format check-in date for display (dd/MM only for brevity)
 */
export function formatCheckInDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('vi-VN', { 
      day: '2-digit', 
      month: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Format currency for display (with VND symbol)
 */
export function formatCurrencyVND(amount: number | null | undefined): string {
  if (!amount || amount <= 0) return '';
  // Format with thousands separator
  const formatted = new Intl.NumberFormat('vi-VN').format(amount);
  return `${formatted}đ`;
}

// ============================================
// MAIN RENDERER FUNCTION
// ============================================

/**
 * Render notification from input data
 * 
 * This is THE SINGLE SOURCE OF TRUTH for notification rendering.
 * All notification UIs (Bell, Push, Toast) MUST use this function.
 * 
 * FORMAT RULES:
 * - NO emoji in title/body text
 * - NO "Roomrise" in title/body text  
 * - Icon = OTA logo (if available)
 * - Deep link = actual page route
 * 
 * @param input - Notification input data
 * @returns Fully rendered notification ready for display
 */
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
  
  // Get config for this event type (for styling, vibrate pattern, etc)
  const config = EVENT_CONFIG[eventType] || EVENT_CONFIG.PUSH_TEST;
  
  // ============================================
  // BUILD TITLE (NO emoji, NO "Roomrise")
  // ============================================
  let title: string;
  let body: string;
  let icon: string = '/favicon.png';
  let deepLink: string = '/';
  
  if (eventType === 'MESSAGE_INBOUND') {
    // ===== MESSAGE FORMAT =====
    const otaName = getOtaShortName(otaSource);
    title = otaName ? `${otaName} • Tin nhắn mới` : 'Tin nhắn mới';
    
    // Body: Intro + guest/property + preview
    const introLine = `Bạn có tin nhắn mới từ ${guestName}`;
    const preview = messagePreview || messageBody?.substring(0, 100) || '';
    const cleanPreview = preview.replace(/\n+/g, ' ').trim();
    
    const bodyLines = [introLine];
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
    // Title: Simple event type
    // Body: Intro line + booking details
    
    let introLine: string;
    switch (eventType) {
      case 'BOOKING_NEW':
        title = 'Đặt phòng mới';
        introLine = 'Quý vị có đặt phòng mới';
        break;
      case 'BOOKING_MODIFIED':
        title = 'Thay đổi đặt phòng';
        introLine = 'Một khách thay đổi kỳ lưu trú';
        break;
      case 'BOOKING_CANCELLED':
        title = 'Huỷ đặt phòng';
        introLine = 'Một khách hủy kỳ lưu trú';
        break;
      default:
        title = 'Thông báo đặt phòng';
        introLine = 'Có cập nhật đặt phòng';
    }
    
    // Build booking info line: {guest} • CI: {date} • {nights} đêm • {amount}
    const infoParts: string[] = [guestName];
    
    const checkInFormatted = formatCheckInDateShort(checkInDate);
    if (checkInFormatted) {
      infoParts.push(`CI: ${checkInFormatted}`);
    }
    
    if (nights && nights > 0) {
      infoParts.push(`${nights} đêm`);
    }
    
    if (totalAmount && totalAmount > 0 && eventType !== 'BOOKING_CANCELLED') {
      infoParts.push(formatCurrencyVND(totalAmount));
    }
    
    const infoLine = infoParts.join(' • ');
    
    // Build source line: {OTA} • {property}
    const sourceParts: string[] = [];
    const otaName = getOtaShortName(otaSource);
    if (otaName) sourceParts.push(otaName);
    if (otaPropertyName) sourceParts.push(otaPropertyName);
    const sourceLine = sourceParts.join(' • ');
    
    // Combine: intro + info + source + room
    const bodyLines = [introLine, infoLine];
    if (sourceLine) bodyLines.push(sourceLine);
    if (otaRoomTypeName) bodyLines.push(otaRoomTypeName);
    body = bodyLines.join('\n');
    
    // Icon: OTA logo
    icon = getOtaLogoUrl(otaSource);
    
    // Deep link
    deepLink = bookingId ? `/bookings/${bookingId}` : '/bookings';
  }
  
  // Build tag for notification grouping/replacement
  const tag = eventType === 'MESSAGE_INBOUND'
    ? `roomrise-msg-${conversationId || threadId || changeId || Date.now()}`
    : `roomrise-${eventType.toLowerCase()}-${bookingId || changeId || Date.now()}`;
  
  return {
    title,
    body,
    emoji: config.emoji,       // Keep for Bell badge display
    labelVi: config.labelVi,   // Keep for Bell label
    badgeClass: config.badgeClass,
    isUrgent: config.isUrgent,
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
// HELPER: Convert booking_changes record to NotificationInput
// ============================================

export interface BookingChangeForRender {
  id: string;
  change_type: string;
  unified_booking_id?: string;
  after_data?: Record<string, unknown>;
}

export interface BookingInfoForRender {
  guest_name?: string;
  check_in_date?: string;
  nights?: number;
  ota_source?: string;
  ota_property_name?: string;   // NEW
  ota_room_type_name?: string;  // NEW
  total_amount_net?: number;
  total_amount_gross?: number;
  booking_status?: string;
  room_type?: string;
}

/**
 * Convert booking_changes record + booking info to NotificationInput
 */
export function bookingChangeToNotificationInput(
  change: BookingChangeForRender,
  bookingInfo?: BookingInfoForRender
): NotificationInput {
  // Determine event type
  let eventType: NotificationEventType;
  
  if (change.change_type === 'INSERT') {
    eventType = 'BOOKING_NEW';
  } else {
    // Check if cancellation from after_data or booking_info
    const afterStatus = ((change.after_data?.booking_status as string) || '').toUpperCase();
    const bookingStatus = (bookingInfo?.booking_status || '').toUpperCase();
    const isCancelled = afterStatus === 'CANCELLED' || afterStatus === 'CANCELED' ||
                        bookingStatus === 'CANCELLED' || bookingStatus === 'CANCELED';
    eventType = isCancelled ? 'BOOKING_CANCELLED' : 'BOOKING_MODIFIED';
  }
  
  // Extract booking data (prefer bookingInfo, fallback to after_data)
  const afterData = change.after_data || {};
  
  return {
    eventType,
    guestName: bookingInfo?.guest_name || (afterData.guest_name as string) || 'Khách',
    checkInDate: bookingInfo?.check_in_date || (afterData.check_in_date as string),
    nights: bookingInfo?.nights || (afterData.nights as number) || 1,
    otaSource: bookingInfo?.ota_source || (afterData.ota_source as string),
    otaPropertyName: bookingInfo?.ota_property_name || (afterData.ota_property_name as string),
    otaRoomTypeName: bookingInfo?.ota_room_type_name || (afterData.ota_room_type_name as string) ||
                     bookingInfo?.room_type || (afterData.room_type as string),
    totalAmount: bookingInfo?.total_amount_net || bookingInfo?.total_amount_gross || 
                 (afterData.total_amount_net as number) || (afterData.total_amount_gross as number),
    roomType: bookingInfo?.room_type || (afterData.room_type as string),
    bookingId: change.unified_booking_id,
    changeId: change.id,
  };
}

// ============================================
// EXPORT FOR SERVER-SIDE (Deno)
// ============================================

/**
 * Full config as JSON - can be used to verify sync with Edge Functions
 */
export const NOTIFICATION_CONFIG_JSON = JSON.stringify(notificationConfig);

// Types are exported inline above (NotificationInput, RenderedNotification)
