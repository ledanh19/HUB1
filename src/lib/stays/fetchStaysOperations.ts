/**
 * fetchStaysOperations — Shared query function for the /stays route.
 *
 * Extracted from StaysPage.tsx inline queryFn to enable:
 * 1. Both page hook and prefetcher to share the EXACT same logic.
 * 2. Zero-skeleton-first-paint via cache warm in routePrefetchRegistry.
 *
 * Query key: ["stays_operations", selectedDate]
 * Returns: StayWithBooking[]
 */

import { supabase, safeQuery, safeMutation, safeFrom } from "@/integrations/supabase";

// ── Types (exported for use in StaysPage.tsx) ──

export interface SegmentInfo {
    segment_id: string;
    partner_id: string;
    host_property_name: string | null;
    host_room_type: string | null;
    room_code: string | null;
    date_from: string | null;
    date_to: string | null;
    nights: number;
    partners: { partner_name: string } | null;
    actual_check_in_at: string | null;
    actual_check_out_at: string | null;
}

export interface CoverageInfo {
    totalNights: number;
    assignedNights: number;
    missingNights: number;
    isComplete: boolean;
}

export interface BookingInfo {
    guest_name: string;
    guest_phone: string | null;
    guest_email: string | null;
    nationality: string | null;
    check_in_date: string;
    check_out_date: string;
    nights: number | null;
    source: string;
    payment_type: string;
    pms_property_name: string | null;
    total_amount_net: number | null;
    total_amount_gross: number | null;
    booking_status: string;
    ota_booking_code: string | null;
    ota_room_type_sold: string | null;
    /** Booking date from unified_bookings (SOT) — DATE type YYYY-MM-DD */
    booking_created_at?: string | null;
}

export interface StayWithBooking {
    id: string;
    unified_booking_id: string;
    stay_status: string;
    host_room_id: string | null;
    host_room_type: string | null;
    host_property_name: string | null;
    host_cost: number | null;
    actual_check_in_at: string | null;
    actual_check_out_at: string | null;
    operation_note: string | null;
    created_at: string;
    booking: BookingInfo | null;
    segment: SegmentInfo | null;
    coverage: CoverageInfo | null;
    amount_collected: number;
    stayIndex: number;
    totalStays: number;
    segmentIndex: number;
    totalSegments: number;
    hasRoomChange: boolean;
    isCurrent: boolean;
    segmentKey: string;
}

// ── Constants ──
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

// ── Helpers (internal) ──

function detectOtaFromCode(otaSource: string, otaBookingCode: string | null): string {
    let source = (otaSource || "OTHER").toUpperCase();
    if (source === "OTHER" && otaBookingCode) {
        const code = otaBookingCode.toUpperCase();
        if (code.startsWith("BDC-") || code.includes("BOOKING")) source = "BOOKING.COM";
        else if (code.startsWith("AGO-") || code.includes("AGODA")) source = "AGODA";
        else if (code.startsWith("EXP-") || code.includes("EXPEDIA")) source = "EXPEDIA";
        else if (code.startsWith("TVL-") || code.includes("TRAVELOKA")) source = "TRAVELOKA";
        else if (code.startsWith("CTP-") || code.includes("CTRIP")) source = "CTRIP";
    }
    return source;
}

async function fetchAllRows(
    tableName: string,
    selectQuery: string,
    filterFn?: (query: any) => any
): Promise<any[]> {
    const PAGE_SIZE = 1000;
    const allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        let query = safeFrom(tableName as any).select(selectQuery).range(from, from + PAGE_SIZE - 1);
        if (filterFn) query = filterFn(query);
        const { data, error } = await query;
        if (error) throw error;
        if (data) allData.push(...data);
        hasMore = data?.length === PAGE_SIZE;
        from += PAGE_SIZE;
    }
    return allData;
}

async function fetchWithBatchedIn(
    tableName: string,
    selectQuery: string,
    columnName: string,
    ids: string[],
    additionalFilter?: (query: any) => any
): Promise<any[]> {
    if (ids.length === 0) return [];
    const BATCH_SIZE = 200;
    const batches: Promise<any[]>[] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batchIds = ids.slice(i, i + BATCH_SIZE);
        batches.push(
            (async () => {
                let query = safeFrom(tableName as any).select(selectQuery).in(columnName, batchIds);
                if (additionalFilter) query = additionalFilter(query);
                const { data, error } = await query;
                if (error) console.error(`[fetchStaysOperations] Batch query error for ${tableName}:`, error);
                return (data || []) as any[];
            })()
        );
    }
    const results = await Promise.all(batches);
    return results.flat();
}

