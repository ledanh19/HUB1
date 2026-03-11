/**
 * BOOKING CHANGE DEDUPER
 * 
 * FIX for duplicate notification bug where:
 * - Bug 1: NEW_BOOKING (webhook) + MODIFICATION (sync) appear as 2 items
 * - Bug 2: CANCELLED appears 2x (one from webhook, one from sync)
 * 
 * ROOT CAUSE: Both channex-webhook AND sync-channex-bookings write to booking_changes
 * with different change_source (CHANNEX_WEBHOOK vs CHANNEX_SYNC) for the same logical event.
 * 
 * SOLUTION: Dedupe at frontend layer using canonical key = booking_id + canonical_type + time_bucket
 * Priority: WEBHOOK > SYNC (webhook is real-time, sync is poll)
 */

import type { BookingChangeRecord, FeedEvent } from './bookingChangeEventHelper';

// Extended interface with change_source
export interface BookingChangeRecordWithSource extends BookingChangeRecord {
  change_source?: string | null;
}

export interface NormalizedEvent {
  key: string; // Dedupe key: booking_id:canonical_type:time_bucket
  canonical_type: 'NEW_BOOKING' | 'UPDATED' | 'CANCELLED' | 'STATUS_CHANGED';
  canonical_source_priority: 'WEBHOOK' | 'SYNC';
  occurred_at: string;
  booking_id: string;
  changed_fields: string[];
  raw_sources: string[];
  raw_change_ids: string[];
  // For merging
  merged_count: number;
  // Fallback data from after_data (when bookings_mirror doesn't have info)
  fallback_guest_name?: string;
  fallback_ota_source?: string;
  fallback_amount?: number;
  fallback_check_in_date?: string;
  fallback_nights?: number;
}

// Time bucket: 5 minutes window for deduplication (tighter to prevent over-merging)
// CRITICAL: Same booking + same canonical_type within 5 minutes = same logical event
const DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function getTimeBucket(timestamp: string): string {
  const date = new Date(timestamp);
  // Round down to 5-minute intervals
  const bucket = Math.floor(date.getTime() / DEDUPE_WINDOW_MS) * DEDUPE_WINDOW_MS;
  return new Date(bucket).toISOString();
}

function getCanonicalType(change: BookingChangeRecordWithSource): NormalizedEvent['canonical_type'] {
  const changeType = change.change_type?.toUpperCase() || '';
  
  // Check for cancellation via booking_status in after_data FIRST
  // This handles the case where a booking arrives ALREADY CANCELLED from OTA
  const afterStatus = ((change.after_data?.booking_status as string) || '').toUpperCase();
  const beforeStatus = ((change.before_data?.booking_status as string) || '').toUpperCase();
  
  // FIX: If INSERT but already cancelled → show as CANCELLED, not NEW_BOOKING
  // This happens when Channex sends a booking that was already cancelled before first sync
  if (afterStatus === 'CANCELLED' || afterStatus === 'CANCELED') {
    // If before was also cancelled (UPDATE on cancelled booking), treat as STATUS_CHANGED
    if (beforeStatus === 'CANCELLED' || beforeStatus === 'CANCELED') {
      return 'STATUS_CHANGED';
    }
    // INSERT of already-cancelled booking OR UPDATE that caused cancellation
    return 'CANCELLED';
  }
  
  // INSERT of non-cancelled booking = NEW_BOOKING
  if (changeType === 'INSERT') {
    return 'NEW_BOOKING';
  }
  
  // STATUS_CHANGE without cancellation
  if (changeType === 'STATUS_CHANGE') {
    return 'STATUS_CHANGED';
  }
  
  // Everything else = UPDATED
  return 'UPDATED';
}

function getSourcePriority(changeSource: string | null | undefined): NormalizedEvent['canonical_source_priority'] {
  const source = (changeSource || '').toUpperCase();
  if (source.includes('WEBHOOK')) return 'WEBHOOK';
  return 'SYNC';
}

/**
 * DEDUPE RULES:
 * 
 * Rule A — NEW + UPDATE gần nhau (10 min):
 *   If NEW_BOOKING (WEBHOOK) + UPDATED (SYNC) for same booking within 10 min
 *   → Merge into NEW_BOOKING, keep WEBHOOK source
 * 
 * Rule B — CANCELLED double:
 *   If CANCELLED appears from both WEBHOOK + SYNC within 10 min
 *   → Keep only WEBHOOK version
 * 
 * Rule C — UPDATE spam:
 *   Multiple UPDATED for same booking within 10 min
 *   → Collapse into single UPDATED with merged_count
 * 
 * Rule D — Deterministic:
 *   Sort by occurred_at DESC, WEBHOOK before SYNC
 */
