/**
 * usePriceSpreadForecast Hook
 * 
 * Provides ESTIMATED future pricing analytics based on:
 * 1. Future bookings demand pipeline (booking_room_lines_mirror with future check_in_date)
 * 2. Historical host ADR reference (executed stays, median by property/roomType/month)
 * 3. OTA ADR reference from recent bookings (created last 30 days)
 * 4. Fulfillment rate from historical data
 * 
 * ============================================================================
 * SOURCE OF TRUTH (SOT) DEFINITIONS
 * ============================================================================
 * 
 * OTA ADR SOT:
 *   Table: bookings_mirror
 *   Formula: total_amount_net / nights
 *   Note: total_amount_net already accounts for commission (OTA_COLLECT & HOTEL_COLLECT)
 *   Matches: Booking Center "Doanh thu / Ã„â€˜ÃƒÂªm"
 * 
 * Host ADR SOT:
 *   Table: host_supply_segments
 *   Formula: total_amount / nights (per segment)
 *   Link: unified_booking_id (same in both bookings_mirror and host_supply_segments)
 * 
 * Executed Segment Criteria:
 *   - actual_check_in_at IS NOT NULL (guest checked in)
 *   - unified_booking_id IS NOT NULL (linked to OTA booking)
 * 
 * Linked Segment Criteria (fallback when executed < 10):
 *   - unified_booking_id IS NOT NULL (linked to OTA booking)
 *   - Includes pending segments not yet checked-in
 * 
 * FALLBACK LADDER for Host ADR (priority order):
 *   1. EXACT:      OTA property + room type + day type (most accurate)
 *   2. EXACT:      OTA property + room type (without day type)
 *   3. PROP_BED:   OTA property + bedroom count (if room type doesn't match exactly)
 *   4. PROP_ALL:   OTA property only (warning - mixes all room types)
 *   5. none:       No Host ADR reference available
 * 
 * UPGRADE FILTER:
 *   Segments where Host bedroom count Ã¢â€°Â  OTA bedroom count are EXCLUDED
 *   Example: OTA 1BR Ã¢â€ â€™ Host 2BR = upgrade, excluded from ADR calculation
 * 
 * ============================================================================
 * BUSINESS RULES
 * ============================================================================
 * 
 * Margin Calculation: margin_percent = (OTA_ADR - Host_ADR) / OTA_ADR * 100
 * 
 * Margin Thresholds:
 *   - < 0%   : NEGATIVE_MARGIN (selling at loss - urgent review)
 *   - < 15%  : BELOW_MIN_MARGIN (must increase price or review host cost)
 *   - 15-20% : MID_MARGIN (safe zone - hold or slight increase)
 *   - Ã¢â€°Â¥ 20%  : HIGH_MARGIN (optimize zone - increase if velocity good)
 * 
 * ============================================================================
 * NON-NEGOTIABLE
 * ============================================================================
 * - This is ESTIMATION only, clearly labeled "EST"
 * - Never mixed with executed SOT analytics
 * - Returns REVIEW when insufficient data
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, subMonths, subDays, differenceInDays, startOfMonth, endOfMonth, startOfWeek, getWeek, getYear } from 'date-fns';
import {
  FORECAST_CONFIG,
  PRICING_THRESHOLDS,
  MIN_NIGHTS_FOR_ADR,
  UNMAPPED_LABEL,
  getDayTypeMix,
  getForecastConfidence,
  getSuggestedAdjustment,
  clampVelocityRatio,
  calculateComprehensiveAdjustment,
  getLeadTimeScore,
  getChannelDemandFactor,
  getSeasonalityFactor,
  calculateSmartPricingRecommendation,
  type DayTypeMix,
  type ForecastConfidence,
  type SignalReason,
  type ComprehensiveScoreOutput,
  type SmartPricingRecommendation,
  type SmartPricingInput,
  type HostCostReason,
} from '../constants';
import type { PriceSignal } from './usePriceSpreadMatched';

// ============================================================================
// DEBUG FLAG - Set to true to see detailed Host ADR calculation logs
// ============================================================================
const DEBUG_ENABLED = import.meta.env.DEV; // Auto-enable in dev mode
const debugLog = (...args: unknown[]) => DEBUG_ENABLED && console.log(...args);

// ============================================================================
// TYPES
// ============================================================================

/**
 * Host Segment Metrics - Raw historical data from host_supply_segments
 * Grouped by dayType (weekday/weekend) for accurate pricing recommendations
 */
export interface HostSegmentMetrics {
  // Overall metrics (all dayTypes combined)
  minAdr: number;           // Minimum ADR ever charged
  maxAdr: number;           // Maximum ADR ever charged
  medianAdr: number;        // Median (used for prediction)
  avgAdr: number;           // Average for reference
  totalNights: number;      // Total booked nights in history
  totalBookings: number;    // Total booking count

  // Weekday metrics
  weekday: {
    minAdr: number | null;
    maxAdr: number | null;
    medianAdr: number | null;
    avgAdr: number | null;
    totalNights: number;
    totalBookings: number;
  };

  // Weekend metrics  
  weekend: {
    minAdr: number | null;
    maxAdr: number | null;
    medianAdr: number | null;
    avgAdr: number | null;
    totalNights: number;
    totalBookings: number;
  };

  // Season-specific metrics (for current target season)
  bySeason: {
    HIGH: { minAdr: number | null; maxAdr: number | null; avgAdr: number | null; totalNights: number };
    LOW: { minAdr: number | null; maxAdr: number | null; avgAdr: number | null; totalNights: number };
    SHOULDER: { minAdr: number | null; maxAdr: number | null; avgAdr: number | null; totalNights: number };
  };

  // Recent trend (last 30 days vs previous 30 days)
  recentTrend: number;      // +0.1 = 10% increase, -0.05 = 5% decrease
  recentTrendDirection: 'UP' | 'DOWN' | 'STABLE';

  // Peak month data (for capacity comparison)
  peakMonth: number;        // Month with highest bookings (1-12)
  peakMonthNights: number;  // Nights in peak month
  peakMonthBookings: number; // Bookings in peak month
}

/**
 * OTA Booking Timing Metrics - Lead time distribution
 * Used to understand if guests book early (early bird) or late (last minute)
 */
export interface OtaBookingTimingMetrics {
  // Lead time distribution (% of bookings)
  lastMinuteShare: number;  // 0-3 days lead time (%)
  shortTermShare: number;   // 4-14 days lead time (%)
  midTermShare: number;     // 15-30 days lead time (%)
  earlyBirdShare: number;   // 31+ days lead time (%)

  // Average lead time in days
  avgLeadTimeDays: number;
  medianLeadTimeDays: number;

  // Trend: Are guests booking earlier or later than before?
  leadTimeTrend: number;    // Positive = booking earlier, negative = later
  leadTimeTrendDirection: 'EARLIER' | 'LATER' | 'STABLE';

  // Sample size
  sampleSize: number;

  // By dayType
  weekday: {
    avgLeadTimeDays: number | null;
    lastMinuteShare: number | null;
    earlyBirdShare: number | null;
    sampleSize: number;
  };
  weekend: {
    avgLeadTimeDays: number | null;
    lastMinuteShare: number | null;
    earlyBirdShare: number | null;
    sampleSize: number;
  };
}

export interface ForecastRow {
  // Group identifiers
  groupKey: string;
  groupName: string;
  propertyId: string;      // OTA property ID for filtering
  propertyName: string;
  roomType: string;
  periodKey: string;
  periodLabel: string;
  dayTypeMix: DayTypeMix;

  // Future demand pipeline
  bookedNightsFuture: number;
  bookingCount: number;
  fulfillmentRate: number;
  expectedExecutedNights: number;

  // OTA reference (from recent bookings)
  otaAdrRef: number | null;
  otaAdrRefSample: number;
  otaAdrRefVariance: number | null;

  // Host ADR reference (from executed history)
  hostAdrRef: number | null;           // Raw historical median
  hostAdrRefAdjusted: number | null;   // Adjusted for seasonality + trend
  hostAdrRefSample: number;
  hostAdrRefVariance: number | null;
  // Source levels: EXACT (best) Ã¢â€ â€™ PROP_BED Ã¢â€ â€™ PROP_ALL Ã¢â€ â€™ AREA_BED Ã¢â€ â€™ GLOBAL_BED Ã¢â€ â€™ none (no data)
  hostAdrRefSource: 'EXACT' | 'PROP_BED' | 'PROP_ALL' | 'AREA_BED' | 'GLOBAL_BED' | 'none';

  // Host ADR Trend & Seasonality (NEW)
  hostAdrTrend: number | null;         // Combined trend (host + OTA weighted)
  hostAdrTrendSource: 'prop+room' | 'property' | 'market' | 'none'; // Where trend data came from
  hostAdrHostTrend: number | null;     // Host-only trend for debugging
  hostAdrOtaTrend: number | null;      // OTA-only trend for debugging
  hostAdrOtaDemandIndex: number | null; // OTA demand for this month (1.0 = avg)
  hostAdrSeasonalFactor: number | null; // Multiplier for target month vs annual average
  hostAdrVolatility: number | null;    // Coefficient of variation (risk indicator)

  // AI Pricing Confidence-based Prediction (NEW)
  hostAdrPredictedLow: number | null;   // Pessimistic estimate (for risk planning)
  hostAdrPredictedHigh: number | null;  // Optimistic estimate
  hostAdrConfidence: 'high' | 'medium' | 'low' | null;  // Data quality indicator
  hostAdrAppliedTrendCap: number | null; // Actual cap used (varies by confidence)

  // ============================================================
  // HOST SEGMENT METRICS (NEW) - Raw min/max/volume from history
  // ============================================================
  hostSegmentMetrics: HostSegmentMetrics | null;  // Detailed metrics by dayType

  // ============================================================
  // OTA BOOKING TIMING METRICS (NEW) - LastMinute vs EarlyBird
  // ============================================================
  otaBookingTiming: OtaBookingTimingMetrics | null;  // Lead time distribution

  // Expected spread & margin
  expectedSpread: number | null;
  expectedMarginPercent: number | null;

  // Velocity (clamped ratio)
  futureVelocity: number | null;  // bookings added recently for this check-in month
  baselineVelocity: number | null;
  baselineSampleSize: number;      // Sample size for baseline velocity
  futureVelocityRatio: number | null;  // Raw ratio before clamp
  futureVelocityRatioClamped: number | null;  // Clamped ratio for display

  // Volume Score (NEW)
  volumeScore: number | null;      // actual booked nights / baseline

  // Capacity Score (NEW) - comparison with historical peak
  capacityScore: number | null;    // current bookings / historical peak
  historicalPeak: number | null;   // peak booked nights for this property/room

  // Area Score (NEW) - comparison with district average
  areaScore: number | null;        // property velocity / district average velocity
  district: string | null;         // district name for display

  // Signal & suggestion
  signal: PriceSignal;
  signalReason: SignalReason;      // WHY this signal was assigned
  suggestedAdjustment: number | null;
  confidence: ForecastConfidence;

  // Comprehensive scoring (NEW)
  comprehensiveScore: ComprehensiveScoreOutput | null;

  // ============================================================
  // SMART PRICING RECOMMENDATION (NEW)
  // ============================================================
  // AI-powered recommendation based on Host min/max + demand signals
  smartPricing: SmartPricingRecommendation | null;

  // Metadata
  leadTimeDays: number | null;
  topChannel: string | null;
  topChannelShare: number | null;
  topChannelCommission: number | null;  // Commission rate from top channel (NEW)

  // Flags
  isEstimated: true;  // Always true for forecast
}

/** Filter options extracted from data */
export interface ForecastFilterOptions {
  propertyIds: Array<{ id: string; name: string }>;  // {id, name} pairs
  propertyNames: string[];
  roomTypes: string[];
  channels: string[];
  months: string[];
}

export interface ForecastKpi {
  totalBookedNights: number;
  totalExpectedExecutedNights: number;
  avgOtaAdrRef: number | null;
  avgHostAdrRef: number | null;
  avgExpectedSpread: number | null;
  avgExpectedMarginPercent: number | null;
  avgFulfillmentRate: number;

  // Signal distribution
  increaseCount: number;
  holdCount: number;
  decreaseCount: number;
  reviewCount: number;

  // Confidence distribution
  highConfidenceCount: number;
  medConfidenceCount: number;
  lowConfidenceCount: number;

  propertyCount: number;
  roomTypeCount: number;
}

interface RawFutureBookingRow {
  id: string;
  pms_booking_id: string;
  line_index: number;
  room_type: string | null;
  rate_plan: string | null;
  check_in_date: string;
  check_out_date: string | null;
  nights: number | null;
  amount: number | null;
  created_at: string | null;
}

/**
 * Check if string looks like a UUID (Channex room type ID)
 */
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Get period key and label based on granularity
 * 
 * For 'month': periodKey = "2026-04", periodLabel = "ThÃƒÂ¡ng 4, 2026"
 * For 'week':  periodKey = "2026-W14", periodLabel = "TuÃ¡ÂºÂ§n 14 (31/3-6/4)"
 * For 'day':   periodKey = "2026-04-15", periodLabel = "15/4 (T3)" with day of week
 */
function getPeriodKeyAndLabel(
  checkInDate: string,
  granularity: 'month' | 'week' | 'day'
): { periodKey: string; periodLabel: string } {
  const date = parseISO(checkInDate);

  if (granularity === 'day') {
    // Day format: "2026-04-15" with Vietnamese day of week
    const dayOfWeek = date.getDay();
    const vnDayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const periodKey = checkInDate; // YYYY-MM-DD
    const periodLabel = `${format(date, 'd/M')} (${vnDayNames[dayOfWeek]})`;

    return { periodKey, periodLabel };
  }

  if (granularity === 'week') {
    const weekNum = getWeek(date, { weekStartsOn: 1 }); // Monday start
    const year = getYear(date);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const periodKey = `${year}-W${weekNum.toString().padStart(2, '0')}`;
    const periodLabel = `TuÃ¡ÂºÂ§n ${weekNum} (${format(weekStart, 'd/M')}-${format(weekEnd, 'd/M')})`;

    return { periodKey, periodLabel };
  }

  // Default: month
  const month = checkInDate.substring(0, 7); // YYYY-MM
  return {
    periodKey: month,
    periodLabel: `ThÃƒÂ¡ng ${parseInt(month.substring(5, 7), 10)}, ${month.substring(0, 4)}`,
  };
}

/**
 * Helper: Get effective room type from OTA data
 * Priority: booking_room_lines.room_type > booking_room_lines.rate_plan > bookings_mirror.room_type > fallback
 * Also resolves UUID to human-readable name if roomTypeMap is provided
 */
function getEffectiveRoomType(
  lineRoomType: string | null,
  lineRatePlan: string | null,
  bookingRoomType?: string | null,
  roomTypeMap?: Map<string, string>
): string {
  // Try each source in priority order
  const candidates = [lineRoomType, lineRatePlan, bookingRoomType];

  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) continue;

    const trimmed = candidate.trim();

    // If it's a UUID and we have a map, try to resolve it
    if (isUUID(trimmed) && roomTypeMap) {
      const resolved = roomTypeMap.get(trimmed);
      if (resolved) return resolved;
    }

    // If it's not a UUID, return as-is
    if (!isUUID(trimmed)) {
      return trimmed;
    }
  }

  return 'ChÃ†Â°a cÃƒÂ³ loÃ¡ÂºÂ¡i phÃƒÂ²ng';
}

interface RawBookingMetaRow {
  pms_booking_id: string;
  unified_booking_id: string | null;
  ota_source: string | null;
  pms_property_id: string | null;  // Property ID for filtering
  pms_property_name: string | null;
  room_type: string | null; // From bookings_mirror - lookup from room_types_mirror
  booking_status: string | null;
  payment_type: string | null;
  commission_rate: number | null;
  // SOT fields for OTA ADR calculation (from Booking Center)
  total_amount_net: number | null;
  nights: number | null;
  rooms_count: number | null; // Number of rooms in booking (for multi-room ADR calculation)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get OTA NET revenue based on payment type
 * 
 * - OTA_COLLECT: booking_room_lines_mirror.amount is already NET (OTA remits after deducting commission)
 * - HOTEL_COLLECT: amount is GROSS (guest pays full), we subtract commission to get NET
 */
function getOtaNetRevenue(
  grossAmount: number | null,
  paymentType: string | null,
  commissionRate: number | null
): number {
  if (grossAmount === null || grossAmount === 0) return 0;

  // OTA_COLLECT: amount is already NET (OTA remits after commission)
  if (paymentType === 'OTA_COLLECT') return grossAmount;

  // HOTEL_COLLECT: subtract commission from gross
  if (paymentType === 'HOTEL_COLLECT') {
    const rate = commissionRate ?? 0;
    return grossAmount * (1 - rate / 100);
  }

  // Unknown: assume NET (conservative)
  return grossAmount;
}

/**
 * Calculate median of array
 */
function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate variance (coefficient of variation)
 */
function calculateVariance(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  if (mean === 0) return null;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance) / mean; // Coefficient of variation
}

/**
 * Winsorize array (trim outliers)
 */
function winsorize(arr: number[], percentile: number = 10): number[] {
  if (arr.length < 5) return arr;
  const sorted = [...arr].sort((a, b) => a - b);
  const lowIdx = Math.floor(arr.length * percentile / 100);
  const highIdx = Math.ceil(arr.length * (100 - percentile) / 100) - 1;
  const lowVal = sorted[lowIdx];
  const highVal = sorted[highIdx];
  return arr.map(v => Math.max(lowVal, Math.min(highVal, v)));
}

/**
 * Get day type from check-in date
 */
function getDayType(checkInDate: string): 'weekday' | 'weekend' | 'sunday' {
  const date = parseISO(checkInDate);
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return 'sunday';
  if (dayOfWeek === 5 || dayOfWeek === 6) return 'weekend';
  return 'weekday';
}

/**
 * SEASON CLASSIFICATION for Vietnam hospitality market
 * 
 * HIGH SEASON (cao Ã„â€˜iÃ¡Â»Æ’m): December, January, February (TÃ¡ÂºÂ¿t + du lÃ¡Â»â€¹ch nghÃ¡Â»â€° Ã„â€˜ÃƒÂ´ng)
 * SHOULDER SEASON: March, April, November (chuyÃ¡Â»Æ’n mÃƒÂ¹a)
 * LOW SEASON (thÃ¡ÂºÂ¥p Ã„â€˜iÃ¡Â»Æ’m): May - October (mÃƒÂ¹a mÃ†Â°a + hÃƒÂ¨)
 * 
 * @param month 1-12
 * @returns 'HIGH' | 'SHOULDER' | 'LOW'
 */
type SeasonType = 'HIGH' | 'SHOULDER' | 'LOW';

function getSeasonType(month: number): SeasonType {
  // HIGH: Dec (12), Jan (1), Feb (2)
  if ([12, 1, 2].includes(month)) return 'HIGH';
  // SHOULDER: Mar (3), Apr (4), Nov (11)
  if ([3, 4, 11].includes(month)) return 'SHOULDER';
  // LOW: May-Oct (5-10)
  return 'LOW';
}

/**
 * Get months that belong to the same season group
 * For better sample size, we group months into similar seasons
 */
function getSameSeasonMonths(month: number): number[] {
  const season = getSeasonType(month);
  switch (season) {
    case 'HIGH':
      return [12, 1, 2];
    case 'SHOULDER':
      return [3, 4, 11];
    case 'LOW':
      return [5, 6, 7, 8, 9, 10];
  }
}

