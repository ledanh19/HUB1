/**
 * BOOKING CHANGE EVENT HELPER
 * Shared logic for NotificationBell and LiveFeedEvents
 * 
 * KEY RULE: Event id MUST be `bc:${booking_changes.id}` 
 * This ensures 1 booking_change record = 1 event (no duplicates)
 */

import { format } from "date-fns";
import { vi } from "date-fns/locale";

export interface BookingChangeRecord {
  id: string;
  change_type: string;
  created_at: string;
  unified_booking_id: string;
  changed_fields?: string[] | null;
  after_data?: Record<string, unknown> | null;
  before_data?: Record<string, unknown> | null;
}

export interface BookingInfo {
  unified_booking_id: string;
  guest_name?: string;
  ota_source?: string | null;
  booking_status?: string;
  total_amount_net?: number | null;
  total_amount_gross?: number | null;
  check_in_date?: string;
  nights?: number;
  room_count?: number; // Number of rooms
}

export interface FeedEvent {
  id: string;
  type: "NEW_MESSAGE" | "NEW_BOOKING" | "MODIFICATION" | "CANCELLATION";
  title: string;
  subtitle: string;
  timestamp: string;
  source?: string;
  amount?: number;
  link?: string;
  isNew?: boolean;
  // Rich display fields
  guestName?: string;
  checkInDate?: string;
  nights?: number;
  bookedAt?: string; // formatted booking time
  // For rehydration comparison
  hasBookingJoin?: boolean;
  // PHASE 2.5: Flag noisy modifications (sync updates without significant changes)
  isNoisy?: boolean;
}

/**
 * Convert booking_changes record to FeedEvent
 * CRITICAL: id = `bc:${change.id}` to dedupe by change record
 */
