/**
 * useAnalyticsData Hook
 * 
 * Data fetching and aggregation for the Analytics module.
 * Uses unified_bookings for revenue and host_supply_segments for host cost (TRUE SOT).
 * 
 * NOTE: For production, consider creating Supabase RPCs for server-side aggregation.
 * Client-side aggregation works well for moderate data volumes (<10k bookings).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfMonth, startOfQuarter, startOfWeek, differenceInDays } from 'date-fns';
import type {
  AnalyticsFilters,
  TimeSeriesRow,
  PivotRankingRow,
  ChannelShareRow,
  KpiData,
  FilterOption,
  Granularity,
} from '../types';
import {
  MIN_NIGHTS_FOR_ADR,
  calculateRevenueAdr,
  calculateHostAdr,
  calculateMarginSpread,
  calculatePopChange,
  calculateSharePct,
  formatPeriodLabel,
  normalizeChannelName,
  RANKING_CHART_LIMIT,
  CHANNEL_SHARE_LIMIT,
  UNMAPPED_LABEL,
} from '../constants';

// An Gia Residences group ID
const AN_GIA_GROUP_ID = '72e58e1b-1e34-4678-9100-71c778ecf6d0';

// ============================================================================
// RAW DATA FETCHING
// ============================================================================

interface RawBookingRow {
  unified_booking_id: string;
  check_in_date: string;
  nights: number;
  total_amount_net: number | null;
  source: string;
  pms_property_id: string | null;
  pms_property_name: string | null;
  host_property_name: string | null;
  booking_status: string;
}

interface RawSegmentRow {
  unified_booking_id: string;
  host_property_name: string | null;
  host_room_type: string | null;
  date_from: string;
  nights: number;
  total_amount: number;
}

/**
 * Fetch property-to-district (area) mapping from property_catalog
 * Returns a Map of property_name -> district
 */
async function fetchPropertyToAreaMapping(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('property_catalog')
    .select('property_name, district')
    .eq('is_active', true)
    .not('district', 'is', null);

  if (error) {
    console.error('[fetchPropertyToAreaMapping] Error:', error);
    return new Map();
  }

  const mapping = new Map<string, string>();
  data?.forEach(p => {
    if (p.property_name && p.district) {
      mapping.set(p.property_name, p.district);
    }
  });

  console.log(`[fetchPropertyToAreaMapping] Mapped ${mapping.size} properties to areas`);
  return mapping;
}

/**
 * Fetch host cost data from host_supply_segments (TRUE SOT for Host Cost)
 * Returns a Map of unified_booking_id -> { totalCost, totalNights, propertyName }
 * 
 * IMPORTANT: This uses segment's date_from (actual stay date) not booking's check_in_date
 * to ensure accurate cost attribution.
 */
async function fetchHostCostByBooking(
  dateStart: string,
  dateEnd: string
): Promise<Map<string, { totalCost: number; totalNights: number; propertyName: string }>> {
  const pageSize = 1000;
  const allSegments: RawSegmentRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('host_supply_segments')
      .select('unified_booking_id, host_property_name, host_room_type, date_from, nights, total_amount')
      .gte('date_from', dateStart)
      .lte('date_from', dateEnd)
      .order('date_from', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!page || page.length === 0) break;

    allSegments.push(...(page as RawSegmentRow[]));
    if (page.length < pageSize) break;
  }

  console.log(`[fetchHostCostByBooking] Fetched ${allSegments.length} segments for date range ${dateStart} to ${dateEnd}`);

  // Aggregate by booking
  const costMap = new Map<string, { totalCost: number; totalNights: number; propertyName: string }>();

  for (const seg of allSegments) {
    if (!costMap.has(seg.unified_booking_id)) {
      costMap.set(seg.unified_booking_id, {
        totalCost: 0,
        totalNights: 0,
        propertyName: seg.host_property_name || 'Unknown',
      });
    }
    const entry = costMap.get(seg.unified_booking_id)!;
    entry.totalCost += seg.total_amount || 0;
    entry.totalNights += seg.nights || 0;
    // Use first segment's property name
    if (entry.propertyName === 'Unknown' && seg.host_property_name) {
      entry.propertyName = seg.host_property_name;
    }
  }

  console.log(`[fetchHostCostByBooking] Mapped ${costMap.size} bookings with host cost data`);
  return costMap;
}