export function dedupeBookingChanges(
  changes: BookingChangeRecordWithSource[]
): NormalizedEvent[] {
  // Group by canonical key
  const groups = new Map<string, BookingChangeRecordWithSource[]>();
  
  for (const change of changes) {
    if (!change.unified_booking_id) continue;
    
    const canonicalType = getCanonicalType(change);
    const timeBucket = getTimeBucket(change.created_at);
    const key = `${change.unified_booking_id}:${canonicalType}:${timeBucket}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(change);
  }
  
  // Merge each group into single normalized event
  const normalizedEvents: NormalizedEvent[] = [];
  
  for (const [key, groupChanges] of groups) {
    // Sort by source priority (WEBHOOK first) then by created_at DESC
    groupChanges.sort((a, b) => {
      const aPriority = getSourcePriority(a.change_source) === 'WEBHOOK' ? 0 : 1;
      const bPriority = getSourcePriority(b.change_source) === 'WEBHOOK' ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    
    const primary = groupChanges[0];
    const canonicalType = getCanonicalType(primary);
    
    // Merge changed_fields from all changes in group
    const allChangedFields = new Set<string>();
    const allSources = new Set<string>();
    const allChangeIds: string[] = [];
    
    // Extract fallback data from after_data (try all changes to find data)
    let fallbackGuestName: string | undefined;
    let fallbackOtaSource: string | undefined;
    let fallbackAmount: number | undefined;
    let fallbackCheckInDate: string | undefined;
    let fallbackNights: number | undefined;
    
    for (const change of groupChanges) {
      if (change.changed_fields) {
        change.changed_fields.forEach(f => allChangedFields.add(f));
      }
      if (change.change_source) {
        allSources.add(change.change_source);
      }
      allChangeIds.push(change.id);
      
      // Extract fallback data from after_data
      const afterData = change.after_data || {};
      if (!fallbackGuestName && afterData.guest_name) {
        fallbackGuestName = afterData.guest_name as string;
      }
      if (!fallbackOtaSource && afterData.ota_source) {
        fallbackOtaSource = afterData.ota_source as string;
      }
      if (!fallbackAmount && (afterData.total_amount_gross || afterData.total_amount_net)) {
        fallbackAmount = (afterData.total_amount_gross || afterData.total_amount_net) as number;
      }
      if (!fallbackCheckInDate && afterData.check_in_date) {
        fallbackCheckInDate = afterData.check_in_date as string;
      }
      if (!fallbackNights && afterData.nights) {
        fallbackNights = afterData.nights as number;
      }
    }
    
    normalizedEvents.push({
      key,
      canonical_type: canonicalType,
      canonical_source_priority: getSourcePriority(primary.change_source),
      occurred_at: primary.created_at,
      booking_id: primary.unified_booking_id,
      changed_fields: Array.from(allChangedFields),
      raw_sources: Array.from(allSources),
      raw_change_ids: allChangeIds,
      merged_count: groupChanges.length,
      // Fallback data
      fallback_guest_name: fallbackGuestName,
      fallback_ota_source: fallbackOtaSource,
      fallback_amount: fallbackAmount,
      fallback_check_in_date: fallbackCheckInDate,
      fallback_nights: fallbackNights,
    });
  }
  
  // Sort by occurred_at DESC
  normalizedEvents.sort((a, b) => 
    new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  );
  
  return normalizedEvents;
}

/**
 * RULE A SPECIAL: NEW_BOOKING absorbs nearby UPDATED
 * 
 * If there's a NEW_BOOKING and an UPDATED for same booking within 10 min,
 * the UPDATED is likely just sync enrichment → hide it
 */
export function applyNewBookingAbsorption(events: NormalizedEvent[]): NormalizedEvent[] {
  const newBookingKeys = new Set<string>();
  
  // Find all NEW_BOOKING events
  for (const event of events) {
    if (event.canonical_type === 'NEW_BOOKING') {
      // Key for absorption: booking_id:time_bucket (without type)
      const [bookingId, , timeBucket] = event.key.split(':');
      newBookingKeys.add(`${bookingId}:${timeBucket}`);
    }
  }
  
  // Filter out UPDATED events that are absorbed by NEW_BOOKING
  return events.filter(event => {
    if (event.canonical_type !== 'UPDATED') return true;
    
    const [bookingId, , timeBucket] = event.key.split(':');
    const absorbKey = `${bookingId}:${timeBucket}`;
    
    if (newBookingKeys.has(absorbKey)) {
      console.log('[DEDUPE] ABSORBED: UPDATED hidden because NEW_BOOKING exists in same window', {
        bookingId,
        timeBucket,
        updatedKey: event.key,
      });
      return false;
    }
    return true;
  });
}

/**
 * RULE B SPECIAL: CANCELLED absorbs subsequent UPDATED for same booking
 * 
 * After a cancellation, sync may still run and create UPDATE records for 
 * irrelevant field changes (guest_name, channex_revision_id, etc).
 * These should be hidden to avoid confusing "thay đổi" notifications after "hủy phòng".
 * 
 * Window: 30 minutes after cancellation
 */
export function applyCancelledAbsorption(events: NormalizedEvent[]): NormalizedEvent[] {
  // Build map: bookingId -> earliest cancellation timestamp
  const cancelledBookings = new Map<string, number>();
  
  for (const event of events) {
    if (event.canonical_type === 'CANCELLED') {
      const bookingId = event.booking_id;
      const cancelTime = new Date(event.occurred_at).getTime();
      
      // Keep earliest cancellation time
      const existing = cancelledBookings.get(bookingId);
      if (!existing || cancelTime < existing) {
        cancelledBookings.set(bookingId, cancelTime);
      }
    }
  }
  
  // Filter out UPDATED/STATUS_CHANGED events that happen AFTER cancellation
  const POST_CANCEL_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
  
  return events.filter(event => {
    // Keep non-update events
    if (event.canonical_type !== 'UPDATED' && event.canonical_type !== 'STATUS_CHANGED') {
      return true;
    }
    
    const cancelTime = cancelledBookings.get(event.booking_id);
    if (!cancelTime) return true; // No cancellation for this booking
    
    const eventTime = new Date(event.occurred_at).getTime();
    
    // If this update/status_change happened AFTER cancellation (within 30 min window), hide it
    if (eventTime > cancelTime && eventTime - cancelTime < POST_CANCEL_WINDOW_MS) {
      console.log('[DEDUPE] ABSORBED: Update hidden because CANCELLED exists earlier', {
        bookingId: event.booking_id,
        eventType: event.canonical_type,
        eventTime: event.occurred_at,
        cancelTime: new Date(cancelTime).toISOString(),
        diffMinutes: Math.round((eventTime - cancelTime) / 60000),
      });
      return false;
    }
    
    return true;
  });
}

/**
 * Convert normalized events back to FeedEvent[] for UI rendering
 */
export function normalizedToFeedEvents(
  normalizedEvents: NormalizedEvent[],
  bookingsById: Record<string, { guest_name?: string; ota_source?: string | null; total_amount_net?: number | null; total_amount_gross?: number | null; check_in_date?: string; nights?: number }>,
  lastReadAt?: Date,
  useVietnameseLabels = true
): FeedEvent[] {
  const feedEvents: FeedEvent[] = [];
  
  for (const event of normalizedEvents) {
    const booking = bookingsById[event.booking_id];
    
    // Debug: log data sources
    if (!booking) {
      console.log('[DEDUPE] No booking found for:', event.booking_id, '- using fallbacks:', {
        fallback_guest_name: event.fallback_guest_name,
        fallback_ota_source: event.fallback_ota_source,
        fallback_amount: event.fallback_amount,
        fallback_nights: event.fallback_nights,
      });
    }
    
    // Use booking data with fallback from after_data
    const guestName = booking?.guest_name || event.fallback_guest_name || 'Unknown';
    const otaSource = booking?.ota_source || event.fallback_ota_source || null;
    // Use total_amount_gross (doanh thu) for display, fallback to net, then fallback_amount
    const amount = event.canonical_type === 'CANCELLED' 
      ? 0 
      : (booking?.total_amount_gross || booking?.total_amount_net || event.fallback_amount || 0);
    const checkInDate = booking?.check_in_date || event.fallback_check_in_date;
    const nights = booking?.nights || event.fallback_nights || 1;
    
    let type: FeedEvent['type'];
    const subtitleParts: string[] = [];
    
    switch (event.canonical_type) {
      case 'NEW_BOOKING':
        type = 'NEW_BOOKING';
        break;
      case 'CANCELLED':
        type = 'CANCELLATION';
        break;
      default:
        type = 'MODIFICATION';
    }
    
    // Build subtitle - Format time in Vietnam timezone (UTC+7)
    const eventTime = new Date(event.occurred_at);
    const timeStr = new Intl.DateTimeFormat('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
    }).format(eventTime);
    
    if (event.canonical_type === 'NEW_BOOKING') {
      subtitleParts.push(`${nights} đêm`);
      subtitleParts.push(`Đặt lúc ${timeStr}`);
    } else if (event.canonical_type === 'CANCELLED') {
      subtitleParts.push(`${nights} đêm`);
      subtitleParts.push(`Hủy lúc ${timeStr}`);
    } else {
      // MODIFICATION
      if (event.merged_count > 1) {
        subtitleParts.push(`Cập nhật ${event.merged_count} lần`);
      } else if (event.changed_fields.length > 0) {
        // Show changed fields
        const fieldLabels: Record<string, string> = {
          'check_in_date': 'Ngày CI',
          'check_out_date': 'Ngày CO',
          'nights': 'Số đêm',
          'total_amount_net': 'Giá',
          'guest_name': 'Tên khách',
          'booking_status': 'Trạng thái',
        };
        const readable = event.changed_fields
          .slice(0, 2)
          .map(f => fieldLabels[f] || f)
          .join(', ');
        subtitleParts.push(readable + (event.changed_fields.length > 2 ? '...' : ''));
      } else {
        subtitleParts.push('Đồng bộ dữ liệu');
      }
      subtitleParts.push(timeStr);
    }
    
    // REMOVED: Do not show internal source info in UI (WEBHOOK+SYNC)
    // This was causing confusion for end users
    // if (event.raw_sources.length > 1) {
    //   subtitleParts.push(`(${event.raw_sources.map(s => s.replace('CHANNEX_', '')).join('+')})`);
    // }
    
    const checkInFormatted = checkInDate 
      ? new Date(checkInDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    
    // Note: nights already calculated above, use it directly
    
    // Debug: log final FeedEvent data
    console.log('[DEDUPE] Creating FeedEvent:', {
      bookingId: event.booking_id,
      guestName,
      otaSource,
      amount,
      nights,
      checkInFormatted,
      hasBookingData: !!booking,
    });
    
    feedEvents.push({
      id: `dedupe:${event.key}`, // Use dedupe key as ID
      type,
      title: `${guestName}${checkInFormatted ? ` - CI: ${checkInFormatted}` : ''}`,
      subtitle: subtitleParts.join(' | '),
      timestamp: event.occurred_at,
      source: normalizeOtaSource(otaSource),
      amount,
      link: `/bookings/${event.booking_id}`,
      isNew: lastReadAt ? eventTime > lastReadAt : false,
      hasBookingJoin: !!booking,
      isNoisy: event.canonical_type === 'UPDATED' && event.changed_fields.length === 0,
      // Rich display fields
      guestName,
      checkInDate: checkInFormatted,
      nights,
      bookedAt: timeStr,
    });
  }
  
  return feedEvents;
}

function normalizeOtaSource(source: string | null | undefined): string | undefined {
  if (!source) return undefined;
  const upper = source.toUpperCase().trim();
  if (upper.includes('CTRIP')) return 'CTRIP';
  if (upper.includes('AGODA')) return 'AGODA';
  if (upper.includes('BOOKING')) return 'BOOKING.COM';
  if (upper.includes('EXPEDIA')) return 'EXPEDIA';
  if (upper.includes('TRAVELOKA')) return 'TRAVELOKA';
  return upper;
}

/**
 * MAIN ENTRY: Process raw booking_changes into deduplicated FeedEvents
 */
export function processBookingChangesToFeedEvents(
  rawChanges: BookingChangeRecordWithSource[],
  bookingsById: Record<string, { guest_name?: string; ota_source?: string | null; total_amount_net?: number | null; total_amount_gross?: number | null; check_in_date?: string; nights?: number }>,
  lastReadAt?: Date,
  useVietnameseLabels = true
): FeedEvent[] {
  console.log('[DEDUPE] Input raw changes:', rawChanges.length);
  
  // Step 1: Dedupe by canonical key (booking_id + type + time_bucket)
  let normalized = dedupeBookingChanges(rawChanges);
  console.log('[DEDUPE] After canonical dedupe:', normalized.length);
  
  // Step 2: Apply NEW_BOOKING absorption (hide UPDATED near NEW_BOOKING)
  normalized = applyNewBookingAbsorption(normalized);
  console.log('[DEDUPE] After NEW_BOOKING absorption:', normalized.length);
  
  // Step 3: Apply CANCELLED absorption (hide UPDATED after CANCELLED)
  normalized = applyCancelledAbsorption(normalized);
  console.log('[DEDUPE] After CANCELLED absorption:', normalized.length);
  
  // Step 4: Convert to FeedEvents
  const feedEvents = normalizedToFeedEvents(normalized, bookingsById, lastReadAt, useVietnameseLabels);
  console.log('[DEDUPE] Final feed events:', feedEvents.length);
  
  return feedEvents;
}
