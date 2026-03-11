import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"; // v2.2 with full pagination
import { supabase, safeQuery, safeMutation, safeFrom } from "@/integrations/supabase";
import { toast } from "sonner";
import { syncHostPayables } from "./useHostPayableSync";
import { PAYMENT_TOLERANCE_VND } from "@/constants/payment-tolerance";
import { keepPrevious } from "@/lib/query-helpers";
// Segment coverage status for Booking Center display
export type SegmentCoverageStatus = "NONE" | "PARTIAL" | "FULL";

export interface UnifiedBooking {
  unified_booking_id: string;
  booking_type: string;
  created_at: string;
  booking_date: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  customer_id: string | null;
  nationality: string | null;
  source: string;
  pms_property_name: string | null;
  pms_property_id: string | null;
  host_property_name: string | null;
  ota_room_type_sold: string | null;
  host_room_type: string | null;
  host_room_code: string | null;
  host_room_id: string | null;
  payment_type: string;
  total_amount_gross: number | null;
  total_amount_net: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  booking_status: string;
  stay_status: string | null;
  host_cost: number | null;
  updated_at: string;

  // External (OTA/PMS/Provider) identifiers (PMS bookings only)
  ota_booking_code?: string | null;
  pms_booking_id?: string | null;
  provider_booking_id?: string | null;
  channex_property_id?: string | null;
  channex_room_type_id?: string | null;
  ota_property_id?: string | null;
  channex_status?: string | null; // Raw Channex status (new, modified, cancelled)

  // Rooms count from room_lines
  rooms_count?: number;

  // Segment coverage status - calculated from host_supply_segments
  segment_coverage_status?: SegmentCoverageStatus;
  segment_assigned_nights?: number;

  // Actual checkout date from stays table (for P&L reconciliation)
  actual_check_out_at?: string | null;
}

export interface HotelCollect {
  id: string;
  unified_booking_id: string;
  amount_collected: number;
  payment_method: string;
  payer_type: string;
  payee_type: string;
  collected_at: string | null;
  collected_by: string | null;
  note: string | null;
  status: string | null;
  collection_type: string;
}

// An Gia Residences group ID - filter bookings to this group only
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

// Helper: batch .in() queries (max 200 IDs per batch for Supabase REST API)
async function fetchWithBatchedIn<T = any>(
  tableName: string,
  selectQuery: string,
  columnName: string,
  ids: string[],
  additionalFilter?: (query: any) => any
): Promise<T[]> {
  if (ids.length === 0) return [];
  const BATCH_SIZE = 200;
  const results: T[] = [];
  const batches: Promise<T[]>[] = [];

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);
    batches.push(
      (async () => {
        let query = (safeQuery(() => supabase.from(tableName as any) as any) as any).select(selectQuery).in(columnName, batchIds);
        if (additionalFilter) query = additionalFilter(query);
        const { data, error } = await query;
        if (error) console.error(`[useBookings] Batch query error for ${tableName}:`, error);
        return (data || []) as T[];
      })()
    );
  }

  const batchResults = await Promise.all(batches);
  batchResults.forEach(r => results.push(...r));
  return results;
}

