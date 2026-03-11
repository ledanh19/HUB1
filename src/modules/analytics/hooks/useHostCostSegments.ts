/**
 * useHostCostSegments Hook
 * 
 * Fetches host cost data from host_supply_segments table.
 * This is the TRUE SOURCE OF TRUTH for actual stay economics.
 * 
 * SOT: host_supply_segments (segment-level cost with date ranges)
 * NOT: stays.host_cost (booking-level, cannot be split by room type)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfMonth } from 'date-fns';
import type { Granularity } from '../types';
import {
  MIN_NIGHTS_FOR_ADR,
  LOW_SAMPLE_THRESHOLD,
  calculateSharePct,
  UNMAPPED_LABEL,
} from '../constants';

// ============================================================================
// TYPES
// ============================================================================

export interface HostCostSegmentRow {
  segmentId: string;
  unifiedBookingId: string;
  periodKey: string;
  periodLabel: string;
  propertyName: string;
  roomType: string;
  dateFrom: string;
  dateTo: string;
  stayNights: number;
  nightlyRate: number;
  hostCost: number;
  adrHost: number | null;
  // room_line_index for Price Spread matching
  roomLineIndex: number | null;
}

export interface HostCostRoomTypeRow {
  propertyName: string;
  roomType: string;
  segmentCount: number;
  totalStayNights: number;
  totalHostCost: number;
  adrHost: number | null;
  belowSampleThreshold: boolean;
  hasZeroCost: boolean; // Data quality flag: cost=0 but nights>0
  sharePct: number;
}

export interface HostCostTimeSeriesRow {
  periodKey: string;
  periodLabel: string;
  totalStayNights: number;
  totalHostCost: number;
  adrHost: number | null;
  belowSampleThreshold: boolean;
}

export interface HostCostKpi {
  totalStayNights: number;
  totalHostCost: number;
  adrHost: number | null;
  segmentCount: number;
  propertyCount: number;
  roomTypeCount: number;
  belowSampleThreshold: boolean;
  // Data quality indicators
  zeroCostSegments: number; // Segments with cost=0 but nights>0
  unmappedPropertyCount: number; // Segments with 'Chưa mapping' property
}

// ============================================================================
// RAW DATA FETCHING
// ============================================================================

interface RawSegmentRow {
  id: string;
  unified_booking_id: string;
  host_property_name: string | null;
  host_room_type: string | null;
  date_from: string;
  date_to: string;
  nights: number;
  nightly_rate: number;
  total_amount: number;
  room_line_index: number | null; // For Price Spread matching
}

async function fetchHostCostSegments(
  dateStart: string,
  dateEnd: string
): Promise<RawSegmentRow[]> {
  console.log(`[fetchHostCostSegments] Fetching EXECUTED segments for date range: ${dateStart} to ${dateEnd}`);

  const pageSize = 1000;
  const allSegments: RawSegmentRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('host_supply_segments')
      .select('id, unified_booking_id, host_property_name, host_room_type, date_from, date_to, nights, nightly_rate, total_amount, room_line_index')
      .gte('date_from', dateStart)
      .lte('date_from', dateEnd)
      // GOLDEN RULE: Only EXECUTED stays (actual_check_in_at IS NOT NULL)
      .not('actual_check_in_at', 'is', null)
      .order('date_from', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[fetchHostCostSegments] Error fetching segments:', error);
      throw error;
    }
    if (!page || page.length === 0) break;

    allSegments.push(...(page as RawSegmentRow[]));
    if (page.length < pageSize) break;
  }

  console.log(`[fetchHostCostSegments] Fetched ${allSegments.length} EXECUTED segments`);
  return allSegments;
}

// ============================================================================
// PERIOD HELPERS
// ============================================================================

function getPeriodKey(dateStr: string, granularity: Granularity): string {
  const date = parseISO(dateStr);
  if (granularity === 'quarter') {
    const q = Math.ceil((date.getMonth() + 1) / 3);
    return `${date.getFullYear()}-Q${q}`;
  }
  return format(date, 'yyyy-MM');
}

function getPeriodLabel(periodKey: string, granularity: Granularity): string {
  if (granularity === 'quarter') {
    return periodKey.replace('-', ' ');
  }
  const [year, month] = periodKey.split('-').map(Number);
  if (isNaN(year) || isNaN(month)) return '—';
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' });
}

// ============================================================================
// HOOKS
// ============================================================================

interface UseHostCostSegmentsOptions {
  dateStart: string;
  dateEnd: string;
  granularity: Granularity;
  /** Filter by specific property names (host_property_name) */
  selectedPropertyNames?: string[];
}

