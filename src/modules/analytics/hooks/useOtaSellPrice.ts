/**
 * useOtaSellPrice Hook
 * 
 * Fetches OTA sell price data from booking_room_lines_mirror table.
 * This provides EXACT OTA revenue per room line (not booking-level approximation).
 * 
 * SOT: booking_room_lines_mirror.amount = OTA revenue per room line
 * Time Key: check_in_date (demand-based, when booking is consumed)
 * 
 * Data Contract:
 * - OTA Revenue: SUM(booking_room_lines_mirror.amount)
 * - OTA Nights: SUM(booking_room_lines_mirror.nights)
 * - OTA ADR: SUM(amount) / SUM(nights)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import type { Granularity } from '../types';
import {
  MIN_NIGHTS_FOR_ADR,
  calculateSharePct,
  UNMAPPED_LABEL,
} from '../constants';

// ============================================================================
// TYPES
// ============================================================================

export interface OtaSellPriceRow {
  lineId: string;
  pmsBookingId: string;
  unifiedBookingId: string;
  periodKey: string;
  periodLabel: string;
  propertyName: string;
  propertyArea: string;
  channel: string;
  roomType: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  amount: number;
  otaAdr: number | null;
}

export interface OtaSellPriceAggRow {
  groupKey: string;
  groupName: string;
  // Secondary grouping
  propertyName?: string;
  area?: string;
  channel?: string;
  roomType?: string;
  // Metrics
  lineCount: number;
  totalNights: number;
  totalRevenue: number;
  otaAdr: number | null;
  belowSampleThreshold: boolean;
  sharePct: number;
}

export interface OtaSellPriceTimeSeriesRow {
  periodKey: string;
  periodLabel: string;
  totalNights: number;
  totalRevenue: number;
  otaAdr: number | null;
  lineCount: number;
  belowSampleThreshold: boolean;
}

export interface OtaSellPriceKpi {
  totalNights: number;
  totalRevenue: number;
  otaAdr: number | null;
  lineCount: number;
  bookingCount: number;
  propertyCount: number;
  channelCount: number;
  roomTypeCount: number;
  belowSampleThreshold: boolean;
  // Data quality
  zeroAmountLines: number;
  unmappedPropertyCount: number;
}

// ============================================================================
// RAW DATA FETCHING
// ============================================================================

interface RawRoomLineRow {
  id: string;
  pms_booking_id: string;
  line_index: number;
  line_key: string;
  room_type: string | null;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  amount: number | null;
}

interface RawBookingRow {
  pms_booking_id: string;
  unified_booking_id: string;
  ota_source: string;
  pms_property_name: string | null;
  booking_status: string;
  // SOT fields for OTA ADR calculation (from Booking Center)
  total_amount_net: number | null;
  nights: number | null;
}

interface PropertyCatalogRow {
  property_name: string;
  district: string | null;
}

async function fetchRoomLines(
  dateStart: string,
  dateEnd: string
): Promise<RawRoomLineRow[]> {
  console.log(`[fetchRoomLines] Fetching room lines for date range: ${dateStart} to ${dateEnd}`);

  const pageSize = 1000;
  const allLines: RawRoomLineRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('booking_room_lines_mirror')
      .select('id, pms_booking_id, line_index, line_key, room_type, check_in_date, check_out_date, nights, amount')
      .gte('check_in_date', dateStart)
      .lte('check_in_date', dateEnd)
      .order('check_in_date', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[fetchRoomLines] Error:', error);
      throw error;
    }
    if (!page || page.length === 0) break;

    allLines.push(...(page as RawRoomLineRow[]));
    if (page.length < pageSize) break;
  }

  console.log(`[fetchRoomLines] Fetched ${allLines.length} room lines`);
  return allLines;
}

async function fetchBookingMetadata(
  pmsBookingIds: string[]
): Promise<Map<string, RawBookingRow>> {
  if (pmsBookingIds.length === 0) return new Map();

  // Fetch in chunks to avoid URL length limits
  const chunkSize = 500;
  const allBookings: RawBookingRow[] = [];

  for (let i = 0; i < pmsBookingIds.length; i += chunkSize) {
    const chunk = pmsBookingIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('bookings_mirror')
      .select('pms_booking_id, unified_booking_id, ota_source, pms_property_name, booking_status, total_amount_net, nights')
      .in('pms_booking_id', chunk);

    if (error) {
      console.error('[fetchBookingMetadata] Error:', error);
      continue;
    }
    if (data) allBookings.push(...(data as RawBookingRow[]));
  }

  const map = new Map<string, RawBookingRow>();
  allBookings.forEach(b => {
    if (b.pms_booking_id) {
      map.set(b.pms_booking_id, b);
    }
  });

  return map;
}

async function fetchPropertyCatalog(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('property_catalog')
    .select('property_name, district')
    .eq('is_active', true);

  if (error) {
    console.error('[fetchPropertyCatalog] Error:', error);
    return new Map();
  }

  const map = new Map<string, string>();
  data?.forEach(p => {
    if (p.property_name) {
      map.set(p.property_name, p.district || UNMAPPED_LABEL);
    }
  });

  return map;
}

// ============================================================================
// PERIOD HELPERS
// ============================================================================

function getPeriodKey(dateStr: string, granularity: Granularity): string {
  try {
    const date = parseISO(dateStr);
    if (isNaN(date.getTime())) return 'invalid';

    if (granularity === 'quarter') {
      const q = Math.ceil((date.getMonth() + 1) / 3);
      return `${date.getFullYear()}-Q${q}`;
    }
    return format(date, 'yyyy-MM');
  } catch {
    return 'invalid';
  }
}

function getPeriodLabel(periodKey: string, granularity: Granularity): string {
  if (periodKey === 'invalid') return '—';

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

export interface UseOtaSellPriceOptions {
  dateStart: string;
  dateEnd: string;
  granularity: Granularity;
  /** Filter by specific property names */
  selectedPropertyNames?: string[];
  /** Filter by specific channels */
  selectedChannels?: string[];
  /** Filter by specific areas */
  selectedAreas?: string[];
}

