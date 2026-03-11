/**
 * SMART NOTIFICATION DEDUP/HIDE
 * 
 * Purpose: Filter out "technical" UPDATE notifications that are internal sync events.
 * 
 * RULES (in order):
 * 1) NEW_BOOKING or CANCELLED → ALWAYS SHOW
 * 2) UPDATED events:
 *    2.1) If changed_fields contains ANY OPS_FIELDS → ALWAYS SHOW
 *    2.2) If changed_fields contains UNKNOWN fields (not in TECH or OPS) → SHOW for traceability
 *    2.3) If changed_fields ⊆ TECH_FIELDS (only technical) → HIDE (internal sync)
 * 
 * CONSTRAINTS:
 * - No DB changes, no webhook/sync changes
 * - Pure function, deterministic
 * - Does not mutate input
 * 
 * GATE 3: MIRROR FEED
 * This file imports TECH_FIELDS, OPS_FIELDS, WINDOW_SECONDS from shared JSON config
 * via renderNotification.ts - ensuring FE and Edge use identical filter logic.
 */

// Import filter config from shared module (reads from notificationConfig.json)
import {
  TECH_FIELDS,
  OPS_FIELDS,
  WINDOW_SECONDS,
  getConfigHash,
} from '../renderNotification';

// Log config hash on module load for verification
console.log(`[filterNotifications] Loaded config hash: ${getConfigHash()}`);

// =============================================================================
// TYPES
// =============================================================================

export interface NotificationItem {
  id: string;
  booking_id: string;
  created_at: string; // ISO timestamp
  event_type: NotificationEventType;
  changed_fields?: string[] | null;
  change_set?: ChangeSet[] | null;
  // Additional fields for display
  source?: string | null;
  after_data?: Record<string, unknown> | null;
  before_data?: Record<string, unknown> | null;
}

export type NotificationEventType = 
  | 'NEW_BOOKING' 
  | 'CANCELLED' 
  | 'UPDATED' 
  | 'STATUS_CHANGED'
  | 'MODIFICATION'
  | 'INSERT'
  | 'UPDATE'
  | 'CANCELLATION';

export interface ChangeSet {
  field: string;
  old?: unknown;
  new?: unknown;
}

// =============================================================================
// CONSTANTS - RE-EXPORT FROM SHARED CONFIG
// These are imported from renderNotification.ts which reads from JSON config
// =============================================================================

// Re-export for consumers that import from this file
export { TECH_FIELDS, OPS_FIELDS, WINDOW_SECONDS } from '../renderNotification';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize event type to canonical form
 */
function normalizeEventType(eventType: NotificationEventType | string): 'NEW_BOOKING' | 'CANCELLED' | 'UPDATED' {
  const upper = (eventType || '').toUpperCase();
  
  if (upper === 'NEW_BOOKING' || upper === 'INSERT') {
    return 'NEW_BOOKING';
  }
  
  if (upper === 'CANCELLED' || upper === 'CANCELLATION' || upper === 'CANCELED') {
    return 'CANCELLED';
  }
  
  // Everything else is UPDATED
  return 'UPDATED';
}

/**
 * Check if event is a primary event (NEW_BOOKING or CANCELLED)
 */
function isPrimaryEvent(eventType: NotificationEventType | string): boolean {
  const normalized = normalizeEventType(eventType);
  return normalized === 'NEW_BOOKING' || normalized === 'CANCELLED';
}

/**
 * Check if event is an update type
 */
function isUpdateEvent(eventType: NotificationEventType | string): boolean {
  const upper = (eventType || '').toUpperCase();
  return ['UPDATED', 'UPDATE', 'MODIFICATION', 'STATUS_CHANGED'].includes(upper);
}

/**
 * Extract changed field names from notification
 */
function extractChangedFields(notification: NotificationItem): string[] {
  // Priority 1: Use changed_fields array
  if (notification.changed_fields) {
    // Handle case where changed_fields might be a JSON string or object
    let fields: unknown = notification.changed_fields;
    if (typeof fields === 'string') {
      try {
        fields = JSON.parse(fields);
      } catch {
        // Not JSON, treat as single field
        return [fields as string];
      }
    }
    if (Array.isArray(fields)) {
      return fields.filter((f): f is string => typeof f === 'string');
    }
    // If it's an object, get keys
    if (typeof fields === 'object' && fields !== null) {
      return Object.keys(fields);
    }
  }
  
  // Priority 2: Extract from change_set
  if (notification.change_set && Array.isArray(notification.change_set)) {
    return notification.change_set.map(cs => cs.field);
  }
  
  // Priority 3: Compare before_data and after_data
  if (notification.before_data && notification.after_data) {
    const fields: string[] = [];
    const allKeys = new Set([
      ...Object.keys(notification.before_data),
      ...Object.keys(notification.after_data),
    ]);
    
    for (const key of allKeys) {
      const oldVal = notification.before_data[key];
      const newVal = notification.after_data[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        fields.push(key);
      }
    }
    return fields;
  }
  
  // No changed fields available
  return [];
}