// Helper: paginated fetch all rows
async function fetchAllRowsPaginated<T = any>(
  tableName: string,
  selectQuery: string,
  filterFn?: (query: any) => any
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const allData: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = (safeQuery(() => supabase.from(tableName as any) as any) as any).select(selectQuery).range(from, from + PAGE_SIZE - 1);
    if (filterFn) query = filterFn(query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return allData;
}

// Fetch all bookings (filtered by An Gia Residences group)
export function useBookings() {
  return useQuery({
    queryKey: ["unified_bookings"],
    staleTime: 30_000, // 30s — realtime handles live updates
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: async () => {
      // PHASE 1: Fetch group properties + bookings IN PARALLEL
      const [{ data: propertyLinks, error: groupError }, bookings] = await Promise.all([
        supabase
          .from("channex_property_groups")
          .select("channex_property_id")
          .eq("channex_group_id", AN_GIA_GROUP_ID),
        fetchAllRowsPaginated<UnifiedBooking>(
          "unified_bookings",
          "*",
          (q: any) => q.order("created_at", { ascending: false })
        ),
      ]);

      if (groupError) {
        console.error("[useBookings] Failed to fetch group properties:", groupError);
      }

      const groupPropertyIds = propertyLinks?.map(p => p.channex_property_id) || [];
      const groupPropertySet = new Set(groupPropertyIds);

      if (bookings.length === 0) return [] as UnifiedBooking[];

      // Collect all booking IDs and PMS-type IDs upfront
      const allBookingIds: string[] = [];
      const pmsUnifiedIds: string[] = [];
      for (const b of bookings) {
        allBookingIds.push(b.unified_booking_id);
        if (b.booking_type === "PMS" || b.booking_type === "SYNCED" || b.booking_type === "IMPORTED") {
          pmsUnifiedIds.push(b.unified_booking_id);
        }
      }

      // === PHASE 2: PARALLEL FETCH — mirror, segments, stays ===
      const [allMirrorBookings, allSegments, allStaysData] = await Promise.all([
        // Mirror data for PMS bookings (batched IN)
        fetchWithBatchedIn(
          "bookings_mirror",
          "unified_booking_id, pms_booking_id, ota_booking_code, provider_booking_id, channex_property_id, channex_room_type_id, ota_property_id, pms_property_id, pms_property_name, room_type, booking_type, channex_status",
          "unified_booking_id",
          pmsUnifiedIds
        ),
        // Segments for all bookings (batched IN)
        fetchWithBatchedIn<{ unified_booking_id: string; nights: number }>(
          "host_supply_segments",
          "unified_booking_id, nights",
          "unified_booking_id",
          allBookingIds
        ),
        // Stays for all bookings (batched IN)
        fetchWithBatchedIn<{ unified_booking_id: string; actual_check_out_at: string | null; created_at: string }>(
          "stays",
          "unified_booking_id, actual_check_out_at, created_at",
          "unified_booking_id",
          allBookingIds,
          (q: any) => q.not("actual_check_out_at", "is", null)
        ),
      ]);

      // Build mirror map
      const mirrorMap = new Map<string, {
        pms_booking_id: string | null;
        ota_booking_code: string | null;
        provider_booking_id: string | null;
        channex_property_id: string | null;
        channex_room_type_id: string | null;
        ota_property_id: string | null;
        pms_property_id: string | null;
        pms_property_name: string | null;
        room_type: string | null;
        mirror_booking_type: string | null;
        channex_status: string | null;
      }>();

      const pmsBookingIdSet = new Set<string>();
      for (const mb of allMirrorBookings) {
        mirrorMap.set(mb.unified_booking_id, {
          pms_booking_id: mb.pms_booking_id,
          ota_booking_code: mb.ota_booking_code ?? null,
          provider_booking_id: mb.provider_booking_id ?? null,
          channex_property_id: mb.channex_property_id ?? null,
          channex_room_type_id: mb.channex_room_type_id ?? null,
          ota_property_id: mb.ota_property_id ?? null,
          pms_property_id: mb.pms_property_id ?? null,
          pms_property_name: mb.pms_property_name ?? null,
          room_type: mb.room_type ?? null,
          mirror_booking_type: mb.booking_type ?? null,
          channex_status: mb.channex_status ?? null,
        });
        if (mb.pms_booking_id) pmsBookingIdSet.add(mb.pms_booking_id);
      }

      // PHASE 3: Room lines — must be after mirror map (needs pms_booking_id values)
      const roomsCountMap = new Map<string, number>();
      if (pmsBookingIdSet.size > 0) {
        const roomLines = await fetchWithBatchedIn<{ pms_booking_id: string }>(
          "booking_room_lines_mirror",
          "pms_booking_id",
          "pms_booking_id",
          Array.from(pmsBookingIdSet)
        );
        const roomsCountFromLines = new Map<string, number>();
        for (const rl of roomLines) {
          if (rl.pms_booking_id) {
            roomsCountFromLines.set(rl.pms_booking_id, (roomsCountFromLines.get(rl.pms_booking_id) || 0) + 1);
          }
        }
        for (const mb of allMirrorBookings) {
          if (mb.pms_booking_id) {
            const count = roomsCountFromLines.get(mb.pms_booking_id);
            if (count && count > 0) roomsCountMap.set(mb.unified_booking_id, count);
          }
        }
      }

      // Build segment coverage map
      const segmentCoverageMap = new Map<string, number>();
      for (const seg of allSegments) {
        segmentCoverageMap.set(seg.unified_booking_id, (segmentCoverageMap.get(seg.unified_booking_id) || 0) + (seg.nights || 0));
      }

      // Build actual checkout map (keep latest per booking)
      const actualCheckoutMap = new Map<string, string>();
      const checkoutTimeMap = new Map<string, number>();
      for (const s of allStaysData) {
        if (!s.actual_check_out_at) continue;
        const ts = new Date(s.created_at).getTime();
        const existing = checkoutTimeMap.get(s.unified_booking_id) || 0;
        if (ts > existing) {
          checkoutTimeMap.set(s.unified_booking_id, ts);
          actualCheckoutMap.set(s.unified_booking_id, s.actual_check_out_at);
        }
      }

      // Merge all data and filter by An Gia Residences group in a single pass
      const result: UnifiedBooking[] = [];
      const hasGroupFilter = groupPropertyIds.length > 0;

      for (const b of bookings) {
        const mirror = mirrorMap.get(b.unified_booking_id);

        // Group filter: check membership early to skip enrichment for excluded bookings
        if (hasGroupFilter) {
          const cpId = mirror?.channex_property_id ?? null;
          if (b.booking_type !== 'MANUAL' && cpId && !groupPropertySet.has(cpId)) continue;
        }

        // Normalize booking_type
        let finalBookingType = b.booking_type;
        if (mirror?.mirror_booking_type === 'IMPORTED') {
          finalBookingType = 'IMPORTED';
        } else if (b.booking_type === 'SYNCED' || mirror?.pms_booking_id) {
          finalBookingType = 'PMS';
        }

        // Rooms count
        const roomsCount = roomsCountMap.get(b.unified_booking_id) || 1;

        // Segment coverage
        const assignedNights = segmentCoverageMap.get(b.unified_booking_id) || 0;
        const totalNights = b.nights || 0;
        let segmentCoverageStatus: SegmentCoverageStatus = "NONE";
        if (assignedNights > 0) {
          segmentCoverageStatus = assignedNights >= totalNights ? "FULL" : "PARTIAL";
        }

        result.push({
          ...b,
          booking_type: finalBookingType,
          rooms_count: roomsCount,
          segment_coverage_status: segmentCoverageStatus,
          segment_assigned_nights: assignedNights,
          pms_property_id: b.pms_property_id ?? mirror?.pms_property_id ?? null,
          pms_property_name: b.pms_property_name ?? mirror?.pms_property_name ?? null,
          ota_room_type_sold: b.ota_room_type_sold ?? mirror?.room_type ?? null,
          ota_booking_code: b.ota_booking_code || mirror?.ota_booking_code || null,
          pms_booking_id: mirror?.pms_booking_id ?? null,
          provider_booking_id: mirror?.provider_booking_id ?? null,
          channex_property_id: mirror?.channex_property_id ?? null,
          channex_room_type_id: mirror?.channex_room_type_id ?? null,
          ota_property_id: mirror?.ota_property_id ?? null,
          channex_status: mirror?.channex_status ?? null,
          actual_check_out_at: actualCheckoutMap.get(b.unified_booking_id) ?? null,
        } as UnifiedBooking);
      }

      return result;
    },
  });
}

// ========================================================================
// SERVER-SIDE PAGINATED BOOKINGS (replaces useBookings for BookingsPage)
// Push ALL filters to Supabase, fetch only 1 page + count
// ========================================================================

export interface BookingQueryParams {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  source?: string;
  bookingType?: string;
  paymentType?: string;
  propertyName?: string;
  propertyId?: string;
  roomType?: string;
  stayStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  dateFilterType?: string;
}

export interface BookingsPaginatedResult {
  bookings: UnifiedBooking[];
  totalCount: number;
}

/**
 * Standalone queryFn for bookings paginated.
 * Shared between useBookingsPaginated hook AND the route prefetcher.
 * NEVER duplicate this logic — import this function instead.
 */
export async function fetchBookingsPaginated(params: BookingQueryParams): Promise<BookingsPaginatedResult> {
  // Columns actually needed by BookingsPage table
  const BOOKING_COLUMNS = 'unified_booking_id,booking_type,created_at,booking_date,check_in_date,check_out_date,nights,guest_name,guest_phone,guest_email,customer_id,nationality,source,pms_property_name,pms_property_id,host_property_name,ota_room_type_sold,host_room_type,host_room_code,host_room_id,payment_type,total_amount_gross,total_amount_net,commission_rate,commission_amount,booking_status,stay_status,host_cost,updated_at,ota_booking_code';

  // ── PHASE 0: Fetch An Gia group property IDs (needed for server-side filter) ──
  const { data: propertyLinks } = await safeFrom("channex_property_groups" as any)
    .select("channex_property_id")
    .eq("channex_group_id", AN_GIA_GROUP_ID);

  const groupPropertyIds = (propertyLinks as any[])?.map((p: any) => p.channex_property_id) || [];
  const groupPropertySet = new Set(groupPropertyIds);

  // ── Helper: build filtered query on unified_bookings ──
  const buildFilteredQuery = (selectExpr: string, opts?: { count?: "exact"; head?: boolean }) => {
    let query = (safeFrom("unified_bookings" as any) as any).select(selectExpr, opts);

    // Server-side An Gia group filter: only show bookings belonging to group properties
    if (groupPropertyIds.length > 0) {
      // Include bookings that: belong to An Gia property OR is a MANUAL booking (no pms_property_id)
      query = query.or(`pms_property_id.in.(${groupPropertyIds.join(",")}),pms_property_id.is.null`);
    }

    // Server-side filters
    if (params.status && params.status !== "all") {
      if (params.status === "CONFIRMED") {
        query = query.eq("booking_status", "CONFIRMED");
      } else if (params.status === "MODIFIED") {
        // MODIFIED bookings have booking_status=CONFIRMED + channex_status=modified in bookings_mirror.
        // unified_bookings doesn't have channex_status, so we cannot filter here.
        // We'll mark this for post-filter enrichment below.
        // For now, don't filter booking_status — we'll handle it after enrichment.
      } else {
        query = query.eq("booking_status", params.status);
      }
    }
    if (params.source && params.source !== "all") {
      query = query.eq("source", params.source);
    }
    if (params.paymentType && params.paymentType !== "all") {
      query = query.eq("payment_type", params.paymentType);
    }
    if (params.propertyName && params.propertyName !== "all") {
      query = query.eq("pms_property_name", params.propertyName);
    }
    // Note: propertyId (ota_property_id) filter is applied post-enrichment since it comes from bookings_mirror
    if (params.roomType && params.roomType !== "all") {
      query = query.eq("ota_room_type_sold", params.roomType);
    }

    // Stay status filter (server-side — stay_status column exists on unified_bookings)
    if (params.stayStatus && params.stayStatus !== "all") {
      query = query.eq("stay_status", params.stayStatus);
    }

    // Booking type filter (needs normalization: SYNCED → PMS)
    if (params.bookingType && params.bookingType !== "all") {
      if (params.bookingType === "PMS") {
        query = query.or("booking_type.eq.PMS,booking_type.eq.SYNCED");
      } else {
        query = query.eq("booking_type", params.bookingType);
      }
    }

    // Date range filter (actual_check_out handled client-side after enrichment)
    if ((params.dateFrom || params.dateTo) && params.dateFilterType !== "actual_check_out") {
      const dateCol = params.dateFilterType === "check_in" ? "check_in_date"
        : params.dateFilterType === "check_out" ? "check_out_date"
          : "booking_date"; // default
      if (params.dateFrom) query = query.gte(dateCol, params.dateFrom);
      if (params.dateTo) query = query.lte(dateCol, params.dateTo);
    }

    // Search: ilike across multiple columns
    if (params.search && params.search.trim()) {
      const term = params.search.trim().replace(/%/g, "");
      const pattern = `%${term}%`;
      query = query.or(
        `guest_name.ilike.${pattern},unified_booking_id.ilike.${pattern},ota_booking_code.ilike.${pattern},guest_phone.ilike.${pattern},pms_property_name.ilike.${pattern}`
      );
    }

    return query;
  };

  // ── PHASE 1: Count + page data — IN PARALLEL ──
  const offset = (params.page - 1) * params.pageSize;

  const [countResult, pageResult] = await Promise.all([
    buildFilteredQuery("*", { count: "exact", head: true }),
    buildFilteredQuery(BOOKING_COLUMNS)
      .order("created_at", { ascending: false })
      .range(offset, offset + params.pageSize - 1),
  ]);

  const totalCount = countResult.count ?? 0;
  const pageBookings: UnifiedBooking[] = pageResult.data || [];

  if (pageBookings.length === 0) {
    return { bookings: [], totalCount };
  }

  // Collect IDs for enrichment
  const allBookingIds = pageBookings.map(b => b.unified_booking_id);
  const pmsUnifiedIds = pageBookings
    .filter(b => b.booking_type === "PMS" || b.booking_type === "SYNCED" || b.booking_type === "IMPORTED")
    .map(b => b.unified_booking_id);

  // ── PHASE 2: Enrich only this page's IDs (max 50) — ALL IN PARALLEL ──
  const [allMirrorBookings, allSegments, allStaysData] = await Promise.all([
    pmsUnifiedIds.length > 0
      ? supabase
        .from("bookings_mirror")
        .select("unified_booking_id, pms_booking_id, ota_booking_code, provider_booking_id, channex_property_id, channex_room_type_id, ota_property_id, pms_property_id, pms_property_name, room_type, booking_type, channex_status")
        .in("unified_booking_id", pmsUnifiedIds)
        .then(r => r.data || [])
      : Promise.resolve([]) as Promise<any[]>,
    supabase
      .from("host_supply_segments")
      .select("unified_booking_id, nights")
      .in("unified_booking_id", allBookingIds)
      .then(r => r.data || []),
    supabase
      .from("stays")
      .select("unified_booking_id, actual_check_out_at, created_at")
      .in("unified_booking_id", allBookingIds)
      .not("actual_check_out_at", "is", null)
      .then(r => r.data || []),
  ]);

  // Build mirror map
  const mirrorMap = new Map<string, any>();
  const pmsBookingIdSet = new Set<string>();
  for (const mb of allMirrorBookings) {
    mirrorMap.set(mb.unified_booking_id, mb);
    if (mb.pms_booking_id) pmsBookingIdSet.add(mb.pms_booking_id);
  }

  // Room lines (sequential — needs pms_booking_id from mirror)
  const roomsCountMap = new Map<string, number>();
  if (pmsBookingIdSet.size > 0) {
    const { data: roomLines } = await supabase
      .from("booking_room_lines_mirror")
      .select("pms_booking_id")
      .in("pms_booking_id", Array.from(pmsBookingIdSet));
    const roomsCountFromLines = new Map<string, number>();
    for (const rl of (roomLines || [])) {
      if (rl.pms_booking_id) {
        roomsCountFromLines.set(rl.pms_booking_id, (roomsCountFromLines.get(rl.pms_booking_id) || 0) + 1);
      }
    }
    for (const mb of allMirrorBookings) {
      if (mb.pms_booking_id) {
        const count = roomsCountFromLines.get(mb.pms_booking_id);
        if (count && count > 0) roomsCountMap.set(mb.unified_booking_id, count);
      }
    }
  }

  // Build segment coverage map
  const segmentCoverageMap = new Map<string, number>();
  for (const seg of allSegments) {
    segmentCoverageMap.set(seg.unified_booking_id, (segmentCoverageMap.get(seg.unified_booking_id) || 0) + (seg.nights || 0));
  }

  // Build actual checkout map
  const actualCheckoutMap = new Map<string, string>();
  const checkoutTimeMap = new Map<string, number>();
  for (const s of allStaysData) {
    if (!s.actual_check_out_at) continue;
    const ts = new Date(s.created_at).getTime();
    const existing = checkoutTimeMap.get(s.unified_booking_id) || 0;
    if (ts > existing) {
      checkoutTimeMap.set(s.unified_booking_id, ts);
      actualCheckoutMap.set(s.unified_booking_id, s.actual_check_out_at);
    }
  }

  // Merge all data (no client-side group filter — already done server-side)
  const result: UnifiedBooking[] = [];

  for (const b of pageBookings) {
    const mirror = mirrorMap.get(b.unified_booking_id);

    let finalBookingType = b.booking_type;
    if (mirror?.booking_type === 'IMPORTED') {
      finalBookingType = 'IMPORTED';
    } else if (b.booking_type === 'SYNCED' || mirror?.pms_booking_id) {
      finalBookingType = 'PMS';
    }

    const roomsCount = roomsCountMap.get(b.unified_booking_id) || 1;
    const assignedNights = segmentCoverageMap.get(b.unified_booking_id) || 0;
    const totalNights = b.nights || 0;
    let segmentCoverageStatus: SegmentCoverageStatus = "NONE";
    if (assignedNights > 0) {
      segmentCoverageStatus = assignedNights >= totalNights ? "FULL" : "PARTIAL";
    }

    result.push({
      ...b,
      booking_type: finalBookingType,
      rooms_count: roomsCount,
      segment_coverage_status: segmentCoverageStatus,
      segment_assigned_nights: assignedNights,
      pms_property_id: b.pms_property_id ?? mirror?.pms_property_id ?? null,
      pms_property_name: b.pms_property_name ?? mirror?.pms_property_name ?? null,
      ota_room_type_sold: b.ota_room_type_sold ?? mirror?.room_type ?? null,
      ota_booking_code: b.ota_booking_code || mirror?.ota_booking_code || null,
      pms_booking_id: mirror?.pms_booking_id ?? null,
      provider_booking_id: mirror?.provider_booking_id ?? null,
      channex_property_id: mirror?.channex_property_id ?? null,
      channex_room_type_id: mirror?.channex_room_type_id ?? null,
      ota_property_id: mirror?.ota_property_id ?? null,
      channex_status: mirror?.channex_status ?? null,
      actual_check_out_at: actualCheckoutMap.get(b.unified_booking_id) ?? null,
    } as UnifiedBooking);
  }
  // ── PHASE 4: Post-enrichment filters (depend on joined/enriched data) ──
  let filteredResult = result;

  // MODIFIED status filter: channex_status comes from bookings_mirror, not unified_bookings
  if (params.status === "MODIFIED") {
    filteredResult = filteredResult.filter(b => b.channex_status?.toLowerCase() === "modified");
  }

  // actual_check_out date filter: actual_check_out_at comes from stays table
  if (params.dateFilterType === "actual_check_out" && (params.dateFrom || params.dateTo)) {
    filteredResult = filteredResult.filter(b => {
      if (!b.actual_check_out_at) return false;
      const checkoutDate = b.actual_check_out_at.slice(0, 10); // YYYY-MM-DD
      if (params.dateFrom && checkoutDate < params.dateFrom) return false;
      if (params.dateTo && checkoutDate > params.dateTo) return false;
      return true;
    });
  }

  // ota_property_id filter: ota_property_id comes from bookings_mirror, not unified_bookings
  if (params.propertyId && params.propertyId !== "all") {
    filteredResult = filteredResult.filter(b => b.ota_property_id === params.propertyId);
  }

  // If post-filters were applied, adjust totalCount (approximate — filtered from current page)
  const adjustedTotalCount = filteredResult.length < result.length
    ? filteredResult.length  // When post-filtering, we can only guarantee this page's count
    : totalCount;

  return { bookings: filteredResult, totalCount: adjustedTotalCount };
}

export function useBookingsPaginated(params: BookingQueryParams) {
  return useQuery<BookingsPaginatedResult>({
    queryKey: ["unified_bookings_paginated", params],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: () => fetchBookingsPaginated(params),
  });
}

// Lightweight hook: distinct filter options (sources, property names, room types)
// Optimization: only select single column per query, reduce data transfer
export function useBookingFilterOptions() {
  return useQuery({
    queryKey: ["booking_filter_options"],
    staleTime: 5 * 60_000, // 5 min cache
    refetchOnMount: false,
    refetchOnWindowFocus: false, // Stable data, no need to refetch on focus
    queryFn: async () => {
      // Fetch distinct values — only needed columns, limit 2000 (plenty for filter dropdowns)
      const [sourcesRes, propsRes, roomTypesRes, propIdsRes] = await Promise.all([
        safeQuery(() => supabase.from("unified_bookings").select("source").limit(2000)),
        safeQuery(() => supabase.from("unified_bookings").select("pms_property_name").limit(2000)),
        safeQuery(() => supabase.from("unified_bookings").select("ota_room_type_sold, pms_property_name").limit(2000)),
        // ota_property_id is the numeric OTA ID, stored in bookings_mirror (not unified_bookings)
        safeQuery(() => supabase.from("bookings_mirror").select("ota_property_id").not("ota_property_id", "is", null).limit(2000)),
      ]);

      // Normalize source casings to avoid duplicates (e.g. AGODA vs Agoda)
      const formatSource = (s: string) => {
        if (!s) return s;
        const upper = s.toUpperCase();
        if (upper === "TRIP.COM") return "Trip.com";
        if (upper === "BOOKING.COM") return "Booking.com";
        if (upper === "TRAVELOKA") return "Traveloka";
        if (upper === "AIRBNB") return "Airbnb";
        if (upper === "AGODA") return "Agoda";
        if (upper === "EXPEDIA") return "Expedia";
        if (upper === "DIRECT") return "Direct";
        if (upper === "MANUAL") return "Manual";
        if (upper === "CTRIP") return "Ctrip";
        // Default: capitalize first letter
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      };

      const rawSources = (sourcesRes.data || []).map((r: any) => r.source).filter(Boolean);
      const sources = [...new Set(rawSources.map((s: string) => formatSource(s)))].sort();

      const propertyNames = [...new Set((propsRes.data || []).map((r: any) => r.pms_property_name).filter(Boolean))].sort();
      const propertyIds = [...new Set((propIdsRes.data || []).map((r: any) => r.ota_property_id).filter(Boolean))].sort();

      // Room types grouped by property
      const roomTypesByProperty = new Map<string, Set<string>>();
      const allRoomTypes = new Set<string>();
      for (const r of (roomTypesRes.data || [])) {
        if (r.ota_room_type_sold) {
          allRoomTypes.add(r.ota_room_type_sold);
          if (r.pms_property_name) {
            if (!roomTypesByProperty.has(r.pms_property_name)) {
              roomTypesByProperty.set(r.pms_property_name, new Set());
            }
            roomTypesByProperty.get(r.pms_property_name)!.add(r.ota_room_type_sold);
          }
        }
      }

      return {
        sources: sources as string[],
        propertyNames: propertyNames as string[],
        propertyIds: propertyIds as string[],
        allRoomTypes: [...allRoomTypes].sort() as string[],
        roomTypesByProperty: Object.fromEntries(
          [...roomTypesByProperty.entries()].map(([k, v]) => [k, [...v].sort()])
        ) as Record<string, string[]>,
      };
    },
  });
}

// Lightweight hook: booking type counts for KPI chips
// Optimization: 2 queries instead of 5 — total count + type breakdown via single fetch
export function useBookingTypeCounts() {
  return useQuery({
    queryKey: ["booking_type_counts"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // 2 queries instead of 5: total count + type column for breakdown
      const [totalRes, typesRes] = await Promise.all([
        safeQuery(() => supabase.from("unified_bookings" as any).select("*", { count: "exact", head: true })),
        safeQuery(() => supabase.from("unified_bookings" as any).select("booking_type").limit(10000)),
      ]);

      const total = (totalRes as any).count ?? 0;
      let pms = 0, imported = 0, manual = 0;
      for (const r of ((typesRes as any).data || [])) {
        switch ((r as any).booking_type) {
          case 'PMS': case 'SYNCED': pms++; break;
          case 'IMPORTED': imported++; break;
          case 'MANUAL': manual++; break;
        }
      }

      return { pms, imported, manual, total };
    },
  });
}

// Fetch single booking by unified_booking_id
export function useBookingDetail(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking_detail", unifiedBookingId],
    queryFn: async () => {
      if (!unifiedBookingId) return null;

      // Safety net: use .limit(1) instead of .maybeSingle() to prevent
      // PGRST116 error when unified_bookings view returns >1 row
      // (e.g., stays table row multiplication before DB migration is applied)
      const { data: rows, error } = await supabase
        .from("unified_bookings")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId)
        .limit(1);

      if (error) throw error;
      if (!rows || rows.length === 0) return null;

      // Warn if duplicate detected (should not happen after migration)
      if (rows.length > 1) {
        console.warn(
          `[useBookingDetail] Duplicate rows detected for ${unifiedBookingId} (${rows.length} rows). Using first row. This indicates unified_bookings view dedup issue.`
        );
      }

      const data = rows[0];

      // Enrich PMS/SYNCED/IMPORTED booking with external IDs from bookings_mirror
      if ((data as any).booking_type === "PMS" || (data as any).booking_type === "SYNCED" || (data as any).booking_type === "IMPORTED") {
        const { data: mirror } = await supabase
          .from("bookings_mirror")
          .select(
            "pms_booking_id, ota_booking_code, provider_booking_id, channex_property_id, channex_room_type_id, ota_property_id, pms_property_id, pms_property_name, room_type, booking_type, channex_status"
          )
          .eq("unified_booking_id", unifiedBookingId)
          .maybeSingle();

        // Fetch rooms_count from booking_room_lines_mirror (source of truth for multi-room bookings)
        let roomsCount = 1;
        if (mirror?.pms_booking_id) {
          const { data: roomLines } = await supabase
            .from("booking_room_lines_mirror")
            .select("id")
            .eq("pms_booking_id", mirror.pms_booking_id);
          roomsCount = roomLines?.length || 1;
        }

        // Normalize booking_type: SYNCED -> PMS, IMPORTED stays IMPORTED
        let finalBookingType = (data as any).booking_type;
        if ((mirror as any)?.booking_type === "IMPORTED") {
          finalBookingType = "IMPORTED";
        } else if ((data as any).booking_type === "SYNCED" || mirror?.pms_booking_id) {
          finalBookingType = "PMS";
        }

        return {
          ...(data as UnifiedBooking),
          booking_type: finalBookingType,
          // rooms_count from booking_room_lines_mirror (Booking Center = source of truth)
          rooms_count: roomsCount,
          // Fill missing OTA/PMS display fields from mirror (important for IMPORTED)
          pms_property_id:
            (data as any).pms_property_id ?? (mirror as any)?.pms_property_id ?? null,
          pms_property_name:
            (data as any).pms_property_name ?? (mirror as any)?.pms_property_name ?? null,
          ota_room_type_sold: (data as any).ota_room_type_sold ?? (mirror as any)?.room_type ?? null,
          // Prioritize view data, fallback to mirror
          ota_booking_code:
            (data as any).ota_booking_code || (mirror as any)?.ota_booking_code || null,
          pms_booking_id: mirror?.pms_booking_id ?? null,
          provider_booking_id: (mirror as any)?.provider_booking_id ?? null,
          channex_property_id: (mirror as any)?.channex_property_id ?? null,
          channex_room_type_id: (mirror as any)?.channex_room_type_id ?? null,
          // ota_property_id is the numeric OTA ID (from mirror), not the Channex UUID
          ota_property_id: (mirror as any)?.ota_property_id ?? null,
          // Critical for "Giá phải thu" cancellation logic consistency
          channex_status: (mirror as any)?.channex_status ?? null,
        } as UnifiedBooking;
      }

      return data as UnifiedBooking;
    },
    enabled: !!unifiedBookingId,
  });
}