/**
 * Fetch raw OTA sell price data at room-line level
 */
export function useOtaSellPrice(options: UseOtaSellPriceOptions) {
  return useQuery({
    queryKey: ['ota-sell-price', options.dateStart, options.dateEnd, options.granularity,
      options.selectedPropertyNames, options.selectedChannels, options.selectedAreas],
    queryFn: async () => {
      // Fetch room lines and metadata in parallel
      const [roomLines, propertyCatalog] = await Promise.all([
        fetchRoomLines(options.dateStart, options.dateEnd),
        fetchPropertyCatalog(),
      ]);

      if (roomLines.length === 0) return [];

      // Get unique pms_booking_ids
      const pmsBookingIds = [...new Set(roomLines.map(l => l.pms_booking_id))];
      const bookingMetadata = await fetchBookingMetadata(pmsBookingIds);

      // Transform to typed rows with enrichment
      const rows: OtaSellPriceRow[] = [];

      for (const line of roomLines) {
        const booking = bookingMetadata.get(line.pms_booking_id);

        // Skip cancelled bookings
        if (booking?.booking_status === 'CANCELLED') continue;

        const propertyName = booking?.pms_property_name || UNMAPPED_LABEL;
        const propertyArea = propertyCatalog.get(propertyName) || UNMAPPED_LABEL;
        const channel = booking?.ota_source || UNMAPPED_LABEL;
        const periodKey = getPeriodKey(line.check_in_date, options.granularity);

        // Apply filters
        if (options.selectedPropertyNames?.length && !options.selectedPropertyNames.includes(propertyName)) continue;
        if (options.selectedChannels?.length && !options.selectedChannels.includes(channel)) continue;
        if (options.selectedAreas?.length && !options.selectedAreas.includes(propertyArea)) continue;

        // Use SOT from bookings_mirror (total_amount_net / nights) for OTA ADR
        // This matches Booking Center's "Doanh thu / đêm" calculation
        const bookingNights = booking?.nights || line.nights || 0;
        const sotOtaAdrPerNight = (booking?.total_amount_net && bookingNights > 0)
          ? booking.total_amount_net / bookingNights
          : null;

        // For room line level amount, use SOT ADR * room line nights
        const lineNights = line.nights || 0;
        const amount = sotOtaAdrPerNight !== null
          ? sotOtaAdrPerNight * lineNights
          : (line.amount || 0);

        rows.push({
          lineId: line.id,
          pmsBookingId: line.pms_booking_id,
          unifiedBookingId: booking?.unified_booking_id || '',
          periodKey,
          periodLabel: getPeriodLabel(periodKey, options.granularity),
          propertyName,
          propertyArea,
          channel,
          roomType: line.room_type || UNMAPPED_LABEL,
          checkInDate: line.check_in_date,
          checkOutDate: line.check_out_date,
          nights: lineNights,
          amount,
          otaAdr: sotOtaAdrPerNight ?? (lineNights > 0 && line.amount ? line.amount / lineNights : null),
        });
      }

      console.log(`[useOtaSellPrice] Processed ${rows.length} room lines`);
      return rows;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

export type OtaSellPriceGroupBy = 'property' | 'area' | 'channel' | 'roomType';

/**
 * Aggregate OTA sell price by specified dimension
 */
export function useOtaSellPriceByGroup(
  options: UseOtaSellPriceOptions,
  groupBy: OtaSellPriceGroupBy
) {
  const { data: rawData, isLoading, error } = useOtaSellPrice(options);

  return useQuery({
    queryKey: ['ota-sell-price-group', options.dateStart, options.dateEnd, options.granularity,
      options.selectedPropertyNames, options.selectedChannels, options.selectedAreas, groupBy],
    queryFn: async () => {
      if (!rawData || rawData.length === 0) return { data: [], kpi: null };

      // Aggregate by group
      const aggregated = new Map<string, {
        groupKey: string;
        groupName: string;
        propertyName?: string;
        area?: string;
        channel?: string;
        roomType?: string;
        lineCount: number;
        totalNights: number;
        totalRevenue: number;
      }>();

      for (const row of rawData) {
        let key: string;
        let name: string;

        switch (groupBy) {
          case 'property':
            key = row.propertyName;
            name = row.propertyName;
            break;
          case 'area':
            key = row.propertyArea;
            name = row.propertyArea;
            break;
          case 'channel':
            key = row.channel;
            name = row.channel;
            break;
          case 'roomType':
            key = row.roomType;
            name = row.roomType;
            break;
        }

        if (!aggregated.has(key)) {
          aggregated.set(key, {
            groupKey: key,
            groupName: name,
            propertyName: groupBy === 'property' ? row.propertyName : undefined,
            area: groupBy === 'area' ? row.propertyArea : undefined,
            channel: groupBy === 'channel' ? row.channel : undefined,
            roomType: groupBy === 'roomType' ? row.roomType : undefined,
            lineCount: 0,
            totalNights: 0,
            totalRevenue: 0,
          });
        }

        const agg = aggregated.get(key)!;
        agg.lineCount += 1;
        agg.totalNights += row.nights;
        agg.totalRevenue += row.amount;
      }

      // Calculate totals for share %
      const grandTotalRevenue = Array.from(aggregated.values())
        .reduce((sum, a) => sum + a.totalRevenue, 0);

      // Build final rows
      const rows: OtaSellPriceAggRow[] = Array.from(aggregated.values())
        .map(agg => {
          const belowThreshold = agg.totalNights < MIN_NIGHTS_FOR_ADR;
          const otaAdr = belowThreshold ? null : agg.totalRevenue / agg.totalNights;

          return {
            groupKey: agg.groupKey,
            groupName: agg.groupName,
            propertyName: agg.propertyName,
            area: agg.area,
            channel: agg.channel,
            roomType: agg.roomType,
            lineCount: agg.lineCount,
            totalNights: agg.totalNights,
            totalRevenue: agg.totalRevenue,
            otaAdr,
            belowSampleThreshold: belowThreshold,
            sharePct: calculateSharePct(agg.totalRevenue, grandTotalRevenue),
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      // Calculate KPI
      const totalNights = rawData.reduce((sum, r) => sum + r.nights, 0);
      const totalRevenue = rawData.reduce((sum, r) => sum + r.amount, 0);
      const belowThreshold = totalNights < MIN_NIGHTS_FOR_ADR;
      const otaAdr = belowThreshold ? null : totalRevenue / totalNights;

      const kpi: OtaSellPriceKpi = {
        totalNights,
        totalRevenue,
        otaAdr,
        lineCount: rawData.length,
        bookingCount: new Set(rawData.map(r => r.pmsBookingId)).size,
        propertyCount: new Set(rawData.map(r => r.propertyName)).size,
        channelCount: new Set(rawData.map(r => r.channel)).size,
        roomTypeCount: new Set(rawData.map(r => r.roomType)).size,
        belowSampleThreshold: belowThreshold,
        zeroAmountLines: rawData.filter(r => r.amount === 0 && r.nights > 0).length,
        unmappedPropertyCount: rawData.filter(r => r.propertyName === UNMAPPED_LABEL).length,
      };

      return { data: rows, kpi };
    },
    enabled: !!rawData && rawData.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * OTA sell price time series
 */
export function useOtaSellPriceTimeSeries(options: UseOtaSellPriceOptions) {
  const { data: rawData, isLoading, error } = useOtaSellPrice(options);

  return useQuery({
    queryKey: ['ota-sell-price-timeseries', options.dateStart, options.dateEnd, options.granularity,
      options.selectedPropertyNames, options.selectedChannels, options.selectedAreas],
    queryFn: async () => {
      if (!rawData || rawData.length === 0) return [];

      // Aggregate by period
      const aggregated = new Map<string, {
        periodKey: string;
        periodLabel: string;
        totalNights: number;
        totalRevenue: number;
        lineCount: number;
      }>();

      for (const row of rawData) {
        if (!aggregated.has(row.periodKey)) {
          aggregated.set(row.periodKey, {
            periodKey: row.periodKey,
            periodLabel: row.periodLabel,
            totalNights: 0,
            totalRevenue: 0,
            lineCount: 0,
          });
        }

        const agg = aggregated.get(row.periodKey)!;
        agg.totalNights += row.nights;
        agg.totalRevenue += row.amount;
        agg.lineCount += 1;
      }

      // Build time series
      const rows: OtaSellPriceTimeSeriesRow[] = Array.from(aggregated.values())
        .map(agg => {
          const belowThreshold = agg.totalNights < MIN_NIGHTS_FOR_ADR;
          const otaAdr = belowThreshold ? null : agg.totalRevenue / agg.totalNights;

          return {
            periodKey: agg.periodKey,
            periodLabel: agg.periodLabel,
            totalNights: agg.totalNights,
            totalRevenue: agg.totalRevenue,
            otaAdr,
            lineCount: agg.lineCount,
            belowSampleThreshold: belowThreshold,
          };
        })
        .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

      return rows;
    },
    enabled: !!rawData && rawData.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}