/**
 * Fetch host cost data aggregated by property (from host_supply_segments)
 * This is the TRUE SOT for property-level host cost analysis.
 * Returns property-aggregated data for direct use in rankings.
 */
async function fetchHostCostByProperty(
  dateStart: string,
  dateEnd: string
): Promise<Map<string, { totalCost: number; totalNights: number; segmentCount: number; bookingIds: Set<string> }>> {
  const pageSize = 1000;
  const allSegments: RawSegmentRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('host_supply_segments')
      .select('unified_booking_id, host_property_name, host_room_type, date_from, nights, total_amount')
      .gte('date_from', dateStart)
      .lte('date_from', dateEnd)
      .order('date_from', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!page || page.length === 0) break;

    allSegments.push(...(page as RawSegmentRow[]));
    if (page.length < pageSize) break;
  }

  // Aggregate by property (using host_property_name from segments)
  const propertyMap = new Map<string, { totalCost: number; totalNights: number; segmentCount: number; bookingIds: Set<string> }>();

  for (const seg of allSegments) {
    const propertyName = seg.host_property_name || 'Unknown';

    if (!propertyMap.has(propertyName)) {
      propertyMap.set(propertyName, {
        totalCost: 0,
        totalNights: 0,
        segmentCount: 0,
        bookingIds: new Set(),
      });
    }
    const entry = propertyMap.get(propertyName)!;
    entry.totalCost += seg.total_amount || 0;
    entry.totalNights += seg.nights || 0;
    entry.segmentCount += 1;
    entry.bookingIds.add(seg.unified_booking_id);
  }

  console.log(`[fetchHostCostByProperty] Mapped ${propertyMap.size} properties with host cost data`);
  return propertyMap;
}

async function fetchAnalyticsBookings(
  dateStart: string,
  dateEnd: string
): Promise<RawBookingRow[]> {
  // Fetch property IDs belonging to An Gia group
  const { data: propertyLinks } = await supabase
    .from('channex_property_groups')
    .select('channex_property_id')
    .eq('channex_group_id', AN_GIA_GROUP_ID);

  const groupPropertyIds = propertyLinks?.map(p => p.channex_property_id) || [];

  // Paginated fetch from unified_bookings
  const pageSize = 1000;
  const allBookings: RawBookingRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('unified_bookings')
      .select('unified_booking_id, check_in_date, nights, total_amount_net, source, pms_property_id, pms_property_name, host_property_name, booking_status')
      .gte('check_in_date', dateStart)
      .lte('check_in_date', dateEnd)
      .neq('booking_status', 'CANCELLED')
      .order('check_in_date', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!page || page.length === 0) break;

    // Filter by An Gia group properties if we have property links
    const filtered = groupPropertyIds.length > 0
      ? page.filter(b => !b.pms_property_id || groupPropertyIds.includes(b.pms_property_id))
      : page;

    allBookings.push(...(filtered as RawBookingRow[]));
    if (page.length < pageSize) break;
  }

  return allBookings;
}

// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

function getPeriodKey(checkInDate: string, granularity: Granularity): string {
  const date = parseISO(checkInDate);
  switch (granularity) {
    case 'day':
      return format(date, 'yyyy-MM-dd');
    case 'week': {
      // ISO week: starts on Monday
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      return format(weekStart, 'yyyy-MM-dd');
    }
    case 'quarter': {
      const q = Math.ceil((date.getMonth() + 1) / 3);
      return `${date.getFullYear()}-Q${q}`;
    }
    case 'month':
    default:
      return format(date, 'yyyy-MM');
  }
}

function getPeriodStart(periodKey: string, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      // periodKey is already "yyyy-MM-dd"
      return periodKey;
    case 'week':
      // periodKey is already "yyyy-MM-dd" (Monday)
      return periodKey;
    case 'quarter': {
      // periodKey is like "2025-Q1"
      const [year, qStr] = periodKey.split('-Q');
      const quarter = parseInt(qStr, 10);
      const month = (quarter - 1) * 3 + 1;
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
    case 'month':
    default:
      // periodKey is like "2025-01"
      return `${periodKey}-01`;
  }
}