// Fetch payments for a booking
export function useBookingPayments(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking_payments", unifiedBookingId],
    queryFn: async () => {
      if (!unifiedBookingId) return [];

      const { data, error } = await supabase
        .from("unified_payments")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!unifiedBookingId,
  });
}

// Fetch hotel collects for a booking
export function useHotelCollects(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["hotel_collects", unifiedBookingId],
    queryFn: async () => {
      if (!unifiedBookingId) return [];

      const { data, error } = await supabase
        .from("hotel_collects")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;
      return data as HotelCollect[] || [];
    },
    enabled: !!unifiedBookingId,
  });
}

// Create hotel collect payment
export function useCreateHotelCollect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      unified_booking_id: string;
      amount_collected: number;
      payment_method: string;
      payee_type: string;
      related_type?: string;
      related_id?: string;
      note?: string;
      receipt_image?: string;
      receipt_status?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("hotel_collects")
        .insert({
          unified_booking_id: data.unified_booking_id,
          amount_collected: data.amount_collected,
          payment_method: data.payment_method,
          payee_type: data.payee_type,
          payer_type: "GUEST",
          related_type: data.related_type || "ROOM",
          related_id: data.related_id || null,
          note: data.note || null,
          collected_at: new Date().toISOString(),
          collected_by: user?.id,
          receipt_image: data.receipt_image || null,
          receipt_status: data.receipt_image ? "UPLOADED" : "PENDING",
        })
        .select()
        .single();

      if (error) throw error;

      // CRITICAL: Create cashflow entry ONLY when ROOMRISE collects (actual cash-in)
      // Thu tiền = nguồn DUY NHẤT tạo Cash-in
      if (data.payee_type === "ROOMRISE") {
        await safeMutation(() => supabase.from("cashflow_entries").insert({
          cash_date: new Date().toISOString().split("T")[0],
          amount: data.amount_collected,
          direction: "IN",
          source_type: "HOTEL_COLLECT",
          source_id: result.id,
          counterparty_type: "GUEST",
          counterparty_id: data.unified_booking_id,
          note: `Thu tiền ${data.related_type || "ROOM"}: ${data.note || ""}`.trim(),
          created_by: user?.id,
        }));
      }

      // Sync host payables after collecting fees (especially when HOST collects directly)
      // This ensures host payable data stays in sync
      try {
        await syncHostPayables(data.unified_booking_id);
      } catch (syncError) {
        console.error("Failed to sync host payables:", syncError);
      }

      return result;
    },
    onSuccess: (_, variables) => {
      toast.success("Thu tiền thành công");
      // Partial invalidation: immediate for booking-related data
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["hotel_collects", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["booking_payments", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["booking_detail", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["audit_logs", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["collection-summary", variables.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["collections"] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
        queryClient.invalidateQueries({ queryKey: ["host_payables"] });
        queryClient.invalidateQueries({ queryKey: ["host-payable-detail"] });
        queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
        queryClient.invalidateQueries({ queryKey: ["cashflow_entries"] });
      }, 100);
      // Delay dashboard KPIs refresh
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-today-collections"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-month-collections"] });
      }, 500);
    },
    onError: (error) => {
      toast.error("Lỗi khi thu tiền: " + error.message);
    },
  });
}