/**
 * Get forecast signal based on expected margin, velocity ratio, and volume score
 * Returns both signal and reason for transparency
 * 
 * BUSINESS RULES (Updated 2026-01-29):
 * - MIN_MARGIN_FLOOR = 12% Ã¢â€ â€™ DÃ†Â°Ã¡Â»â€ºi mÃ¡Â»Â©c nÃƒÂ y PHÃ¡ÂºÂ¢I TÃ„â€šNG
 * - TARGET_RANGE = 12-20% Ã¢â€ â€™ VÃƒÂ¹ng tÃ¡Â»â€˜i Ã†Â°u
 * - KÃ¡ÂºÂ¿t hÃ¡Â»Â£p Velocity (tÃ¡Â»â€˜c Ã„â€˜Ã¡Â»â„¢ Ã„â€˜Ã¡ÂºÂ·t) + Volume (sÃ¡Â»â€˜ lÃ†Â°Ã¡Â»Â£ng Ã„â€˜Ã¡ÂºÂ·t) Ã„â€˜Ã¡Â»Æ’ Ã„â€˜ÃƒÂ¡nh giÃƒÂ¡ demand
 * 
 * MA TRÃ¡ÂºÂ¬N DEMAND:
 * | Velocity | Volume  | Demand      | Action                    |
 * |----------|---------|-------------|---------------------------|
 * | High     | High    | RÃ¡ÂºÂ¥t cao     | TÃ„Æ’ng (nÃ¡ÂºÂ¿u margin OK)      |
 * | High     | Low     | Ã„Âang tÃ„Æ’ng   | GiÃ¡Â»Â¯/TÃ„Æ’ng nhÃ¡ÂºÂ¹              |
 * | Low      | High    | Ã„Âang giÃ¡ÂºÂ£m   | GiÃ¡Â»Â¯ (Ã„â€˜ÃƒÂ£ cÃƒÂ³ nhiÃ¡Â»Âu Ã„â€˜Ã¡ÂºÂ·t)     |
 * | Low      | Low     | ThÃ¡ÂºÂ¥p        | GiÃ¡ÂºÂ£m (nÃ¡ÂºÂ¿u margin > target)|
 */
function getForecastSignalWithReason(
  expectedMarginPercent: number | null,
  futureVelocityRatioClamped: number | null,
  confidence: ForecastConfidence,
  hostAdrRef: number | null,
  volumeScore: number | null = null  // NEW: Volume Score
): { signal: PriceSignal; reason: SignalReason } {
  // REVIEW: Missing Host ADR data - cannot calculate margin
  if (hostAdrRef === null) {
    return { signal: 'review', reason: 'MISSING_HOST_ADR' };
  }

  // REVIEW: No margin data - cannot make pricing decision
  if (expectedMarginPercent === null) {
    return { signal: 'review', reason: 'LOW_CONFIDENCE' };
  }

  // ========================================
  // NEGATIVE MARGIN Ã¢â€ â€™ Ã„Âang bÃƒÂ¡n lÃ¡Â»â€” Ã¢â€ â€™ MUST INCREASE
  // ========================================
  if (expectedMarginPercent < PRICING_THRESHOLDS.LOSS_THRESHOLD) {
    return { signal: 'increase', reason: 'NEGATIVE_MARGIN' };
  }

  // ========================================
  // BELOW MIN FLOOR (< 12%) Ã¢â€ â€™ INCREASE
  // ========================================
  if (expectedMarginPercent < PRICING_THRESHOLDS.MIN_MARGIN_FLOOR) {
    return { signal: 'increase', reason: 'BELOW_MIN_MARGIN' };
  }

  // Use velocity and volume for decisions, default to 1.0 (neutral) if null
  const velocity = futureVelocityRatioClamped ?? 1.0;
  const volume = volumeScore ?? 1.0;

  // Combined demand score (velocity weight 0.6, volume weight 0.4)
  const demandScore = velocity * 0.6 + volume * 0.4;

  // ========================================
  // HIGH MARGIN (> 25%)
  // ========================================
  if (expectedMarginPercent > PRICING_THRESHOLDS.DECREASE_THRESHOLD) {
    if (demandScore < 0.6) {
      return { signal: 'decrease', reason: 'HIGH_MARGIN_LOW_VELOCITY' };
    }
    if (demandScore >= 1.2) {
      return { signal: 'increase', reason: 'HIGH_MARGIN_GOOD_VELOCITY' };
    }
    return { signal: 'hold', reason: 'HIGH_MARGIN_WEAK_VELOCITY' };
  }

  // ========================================
  // ABOVE TARGET (20-25%)
  // ========================================
  if (expectedMarginPercent > PRICING_THRESHOLDS.TARGET_MARGIN_HIGH) {
    if (demandScore < 0.5) {
      return { signal: 'decrease', reason: 'HIGH_MARGIN_VERY_LOW_VELOCITY' };
    }
    if (demandScore >= 1.0) {
      return { signal: 'increase', reason: 'HIGH_MARGIN_GOOD_VELOCITY' };
    }
    return { signal: 'hold', reason: 'HIGH_MARGIN_WEAK_VELOCITY' };
  }

  // ========================================
  // OPTIMAL ZONE (12-20%)
  // ========================================
  if (demandScore >= 1.3) {
    return { signal: 'increase', reason: 'MID_MARGIN_HIGH_VELOCITY' };
  }
  if (demandScore >= 1.0) {
    return { signal: 'increase', reason: 'MID_MARGIN' };
  }
  if (demandScore >= 0.7) {
    return { signal: 'hold', reason: 'MID_MARGIN' };
  }
  // Low demand
  if (expectedMarginPercent > PRICING_THRESHOLDS.TARGET_MARGIN_LOW) {
    return { signal: 'decrease', reason: 'MID_MARGIN_LOW_VELOCITY' };
  }
  return { signal: 'hold', reason: 'MID_MARGIN' };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchFutureBookings(
  dateStart: string,
  dateEnd: string
): Promise<RawFutureBookingRow[]> {
  const pageSize = 1000;
  const allRows: RawFutureBookingRow[] = [];

  // Paginated fetch (no DEBUG queries - faster)
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('booking_room_lines_mirror')
      .select('id, pms_booking_id, line_index, room_type, rate_plan, check_in_date, check_out_date, nights, amount, created_at')
      .gte('check_in_date', dateStart)
      .lte('check_in_date', dateEnd)
      .order('check_in_date', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[fetchFutureBookings] Error:', error);
      throw error;
    }
    if (!data || data.length === 0) break;
    allRows.push(...(data as RawFutureBookingRow[]));
    if (data.length < pageSize) break;
  }

  return allRows;
}

async function fetchBookingMetadata(
  pmsBookingIds: string[]
): Promise<Map<string, RawBookingMetaRow>> {
  if (pmsBookingIds.length === 0) return new Map();

  // Chunk size to avoid URL too long error
  const chunkSize = 50;
  const allBookings: Array<Omit<RawBookingMetaRow, 'rooms_count'>> = [];

  // Parallel chunk fetching for speed
  const chunks: string[][] = [];
  for (let i = 0; i < pmsBookingIds.length; i += chunkSize) {
    chunks.push(pmsBookingIds.slice(i, i + chunkSize));
  }

  // Fetch booking metadata (without rooms_count - that column doesn't exist in bookings_mirror)
  const results = await Promise.all(
    chunks.map(chunk =>
      supabase
        .from('bookings_mirror')
        .select('pms_booking_id, unified_booking_id, ota_source, pms_property_id, pms_property_name, room_type, booking_status, payment_type, commission_rate, total_amount_net, nights')
        .in('pms_booking_id', chunk)
    )
  );

  results.forEach(({ data }) => {
    if (data) allBookings.push(...(data as Array<Omit<RawBookingMetaRow, 'rooms_count'>>));
  });

  // Fetch rooms_count from booking_room_lines_mirror (source of truth for multi-room bookings)
  // Count number of room lines per booking
  const roomsCountMap = new Map<string, number>();
  const roomLinesResults = await Promise.all(
    chunks.map(chunk =>
      supabase
        .from('booking_room_lines_mirror')
        .select('pms_booking_id')
        .in('pms_booking_id', chunk)
    )
  );

  roomLinesResults.forEach(({ data }) => {
    if (data) {
      data.forEach(row => {
        if (row.pms_booking_id) {
          roomsCountMap.set(row.pms_booking_id, (roomsCountMap.get(row.pms_booking_id) || 0) + 1);
        }
      });
    }
  });

  // Merge booking metadata with rooms_count
  const map = new Map<string, RawBookingMetaRow>();
  allBookings.forEach(b => {
    if (b.pms_booking_id) {
      map.set(b.pms_booking_id, {
        ...b,
        rooms_count: roomsCountMap.get(b.pms_booking_id) || 1
      });
    }
  });

  return map;
}

/**
 * Fetch room type UUID Ã¢â€ â€™ name mapping from room_types_mirror
 */
async function fetchRoomTypeMapping(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('room_types_mirror')
    .select('provider_room_type_id, room_type_name');

  const map = new Map<string, string>();
  data?.forEach(row => {
    if (row.provider_room_type_id && row.room_type_name) {
      map.set(row.provider_room_type_id, row.room_type_name);
    }
  });

  return map;
}

/**
 * Convert DayTypeMix to dominant day type for lookup
 */
function getDominantDayType(dayTypeMix: DayTypeMix): 'weekday' | 'weekend' | 'mixed' {
  if (dayTypeMix === 'WEEKDAY') return 'weekday';
  if (dayTypeMix === 'WEEKEND') return 'weekend';
  return 'mixed';
}

/**
 * Extract bedroom count from room type string
 * Returns number: 1, 2, 3, or 0 if unknown
 */