interface AggregatedBucket {
  revenueTotal: number;
  hostCostTotal: number;
  nightsTotal: number;
  hostCostNights: number; // Nights from segments (separate from booking nights for accuracy)
  bookingIds: Set<string>;
}

function createEmptyBucket(): AggregatedBucket {
  return {
    revenueTotal: 0,
    hostCostTotal: 0,
    nightsTotal: 0,
    hostCostNights: 0,
    bookingIds: new Set(),
  };
}

interface EnrichedBooking extends RawBookingRow {
  hostCost: number;
  hostCostNights: number;
  effectivePropertyName: string;
  area: string; // district from property_catalog
}

function aggregateBookings(
  bookings: EnrichedBooking[],
  granularity: Granularity,
  groupBy: 'period' | 'channel' | 'property' | 'area'
): Map<string, AggregatedBucket> {
  const buckets = new Map<string, AggregatedBucket>();

  for (const booking of bookings) {
    let key: string;
    switch (groupBy) {
      case 'period':
        key = getPeriodKey(booking.check_in_date, granularity);
        break;
      case 'channel':
        key = normalizeChannelName(booking.source);
        break;
      case 'property':
        // Use effectivePropertyName which comes from host_supply_segments (SOT)
        key = booking.effectivePropertyName;
        break;
      case 'area':
        // Use area (district) from property_catalog mapping
        key = booking.area || UNMAPPED_LABEL;
        break;
    }

    if (!buckets.has(key)) {
      buckets.set(key, createEmptyBucket());
    }

    const bucket = buckets.get(key)!;
    bucket.revenueTotal += booking.total_amount_net || 0;
    bucket.hostCostTotal += booking.hostCost || 0;
    bucket.nightsTotal += booking.nights || 0;
    bucket.hostCostNights += booking.hostCostNights || 0;
    bucket.bookingIds.add(booking.unified_booking_id);
  }

  return buckets;
}

// ============================================================================
// TIME SERIES DATA
// ============================================================================