export function bookingChangeToEvent(
  change: BookingChangeRecord,
  bookingsById: Record<string, BookingInfo>,
  lastReadAt?: Date,
  useVietnameseLabels = true
): FeedEvent | null {
  // AUDIT LOG: Log every incoming change for debugging
  console.log('[AUDIT] bookingChangeToEvent incoming:', {
    changeId: change.id,
    changeType: change.change_type,
    bookingId: change.unified_booking_id,
    changedFields: change.changed_fields,
    createdAt: change.created_at,
  });

  // Skip changes without unified_booking_id
  if (!change.unified_booking_id) {
    console.log('[bookingChangeToEvent] SKIP: no unified_booking_id', { changeId: change.id });
    return null;
  }

  const bookingId = change.unified_booking_id;
  const booking = bookingsById[bookingId];
  const afterData = change.after_data || {};
  const beforeData = change.before_data || {};

  // Determine event type based on THIS specific change
  // PHASE 2 FIX: Event Precedence Rules - CANCELLATION must be STATUS TRANSITION
  let eventType: FeedEvent["type"];

  if (change.change_type === "INSERT") {
    eventType = "NEW_BOOKING";
  } else {
    // CRITICAL FIX: Only use booking_status for cancellation detection
    // DO NOT use channex_status - it can be stale/inconsistent
    const statusAfter = ((afterData.booking_status as string) || "").toUpperCase();
    const statusBefore = ((beforeData.booking_status as string) || "").toUpperCase();

    // Helper function
    const isCancelledStatus = (status: string) =>
      status === "CANCELLED" || status === "CANCELED";

    // CRITICAL: If we don't have both before AND after booking_status, 
    // we CANNOT determine if this is a cancellation → default to MODIFICATION
    const hasStatusData = statusBefore !== "" || statusAfter !== "";

    // Rule: CANCELLATION only when:
    // 1. We have status data
    // 2. status_before was NOT cancelled
    // 3. status_after IS cancelled
    const wasCancelled = isCancelledStatus(statusBefore);
    const nowCancelled = isCancelledStatus(statusAfter);

    // PHASE 2.1 FIX: Add extra safeguard - only TRUE transition
    const isTrueCancellation = hasStatusData && nowCancelled && !wasCancelled && statusBefore !== "";

    if (isTrueCancellation) {
      eventType = "CANCELLATION";
      console.log('[AUDIT] TRUE CANCELLATION detected:', {
        changeId: change.id,
        statusBefore,
        statusAfter,
        changeType: change.change_type,
      });
    } else {
      // Everything else is MODIFICATION
      eventType = "MODIFICATION";

      // Debug log for false cancellation prevention
      if (nowCancelled) {
        console.log('[AUDIT] MODIFICATION (not cancellation) - already cancelled or missing data:', {
          changeId: change.id,
          statusBefore,
          statusAfter,
          wasCancelled,
          hasStatusData,
          reason: !hasStatusData ? 'missing_status_data' :
            wasCancelled ? 'already_cancelled' :
              statusBefore === "" ? 'empty_before_status' : 'unknown'
        });
      }
    }
  }

  // AUDIT LOG: Log determined event type
  console.log('[AUDIT] Determined eventType:', {
    changeId: change.id,
    dbChangeType: change.change_type,
    uiEventType: eventType,
  });

  // PHASE 2.5 FIX: NEVER drop MODIFICATION, just flag as noisy if non-significant
  // This ensures all MODIFICATIONs appear in Notification/LiveFeed
  let isNoisyModification = false;
  if (eventType === "MODIFICATION") {
    const changedFields = change.changed_fields;
    if (changedFields && changedFields.length > 0) {
      // PHASE 2 EXPANDED: Include all meaningful booking fields
      const significantFields = [
        // Date/time fields
        'check_in_date', 'check_out_date', 'nights',
        // Amount fields  
        'total_amount_net', 'total_amount_gross', 'amount',
        'payment_type', 'commission_amount', 'commission_rate',
        // Guest fields
        'guest_name', 'guest_phone', 'guest_email',
        'guests', 'adults', 'children', 'infants', 'number_of_guests',
        // Room/property fields
        'room_type', 'room_type_id', 'rate_plan', 'rate_plan_id',
        'property_id', 'property_name',
        // Status fields (but not channex_status which is noisy)
        'booking_status', 'status',
        // Notes
        'notes', 'special_requests', 'guest_notes',
        // Room lines indicator (from room_lines trigger)
        'room_lines_changed',
      ];
      const hasSignificant = changedFields.some(f => significantFields.includes(f));
      if (!hasSignificant) {
        // PHASE 2.5: Mark as noisy but DO NOT DROP
        isNoisyModification = true;
        console.log('[AUDIT] MODIFICATION flagged as NOISY (non-significant fields):', {
          changeId: change.id,
          changedFields,
        });
      } else {
        console.log('[AUDIT] MODIFICATION ACCEPTED (significant fields):', {
          changeId: change.id,
          changedFields,
        });
      }
    } else {
      // changedFields is empty/null - this is a sync update, flag as noisy
      isNoisyModification = true;
      console.log('[AUDIT] MODIFICATION flagged as NOISY (empty changed_fields):', {
        changeId: change.id,
      });
    }
  }

  // Get booking info with fallback chain
  const guestName = booking?.guest_name
    || (afterData.guest_name as string)
    || (beforeData.guest_name as string)
    || "Unknown";
  const checkInDate = booking?.check_in_date
    || (afterData.check_in_date as string)
    || (beforeData.check_in_date as string)
    || null;
  const nights = booking?.nights
    || (afterData.nights as number)
    || (beforeData.nights as number)
    || 1;
  const roomCount = booking?.room_count || 1;
  const otaSource = booking?.ota_source
    || (afterData.ota_source as string)
    || (beforeData.ota_source as string)
    || null;

  // For CANCELLED bookings, amount = 0
  const isCancelledBooking = eventType === "CANCELLATION";
  const rawAmount = Number(afterData.total_amount_net || booking?.total_amount_net || beforeData.total_amount_net) || 0;
  const amount = isCancelledBooking ? 0 : rawAmount;

  const checkInFormatted = checkInDate
    ? format(new Date(checkInDate), "dd/MM/yyyy", { locale: vi })
    : "";

  const eventTime = new Date(change.created_at);
  // Format time in Vietnam timezone using Intl API
  const vnTimeStr = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  }).format(eventTime);

  // Generate subtitle based on event type
  const roomNightLabel = roomCount > 1
    ? `${roomCount} phòng x ${nights} đêm`
    : `${nights} đêm`;

  let subtitle: string;
  if (eventType === "NEW_BOOKING") {
    subtitle = useVietnameseLabels
      ? `${roomNightLabel} | Đặt lúc ${vnTimeStr}`
      : `${guestName} | ${roomCount} room x ${nights} night${nights > 1 ? "s" : ""} | Booked at ${vnTimeStr}`;
  } else if (eventType === "CANCELLATION") {
    subtitle = useVietnameseLabels
      ? `${roomNightLabel} | Hủy lúc ${vnTimeStr}`
      : `${guestName} | Cancelled at ${vnTimeStr}`;
  } else {
    // MODIFICATION - show what changed based on change_type
    const changedFields = change.changed_fields;
    let changeDesc: string;

    // PHASE 2: Human-readable descriptions based on change_type
    const changeTypeLabels: Record<string, { vi: string; en: string }> = {
      'DATES_CHANGE': { vi: 'Đổi ngày check-in/out', en: 'Dates changed' },
      'GUESTS_CHANGE': { vi: 'Đổi số khách', en: 'Guests changed' },
      'AMOUNT_CHANGE': { vi: 'Đổi giá', en: 'Amount changed' },
      'STATUS_CHANGE': { vi: 'Đổi trạng thái', en: 'Status changed' },
      'ROOM_LINE_ADDED': { vi: 'Thêm phòng', en: 'Room added' },
      'ROOM_LINE_MODIFIED': { vi: 'Đổi loại phòng', en: 'Room type changed' },
      'ROOM_LINE_REMOVED': { vi: 'Xóa phòng', en: 'Room removed' },
    };

    if (isNoisyModification) {
      // PHASE 2.5: Noisy modification - show sync indicator
      changeDesc = useVietnameseLabels ? "Đồng bộ dữ liệu" : "Data sync";
    } else if (changeTypeLabels[change.change_type]) {
      // Use predefined label for known change types
      changeDesc = useVietnameseLabels
        ? changeTypeLabels[change.change_type].vi
        : changeTypeLabels[change.change_type].en;
    } else if (changedFields?.length) {
      // Significant fields changed - show them
      // Map field names to human-readable labels
      const fieldLabels: Record<string, { vi: string; en: string }> = {
        'check_in_date': { vi: 'Ngày CI', en: 'Nhận phòng' },
        'check_out_date': { vi: 'Ngày CO', en: 'Trả phòng' },
        'nights': { vi: 'Số đêm', en: 'Nights' },
        'guests': { vi: 'Số khách', en: 'Guests' },
        'adults': { vi: 'Người lớn', en: 'Adults' },
        'children': { vi: 'Trẻ em', en: 'Children' },
        'total_amount_net': { vi: 'Giá', en: 'Amount' },
        'room_type': { vi: 'Loại phòng', en: 'Room type' },
        'guest_name': { vi: 'Tên khách', en: 'Guest name' },
        'room_lines_changed': { vi: 'Thông tin phòng', en: 'Room info' },
      };

      const readableFields = changedFields.slice(0, 2).map(f => {
        const label = fieldLabels[f];
        return label ? (useVietnameseLabels ? label.vi : label.en) : f;
      });
      changeDesc = readableFields.join(", ") + (changedFields.length > 2 ? "..." : "");
    } else {
      changeDesc = useVietnameseLabels ? "Cập nhật" : "Updated";
    }

    subtitle = useVietnameseLabels
      ? `${roomNightLabel} | ${changeDesc} | ${vnTimeStr}`
      : `${guestName} | ${changeDesc} | ${vnTimeStr}`;
  }

  // Title format differs between components
  const title = useVietnameseLabels
    ? `${guestName}${checkInFormatted ? ` - CI: ${checkInFormatted}` : ""}`
    : (checkInFormatted
      ? format(new Date(checkInDate!), "EEE, MMM dd, yyyy", { locale: vi })
      : bookingId);

  // Log for debugging
  console.log('[bookingChangeToEvent] CREATE event:', {
    eventId: `bc:${change.id}`,
    changeId: change.id,
    changeType: change.change_type,
    eventType,
    bookingId,
    hasBookingJoin: !!booking,
    guestName,
    isNoisy: isNoisyModification,
  });

  return {
    id: `bc:${change.id}`, // CRITICAL: Use booking_changes.id for dedupe
    type: eventType,
    title,
    subtitle,
    timestamp: change.created_at,
    source: normalizeOtaSource(otaSource),
    amount,
    link: `/bookings/${bookingId}`,
    isNew: lastReadAt ? eventTime > lastReadAt : false,
    hasBookingJoin: !!booking,
    isNoisy: isNoisyModification, // PHASE 2.5: Flag for UI styling
    // Rich display fields
    guestName,
    checkInDate: checkInFormatted,
    nights,
    bookedAt: vnTimeStr,
  };
}