function extractBedroomCount(roomType: string | null | undefined): number {
  if (!roomType) return 0;
  const lower = roomType.toLowerCase();

  // Match patterns like "1 PhÃ²ng", "2 PhÃ²ng ngá»§", "3 PhÃ²ng Ngá»§ Deluxe", "Studio"
  if (lower.includes('studio')) return 1;

  // Vietnamese: "2 PhÃ²ng ngá»§", "1 PhÃ²ng", etc.
  const vnMatch = lower.match(/(\d)\s*ph/i);
  if (vnMatch) return parseInt(vnMatch[1], 10);

  // English: "2 Bedroom", "1 BR", "2BR", "Deluxe 2 Bedroom", etc.
  const enMatch = lower.match(/(\d)\s*(?:bedroom|br\b)/i);
  if (enMatch) return parseInt(enMatch[1], 10);

  // Fallback: check for number at start
  const numMatch = lower.match(/^(\d)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return 0;
}

/**
 * Normalize room type by extracting only bedroom count info
 * This allows "Tòa L81 - 1 Phòng ngủ" and "Tòa thường - 1 Phòng ngủ" to share same Host ADR pool
 * because both are actually 1-bedroom units
 */
function normalizeRoomType(roomType: string | null | undefined): string {
  if (!roomType) return 'unknown';
  const bedroomCount = extractBedroomCount(roomType);
  if (bedroomCount === 0) return roomType; // Can't parse, use original
  return `${bedroomCount} Phòng ngủ`;
}

/**
 * Normalize string for key matching - removes extra spaces, trims, lowercases for comparison
 * This fixes issues like "Tòa L81 - 1 Phòng" vs "Tòa L81 -  1 Phòng" (double space)
 */
function normalizeKeyString(str: string): string {
  return str
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .trim();
}

/**
 * Fetch Host ADR reference by OTA property + room type + day type + SEASON
 * 
 * SEASON-AWARE HOST ADR (2026-01-29):
 * - HIGH SEASON: Dec, Jan, Feb (TÃ¡ÂºÂ¿t + nghÃ¡Â»â€° Ã„â€˜ÃƒÂ´ng)
 * - SHOULDER: Mar, Apr, Nov
 * - LOW SEASON: May - Oct
 * 
 * Keys include season suffix for accurate seasonal pricing:
 * - EXACT|||property|||room|||HIGH
 * - EXACT|||property|||room|||LOW
 * - etc.
 * 
 * IMPORTANT: Excludes UPGRADE segments (e.g. OTA 1BR fulfilled by Host 2BR)
 * Only includes segments where Host bedroom count matches OTA bedroom count
 * 
 * HYBRID FALLBACK LADDER:
 * 1. OTA property + room type + season (most accurate)
 * 2. OTA property + room type (all seasons - if season sample too small)
 * 3. OTA property + bedroom count + season
 * 4. OTA property only (last resort)
 * 
 * DATA SOURCE PRIORITY:
 * 1. Segments linked via unified_booking_id Ã¢â€ â€™ OTA property from bookings_mirror
 * 2. Segments with host_property_name only Ã¢â€ â€™ direct use (fallback for old data)
 */
async function fetchHostAdrByOtaGroup(): Promise<Map<string, number[]>> {
  const dateStart = format(subMonths(new Date(), 12), 'yyyy-MM-dd');

  // Step 1A: Get segments WITH unified_booking_id (linked to OTA bookings)
  const { data: linkedSegments, error: linkedError } = await supabase
    .from('host_supply_segments')
    .select('id, unified_booking_id, total_amount, nights, date_from, nightly_rate, host_property_name, host_room_type, actual_check_in_at')
    .gte('date_from', dateStart)
    .not('unified_booking_id', 'is', null)
    .limit(5000);

  // Step 1B: Get segments WITHOUT unified_booking_id but with host_property_name
  // These are old segments that weren't linked yet - use host_property_name directly
  const { data: unlinkedSegments, error: unlinkedError } = await supabase
    .from('host_supply_segments')
    .select('id, unified_booking_id, total_amount, nights, date_from, nightly_rate, host_property_name, host_room_type, actual_check_in_at')
    .gte('date_from', dateStart)
    .is('unified_booking_id', null)
    .not('host_property_name', 'is', null)
    .limit(3000);

  if (linkedError) {
    console.error('[fetchHostAdrByOtaGroup] Linked segments query error:', linkedError);
  }
  if (unlinkedError) {
    console.error('[fetchHostAdrByOtaGroup] Unlinked segments query error:', unlinkedError);
  }

  const allLinkedSegments = linkedSegments || [];
  const allUnlinkedSegments = unlinkedSegments || [];

  debugLog(`[fetchHostAdrByOtaGroup] Linked segments (with unified_booking_id): ${allLinkedSegments.length}`);
  debugLog(`[fetchHostAdrByOtaGroup] Unlinked segments (host_property_name only): ${allUnlinkedSegments.length}`);

  if (allLinkedSegments.length === 0 && allUnlinkedSegments.length === 0) {
    debugLog('[fetchHostAdrByOtaGroup] No segments found at all');
    return new Map();
  }

  // Combine all segments for processing
  const allSegments = [...allLinkedSegments, ...allUnlinkedSegments];

  // Separate executed vs non-executed for logging
  const executedSegments = allSegments.filter(s => s.actual_check_in_at !== null);
  const pendingSegments = allSegments.filter(s => s.actual_check_in_at === null);

  debugLog(`[fetchHostAdrByOtaGroup] Total linked segments: ${allSegments.length}`);
  debugLog(`[fetchHostAdrByOtaGroup] - Executed (checked-in): ${executedSegments.length}`);
  debugLog(`[fetchHostAdrByOtaGroup] - Pending (not checked-in): ${pendingSegments.length}`);

  // STRATEGY: Use executed segments first, fall back to all segments if needed
  // For Host ADR, executed is more accurate (confirmed cost), but pending still useful
  const segmentsToUse = executedSegments.length >= 10 ? executedSegments : allSegments;
  const usingExecutedOnly = segmentsToUse === executedSegments;
  debugLog(`[fetchHostAdrByOtaGroup] Using ${usingExecutedOnly ? 'EXECUTED ONLY' : 'ALL LINKED'} segments (n=${segmentsToUse.length})`);

  // Build unified_booking_id Ã¢â€ â€™ list of {adr, dayType, hostBedroomCount, month}
  // IMPORTANT: Include month for SEASON-AWARE HOST ADR filtering
  const segmentDataMap = new Map<string, Array<{ adr: number; dayType: 'weekday' | 'weekend'; hostBedroomCount: number; hostRoomType: string; month: number }>>();
  segmentsToUse.forEach(seg => {
    if (!seg.unified_booking_id || !seg.date_from) return;
    const adr = seg.nights > 0 ? (seg.total_amount || 0) / seg.nights : 0;
    if (adr <= 0) return;

    // Determine day type from segment date_from
    const rawDayType = getDayType(seg.date_from);

    // Extract month for season filtering
    const month = parseInt(seg.date_from.substring(5, 7), 10); // 1-12
    const dayType: 'weekday' | 'weekend' = rawDayType === 'weekday' ? 'weekday' : 'weekend';

    // Extract bedroom count from Host room type
    const hostBedroomCount = extractBedroomCount(seg.host_room_type);

    if (!segmentDataMap.has(seg.unified_booking_id)) {
      segmentDataMap.set(seg.unified_booking_id, []);
    }
    segmentDataMap.get(seg.unified_booking_id)!.push({ adr, dayType, hostBedroomCount, hostRoomType: seg.host_room_type || '', month });
  });

  debugLog(`[fetchHostAdrByOtaGroup] Found ${segmentDataMap.size} bookings with valid segments`);

  // Step 2: Get OTA property + room type for these bookings
  const unifiedIds = [...segmentDataMap.keys()];
  debugLog(`[fetchHostAdrByOtaGroup] Looking up ${unifiedIds.length} unified_booking_ids in bookings_mirror`);
  debugLog(`[fetchHostAdrByOtaGroup] Sample unified_ids:`, unifiedIds.slice(0, 10));

  // Chunk to avoid URL too long (400 error) - max 100 UUIDs per request
  const chunkSize = 100;
  const allBookings: { unified_booking_id: string | null; pms_property_name: string | null; room_type: string | null }[] = [];

  for (let i = 0; i < unifiedIds.length; i += chunkSize) {
    const chunk = unifiedIds.slice(i, i + chunkSize);
    const { data: chunkData, error: chunkError } = await supabase
      .from('bookings_mirror')
      .select('unified_booking_id, pms_property_name, room_type')
      .in('unified_booking_id', chunk);

    if (chunkError) {
      console.warn(`[fetchHostAdrByOtaGroup] Chunk ${i}-${i + chunkSize} error:`, chunkError.message);
      continue;
    }
    if (chunkData) allBookings.push(...chunkData);
  }
  const bookings = allBookings;

  if (bookings.length === 0) {
    debugLog('[fetchHostAdrByOtaGroup] No bookings found for segments - checking if unified_booking_ids exist...');
    // DEBUG: Check if the unified_booking_ids exist in bookings_mirror at all
    const { data: checkBookings } = await supabase
      .from('bookings_mirror')
      .select('unified_booking_id, pms_property_name')
      .limit(10);
    debugLog('[fetchHostAdrByOtaGroup] Sample bookings_mirror records:', checkBookings?.map(b => ({ id: b.unified_booking_id?.slice(0, 8), prop: b.pms_property_name })));
    return new Map();
  }

  debugLog(`[fetchHostAdrByOtaGroup] Found ${bookings.length} bookings matching segments`);

  // DEBUG: Log unique OTA properties found
  const foundProps = [...new Set(bookings.map(b => b.pms_property_name).filter(Boolean))];
  debugLog(`[fetchHostAdrByOtaGroup] Unique OTA properties from matched bookings:`, foundProps.sort());

  // Step 3: Group Host ADRs by MULTIPLE KEY LEVELS for fallback ladder
  // Key formats (in priority order):
  // EXACT:     "EXACT|||property|||room|||dayType" - property + room type + day type
  // EXACT:     "EXACT|||property|||room"           - property + room type
  // PROP_BED:  "PROP_BED|||property|||{BR}"        - property + bedroom count
  // PROP_ALL:  "PROP_ALL|||property"               - property only (warning)
  const result = new Map<string, number[]>();

  // DEBUG: Log raw segment data for Vinhomes 4BR (using segmentsToUse, not undefined 'segments')
  const debugSegments = segmentsToUse.filter(s => {
    const booking = bookings.find(b => b.unified_booking_id === s.unified_booking_id);
    return booking?.pms_property_name?.includes('Vinhomes') &&
      booking?.room_type?.includes('4 PhÃƒÂ²ng');
  });
  debugLog(`[DEBUG SEGMENT RAW] Vinhomes 4BR segments count: ${debugSegments.length}`);
  debugLog(`[DEBUG SEGMENT HEADERS] id | unified_id | HOST property | HOST room | nightly_rate | total_amount | nights | calc ADR | OTA room_type`);
  debugSegments.slice(0, 15).forEach((seg, i) => {
    const booking = bookings.find(b => b.unified_booking_id === seg.unified_booking_id);
    const calcAdr = seg.nights > 0 ? (seg.total_amount || 0) / seg.nights : 0;
    const hostBR = extractBedroomCount(seg.host_room_type);
    const otaBR = extractBedroomCount(booking?.room_type);
    debugLog(`[DEBUG SEGMENT ${i}] ${seg.id?.slice(0, 8)}... | HOST="${seg.host_room_type}" (${hostBR}BR) | OTA="${booking?.room_type}" (${otaBR}BR) | nightly=${seg.nightly_rate?.toLocaleString()}Ã„â€˜ | calcADR=${calcAdr.toLocaleString()}Ã„â€˜ | ${hostBR === otaBR ? 'Ã¢Å“â€¦ MATCH' : 'Ã¢ÂÅ’ SKIP (upgrade)'}`);
  });

  // DEBUG: Log segments for "Toa L81 - 1 Phong ngu"
  const debugL81Segments = segmentsToUse.filter(s => {
    const bk = bookings.find(b => b.unified_booking_id === s.unified_booking_id);
    return bk?.pms_property_name?.includes('Vinhomes') &&
      bk?.room_type?.includes('L81') &&
      bk?.room_type?.includes('1 Ph');
  });
  console.log(`[DEBUG L81-1BR] Found ${debugL81Segments.length} segments`);

  // Count by dayType
  let weekdayCount = 0;
  let weekendCount = 0;
  debugL81Segments.forEach((seg, i) => {
    const bk = bookings.find(b => b.unified_booking_id === seg.unified_booking_id);
    const calcAdr = seg.nights > 0 ? (seg.total_amount || 0) / seg.nights : 0;
    const dayType = getDayType(seg.date_from);
    const month = parseInt(seg.date_from.substring(5, 7), 10);
    const season = getSeasonType(month);
    if (dayType === 'weekday') weekdayCount++;
    else weekendCount++;
    console.log(`[DEBUG L81-1BR #${i}] date=${seg.date_from} | dayType=${dayType} | season=${season} | HOST="${seg.host_room_type}" | ADR=${calcAdr.toLocaleString()}`);
  });
  console.log(`[DEBUG L81-1BR] DayType distribution: weekday=${weekdayCount}, weekend=${weekendCount}`);

  let upgradeSkipCount = 0;
  let matchedCount = 0;

  /**
   * Helper: Add ADRs to a key, initializing if needed
   */
  const addToKey = (key: string, adrs: number[]) => {
    if (adrs.length === 0) return;
    if (!result.has(key)) result.set(key, []);
    result.get(key)!.push(...adrs);
  };

  bookings.forEach(b => {
    if (!b.unified_booking_id || !b.pms_property_name) return;

    const segmentData = segmentDataMap.get(b.unified_booking_id);
    if (!segmentData || segmentData.length === 0) return;

    // Normalize property and room names (fix double-space issues)
    const otaProp = normalizeKeyString(b.pms_property_name);
    const otaRoom = normalizeKeyString(b.room_type || UNMAPPED_LABEL);
    const otaBedroomCount = extractBedroomCount(otaRoom);

    // Group ADRs by day type AND SEASON
    // FILTER: Only include segments where Host bedroom count matches OTA bedroom count
    // This excludes UPGRADE cases (e.g. OTA 1BR â†’ Host 2BR)

    // EXACT/PROP_BED: Only CONFIRMED bedroom match (bedroomMatch === true)
    const adrsHigh: number[] = [];     // HIGH season - exact match only
    const adrsLow: number[] = [];      // LOW season - exact match only
    const adrsShoulder: number[] = []; // SHOULDER - exact match only
    const exactMatchAdrs: number[] = []; // All seasons - exact match only

    // PROP_ALL: ALL ADRs including unknown bedroom (bedroomMatch === null)
    // Fallback data with more coverage but less precision
    const allAdrsHigh: number[] = [];     // HIGH season - all non-upgrade
    const allAdrsLow: number[] = [];      // LOW season - all non-upgrade
    const allAdrsShoulder: number[] = []; // SHOULDER - all non-upgrade

    // Day type grouping (all segments)
    const weekdayAdrs: number[] = [];
    const weekendAdrs: number[] = [];

    // SEASON + dayType combined (for precise weekday/weekend differentiation)
    const adrsHighWeekday: number[] = [];
    const adrsHighWeekend: number[] = [];
    const adrsLowWeekday: number[] = [];
    const adrsLowWeekend: number[] = [];
    const adrsShoulderWeekday: number[] = [];
    const adrsShoulderWeekend: number[] = [];

    segmentData.forEach(({ adr, dayType, hostBedroomCount, hostRoomType, month }) => {
      // Determine if bedroom counts match
      // bedroomMatch = true: confirmed match (both known and equal)
      // bedroomMatch = false: confirmed mismatch (UPGRADE - skip entirely)
      // bedroomMatch = null: unknown (one or both bedroom counts = 0)
      const bedroomMatch = (otaBedroomCount > 0 && hostBedroomCount > 0)
        ? (otaBedroomCount === hostBedroomCount)
        : null;

      if (bedroomMatch === false) {
        // Confirmed UPGRADE (e.g. OTA 1BR â†’ Host 2BR) - skip entirely
        upgradeSkipCount++;
        return;
      }

      // Room CLASS matching: L81/Premium vs thuong/Standard
      const otaLower = otaRoom.toLowerCase();
      const hostLower = (hostRoomType || '').toLowerCase();
      const premiumKw = ['l81', 'landmark', 'premium', 'penthouse', 'galleria'];
      const standardKw = ['thuong', 'standard', 'regular'];
      const otaIsPremium = premiumKw.some(k => otaLower.includes(k));
      const otaIsStandard = standardKw.some(k => otaLower.includes(k));
      const hostIsPremium = premiumKw.some(k => hostLower.includes(k));
      const hostIsStandard = standardKw.some(k => hostLower.includes(k));
      if (otaIsPremium && hostIsStandard) return;
      if (otaIsStandard && hostIsPremium) return;
      matchedCount++;

      // Group by day type (all segments)
      if (dayType === 'weekday') {
        weekdayAdrs.push(adr);
      } else {
        weekendAdrs.push(adr);
      }

      // Classify by season FIRST (needed for all arrays)
      const season = getSeasonType(month);

      // ALL non-upgrade ADRs go to allAdrs* arrays (for PROP_ALL fallback)
      // This includes bedroomMatch === null (unknown) AND bedroomMatch === true
      if (season === 'HIGH') {
        allAdrsHigh.push(adr);
      } else if (season === 'LOW') {
        allAdrsLow.push(adr);
      } else {
        allAdrsShoulder.push(adr);
      }

      // Only CONFIRMED bedroom matches go to exact arrays (EXACT/PROP_BED)
      if (bedroomMatch === true) {
        exactMatchAdrs.push(adr);
        if (season === 'HIGH') {
          adrsHigh.push(adr);
          if (dayType === 'weekday') adrsHighWeekday.push(adr);
          else adrsHighWeekend.push(adr);
        } else if (season === 'LOW') {
          adrsLow.push(adr);
          if (dayType === 'weekday') adrsLowWeekday.push(adr);
          else adrsLowWeekend.push(adr);
        } else {
          adrsShoulder.push(adr);
          if (dayType === 'weekday') adrsShoulderWeekday.push(adr);
          else adrsShoulderWeekend.push(adr);
        }
      }
    });

    const allAdrs = [...weekdayAdrs, ...weekendAdrs];

    // === LEVEL 1: EXACT (property + roomType) ===
    // Only use ADRs with CONFIRMED bedroom match for accuracy
    if (exactMatchAdrs.length > 0) {
      // SEASON + dayType combined (MOST SPECIFIC - for weekday/weekend differentiation)
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||HIGH|||weekday`, adrsHighWeekday);
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||HIGH|||weekend`, adrsHighWeekend);
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||LOW|||weekday`, adrsLowWeekday);
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||LOW|||weekend`, adrsLowWeekend);
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||SHOULDER|||weekday`, adrsShoulderWeekday);
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||SHOULDER|||weekend`, adrsShoulderWeekend);

      // SEASON only (fallback when combined not available)
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||HIGH`, adrsHigh);
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||LOW`, adrsLow);
      addToKey(`EXACT|||${otaProp}|||${otaRoom}|||SHOULDER`, adrsShoulder);
      addToKey(`EXACT|||${otaProp}|||${otaRoom}`, exactMatchAdrs);
    }
    // Day type only (legacy - use all ADRs for backwards compat)
    addToKey(`EXACT|||${otaProp}|||${otaRoom}|||weekday`, weekdayAdrs);
    addToKey(`EXACT|||${otaProp}|||${otaRoom}|||weekend`, weekendAdrs);

    // === LEVEL 2: PROP_BED (property + bedroom count) ===
    // Only use exactMatchAdrs for bedroom-specific keys
    if (otaBedroomCount > 0 && exactMatchAdrs.length > 0) {
      // SEASON + dayType combined (for weekday/weekend differentiation)
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||HIGH|||weekday`, adrsHighWeekday);
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||HIGH|||weekend`, adrsHighWeekend);
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||LOW|||weekday`, adrsLowWeekday);
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||LOW|||weekend`, adrsLowWeekend);
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||SHOULDER|||weekday`, adrsShoulderWeekday);
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||SHOULDER|||weekend`, adrsShoulderWeekend);
      // SEASON only
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||HIGH`, adrsHigh);
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||LOW`, adrsLow);
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||SHOULDER`, adrsShoulder);
      // dayType only
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||weekday`, weekdayAdrs);
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}|||weekend`, weekendAdrs);
      // All
      addToKey(`PROP_BED|||${otaProp}|||${otaBedroomCount}`, exactMatchAdrs);
    }

    // === LEVEL 3: PROP_ALL (property only - all room types mixed) ===
    // Use ALL non-upgrade ADRs (includes unknown bedroom matches)
    // This is the fallback with maximum coverage but less precision
    // SEASON + dayType combined (for weekday/weekend differentiation)
    const allWeekdayHigh = allAdrsHigh.filter((_, i) => weekdayAdrs.length > i);
    const allWeekendHigh = allAdrsHigh.filter((_, i) => weekendAdrs.length > i);
    // Re-calculate day type for allAdrs* arrays properly
    const allAdrsHighWeekday: number[] = [];
    const allAdrsHighWeekend: number[] = [];
    const allAdrsLowWeekday: number[] = [];
    const allAdrsLowWeekend: number[] = [];
    const allAdrsShoulderWeekday: number[] = [];
    const allAdrsShoulderWeekend: number[] = [];
    segmentData.forEach(({ adr, dayType, hostBedroomCount, hostRoomType, month }) => {
      const bedroomMatch = (otaBedroomCount > 0 && hostBedroomCount > 0)
        ? (otaBedroomCount === hostBedroomCount)
        : null;
      if (bedroomMatch === false) return; // Skip upgrades
      const season = getSeasonType(month);
      if (season === 'HIGH') {
        if (dayType === 'weekday') allAdrsHighWeekday.push(adr);
        else allAdrsHighWeekend.push(adr);
      } else if (season === 'LOW') {
        if (dayType === 'weekday') allAdrsLowWeekday.push(adr);
        else allAdrsLowWeekend.push(adr);
      } else {
        if (dayType === 'weekday') allAdrsShoulderWeekday.push(adr);
        else allAdrsShoulderWeekend.push(adr);
      }
    });
    // SEASON + dayType combined
    addToKey(`PROP_ALL|||${otaProp}|||HIGH|||weekday`, allAdrsHighWeekday);
    addToKey(`PROP_ALL|||${otaProp}|||HIGH|||weekend`, allAdrsHighWeekend);
    addToKey(`PROP_ALL|||${otaProp}|||LOW|||weekday`, allAdrsLowWeekday);
    addToKey(`PROP_ALL|||${otaProp}|||LOW|||weekend`, allAdrsLowWeekend);
    addToKey(`PROP_ALL|||${otaProp}|||SHOULDER|||weekday`, allAdrsShoulderWeekday);
    addToKey(`PROP_ALL|||${otaProp}|||SHOULDER|||weekend`, allAdrsShoulderWeekend);
    // SEASON only
    addToKey(`PROP_ALL|||${otaProp}|||HIGH`, allAdrsHigh);
    addToKey(`PROP_ALL|||${otaProp}|||LOW`, allAdrsLow);
    addToKey(`PROP_ALL|||${otaProp}|||SHOULDER`, allAdrsShoulder);
    // dayType only
    addToKey(`PROP_ALL|||${otaProp}|||weekday`, weekdayAdrs);
    addToKey(`PROP_ALL|||${otaProp}|||weekend`, weekendAdrs);
    // All
    addToKey(`PROP_ALL|||${otaProp}`, allAdrs);
  });

  // ============================================================
  // Step 4: Process UNLINKED segments (no unified_booking_id)
  // These use host_property_name directly as the property key
  // ============================================================
  let unlinkedCount = 0;
  allUnlinkedSegments.forEach(seg => {
    if (!seg.host_property_name || !seg.date_from) return;
    const adr = seg.nights > 0 ? (seg.total_amount || 0) / seg.nights : 0;
    if (adr <= 0) return;

    const rawDayType = getDayType(seg.date_from);
    const dayType: 'weekday' | 'weekend' = rawDayType === 'weekday' ? 'weekday' : 'weekend';
    const hostBedroomCount = extractBedroomCount(seg.host_room_type);

    // Extract month for season classification
    const month = parseInt(seg.date_from.substring(5, 7), 10);
    const season = getSeasonType(month);

    // For unlinked segments, use host_property_name as the property key
    // This provides fallback coverage for old data
    const hostProp = seg.host_property_name;
    const hostRoom = seg.host_room_type || UNMAPPED_LABEL;

    // Add to EXACT keys (property + room type) with SEASON + dayType
    addToKey(`EXACT|||${hostProp}|||${hostRoom}|||${season}|||${dayType}`, [adr]); // MOST SPECIFIC
    addToKey(`EXACT|||${hostProp}|||${hostRoom}|||${season}`, [adr]);
    addToKey(`EXACT|||${hostProp}|||${hostRoom}|||${dayType}`, [adr]);
    addToKey(`EXACT|||${hostProp}|||${hostRoom}`, [adr]);

    // Add to PROP_BED (property + bedroom count) with SEASON + dayType
    if (hostBedroomCount > 0) {
      addToKey(`PROP_BED|||${hostProp}|||${hostBedroomCount}|||${season}|||${dayType}`, [adr]); // MOST SPECIFIC
      addToKey(`PROP_BED|||${hostProp}|||${hostBedroomCount}|||${season}`, [adr]);
      addToKey(`PROP_BED|||${hostProp}|||${hostBedroomCount}|||${dayType}`, [adr]);
      addToKey(`PROP_BED|||${hostProp}|||${hostBedroomCount}`, [adr]);
    }

    // Add to PROP_ALL (property only) with SEASON + dayType
    addToKey(`PROP_ALL|||${hostProp}|||${season}|||${dayType}`, [adr]); // MOST SPECIFIC
    addToKey(`PROP_ALL|||${hostProp}|||${season}`, [adr]);
    addToKey(`PROP_ALL|||${hostProp}|||${dayType}`, [adr]);
    addToKey(`PROP_ALL|||${hostProp}`, [adr]);

    unlinkedCount++;
  });

  debugLog(`[fetchHostAdrByOtaGroup] Added ${unlinkedCount} ADRs from unlinked segments (by host_property_name)`);

  debugLog(`[fetchHostAdrByOtaGroup] Built Host ADR reference: ${result.size} keys`);

  // DEBUG: Show L81 1BR keys with their values
  const l81Keys = [...result.entries()].filter(([k]) => k.includes('Vinhomes Central Park') && k.includes('1'));
  if (l81Keys.length > 0) {
    console.log('[DEBUG L81-1BR HOST ADR MAP] Found', l81Keys.length, 'keys for L81 1BR:');
    l81Keys.forEach(([key, adrs]) => {
      const avg = adrs.reduce((sum, v) => sum + v, 0) / adrs.length;
      console.log(`  "${key}" → n=${adrs.length}, avg=${avg.toFixed(0)}đ`);
    });
  }

  debugLog(`[fetchHostAdrByOtaGroup] Sample keys:`, [...result.keys()].slice(0, 20));
  debugLog(`[fetchHostAdrByOtaGroup] Upgrade filter: ${upgradeSkipCount} segments skipped, ${matchedCount} segments matched`);

  // DEBUG: List unique OTA properties that have Host ADR reference
  const uniqueProps = new Set<string>();
  result.forEach((_, key) => {
    const parts = key.split('|||');
    if (parts.length >= 2) uniqueProps.add(parts[1]);
  });
  debugLog(`[fetchHostAdrByOtaGroup] Unique OTA properties with Host ADR data:`, [...uniqueProps].sort());

  return result;
}

/**
 * ============================================================================
 * FETCH HOST SEGMENT METRICS
 * ============================================================================
 * 
 * Returns detailed min/max/volume metrics from host_supply_segments
 * Grouped by: OTA property → room type → dayType → season
 * 
 * Key format: "prop|||room" → HostSegmentMetrics
 */
async function fetchHostSegmentMetrics(): Promise<Map<string, HostSegmentMetrics>> {
  try {
    const dateStart = format(subMonths(new Date(), 12), 'yyyy-MM-dd');
    const date30DaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const date60DaysAgo = format(subDays(new Date(), 60), 'yyyy-MM-dd');

    // Step 1: Get all executed segments with OTA booking info
    const { data: segments, error: segError } = await supabase
      .from('host_supply_segments')
      .select('id, unified_booking_id, total_amount, nights, date_from, host_property_name, host_room_type, actual_check_in_at')
      .gte('date_from', dateStart)
      .not('actual_check_in_at', 'is', null)
      .not('unified_booking_id', 'is', null)
      .limit(5000);

    if (segError || !segments || segments.length === 0) {
      debugLog('[fetchHostSegmentMetrics] No segments found');
      return new Map();
    }

    // Step 2: Get OTA property/room mapping
    const unifiedIds = [...new Set(segments.map(s => s.unified_booking_id).filter(Boolean))] as string[];
    const bookingMap = new Map<string, { otaProp: string; otaRoom: string }>();

    // Chunk to avoid URL too long
    for (let i = 0; i < unifiedIds.length; i += 100) {
      const chunk = unifiedIds.slice(i, i + 100);
      const { data: bookings } = await supabase
        .from('bookings_mirror')
        .select('unified_booking_id, pms_property_name, room_type')
        .in('unified_booking_id', chunk);

      bookings?.forEach(b => {
        if (b.unified_booking_id && b.pms_property_name) {
          bookingMap.set(b.unified_booking_id, {
            otaProp: b.pms_property_name,
            otaRoom: b.room_type || UNMAPPED_LABEL
          });
        }
      });
    }

    // Step 3: Build metrics by OTA prop + room
    type SegmentData = {
      adr: number;
      nights: number;
      dayType: 'weekday' | 'weekend';
      season: 'HIGH' | 'LOW' | 'SHOULDER';
      dateFrom: string;
    };

    const dataByKey = new Map<string, SegmentData[]>();

    segments.forEach(seg => {
      if (!seg.unified_booking_id || !seg.date_from) return;
      const booking = bookingMap.get(seg.unified_booking_id);
      if (!booking) return;

      const adr = seg.nights && seg.nights > 0 ? (seg.total_amount || 0) / seg.nights : 0;
      if (adr <= 0) return;

      const key = `${booking.otaProp}|||${booking.otaRoom}`;
      const rawDayType = getDayType(seg.date_from);
      const dayType: 'weekday' | 'weekend' = rawDayType === 'weekday' ? 'weekday' : 'weekend';
      const month = parseInt(seg.date_from.substring(5, 7), 10);
      const season = getSeasonType(month);

      if (!dataByKey.has(key)) dataByKey.set(key, []);
      dataByKey.get(key)!.push({
        adr,
        nights: seg.nights || 1,
        dayType,
        season,
        dateFrom: seg.date_from
      });
    });

    // Step 4: Calculate metrics for each key
    const result = new Map<string, HostSegmentMetrics>();

    dataByKey.forEach((data, key) => {
      const allAdrs = data.map(d => d.adr);
      const weekdayData = data.filter(d => d.dayType === 'weekday');
      const weekendData = data.filter(d => d.dayType === 'weekend');
      const highData = data.filter(d => d.season === 'HIGH');
      const lowData = data.filter(d => d.season === 'LOW');
      const shoulderData = data.filter(d => d.season === 'SHOULDER');

      // Recent trend: last 30 days vs previous 30 days
      const recent30 = data.filter(d => d.dateFrom >= date30DaysAgo);
      const prev30 = data.filter(d => d.dateFrom >= date60DaysAgo && d.dateFrom < date30DaysAgo);
      const recentAvg = recent30.length > 0 ? recent30.reduce((s, d) => s + d.adr, 0) / recent30.length : 0;
      const prevAvg = prev30.length > 0 ? prev30.reduce((s, d) => s + d.adr, 0) / prev30.length : 0;
      const recentTrend = prevAvg > 0 ? (recentAvg - prevAvg) / prevAvg : 0;

      // Peak month calculation
      const byMonth = new Map<number, { nights: number; bookings: number }>();
      data.forEach(d => {
        const m = parseInt(d.dateFrom.substring(5, 7), 10);
        if (!byMonth.has(m)) byMonth.set(m, { nights: 0, bookings: 0 });
        byMonth.get(m)!.nights += d.nights;
        byMonth.get(m)!.bookings += 1;
      });

      let peakMonth = 1, peakNights = 0, peakBookings = 0;
      byMonth.forEach((v, m) => {
        if (v.nights > peakNights) {
          peakMonth = m;
          peakNights = v.nights;
          peakBookings = v.bookings;
        }
      });

      // Helper functions
      const calcMin = (arr: number[]) => arr.length > 0 ? Math.min(...arr) : null;
      const calcMax = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : null;
      const calcAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      const calcMedian = (arr: number[]) => {
        if (arr.length === 0) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      };

      const metrics: HostSegmentMetrics = {
        minAdr: Math.min(...allAdrs),
        maxAdr: Math.max(...allAdrs),
        medianAdr: calcMedian(allAdrs) || 0,
        avgAdr: allAdrs.reduce((s, v) => s + v, 0) / allAdrs.length,
        totalNights: data.reduce((s, d) => s + d.nights, 0),
        totalBookings: data.length,

        weekday: {
          minAdr: calcMin(weekdayData.map(d => d.adr)),
          maxAdr: calcMax(weekdayData.map(d => d.adr)),
          medianAdr: calcMedian(weekdayData.map(d => d.adr)),
          avgAdr: calcAvg(weekdayData.map(d => d.adr)),
          totalNights: weekdayData.reduce((s, d) => s + d.nights, 0),
          totalBookings: weekdayData.length
        },

        weekend: {
          minAdr: calcMin(weekendData.map(d => d.adr)),
          maxAdr: calcMax(weekendData.map(d => d.adr)),
          medianAdr: calcMedian(weekendData.map(d => d.adr)),
          avgAdr: calcAvg(weekendData.map(d => d.adr)),
          totalNights: weekendData.reduce((s, d) => s + d.nights, 0),
          totalBookings: weekendData.length
        },

        bySeason: {
          HIGH: {
            minAdr: calcMin(highData.map(d => d.adr)),
            maxAdr: calcMax(highData.map(d => d.adr)),
            avgAdr: calcAvg(highData.map(d => d.adr)),
            totalNights: highData.reduce((s, d) => s + d.nights, 0)
          },
          LOW: {
            minAdr: calcMin(lowData.map(d => d.adr)),
            maxAdr: calcMax(lowData.map(d => d.adr)),
            avgAdr: calcAvg(lowData.map(d => d.adr)),
            totalNights: lowData.reduce((s, d) => s + d.nights, 0)
          },
          SHOULDER: {
            minAdr: calcMin(shoulderData.map(d => d.adr)),
            maxAdr: calcMax(shoulderData.map(d => d.adr)),
            avgAdr: calcAvg(shoulderData.map(d => d.adr)),
            totalNights: shoulderData.reduce((s, d) => s + d.nights, 0)
          }
        },

        recentTrend,
        recentTrendDirection: recentTrend > 0.02 ? 'UP' : recentTrend < -0.02 ? 'DOWN' : 'STABLE',

        peakMonth,
        peakMonthNights: peakNights,
        peakMonthBookings: peakBookings
      };

      result.set(key, metrics);
    });

    debugLog(`[fetchHostSegmentMetrics] Built metrics for ${result.size} property+room combinations`);
    return result;
  } catch (error) {
    console.error('[fetchHostSegmentMetrics] Error:', error);
    return new Map();
  }
}

/**
 * ============================================================================
 * FETCH OTA BOOKING TIMING METRICS
 * ============================================================================
 * 
 * Returns lead time distribution (lastminute vs early bird)
 * Grouped by: OTA property → room type → dayType
 * 
 * Key format: "prop|||room" → OtaBookingTimingMetrics
 */
async function fetchOtaBookingTimingMetrics(): Promise<Map<string, OtaBookingTimingMetrics>> {
  try {
    const dateStart = format(subMonths(new Date(), 6), 'yyyy-MM-dd');
    const date30DaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const date60DaysAgo = format(subDays(new Date(), 60), 'yyyy-MM-dd');

    // Get bookings with created_at and check_in_date for lead time calculation
    const { data: bookings, error } = await supabase
      .from('bookings_mirror')
      .select('pms_property_name, room_type, created_at, check_in_date, nights')
      .gte('check_in_date', dateStart)
      .not('created_at', 'is', null)
      .not('check_in_date', 'is', null)
      .limit(5000);

    if (error || !bookings || bookings.length === 0) {
      debugLog('[fetchOtaBookingTimingMetrics] No bookings found');
      return new Map();
    }

    // Group by prop + room
    type BookingData = {
      leadTimeDays: number;
      dayType: 'weekday' | 'weekend';
      createdAt: string;
    };

    const dataByKey = new Map<string, BookingData[]>();

    bookings.forEach(b => {
      if (!b.pms_property_name || !b.created_at || !b.check_in_date) return;

      const createdDate = parseISO(b.created_at);
      const checkInDate = parseISO(b.check_in_date);
      const leadTimeDays = differenceInDays(checkInDate, createdDate);

      if (leadTimeDays < 0) return; // Invalid data

      const key = `${b.pms_property_name}|||${b.room_type || UNMAPPED_LABEL}`;
      const rawDayType = getDayType(b.check_in_date);
      const dayType: 'weekday' | 'weekend' = rawDayType === 'weekday' ? 'weekday' : 'weekend';

      if (!dataByKey.has(key)) dataByKey.set(key, []);
      dataByKey.get(key)!.push({ leadTimeDays, dayType, createdAt: b.created_at });
    });

    // Calculate metrics
    const result = new Map<string, OtaBookingTimingMetrics>();

    dataByKey.forEach((data, key) => {
      const allLeadTimes = data.map(d => d.leadTimeDays);
      const weekdayData = data.filter(d => d.dayType === 'weekday');
      const weekendData = data.filter(d => d.dayType === 'weekend');

      // Lead time distribution
      const lastMinute = data.filter(d => d.leadTimeDays <= 3).length;
      const shortTerm = data.filter(d => d.leadTimeDays >= 4 && d.leadTimeDays <= 14).length;
      const midTerm = data.filter(d => d.leadTimeDays >= 15 && d.leadTimeDays <= 30).length;
      const earlyBird = data.filter(d => d.leadTimeDays > 30).length;
      const total = data.length;

      // Recent trend: average lead time last 30 days vs previous 30 days
      const recent30 = data.filter(d => d.createdAt >= date30DaysAgo);
      const prev30 = data.filter(d => d.createdAt >= date60DaysAgo && d.createdAt < date30DaysAgo);
      const recentAvgLead = recent30.length > 0 ? recent30.reduce((s, d) => s + d.leadTimeDays, 0) / recent30.length : 0;
      const prevAvgLead = prev30.length > 0 ? prev30.reduce((s, d) => s + d.leadTimeDays, 0) / prev30.length : 0;
      const leadTimeTrend = prevAvgLead > 0 ? (recentAvgLead - prevAvgLead) / prevAvgLead : 0;

      // Median calculation
      const sorted = [...allLeadTimes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianLead = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

      const metrics: OtaBookingTimingMetrics = {
        lastMinuteShare: total > 0 ? (lastMinute / total) * 100 : 0,
        shortTermShare: total > 0 ? (shortTerm / total) * 100 : 0,
        midTermShare: total > 0 ? (midTerm / total) * 100 : 0,
        earlyBirdShare: total > 0 ? (earlyBird / total) * 100 : 0,

        avgLeadTimeDays: allLeadTimes.reduce((s, v) => s + v, 0) / allLeadTimes.length,
        medianLeadTimeDays: medianLead,

        leadTimeTrend,
        leadTimeTrendDirection: leadTimeTrend > 0.1 ? 'EARLIER' : leadTimeTrend < -0.1 ? 'LATER' : 'STABLE',

        sampleSize: total,

        weekday: {
          avgLeadTimeDays: weekdayData.length > 0 ? weekdayData.reduce((s, d) => s + d.leadTimeDays, 0) / weekdayData.length : null,
          lastMinuteShare: weekdayData.length > 0 ? (weekdayData.filter(d => d.leadTimeDays <= 3).length / weekdayData.length) * 100 : null,
          earlyBirdShare: weekdayData.length > 0 ? (weekdayData.filter(d => d.leadTimeDays > 30).length / weekdayData.length) * 100 : null,
          sampleSize: weekdayData.length
        },

        weekend: {
          avgLeadTimeDays: weekendData.length > 0 ? weekendData.reduce((s, d) => s + d.leadTimeDays, 0) / weekendData.length : null,
          lastMinuteShare: weekendData.length > 0 ? (weekendData.filter(d => d.leadTimeDays <= 3).length / weekendData.length) * 100 : null,
          earlyBirdShare: weekendData.length > 0 ? (weekendData.filter(d => d.leadTimeDays > 30).length / weekendData.length) * 100 : null,
          sampleSize: weekendData.length
        }
      };

      result.set(key, metrics);
    });

    debugLog(`[fetchOtaBookingTimingMetrics] Built metrics for ${result.size} property+room combinations`);
    return result;
  } catch (error) {
    console.error('[fetchOtaBookingTimingMetrics] Error:', error);
    return new Map();
  }
}

/**
 * Fetch velocity baseline - count historical bookings by OTA property + room type
 * Returns booking count per day for each OTA property/room combination
 */
async function fetchVelocityBaseline(): Promise<Map<string, { count: number; sampleSize: number }>> {
  const monthsBack = FORECAST_CONFIG.HOST_ADR_REF_MONTHS;
  const dateStart = format(subMonths(new Date(), monthsBack), 'yyyy-MM-dd');
  const totalDays = monthsBack * 30;

  // Count bookings by OTA property + room type (only executed ones)
  const { data: bookings } = await supabase
    .from('bookings_mirror')
    .select('unified_booking_id, pms_property_name, room_type')
    .gte('check_in_date', dateStart)
    .not('unified_booking_id', 'is', null)
    .limit(5000);

  if (!bookings || bookings.length === 0) {
    debugLog('[fetchVelocityBaseline] No historical bookings found');
    return new Map();
  }

  // Check which bookings have executed segments - CHUNK to avoid URL too long (400 error)
  const unifiedIds = [...new Set(bookings.map(b => b.unified_booking_id).filter(Boolean))] as string[];
  const chunkSize = 100; // Small chunks to avoid URL length issues
  const executedSet = new Set<string>();

  debugLog(`[fetchVelocityBaseline] Checking ${unifiedIds.length} unified_ids in chunks of ${chunkSize}`);

  for (let i = 0; i < unifiedIds.length; i += chunkSize) {
    const chunk = unifiedIds.slice(i, i + chunkSize);
    const { data: executedSegments, error } = await supabase
      .from('host_supply_segments')
      .select('unified_booking_id')
      .in('unified_booking_id', chunk)
      .not('actual_check_in_at', 'is', null);

    if (error) {
      console.warn(`[fetchVelocityBaseline] Chunk ${i}-${i + chunkSize} error:`, error.message);
      continue;
    }

    executedSegments?.forEach(s => {
      if (s.unified_booking_id) executedSet.add(s.unified_booking_id);
    });
  }

  debugLog(`[fetchVelocityBaseline] Found ${executedSet.size} executed bookings`);

  // Count by OTA property + room type
  const result = new Map<string, { count: number; sampleSize: number }>();

  bookings.forEach(b => {
    if (!b.pms_property_name) return;
    if (!executedSet.has(b.unified_booking_id)) return; // Only count executed bookings

    const otaProp = b.pms_property_name;
    const otaRoom = b.room_type || UNMAPPED_LABEL;

    const keys = [
      `${otaProp}|||${otaRoom}`,
      otaProp,
    ];

    keys.forEach(key => {
      if (!result.has(key)) {
        result.set(key, { count: 0, sampleSize: 0 });
      }
      const entry = result.get(key)!;
      entry.sampleSize++;
    });
  });

  // Convert to daily rate
  result.forEach((entry) => {
    entry.count = entry.sampleSize / totalDays;
  });

  debugLog(`[fetchVelocityBaseline] Built velocity baseline: ${result.size} keys`);
  debugLog(`[fetchVelocityBaseline] Sample keys:`, [...result.keys()].slice(0, 10));

  return result;
}

/**
 * Fetch volume baseline - sÃ¡Â»â€˜ Ã„â€˜ÃƒÂªm Ã„â€˜Ã¡ÂºÂ·t trung bÃƒÂ¬nh lÃ¡Â»â€¹ch sÃ¡Â»Â­ theo property + room + month
 * 
 * Volume Score = actual booked nights / baseline nights
 * - Score > 1.0 = Ã„â€˜ÃƒÂ£ Ã„â€˜Ã¡ÂºÂ·t nhiÃ¡Â»Âu hÃ†Â¡n trung bÃƒÂ¬nh
 * - Score < 1.0 = Ã„â€˜ÃƒÂ£ Ã„â€˜Ã¡ÂºÂ·t ÃƒÂ­t hÃ†Â¡n trung bÃƒÂ¬nh
 */
async function fetchVolumeBaseline(): Promise<Map<string, number>> {
  const monthsBack = 12; // Look back 12 months for seasonal data
  const dateStart = format(subMonths(new Date(), monthsBack), 'yyyy-MM-dd');

  // Get historical booked nights by property + room + month
  const { data: lines } = await supabase
    .from('booking_room_lines_mirror')
    .select('pms_booking_id, room_type, nights, check_in_date')
    .gte('check_in_date', dateStart);

  if (!lines || lines.length === 0) {
    debugLog('[fetchVolumeBaseline] No historical booking lines found');
    return new Map();
  }

  // Get booking metadata
  const pmsIds = [...new Set(lines.map(l => l.pms_booking_id))];
  const bookingMeta = await fetchBookingMetadata(pmsIds);

  // Aggregate by property + room + month
  const monthlyData = new Map<string, number[]>(); // key Ã¢â€ â€™ array of monthly totals

  lines.forEach(line => {
    const meta = bookingMeta.get(line.pms_booking_id);
    if (!meta?.pms_property_name) return;

    const otaProp = meta.pms_property_name;
    const otaRoom = line.room_type || UNMAPPED_LABEL;
    const month = line.check_in_date.substring(5, 7); // Extract MM from YYYY-MM-DD

    // Key: property|||room|||month
    const key = `${otaProp}|||${otaRoom}|||${month}`;

    const existing = monthlyData.get(key) || [];
    existing.push(line.nights || 0);
    monthlyData.set(key, existing);
  });

  // Calculate average per key
  const result = new Map<string, number>();
  monthlyData.forEach((nightsArray, key) => {
    const avg = nightsArray.reduce((a, b) => a + b, 0) / Math.max(nightsArray.length, 1);
    result.set(key, avg);
  });

  debugLog(`[fetchVolumeBaseline] Built volume baseline: ${result.size} keys`);
  debugLog(`[fetchVolumeBaseline] Sample keys:`, [...result.keys()].slice(0, 10));

  return result;
}

/**
 * Fetch historical PEAK bookings by property + room + period
 * 
 * Capacity Score = current booked nights / historical peak nights
 * - Score < 0.5: ThÃ¡ÂºÂ¥p hÃ†Â¡n peak nhiÃ¡Â»Âu Ã¢â€ â€™ cÃƒÂ²n room, cÃƒÂ³ thÃ¡Â»Æ’ giÃ¡ÂºÂ£m giÃƒÂ¡
 * - Score 0.5-0.8: Trung bÃƒÂ¬nh Ã¢â€ â€™ giÃ¡Â»Â¯ giÃƒÂ¡
 * - Score > 0.8: GÃ¡ÂºÂ§n peak Ã¢â€ â€™ demand cao, cÃƒÂ³ thÃ¡Â»Æ’ tÃ„Æ’ng giÃƒÂ¡
 * 
 * Returns: Map<key, peakNights>
 */
async function fetchHistoricalPeak(): Promise<Map<string, number>> {
  const monthsBack = 12;
  const dateStart = format(subMonths(new Date(), monthsBack), 'yyyy-MM-dd');

  const { data: lines } = await supabase
    .from('booking_room_lines_mirror')
    .select('pms_booking_id, room_type, nights, check_in_date')
    .gte('check_in_date', dateStart);

  if (!lines || lines.length === 0) {
    debugLog('[fetchHistoricalPeak] No historical data');
    return new Map();
  }

  const pmsIds = [...new Set(lines.map(l => l.pms_booking_id))];
  const bookingMeta = await fetchBookingMetadata(pmsIds);

  // Aggregate by property + room + month, find max
  const monthlyTotals = new Map<string, Map<string, number>>(); // prop|||room Ã¢â€ â€™ month Ã¢â€ â€™ total

  lines.forEach(line => {
    const meta = bookingMeta.get(line.pms_booking_id);
    if (!meta?.pms_property_name) return;

    const propRoom = `${meta.pms_property_name}|||${line.room_type || UNMAPPED_LABEL}`;
    const month = line.check_in_date.substring(0, 7); // YYYY-MM

    if (!monthlyTotals.has(propRoom)) {
      monthlyTotals.set(propRoom, new Map());
    }
    const monthMap = monthlyTotals.get(propRoom)!;
    monthMap.set(month, (monthMap.get(month) || 0) + (line.nights || 0));
  });

  // Find peak (max) per property + room
  const result = new Map<string, number>();
  monthlyTotals.forEach((monthMap, propRoom) => {
    const peak = Math.max(...monthMap.values());
    result.set(propRoom, peak);
  });

  debugLog(`[fetchHistoricalPeak] Built peak data: ${result.size} keys`);

  return result;
}

/**
 * =============================================================================
 * OTA DEMAND SEASONALITY & TREND ANALYSIS
 * =============================================================================
 * 
 * Fetches historical OTA booking data to understand:
 * 1. Which months have higher demand (more bookings)
 * 2. OTA ADR trend (pricing going up/down)
 * 3. Demand-Supply correlation (high demand Ã¢â€ â€™ host likely to increase)
 * 
 * KEY INSIGHT: When OTA demand is high for a future month, 
 * hosts WILL increase prices. Use this to predict host cost.
 * 
 * Returns Map<month, OtaDemandData>
 */
interface OtaDemandData {
  bookingCount: number;         // Total bookings for this month
  avgOtaAdr: number;            // Average OTA ADR for this month
  demandIndex: number;          // Relative to annual average (1.0 = avg)
  adrIndex: number;             // Relative to annual avg ADR (1.0 = avg)
}

async function fetchOtaDemandSeasonality(): Promise<{
  byMonth: Map<number, OtaDemandData>;
  trend: number;                // OTA ADR trend (-1 to +1)
  annualAvgBookings: number;
  annualAvgAdr: number;
}> {
  const monthsBack = 12;
  const dateStart = format(subMonths(new Date(), monthsBack), 'yyyy-MM-dd');
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  // Get historical OTA bookings
  const { data: bookings, error } = await supabase
    .from('bookings_mirror')
    .select('check_in_date, total_amount_net, nights, created_at')
    .gte('check_in_date', dateStart)
    .not('total_amount_net', 'is', null)
    .gt('nights', 0);

  if (error || !bookings || bookings.length === 0) {
    debugLog('[fetchOtaDemandSeasonality] No OTA bookings found');
    return {
      byMonth: new Map(),
      trend: 0,
      annualAvgBookings: 0,
      annualAvgAdr: 0
    };
  }

  // Aggregate by check-in month
  const monthlyData = new Map<number, { count: number; adrs: number[] }>();

  bookings.forEach(b => {
    if (!b.check_in_date || !b.nights || b.nights <= 0) return;
    const month = parseInt(b.check_in_date.substring(5, 7), 10);
    const adr = (b.total_amount_net || 0) / b.nights;
    if (adr <= 0) return;

    if (!monthlyData.has(month)) {
      monthlyData.set(month, { count: 0, adrs: [] });
    }
    const data = monthlyData.get(month)!;
    data.count++;
    data.adrs.push(adr);
  });

  // Calculate annual averages
  let totalBookings = 0;
  let totalAdrs: number[] = [];
  monthlyData.forEach(data => {
    totalBookings += data.count;
    totalAdrs.push(...data.adrs);
  });

  const monthCount = monthlyData.size || 1;
  const annualAvgBookings = totalBookings / monthCount;
  const annualAvgAdr = totalAdrs.length > 0
    ? totalAdrs.reduce((a, b) => a + b, 0) / totalAdrs.length
    : 0;

  // Build result by month
  const byMonth = new Map<number, OtaDemandData>();
  monthlyData.forEach((data, month) => {
    const avgAdr = data.adrs.length > 0
      ? data.adrs.reduce((a, b) => a + b, 0) / data.adrs.length
      : 0;

    byMonth.set(month, {
      bookingCount: data.count,
      avgOtaAdr: avgAdr,
      demandIndex: annualAvgBookings > 0 ? data.count / annualAvgBookings : 1.0,
      adrIndex: annualAvgAdr > 0 ? avgAdr / annualAvgAdr : 1.0
    });
  });

  // Calculate OTA ADR trend (recent 3 months vs previous 3 months)
  const getMonthOffset = (offset: number) => {
    let m = currentMonth + offset;
    if (m <= 0) m += 12;
    if (m > 12) m -= 12;
    return m;
  };

  const recentMonths = [0, -1, -2].map(getMonthOffset);
  const previousMonths = [-3, -4, -5].map(getMonthOffset);

  const recentAdrs = recentMonths
    .map(m => byMonth.get(m)?.avgOtaAdr)
    .filter((v): v is number => v !== undefined && v > 0);
  const previousAdrs = previousMonths
    .map(m => byMonth.get(m)?.avgOtaAdr)
    .filter((v): v is number => v !== undefined && v > 0);

  let trend = 0;
  if (recentAdrs.length > 0 && previousAdrs.length > 0) {
    const recentAvg = recentAdrs.reduce((a, b) => a + b, 0) / recentAdrs.length;
    const previousAvg = previousAdrs.reduce((a, b) => a + b, 0) / previousAdrs.length;
    if (previousAvg > 0) {
      trend = Math.max(-1, Math.min(1, (recentAvg - previousAvg) / previousAvg));
    }
  }

  debugLog(`[fetchOtaDemandSeasonality] OTA data: ${bookings.length} bookings, ${monthlyData.size} months`);
  debugLog(`[fetchOtaDemandSeasonality] OTA ADR trend: ${(trend * 100).toFixed(1)}%`);
  debugLog(`[fetchOtaDemandSeasonality] Monthly demand index:`,
    [...byMonth.entries()].map(([m, d]) => `M${m}:${d.demandIndex.toFixed(2)}`).join(', ')
  );

  return {
    byMonth,
    trend,
    annualAvgBookings,
    annualAvgAdr
  };
}

/**
 * =============================================================================
 * HOST ADR TREND & SEASONALITY ANALYSIS
 * =============================================================================
 * 
 * Fetches historical Host ADR by month to calculate:
 * 1. Seasonality Factor: Target month avg / Annual avg
 * 2. Trend: Recent 3 months vs Previous 3 months (is market going up/down?)
 * 3. Volatility: Coefficient of variation (price stability)
 * 
 * Returns Map<key, TrendData> where key = "prop|||room" or "prop"
 */
interface HostAdrTrendData {
  monthlyAvg: Map<number, number>;     // month (1-12) Ã¢â€ â€™ avg ADR for that month
  annualAvg: number;                   // Overall annual average
  recentTrend: number;                 // -1 to +1 (declining to increasing)
  volatility: number;                  // Coefficient of variation
}

async function fetchHostAdrTrend(): Promise<Map<string, HostAdrTrendData>> {
  const monthsBack = 12;
  const dateStart = format(subMonths(new Date(), monthsBack), 'yyyy-MM-dd');
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12

  // Get segments with date info
  const { data: segments, error } = await supabase
    .from('host_supply_segments')
    .select('unified_booking_id, total_amount, nights, date_from, host_property_name, host_room_type')
    .gte('date_from', dateStart)
    .gt('nights', 0);

  if (error || !segments || segments.length === 0) {
    debugLog('[fetchHostAdrTrend] No segments found');
    return new Map();
  }

  // Get OTA property mapping - chunk to avoid URL too long (400 error)
  const unifiedIds = [...new Set(segments.map(s => s.unified_booking_id).filter(Boolean))] as string[];
  const chunkSize = 100;
  const allBookings: { unified_booking_id: string | null; pms_property_name: string | null; room_type: string | null }[] = [];

  for (let i = 0; i < unifiedIds.length; i += chunkSize) {
    const chunk = unifiedIds.slice(i, i + chunkSize);
    const { data: chunkData } = await supabase
      .from('bookings_mirror')
      .select('unified_booking_id, pms_property_name, room_type')
      .in('unified_booking_id', chunk);
    if (chunkData) allBookings.push(...chunkData);
  }

  const bookingMap = new Map<string, { prop: string; room: string }>();
  allBookings.forEach(b => {
    if (b.unified_booking_id) {
      bookingMap.set(b.unified_booking_id, {
        prop: b.pms_property_name || '',
        room: b.room_type || UNMAPPED_LABEL
      });
    }
  });

  // Build monthly ADR data by property + room
  // Structure: key Ã¢â€ â€™ month Ã¢â€ â€™ array of ADRs
  const monthlyData = new Map<string, Map<number, number[]>>();

  segments.forEach(seg => {
    if (!seg.date_from || !seg.nights || seg.nights <= 0) return;

    const adr = (seg.total_amount || 0) / seg.nights;
    if (adr <= 0) return;

    const segMonth = parseInt(seg.date_from.substring(5, 7), 10); // 1-12
    const segYear = parseInt(seg.date_from.substring(0, 4), 10);

    // Determine property key
    let propKey: string;
    let propRoomKey: string;

    if (seg.unified_booking_id && bookingMap.has(seg.unified_booking_id)) {
      const { prop, room } = bookingMap.get(seg.unified_booking_id)!;
      propKey = prop;
      propRoomKey = `${prop}|||${room}`;
    } else if (seg.host_property_name) {
      propKey = seg.host_property_name;
      propRoomKey = `${seg.host_property_name}|||${seg.host_room_type || UNMAPPED_LABEL}`;
    } else {
      return;
    }

    // Add to both property-level and property+room level
    [propKey, propRoomKey].forEach(key => {
      if (!monthlyData.has(key)) {
        monthlyData.set(key, new Map());
      }
      const monthMap = monthlyData.get(key)!;
      if (!monthMap.has(segMonth)) {
        monthMap.set(segMonth, []);
      }
      monthMap.get(segMonth)!.push(adr);
    });
  });

  // Calculate trend data for each key
  const result = new Map<string, HostAdrTrendData>();

  monthlyData.forEach((monthMap, key) => {
    // Calculate monthly averages
    const monthlyAvg = new Map<number, number>();
    const allAdrs: number[] = [];

    monthMap.forEach((adrs, month) => {
      const avg = adrs.reduce((a, b) => a + b, 0) / adrs.length;
      monthlyAvg.set(month, avg);
      allAdrs.push(...adrs);
    });

    if (allAdrs.length < 3) return; // Need minimum data

    // Calculate annual average
    const annualAvg = allAdrs.reduce((a, b) => a + b, 0) / allAdrs.length;

    // Calculate volatility (coefficient of variation)
    const variance = allAdrs.reduce((sum, val) => sum + Math.pow(val - annualAvg, 2), 0) / allAdrs.length;
    const stdDev = Math.sqrt(variance);
    const volatility = annualAvg > 0 ? stdDev / annualAvg : 0;

    // Calculate trend: compare recent 3 months vs previous 3 months
    // Recent = current month, -1, -2
    // Previous = -3, -4, -5
    const getMonthOffset = (offset: number) => {
      let m = currentMonth + offset;
      if (m <= 0) m += 12;
      if (m > 12) m -= 12;
      return m;
    };

    const recentMonths = [0, -1, -2].map(getMonthOffset);
    const previousMonths = [-3, -4, -5].map(getMonthOffset);

    const recentAdrs = recentMonths
      .map(m => monthlyAvg.get(m))
      .filter((v): v is number => v !== undefined);
    const previousAdrs = previousMonths
      .map(m => monthlyAvg.get(m))
      .filter((v): v is number => v !== undefined);

    let recentTrend = 0;
    if (recentAdrs.length > 0 && previousAdrs.length > 0) {
      const recentAvg = recentAdrs.reduce((a, b) => a + b, 0) / recentAdrs.length;
      const previousAvg = previousAdrs.reduce((a, b) => a + b, 0) / previousAdrs.length;

      if (previousAvg > 0) {
        // Trend as percentage change, normalized to -1 to +1
        const pctChange = (recentAvg - previousAvg) / previousAvg;
        // Clamp to -1 to +1 (Ã‚Â±100% change)
        recentTrend = Math.max(-1, Math.min(1, pctChange));
      }
    }

    result.set(key, {
      monthlyAvg,
      annualAvg,
      recentTrend,
      volatility
    });
  });

  // ============================================================
  // CALCULATE MARKET-WIDE TREND (fallback khi property data ÃƒÂ­t)
  // ============================================================
  // Aggregate ALL ADRs across all properties by month
  const marketMonthlyAvg = new Map<number, number>();
  const allMarketAdrs: number[] = [];

  monthlyData.forEach((monthMap) => {
    monthMap.forEach((adrs, month) => {
      if (!marketMonthlyAvg.has(month)) {
        marketMonthlyAvg.set(month, 0);
      }
      // Sum for averaging later
      const currentSum = marketMonthlyAvg.get(month)! * (allMarketAdrs.length > 0 ? 1 : 0);
      const newAdrs = adrs;
      allMarketAdrs.push(...newAdrs);
    });
  });

  // Recalculate market monthly averages properly
  const marketMonthlyData = new Map<number, number[]>();
  monthlyData.forEach((monthMap) => {
    monthMap.forEach((adrs, month) => {
      if (!marketMonthlyData.has(month)) {
        marketMonthlyData.set(month, []);
      }
      marketMonthlyData.get(month)!.push(...adrs);
    });
  });

  marketMonthlyData.forEach((adrs, month) => {
    if (adrs.length > 0) {
      marketMonthlyAvg.set(month, adrs.reduce((a, b) => a + b, 0) / adrs.length);
    }
  });

  const marketAnnualAvg = allMarketAdrs.length > 0
    ? allMarketAdrs.reduce((a, b) => a + b, 0) / allMarketAdrs.length
    : 0;

  // Calculate market-wide trend
  const getMonthOffset = (offset: number) => {
    let m = currentMonth + offset;
    if (m <= 0) m += 12;
    if (m > 12) m -= 12;
    return m;
  };

  const recentMonths = [0, -1, -2].map(getMonthOffset);
  const previousMonths = [-3, -4, -5].map(getMonthOffset);

  const marketRecentAdrs = recentMonths
    .map(m => marketMonthlyAvg.get(m))
    .filter((v): v is number => v !== undefined);
  const marketPreviousAdrs = previousMonths
    .map(m => marketMonthlyAvg.get(m))
    .filter((v): v is number => v !== undefined);

  let marketTrend = 0;
  if (marketRecentAdrs.length > 0 && marketPreviousAdrs.length > 0) {
    const recentAvg = marketRecentAdrs.reduce((a, b) => a + b, 0) / marketRecentAdrs.length;
    const previousAvg = marketPreviousAdrs.reduce((a, b) => a + b, 0) / marketPreviousAdrs.length;
    if (previousAvg > 0) {
      marketTrend = Math.max(-1, Math.min(1, (recentAvg - previousAvg) / previousAvg));
    }
  }

  const marketVolatility = marketAnnualAvg > 0
    ? Math.sqrt(allMarketAdrs.reduce((sum, val) => sum + Math.pow(val - marketAnnualAvg, 2), 0) / allMarketAdrs.length) / marketAnnualAvg
    : 0;

  // Store market-wide trend with special key
  result.set('__MARKET__', {
    monthlyAvg: marketMonthlyAvg,
    annualAvg: marketAnnualAvg,
    recentTrend: marketTrend,
    volatility: marketVolatility
  });

  debugLog(`[fetchHostAdrTrend] Built trend data: ${result.size} keys`);
  debugLog(`[fetchHostAdrTrend] MARKET-WIDE: trend=${(marketTrend * 100).toFixed(1)}%, volatility=${(marketVolatility * 100).toFixed(1)}%, samples=${allMarketAdrs.length}`);
  debugLog(`[fetchHostAdrTrend] Market monthly data:`, [...marketMonthlyAvg.entries()].map(([m, v]) => `M${m}:${Math.round(v / 1000)}k`).join(', '));

  // Sample log
  const sampleKeys = [...result.keys()].filter(k => k !== '__MARKET__').slice(0, 5);
  sampleKeys.forEach(key => {
    const data = result.get(key)!;
    debugLog(`[fetchHostAdrTrend] ${key}: trend=${(data.recentTrend * 100).toFixed(1)}%, volatility=${(data.volatility * 100).toFixed(1)}%, annual=${data.annualAvg.toLocaleString()}Ã„â€˜`);
  });

  return result;
}

/**
 * Get seasonality factor for a target month
 * Factor = target month avg / annual avg
 * - > 1.0 = high season (prices typically higher)
 * - < 1.0 = low season (prices typically lower)
 */
function getSeasonalityFactorForMonth(
  trendData: HostAdrTrendData | undefined,
  targetMonth: number
): number {
  if (!trendData || !trendData.monthlyAvg.has(targetMonth) || trendData.annualAvg <= 0) {
    return 1.0; // Default: no adjustment
  }

  const targetMonthAvg = trendData.monthlyAvg.get(targetMonth)!;
  const factor = targetMonthAvg / trendData.annualAvg;

  // Clamp to reasonable range (0.7 to 1.3 = Ã‚Â±30%)
  return Math.max(0.7, Math.min(1.3, factor));
}

/**
 * =============================================================================
 * COMBINED HOST ADR PREDICTION
 * =============================================================================
 * 
 * IMPROVED FORMULA that combines:
 * 1. Host historical data (ADR, trend, seasonality)
 * 2. OTA demand data (booking volume, ADR trend by month)
 * 
 * KEY INSIGHT: High OTA demand Ã¢â€ â€™ Hosts will raise prices
 * 
 * Formula:
 *   adjustedADR = rawADR 
 *               Ãƒâ€” hostSeasonalFactor (from host history)
 *               Ãƒâ€” (1 + combinedTrend Ãƒâ€” 0.5)
 *               Ãƒâ€” otaDemandFactor (high demand Ã¢â€ â€™ +5-10%)
 * 
 * Where:
 *   combinedTrend = (hostTrend Ãƒâ€” 0.4) + (otaTrend Ãƒâ€” 0.6)
 *   (OTA trend weighted higher - more data, reflects market)
 *   
 *   otaDemandFactor = 1.0 + (demandIndex - 1) Ãƒâ€” 0.1
 *   (If demand 1.5x avg Ã¢â€ â€™ factor = 1.05, i.e., +5%)
 */
function calculateAdjustedHostAdr(
  rawHostAdr: number,
  hostTrendData: HostAdrTrendData | undefined,
  otaDemandData: { byMonth: Map<number, OtaDemandData>; trend: number } | null,
  targetMonth: number,
  velocityRatio: number | null = null,
  volumeRatio: number | null = null,
  actualAdrs: number[] | null = null  // NEW: Actual ADR values for percentile-based range
): {
  adjusted: number;
  adjustedLow: number;     // P25 or pessimistic estimate
  adjustedHigh: number;    // P75 or optimistic estimate
  confidence: 'high' | 'medium' | 'low';
  seasonalFactor: number;
  trend: number;
  hostTrend: number;
  otaTrend: number;
  otaDemandIndex: number;
  volatility: number;
  appliedTrendCap: number;
  velocityAdjustment: number;
  volumeAdjustment: number;
} {

  if (rawHostAdr <= 0) {

    return {

      adjusted: rawHostAdr,

      adjustedLow: rawHostAdr,

      adjustedHigh: rawHostAdr,

      confidence: 'low',

      seasonalFactor: 1.0,

      trend: 0,

      hostTrend: 0,

      otaTrend: 0,

      otaDemandIndex: 1.0,

      volatility: 0,

      appliedTrendCap: 0,

      velocityAdjustment: 0,

      volumeAdjustment: 0

    };

  }

  // ============================================================
  // STEP 1: CLEAN HISTORICAL DATA & CALCULATE FLOOR/CEILING
  // ============================================================
  // Business Rule: Historical min = FLOOR (Host không bao giờ giảm dưới)
  //                Historical max = CEILING (có thể nhưng hiếm khi đạt)
  // 
  // FREQUENCY-AWARE: Giá xuất hiện nhiều lần = more weight
  // Ví dụ: [1.3M×3, 1.35M×5, 2.3M×2] → base nên gần 1.35M, không phải (1.3+2.3)/2

  // Với ít data, dùng range hẹp hơn (conservative)
  const sampleSize = actualAdrs?.length || 0;
  const defaultSpread = sampleSize < 3 ? 0.05 : 0.10; // 5% spread if < 3 samples, else 10%

  let floor = rawHostAdr * (1 - defaultSpread);   // Default floor
  let ceiling = rawHostAdr * (1 + defaultSpread); // Default ceiling  
  let baseAdr = rawHostAdr;        // Default base = raw
  let p25 = rawHostAdr * 0.97;     // Default P25
  let p75 = rawHostAdr * 1.03;     // Default P75

  if (actualAdrs && actualAdrs.length >= 3) {
    const sorted = [...actualAdrs].sort((a, b) => a - b);
    const n = sorted.length;
    const medianAdr = sorted[Math.floor(n / 2)];

    // Filter outliers: < 70% median (downgrade, sai) or > 150% median (lỗi)
    const cleanedAdrs = sorted.filter(adr =>
      adr >= medianAdr * 0.70 && adr <= medianAdr * 1.50
    );

    // DEBUG: Log actual ADR values
    console.log(`[DEBUG RANGE] raw=${rawHostAdr.toLocaleString()}, n=${n}, median=${medianAdr.toLocaleString()}`);
    console.log(`[DEBUG RANGE] sorted=[${sorted.slice(0, 10).map(a => a.toLocaleString()).join(', ')}${n > 10 ? '...' : ''}]`);
    console.log(`[DEBUG RANGE] cleaned=[${cleanedAdrs.map(a => a.toLocaleString()).join(', ')}]`);

    if (cleanedAdrs.length >= 2) {
      const cn = cleanedAdrs.length;

      // FLOOR = min of cleaned data (giá sàn thật - Host không bao giờ dưới)
      floor = cleanedAdrs[0];

      // CEILING = P90 of cleaned data (95% probability)
      // NOT max - because max might be rare outlier
      const p90Index = Math.floor(cn * 0.90);
      ceiling = cleanedAdrs[Math.min(p90Index, cn - 1)];

      // If actual max is much higher than P90, note it but don't use for ceiling
      const actualMax = cleanedAdrs[cn - 1];
      if (actualMax > ceiling * 1.15) {
        // Max is 15%+ higher than P90 → rare case, keep ceiling at P90
        // ceiling stays at P90
      } else {
        // Max is close to P90 → use max as ceiling
        ceiling = actualMax;
      }

      // P25 and P75 for "typical" range
      const p25Index = Math.floor(cn * 0.25);
      const p75Index = Math.floor(cn * 0.75);
      p25 = cleanedAdrs[p25Index] || cleanedAdrs[0];
      p75 = cleanedAdrs[Math.min(p75Index, cn - 1)];

      // BASE = median of cleaned data (giá base - most likely)
      baseAdr = cleanedAdrs[Math.floor(cn / 2)];

      console.log(`[DEBUG RANGE] floor=${floor.toLocaleString()}, ceiling=${ceiling.toLocaleString()}, base=${baseAdr.toLocaleString()}`);

    }

  }

  // ============================================================

  // STEP 2: COLLECT DEMAND SIGNALS

  // ============================================================

  const hostSeasonalFactor = getSeasonalityFactorForMonth(hostTrendData, targetMonth);

  const hostTrend = hostTrendData?.recentTrend ?? 0;

  const hostVolatility = hostTrendData?.volatility ?? 0;

  const otaTrend = otaDemandData?.trend ?? 0;

  const otaDemandForMonth = otaDemandData?.byMonth.get(targetMonth);

  const otaDemandIndex = otaDemandForMonth?.demandIndex ?? 1.0;

  // ============================================================

  // STEP 3: CALCULATE CONFIDENCE

  // ============================================================

  let confidence: 'high' | 'medium' | 'low';

  let confidenceScore = 0;

  // Volatility scoring (0-40 points)

  if (hostVolatility < 0.15) confidenceScore += 40;

  else if (hostVolatility < 0.30) confidenceScore += 25;

  else if (hostVolatility < 0.45) confidenceScore += 10;

  // Data availability scoring (0-30 points)

  if (actualAdrs && actualAdrs.length >= 5) confidenceScore += 30;

  else if (actualAdrs && actualAdrs.length >= 3) confidenceScore += 20;

  else if (hostTrend !== 0) confidenceScore += 10;

  // Demand data scoring (0-30 points)

  if (otaDemandForMonth && otaDemandForMonth.bookingCount > 30) confidenceScore += 30;

  else if (otaDemandForMonth && otaDemandForMonth.bookingCount > 15) confidenceScore += 20;

  else if (otaDemandForMonth && otaDemandForMonth.bookingCount > 5) confidenceScore += 10;

  if (confidenceScore >= 70) confidence = 'high';

  else if (confidenceScore >= 40) confidence = 'medium';

  else confidence = 'low';

  // ============================================================

  // STEP 4: CALCULATE DEMAND PRESSURE (ASYMMETRIC - CHI TANG)

  // ============================================================

  // Key insight: Host chi TANG gia khi demand cao, KHONG GIAM duoi floor

  // 

  // Demand signals:

  // - Seasonal > 1 = high season -> Host tang gia

  // - Velocity > 1 = booking nhanh -> Host tang gia (full lich)

  // - Volume > 1 = booking nhieu -> Host tang gia

  // - OTA demand > 1 = market hot -> Host tang gia

  // Seasonal pressure: chi positive (mua cao tang, mua thap KHONG giam)

  const seasonalPressure = Math.max(0, hostSeasonalFactor - 1.0);

  // Velocity pressure: chi positive

  let velocityPressure = 0;

  if (velocityRatio !== null && velocityRatio > 1.0) {

    velocityPressure = (velocityRatio - 1.0) * 0.15; // 15% weight

  }

  // Volume pressure: chi positive

  let volumePressure = 0;

  if (volumeRatio !== null && volumeRatio > 1.0) {

    volumePressure = (volumeRatio - 1.0) * 0.10; // 10% weight

  }

  // OTA demand pressure: chi positive

  const demandPressure = Math.max(0, (otaDemandIndex - 1.0) * 0.10);

  // Host trend pressure: can be negative but capped

  const trendPressure = Math.max(-0.05, hostTrend * 0.3); // Chi giam toi da 5%

  // ============================================================

  // STEP 5: CALCULATE TOTAL UPWARD ADJUSTMENT

  // ============================================================

  // Total pressure = sum of all positive pressures + trend
  const totalPressure = seasonalPressure + velocityPressure + volumePressure + demandPressure + trendPressure;

  // Confidence-based cap - với ít data thì cap thấp hơn
  const maxAdjustment = confidence === 'high' ? 0.15 : confidence === 'medium' ? 0.10 : 0.05;
  const cappedPressure = Math.min(maxAdjustment, Math.max(-0.05, totalPressure));

  // DEBUG: Log adjustment calculation
  if (actualAdrs && actualAdrs.length <= 3) {
    console.log(`[DEBUG ADJ] sample=${actualAdrs.length}, seasonal=${seasonalPressure.toFixed(3)}, velocity=${velocityPressure.toFixed(3)}, demand=${demandPressure.toFixed(3)}, total=${totalPressure.toFixed(3)}, capped=${cappedPressure.toFixed(3)}`);
  }

  // ============================================================
  // STEP 6: CALCULATE PREDICTED ADR
  // ============================================================
  // Predicted = BASE × (1 + pressure), nhưng KHÔNG BAO GIỜ < FLOOR
  const rawPredicted = baseAdr * (1 + cappedPressure);
  const adjusted = Math.max(floor, rawPredicted);

  // ============================================================
  // STEP 7: CALCULATE RANGE (HISTORICAL-BASED)
  // ============================================================
  // Range dựa trên DỮ LIỆU LỊCH SỬ thật, không phải predicted
  // LOW = floor (historical min) - "Giá thấp nhất từng có"
  // HIGH = ceiling (P90/max) - "Giá cao nhất hợp lý"
  // 
  // Đây là range mà Host ADR có thể rơi vào dựa trên lịch sử

  // Range = historical floor to ceiling (raw data)
  // Chỉ adjust nhẹ theo demand pressure
  const demandAdjustment = Math.max(0, cappedPressure) * 0.5; // 50% of pressure

  // LOW = floor (không adjust xuống, chỉ có thể lên)
  let adjustedLow = floor * (1 + demandAdjustment * 0.3);

  // HIGH = ceiling (adjust lên theo demand)  
  let adjustedHigh = ceiling * (1 + demandAdjustment);

  // Ensure minimum spread of 8%
  if (adjustedHigh <= adjustedLow * 1.08) {
    adjustedHigh = adjustedLow * 1.12;
  }

  // Ensure predicted is within range
  const finalAdjusted = Math.max(adjustedLow, Math.min(adjustedHigh, adjusted));

  return {
    adjusted: finalAdjusted,
    adjustedLow,
    adjustedHigh,
    confidence,
    seasonalFactor: hostSeasonalFactor,
    trend: hostTrend,
    hostTrend,
    otaTrend,
    otaDemandIndex,
    volatility: hostVolatility,

    appliedTrendCap: maxAdjustment,

    velocityAdjustment: velocityPressure,

    volumeAdjustment: volumePressure

  };

}

/**
 * Fetch OTA property Ã¢â€ â€™ district mapping for area comparison
 * 
 * MAPPING CHAIN:
 * 1. OTA booking (bookings_mirror.pms_property_name) 
 * 2. Ã¢â€ â€™ unified_booking_id 
 * 3. Ã¢â€ â€™ host_supply_segments.host_property_name
 * 4. Ã¢â€ â€™ property_catalog.district
 * 
 * Returns Map<OTA property name, district>
 */
async function fetchOtaPropertyToDistrict(): Promise<Map<string, string>> {
  // Step 1: Get Host property Ã¢â€ â€™ district mapping from property_catalog
  const { data: catalogData, error: catalogError } = await supabase
    .from('property_catalog')
    .select('property_name, district')
    .eq('is_active', true)
    .not('district', 'is', null);

  if (catalogError) {
    console.error('[fetchOtaPropertyToDistrict] Catalog error:', catalogError);
    return new Map();
  }

  // Build Host property name Ã¢â€ â€™ district
  const hostPropertyToDistrict = new Map<string, string>();
  catalogData?.forEach(p => {
    if (p.property_name && p.district) {
      hostPropertyToDistrict.set(p.property_name, p.district);
      hostPropertyToDistrict.set(p.property_name.toLowerCase().trim(), p.district);
    }
  });

  debugLog(`[fetchOtaPropertyToDistrict] Host property Ã¢â€ â€™ district: ${hostPropertyToDistrict.size} entries`);

  // Step 2: Get unified_booking_id Ã¢â€ â€™ host_property_name from segments
  const { data: segmentData, error: segmentError } = await supabase
    .from('host_supply_segments')
    .select('unified_booking_id, host_property_name')
    .not('unified_booking_id', 'is', null)
    .not('host_property_name', 'is', null)
    .limit(10000);

  if (segmentError) {
    console.error('[fetchOtaPropertyToDistrict] Segment error:', segmentError);
    return new Map();
  }

  // Build unified_booking_id Ã¢â€ â€™ host_property_name (use first match)
  const bookingToHostProperty = new Map<string, string>();
  segmentData?.forEach(s => {
    if (s.unified_booking_id && s.host_property_name && !bookingToHostProperty.has(s.unified_booking_id)) {
      bookingToHostProperty.set(s.unified_booking_id, s.host_property_name);
    }
  });

  debugLog(`[fetchOtaPropertyToDistrict] Booking Ã¢â€ â€™ Host property: ${bookingToHostProperty.size} entries`);

  // Step 3: Get OTA property Ã¢â€ â€™ unified_booking_id from bookings_mirror
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings_mirror')
    .select('pms_property_name, unified_booking_id')
    .not('unified_booking_id', 'is', null)
    .not('pms_property_name', 'is', null)
    .limit(10000);

  if (bookingError) {
    console.error('[fetchOtaPropertyToDistrict] Booking error:', bookingError);
    return new Map();
  }

  // Step 4: Chain: OTA property Ã¢â€ â€™ unified_booking_id Ã¢â€ â€™ host_property Ã¢â€ â€™ district
  const otaPropertyToDistrict = new Map<string, string>();

  bookingData?.forEach(b => {
    if (!b.pms_property_name || !b.unified_booking_id) return;

    // Already mapped?
    if (otaPropertyToDistrict.has(b.pms_property_name)) return;

    // Get host property name via unified_booking_id
    const hostPropName = bookingToHostProperty.get(b.unified_booking_id);
    if (!hostPropName) return;

    // Get district via host property name
    let district = hostPropertyToDistrict.get(hostPropName);
    if (!district) {
      // Try normalized match
      district = hostPropertyToDistrict.get(hostPropName.toLowerCase().trim());
    }

    if (district) {
      otaPropertyToDistrict.set(b.pms_property_name, district);
      otaPropertyToDistrict.set(b.pms_property_name.toLowerCase().trim(), district);
    }
  });

  debugLog(`[fetchOtaPropertyToDistrict] OTA property Ã¢â€ â€™ district: ${otaPropertyToDistrict.size} entries`);
  // Debug: Log mappings
  const samples = [...otaPropertyToDistrict.entries()].slice(0, 10);
  debugLog('[fetchOtaPropertyToDistrict] Sample OTAÃ¢â€ â€™District mappings:', samples);

  return otaPropertyToDistrict;
}

/**
 * Helper to find district for a property name with fallback matching
 */
function findDistrictForProperty(
  propertyName: string,
  propertyToDistrict: Map<string, string>
): string | null {
  // Try exact match
  if (propertyToDistrict.has(propertyName)) {
    return propertyToDistrict.get(propertyName)!;
  }

  // Try normalized match
  const normalized = propertyName.toLowerCase().trim();
  if (propertyToDistrict.has(normalized)) {
    return propertyToDistrict.get(normalized)!;
  }

  // Try partial match (contains)
  for (const [key, district] of propertyToDistrict.entries()) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return district;
    }
  }

  return null;
}

/**
 * Calculate area average velocity for comparison
 * Returns Map<district, averageVelocityRatio>
 */
async function fetchAreaVelocityAverage(
  velocityBaseline: Map<string, { count: number; sampleSize: number }>,
  propertyToDistrict: Map<string, string>
): Promise<Map<string, number>> {
  // Group velocities by district
  const districtVelocities = new Map<string, number[]>();

  velocityBaseline.forEach((entry, key) => {
    // Key format: "property|||room" or just "property"
    const property = key.split('|||')[0];
    const district = propertyToDistrict.get(property);

    if (district && entry.count > 0) {
      if (!districtVelocities.has(district)) {
        districtVelocities.set(district, []);
      }
      districtVelocities.get(district)!.push(entry.count);
    }
  });

  // Calculate average per district
  const result = new Map<string, number>();
  districtVelocities.forEach((velocities, district) => {
    const avg = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    result.set(district, avg);
  });

  debugLog(`[fetchAreaVelocityAverage] ${result.size} districts with velocity data`);
  return result;
}

/**
 * Fetch fulfillment rate by OTA property + room type
 * 
 * SIMPLE LOGIC (same pattern as Host ADR):
 * 1. Booked nights: tÃ¡Â»Â« booking_room_lines_mirror, group by OTA property/room
 * 2. Executed nights: tÃ¡Â»Â« host_supply_segments JOIN bookings_mirror via unified_booking_id
 *    Ã¢â€ â€™ Group by OTA property/room (not host property!)
 * 3. Fulfillment rate = executed / booked
 */
async function fetchFulfillmentRateData(): Promise<Map<string, { executed: number; booked: number }>> {
  const dateStart = format(subMonths(new Date(), 6), 'yyyy-MM-dd');
  const dateEnd = format(new Date(), 'yyyy-MM-dd');

  // 1. Get all bookings with OTA property/room info
  const { data: bookedLines } = await supabase
    .from('booking_room_lines_mirror')
    .select('pms_booking_id, room_type, nights')
    .gte('check_in_date', dateStart)
    .lte('check_in_date', dateEnd);

  if (!bookedLines || bookedLines.length === 0) {
    debugLog('[fetchFulfillmentRateData] No booked lines found');
    return new Map();
  }

  // Get booking metadata (OTA property name)
  const pmsIds = [...new Set(bookedLines.map(b => b.pms_booking_id))];
  const bookingMeta = await fetchBookingMetadata(pmsIds);

  // 2. Get executed segments with unified_booking_id
  const { data: executedSegments } = await supabase
    .from('host_supply_segments')
    .select('unified_booking_id, nights')
    .gte('date_from', dateStart)
    .lte('date_from', dateEnd)
    .not('actual_check_in_at', 'is', null)
    .not('unified_booking_id', 'is', null);

  // Build unified_booking_id Ã¢â€ â€™ executed nights
  const executedNightsByBooking = new Map<string, number>();
  executedSegments?.forEach(seg => {
    if (!seg.unified_booking_id) return;
    const current = executedNightsByBooking.get(seg.unified_booking_id) || 0;
    executedNightsByBooking.set(seg.unified_booking_id, current + (seg.nights || 0));
  });

  debugLog(`[fetchFulfillmentRateData] ${executedNightsByBooking.size} bookings have executed segments`);

  // 3. Aggregate by OTA property + room type
  const result = new Map<string, { executed: number; booked: number }>();

  bookedLines.forEach(line => {
    const meta = bookingMeta.get(line.pms_booking_id);
    if (!meta?.pms_property_name) return;

    const otaProp = meta.pms_property_name;
    const otaRoom = line.room_type || UNMAPPED_LABEL;
    const key = `${otaProp}|||${otaRoom}`;

    const existing = result.get(key) || { executed: 0, booked: 0 };
    existing.booked += line.nights || 0;

    // Check if this booking was executed
    if (meta.unified_booking_id && executedNightsByBooking.has(meta.unified_booking_id)) {
      // Use segment nights (actual executed) - but attribute to OTA grouping
      existing.executed += executedNightsByBooking.get(meta.unified_booking_id)!;
      // Remove from map to avoid double counting if booking has multiple lines
      executedNightsByBooking.delete(meta.unified_booking_id);
    }

    result.set(key, existing);
  });

  debugLog(`[fetchFulfillmentRateData] Built fulfillment data: ${result.size} keys`);

  return result;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/** Period granularity options */
export type PeriodGranularity = 'month' | 'week' | 'day';

interface UsePriceSpreadForecastOptions {
  dateStart: string;  // Future start date
  dateEnd: string;    // Future end date
  selectedPropertyIds?: string[];     // Filter by OTA property ID
  selectedPropertyNames?: string[];   // Filter by OTA property name
  selectedRoomTypes?: string[];       // Filter by OTA room type
  selectedChannels?: string[];        // Filter by OTA source (AGODA, Booking.com, etc.)
  groupBy: 'property' | 'roomType' | 'propertyRoomType';
  periodGranularity?: PeriodGranularity;  // NEW: 'month' (default) or 'week'
}

export function usePriceSpreadForecast(options: UsePriceSpreadForecastOptions) {
  return useQuery({
    queryKey: ['price-spread-forecast', options],
    queryFn: async () => {
      const startTime = performance.now();
      debugLog(`[usePriceSpreadForecast] START: ${options.dateStart} to ${options.dateEnd}`);

      // 1. Fetch future bookings (must be first - others depend on it)
      const futureBookings = await fetchFutureBookings(options.dateStart, options.dateEnd);
      console.log(`[usePriceSpreadForecast] futureBookings count: ${futureBookings.length}`);
      if (futureBookings.length === 0) {
        console.log('[usePriceSpreadForecast] NO FUTURE BOOKINGS - returning empty');
        return { rows: [], kpi: null };
      }

      // 2. Get booking metadata (depends on futureBookings)
      const pmsIds = [...new Set(futureBookings.map(b => b.pms_booking_id))];
      const bookingMeta = await fetchBookingMetadata(pmsIds);

      // ============================================================
      // PARALLEL FETCH: Independent queries run simultaneously
      // ============================================================
      const [
        roomTypeMap,
        fulfillmentData,
        hostAdrRefMap,
        hostAdrTrendMap,
        otaDemandData,
        historicalPeakMap,
        propertyToDistrict,
        hostSegmentMetricsMap,
        otaBookingTimingMap
      ] = await Promise.all([
        fetchRoomTypeMapping(),
        fetchFulfillmentRateData(),
        fetchHostAdrByOtaGroup(),
        fetchHostAdrTrend(),
        fetchOtaDemandSeasonality(),
        fetchHistoricalPeak(),
        fetchOtaPropertyToDistrict(),
        fetchHostSegmentMetrics(),         // NEW: Min/Max/Volume by dayType
        fetchOtaBookingTimingMetrics()     // NEW: LastMinute vs EarlyBird
      ]);

      const fetchTime = performance.now() - startTime;
      debugLog(`[usePriceSpreadForecast] Data fetch completed in ${fetchTime.toFixed(0)}ms`);

      // NOTE: OTA ADR now calculated STRICTLY from each month's own bookings
      // No more otaAdrRefMap pool - see agg.otaAmounts in row building section

      // 4.7 Pre-compute room lines count per booking (for fallback when line.amount is null)
      // When line.amount is null, we can estimate: booking.total_amount_net / linesCount
      const roomLinesPerBooking = new Map<string, number>();
      futureBookings.forEach(line => {
        const current = roomLinesPerBooking.get(line.pms_booking_id) || 0;
        roomLinesPerBooking.set(line.pms_booking_id, current + 1);
      });
      debugLog(`[usePriceSpreadForecast] Pre-computed room lines count for ${roomLinesPerBooking.size} bookings`);

      // 5. Aggregate future bookings by group
      const today = format(new Date(), 'yyyy-MM-dd');
      const aggregated = new Map<string, {
        propertyId: string;
        propertyName: string;
        roomType: string;
        periodKey: string;
        periodLabel: string;
        dayType: 'WEEKDAY' | 'WEEKEND'; // NEW: Separate rows for weekday/weekend
        bookedNights: number;
        bookingCount: number;
        otaAmounts: number[];
        channels: Map<string, number>;
        weekdayNights: number;
        weekendNights: number;
        sundayNights: number;
        recentBookingCount: number; // Bookings created in last 14 days (velocity)
        leadTimeDays: number[];
      }>();

      // Collect all filter options (before filtering is applied)
      const allPropertyIds = new Map<string, string>(); // id Ã¢â€ â€™ name
      const allPropertyNames = new Set<string>();
      const allRoomTypes = new Set<string>();
      const allChannels = new Set<string>();
      const allMonths = new Set<string>();

      futureBookings.forEach(line => {
        const meta = bookingMeta.get(line.pms_booking_id);
        if (!meta || meta.booking_status === 'CANCELLED') return;

        // Use pms_property_name from SOT (bookings_mirror)
        const propId = meta.pms_property_id || '';
        const propName = meta.pms_property_name || UNMAPPED_LABEL;
        // room_type: booking_room_lines > rate_plan > bookings_mirror.room_type (with UUID resolution)
        const roomType = getEffectiveRoomType(line.room_type, line.rate_plan, meta.room_type, roomTypeMap);

        // Period key based on granularity (month or week)
        const granularity = options.periodGranularity || 'month';
        const { periodKey, periodLabel } = getPeriodKeyAndLabel(line.check_in_date, granularity);
        const month = line.check_in_date.substring(0, 7); // Still need month for filters

        // Collect ALL filter options (before filtering - for dropdown population)
        if (propId) allPropertyIds.set(propId, propName);
        if (propName) allPropertyNames.add(propName);
        if (roomType) allRoomTypes.add(roomType);
        if (meta.ota_source) allChannels.add(meta.ota_source);
        if (month) allMonths.add(month);

        // Apply filters
        if (options.selectedPropertyIds?.length && !options.selectedPropertyIds.includes(propId)) return;
        if (options.selectedPropertyNames?.length && !options.selectedPropertyNames.includes(propName)) return;
        if (options.selectedRoomTypes?.length && !options.selectedRoomTypes.includes(roomType)) return;
        if (options.selectedChannels?.length && !options.selectedChannels.includes(meta.ota_source || '')) return;

        // Determine day type for this booking line
        const lineDayType = getDayType(line.check_in_date);
        // Map to simplified day type: weekday or weekend (include sunday in weekend)
        const simpleDayType: 'WEEKDAY' | 'WEEKEND' = lineDayType === 'weekday' ? 'WEEKDAY' : 'WEEKEND';

        // Group key - now includes day type for separate weekday/weekend rows
        // Format: property|||roomType|||periodKey|||dayType
        let groupKey: string;
        switch (options.groupBy) {
          case 'property':
            groupKey = propName;
            break;
          case 'roomType':
            groupKey = roomType;
            break;
          case 'propertyRoomType':
          default:
            groupKey = `${propName}|||${roomType}`;
        }
        // Add period AND day type to group key - this creates separate rows for weekday vs weekend
        groupKey = `${groupKey}|||${periodKey}|||${simpleDayType}`;

        if (!aggregated.has(groupKey)) {
          aggregated.set(groupKey, {
            propertyId: propId,
            propertyName: propName,
            roomType: roomType,
            periodKey: periodKey,
            periodLabel: periodLabel,
            dayType: simpleDayType, // NEW: Track day type per aggregate
            bookedNights: 0,
            bookingCount: 0,
            otaAmounts: [],
            channels: new Map(),
            weekdayNights: 0,
            weekendNights: 0,
            sundayNights: 0,
            recentBookingCount: 0,
            leadTimeDays: [],
          });
        }

        const agg = aggregated.get(groupKey)!;
        const nights = line.nights || 1;
        agg.bookedNights += nights;
        agg.bookingCount++;

        // OTA ADR: Use amount FROM EACH ROOM LINE (not booking total!)
        // booking_room_lines_mirror.amount = revenue per room line
        // bookings_mirror.total_amount_net = TOTAL for entire booking (multiple rooms)
        // 
        // CORRECT: line.amount / line.nights (per room line)
        // WRONG:   meta.total_amount_net / meta.nights (entire booking - causes inflated ADR)
        //
        // Payment type handling:
        // - OTA_COLLECT: line.amount is already NET
        // - HOTEL_COLLECT: line.amount is GROSS, need to subtract commission
        //
        // FALLBACK: When line.amount is null, estimate from booking total
        // IMPORTANT: Must divide by BOTH linesCount AND rooms_count for multi-room bookings
        let effectiveLineAmount = line.amount;
        let usedFallback = false;

        if (effectiveLineAmount === null || effectiveLineAmount === 0) {
          // Fallback: estimate from booking total divided by number of room lines
          // Use MAX of (linesCount, rooms_count) to ensure we don't over-estimate
          // For multi-room: booking with 2 rooms might have 1 or 2 lines
          // - 1 line: amount = total / rooms_count
          // - 2 lines: amount = total / linesCount
          const linesCount = roomLinesPerBooking.get(line.pms_booking_id) || 1;
          const roomsCount = meta.rooms_count || 1;
          const divisor = Math.max(linesCount, roomsCount);
          const bookingTotal = meta.total_amount_net || 0;
          if (bookingTotal > 0 && divisor > 0) {
            effectiveLineAmount = bookingTotal / divisor;
            usedFallback = true;
          }
        }

        const lineNetAmount = getOtaNetRevenue(effectiveLineAmount, meta.payment_type, meta.commission_rate);
        const lineAdrPerNight = (lineNetAmount > 0 && nights > 0)
          ? lineNetAmount / nights
          : null;

        // Debug: Log EVERY booking line for specific room types
        const isDebugTarget = roomType.includes('2 PhÃƒÂ²ng ngÃ¡Â»Â§') && propName.includes('Vinhomes Central Park') && month === '2026-04';
        if (isDebugTarget) {
          debugLog(
            `[DEBUG OTA ADR] bookingId=${line.pms_booking_id} | lineIdx=${line.line_index} | ` +
            `channel=${meta.ota_source} | ` +
            `checkIn=${line.check_in_date} | ` +
            `LINE amount=${(line.amount || 0).toLocaleString()}Ã„â€˜${usedFallback ? ' (FALLBACK)' : ''} | ` +
            `effectiveAmount=${(effectiveLineAmount || 0).toLocaleString()}Ã„â€˜ | ` +
            `LINE nights=${nights} | ` +
            `LINE ADR/night=${lineAdrPerNight?.toLocaleString() || 'N/A'}Ã„â€˜ | ` +
            `(OLD: total_amount_net=${(meta.total_amount_net || 0).toLocaleString()}Ã„â€˜)`
          );
        }

        // Only add ADR if we have valid line data
        if (lineAdrPerNight !== null && lineAdrPerNight > 0) {
          agg.otaAmounts.push(lineAdrPerNight);
        }

        // Channel tracking
        const channel = meta.ota_source || UNMAPPED_LABEL;
        agg.channels.set(channel, (agg.channels.get(channel) || 0) + nights);

        // Day type
        const dayType = getDayType(line.check_in_date);
        if (dayType === 'weekday') agg.weekdayNights += nights;
        else if (dayType === 'weekend') agg.weekendNights += nights;
        else agg.sundayNights += nights;

        // Velocity: count bookings created in last 14 days
        const velocityCutoff = format(subDays(new Date(), FORECAST_CONFIG.VELOCITY_REF_DAYS), 'yyyy-MM-dd');
        if (line.created_at && line.created_at >= velocityCutoff) {
          agg.recentBookingCount++;
        }

        // Lead time
        const leadTime = differenceInDays(parseISO(line.check_in_date), new Date());
        agg.leadTimeDays.push(leadTime);
      });

      // 7. Calculate baseline velocity from historical bookings
      // Simple: count historical bookings by OTA property + room type
      const velocityBaseline = await fetchVelocityBaseline();
      const allBaselineRates = [...velocityBaseline.values()].map(v => v.count);
      const overallBaselineVelocity = median(allBaselineRates) || 0.5;

      debugLog(`[usePriceSpreadForecast] velocityBaseline has ${velocityBaseline.size} keys, overallBaseline=${overallBaselineVelocity.toFixed(4)}`);

      // 7b. Fetch volume baseline for volume score calculation
      const volumeBaseline = await fetchVolumeBaseline();
      debugLog(`[usePriceSpreadForecast] volumeBaseline has ${volumeBaseline.size} keys`);

      // 8. Build forecast rows
      const rows: ForecastRow[] = [];
      const missingHostAdrProperties = new Set<string>(); // Track properties without Host ADR for debugging

      console.log(`[usePriceSpreadForecast] aggregated.size = ${aggregated.size}, starting row building...`);

      for (const [groupKey, agg] of aggregated) {
        try {
          // Day type is now directly from aggregate (no need to calculate mix)
          // agg.dayType is 'WEEKDAY' or 'WEEKEND' - already separated at aggregation time
          const dayTypeMix: DayTypeMix = agg.dayType; // Direct assignment
          const dominantDayType: 'weekday' | 'weekend' = agg.dayType === 'WEEKDAY' ? 'weekday' : 'weekend';

          // Normalize property and room names for key lookup (fix double-space issues)
          const normalizedPropName = normalizeKeyString(agg.propertyName);
          const normalizedRoomType = normalizeKeyString(agg.roomType);

          // Get fulfillment rate
          const fulfillmentKey = `${normalizedPropName}|||${normalizedRoomType}`;
          const fulfillmentEntry = fulfillmentData.get(fulfillmentKey);
          let fulfillmentRate: number = FORECAST_CONFIG.DEFAULT_FULFILLMENT_RATE;
          let hasFulfillmentData = false;
          if (fulfillmentEntry && fulfillmentEntry.booked > 0) {
            fulfillmentRate = Math.min(1, fulfillmentEntry.executed / fulfillmentEntry.booked);
            hasFulfillmentData = true;
          }

          const expectedExecutedNights = agg.bookedNights * fulfillmentRate;

          // ============================================================
          // Get Host ADR reference with FALLBACK LADDER
          // Priority: EXACT+SEASON Ã¢â€ â€™ EXACT Ã¢â€ â€™ PROP_BED+SEASON Ã¢â€ â€™ PROP_BED Ã¢â€ â€™ PROP_ALL+SEASON Ã¢â€ â€™ PROP_ALL
          // ============================================================
          let hostAdrRef: number | null = null;
          let hostAdrRefSample = 0;
          let hostAdrRefSource: ForecastRow['hostAdrRefSource'] = 'none';
          let hostAdrRefVariance: number | null = null;
          let foundHostAdrs: number[] | null = null;

          // Extract bedroom count for PROP_BED fallback
          const otaBedroomCount = extractBedroomCount(agg.roomType);

          // Extract target month from periodKey for SEASON-AWARE lookup
          let targetMonth: number;
          if (agg.periodKey.includes('W')) {
            // Week format: approximate from week number
            const weekNum = parseInt(agg.periodKey.split('W')[1], 10);
            targetMonth = Math.ceil(weekNum / 4.3);
          } else if (agg.periodKey.length === 10) {
            targetMonth = parseInt(agg.periodKey.substring(5, 7), 10);
          } else {
            targetMonth = parseInt(agg.periodKey.substring(5, 7), 10);
          }

          // Get season type for this target month
          const targetSeason = getSeasonType(targetMonth);

          // Build COMPREHENSIVE fallback ladder with prefixed keys
          // SEASON-AWARE: Try season-specific keys FIRST, then fallback to all-season
          // Each level has its own min_sample requirement from config
          const hostRefKeys: Array<{ key: string; source: ForecastRow['hostAdrRefSource']; minSample: number }> = [];

          // ============================================================
          // SEASON-AWARE FALLBACK LADDER
          // ============================================================
          // Ã†Â¯u tiÃƒÂªn lookup theo SEASON cÃ¡Â»Â§a target month trÃ†Â°Ã¡Â»â€ºc
          // VÃƒÂ­ dÃ¡Â»Â¥: DÃ¡Â»Â± bÃƒÂ¡o thÃƒÂ¡ng 3 (LOW) Ã¢â€ â€™ chÃ¡Â»â€° dÃƒÂ¹ng Host ADR tÃ¡Â»Â« May-Oct (LOW)
          // KhÃƒÂ´ng dÃƒÂ¹ng giÃƒÂ¡ cao Ã„â€˜iÃ¡Â»Æ’m (Dec-Feb) cho dÃ¡Â»Â± bÃƒÂ¡o thÃ¡ÂºÂ¥p Ã„â€˜iÃ¡Â»Æ’m

          // Priority: SEASON+dayType â†’ SEASON only â†’ dayType only â†’ all

          // LEVEL 1A: EXACT + SEASON + dayType (MOST SPECIFIC - differentiates weekday/weekend)
          hostRefKeys.push({
            key: `EXACT|||${normalizedPropName}|||${normalizedRoomType}|||${targetSeason}|||${dominantDayType}`,
            source: 'EXACT',
            minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.EXACT
          });
          // LEVEL 1B: EXACT + SEASON only (fallback if not enough weekday/weekend data)
          hostRefKeys.push({
            key: `EXACT|||${normalizedPropName}|||${normalizedRoomType}|||${targetSeason}`,
            source: 'EXACT',
            minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.EXACT
          });
          // LEVEL 1C: EXACT + day type only (legacy)
          hostRefKeys.push({
            key: `EXACT|||${normalizedPropName}|||${normalizedRoomType}|||${dominantDayType}`,
            source: 'EXACT',
            minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.EXACT
          });
          // LEVEL 1D: EXACT only (all seasons, all day types - fallback)
          hostRefKeys.push({
            key: `EXACT|||${normalizedPropName}|||${normalizedRoomType}`,
            source: 'EXACT',
            minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.EXACT
          });

          // LEVEL 2: PROP_BED - property + bedroom count
          // Only if we can extract valid bedroom count
          if (otaBedroomCount > 0) {
            // 2A: SEASON + dayType (MOST SPECIFIC for PROP_BED)
            hostRefKeys.push({
              key: `PROP_BED|||${normalizedPropName}|||${otaBedroomCount}|||${targetSeason}|||${dominantDayType}`,
              source: 'PROP_BED',
              minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.PROP_BED
            });
            // 2B: SEASON only
            hostRefKeys.push({
              key: `PROP_BED|||${normalizedPropName}|||${otaBedroomCount}|||${targetSeason}`,
              source: 'PROP_BED',
              minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.PROP_BED
            });
            // 2C: dayType only
            hostRefKeys.push({
              key: `PROP_BED|||${normalizedPropName}|||${otaBedroomCount}|||${dominantDayType}`,
              source: 'PROP_BED',
              minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.PROP_BED
            });
            // 2D: All (no season, no dayType)
            hostRefKeys.push({
              key: `PROP_BED|||${normalizedPropName}|||${otaBedroomCount}`,
              source: 'PROP_BED',
              minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.PROP_BED
            });
          }

          // LEVEL 3: PROP_ALL - property only (all room types - warning!)
          // 3A: SEASON + dayType (MOST SPECIFIC for PROP_ALL)
          hostRefKeys.push({
            key: `PROP_ALL|||${normalizedPropName}|||${targetSeason}|||${dominantDayType}`,
            source: 'PROP_ALL',
            minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.PROP_ALL
          });
          // 3B: SEASON only
          hostRefKeys.push({
            key: `PROP_ALL|||${normalizedPropName}|||${targetSeason}`,
            source: 'PROP_ALL',
            minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.PROP_ALL
          });
          // 3C: dayType only
          hostRefKeys.push({
            key: `PROP_ALL|||${normalizedPropName}|||${dominantDayType}`,
            source: 'PROP_ALL',
            minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.PROP_ALL
          });
          // 3D: All (last resort)
          hostRefKeys.push({
            key: `PROP_ALL|||${agg.propertyName}`,
            source: 'PROP_ALL',
            minSample: FORECAST_CONFIG.HOST_ADR_MIN_SAMPLE.PROP_ALL
          });

          // Future: AREA_BED and GLOBAL_BED levels would require additional data structure
          // For now, PROP_ALL is the last resort before 'none'

          // Debug log for L81 specifically
          const isDebugRow = normalizedPropName.includes('Vinhomes Central Park') && normalizedRoomType.includes('1 Phòng ngủ');

          // Build lookup key for logging
          const primaryLookupKey = `EXACT|||${normalizedPropName}|||${normalizedRoomType}|||${targetSeason}|||${dominantDayType}`;
          if (isDebugRow) {
            debugLog(`[DEBUG ROW ${rows.length}] OTA: "${agg.propertyName}" / "${agg.roomType}"`);
            debugLog(`[DEBUG ROW ${rows.length}] Normalized: "${normalizedPropName}" / "${normalizedRoomType}"`);
            debugLog(`[DEBUG ROW ${rows.length}] dayType="${dominantDayType}" / targetMonth=${targetMonth} / SEASON=${targetSeason}`);
            debugLog(`[DEBUG ROW ${rows.length}] Primary lookup key: "${primaryLookupKey}"`);
            // Log available keys in map that match this property (using normalized names)
            const matchingKeys = [...hostAdrRefMap.keys()].filter(k => k.includes(normalizedPropName) && k.includes('1 Phòng ngủ'));
            debugLog(`[DEBUG ROW ${rows.length}] Available keys in map (${matchingKeys.length} keys):`, matchingKeys.map(k => `"${k}" (n=${hostAdrRefMap.get(k)?.length})`));
            debugLog(`[DEBUG ROW ${rows.length}] Fallback ladder:`, hostRefKeys.map(k => `${k.source}:"${k.key}" (min=${k.minSample})`));
          }

          // Try each level in order
          for (const { key, source, minSample } of hostRefKeys) {
            const adrs = hostAdrRefMap.get(key);
            if (isDebugRow) {
              debugLog(`[DEBUG ROW ${rows.length}] Ã¢â€ â€™ ${source} key "${key}" Ã¢â€ â€™ ${adrs?.length ?? 0} ADRs (need ${minSample})`,
                adrs?.length ? `values: [${adrs.slice(0, 5).map(a => a.toLocaleString()).join(', ')}${adrs.length > 5 ? '...' : ''}]` : '');
            }
            if (adrs && adrs.length >= minSample) {
              const winsorized = winsorize(adrs, FORECAST_CONFIG.WINSORIZE_PERCENTILE);
              hostAdrRef = median(winsorized);
              hostAdrRefSample = adrs.length;
              hostAdrRefSource = source;
              foundHostAdrs = adrs;
              if (isDebugRow) {
                debugLog(`[DEBUG ROW ${rows.length}] Ã¢Å“â€¦ MATCHED @ ${source}! Host ADR = ${hostAdrRef?.toLocaleString()}Ã„â€˜ (n=${hostAdrRefSample})`);
              }
              break;
            }
          }

          // DEBUG: Log properties without Host ADR (only first occurrence per property)
          if (hostAdrRef === null && !missingHostAdrProperties.has(agg.propertyName)) {
            missingHostAdrProperties.add(agg.propertyName);
            console.warn(`[MISSING HOST ADR] Property "${agg.propertyName}" has no Host ADR reference data. OTA bookings exist but no executed host_supply_segments linked.`);
          }

          // Calculate variance from the ADRs that were found
          if (foundHostAdrs && foundHostAdrs.length >= 2) {
            hostAdrRefVariance = calculateVariance(foundHostAdrs);
          }

          // ============================================================
          // HOST ADR TREND & SEASONALITY ADJUSTMENT
          // ============================================================
          // Get trend data for this property + room (or property-level fallback)
          let hostAdrRefAdjusted: number | null = hostAdrRef;
          let hostAdrTrend: number | null = null;
          let hostAdrTrendSource: ForecastRow['hostAdrTrendSource'] = 'none';
          let hostAdrHostTrend: number | null = null;
          let hostAdrOtaTrend: number | null = null;
          let hostAdrOtaDemandIndex: number | null = null;
          let hostAdrSeasonalFactor: number | null = null;
          let hostAdrVolatility: number | null = null;
          // NEW: Confidence-based prediction fields
          let hostAdrPredictedLow: number | null = null;
          let hostAdrPredictedHigh: number | null = null;
          let hostAdrConfidence: 'high' | 'medium' | 'low' | null = null;
          let hostAdrAppliedTrendCap: number | null = null;

          // Look up trend data with FALLBACK LADDER:
          // 1. property+room (most specific)
          // 2. property only
          // 3. __MARKET__ (market-wide average - always available)
          const trendKeys = [
            `${normalizedPropName}|||${normalizedRoomType}`,
            agg.propertyName,
            '__MARKET__'  // Fallback to market-wide trend
          ];

          let trendData: HostAdrTrendData | undefined;
          let trendSourceTemp: 'prop+room' | 'property' | 'market' | 'none' = 'none';
          for (const tKey of trendKeys) {
            const data = hostAdrTrendMap.get(tKey);
            // Only use if trend is not 0 (has meaningful data) OR it's market fallback
            if (data && (data.recentTrend !== 0 || tKey === '__MARKET__')) {
              trendData = data;
              trendSourceTemp = tKey === '__MARKET__' ? 'market' : (tKey.includes('|||') ? 'prop+room' : 'property');
              break;
            }
          }

          // Store trend data for later use (available to the whole row building block)
          const trendDataForLater = trendData;
          const trendSourceForLater = trendSourceTemp;

          // Get OTA ADR - STRICT: ONLY use ADR from THIS MONTH's bookings
          // NO fallback to reference pool - each month shows its own data only
          let otaAdrRef: number | null = null;
          let otaAdrRefSample = 0;
          let otaAdrRefVariance: number | null = null;

          // Use bookings from THIS specific month/period ONLY
          if (agg.otaAmounts.length > 0) {
            // Calculate ADR from this month's bookings (even if n=1)
            otaAdrRef = median(agg.otaAmounts);
            otaAdrRefSample = agg.otaAmounts.length;
            if (agg.otaAmounts.length >= 2) {
              otaAdrRefVariance = calculateVariance(agg.otaAmounts);
            }
          }
          // If no bookings in this month Ã¢â€ â€™ OTA ADR = null (will show "Ã¢â‚¬â€")

          // Calculate expected spread & margin using ADJUSTED Host ADR
          // This accounts for seasonality + market trend
          // NOTE: These are calculated AFTER calculateAdjustedHostAdr() below
          let effectiveHostAdr: number | null = null;
          let expectedSpread: number | null = null;
          let expectedMarginPercent: number | null = null;

          // Calculate future velocity ratio with clamp
          // Try multiple keys similar to hostAdrRef lookup
          const velocityKeys = [
            `${normalizedPropName}|||${normalizedRoomType}`,
            agg.propertyName,
          ];

          let baselineEntry: { count: number; sampleSize: number } | undefined;
          for (const vKey of velocityKeys) {
            const entry = velocityBaseline.get(vKey);
            if (entry && entry.sampleSize >= FORECAST_CONFIG.MIN_SAMPLE_VELOCITY) {
              baselineEntry = entry;
              break;
            }
          }

          // Fallback: if no specific baseline, use overall baseline
          const baselineSampleSize = baselineEntry?.sampleSize ?? 0;

          // ChÃ¡Â»â€° tÃƒÂ­nh velocity khi cÃƒÂ³ Ã„â€˜Ã¡Â»Â§ sample baseline hoÃ¡ÂºÂ·c cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u chung
          let futureVelocity: number | null = null;
          let baselineVel: number | null = null;
          let futureVelocityRatio: number | null = null;
          let futureVelocityRatioClamped: number | null = null;

          const hasValidBaseline = baselineSampleSize >= FORECAST_CONFIG.MIN_SAMPLE_VELOCITY;

          // Calculate velocity even without specific baseline - use overall baseline
          futureVelocity = agg.recentBookingCount / FORECAST_CONFIG.VELOCITY_REF_DAYS;

          if (hasValidBaseline && baselineEntry) {
            baselineVel = baselineEntry.count;
            futureVelocityRatio = baselineVel > 0 ? futureVelocity / baselineVel : null;
            futureVelocityRatioClamped = clampVelocityRatio(futureVelocityRatio);
          } else if (overallBaselineVelocity > 0 && agg.recentBookingCount > 0) {
            // Use overall baseline as fallback
            baselineVel = overallBaselineVelocity;
            futureVelocityRatio = futureVelocity / overallBaselineVelocity;
            futureVelocityRatioClamped = clampVelocityRatio(futureVelocityRatio);
          }

          // ============================================================
          // NOW: Calculate adjusted Host ADR with velocity & volume data
          // ============================================================
          if (hostAdrRef !== null) {
            const adjusted = calculateAdjustedHostAdr(
              hostAdrRef,
              trendDataForLater,
              otaDemandData.byMonth.size > 0 ? otaDemandData : null,
              targetMonth,
              futureVelocityRatioClamped,
              null,  // volume ratio
              foundHostAdrs  // Pass actual ADRs for percentile-based range
            );

            hostAdrRefAdjusted = adjusted.adjusted;
            hostAdrTrend = adjusted.trend;
            hostAdrTrendSource = trendSourceForLater;
            hostAdrHostTrend = adjusted.hostTrend;
            hostAdrOtaTrend = adjusted.otaTrend;
            hostAdrOtaDemandIndex = adjusted.otaDemandIndex;
            hostAdrSeasonalFactor = adjusted.seasonalFactor;
            hostAdrVolatility = adjusted.volatility;
            hostAdrPredictedLow = adjusted.adjustedLow;
            hostAdrPredictedHigh = adjusted.adjustedHigh;
            hostAdrConfidence = adjusted.confidence;
            hostAdrAppliedTrendCap = adjusted.appliedTrendCap;

            // Debug log
            if (rows.length < 5) {
              debugLog(`[DEBUG TREND ADJ] Row ${rows.length}:`, {
                property: agg.propertyName,
                room: agg.roomType,
                targetMonth,
                trendSource: trendSourceForLater,
                rawHostAdr: hostAdrRef?.toLocaleString(),
                adjustedHostAdr: hostAdrRefAdjusted?.toLocaleString(),
                velocityRatio: futureVelocityRatioClamped?.toFixed(2),
                velocityAdjustment: `${(adjusted.velocityAdjustment * 100).toFixed(1)}%`,
                combinedTrend: `${(hostAdrTrend * 100).toFixed(1)}%`,
                confidence: hostAdrConfidence,
              });
            }
          }

          // NOW calculate effectiveHostAdr, expectedSpread, expectedMarginPercent
          // using the ADJUSTED hostAdrRefAdjusted value (after calculateAdjustedHostAdr)
          effectiveHostAdr = hostAdrRefAdjusted ?? hostAdrRef;
          expectedSpread = (otaAdrRef !== null && effectiveHostAdr !== null)
            ? otaAdrRef - effectiveHostAdr
            : null;
          expectedMarginPercent = (otaAdrRef !== null && effectiveHostAdr !== null && otaAdrRef > 0)
            ? ((otaAdrRef - effectiveHostAdr) / otaAdrRef) * 100
            : null;

          // Day type mix already calculated above for ADR lookup

          // Confidence calculation
          // Factor in: sample size, variance, fulfillment data, AND fallback source level
          const minSample = Math.min(otaAdrRefSample, hostAdrRefSample);
          const maxVariance = Math.max(otaAdrRefVariance || 0, hostAdrRefVariance || 0);

          // Base confidence from sample/variance
          let confidence = getForecastConfidence(minSample, maxVariance, hasFulfillmentData);

          // RULE: If using lower-accuracy fallback levels, cap confidence at LOW
          // EXACT is accurate Ã¢â€ â€™ no change
          // PROP_BED is reasonably accurate Ã¢â€ â€™ no change
          // PROP_ALL, AREA_BED, GLOBAL_BED are less accurate Ã¢â€ â€™ force LOW
          if (['PROP_ALL', 'AREA_BED', 'GLOBAL_BED'].includes(hostAdrRefSource)) {
            confidence = 'LOW';
          }

          // Debug: Log confidence calculation for first few rows
          if (rows.length < 5) {
            debugLog(`[DEBUG ROW ${rows.length}] Confidence calc:`, {
              otaAdrRefSample,
              hostAdrRefSample,
              minSample,
              otaAdrRefVariance,
              hostAdrRefVariance,
              maxVariance,
              hasFulfillmentData,
              hostAdrRefSource,
              confidence,
              recentBookingCount: agg.recentBookingCount,
              baselineSampleSize,
              futureVelocityRatioClamped,
            });
          }

          // Calculate Volume Score = actual booked nights / baseline nights
          // Key format: property|||room|||month (MM)
          // NOTE: periodKey can be "2026-01" (month), "2026-W05" (week), or "2026-01-15" (day)
          // We need to extract month (MM) for baseline lookup
          let month: string;
          if (agg.periodKey.includes('W')) {
            // Week format: "2026-W05" Ã¢â€ â€™ extract month from check_in_dates in this group
            // For simplicity, use first 2 digits after W as approximate month indicator
            // Better: calculate from actual dates in aggregate (but we don't track them)
            // Workaround: use current month from period - approximation is acceptable
            const weekNum = parseInt(agg.periodKey.split('W')[1], 10);
            // Approximate month from week number (week 1-4 = Jan, 5-8 = Feb, etc.)
            const approxMonth = Math.ceil(weekNum / 4.3);
            month = approxMonth.toString().padStart(2, '0');
          } else if (agg.periodKey.length === 10) {
            // Day format: "2026-01-15" Ã¢â€ â€™ extract MM from position 5-7
            month = agg.periodKey.substring(5, 7);
          } else {
            // Month format: "2026-01" Ã¢â€ â€™ extract MM from position 5-7
            month = agg.periodKey.substring(5, 7);
          }
          const volumeBaselineKey = `${normalizedPropName}|||${normalizedRoomType}|||${month}`;
          const baselineVolume = volumeBaseline.get(volumeBaselineKey);
          const volumeScore = baselineVolume && baselineVolume > 0
            ? agg.bookedNights / baselineVolume
            : null;

          // Debug volume score for first few rows
          if (rows.length < 5) {
            debugLog(`[DEBUG ROW ${rows.length}] Volume:`, {
              property: agg.propertyName,
              room: agg.roomType,
              month,
              bookedNights: agg.bookedNights,
              baselineVolume,
              volumeScore: volumeScore?.toFixed(2),
            });
          }

          // Calculate Capacity Score = current booked / historical peak
          const peakKey = `${normalizedPropName}|||${normalizedRoomType}`;
          const historicalPeak = historicalPeakMap.get(peakKey) || null;
          const capacityScore = historicalPeak && historicalPeak > 0
            ? agg.bookedNights / historicalPeak
            : null;

          // Calculate Area Score = property velocity / district average
          const district = findDistrictForProperty(agg.propertyName, propertyToDistrict);
          let areaScore: number | null = null;

          // DEBUG: Log district lookup info for first 5 rows
          if (rows.length < 5) {
            debugLog(`[DEBUG AREA SCORE PRE] Row ${rows.length}:`, {
              propertyName: agg.propertyName,
              district: district || 'NOT_FOUND',
              futureVelocity,
              propertyToDistrictSize: propertyToDistrict.size,
              velocityBaselineSize: velocityBaseline.size,
            });
          }

          if (district && futureVelocity !== null && futureVelocity > 0) {
            // Get all velocities for this district
            const districtVelocities: number[] = [];
            velocityBaseline.forEach((entry, key) => {
              const prop = key.split('|||')[0];
              const propDistrict = findDistrictForProperty(prop, propertyToDistrict);
              if (propDistrict === district && entry.count > 0) {
                districtVelocities.push(entry.count);
              }
            });
            if (districtVelocities.length > 0) {
              const districtAvg = districtVelocities.reduce((a, b) => a + b, 0) / districtVelocities.length;
              if (districtAvg > 0) {
                areaScore = futureVelocity / districtAvg;
                // Debug log for first few
                if (rows.length < 5) {
                  debugLog(`[DEBUG AREA SCORE CALC] ${agg.propertyName}: district=${district}, velocity=${futureVelocity.toFixed(3)}, districtVelocitiesCount=${districtVelocities.length}, districtAvg=${districtAvg.toFixed(3)}, areaScore=${areaScore.toFixed(2)}`);
                }
              }
            } else if (rows.length < 5) {
              debugLog(`[DEBUG AREA SCORE] ${agg.propertyName}: district=${district}, NO velocities found for this district`);
            }
          } else if (rows.length < 5) {
            debugLog(`[DEBUG AREA SCORE SKIP] ${agg.propertyName}: district=${district || 'NOT_FOUND'}, velocity=${futureVelocity}`);
          }

          // Signal with reason - now uses both velocity AND volume score
          const { signal, reason: signalReason } = getForecastSignalWithReason(
            expectedMarginPercent,
            futureVelocityRatioClamped,
            confidence,
            hostAdrRef,
            volumeScore  // NEW: Volume Score
          );

          // Top channel (calculate first - needed for comprehensive adjustment)
          let topChannel: string | null = null;
          let topChannelShare: number | null = null;
          if (agg.channels.size > 0) {
            const sorted = [...agg.channels.entries()].sort((a, b) => b[1] - a[1]);
            topChannel = sorted[0][0];
            topChannelShare = sorted[0][1] / agg.bookedNights;
          }

          // Suggested adjustment using COMPREHENSIVE calculation
          // Includes: margin, velocity, volume, lead time, seasonality, day type
          const avgLeadTime = agg.leadTimeDays.length > 0 ? median(agg.leadTimeDays) : null;
          const monthNum = parseInt(month, 10); // 1-12 for seasonality

          let suggestedAdjustment: number | null = null;
          let adjustmentFactors: string[] = [];

          if (expectedMarginPercent !== null && hostAdrRef !== null) {
            const comprehensiveResult = calculateComprehensiveAdjustment({
              marginPercent: expectedMarginPercent,
              velocityRatio: futureVelocityRatioClamped,
              volumeScore,
              leadTimeDays: avgLeadTime,
              channel: topChannel,
              month: monthNum || 1,
              dayTypeMix,
            });
            suggestedAdjustment = comprehensiveResult.finalAdjustment;
            adjustmentFactors = comprehensiveResult.factors;

            // Debug: Log comprehensive calculation for first few rows
            if (rows.length < 3) {
              debugLog(`[DEBUG COMPREHENSIVE] Row ${rows.length}:`, {
                property: agg.propertyName,
                room: agg.roomType,
                margin: expectedMarginPercent.toFixed(1),
                velocity: futureVelocityRatioClamped?.toFixed(2),
                volume: volumeScore?.toFixed(2),
                leadTime: avgLeadTime,
                seasonMonth: monthNum,
                dayType: dayTypeMix,
                rawAdj: comprehensiveResult.rawAdjustment,
                finalAdj: comprehensiveResult.finalAdjustment,
                factors: comprehensiveResult.factors,
              });
            }
          }

          // Build comprehensiveScore object for UI display
          const comprehensiveScore = (expectedMarginPercent !== null && hostAdrRef !== null)
            ? calculateComprehensiveAdjustment({
              marginPercent: expectedMarginPercent,
              velocityRatio: futureVelocityRatioClamped,
              volumeScore,
              leadTimeDays: avgLeadTime,
              channel: topChannel,
              month: monthNum || 1,
              dayTypeMix,
            })
            : null;

          // ============================================================
          // SMART PRICING RECOMMENDATION
          // ============================================================
          // Calculate AI-powered recommendation based on Host min/max boundaries
          const hostMetrics = hostSegmentMetricsMap.get(`${normalizedPropName}|||${normalizedRoomType}`);
          const otaTiming = otaBookingTimingMap.get(`${normalizedPropName}|||${normalizedRoomType}`);

          // Get dayType-specific min/max if available
          const effectiveDayType: 'weekday' | 'weekend' = dayTypeMix === 'WEEKEND' ? 'weekend' : 'weekday';
          const dayTypeMetrics = effectiveDayType === 'weekend' ? hostMetrics?.weekend : hostMetrics?.weekday;

          const smartPricingInput: SmartPricingInput = {
            currentOtaAdr: otaAdrRef,
            currentHostAdr: hostAdrRef,  // Pass current host ADR for comparison
            hostSegmentMinAdr: dayTypeMetrics?.minAdr ?? hostMetrics?.minAdr ?? null,
            hostSegmentMaxAdr: dayTypeMetrics?.maxAdr ?? hostMetrics?.maxAdr ?? null,
            hostSegmentMedianAdr: dayTypeMetrics?.medianAdr ?? hostMetrics?.medianAdr ?? null,
            velocityRatio: futureVelocityRatioClamped,
            volumeScore,
            lastMinuteShare: effectiveDayType === 'weekend'
              ? otaTiming?.weekend.lastMinuteShare ?? otaTiming?.lastMinuteShare ?? null
              : otaTiming?.weekday.lastMinuteShare ?? otaTiming?.lastMinuteShare ?? null,
            earlyBirdShare: effectiveDayType === 'weekend'
              ? otaTiming?.weekend.earlyBirdShare ?? otaTiming?.earlyBirdShare ?? null
              : otaTiming?.weekday.earlyBirdShare ?? otaTiming?.earlyBirdShare ?? null,
            marginPercent: expectedMarginPercent,
            dayType: effectiveDayType,
            season: targetSeason
          };

          const smartPricing = calculateSmartPricingRecommendation(smartPricingInput);

          // Debug: Log smart pricing for first few rows
          if (rows.length < 3 && smartPricing) {
            debugLog(`[DEBUG SMART PRICING] Row ${rows.length}:`, {
              property: agg.propertyName,
              room: agg.roomType,
              dayType: effectiveDayType,
              season: targetSeason,
              // Step 1: Host Cost
              currentHostCost: smartPricing.currentHostCost,
              hostCostMin: smartPricing.hostCostMin,
              hostCostMax: smartPricing.hostCostMax,
              recommendedHostCost: smartPricing.recommendedHostCost,
              hostCostReason: smartPricing.hostCostReason,
              // Step 2: OTA Price
              currentOtaPrice: smartPricing.currentOtaPrice,
              recommendedOtaPrice: smartPricing.recommendedOtaPrice,
              targetMargin: `${smartPricing.targetMarginPercent}%`,
              otaAdjustment: `${smartPricing.otaPriceAdjustmentPercent}%`,
              // Signals
              demandScore: smartPricing.demandScore,
            });
          }

          rows.push({
            groupKey,
            groupName: options.groupBy === 'propertyRoomType'
              ? `${agg.propertyName}, ${agg.roomType}`
              : options.groupBy === 'property' ? agg.propertyName : agg.roomType,
            propertyId: agg.propertyId,
            propertyName: agg.propertyName,
            roomType: agg.roomType,
            periodKey: agg.periodKey,
            periodLabel: agg.periodLabel,
            dayTypeMix,

            bookedNightsFuture: agg.bookedNights,
            bookingCount: agg.bookingCount,
            fulfillmentRate,
            expectedExecutedNights,

            otaAdrRef,
            otaAdrRefSample,
            otaAdrRefVariance,

            hostAdrRef,
            hostAdrRefAdjusted,
            hostAdrRefSample,
            hostAdrRefVariance,
            hostAdrRefSource,

            // Host ADR Trend & Seasonality
            hostAdrTrend,
            hostAdrTrendSource,
            hostAdrHostTrend,
            hostAdrOtaTrend,
            hostAdrOtaDemandIndex,
            hostAdrSeasonalFactor,
            hostAdrVolatility,
            // AI Pricing Confidence-based Prediction
            hostAdrPredictedLow,
            hostAdrPredictedHigh,
            hostAdrConfidence,
            hostAdrAppliedTrendCap,

            // Host Segment Metrics (min/max/volume by dayType)
            hostSegmentMetrics: hostSegmentMetricsMap.get(`${normalizedPropName}|||${normalizedRoomType}`) || null,

            // OTA Booking Timing (lastminute vs early bird)
            otaBookingTiming: otaBookingTimingMap.get(`${normalizedPropName}|||${normalizedRoomType}`) || null,

            expectedSpread,
            expectedMarginPercent,

            futureVelocity,
            baselineVelocity: baselineVel,
            futureVelocityRatio,
            futureVelocityRatioClamped,
            baselineSampleSize,

            // NEW: Volume Score for capacity tracking
            volumeScore,

            // NEW: Capacity Score - comparison with historical peak
            capacityScore,
            historicalPeak,

            // NEW: Area Score - comparison with district average
            areaScore,
            district,

            signal,
            signalReason,
            suggestedAdjustment,
            confidence,

            // NEW: Comprehensive score with all factors for UI display
            comprehensiveScore,

            // NEW: Smart Pricing Recommendation based on Host min/max + demand
            smartPricing,

            leadTimeDays: avgLeadTime,
            topChannel,
            topChannelShare,
            topChannelCommission: null, // TODO: Fetch from booking metadata

            isEstimated: true,
          });
        } catch (rowError) {
          console.error(`[usePriceSpreadForecast] ERROR building row for groupKey="${groupKey}":`, rowError);
        }
      }

      // Sort by period then group name
      rows.sort((a, b) => {
        const periodCmp = a.periodKey.localeCompare(b.periodKey);
        if (periodCmp !== 0) return periodCmp;
        return a.groupName.localeCompare(b.groupName);
      });

      console.log(`[usePriceSpreadForecast] Built ${rows.length} rows from ${aggregated.size} aggregated groups`);

      // 10. Calculate KPI
      const kpi: ForecastKpi = {
        totalBookedNights: rows.reduce((s, r) => s + r.bookedNightsFuture, 0),
        totalExpectedExecutedNights: rows.reduce((s, r) => s + r.expectedExecutedNights, 0),
        avgOtaAdrRef: median(rows.filter(r => r.otaAdrRef !== null).map(r => r.otaAdrRef!)),
        avgHostAdrRef: median(rows.filter(r => r.hostAdrRef !== null).map(r => r.hostAdrRef!)),
        avgExpectedSpread: median(rows.filter(r => r.expectedSpread !== null).map(r => r.expectedSpread!)),
        avgExpectedMarginPercent: median(rows.filter(r => r.expectedMarginPercent !== null).map(r => r.expectedMarginPercent!)),
        avgFulfillmentRate: rows.reduce((s, r) => s + r.fulfillmentRate, 0) / (rows.length || 1),

        increaseCount: rows.filter(r => r.signal === 'increase').length,
        holdCount: rows.filter(r => r.signal === 'hold').length,
        decreaseCount: rows.filter(r => r.signal === 'decrease').length,
        reviewCount: rows.filter(r => r.signal === 'review').length,

        highConfidenceCount: rows.filter(r => r.confidence === 'HIGH').length,
        medConfidenceCount: rows.filter(r => r.confidence === 'MED').length,
        lowConfidenceCount: rows.filter(r => r.confidence === 'LOW').length,

        propertyCount: new Set(rows.map(r => r.propertyName)).size,
        roomTypeCount: new Set(rows.map(r => r.roomType)).size,
      };

      // 11. Build filter options (from ALL data, not just filtered results)
      const filterOptions: ForecastFilterOptions = {
        propertyIds: Array.from(allPropertyIds.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        propertyNames: Array.from(allPropertyNames).sort(),
        roomTypes: Array.from(allRoomTypes).sort(),
        channels: Array.from(allChannels).sort(),
        months: Array.from(allMonths).sort(),
      };

      debugLog(`[usePriceSpreadForecast] Generated ${rows.length} forecast rows, filterOptions: ${filterOptions.propertyNames.length} props, ${filterOptions.roomTypes.length} rooms, ${filterOptions.channels.length} channels`);
      return { rows, kpi, filterOptions };
    },
    staleTime: 30 * 1000, // 30 seconds for debugging
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