export function useHostCostSegments(options: UseHostCostSegmentsOptions) {
  return useQuery({
    queryKey: ['host-cost-segments', options.dateStart, options.dateEnd, options.granularity, options.selectedPropertyNames],
    queryFn: async () => {
      const segments = await fetchHostCostSegments(options.dateStart, options.dateEnd);

      // Filter by selected property names if provided
      let filteredSegments = segments;
      if (options.selectedPropertyNames && options.selectedPropertyNames.length > 0) {
        filteredSegments = segments.filter(seg =>
          options.selectedPropertyNames!.includes(seg.host_property_name || '')
        );
        console.log(`[useHostCostSegments] Filtered to ${filteredSegments.length} segments for ${options.selectedPropertyNames.length} properties`);
      }

      // Transform to typed rows (pure supply-side, no OTA data)
      const rows: HostCostSegmentRow[] = filteredSegments.map(seg => {
        const periodKey = getPeriodKey(seg.date_from, options.granularity);

        return {
          segmentId: seg.id,
          unifiedBookingId: seg.unified_booking_id,
          periodKey,
          periodLabel: getPeriodLabel(periodKey, options.granularity),
          propertyName: seg.host_property_name || UNMAPPED_LABEL,
          roomType: seg.host_room_type || UNMAPPED_LABEL,
          dateFrom: seg.date_from,
          dateTo: seg.date_to,
          stayNights: seg.nights,
          nightlyRate: seg.nightly_rate,
          hostCost: seg.total_amount,
          adrHost: seg.nights > 0 ? seg.total_amount / seg.nights : null,
          roomLineIndex: seg.room_line_index,
        };
      });

      return rows;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

export function useHostCostByRoomType(options: UseHostCostSegmentsOptions) {
  const { data: segments, isLoading, error } = useHostCostSegments(options);

  return useQuery({
    queryKey: ['host-cost-roomtype', options.dateStart, options.dateEnd, options.granularity, options.selectedPropertyNames],
    queryFn: async () => {
      if (!segments || segments.length === 0) return { data: [], kpi: null };

      // Aggregate by property + room type (pure supply-side)
      const aggregated = new Map<string, {
        propertyName: string;
        roomType: string;
        segmentCount: number;
        totalStayNights: number;
        totalHostCost: number;
        hasZeroCost: boolean;
      }>();

      for (const seg of segments) {
        const key = `${seg.propertyName}|||${seg.roomType}`;

        if (!aggregated.has(key)) {
          aggregated.set(key, {
            propertyName: seg.propertyName,
            roomType: seg.roomType,
            segmentCount: 0,
            totalStayNights: 0,
            totalHostCost: 0,
            hasZeroCost: false,
          });
        }

        const agg = aggregated.get(key)!;
        agg.segmentCount += 1;
        agg.totalStayNights += seg.stayNights;
        agg.totalHostCost += seg.hostCost;
        // Track zero-cost data quality issue
        if (seg.hostCost === 0 && seg.stayNights > 0) {
          agg.hasZeroCost = true;
        }
      }

      // Calculate totals for share %
      const grandTotalCost = Array.from(aggregated.values())
        .reduce((sum, a) => sum + a.totalHostCost, 0);

      // Build final rows (pure supply-side, no OTA comparison)
      const rows: HostCostRoomTypeRow[] = Array.from(aggregated.values())
        .map(agg => {
          // Always calculate ADR if nights >= MIN_NIGHTS_FOR_ADR (now = 1)
          const canCalculateAdr = agg.totalStayNights >= MIN_NIGHTS_FOR_ADR;
          const adrHost = canCalculateAdr ? agg.totalHostCost / agg.totalStayNights : null;
          // Show "Low sample" badge if below threshold (5 nights)
          const belowThreshold = agg.totalStayNights < LOW_SAMPLE_THRESHOLD;

          return {
            propertyName: agg.propertyName,
            roomType: agg.roomType,
            segmentCount: agg.segmentCount,
            totalStayNights: agg.totalStayNights,
            totalHostCost: agg.totalHostCost,
            adrHost,
            belowSampleThreshold: belowThreshold,
            hasZeroCost: agg.hasZeroCost,
            sharePct: calculateSharePct(agg.totalHostCost, grandTotalCost),
          };
        })
        .sort((a, b) => b.totalHostCost - a.totalHostCost);

      // Calculate KPI (pure supply-side)
      const totalStayNights = segments.reduce((sum, s) => sum + s.stayNights, 0);
      const totalHostCost = segments.reduce((sum, s) => sum + s.hostCost, 0);
      const belowThreshold = totalStayNights < LOW_SAMPLE_THRESHOLD;

      // For ADR calculation, only use segments with non-zero cost to avoid skewing
      const validCostSegments = segments.filter(s => s.hostCost > 0 && s.stayNights > 0);
      const validNights = validCostSegments.reduce((sum, s) => sum + s.stayNights, 0);
      const validCost = validCostSegments.reduce((sum, s) => sum + s.hostCost, 0);
      // Always calculate ADR if we have valid nights (MIN_NIGHTS_FOR_ADR = 1)
      const adrHost = validNights >= MIN_NIGHTS_FOR_ADR ? validCost / validNights : null;

      // Data quality metrics
      const zeroCostSegments = segments.filter(s => s.hostCost === 0 && s.stayNights > 0).length;
      const unmappedPropertyCount = segments.filter(s => s.propertyName === UNMAPPED_LABEL).length;

      const kpi: HostCostKpi = {
        totalStayNights,
        totalHostCost,
        adrHost,
        segmentCount: segments.length,
        propertyCount: new Set(segments.map(s => s.propertyName)).size,
        roomTypeCount: new Set(segments.map(s => `${s.propertyName}|||${s.roomType}`)).size,
        belowSampleThreshold: belowThreshold,
        zeroCostSegments,
        unmappedPropertyCount,
      };

      return { data: rows, kpi };
    },
    enabled: !!segments && segments.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

export function useHostCostTimeSeries(options: UseHostCostSegmentsOptions) {
  const { data: segments, isLoading, error } = useHostCostSegments(options);

  return useQuery({
    queryKey: ['host-cost-timeseries', options.dateStart, options.dateEnd, options.granularity, options.selectedPropertyNames],
    queryFn: async () => {
      if (!segments || segments.length === 0) return [];

      // Aggregate by period (pure supply-side)
      const aggregated = new Map<string, {
        periodKey: string;
        periodLabel: string;
        totalStayNights: number;
        totalHostCost: number;
      }>();

      for (const seg of segments) {
        if (!aggregated.has(seg.periodKey)) {
          aggregated.set(seg.periodKey, {
            periodKey: seg.periodKey,
            periodLabel: seg.periodLabel,
            totalStayNights: 0,
            totalHostCost: 0,
          });
        }

        const agg = aggregated.get(seg.periodKey)!;
        agg.totalStayNights += seg.stayNights;
        agg.totalHostCost += seg.hostCost;
      }

      // Build time series (pure supply-side)
      const rows: HostCostTimeSeriesRow[] = Array.from(aggregated.values())
        .map(agg => {
          // Always calculate ADR (MIN_NIGHTS_FOR_ADR = 1)
          const canCalculateAdr = agg.totalStayNights >= MIN_NIGHTS_FOR_ADR;
          const adrHost = canCalculateAdr ? agg.totalHostCost / agg.totalStayNights : null;
          // Show "Low sample" badge if below threshold (5 nights)
          const belowThreshold = agg.totalStayNights < LOW_SAMPLE_THRESHOLD;

          return {
            periodKey: agg.periodKey,
            periodLabel: agg.periodLabel,
            totalStayNights: agg.totalStayNights,
            totalHostCost: agg.totalHostCost,
            adrHost,
            belowSampleThreshold: belowThreshold,
          };
        })
        .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

      return rows;
    },
    enabled: !!segments && segments.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}
