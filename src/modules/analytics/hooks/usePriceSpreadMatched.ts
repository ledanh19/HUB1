/**
 * usePriceSpreadMatched Hook
 * 
 * EXACT Price Spread = OTA ADR - Host ADR at room-line level.
 * 
 * Key insight: host_supply_segments.room_line_index links to booking_room_lines_mirror.line_index
 * This allows EXACT 1:1 matching between host cost and OTA revenue for the same room line.
 * 
 * Data Contract:
 * - OTA Revenue: booking_room_lines_mirror.amount (EXACT per room line)
 * - Host Cost: host_supply_segments.total_amount (EXACT per segment)
 * - Match Key: unified_booking_id + room_line_index
 * - Spread = OTA ADR - Host ADR (positive = profit, negative = loss)
 * 
 * Decision Signal:
 * - Spread < 0: DECREASE (selling at loss)
 * - Spread 0-50k: HOLD (tight margin)
 * - Spread > 50k: INCREASE (room for price increase)
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, differenceInDays } from 'date-fns';
import type { Granularity, DateFilterType } from '../types';
import {
  MIN_NIGHTS_FOR_ADR,
  LOW_SAMPLE_THRESHOLD,
  calculateSharePct,
  UNMAPPED_LABEL,
  getDayTypeFromString,
  PRICING_THRESHOLDS,
  type DayType,
  type DayTypeMix,
  getDayTypeMix,
  checkOtaNetSanity,
  logOtaNetSanityWarnings,
  type OtaNetSanityFlags,
} from '../constants';

// ============================================================================
// TYPES
// ============================================================================

export type PriceSignal = 'increase' | 'hold' | 'decrease' | 'review';

export interface MatchedSpreadRow {
  // Identifiers
  matchKey: string;
  unifiedBookingId: string;
  roomLineIndex: number;
  segmentId: string;
  roomLineId: string;
  // Dimensions
  periodKey: string;
  periodLabel: string;
  propertyName: string;
  propertyArea: string;
  channel: string;
  roomType: string;
  // Day type (for pricing decisions)
  dayType: DayType;
  checkInDate: string;
  // OTA side
  otaRevenue: number;
  otaNights: number;
  otaAdr: number | null;
  // Host side
  hostCost: number;
  hostNights: number;
  hostAdr: number | null;
  // Spread & Margin (CANONICAL: margin = (otaAdr - hostAdr) / otaAdr)
  priceSpread: number | null;
  spreadPercent: number | null; // DEPRECATED: use marginPercent
  marginPercent: number | null; // CANONICAL: (otaAdr - hostAdr) / otaAdr * 100
  priceSignal: PriceSignal;
  isSellingAtLoss: boolean;
  // OTA NET sanity flags (dev only)
  sanityFlags?: OtaNetSanityFlags;
}

export interface SpreadAggRow {
  groupKey: string;
  groupName: string;
  // For propertyRoomType grouping, expose both dimensions
  propertyName?: string;
  roomType?: string;
  // Counts
  matchedLineCount: number;
  // OTA totals
  totalOtaRevenue: number;
  totalOtaNights: number;
  otaAdr: number | null;
  // Host totals
  totalHostCost: number;
  totalHostNights: number;
  hostAdr: number | null;
  // Gross Profit
  grossProfit: number;
  // Spread & Margin (CANONICAL: margin = (otaAdr - hostAdr) / otaAdr)
  avgSpread: number | null;
  avgSpreadPercent: number | null; // DEPRECATED: use marginOnRevenue
  // CANONICAL MARGIN FORMULA: (otaAdr - hostAdr) / otaAdr * 100
  marginOnRevenue: number | null;
  // Signal distribution
  increaseCount: number;
  holdCount: number;
  decreaseCount: number;
  lossCount: number;
  reviewCount: number; // NEW: insufficient data for signal
  // Day type distribution (for pricing decisions)
  weekdayNights: number;
  weekendNights: number;
  sundayNights: number;
  dayTypeMix: DayTypeMix; // NEW: WEEKEND/WEEKDAY/MIXED based on 65% threshold
  // Velocity (for signal gating)
  velocity: number; // executed_nights / days_in_range
  baselineVelocity: number | null; // median velocity for same property
  velocityRatio: number | null; // velocity / baselineVelocity
  // Dominant signal (with velocity gating)
  dominantSignal: PriceSignal;
  belowSampleThreshold: boolean;
  sharePct: number;
  // Sanity flag counts (dev only)
  sanityFlagCounts?: {
    missingCommission: number;
    possibleDoubleAccount: number;
    anomalousNetGtGross: number;
  };
}

export interface SpreadKpi {
  matchedLineCount: number;
  unmatchedOtaLineCount: number;
  unmatchedHostSegmentCount: number;
  matchRate: number; // % of OTA lines that matched
  // Totals
  totalOtaRevenue: number;
  totalHostCost: number;
  grossProfit: number;
  totalOtaNights: number;
  totalHostNights: number;
  // ADR
  avgOtaAdr: number | null;
  avgHostAdr: number | null;
  avgSpread: number | null;
  avgSpreadPercent: number | null;
  // Margin % = (OTA ADR - Host ADR) / OTA ADR
  marginOnRevenue: number | null;
  // Signal counts
  increaseCount: number;
  holdCount: number;
  decreaseCount: number;
  lossCount: number;
  belowSampleThreshold: boolean;
  // Distinct counts
  propertyCount: number;
  roomTypeCount: number;
  channelCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Spread thresholds for decision signals (in VND) - LEGACY, kept for compatibility
const SPREAD_THRESHOLD_HOLD = 50000; // Below this = HOLD (tight margin)
const SPREAD_THRESHOLD_INCREASE = 50000; // Above this = INCREASE potential

/**
 * OTA NET Revenue Calculator
 * 
 * SOT Formula:
 * - OTA_COLLECT (payment_type = 'OTA'): amount IS NET (guest paid OTA, OTA deducted commission, sent net)
 * - HOTEL_COLLECT (payment_type = 'HOTEL'): amount IS GROSS (guest paid hotel, need to subtract commission)
 * 
 * @param grossAmount - The room line amount from booking_room_lines_mirror
 * @param booking - The booking metadata including payment_type and commission info
 * @returns NET revenue that the host actually receives
 */
/**
 * OTA NET Revenue Calculator
 * 
 * SOT Formula:
 * - OTA_COLLECT: amount IS NET (guest paid OTA, OTA deducted commission, sent net)
 * - HOTEL_COLLECT: amount IS GROSS (guest paid hotel, need to subtract commission)
 * 
 * CRITICAL: payment_type enum values are 'OTA_COLLECT' and 'HOTEL_COLLECT' (not 'OTA'/'HOTEL')
 * 
 * @param grossAmount - The room line amount from booking_room_lines_mirror
 * @param booking - The booking metadata including payment_type and commission info
 * @returns NET revenue that the host actually receives
 */