/**
 * PHASE 2: Merge incoming event into existing events array with BURST HANDLING
 * 
 * DEDUPE RULES:
 * 1. If bc:${change.id} already exists, REHYDRATE (update) instead of append
 * 2. For MODIFICATION events within same booking + 60s window: MERGE into single event
 * 3. For CANCELLATION/NEW_BOOKING: Never merge, always separate
 * 
 * BURST HANDLING:
 * - Multiple MODIFICATION events for same booking within 60s = merge into 1 with updateCount
 * - CANCELLATION always wins over MODIFICATION in same window
 */
export interface FeedEventWithBurst extends FeedEvent {
  updateCount?: number;
  mergedChangeIds?: string[];
}

export function mergeBookingChangeEvent(
  prevEvents: FeedEvent[],
  incoming: FeedEvent,
  source: "initial_fetch" | "realtime_insert" | "realtime_update"
): FeedEvent[] {
  // Extract bookingId from link for canonical key
  const incomingBookingId = incoming.link?.replace('/bookings/', '') || '';
  const incomingCanonicalKey = `${incomingBookingId}:${incoming.type}`;

  // PHASE A LOG: Critical debug info for double detection
  console.log('[DEDUPE_DEBUG]', {
    incomingSource: source,
    eventId: incoming.id,
    bookingId: incomingBookingId,
    eventType: incoming.type,
    timestamp: incoming.timestamp,
    canonicalKey: incomingCanonicalKey,
    hasBookingJoin: incoming.hasBookingJoin,
    prevEventsCount: prevEvents.length,
  });

  // TYPE 1 DEDUPE: Find existing event with same ID (bc:${change.id})
  const existingByIdIndex = prevEvents.findIndex(e => e.id === incoming.id);

  if (existingByIdIndex >= 0) {
    const existing = prevEvents[existingByIdIndex];

    // REHYDRATE: Update existing event if incoming is more complete
    if (incoming.hasBookingJoin && !existing.hasBookingJoin) {
      console.log('[DEDUPE_DEBUG] TYPE1_REHYDRATE: replacing with more complete event', {
        eventId: incoming.id,
      });
      const updated = [...prevEvents];
      updated[existingByIdIndex] = incoming;
      return updated;
    }

    console.log('[DEDUPE_DEBUG] TYPE1_SKIP: same change.id already exists', { eventId: incoming.id });
    return prevEvents;
  }

  // PHASE 2: BURST MERGE for MODIFICATION events
  // Look for existing MODIFICATION for same booking within 60s window
  if (incoming.type === "MODIFICATION") {
    const incomingTime = new Date(incoming.timestamp).getTime();
    const BURST_WINDOW_MS = 60000; // 60 seconds

    // Find all MODIFICATION events for same booking within burst window
    const burstCandidateIndex = prevEvents.findIndex(e => {
      if (e.type !== "MODIFICATION") return false;

      const eBookingId = e.link?.replace('/bookings/', '') || '';
      if (eBookingId !== incomingBookingId) return false;

      const eTime = new Date(e.timestamp).getTime();
      return Math.abs(eTime - incomingTime) < BURST_WINDOW_MS;
    });

    if (burstCandidateIndex >= 0) {
      const existing = prevEvents[burstCandidateIndex] as FeedEventWithBurst;

      // BURST MERGE: Combine into single event with count
      const currentCount = existing.updateCount || 1;
      const mergedIds = existing.mergedChangeIds || [existing.id];

      // Use the most recent timestamp
      const newerTimestamp = new Date(incoming.timestamp) > new Date(existing.timestamp)
        ? incoming.timestamp
        : existing.timestamp;

      // Create merged event
      const mergedEvent: FeedEventWithBurst = {
        ...existing,
        id: incoming.id, // Use newest change.id as primary
        timestamp: newerTimestamp,
        updateCount: currentCount + 1,
        mergedChangeIds: [...mergedIds, incoming.id],
        // Use better data if available
        hasBookingJoin: incoming.hasBookingJoin || existing.hasBookingJoin,
        isNoisy: existing.isNoisy && incoming.isNoisy, // Only noisy if ALL are noisy
        subtitle: existing.subtitle.includes(' lần')
          ? existing.subtitle.replace(/\d+ lần/, `${currentCount + 1} lần`)
          : `Cập nhật ${currentCount + 1} lần`,
      };

      console.log('[DEDUPE_DEBUG] BURST_MERGE: combining MODIFICATION events', {
        existingId: existing.id,
        incomingId: incoming.id,
        newCount: currentCount + 1,
        bookingId: incomingBookingId,
      });

      const updated = [...prevEvents];
      updated[burstCandidateIndex] = mergedEvent;
      return updated;
    }
  }

  // TYPE 2 DEDUPE: Check for CANCELLATION/NEW_BOOKING with same canonical key  
  // For these critical events, we DON'T merge - but skip true duplicates
  if (incoming.type === "CANCELLATION" || incoming.type === "NEW_BOOKING") {
    const existingByCanonicalIndex = prevEvents.findIndex(e => {
      const eBookingId = e.link?.replace('/bookings/', '') || '';
      const eCanonicalKey = `${eBookingId}:${e.type}`;
      return eCanonicalKey === incomingCanonicalKey;
    });

    if (existingByCanonicalIndex >= 0) {
      const existing = prevEvents[existingByCanonicalIndex];
      const existingTime = new Date(existing.timestamp).getTime();
      const incomingTime = new Date(incoming.timestamp).getTime();
      const timeDiffMs = Math.abs(existingTime - incomingTime);

      // Within 60s = duplicate, skip
      if (timeDiffMs < 60000) {
        // Keep the one with more complete data
        if (incoming.hasBookingJoin && !existing.hasBookingJoin) {
          console.log('[DEDUPE_DEBUG] CRITICAL_REPLACE: replacing with better join', {
            existingId: existing.id,
            incomingId: incoming.id,
            type: incoming.type,
          });
          const updated = [...prevEvents];
          updated[existingByCanonicalIndex] = incoming;
          return updated;
        }

        console.log('[DEDUPE_DEBUG] CRITICAL_SKIP: duplicate within 60s', {
          existingId: existing.id,
          incomingId: incoming.id,
          type: incoming.type,
        });
        return prevEvents;
      }
      // Outside 60s = genuinely different events (e.g., re-cancelled)
    }
  }

  // PHASE 2: CANCELLATION precedence check
  // If incoming is CANCELLATION, remove any MODIFICATION for same booking in same window
  if (incoming.type === "CANCELLATION") {
    const incomingTime = new Date(incoming.timestamp).getTime();
    const PRECEDENCE_WINDOW_MS = 60000;

    const modificationToRemoveIndex = prevEvents.findIndex(e => {
      if (e.type !== "MODIFICATION") return false;

      const eBookingId = e.link?.replace('/bookings/', '') || '';
      if (eBookingId !== incomingBookingId) return false;

      const eTime = new Date(e.timestamp).getTime();
      return Math.abs(eTime - incomingTime) < PRECEDENCE_WINDOW_MS;
    });

    if (modificationToRemoveIndex >= 0) {
      console.log('[DEDUPE_DEBUG] CANCELLATION_PRECEDENCE: removing MODIFICATION in same window', {
        removedId: prevEvents[modificationToRemoveIndex].id,
        cancellationId: incoming.id,
        bookingId: incomingBookingId,
      });
      // Remove the MODIFICATION and add CANCELLATION
      const updated = prevEvents.filter((_, i) => i !== modificationToRemoveIndex);
      return [incoming, ...updated];
    }
  }

  // New event - prepend to beginning (most recent first)
  console.log('[DEDUPE_DEBUG] APPEND: new event', {
    eventId: incoming.id,
    canonicalKey: incomingCanonicalKey
  });
  return [incoming, ...prevEvents];
}

/**
 * Normalize OTA source for logo matching
 */
export function normalizeOtaSource(source: string | null | undefined): string | undefined {
  if (!source) return undefined;
  const upper = source.toUpperCase().trim();
  if (upper.includes('CTRIP')) return 'CTRIP';
  if (upper.includes('AGODA')) return 'AGODA';
  if (upper.includes('BOOKING')) return 'BOOKING.COM';
  if (upper.includes('EXPEDIA')) return 'EXPEDIA';
  if (upper.includes('TRAVELOKA')) return 'TRAVELOKA';
  return upper;
}