// ── Main exported function ──

/**
 * Fetch stays operations for a given date.
 * Used by both `useQuery` in StaysPage.tsx and the prefetcher in routePrefetchRegistry.ts.
 *
 * @param selectedDate - YYYY-MM-DD format date string
 * @returns StayWithBooking[] — enriched stays with booking/segment info
 */
export async function fetchStaysOperations(selectedDate: string): Promise<StayWithBooking[]> {
    // Compute date window (-7 / +30 days from selectedDate)
    // -7: captures recent stays needing check-out actions
    // +30: ensures "Chưa phân bổ" filter covers bookings up to 30 days ahead
    const windowStart = (() => {
        const d = new Date(selectedDate + "T00:00:00");
        d.setDate(d.getDate() - 7);
        return d.toISOString().slice(0, 10);
    })();
    const windowEnd = (() => {
        const d = new Date(selectedDate + "T00:00:00");
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
    })();

    const selectFields = "unified_booking_id, guest_name, guest_phone, guest_email, check_in_date, check_out_date, nights, ota_source, ota_booking_code, payment_type, pms_property_name, total_amount_net, total_amount_gross, booking_status, channex_property_id, room_type, created_at, booking_date";

    // Fields needed from unified_bookings for "Đặt phòng mới" tab
    // Uses booking_date (DATE, same SOT as Booking Center) instead of bookings_mirror.created_at
    const unifiedSelectFields = "unified_booking_id, guest_name, guest_phone, guest_email, check_in_date, check_out_date, nights, source, ota_booking_code, payment_type, pms_property_name, pms_property_id, total_amount_net, total_amount_gross, booking_status, ota_room_type_sold, booking_date";

    // PHASE 1: Fetch group properties + bookings (window + new today) IN PARALLEL
    const [{ data: propGroups }, windowBookings, newBookingsRaw] = await Promise.all([
        safeFrom("channex_property_groups" as any)
            .select("channex_property_id")
            .eq("channex_group_id", AN_GIA_GROUP_ID),
        fetchAllRows(
            "bookings_mirror",
            selectFields,
            (q: any) => q
                .gte("check_out_date", windowStart)
                .lte("check_in_date", windowEnd)
                .order("check_in_date", { ascending: false })
        ),
        // Secondary fetch: bookings with booking_date = selectedDate (SOT: unified_bookings)
        // Includes ALL booking types (PMS, MANUAL, IMPORTED) and ALL statuses
        fetchAllRows(
            "unified_bookings" as any,
            unifiedSelectFields,
            (q: any) => q
                .eq("booking_date", selectedDate)
                .order("created_at", { ascending: false })
        ),
    ]);

    const propertyIds = (propGroups as any[])?.map((p: any) => p.channex_property_id) || [];
    const propertySet = new Set(propertyIds);

    // Map unified_bookings fields to bookings_mirror schema + apply group filter
    // unified_bookings uses pms_property_id (not channex_property_id) for group membership
    const newBookingsData: any[] = [];
    for (const b of newBookingsRaw) {
        // Group filter: pms_property_id IN group OR null (MANUAL bookings)
        if (propertyIds.length > 0) {
            const propId = b.pms_property_id;
            if (propId && !propertySet.has(propId)) continue;
        }
        // Map field names to match bookings_mirror schema used downstream
        newBookingsData.push({
            ...b,
            ota_source: b.source || 'OTHER',
            room_type: b.ota_room_type_sold || null,
            channex_property_id: b.pms_property_id || null,
            // Use booking_date as created_at for booking_created_at
            created_at: b.booking_date || b.created_at,
        });
    }

    // Build a lookup: unified_booking_id → booking_date from newBookingsData
    // This ensures bookings in windowBookings also get booking_date for KPI counting
    const newBookingDateMap = new Map<string, string>();
    for (const b of newBookingsData) {
        if (b.booking_date) {
            newBookingDateMap.set(b.unified_booking_id, b.booking_date);
        }
    }

    // Merge and deduplicate bookings (window + new bookings)
    const seen = new Set<string>();
    const allBookings: any[] = [];
    for (const b of windowBookings) {
        if (!seen.has(b.unified_booking_id)) {
            seen.add(b.unified_booking_id);
            // Patch booking_date from newBookings if this booking was also booked today
            const bookingDate = newBookingDateMap.get(b.unified_booking_id);
            if (bookingDate) {
                b.booking_date = bookingDate;
            }
            allBookings.push(b);
        }
    }
    for (const b of newBookingsData) {
        if (!seen.has(b.unified_booking_id)) {
            seen.add(b.unified_booking_id);
            allBookings.push(b);
        }
    }

    // Filter bookings by An Gia properties
    const filteredBookings = propertyIds.length > 0
        ? allBookings.filter((b: any) => propertySet.has(b.channex_property_id))
        : allBookings;

    if (!filteredBookings?.length) return [];

    const bookingIds = filteredBookings.map((b: any) => b.unified_booking_id);

    // PHASE 2: Parallel fetch — stays, segments, collections
    const [staysData, segmentsData, collectsData] = await Promise.all([
        fetchWithBatchedIn("stays", "*", "unified_booking_id", bookingIds),
        fetchWithBatchedIn(
            "host_supply_segments",
            "id, unified_booking_id, partner_id, host_property_name, host_room_type, room_code, date_from, date_to, nights, actual_check_in_at, actual_check_out_at, partners!left(partner_name)",
            "unified_booking_id",
            bookingIds
        ),
        fetchWithBatchedIn(
            "hotel_collects",
            "unified_booking_id, amount_collected, status",
            "unified_booking_id",
            bookingIds,
            (q: any) => q.neq("status", "VOIDED")
        ),
    ]);

    // Build stays map (booking -> stay record)
    const staysMap = new Map<string, any>();
    const stayCountMap = new Map<string, number>();
    staysData.forEach((s: any) => {
        stayCountMap.set(s.unified_booking_id, (stayCountMap.get(s.unified_booking_id) || 0) + 1);
        const existing = staysMap.get(s.unified_booking_id);
        if (!existing || new Date(s.created_at) > new Date(existing.created_at)) {
            staysMap.set(s.unified_booking_id, s);
        }
    });

    // Build segments list per booking
    const segmentsListMap = new Map<string, SegmentInfo[]>();
    const segmentCountMap = new Map<string, number>();
    const segmentNightsMap = new Map<string, number>();
    segmentsData.forEach((seg: any) => {
        segmentCountMap.set(seg.unified_booking_id, (segmentCountMap.get(seg.unified_booking_id) || 0) + 1);
        const currentNights = segmentNightsMap.get(seg.unified_booking_id) || 0;
        segmentNightsMap.set(seg.unified_booking_id, currentNights + (seg.nights || 0));

        const partnersData = seg.partners;
        const partnerInfo = Array.isArray(partnersData) ? partnersData[0] : partnersData;
        const segmentInfo: SegmentInfo = {
            segment_id: seg.id,
            partner_id: seg.partner_id,
            host_property_name: seg.host_property_name,
            host_room_type: seg.host_room_type,
            room_code: seg.room_code,
            date_from: seg.date_from,
            date_to: seg.date_to,
            nights: seg.nights || 0,
            partners: partnerInfo as { partner_name: string } | null,
            actual_check_in_at: seg.actual_check_in_at || null,
            actual_check_out_at: seg.actual_check_out_at || null,
        };

        if (!segmentsListMap.has(seg.unified_booking_id)) {
            segmentsListMap.set(seg.unified_booking_id, [segmentInfo]);
        } else {
            segmentsListMap.get(seg.unified_booking_id)!.push(segmentInfo);
        }
    });

    // Sort segments by date_from within each booking
    segmentsListMap.forEach((segments) => {
        segments.sort((a, b) => (a.date_from || '').localeCompare(b.date_from || ''));
    });

    // Build collections map
    const collectsMap = new Map<string, number>();
    collectsData.forEach((c: any) => {
        const current = collectsMap.get(c.unified_booking_id) || 0;
        collectsMap.set(c.unified_booking_id, current + (c.amount_collected || 0));
    });

    // PHASE 3: Map bookings to StayWithBooking format
    // Create 1 entry per SEGMENT for proper check-in/out per host
    const results: StayWithBooking[] = [];

    filteredBookings.forEach((booking: any) => {
        const stay = staysMap.get(booking.unified_booking_id);
        const totalStays = stayCountMap.get(booking.unified_booking_id) || 0;
        const _segmentCount = segmentCountMap.get(booking.unified_booking_id) || 0;
        const segments = segmentsListMap.get(booking.unified_booking_id) || [];
        const displaySource = detectOtaFromCode(booking.ota_source, booking.ota_booking_code);

        const baseBookingInfo: BookingInfo = {
            guest_name: booking.guest_name,
            guest_phone: booking.guest_phone,
            guest_email: booking.guest_email,
            nationality: null,
            check_in_date: booking.check_in_date,
            check_out_date: booking.check_out_date,
            nights: booking.nights,
            source: displaySource,
            payment_type: booking.payment_type,
            pms_property_name: booking.pms_property_name,
            total_amount_net: booking.total_amount_net,
            total_amount_gross: booking.total_amount_gross,
            booking_status: booking.booking_status,
            ota_booking_code: booking.ota_booking_code,
            ota_room_type_sold: (booking as any).room_type || null,
            // Prefer booking_date (DATE from unified_bookings, same SOT as Booking Center)
            // Fallback to created_at only for bookings where booking_date is not available
            booking_created_at: booking.booking_date || booking.created_at || null,
        };

        const coverage: CoverageInfo = {
            totalNights: booking.nights || 0,
            assignedNights: segmentNightsMap.get(booking.unified_booking_id) || 0,
            missingNights: Math.max(0, (booking.nights || 0) - (segmentNightsMap.get(booking.unified_booking_id) || 0)),
            isComplete: (segmentNightsMap.get(booking.unified_booking_id) || 0) >= (booking.nights || 0),
        };

        if (segments.length === 0) {
            // No segments - create single entry for booking
            results.push({
                id: stay?.id || booking.unified_booking_id,
                unified_booking_id: booking.unified_booking_id,
                stay_status: stay?.stay_status || "WAIT_ROOM",
                host_room_id: stay?.host_room_id || null,
                host_room_type: stay?.host_room_type || null,
                host_property_name: stay?.host_property_name || null,
                host_cost: stay?.host_cost || null,
                actual_check_in_at: stay?.actual_check_in_at || null,
                actual_check_out_at: stay?.actual_check_out_at || null,
                operation_note: stay?.operation_note || null,
                created_at: stay?.created_at || booking.unified_booking_id,
                booking: baseBookingInfo,
                segment: null,
                coverage,
                amount_collected: collectsMap.get(booking.unified_booking_id) || 0,
                stayIndex: 1,
                totalStays: Math.max(totalStays, 1),
                segmentIndex: 0,
                totalSegments: 0,
                hasRoomChange: false,
                isCurrent: true,
                segmentKey: booking.unified_booking_id,
            });
        } else {
            // Has segments - create one entry PER SEGMENT
            const isSingleSegment = segments.length === 1;

            segments.forEach((segment, idx) => {
                let segmentCheckIn: string | null;
                let segmentCheckOut: string | null;
                let segmentStayStatus: string;

                if (isSingleSegment) {
                    // SINGLE SEGMENT: stays table is the definitive SOT
                    segmentCheckIn = stay?.actual_check_in_at || segment.actual_check_in_at || null;
                    segmentCheckOut = stay?.actual_check_out_at || segment.actual_check_out_at || null;
                    segmentStayStatus = stay?.stay_status || "WAIT_ROOM";
                } else {
                    // MULTI SEGMENT: segment timestamps are per-room SOT
                    segmentCheckIn = segment.actual_check_in_at || null;
                    segmentCheckOut = segment.actual_check_out_at || null;

                    if (segmentCheckOut) {
                        segmentStayStatus = "CHECKED_OUT";
                    } else if (segmentCheckIn) {
                        segmentStayStatus = "CHECKED_IN";
                    } else if (stay?.stay_status === "CHECKED_OUT" || stay?.stay_status === "CHECKED_IN") {
                        segmentStayStatus = stay.stay_status;
                    } else if (segment.host_property_name) {
                        segmentStayStatus = "WAIT_ROOM";
                    } else {
                        segmentStayStatus = stay?.stay_status || "WAIT_ROOM";
                    }
                }

                results.push({
                    id: stay?.id || booking.unified_booking_id,
                    unified_booking_id: booking.unified_booking_id,
                    stay_status: segmentStayStatus,
                    host_room_id: stay?.host_room_id || null,
                    host_room_type: segment.host_room_type || stay?.host_room_type || null,
                    host_property_name: segment.host_property_name || stay?.host_property_name || null,
                    host_cost: stay?.host_cost || null,
                    actual_check_in_at: segmentCheckIn,
                    actual_check_out_at: segmentCheckOut,
                    operation_note: stay?.operation_note || null,
                    created_at: stay?.created_at || booking.unified_booking_id,
                    booking: baseBookingInfo,
                    segment,
                    coverage,
                    amount_collected: collectsMap.get(booking.unified_booking_id) || 0,
                    stayIndex: 1,
                    totalStays: Math.max(totalStays, 1),
                    segmentIndex: idx + 1,
                    totalSegments: segments.length,
                    hasRoomChange: segments.length > 1,
                    isCurrent: true,
                    segmentKey: segment.segment_id,
                });
            });
        }
    });

    return results;
}