export function useAnalyticsTimeSeries(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ['analytics-time-series', filters.dateStart, filters.dateEnd, filters.granularity, filters.pivot, filters.selectedIds],
    queryFn: async () => {
      // Fetch bookings, host cost data, and area mapping in parallel
      const [bookings, hostCostMap, areaMapping] = await Promise.all([
        fetchAnalyticsBookings(filters.dateStart, filters.dateEnd),
        fetchHostCostByBooking(filters.dateStart, filters.dateEnd),
        fetchPropertyToAreaMapping(),
      ]);

      // Enrich bookings with host cost data from segments (TRUE SOT)
      const enrichedBookings: EnrichedBooking[] = bookings.map(b => {
        const hostData = hostCostMap.get(b.unified_booking_id);
        const effectivePropertyName = hostData?.propertyName || b.host_property_name || b.pms_property_name || UNMAPPED_LABEL;
        // Get area from property_catalog mapping
        const area = areaMapping.get(effectivePropertyName) || areaMapping.get(b.pms_property_name || '') || UNMAPPED_LABEL;
        return {
          ...b,
          hostCost: hostData?.totalCost || 0,
          hostCostNights: hostData?.totalNights || 0,
          effectivePropertyName,
          area,
        };
      });

      // Filter by pivot selection if applicable
      let filteredBookings = enrichedBookings;
      if (filters.selectedIds.length > 0) {
        switch (filters.pivot) {
          case 'channel':
            filteredBookings = enrichedBookings.filter(b =>
              filters.selectedIds.includes(normalizeChannelName(b.source))
            );
            break;
          case 'property':
            // Filter by effectivePropertyName (SOT from host_supply_segments)
            filteredBookings = enrichedBookings.filter(b =>
              filters.selectedIds.includes(b.effectivePropertyName)
            );
            break;
          case 'area':
            // Filter by area (district from property_catalog)
            filteredBookings = enrichedBookings.filter(b =>
              filters.selectedIds.includes(b.area)
            );
            break;
        }
      }

      // Aggregate by period
      const periodBuckets = aggregateBookings(filteredBookings, filters.granularity, 'period');

      // Generate sorted time series
      const periods = Array.from(periodBuckets.keys()).sort();
      const timeSeries: TimeSeriesRow[] = periods.map(periodKey => {
        const bucket = periodBuckets.get(periodKey)!;
        const bookingsCount = bucket.bookingIds.size;

        // Use hostCostNights for ADR Host calculation (more accurate)
        const nightsForHostAdr = bucket.hostCostNights > 0 ? bucket.hostCostNights : bucket.nightsTotal;
        const belowSampleThreshold = bucket.nightsTotal < MIN_NIGHTS_FOR_ADR;

        const revenueAdr = calculateRevenueAdr(bucket.revenueTotal, bucket.nightsTotal);
        const hostAdr = calculateHostAdr(bucket.hostCostTotal, nightsForHostAdr);
        const marginSpread = calculateMarginSpread(revenueAdr, hostAdr);

        return {
          periodStart: getPeriodStart(periodKey, filters.granularity),
          periodLabel: formatPeriodLabel(getPeriodStart(periodKey, filters.granularity), filters.granularity),
          revenueTotal: bucket.revenueTotal,
          hostCostTotal: bucket.hostCostTotal,
          nightsTotal: bucket.nightsTotal,
          bookingsCount,
          revenueAdr,
          hostAdr,
          marginSpread,
          belowSampleThreshold,
        };
      });

      // Calculate total KPIs
      const totalRevenue = filteredBookings.reduce((sum, b) => sum + (b.total_amount_net || 0), 0);
      const totalHostCost = filteredBookings.reduce((sum, b) => sum + (b.hostCost || 0), 0);
      const totalNights = filteredBookings.reduce((sum, b) => sum + (b.nights || 0), 0);
      const totalHostCostNights = filteredBookings.reduce((sum, b) => sum + (b.hostCostNights || 0), 0);
      const totalBookings = new Set(filteredBookings.map(b => b.unified_booking_id)).size;
      const belowThreshold = totalNights < MIN_NIGHTS_FOR_ADR;

      const nightsForTotalHostAdr = totalHostCostNights > 0 ? totalHostCostNights : totalNights;
      const totalRevenueAdr = calculateRevenueAdr(totalRevenue, totalNights);
      const totalHostAdr = calculateHostAdr(totalHostCost, nightsForTotalHostAdr);
      const totalMarginSpread = calculateMarginSpread(totalRevenueAdr, totalHostAdr);

      // Calculate period-over-period changes (compare last 2 periods)
      let revenuePop: number | null = null;
      let hostAdrPop: number | null = null;
      let marginSpreadPop: number | null = null;

      if (timeSeries.length >= 2) {
        const current = timeSeries[timeSeries.length - 1];
        const previous = timeSeries[timeSeries.length - 2];

        revenuePop = calculatePopChange(current.revenueTotal, previous.revenueTotal);
        if (current.hostAdr !== null && previous.hostAdr !== null && previous.hostAdr !== 0) {
          hostAdrPop = calculatePopChange(current.hostAdr, previous.hostAdr);
        }
        if (current.marginSpread !== null && previous.marginSpread !== null) {
          marginSpreadPop = current.marginSpread - previous.marginSpread; // absolute change
        }
      }

      const totalKpi: KpiData = {
        revenueTotal: totalRevenue,
        hostCostTotal: totalHostCost,
        nightsTotal: totalNights,
        bookingsCount: totalBookings,
        revenueAdr: totalRevenueAdr,
        hostAdr: totalHostAdr,
        marginSpread: totalMarginSpread,
        belowSampleThreshold: belowThreshold,
        revenuePop,
        hostAdrPop,
        marginSpreadPop,
      };

      return { data: timeSeries, totalKpi };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,   // 30 minutes
  });
}

// ============================================================================
// PIVOT RANKING DATA
// ============================================================================