function getOtaNetRevenue(
  grossAmount: number | null,
  booking: RawBookingRow | undefined
): number {
  if (grossAmount === null || grossAmount === 0) return 0;
  if (!booking) return grossAmount; // Fallback: assume NET if no booking metadata

  const paymentType = booking.payment_type;

  // OTA_COLLECT: amount is already NET (OTA deducted their commission before paying us)
  if (paymentType === 'OTA_COLLECT') {
    return grossAmount;
  }

  // HOTEL_COLLECT: amount is GROSS (guest paid hotel directly, we owe OTA commission)
  if (paymentType === 'HOTEL_COLLECT') {
    // Use commission_rate to calculate NET
    // CRITICAL: commission_rate is stored as percentage (e.g., 15 for 15%), NOT decimal
    const commissionRate = booking.commission_rate ?? 0;
    const netRevenue = grossAmount * (1 - commissionRate / 100);
    return netRevenue;
  }

  // Unknown payment_type: assume amount is NET (conservative)
  return grossAmount;
}

/**
 * Get pricing signal based on margin percentage AND velocity ratio.
 * 
 * CANONICAL FORMULA: margin_percent = (otaAdr - hostAdr) / otaAdr * 100
 * 
 * Signal logic with velocity gating:
 * - INCREASE: margin ≥ 20% AND velocity_ratio ≥ 1.0
 * - HOLD: margin ≥ 20% AND velocity_ratio < 1.0 (margin good but demand weak)
 * - HOLD: margin 10-20% (tight margin)
 * - DECREASE: margin < 10% AND velocity_ratio < 0.8
 * - REVIEW: insufficient baseline data for velocity comparison
 * - LOSS implicit when margin < 0
 */
function getSignalWithVelocity(
  marginPercent: number | null,
  velocityRatio: number | null
): PriceSignal {
  // If margin not available, return review
  if (marginPercent === null) return 'review';

  // LOSS: Margin < 0% - selling at loss
  if (marginPercent < PRICING_THRESHOLDS.LOSS_THRESHOLD) return 'decrease';

  // BELOW FLOOR: Margin < 12% → Must increase regardless of velocity
  if (marginPercent < PRICING_THRESHOLDS.MIN_MARGIN_FLOOR) {
    return 'increase';
  }

  // Get velocity with default neutral
  const velocity = velocityRatio ?? 1.0;

  // HIGH MARGIN: > 25%
  if (marginPercent > PRICING_THRESHOLDS.DECREASE_THRESHOLD) {
    if (velocity < PRICING_THRESHOLDS.VELOCITY_VERY_LOW) return 'decrease';
    if (velocity >= PRICING_THRESHOLDS.VELOCITY_HIGH) return 'increase';
    return 'hold';
  }

  // ABOVE TARGET: 20-25%
  if (marginPercent > PRICING_THRESHOLDS.TARGET_MARGIN_HIGH) {
    if (velocity < PRICING_THRESHOLDS.VELOCITY_DECREASE_MAX) return 'decrease';
    if (velocity >= PRICING_THRESHOLDS.VELOCITY_INCREASE_MIN) return 'increase';
    return 'hold';
  }

  // OPTIMAL ZONE: 12-20%
  if (velocity >= PRICING_THRESHOLDS.VELOCITY_HIGH) return 'increase';
  if (velocity >= PRICING_THRESHOLDS.VELOCITY_INCREASE_MIN) return 'increase';
  if (velocity < PRICING_THRESHOLDS.VELOCITY_VERY_LOW) return 'decrease';

  return 'hold';
}

// LEGACY function for backward compatibility (used in individual row calculation)
function getSignal(spread: number | null, marginPercent: number | null): PriceSignal {
  // Use margin % for signal (spec: margin = (otaAdr - hostAdr) / otaAdr)
  if (marginPercent !== null) {
    if (marginPercent < PRICING_THRESHOLDS.LOSS_THRESHOLD) return 'decrease';
    if (marginPercent < PRICING_THRESHOLDS.MIN_MARGIN_FLOOR) return 'increase'; // Below 12% = must increase
    if (marginPercent > PRICING_THRESHOLDS.DECREASE_THRESHOLD) return 'hold';   // Above 25% = hold (need velocity)
    if (marginPercent >= PRICING_THRESHOLDS.TARGET_MARGIN_LOW) return 'increase'; // 15%+ = good
    return 'hold';
  }

  // Fallback to absolute spread if margin not available
  if (spread === null) return 'hold';
  if (spread < 0) return 'decrease';
  if (spread > 50000) return 'increase'; // Legacy threshold
  return 'hold';
}

// ============================================================================
// HELPER: UUID CHECK AND EFFECTIVE ROOM TYPE
// ============================================================================

/**
 * Check if string is a UUID (Channex often stores room type as UUID)
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Get effective OTA room type from multiple sources
 * Priority: room_line.room_type > room_line.rate_plan > booking.room_type > host fallback
 * Also filters out UUIDs (Channex artifact)
 */
function getEffectiveOtaRoomType(
  lineRoomType: string | null,
  lineRatePlan: string | null,
  bookingRoomType: string | null,
  hostRoomType: string | null
): string {
  const candidates = [lineRoomType, lineRatePlan, bookingRoomType, hostRoomType];

  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;
    const trimmed = candidate.trim();
    // Skip UUIDs - they're not human-readable room types
    if (isUUID(trimmed)) continue;
    return trimmed;
  }

  return UNMAPPED_LABEL;
}

// ============================================================================
// RAW DATA FETCHING
// ============================================================================

interface RawRoomLineRow {
  id: string;
  pms_booking_id: string;
  line_index: number;
  room_type: string | null;
  rate_plan: string | null;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  amount: number | null;
}

interface RawSegmentRow {
  id: string;
  unified_booking_id: string;
  room_line_index: number | null;
  host_property_name: string | null;
  host_room_type: string | null;
  date_from: string;
  date_to: string;
  nights: number;
  total_amount: number;
}

interface RawBookingRow {
  pms_booking_id: string;
  unified_booking_id: string;
  ota_source: string;
  pms_property_name: string | null;
  booking_status: string;
  // ADDED: OTA NET Revenue calculation fields
  payment_type: string | null; // 'OTA' or 'HOTEL' 
  commission_rate: number | null; // e.g. 0.15 for 15%
  commission_amount: number | null; // Absolute commission amount
  // SOT fields for OTA ADR calculation (from Booking Center)
  total_amount_net: number | null;
  nights: number | null;
  // Booking date for filtering
  created_at: string | null;
  // OTA room type (fallback)
  room_type: string | null;
}

interface PropertyCatalogRow {
  property_name: string;
  district: string | null;
}