/**
 * Check if changed fields contain ANY operational fields
 * Returns true if at least one OPS_FIELD is present
 */
function hasOpsFields(changedFields: string[]): boolean {
  const result = changedFields.some(field => OPS_FIELDS.has(field.toLowerCase()));
  if (result) {
    const matchedOps = changedFields.filter(f => OPS_FIELDS.has(f.toLowerCase()));
    console.log('[FilterNotifications] hasOpsFields=true, matched:', matchedOps);
  }
  return result;
}

/**
 * Check if ALL changed fields are tech-only fields
 * Returns true if every field is in TECH_FIELDS
 */
function isOnlyTechFields(changedFields: string[]): boolean {
  if (changedFields.length === 0) {
    return true;
  }
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

// =============================================================================
// MAIN FILTER FUNCTION
// =============================================================================

export interface FilterResult {
  visible: NotificationItem[];
  hidden: NotificationItem[];
  stats: {
    total: number;
    visible: number;
    hidden: number;
    hiddenReasons: Record<string, number>;
  };
}

/**
 * Filter notifications to hide technical UPDATE events that accompany primary events
 * 
 * @param notifications - Array of notification items (will not be mutated)
 * @returns Object with visible items, hidden items, and stats
 */
export function filterNotifications(notifications: readonly NotificationItem[]): FilterResult {
  
  // Don't mutate input - create a copy
  const items = [...notifications];
  
  // Sort by created_at descending for consistent processing
  items.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  // Build index of primary events by booking_id for O(1) lookup
  const primaryEventsByBooking = new Map<string, NotificationItem[]>();
  // Also collect ALL primary events for global time-based matching
  const allPrimaryEvents: NotificationItem[] = [];
  
  for (const item of items) {
    if (isPrimaryEvent(item.event_type)) {
      const bookingId = item.booking_id;
      if (!primaryEventsByBooking.has(bookingId)) {
        primaryEventsByBooking.set(bookingId, []);
      }
      primaryEventsByBooking.get(bookingId)!.push(item);
      allPrimaryEvents.push(item);
    }
  }
  
  // Process each notification
  const visible: NotificationItem[] = [];
  const hidden: NotificationItem[] = [];
  const hiddenReasons: Record<string, number> = {};
  
  for (const notification of items) {
    const decision = shouldShowNotification(notification, primaryEventsByBooking);

    if (decision.show) {
      visible.push(notification);
    } else {
      hidden.push(notification);
      hiddenReasons[decision.reason] = (hiddenReasons[decision.reason] || 0) + 1;
    }
  }
  
  return {
    visible,
    hidden,
    stats: {
      total: notifications.length,
      visible: visible.length,
      hidden: hidden.length,
      hiddenReasons,
    },
  };
}

/**
 * Simple filter that returns only visible notifications
 * For direct use in UI components
 */
export function filterNotificationsSimple(
  notifications: readonly NotificationItem[]
): NotificationItem[] {
  return filterNotifications(notifications).visible;
}

// =============================================================================
// DECISION LOGIC
// =============================================================================

interface ShowDecision {
  show: boolean;
  reason: string;
}

/**
 * Determine if a single notification should be shown
 * 
 * Rules (in order):
 * 1) NEW_BOOKING or CANCELLED → ALWAYS SHOW
 * 2) UPDATED with OPS_FIELDS → ALWAYS SHOW
 * 3) UPDATED with UNKNOWN fields → SHOW for traceability
 * 4) UPDATED with only TECH_FIELDS → HIDE (internal sync event)
 */
function shouldShowNotification(
  notification: NotificationItem,
  primaryEventsByBooking: Map<string, NotificationItem[]>
): ShowDecision {
  
  // RULE 1: Primary events always shown
  if (isPrimaryEvent(notification.event_type)) {
    return { show: true, reason: 'primary_event' };
  }
  
  // Only process update-type events from here
  if (!isUpdateEvent(notification.event_type)) {
    // Unknown event type - show by default
    return { show: true, reason: 'unknown_type_show_default' };
  }
  
  // Extract changed fields
  const changedFields = extractChangedFields(notification);
  
  // RULE 2.1: If ANY ops field changed → ALWAYS SHOW
  if (hasOpsFields(changedFields)) {
    return { show: true, reason: 'has_ops_fields' };
  }
  
  // RULE 2.2: Check if only tech fields
  if (!isOnlyTechFields(changedFields)) {
    // Has some non-tech, non-ops fields - show to be safe
    return { show: true, reason: 'has_unknown_fields' };
  }
  
  // At this point: UPDATED with only TECH_FIELDS
  
  // RULE 2.3a: First, try to match by booking_id (exact match)
  const primaryEventsForBooking = primaryEventsByBooking.get(notification.booking_id) || [];
  
  for (const primaryEvent of primaryEventsForBooking) {
    if (isWithinWindow(notification.created_at, primaryEvent.created_at)) {
      // Found primary event within window for same booking → HIDE
      return { 
        show: false, 
        reason: `tech_update_near_${normalizeEventType(primaryEvent.event_type).toLowerCase()}_same_booking`
      };
    }
  }
  
  // RULE 2.3b (REMOVED): Do NOT hide tech updates based on *other* bookings' primary events.
  // This was causing unrelated updates to disappear if they happened within WINDOW_SECONDS of any booking event.
  // We only de-dupe tech updates against primary events for the SAME booking_id.

  // RULE 2.4: Tech-only updates without nearby primary event → HIDE
  // These are internal sync/technical updates that user doesn't need to see
  return { show: false, reason: 'tech_only_internal_update' };
}

// =============================================================================
// TYPE GUARD HELPERS
// =============================================================================

/**
 * Type guard to check if an object is a valid NotificationItem
 */
export function isNotificationItem(obj: unknown): obj is NotificationItem {
  if (typeof obj !== 'object' || obj === null) return false;
  
  const item = obj as Record<string, unknown>;
  
  return (
    typeof item.id === 'string' &&
    typeof item.booking_id === 'string' &&
    typeof item.created_at === 'string' &&
    typeof item.event_type === 'string'
  );
}

/**
 * Validate and filter an array to only valid NotificationItems
 */
export function validateNotifications(items: unknown[]): NotificationItem[] {
  return items.filter(isNotificationItem);
}

// =============================================================================
// ADAPTER FOR BOOKING_CHANGES TABLE
// =============================================================================

/**
 * Adapter to convert booking_changes records to NotificationItem format
 */
export interface BookingChangeRecord {
  id: string;
  unified_booking_id: string;
  change_type: string;
  changed_fields?: string[] | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  created_at: string;
  change_source?: string | null;
}

export function bookingChangeToNotificationItem(
  change: BookingChangeRecord
): NotificationItem {
  // Map change_type to event_type
  let eventType: NotificationEventType;
  const changeType = change.change_type?.toUpperCase() || '';

  // Detect cancellation robustly (different sources may use different status fields)
  const statusRaw = (
    (change.after_data?.booking_status as string) ||
    (change.after_data?.status as string) ||
    (change.after_data?.channex_status as string) ||
    ''
  );
  const afterStatus = statusRaw.toUpperCase();

  if (changeType === 'INSERT') {
    eventType = 'NEW_BOOKING';
  } else if (afterStatus === 'CANCELLED' || afterStatus === 'CANCELED') {
    // Treat as primary cancellation event so it is ALWAYS visible
    eventType = 'CANCELLED';
  } else if (
    changeType === 'UPDATE' ||
    changeType === 'STATUS_CHANGE' ||
    changeType === 'AMOUNT_CHANGE' ||
    changeType === 'DATES_CHANGE' ||
    changeType === 'GUESTS_CHANGE'
  ) {
    eventType = 'UPDATED';
  } else {
    eventType = 'UPDATED';
  }

  return {
    id: change.id,
    booking_id: change.unified_booking_id,
    created_at: change.created_at,
    event_type: eventType,
    changed_fields: change.changed_fields || null,
    source: change.change_source || null,
    before_data: change.before_data || null,
    after_data: change.after_data || null,
  };
}

/**
 * Filter booking changes using the smart dedup logic
 */
export function filterBookingChanges(
  changes: readonly BookingChangeRecord[]
): BookingChangeRecord[] {
  // Convert to NotificationItems
  const notifications = changes.map(bookingChangeToNotificationItem);
  
  // Filter
  const result = filterNotifications(notifications);
  
  // Map back to original changes by ID
  const visibleIds = new Set(result.visible.map(n => n.id));
  
  return changes.filter(change => visibleIds.has(change.id));
}