export function useAnalyticsPivotRanking(
  filters: AnalyticsFilters,
  metric: 'revenue' | 'hostCost' | 'revenueAdr' | 'hostAdr' | 'marginSpread' = 'revenue',
  limit: number = RANKING_CHART_LIMIT,
  sortDirection: 'desc' | 'asc' = 'desc'
) {
  return useQuery({
    queryKey: ['analytics-pivot-ranking', filters.dateStart, filters.dateEnd, filters.granularity, filters.pivot, filters.selectedIds, metric, limit, sortDirection],
    queryFn: async () => {
      if (filters.pivot === 'all') {
        return { data: [], totalInRange: 0 };
      }

      // Define type for hostPropertyMap
      type HostPropertyData = { totalCost: number; totalNights: number; segmentCount: number; bookingIds: Set<string> };

      // For property pivot, fetch host cost by property directly from segments (TRUE SOT)
      // This ensures accurate host cost attribution by host_property_name
      const [bookings, hostCostMap, hostPropertyMapRaw, areaMapping] = await Promise.all([
        fetchAnalyticsBookings(filters.dateStart, filters.dateEnd),
        fetchHostCostByBooking(filters.dateStart, filters.dateEnd),
        filters.pivot === 'property'
          ? fetchHostCostByProperty(filters.dateStart, filters.dateEnd)
          : Promise.resolve(null as Map<string, HostPropertyData> | null),
        fetchPropertyToAreaMapping(),
      ]);

      // Cast to proper type for TypeScript
      const hostPropertyMap = hostPropertyMapRaw as Map<string, HostPropertyData> | null;

      // Enrich bookings with host cost data
      const enrichedBookings: EnrichedBooking[] = bookings.map(b => {
        const hostData = hostCostMap.get(b.unified_booking_id);
        const effectivePropertyName = hostData?.propertyName || b.host_property_name || b.pms_property_name || UNMAPPED_LABEL;
        const area = areaMapping.get(effectivePropertyName) || areaMapping.get(b.pms_property_name || '') || UNMAPPED_LABEL;
        return {
          ...b,
          hostCost: hostData?.totalCost || 0,
          hostCostNights: hostData?.totalNights || 0,
          effectivePropertyName,
          area,
        };
      });

      // For property pivot with hostPropertyMap, use segment-based property aggregation
      if (filters.pivot === 'property' && hostPropertyMap) {
        // Build a map from booking_id -> booking data for quick lookup
        const bookingDataMap = new Map<string, { revenueTotal: number; nightsTotal: number }>();
        for (const booking of enrichedBookings) {
          bookingDataMap.set(booking.unified_booking_id, {
            revenueTotal: booking.total_amount_net || 0,
            nightsTotal: booking.nights || 0,
          });
        }

        // Calculate grand totals
        const grandTotalHostCost = Array.from(hostPropertyMap.values()).reduce((sum, p) => sum + p.totalCost, 0);

        // Calculate grand total revenue from bookings linked to segments
        let grandTotalRevenue = 0;
        for (const [, hostData] of hostPropertyMap.entries()) {
          for (const bookingId of hostData.bookingIds) {
            const booking = bookingDataMap.get(bookingId);
            if (booking) {
              grandTotalRevenue += booking.revenueTotal;
            }
          }
        }
        const grandTotal = metric === 'hostCost' ? grandTotalHostCost : grandTotalRevenue;

        const rows: PivotRankingRow[] = [];

        // Create rows from host_supply_segments (TRUE SOT for host cost)
        // Use bookingIds to correctly link revenue to each host property
        for (const [hostPropertyName, hostData] of hostPropertyMap.entries()) {
          // Calculate revenue from bookings linked to this host property's segments
          let revenueTotal = 0;
          let revenueNights = 0;

          for (const bookingId of hostData.bookingIds) {
            const booking = bookingDataMap.get(bookingId);
            if (booking) {
              revenueTotal += booking.revenueTotal;
              revenueNights += booking.nightsTotal;
            }
          }

          const bookingsCount = hostData.bookingIds.size;

          const belowSampleThreshold = hostData.totalNights < MIN_NIGHTS_FOR_ADR;
          const revenueAdr = calculateRevenueAdr(revenueTotal, revenueNights);
          const hostAdr = calculateHostAdr(hostData.totalCost, hostData.totalNights);
          const marginSpread = calculateMarginSpread(revenueAdr, hostAdr);

          const shareBase = metric === 'hostCost' ? hostData.totalCost : revenueTotal;
          const sharePct = calculateSharePct(shareBase, grandTotal);

          rows.push({
            pivotId: hostPropertyName,
            pivotName: hostPropertyName,
            revenueTotal,
            hostCostTotal: hostData.totalCost,
            nightsTotal: hostData.totalNights,
            bookingsCount,
            revenueAdr,
            hostAdr,
            marginSpread,
            sharePct,
            belowSampleThreshold,
          });
        }

        // Note: We no longer need to add "revenue only" properties separately
        // because all revenue is now correctly linked via booking IDs from segments

        // Sort by metric
        const getSortValue = (row: PivotRankingRow): number => {
          switch (metric) {
            case 'revenue': return row.revenueTotal;
            case 'hostCost': return row.hostCostTotal;
            case 'revenueAdr': return row.revenueAdr ?? 0;
            case 'hostAdr': return row.hostAdr ?? 0;
            case 'marginSpread': return row.marginSpread ?? 0;
            default: return row.revenueTotal;
          }
        };

        rows.sort((a, b) => {
          const diff = getSortValue(b) - getSortValue(a);
          return sortDirection === 'desc' ? diff : -diff;
        });

        return {
          data: rows.slice(0, limit),
          totalInRange: grandTotal,
        };
      }

      // For channel and area pivot, use existing logic
      const groupBy = filters.pivot === 'channel' ? 'channel' : filters.pivot === 'area' ? 'area' : 'property';
      const buckets = aggregateBookings(enrichedBookings, filters.granularity, groupBy);

      // Calculate total for share %
      const grandTotal = Array.from(buckets.values()).reduce(
        (sum, b) => sum + (metric === 'hostCost' ? b.hostCostTotal : b.revenueTotal),
        0
      );

      // Build ranking rows
      const rows: PivotRankingRow[] = Array.from(buckets.entries()).map(([key, bucket]) => {
        const bookingsCount = bucket.bookingIds.size;
        const belowSampleThreshold = bucket.nightsTotal < MIN_NIGHTS_FOR_ADR;

        const nightsForHostAdr = bucket.hostCostNights > 0 ? bucket.hostCostNights : bucket.nightsTotal;
        const revenueAdr = calculateRevenueAdr(bucket.revenueTotal, bucket.nightsTotal);
        const hostAdr = calculateHostAdr(bucket.hostCostTotal, nightsForHostAdr);
        const marginSpread = calculateMarginSpread(revenueAdr, hostAdr);

        const shareBase = metric === 'hostCost' ? bucket.hostCostTotal : bucket.revenueTotal;
        const sharePct = calculateSharePct(shareBase, grandTotal);

        // For property pivot, key is already the property name (from effectivePropertyName)
        const pivotName = key;

        return {
          pivotId: key,
          pivotName,
          revenueTotal: bucket.revenueTotal,
          hostCostTotal: bucket.hostCostTotal,
          nightsTotal: bucket.nightsTotal,
          bookingsCount,
          revenueAdr,
          hostAdr,
          marginSpread,
          sharePct,
          belowSampleThreshold,
        };
      });

      // Sort by metric
      const getSortValue = (row: PivotRankingRow): number => {
        switch (metric) {
          case 'revenue': return row.revenueTotal;
          case 'hostCost': return row.hostCostTotal;
          case 'revenueAdr': return row.revenueAdr ?? 0;
          case 'hostAdr': return row.hostAdr ?? 0;
          case 'marginSpread': return row.marginSpread ?? 0;
          default: return row.revenueTotal;
        }
      };

      rows.sort((a, b) => {
        const diff = getSortValue(b) - getSortValue(a);
        return sortDirection === 'desc' ? diff : -diff;
      });

      return {
        data: rows.slice(0, limit),
        totalInRange: grandTotal,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

// ============================================================================
// CHANNEL SHARE DATA
// ============================================================================

export function useAnalyticsChannelShare(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ['analytics-channel-share', filters.dateStart, filters.dateEnd],
    queryFn: async () => {
      // Fetch bookings, host cost data, and area mapping in parallel
      const [bookings, hostCostMap, areaMapping] = await Promise.all([
        fetchAnalyticsBookings(filters.dateStart, filters.dateEnd),
        fetchHostCostByBooking(filters.dateStart, filters.dateEnd),
        fetchPropertyToAreaMapping(),
      ]);

      // Enrich bookings with host cost data
      const enrichedBookings: EnrichedBooking[] = bookings.map(b => {
        const hostData = hostCostMap.get(b.unified_booking_id);
        const effectivePropertyName = hostData?.propertyName || b.host_property_name || b.pms_property_name || UNMAPPED_LABEL;
        const area = areaMapping.get(effectivePropertyName) || areaMapping.get(b.pms_property_name || '') || UNMAPPED_LABEL;
        return {
          ...b,
          hostCost: hostData?.totalCost || 0,
          hostCostNights: hostData?.totalNights || 0,
          effectivePropertyName,
          area,
        };
      });

      const buckets = aggregateBookings(enrichedBookings, 'month', 'channel');

      const grandTotal = Array.from(buckets.values()).reduce((sum, b) => sum + b.revenueTotal, 0);

      const rows: ChannelShareRow[] = Array.from(buckets.entries())
        .map(([channelName, bucket]) => ({
          channelId: channelName,
          channelName,
          revenueTotal: bucket.revenueTotal,
          sharePct: calculateSharePct(bucket.revenueTotal, grandTotal),
        }))
        .sort((a, b) => b.revenueTotal - a.revenueTotal);

      // Group smaller channels into "Others"
      if (rows.length > CHANNEL_SHARE_LIMIT) {
        const top = rows.slice(0, CHANNEL_SHARE_LIMIT - 1);
        const others = rows.slice(CHANNEL_SHARE_LIMIT - 1);
        const othersTotal = others.reduce((sum, r) => sum + r.revenueTotal, 0);

        return {
          data: [
            ...top,
            {
              channelId: 'others',
              channelName: 'Khác',
              revenueTotal: othersTotal,
              sharePct: calculateSharePct(othersTotal, grandTotal),
            },
          ],
        };
      }

      return { data: rows };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

// ============================================================================
// FILTER OPTIONS (for multi-select dropdowns)
// ============================================================================

export function useAnalyticsFilterOptions(pivot: 'channel' | 'property' | 'area') {
  return useQuery({
    queryKey: ['analytics-filter-options', pivot],
    queryFn: async () => {
      if (pivot === 'channel') {
        // Get unique channels from recent bookings
        const { data } = await supabase
          .from('unified_bookings')
          .select('source')
          .neq('booking_status', 'CANCELLED')
          .limit(5000);

        const channels = new Set(data?.map(b => normalizeChannelName(b.source)) || []);
        return Array.from(channels)
          .filter(c => c && c !== 'Unknown')
          .sort()
          .map(c => ({ id: c, name: c })) as FilterOption[];
      }

      if (pivot === 'property') {
        // Get unique OTA property names (pms_property_name) from bookings
        const properties = new Set<string>();

        // Get from bookings_mirror (OTA property names)
        const { data: bookingData } = await supabase
          .from('bookings_mirror')
          .select('pms_property_name')
          .neq('booking_status', 'CANCELLED')
          .not('pms_property_name', 'is', null)
          .limit(5000);

        bookingData?.forEach(b => {
          if (b.pms_property_name) properties.add(b.pms_property_name);
        });

        // Also get from unified_bookings as fallback
        const { data: unifiedData } = await supabase
          .from('unified_bookings')
          .select('pms_property_name')
          .neq('booking_status', 'CANCELLED')
          .not('pms_property_name', 'is', null)
          .limit(5000);

        unifiedData?.forEach(b => {
          if (b.pms_property_name) properties.add(b.pms_property_name);
        });

        return Array.from(properties)
          .sort()
          .map(name => ({ id: name, name })) as FilterOption[];
      }

      // Area - use district from property_catalog as area
      if (pivot === 'area') {
        const { data } = await supabase
          .from('property_catalog')
          .select('district')
          .eq('is_active', true)
          .not('district', 'is', null);

        const districts = new Set<string>();
        data?.forEach(p => {
          if (p.district) districts.add(p.district);
        });

        return Array.from(districts)
          .sort()
          .map(district => ({ id: district, name: district })) as FilterOption[];
      }

      return [] as FilterOption[];
    },
    staleTime: 30 * 60 * 1000, // 30 minutes - options don't change often
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 60 * 60 * 1000,
  });
}

// ============================================================================
// CHANNEL TIME SERIES DATA (for Stacked Area Chart)
// ============================================================================

export interface ChannelTimeSeriesResult {
  /** Pivoted data: { period: string, [channelName]: number } */
  data: Array<Record<string, string | number>>;
  /** Channel names in order of total revenue (top first) */
  channels: string[];
}

const CHANNEL_TIME_SERIES_LIMIT = 4; // Top 4 + "Khác"

export function useChannelTimeSeries(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ['analytics-channel-time-series', filters.dateStart, filters.dateEnd, filters.granularity, filters.selectedIds],
    queryFn: async (): Promise<ChannelTimeSeriesResult> => {
      const [bookings, hostCostMap, areaMapping] = await Promise.all([
        fetchAnalyticsBookings(filters.dateStart, filters.dateEnd),
        fetchHostCostByBooking(filters.dateStart, filters.dateEnd),
        fetchPropertyToAreaMapping(),
      ]);

      // Enrich bookings
      const enrichedBookings: EnrichedBooking[] = bookings.map(b => {
        const hostData = hostCostMap.get(b.unified_booking_id);
        const effectivePropertyName = hostData?.propertyName || b.host_property_name || b.pms_property_name || UNMAPPED_LABEL;
        const area = areaMapping.get(effectivePropertyName) || areaMapping.get(b.pms_property_name || '') || UNMAPPED_LABEL;
        return {
          ...b,
          hostCost: hostData?.totalCost || 0,
          hostCostNights: hostData?.totalNights || 0,
          effectivePropertyName,
          area,
        };
      });

      // Filter by selected property if applicable
      let filtered = enrichedBookings;
      if (filters.selectedIds.length > 0 && filters.pivot === 'property') {
        filtered = enrichedBookings.filter(b =>
          filters.selectedIds.includes(b.effectivePropertyName)
        );
      }

      // Build period → channel → revenue map
      const periodChannelMap = new Map<string, Map<string, number>>();
      const channelTotals = new Map<string, number>();

      for (const b of filtered) {
        const period = getPeriodKey(b.check_in_date, filters.granularity);
        const channel = normalizeChannelName(b.source);
        const revenue = b.total_amount_net ?? 0;

        if (!periodChannelMap.has(period)) {
          periodChannelMap.set(period, new Map());
        }
        const channelMap = periodChannelMap.get(period)!;
        channelMap.set(channel, (channelMap.get(channel) ?? 0) + revenue);

        channelTotals.set(channel, (channelTotals.get(channel) ?? 0) + revenue);
      }

      // Sort channels by total revenue, take top N
      const sortedChannels = Array.from(channelTotals.entries())
        .sort((a, b) => b[1] - a[1]);

      const topChannels = sortedChannels.slice(0, CHANNEL_TIME_SERIES_LIMIT).map(c => c[0]);
      const hasOther = sortedChannels.length > CHANNEL_TIME_SERIES_LIMIT;
      const channels = hasOther ? [...topChannels, 'Khác'] : topChannels;

      // Build pivoted data sorted by period
      const sortedPeriods = Array.from(periodChannelMap.keys()).sort();
      const data = sortedPeriods.map(period => {
        const channelMap = periodChannelMap.get(period)!;
        const row: Record<string, string | number> = {
          period: formatPeriodLabel(getPeriodStart(period, filters.granularity), filters.granularity),
        };

        let otherTotal = 0;
        for (const [ch, rev] of channelMap.entries()) {
          if (topChannels.includes(ch)) {
            row[ch] = rev;
          } else {
            otherTotal += rev;
          }
        }

        // Ensure all channels have a value (0 if missing)
        for (const ch of topChannels) {
          if (!(ch in row)) row[ch] = 0;
        }
        if (hasOther) {
          row['Khác'] = otherTotal;
        }

        return row;
      });

      return { data, channels };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