async function fetchRoomLinesForMatching(
  dateStart: string,
  dateEnd: string,
  dateFilterType: DateFilterType = 'check_in'
): Promise<RawRoomLineRow[]> {
  console.log(`[fetchRoomLinesForMatching] Fetching room lines: ${dateStart} to ${dateEnd} (filter: ${dateFilterType})`);

  const pageSize = 1000;
  const allLines: RawRoomLineRow[] = [];

  // Determine which date column to filter by
  const dateColumn = dateFilterType === 'check_out' ? 'check_out_date' : 'check_in_date';

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('booking_room_lines_mirror')
      .select('id, pms_booking_id, line_index, room_type, rate_plan, check_in_date, check_out_date, nights, amount')
      .gte(dateColumn, dateStart)
      .lte(dateColumn, dateEnd)
      .order(dateColumn, { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[fetchRoomLinesForMatching] Error:', error);
      throw error;
    }
    if (!page || page.length === 0) break;

    allLines.push(...(page as RawRoomLineRow[]));
    if (page.length < pageSize) break;
  }

  console.log(`[fetchRoomLinesForMatching] Fetched ${allLines.length} room lines`);
  return allLines;
}

async function fetchSegmentsForMatching(
  dateStart: string,
  dateEnd: string,
  dateFilterType: DateFilterType = 'check_in'
): Promise<RawSegmentRow[]> {
  console.log(`[fetchSegmentsForMatching] Fetching EXECUTED segments: ${dateStart} to ${dateEnd} (filter: ${dateFilterType})`);

  const pageSize = 1000;
  const allSegments: RawSegmentRow[] = [];

  // Determine which date column to filter by
  const dateColumn = dateFilterType === 'check_out' ? 'date_to' : 'date_from';

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('host_supply_segments')
      .select('id, unified_booking_id, room_line_index, host_property_name, host_room_type, date_from, date_to, nights, total_amount')
      .gte(dateColumn, dateStart)
      .lte(dateColumn, dateEnd)
      .not('room_line_index', 'is', null)
      // GOLDEN RULE: Only EXECUTED stays (actual_check_in_at IS NOT NULL)
      .not('actual_check_in_at', 'is', null)
      .order(dateColumn, { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[fetchSegmentsForMatching] Error:', error);
      throw error;
    }
    if (!page || page.length === 0) break;

    allSegments.push(...(page as RawSegmentRow[]));
    if (page.length < pageSize) break;
  }

  console.log(`[fetchSegmentsForMatching] Fetched ${allSegments.length} EXECUTED segments with room_line_index`);
  return allSegments;
}