// Confirm rounding adjustment for small outstanding amounts (≤ 1,000 VND)
// Inserts a balancing hotel_collects record so roomRemaining naturally becomes 0.
// Does NOT modify booking revenue. Does NOT create cashflow entry (write-off, not real cash).
export function useConfirmRoundingAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookingId, amount, reason }: { bookingId: string; amount: number; reason?: string }) => {
      const { data, error } = await (supabase.rpc as any)("confirm_room_rounding_secure", {
        p_booking_id: bookingId,
        p_amount: Math.round(amount),
        p_reason: reason || "ROUNDING_WRITE_OFF",
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      if (data?.idempotent) {
        toast.info("Đã áp dụng điều chỉnh làm tròn trước đó");
      } else {
        toast.success(`Đã áp dụng điều chỉnh làm tròn: ${Math.round(variables.amount)}đ`);
      }
      // Invalidate hotel_collects + booking detail
      queryClient.invalidateQueries({ queryKey: ["hotel_collects", variables.bookingId] });
      queryClient.invalidateQueries({ queryKey: ["booking_detail", variables.bookingId] });
      queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", variables.bookingId] });
      queryClient.invalidateQueries({ queryKey: ["collection-summary", variables.bookingId] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    onError: (error) => {
      toast.error("Lỗi điều chỉnh làm tròn: " + error.message);
    },
  });
}

// Fetch host room info
export function useHostRoom(hostRoomId: string | undefined) {
  return useQuery({
    queryKey: ["host_room", hostRoomId],
    queryFn: async () => {
      if (!hostRoomId) return null;

      const { data, error } = await supabase
        .from("host_rooms")
        .select("id, partner_id, room_code, room_type, cost_per_night, partners(partner_name)")
        .eq("id", hostRoomId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!hostRoomId,
  });
}

// Fetch service orders for a booking
export function useServiceOrders(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["service_orders", unifiedBookingId],
    queryFn: async () => {
      if (!unifiedBookingId) return [];

      const { data, error } = await supabase
        .from("service_orders")
        .select("*, service_catalog(service_name, service_type), partners(partner_name)")
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!unifiedBookingId,
  });
}

// Fetch documents for a booking
export function useGuestDocuments(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["guest_documents", unifiedBookingId],
    queryFn: async () => {
      if (!unifiedBookingId) return [];

      const { data, error } = await supabase
        .from("guest_documents")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!unifiedBookingId,
  });
}

// Fetch audit logs for a booking with user profile info (including related entities)
export function useBookingAuditLogs(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking_audit_logs", unifiedBookingId],
    queryFn: async () => {
      if (!unifiedBookingId) return { logs: [], profiles: {} as Record<string, { full_name: string | null; email: string | null }> };

      // PHASE 1: Fetch direct logs + all related entity IDs IN PARALLEL
      const [
        { data: directLogs, error: directError },
        { data: paymentRequests },
        { data: hotelCollects },
        { data: hostSegments },
        { data: guestDocs },
        { data: disputes },
      ] = await Promise.all([
        supabase
          .from("audit_logs")
          .select("*")
          .eq("entity_id", unifiedBookingId)
          .order("event_time", { ascending: false }),
        supabase
          .from("payment_requests")
          .select("id")
          .eq("unified_booking_id", unifiedBookingId),
        supabase
          .from("hotel_collects")
          .select("id")
          .eq("unified_booking_id", unifiedBookingId),
        supabase
          .from("host_supply_segments")
          .select("id")
          .eq("unified_booking_id", unifiedBookingId),
        supabase
          .from("guest_documents")
          .select("id")
          .eq("unified_booking_id", unifiedBookingId),
        supabase
          .from("ota_disputes")
          .select("id")
          .eq("unified_booking_id", unifiedBookingId),
      ]);

      if (directError) throw directError;

      // Combine all related entity IDs
      const allRelatedIds = [
        ...(paymentRequests?.map(pr => pr.id) || []),
        ...(hotelCollects?.map(hc => hc.id) || []),
        ...(hostSegments?.map(hs => hs.id) || []),
        ...(guestDocs?.map(gd => gd.id) || []),
        ...(disputes?.map(d => d.id) || []),
      ];

      // PHASE 2: Fetch related audit logs (if any)
      let relatedLogs: any[] = [];
      if (allRelatedIds.length > 0) {
        const { data: related, error: relatedError } = await supabase
          .from("audit_logs")
          .select("*")
          .in("entity_id", allRelatedIds)
          .order("event_time", { ascending: false });

        if (!relatedError && related) {
          relatedLogs = related;
        }
      }

      // Merge and sort all logs by event_time descending
      const allLogs = [...(directLogs || []), ...relatedLogs];
      allLogs.sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime());

      // Deduplicate by id
      const seen = new Set<string>();
      const dedupedLogs = allLogs.filter(log => {
        if (seen.has(log.id)) return false;
        seen.add(log.id);
        return true;
      });

      // PHASE 3: Fetch user profiles for all unique user_ids
      const userIds = [...new Set(dedupedLogs.map(l => l.user_id).filter(Boolean))] as string[];
      const profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);

        for (const p of (profilesData || [])) {
          profilesMap[p.id] = { full_name: p.full_name, email: p.email };
        }
      }

      return { logs: dedupedLogs, profiles: profilesMap };
    },
    enabled: !!unifiedBookingId,
  });
}

// Fetch stay record for a booking
export function useStayRecord(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["stay_record", unifiedBookingId],
    queryFn: async () => {
      if (!unifiedBookingId) return null;

      const { data, error } = await supabase
        .from("stays")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!unifiedBookingId,
  });
}