async function fetchBookingMetadata(
  pmsBookingIds: string[]
): Promise<Map<string, RawBookingRow>> {
  if (pmsBookingIds.length === 0) return new Map();

  const chunkSize = 500;
  const allBookings: RawBookingRow[] = [];

  for (let i = 0; i < pmsBookingIds.length; i += chunkSize) {
    const chunk = pmsBookingIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('bookings_mirror')
      .select('pms_booking_id, unified_booking_id, ota_source, pms_property_name, booking_status, payment_type, commission_rate, commission_amount, total_amount_net, nights, created_at, room_type')
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
  // Step 1: Get Host property → district mapping from property_catalog
  const { data: catalogData, error: catalogError } = await supabase
    .from('property_catalog')
    .select('property_name, district')
    .eq('is_active', true);

  if (catalogError) {
    console.error('[fetchPropertyCatalog] Error:', catalogError);
    return new Map();
  }

  // Build Host property name → district (with normalized keys)
  const map = new Map<string, string>();
  catalogData?.forEach(p => {
    if (p.property_name && p.district) {
      map.set(p.property_name, p.district);
      // Add normalized version for fuzzy matching
      map.set(p.property_name.toLowerCase().trim(), p.district);
    }
  });

  console.log(`[fetchPropertyCatalog] Host property → district: ${map.size} entries`);

  // Step 2: Build OTA property → district via unified_booking_id chain
  // Get unified_booking_id → host_property_name from segments
  const { data: segmentData } = await supabase
    .from('host_supply_segments')
    .select('unified_booking_id, host_property_name')
    .not('unified_booking_id', 'is', null)
    .not('host_property_name', 'is', null)
    .limit(10000);

  // Build unified_booking_id → host_property_name
  const bookingToHostProperty = new Map<string, string>();
  segmentData?.forEach(s => {
    if (s.unified_booking_id && s.host_property_name && !bookingToHostProperty.has(s.unified_booking_id)) {
      bookingToHostProperty.set(s.unified_booking_id, s.host_property_name);
    }
  });

  // Get OTA property → unified_booking_id from bookings_mirror
  const { data: bookingData } = await supabase
    .from('bookings_mirror')
    .select('pms_property_name, unified_booking_id')
    .not('unified_booking_id', 'is', null)
    .not('pms_property_name', 'is', null)
    .limit(10000);

  // Chain: OTA property → unified_booking_id → host_property → district
  bookingData?.forEach(b => {
    if (!b.pms_property_name || !b.unified_booking_id) return;

    // Skip if already mapped
    if (map.has(b.pms_property_name)) return;

    // Get host property name via unified_booking_id
    const hostPropName = bookingToHostProperty.get(b.unified_booking_id);
    if (!hostPropName) return;

    // Get district via host property name
    let district = map.get(hostPropName);
    if (!district) {
      district = map.get(hostPropName.toLowerCase().trim());
    }

    if (district) {
      map.set(b.pms_property_name, district);
      map.set(b.pms_property_name.toLowerCase().trim(), district);
    }
  });

  console.log(`[fetchPropertyCatalog] Total property → district: ${map.size} entries`);

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
// FETCH BY BOOKING DATE (created_at)
// ============================================================================

/**
 * Fetch matched data filtered by booking creation date (ngày đặt phòng)
 * 
 * Strategy:
 * 1. Query bookings_mirror by created_at date range
 * 2. Get pms_booking_ids from those bookings
 * 3. Fetch room lines and segments for those bookings
 * 4. Match and return
 */
async function fetchMatchedByBookingDate(
  dateStart: string,
  dateEnd: string,
  granularity: Granularity
): Promise<{ matched: MatchedSpreadRow[]; unmatchedOtaCount: number; unmatchedHostCount: number }> {
  console.log(`[fetchMatchedByBookingDate] Fetching bookings by created_at: ${dateStart} to ${dateEnd}`);

  // Step 1: Fetch bookings by created_at
  const pageSize = 1000;
  const allBookings: RawBookingRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('bookings_mirror')
      .select('pms_booking_id, unified_booking_id, ota_source, pms_property_name, booking_status, payment_type, commission_rate, commission_amount, total_amount_net, nights, created_at, room_type')
      .gte('created_at', `${dateStart}T00:00:00`)
      .lte('created_at', `${dateEnd}T23:59:59`)
      .not('booking_status', 'eq', 'CANCELLED')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[fetchMatchedByBookingDate] Error fetching bookings:', error);
      throw error;
    }
    if (!page || page.length === 0) break;
    allBookings.push(...(page as RawBookingRow[]));
    if (page.length < pageSize) break;
  }

  console.log(`[fetchMatchedByBookingDate] Found ${allBookings.length} bookings in date range`);

  if (allBookings.length === 0) {
    return { matched: [], unmatchedOtaCount: 0, unmatchedHostCount: 0 };
  }

  // Build lookup maps
  const bookingMetadata = new Map<string, RawBookingRow>();
  const pmsBookingIds: string[] = [];
  const unifiedBookingIds: string[] = [];

  allBookings.forEach(b => {
    if (b.pms_booking_id) {
      bookingMetadata.set(b.pms_booking_id, b);
      pmsBookingIds.push(b.pms_booking_id);
    }
    if (b.unified_booking_id) {
      unifiedBookingIds.push(b.unified_booking_id);
    }
  });

  // Step 2: Fetch room lines for these bookings
  const roomLines: RawRoomLineRow[] = [];
  const chunkSize = 500;

  for (let i = 0; i < pmsBookingIds.length; i += chunkSize) {
    const chunk = pmsBookingIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('booking_room_lines_mirror')
      .select('id, pms_booking_id, line_index, room_type, rate_plan, check_in_date, check_out_date, nights, amount')
      .in('pms_booking_id', chunk);

    if (error) {
      console.error('[fetchMatchedByBookingDate] Error fetching room lines:', error);
      continue;
    }
    if (data) roomLines.push(...(data as RawRoomLineRow[]));
  }

  console.log(`[fetchMatchedByBookingDate] Found ${roomLines.length} room lines`);

  // Step 3: Fetch segments for these bookings (only executed stays)
  const segments: RawSegmentRow[] = [];
  const uniqueUnifiedIds = [...new Set(unifiedBookingIds)];

  for (let i = 0; i < uniqueUnifiedIds.length; i += chunkSize) {
    const chunk = uniqueUnifiedIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('host_supply_segments')
      .select('id, unified_booking_id, room_line_index, host_property_name, host_room_type, date_from, date_to, nights, total_amount')
      .in('unified_booking_id', chunk)
      .not('room_line_index', 'is', null)
      .not('actual_check_in_at', 'is', null); // Only EXECUTED stays

    if (error) {
      console.error('[fetchMatchedByBookingDate] Error fetching segments:', error);
      continue;
    }
    if (data) segments.push(...(data as RawSegmentRow[]));
  }

  console.log(`[fetchMatchedByBookingDate] Found ${segments.length} executed segments`);

  if (roomLines.length === 0 || segments.length === 0) {
    return { matched: [], unmatchedOtaCount: roomLines.length, unmatchedHostCount: segments.length };
  }

  // Step 4: Fetch property catalog
  const propertyCatalog = await fetchPropertyCatalog();

  // Step 5: Build room line lookup
  const roomLineMap = new Map<string, RawRoomLineRow & { booking: RawBookingRow | undefined }>();
  for (const line of roomLines) {
    const booking = bookingMetadata.get(line.pms_booking_id);
    if (!booking || booking.booking_status === 'CANCELLED') continue;

    const key = `${booking.unified_booking_id}|||${line.line_index}`;
    roomLineMap.set(key, { ...line, booking });
  }

  // Step 6: Match segments to room lines
  const matched: MatchedSpreadRow[] = [];
  let unmatchedHostCount = 0;

  for (const seg of segments) {
    if (seg.room_line_index === null) {
      unmatchedHostCount++;
      continue;
    }

    const matchKey = `${seg.unified_booking_id}|||${seg.room_line_index}`;
    const roomLineWithBooking = roomLineMap.get(matchKey);

    if (!roomLineWithBooking) {
      unmatchedHostCount++;
      continue;
    }

    const { booking, ...roomLine } = roomLineWithBooking;
    if (!booking) continue;

    // Use check_in_date for period grouping (even when filtering by booking_date)
    const periodKey = getPeriodKey(roomLine.check_in_date, granularity);
    const periodLabel = getPeriodLabel(periodKey, granularity);

    // Calculate OTA NET revenue
    const otaNetRevenue = getOtaNetRevenue(roomLine.amount, booking);
    const otaNights = roomLine.nights;
    const otaAdr = otaNights >= MIN_NIGHTS_FOR_ADR ? otaNetRevenue / otaNights : null;

    // Host side
    const hostCost = seg.total_amount;
    const hostNights = seg.nights;
    const hostAdr = hostNights >= MIN_NIGHTS_FOR_ADR ? hostCost / hostNights : null;

    // Spread & Margin
    const priceSpread = otaAdr !== null && hostAdr !== null ? otaAdr - hostAdr : null;
    const spreadPercent = otaAdr !== null && hostAdr !== null && otaAdr > 0
      ? (priceSpread! / otaAdr) * 100
      : null;
    const marginPercent = spreadPercent; // Canonical: margin = spread / OTA ADR
    const priceSignal = getSignal(priceSpread, marginPercent);

    // Get area from property catalog - prefer OTA property name
    // Store BOTH property names for filter matching
    const hostPropertyName = seg.host_property_name || UNMAPPED_LABEL;
    const pmsPropertyName = booking.pms_property_name || UNMAPPED_LABEL;
    const propertyName = booking.pms_property_name || seg.host_property_name || UNMAPPED_LABEL;
    const propertyArea = propertyCatalog.get(propertyName) || propertyCatalog.get(propertyName.toLowerCase().trim()) || UNMAPPED_LABEL;

    // Day type
    const dayType = getDayTypeFromString(roomLine.check_in_date);

    // OTA NET sanity check
    const sanityFlags = checkOtaNetSanity(
      booking.payment_type,
      roomLine.amount,
      booking.commission_rate,
      booking.commission_amount,
      otaNetRevenue
    );

    matched.push({
      matchKey,
      unifiedBookingId: seg.unified_booking_id,
      roomLineIndex: seg.room_line_index,
      segmentId: seg.id,
      roomLineId: roomLine.id,
      periodKey,
      periodLabel,
      propertyName,
      propertyArea,
      channel: booking.ota_source || UNMAPPED_LABEL,
      // Prefer OTA room type (with UUID filtering), fallback to host
      roomType: getEffectiveOtaRoomType(
        roomLine.room_type,
        roomLine.rate_plan,
        booking.room_type,
        seg.host_room_type
      ),
      dayType,
      checkInDate: roomLine.check_in_date,
      otaRevenue: otaNetRevenue,
      otaNights,
      otaAdr,
      hostCost,
      hostNights,
      hostAdr,
      priceSpread,
      spreadPercent,
      marginPercent,
      priceSignal,
      isSellingAtLoss: priceSpread !== null && priceSpread < 0,
      sanityFlags,
      // Store additional fields for filter matching
      _hostPropertyName: hostPropertyName,
      _pmsPropertyName: pmsPropertyName,
    } as MatchedSpreadRow & { _hostPropertyName: string; _pmsPropertyName: string });
  }

  console.log(`[fetchMatchedByBookingDate] Matched ${matched.length} rows`);

  return {
    matched,
    unmatchedOtaCount: roomLines.length - matched.length,
    unmatchedHostCount,
  };
}

// ============================================================================
// HOOKS
// ============================================================================

export interface UsePriceSpreadMatchedOptions {
  dateStart: string;
  dateEnd: string;
  granularity: Granularity;
  selectedPropertyNames?: string[];
  selectedChannels?: string[];
  selectedAreas?: string[];
  /** Which date field to filter by (default: check_in) */
  dateFilterType?: DateFilterType;
}

/**
 * Fetch EXACT matched price spread data
 * Matches host_supply_segments with booking_room_lines_mirror by room_line_index
 */
export function usePriceSpreadMatched(options: UsePriceSpreadMatchedOptions) {
  const dateFilterType = options.dateFilterType ?? 'check_in';

  return useQuery({
    queryKey: ['price-spread-matched', options.dateStart, options.dateEnd, options.granularity,
      options.selectedPropertyNames, options.selectedChannels, options.selectedAreas, dateFilterType],
    queryFn: async () => {
      // =========================================================================
      // HELPER: Apply filters to matched rows
      // =========================================================================
      type ExtendedMatchedRow = MatchedSpreadRow & { _hostPropertyName: string; _pmsPropertyName: string };

      const applyFilters = (rows: ExtendedMatchedRow[]): MatchedSpreadRow[] => {
        let filteredRows = rows;

        // Apply property filter using BOTH host and PMS property names
        if (options.selectedPropertyNames?.length) {
          filteredRows = filteredRows.filter(row => {
            return options.selectedPropertyNames!.some(filterName => {
              const filterLower = filterName.toLowerCase();
              const hostLower = (row._hostPropertyName || '').toLowerCase();
              const pmsLower = (row._pmsPropertyName || '').toLowerCase();
              const propLower = (row.propertyName || '').toLowerCase();

              return filterName === row._hostPropertyName ||
                filterName === row._pmsPropertyName ||
                filterName === row.propertyName ||
                hostLower.includes(filterLower) ||
                pmsLower.includes(filterLower) ||
                propLower.includes(filterLower) ||
                filterLower.includes(hostLower) ||
                filterLower.includes(pmsLower);
            });
          });
        }

        // Apply channel filter
        if (options.selectedChannels?.length) {
          filteredRows = filteredRows.filter(row => options.selectedChannels!.includes(row.channel));
        }

        // Apply area filter
        if (options.selectedAreas?.length) {
          filteredRows = filteredRows.filter(row => options.selectedAreas!.includes(row.propertyArea));
        }

        // Clean up internal fields for final output
        return filteredRows.map(row => {
          const { _hostPropertyName, _pmsPropertyName, ...cleanRow } = row;
          return cleanRow;
        });
      };

      // =========================================================================
      // PATH 1: booking_date filter - fetch by created_at
      // =========================================================================
      if (dateFilterType === 'booking_date') {
        const result = await fetchMatchedByBookingDate(options.dateStart, options.dateEnd, options.granularity);
        const filtered = applyFilters(result.matched as ExtendedMatchedRow[]);
        console.log(`[usePriceSpreadMatched booking_date] Total: ${result.matched.length}, After Filter: ${filtered.length}`);
        return {
          matched: filtered,
          unmatchedOtaCount: result.unmatchedOtaCount,
          unmatchedHostCount: result.unmatchedHostCount,
          totalMatchedBeforeFilter: result.matched.length,
        };
      }

      // =========================================================================
      // PATH 2: check_in / check_out filter - use original approach
      // =========================================================================
      const [roomLines, segments, propertyCatalog] = await Promise.all([
        fetchRoomLinesForMatching(options.dateStart, options.dateEnd, dateFilterType),
        fetchSegmentsForMatching(options.dateStart, options.dateEnd, dateFilterType),
        fetchPropertyCatalog(),
      ]);

      if (roomLines.length === 0 || segments.length === 0) {
        return { matched: [], unmatchedOtaCount: roomLines.length, unmatchedHostCount: segments.length };
      }

      // Get booking metadata
      const pmsBookingIds = [...new Set(roomLines.map(l => l.pms_booking_id))];
      const bookingMetadata = await fetchBookingMetadata(pmsBookingIds);

      // Build room line lookup: unified_booking_id + line_index -> room line
      const roomLineMap = new Map<string, RawRoomLineRow & { booking: RawBookingRow | undefined }>();
      for (const line of roomLines) {
        const booking = bookingMetadata.get(line.pms_booking_id);
        if (!booking || booking.booking_status === 'CANCELLED') continue;

        const key = `${booking.unified_booking_id}|||${line.line_index}`;
        roomLineMap.set(key, { ...line, booking });
      }

      // =========================================================================
      // STEP 1: MATCH ALL segments to room lines (NO FILTER APPLIED HERE)
      // =========================================================================
      // GOLDEN RULE: Filter is applied AFTER matching, not during!
      // This ensures accurate match rate calculation and prevents filter from
      // excluding valid matches that span multiple property names.

      const allMatched: MatchedSpreadRow[] = [];
      let unmatchedHostCount = 0;

      for (const seg of segments) {
        if (seg.room_line_index === null) {
          unmatchedHostCount++;
          continue;
        }

        const matchKey = `${seg.unified_booking_id}|||${seg.room_line_index}`;
        const roomLineData = roomLineMap.get(matchKey);

        if (!roomLineData) {
          unmatchedHostCount++;
          continue;
        }

        // Mark as matched and remove from map
        roomLineMap.delete(matchKey);

        const booking = roomLineData.booking;
        // Store BOTH property names for filter matching
        const hostPropertyName = seg.host_property_name || UNMAPPED_LABEL;
        const pmsPropertyName = booking?.pms_property_name || UNMAPPED_LABEL;
        // For display/grouping: prefer OTA property name (pms_property_name), fallback to host
        const propertyName = booking?.pms_property_name || seg.host_property_name || UNMAPPED_LABEL;
        // Try multiple matching strategies for area
        const propertyArea = propertyCatalog.get(propertyName)
          || propertyCatalog.get(pmsPropertyName)
          || propertyCatalog.get(propertyName.toLowerCase().trim())
          || propertyCatalog.get(pmsPropertyName.toLowerCase().trim())
          || UNMAPPED_LABEL;
        const channel = booking?.ota_source || UNMAPPED_LABEL;
        // For display/grouping: prefer OTA room type (with UUID filtering), fallback to host
        const roomType = getEffectiveOtaRoomType(
          roomLineData.room_type,
          roomLineData.rate_plan,
          booking?.room_type || null,
          seg.host_room_type
        );

        // Use check_in_date from OTA side for time key consistency (demand-driven)
        const periodKey = getPeriodKey(roomLineData.check_in_date, options.granularity);

        // OTA NET Sanity Checks (dev-only logging)
        const sanityFlags = booking
          ? checkOtaNetSanity(
            booking.payment_type,
            roomLineData.amount,
            booking.commission_rate,
            booking.commission_amount
          )
          : undefined;

        if (sanityFlags && booking) {
          const hasIssue = sanityFlags.missingCommission || sanityFlags.possibleDoubleAccount || sanityFlags.anomalousNetGtGross;
          if (hasIssue) {
            logOtaNetSanityWarnings(booking.pms_booking_id, sanityFlags);
          }
        }

        // Calculate ADRs
        // Use SOT from bookings_mirror (total_amount_net / nights) for OTA ADR
        // This matches Booking Center's "Doanh thu / đêm" calculation
        const bookingNights = booking?.nights || roomLineData.nights || 0;
        const sotOtaAdrPerNight = (booking?.total_amount_net && bookingNights > 0)
          ? booking.total_amount_net / bookingNights
          : null;

        // For room line level OTA revenue, use SOT ADR * room line nights
        // This distributes the SOT evenly across room lines
        const otaNights = roomLineData.nights || 0;
        const otaRevenue = sotOtaAdrPerNight !== null
          ? sotOtaAdrPerNight * otaNights
          : getOtaNetRevenue(roomLineData.amount, booking); // Fallback to old logic

        const hostCost = seg.total_amount || 0;
        const hostNights = seg.nights || 0;

        const otaAdr = otaNights >= MIN_NIGHTS_FOR_ADR && sotOtaAdrPerNight !== null
          ? sotOtaAdrPerNight
          : (otaNights >= MIN_NIGHTS_FOR_ADR ? otaRevenue / otaNights : null);
        const hostAdr = hostNights >= MIN_NIGHTS_FOR_ADR ? hostCost / hostNights : null;

        // Calculate spread and margin
        // CANONICAL FORMULA: margin_percent = (otaAdr - hostAdr) / otaAdr * 100
        let priceSpread: number | null = null;
        let spreadPercent: number | null = null;
        let marginPercent: number | null = null;

        if (otaAdr !== null && hostAdr !== null) {
          priceSpread = otaAdr - hostAdr;
          // spreadPercent = Spread / Host ADR (DEPRECATED - kept for compatibility)
          spreadPercent = hostAdr > 0 ? (priceSpread / hostAdr) * 100 : null;
          // CANONICAL: marginPercent = (otaAdr - hostAdr) / otaAdr * 100
          marginPercent = otaAdr > 0 ? (priceSpread / otaAdr) * 100 : null;
        }

        // Day type classification based on CHECK-IN DATE
        const dayType = getDayTypeFromString(roomLineData.check_in_date);
        const priceSignal = getSignal(priceSpread, marginPercent);
        const isSellingAtLoss = priceSpread !== null && priceSpread < 0;

        allMatched.push({
          matchKey,
          unifiedBookingId: seg.unified_booking_id,
          roomLineIndex: seg.room_line_index,
          segmentId: seg.id,
          roomLineId: roomLineData.id,
          periodKey,
          periodLabel: getPeriodLabel(periodKey, options.granularity),
          propertyName,
          propertyArea,
          channel,
          roomType,
          dayType,
          checkInDate: roomLineData.check_in_date,
          otaRevenue,
          otaNights,
          otaAdr,
          hostCost,
          hostNights,
          hostAdr,
          priceSpread,
          spreadPercent,
          marginPercent,
          priceSignal,
          isSellingAtLoss,
          sanityFlags,
          // Store additional fields for filter matching
          _hostPropertyName: hostPropertyName,
          _pmsPropertyName: pmsPropertyName,
        } as MatchedSpreadRow & { _hostPropertyName: string; _pmsPropertyName: string });
      }

      // =========================================================================
      // STEP 2: APPLY FILTERS on the MATCHED dataset
      // =========================================================================
      const matched = applyFilters(allMatched as ExtendedMatchedRow[]);

      // Remaining unmatched OTA lines (before filter)
      const unmatchedOtaCount = roomLineMap.size;

      console.log(`[usePriceSpreadMatched] Total Matched: ${allMatched.length}, After Filter: ${matched.length}, Unmatched OTA: ${unmatchedOtaCount}, Unmatched Host: ${unmatchedHostCount}`);
      return { matched, unmatchedOtaCount, unmatchedHostCount, totalMatchedBeforeFilter: allMatched.length };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

export type SpreadGroupBy = 'property' | 'area' | 'channel' | 'roomType' | 'propertyRoomType';

/**
 * Aggregate matched spread by specified dimension
 * 
 * Supports:
 * - 'property': Group by property name
 * - 'area': Group by property area/district
 * - 'channel': Group by OTA channel
 * - 'roomType': Group by room type (across all properties)
 * - 'propertyRoomType': Group by property × room type (for Host Cost page)
 */
export function usePriceSpreadByGroup(
  options: UsePriceSpreadMatchedOptions,
  groupBy: SpreadGroupBy
) {
  const { data: rawData, isLoading, error } = usePriceSpreadMatched(options);

  return useQuery({
    queryKey: ['price-spread-group', options.dateStart, options.dateEnd, options.granularity,
      options.selectedPropertyNames, options.selectedChannels, options.selectedAreas,
      options.dateFilterType, groupBy],
    queryFn: async () => {
      if (!rawData?.matched || rawData.matched.length === 0) return { data: [], kpi: null };

      const matched = rawData.matched;

      // Aggregate by group
      const aggregated = new Map<string, {
        groupKey: string;
        groupName: string;
        // For propertyRoomType, store both dimensions
        propertyName?: string;
        roomType?: string;
        matchedLineCount: number;
        totalOtaRevenue: number;
        totalOtaNights: number;
        totalHostCost: number;
        totalHostNights: number;
        spreadSum: number;
        spreadCount: number;
        spreadPercentSum: number;
        increaseCount: number;
        holdCount: number;
        decreaseCount: number;
        lossCount: number;
        reviewCount: number;
        // Day type tracking
        weekdayNights: number;
        weekendNights: number;
        sundayNights: number;
        // Sanity flag tracking
        missingCommissionCount: number;
        possibleDoubleAccountCount: number;
        anomalousNetGtGrossCount: number;
      }>();

      for (const row of matched) {
        let key: string;
        let groupName: string;
        let propertyName: string | undefined;
        let roomType: string | undefined;

        switch (groupBy) {
          case 'property':
            key = row.propertyName;
            groupName = row.propertyName;
            break;
          case 'area':
            key = row.propertyArea;
            groupName = row.propertyArea;
            break;
          case 'channel':
            key = row.channel;
            groupName = row.channel;
            break;
          case 'roomType':
            key = row.roomType;
            groupName = row.roomType;
            break;
          case 'propertyRoomType':
            key = `${row.propertyName}|||${row.roomType}`;
            groupName = `${row.propertyName} - ${row.roomType}`;
            propertyName = row.propertyName;
            roomType = row.roomType;
            break;
          default:
            key = row.propertyName;
            groupName = row.propertyName;
        }

        if (!aggregated.has(key)) {
          aggregated.set(key, {
            groupKey: key,
            groupName,
            propertyName,
            roomType,
            matchedLineCount: 0,
            totalOtaRevenue: 0,
            totalOtaNights: 0,
            totalHostCost: 0,
            totalHostNights: 0,
            spreadSum: 0,
            spreadCount: 0,
            spreadPercentSum: 0,
            increaseCount: 0,
            holdCount: 0,
            decreaseCount: 0,
            lossCount: 0,
            reviewCount: 0,
            // Day type tracking
            weekdayNights: 0,
            weekendNights: 0,
            sundayNights: 0,
            // Sanity flag tracking
            missingCommissionCount: 0,
            possibleDoubleAccountCount: 0,
            anomalousNetGtGrossCount: 0,
          });
        }

        const agg = aggregated.get(key)!;
        agg.matchedLineCount += 1;
        agg.totalOtaRevenue += row.otaRevenue;
        agg.totalOtaNights += row.otaNights;
        agg.totalHostCost += row.hostCost;
        agg.totalHostNights += row.hostNights;

        // Track nights by day type
        switch (row.dayType) {
          case 'WEEKDAY': agg.weekdayNights += row.otaNights; break;
          case 'WEEKEND': agg.weekendNights += row.otaNights; break;
          case 'SUNDAY': agg.sundayNights += row.otaNights; break;
        }

        if (row.priceSpread !== null) {
          agg.spreadSum += row.priceSpread;
          agg.spreadCount += 1;
        }
        if (row.spreadPercent !== null) {
          agg.spreadPercentSum += row.spreadPercent;
        }

        switch (row.priceSignal) {
          case 'increase': agg.increaseCount++; break;
          case 'hold': agg.holdCount++; break;
          case 'decrease': agg.decreaseCount++; break;
          case 'review': agg.reviewCount++; break;
        }
        if (row.isSellingAtLoss) agg.lossCount++;

        // Track sanity flags
        if (row.sanityFlags) {
          if (row.sanityFlags.missingCommission) agg.missingCommissionCount++;
          if (row.sanityFlags.possibleDoubleAccount) agg.possibleDoubleAccountCount++;
          if (row.sanityFlags.anomalousNetGtGross) agg.anomalousNetGtGrossCount++;
        }
      }

      // Calculate days in range for velocity
      const daysInRange = Math.max(1, differenceInDays(
        parseISO(options.dateEnd),
        parseISO(options.dateStart)
      ) + 1);

      // Calculate totals for share %
      const grandTotalRevenue = Array.from(aggregated.values())
        .reduce((sum, a) => sum + a.totalOtaRevenue, 0);

      // Calculate velocities for baseline
      const allVelocities: number[] = [];
      const propertyVelocities = new Map<string, number[]>();

      for (const agg of aggregated.values()) {
        const velocity = agg.totalOtaNights / daysInRange;
        allVelocities.push(velocity);

        // Track velocities by property for baseline calculation
        if (agg.propertyName) {
          if (!propertyVelocities.has(agg.propertyName)) {
            propertyVelocities.set(agg.propertyName, []);
          }
          propertyVelocities.get(agg.propertyName)!.push(velocity);
        }
      }

      // Calculate median velocity for baseline
      const sortedVelocities = [...allVelocities].sort((a, b) => a - b);
      const overallMedianVelocity = sortedVelocities.length > 0
        ? sortedVelocities[Math.floor(sortedVelocities.length / 2)]
        : null;

      // Build final rows with velocity calculation
      const rows: SpreadAggRow[] = Array.from(aggregated.values())
        .map(agg => {
          const otaAdr = agg.totalOtaNights >= MIN_NIGHTS_FOR_ADR
            ? agg.totalOtaRevenue / agg.totalOtaNights : null;
          const hostAdr = agg.totalHostNights >= MIN_NIGHTS_FOR_ADR
            ? agg.totalHostCost / agg.totalHostNights : null;

          // Spread = ADR_OTA - ADR_HOST (canonical formula)
          const avgSpread = (otaAdr !== null && hostAdr !== null)
            ? otaAdr - hostAdr
            : null;

          // Spread percent = Spread / Host ADR (DEPRECATED - kept for compatibility)
          const avgSpreadPercent = (avgSpread !== null && hostAdr !== null && hostAdr > 0)
            ? (avgSpread / hostAdr) * 100
            : null;

          // Gross Profit = OTA Revenue - Host Cost
          const grossProfit = agg.totalOtaRevenue - agg.totalHostCost;

          // CANONICAL MARGIN FORMULA: (otaAdr - hostAdr) / otaAdr * 100
          const marginOnRevenue = (otaAdr !== null && hostAdr !== null && otaAdr > 0)
            ? ((otaAdr - hostAdr) / otaAdr) * 100
            : null;

          // Calculate velocity for this group
          const velocity = agg.totalOtaNights / daysInRange;

          // Get baseline velocity (median of same property, or overall if not available)
          let baselineVelocity: number | null = null;
          if (agg.propertyName && propertyVelocities.has(agg.propertyName)) {
            const propVels = propertyVelocities.get(agg.propertyName)!;
            if (propVels.length >= 3) {
              // Use property-specific median if we have enough data
              const sorted = [...propVels].sort((a, b) => a - b);
              baselineVelocity = sorted[Math.floor(sorted.length / 2)];
            }
          }
          // Fallback to overall median
          if (baselineVelocity === null) {
            baselineVelocity = overallMedianVelocity;
          }

          // Calculate velocity ratio
          const velocityRatio = (baselineVelocity !== null && baselineVelocity > 0)
            ? velocity / baselineVelocity
            : null;

          // Day type mix based on 65% threshold (replaces misleading "dominant")
          const dayTypeMix = getDayTypeMix(agg.weekdayNights, agg.weekendNights, agg.sundayNights);

          // Dominant signal with velocity gating
          const dominantSignal = getSignalWithVelocity(marginOnRevenue, velocityRatio);

          return {
            groupKey: agg.groupKey,
            groupName: agg.groupName,
            propertyName: agg.propertyName,
            roomType: agg.roomType,
            matchedLineCount: agg.matchedLineCount,
            totalOtaRevenue: agg.totalOtaRevenue,
            totalOtaNights: agg.totalOtaNights,
            otaAdr,
            totalHostCost: agg.totalHostCost,
            totalHostNights: agg.totalHostNights,
            hostAdr,
            grossProfit,
            avgSpread,
            avgSpreadPercent,
            marginOnRevenue,
            increaseCount: agg.increaseCount,
            holdCount: agg.holdCount,
            decreaseCount: agg.decreaseCount,
            lossCount: agg.lossCount,
            reviewCount: agg.reviewCount,
            weekdayNights: agg.weekdayNights,
            weekendNights: agg.weekendNights,
            sundayNights: agg.sundayNights,
            dayTypeMix,
            velocity,
            baselineVelocity,
            velocityRatio,
            dominantSignal,
            belowSampleThreshold: agg.totalOtaNights < LOW_SAMPLE_THRESHOLD,
            sharePct: calculateSharePct(agg.totalOtaRevenue, grandTotalRevenue),
            // Dev-only sanity flag counts
            sanityFlagCounts: (agg.missingCommissionCount > 0 || agg.possibleDoubleAccountCount > 0 || agg.anomalousNetGtGrossCount > 0)
              ? {
                missingCommission: agg.missingCommissionCount,
                possibleDoubleAccount: agg.possibleDoubleAccountCount,
                anomalousNetGtGross: agg.anomalousNetGtGrossCount,
              }
              : undefined,
          };
        })
        .sort((a, b) => b.totalOtaRevenue - a.totalOtaRevenue);

      // Calculate KPI - use rawData.matched (the full matched array before filtering in this hook)
      const matchedData: MatchedSpreadRow[] = rawData.matched;
      const totalOtaRevenue = matchedData.reduce<number>((sum, r) => sum + r.otaRevenue, 0);
      const totalHostCost = matchedData.reduce<number>((sum, r) => sum + r.hostCost, 0);
      const grossProfit = totalOtaRevenue - totalHostCost;
      const totalOtaNights = matchedData.reduce<number>((sum, r) => sum + r.otaNights, 0);
      const totalHostNights = matchedData.reduce<number>((sum, r) => sum + r.hostNights, 0);

      const avgOtaAdr = totalOtaNights >= MIN_NIGHTS_FOR_ADR ? totalOtaRevenue / totalOtaNights : null;
      const avgHostAdr = totalHostNights >= MIN_NIGHTS_FOR_ADR ? totalHostCost / totalHostNights : null;

      // BUG 8 FIX: Spread = ADR_OTA - ADR_HOST (canonical formula)
      const avgSpread = (avgOtaAdr !== null && avgHostAdr !== null) ? avgOtaAdr - avgHostAdr : null;
      const avgSpreadPercent = (avgSpread !== null && avgHostAdr && avgHostAdr > 0)
        ? (avgSpread / avgHostAdr) * 100 : null;

      // Margin % on Revenue = (OTA ADR - Host ADR) / OTA ADR
      const marginOnRevenue = (avgOtaAdr !== null && avgHostAdr !== null && avgOtaAdr > 0)
        ? ((avgOtaAdr - avgHostAdr) / avgOtaAdr) * 100
        : null;

      const kpi: SpreadKpi = {
        matchedLineCount: matched.length,
        unmatchedOtaLineCount: rawData.unmatchedOtaCount,
        unmatchedHostSegmentCount: rawData.unmatchedHostCount,
        matchRate: rawData.unmatchedOtaCount + matched.length > 0
          ? (matched.length / (rawData.unmatchedOtaCount + matched.length)) * 100 : 0,
        totalOtaRevenue,
        totalHostCost,
        grossProfit,
        totalOtaNights,
        totalHostNights,
        avgOtaAdr,
        avgHostAdr,
        avgSpread,
        avgSpreadPercent,
        marginOnRevenue,
        increaseCount: matched.filter(r => r.priceSignal === 'increase').length,
        holdCount: matched.filter(r => r.priceSignal === 'hold').length,
        decreaseCount: matched.filter(r => r.priceSignal === 'decrease').length,
        lossCount: matched.filter(r => r.isSellingAtLoss).length,
        belowSampleThreshold: totalOtaNights < LOW_SAMPLE_THRESHOLD,
        propertyCount: new Set(matched.map(r => r.propertyName)).size,
        roomTypeCount: new Set(matched.map(r => r.roomType)).size,
        channelCount: new Set(matched.map(r => r.channel)).size,
      };

      return { data: rows, kpi };
    },
    enabled: !!rawData?.matched && rawData.matched.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}
// ============================================================================
// TIME SERIES HOOK - ADR TREND BY PERIOD
// ============================================================================

export interface SpreadTimeSeriesRow {
  periodKey: string;
  periodLabel: string;
  matchedLineCount: number;
  totalOtaRevenue: number;
  totalOtaNights: number;
  otaAdr: number | null;
  totalHostCost: number;
  totalHostNights: number;
  hostAdr: number | null;
  grossProfit: number;
  avgSpread: number | null;
  marginOnRevenue: number | null;
  belowSampleThreshold: boolean;
}

/**
 * Aggregate matched spread data by time period (month/quarter).
 * Used for ADR trend charts showing OTA ADR vs Host ADR over time.
 */
export function usePriceSpreadTimeSeries(options: UsePriceSpreadMatchedOptions) {
  const { data: rawData, isLoading, error } = usePriceSpreadMatched(options);

  return useQuery({
    queryKey: ['price-spread-timeseries', options.dateStart, options.dateEnd, options.granularity,
      options.selectedPropertyNames, options.selectedChannels, options.selectedAreas],
    queryFn: async () => {
      if (!rawData?.matched || rawData.matched.length === 0) return [];

      const matched = rawData.matched;

      // Aggregate by period
      const aggregated = new Map<string, {
        periodKey: string;
        periodLabel: string;
        matchedLineCount: number;
        totalOtaRevenue: number;
        totalOtaNights: number;
        totalHostCost: number;
        totalHostNights: number;
        spreadSum: number;
        spreadCount: number;
      }>();

      for (const row of matched) {
        if (!aggregated.has(row.periodKey)) {
          aggregated.set(row.periodKey, {
            periodKey: row.periodKey,
            periodLabel: row.periodLabel,
            matchedLineCount: 0,
            totalOtaRevenue: 0,
            totalOtaNights: 0,
            totalHostCost: 0,
            totalHostNights: 0,
            spreadSum: 0,
            spreadCount: 0,
          });
        }

        const agg = aggregated.get(row.periodKey)!;
        agg.matchedLineCount += 1;
        agg.totalOtaRevenue += row.otaRevenue;
        agg.totalOtaNights += row.otaNights;
        agg.totalHostCost += row.hostCost;
        agg.totalHostNights += row.hostNights;

        if (row.priceSpread !== null) {
          agg.spreadSum += row.priceSpread;
          agg.spreadCount += 1;
        }
      }

      // Build time series rows
      const rows: SpreadTimeSeriesRow[] = Array.from(aggregated.values())
        .map(agg => {
          const otaAdr = agg.totalOtaNights >= MIN_NIGHTS_FOR_ADR
            ? agg.totalOtaRevenue / agg.totalOtaNights : null;
          const hostAdr = agg.totalHostNights >= MIN_NIGHTS_FOR_ADR
            ? agg.totalHostCost / agg.totalHostNights : null;
          const avgSpread = agg.spreadCount > 0 ? agg.spreadSum / agg.spreadCount : null;
          const grossProfit = agg.totalOtaRevenue - agg.totalHostCost;
          const marginOnRevenue = (otaAdr !== null && hostAdr !== null && otaAdr > 0)
            ? ((otaAdr - hostAdr) / otaAdr) * 100
            : null;

          return {
            periodKey: agg.periodKey,
            periodLabel: agg.periodLabel,
            matchedLineCount: agg.matchedLineCount,
            totalOtaRevenue: agg.totalOtaRevenue,
            totalOtaNights: agg.totalOtaNights,
            otaAdr,
            totalHostCost: agg.totalHostCost,
            totalHostNights: agg.totalHostNights,
            hostAdr,
            grossProfit,
            avgSpread,
            marginOnRevenue,
            belowSampleThreshold: agg.totalOtaNights < LOW_SAMPLE_THRESHOLD,
          };
        })
        .sort((a, b) => a.periodKey.localeCompare(b.periodKey));

      return rows;
    },
    enabled: !!rawData?.matched && rawData.matched.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}