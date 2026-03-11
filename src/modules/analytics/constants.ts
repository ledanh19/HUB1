/**
 * Analytics Module Constants
 * 
 * Configuration values and canonical formulas for the Analytics module.
 * These values are LOCKED and must be consistent across all pages.
 */

// ============================================================================
// DAY TYPE CLASSIFICATION (Price Spread Analytics ONLY)
// ============================================================================

/**
 * Day types for pricing decisions.
 * Host cost does NOT vary by day type - only OTA demand does.
 * 
 * Classification based on CHECK-IN DATE (not booking date):
 * - WEEKDAY: Mon-Thu (lower demand)
 * - WEEKEND: Fri-Sat (higher demand)  
 * - SUNDAY: Semi-weekend (moderate demand)
 */
export type DayType = 'WEEKDAY' | 'WEEKEND' | 'SUNDAY';

/**
 * Get day type from a date.
 * Used for Price Spread Analytics pricing decisions.
 * 
 * @param date - The check-in date to classify
 * @returns DayType classification
 */
export function getDayType(date: Date): DayType {
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  if (dayOfWeek === 0) return 'SUNDAY';
  if (dayOfWeek === 5 || dayOfWeek === 6) return 'WEEKEND'; // Fri, Sat
  return 'WEEKDAY'; // Mon-Thu
}

/**
 * Get day type from ISO date string.
 */
export function getDayTypeFromString(dateStr: string): DayType {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'WEEKDAY'; // Default fallback
  return getDayType(date);
}

/**
 * Day type display labels (Vietnamese)
 */
export const DAY_TYPE_LABELS: Record<DayType, string> = {
  WEEKDAY: 'Ngày thường',
  WEEKEND: 'Cuối tuần',
  SUNDAY: 'Chủ nhật',
};

// ============================================================================
// LEAD TIME BUCKETS (Price Spread Analytics)
// ============================================================================

/**
 * Lead time bucket classification.
 * Dominant bucket determines pricing strategy.
 */
export type LeadTimeBucket = '0-3' | '4-7' | '8-14' | '15-30' | '30+';

/**
 * Get lead time bucket from days to check-in.
 */
export function getLeadTimeBucket(daysToCheckin: number): LeadTimeBucket {
  if (daysToCheckin <= 3) return '0-3';
  if (daysToCheckin <= 7) return '4-7';
  if (daysToCheckin <= 14) return '8-14';
  if (daysToCheckin <= 30) return '15-30';
  return '30+';
}

/**
 * Lead time bucket labels (Vietnamese)
 */
export const LEAD_TIME_LABELS: Record<LeadTimeBucket, string> = {
  '0-3': '0-3 ngày',
  '4-7': '4-7 ngày',
  '8-14': '8-14 ngày',
  '15-30': '15-30 ngày',
  '30+': '>30 ngày',
};

/**
 * Lead Time Score - tính toán mức độ ưu tiên dựa trên khoảng cách check-in
 * 
 * BUSINESS LOGIC:
 * - Last-minute (0-7 ngày): Nếu còn phòng trống → PHẢI GIẢM GIÁ để fill
 * - Short-term (8-30 ngày): Pricing chuẩn, dựa trên demand
 * - Long-term (30+ ngày): Có thể aggressive hơn (tăng giá) vì còn thời gian fill
 * 
 * RETURNS: Multiplier for price adjustment
 * - < 1.0: Nên giảm giá (last-minute pressure)
 * - = 1.0: Pricing bình thường
 * - > 1.0: Có thể tăng giá (far-future opportunity)
 */
export function getLeadTimeScore(leadTimeDays: number | null): number {
  if (leadTimeDays === null) return 1.0;

  // Last-minute (0-3 days): High pressure to fill → reduce price
  if (leadTimeDays <= 3) return 0.7;

  // Near-term (4-7 days): Some pressure
  if (leadTimeDays <= 7) return 0.85;

  // Standard window (8-14 days): Normal pricing
  if (leadTimeDays <= 14) return 1.0;

  // Advance booking (15-30 days): Slight opportunity
  if (leadTimeDays <= 30) return 1.1;

  // Far-future (30+ days): Can be more aggressive
  return 1.2;
}

// ============================================================================
// CHANNEL CONVERSION FACTOR (NOT commission - that's already in NET)
// ============================================================================

/**
 * Channel conversion quality factor.
 * Different OTAs have different guest quality and conversion patterns.
 * 
 * NOTE: Commission is ALREADY deducted in total_amount_net from bookings_mirror.
 * This factor is purely about conversion/demand patterns, NOT margin calculation.
 * 
 * RETURNS: Multiplier for demand scoring
 * - > 1.0: Channel brings higher quality/conversion bookings
 * - = 1.0: Standard
 * - < 1.0: Channel has lower conversion rate
 * 
 * NOTE: Currently DISABLED (always returns 1.0) because:
 * - Prices sync across all OTAs via Channel Manager
 * - User noted "không cần quan tâm đến nguồn OTA" for pricing decisions
 * - Channel quality only matters for analysis, not pricing adjustments
 */
export function getChannelDemandFactor(_channel: string | null): number {
  // DISABLED: Return neutral factor
  // Reason: Prices are synced across OTAs, so channel shouldn't affect pricing decisions
  return 1.0;

  /* ORIGINAL LOGIC (kept for reference, may re-enable later):
  if (!channel) return 1.0;
  
  const lowerChannel = channel.toLowerCase();
  
  // Direct/Website: High intent, lower cancellation
  if (lowerChannel.includes('direct') || lowerChannel.includes('website')) {
    return 1.15;
  }
  
  // Booking.com: Good conversion, loyal guests
  if (lowerChannel.includes('booking')) {
    return 1.05;
  }
  
  // Agoda: High volume in SEA market
  if (lowerChannel.includes('agoda')) {
    return 1.0;
  }
  
  // Expedia group: Good for international guests
  if (lowerChannel.includes('expedia') || lowerChannel.includes('hotels.com')) {
    return 1.0;
  }
  
  return 1.0;
  */
}

// ============================================================================
// SEASONALITY FACTOR
// ============================================================================

/**
 * Get seasonality factor based on month.
 * Uses Vietnamese holiday calendar and tourism patterns.
 * 
 * HIGH SEASON (factor > 1.0): Can be more aggressive with pricing
 * - Tết Nguyên Đán period (Jan-Feb)
 * - Summer vacation (Jun-Aug)
 * - Christmas/New Year (Dec)
 * 
 * LOW SEASON (factor < 1.0): Need competitive pricing
 * - Post-Tết (Mar-Apr)
 * - Rainy season end (Sep-Oct)
 * 
 * RETURNS: Multiplier for price adjustment
 */
export function getSeasonalityFactor(month: number): number {
  // Month is 1-12
  switch (month) {
    // HIGH SEASON
    case 1: return 1.15;  // January - Tết preparation
    case 2: return 1.20;  // February - Tết Nguyên Đán
    case 6: return 1.10;  // June - Summer start
    case 7: return 1.15;  // July - Peak summer
    case 8: return 1.10;  // August - Summer end
    case 12: return 1.15; // December - Christmas/New Year

    // MID SEASON
    case 5: return 1.05;  // May - 30/4-1/5 holidays
    case 9: return 0.95;  // September - 2/9 holiday but rainy
    case 11: return 1.0;  // November - Pre-holiday

    // LOW SEASON
    case 3: return 0.90;  // March - Post-Tết slow
    case 4: return 0.90;  // April - Low demand
    case 10: return 0.85; // October - Rainy season

    default: return 1.0;
  }
}

// ============================================================================
// COMPREHENSIVE PRICE ADJUSTMENT SCORE
// ============================================================================

/**
 * ComprehensiveScoreInput - tất cả factors cần để tính toán đề xuất giá
 */
export interface ComprehensiveScoreInput {
  marginPercent: number;
  velocityRatio: number | null;
  volumeScore: number | null;
  leadTimeDays: number | null;
  channel: string | null;       // For demand quality factor only (commission already in NET)
  month: number;                // 1-12 for seasonality
  dayTypeMix: DayTypeMix;
}

/**
 * ComprehensiveScoreOutput - kết quả phân tích đầy đủ
 */
export interface ComprehensiveScoreOutput {
  // Core demand score
  demandScore: number;          // Combined velocity + volume (0-2+)

  // Individual factors
  leadTimeScore: number;        // 0.7-1.2 based on days to check-in
  channelFactor: number;        // 1.0-1.15 based on channel demand quality
  seasonalityFactor: number;    // 0.85-1.20 based on month

  // Final adjustment
  rawAdjustment: number;        // Before factor application
  finalAdjustment: number;      // After all factors applied

  // Debug info
  factors: string[];            // List of factors that modified the result
}

/**
 * Calculate comprehensive price adjustment using ALL available factors.
 * 
 * This is the MASTER function that combines:
 * 1. Margin position (vs target range 12-20%)
 * 2. Demand signals (velocity + volume)
 * 3. Lead time pressure (last-minute vs far-future)
 * 4. Channel-specific margins (commission differences)
 * 5. Seasonality (high/low season)
 * 6. Day type (weekend premium)
 * 
 * RETURNS: ComprehensiveScoreOutput with final adjustment and debug info
 */
export function calculateComprehensiveAdjustment(
  input: ComprehensiveScoreInput
): ComprehensiveScoreOutput {
  const {
    marginPercent,
    velocityRatio,
    volumeScore,
    leadTimeDays,
    channel,
    month,
    dayTypeMix,
  } = input;

  const factors: string[] = [];

  // 1. Calculate individual factors
  const leadTimeScore = getLeadTimeScore(leadTimeDays);
  const channelFactor = getChannelDemandFactor(channel);  // NOTE: Commission already in NET
  const seasonalityFactor = getSeasonalityFactor(month);

  // 2. Calculate demand score (velocity 60% + volume 40%)
  const velocity = velocityRatio ?? 1.0;
  const volume = volumeScore ?? 1.0;
  const demandScore = velocity * 0.6 + volume * 0.4;

  // 3. Calculate base adjustment from margin position
  let rawAdjustment = 0;

  // NEGATIVE MARGIN → MUST INCREASE (bán lỗ)
  // Đang bán lỗ → PHẢI tăng giá để thoát lỗ
  if (marginPercent < PRICING_THRESHOLDS.LOSS_THRESHOLD) {
    const gapToFloor = PRICING_THRESHOLDS.MIN_MARGIN_FLOOR - marginPercent;
    // Tăng đủ để đạt floor + 3% buffer, max 15%
    rawAdjustment = Math.min(gapToFloor + 3, 15);
    // Minimum tăng 5% cho case bán lỗ
    rawAdjustment = Math.max(5, rawAdjustment);
    factors.push(`NEGATIVE_MARGIN: +${rawAdjustment.toFixed(1)}% to escape loss (margin=${marginPercent.toFixed(1)}%)`);

    // For NEGATIVE_MARGIN, skip modifiers and return immediately with required increase
    return {
      demandScore,
      leadTimeScore,
      channelFactor,
      seasonalityFactor,
      rawAdjustment,
      finalAdjustment: rawAdjustment,
      factors,
    };
  }

  // BELOW MIN FLOOR (< 12%) → MUST INCREASE
  if (marginPercent < PRICING_THRESHOLDS.MIN_MARGIN_FLOOR) {
    const gapToFloor = PRICING_THRESHOLDS.MIN_MARGIN_FLOOR - marginPercent;
    rawAdjustment = Math.min(gapToFloor + 3, 15);
    factors.push(`BELOW_FLOOR: +${rawAdjustment.toFixed(1)}% to reach min margin`);
  }
  // HIGH MARGIN (> 25%)
  else if (marginPercent > PRICING_THRESHOLDS.DECREASE_THRESHOLD) {
    if (demandScore < 0.6) {
      const excessMargin = marginPercent - PRICING_THRESHOLDS.TARGET_MARGIN_HIGH;
      rawAdjustment = -Math.min(excessMargin * 0.5, PRICING_THRESHOLDS.MAX_DECREASE);
      factors.push(`HIGH_MARGIN_LOW_DEMAND: ${rawAdjustment.toFixed(1)}% to boost bookings`);
    } else if (demandScore >= 1.2) {
      rawAdjustment = FORECAST_CONFIG.SUGGESTED_STEPS.MARGIN_25_30;
      factors.push(`HIGH_MARGIN_HIGH_DEMAND: +${rawAdjustment}% (market supports)`);
    } else {
      rawAdjustment = 0;
      factors.push('HIGH_MARGIN_NEUTRAL_DEMAND: Hold');
    }
  }
  // ABOVE TARGET (20-25%)
  else if (marginPercent > PRICING_THRESHOLDS.TARGET_MARGIN_HIGH) {
    if (demandScore < 0.5) {
      rawAdjustment = -Math.min(5, PRICING_THRESHOLDS.MAX_DECREASE);
      factors.push(`ABOVE_TARGET_LOW_DEMAND: ${rawAdjustment}% decrease`);
    } else if (demandScore >= 1.0) {
      rawAdjustment = FORECAST_CONFIG.SUGGESTED_STEPS.MARGIN_20_25;
      factors.push(`ABOVE_TARGET_GOOD_DEMAND: +${rawAdjustment}%`);
    } else {
      rawAdjustment = 0;
      factors.push('ABOVE_TARGET: Hold');
    }
  }
  // OPTIMAL ZONE (12-20%)
  else {
    if (demandScore >= 1.3) {
      rawAdjustment = 3;
      factors.push(`OPTIMAL_HIGH_DEMAND: +${rawAdjustment}%`);
    } else if (demandScore >= 1.0) {
      rawAdjustment = 2;
      factors.push(`OPTIMAL_GOOD_DEMAND: +${rawAdjustment}%`);
    } else if (demandScore >= 0.7) {
      rawAdjustment = 0;
      factors.push('OPTIMAL_MODERATE_DEMAND: Hold');
    } else if (marginPercent > PRICING_THRESHOLDS.TARGET_MARGIN_LOW) {
      rawAdjustment = -2;
      factors.push(`OPTIMAL_LOW_DEMAND: ${rawAdjustment}% (margin > 15%)`);
    } else {
      rawAdjustment = 0;
      factors.push('OPTIMAL_LOW_DEMAND_NEAR_FLOOR: Hold (protect margin)');
    }
  }

  // 4. Apply modifiers
  let finalAdjustment = rawAdjustment;

  // Lead time modifier
  if (rawAdjustment > 0 && leadTimeScore < 1.0) {
    // Last-minute: reduce increase or flip to decrease
    const leadMod = rawAdjustment * (leadTimeScore - 1);
    finalAdjustment += leadMod;
    factors.push(`LEAD_TIME(${leadTimeDays}d): ${leadMod.toFixed(1)}% modifier`);
  } else if (rawAdjustment > 0 && leadTimeScore > 1.0) {
    // Far-future: boost increase
    const leadMod = rawAdjustment * (leadTimeScore - 1) * 0.5;
    finalAdjustment += leadMod;
    factors.push(`LEAD_TIME_BOOST(${leadTimeDays}d): +${leadMod.toFixed(1)}%`);
  } else if (rawAdjustment < 0 && leadTimeScore < 0.85) {
    // Last-minute + already decreasing: decrease more
    const leadMod = rawAdjustment * (1 - leadTimeScore);
    finalAdjustment += leadMod;
    factors.push(`LAST_MINUTE_PRESSURE: ${leadMod.toFixed(1)}% extra decrease`);
  }

  // Channel demand quality modifier (higher quality channels can support higher prices)
  if (rawAdjustment > 0 && channelFactor > 1.0) {
    const channelMod = rawAdjustment * (channelFactor - 1);
    finalAdjustment += channelMod;
    factors.push(`CHANNEL_QUALITY: +${channelMod.toFixed(1)}%`);
  }

  // Seasonality modifier
  if (rawAdjustment > 0 && seasonalityFactor > 1.0) {
    // High season: boost increase
    const seasonMod = rawAdjustment * (seasonalityFactor - 1);
    finalAdjustment += seasonMod;
    factors.push(`HIGH_SEASON(M${month}): +${seasonMod.toFixed(1)}%`);
  } else if (rawAdjustment > 0 && seasonalityFactor < 1.0) {
    // Low season: reduce increase
    const seasonMod = rawAdjustment * (seasonalityFactor - 1);
    finalAdjustment += seasonMod;
    factors.push(`LOW_SEASON(M${month}): ${seasonMod.toFixed(1)}%`);
  }

  // Volume guard: If volume very low, don't increase
  if (finalAdjustment > 0 && volume < PRICING_THRESHOLDS.VOLUME_VERY_LOW) {
    finalAdjustment = 0;
    factors.push('VOLUME_GUARD: No increase (volume < 30% baseline)');
  } else if (finalAdjustment > 0 && volume < PRICING_THRESHOLDS.VOLUME_LOW) {
    finalAdjustment = Math.max(1, Math.floor(finalAdjustment / 2));
    factors.push(`VOLUME_CAUTION: Reduced to ${finalAdjustment}%`);
  }

  // Apply caps
  if (finalAdjustment > 0) {
    const maxIncrease = dayTypeMix === 'WEEKEND'
      ? PRICING_THRESHOLDS.MAX_INCREASE_WEEKEND
      : PRICING_THRESHOLDS.MAX_INCREASE_WEEKDAY;
    if (finalAdjustment > maxIncrease) {
      finalAdjustment = maxIncrease;
      factors.push(`CAPPED at +${maxIncrease}%`);
    }
  } else if (finalAdjustment < -PRICING_THRESHOLDS.MAX_DECREASE) {
    finalAdjustment = -PRICING_THRESHOLDS.MAX_DECREASE;
    factors.push(`CAPPED at -${PRICING_THRESHOLDS.MAX_DECREASE}%`);
  }

  return {
    demandScore,
    leadTimeScore,
    channelFactor,
    seasonalityFactor,
    rawAdjustment,
    finalAdjustment: Math.round(finalAdjustment * 10) / 10, // Round to 1 decimal
    factors,
  };
}

// ============================================================================
// PRICING DECISION THRESHOLDS
// ============================================================================

/**
 * Margin % thresholds for pricing signals.
 * CANONICAL FORMULA: margin_percent = (otaAdr - hostAdr) / otaAdr
 * 
 * This is the SINGLE SOURCE OF TRUTH for margin calculation.
 * 
 * UPDATED: Target margin range 12-20%
 * - Below 12% = MUST INCREASE
 * - 12-20% = OPTIMAL ZONE (adjust based on velocity)
 * - Above 20% = CAN DECREASE if velocity low
 */
export const PRICING_THRESHOLDS = {
  // Margin percentage thresholds (NOT spread!)
  // BUSINESS RULE: Roomrise là reseller, KHÔNG sở hữu phòng
  // → Giá OTA PHẢI cao hơn Host tối thiểu 12-20%
  MIN_MARGIN_FLOOR: 12,       // HARD FLOOR - margin < 12% = PHẢI TĂNG GIÁ
  TARGET_MARGIN_LOW: 15,      // Target range lower bound
  TARGET_MARGIN_HIGH: 20,     // Target range upper bound
  DECREASE_THRESHOLD: 25,     // Margin > 25% + low velocity → CÓ THỂ GIẢM GIÁ
  REVIEW_MAX_MARGIN: 12,      // Margin < 12% → REVIEW (must increase)
  LOSS_THRESHOLD: 0,          // Margin < 0% → selling at loss

  // Velocity ratio thresholds (for signal gating)
  VELOCITY_INCREASE_MIN: 1.0, // Velocity_ratio ≥ 1.0 → can increase
  VELOCITY_DECREASE_MAX: 0.7, // Velocity_ratio < 0.7 → should decrease (if margin high)
  VELOCITY_HIGH: 1.3,         // Velocity_ratio > 1.3 → high demand
  VELOCITY_VERY_LOW: 0.5,     // Velocity_ratio < 0.5 → very low demand

  // Volume Score thresholds (bookedNights vs baseline)
  // Volume Score = actual booked nights / expected baseline nights
  VOLUME_HIGH: 1.2,           // Volume ≥ 1.2 = đã đặt nhiều hơn 20% so với kỳ vọng
  VOLUME_TARGET: 0.8,         // Volume ≥ 0.8 = đạt ~80% kỳ vọng (OK)
  VOLUME_LOW: 0.5,            // Volume < 0.5 = đã đặt ít hơn 50% kỳ vọng → cần thận trọng khi tăng
  VOLUME_VERY_LOW: 0.3,       // Volume < 0.3 = đã đặt rất ít → nên giảm giá

  // Day type thresholds
  DAY_TYPE_DOMINANT_THRESHOLD: 65, // 65% threshold for WEEKEND/WEEKDAY dominance

  // Price adjustment caps
  MAX_INCREASE_WEEKDAY: 7,    // Max +7% for weekday
  MAX_INCREASE_WEEKEND: 12,   // Max +12% for weekend
  MAX_DECREASE: 8,            // Max -8% for decrease

  // Safety margin (cannot price below host cost × (1 + margin))
  SAFETY_MARGIN: 0.05,        // 5% safety margin
} as const;

// ============================================================================
// FORECAST MODE CONSTANTS
// ============================================================================

/**
 * Forecast Mode configuration.
 * Used for estimating future pricing based on booking pipeline and historical data.
 */
export const FORECAST_CONFIG = {
  // Sample thresholds
  MIN_SAMPLE_FORECAST: 2,          // Minimum bookings for forecast reference (lowered from 5)
  MIN_SAMPLE_DAYTYPE: 3,           // Minimum per day-type; below this use MIXED
  MIN_SAMPLE_VELOCITY: 3,          // Minimum baseline sample for velocity ratio

  // HOST ADR REF - Fallback ladder min samples
  // More specific = lower threshold, more generic = higher threshold
  HOST_ADR_MIN_SAMPLE: {
    EXACT: 2,              // property+roomType (exact match) - lowered from 3
    PROP_BED: 2,           // property+bedroom_count (same BR count) - lowered from 3
    PROP_ALL: 3,           // property_all (all room types - less accurate) - lowered from 8
    AREA_BED: 5,           // area+bedroom_count (area level) - lowered from 10
    GLOBAL_BED: 8,         // global+bedroom_count (last resort) - lowered from 15
  },

  // Historical reference windows
  HOST_ADR_REF_MONTHS: 6,          // Look back 6 months for host ADR reference
  OTA_ADR_REF_DAYS: 30,            // Look at bookings created in last 30 days
  VELOCITY_REF_DAYS: 14,           // Velocity calculation window

  // Outlier control
  WINSORIZE_PERCENTILE: 10,        // Winsorize top/bottom 10% for ADR reference

  // Default fulfillment rate when no historical data
  DEFAULT_FULFILLMENT_RATE: 0.85,  // 85% default fulfillment

  // Confidence thresholds
  CONFIDENCE_HIGH_SAMPLE: 10,      // Sample ≥ 10 → HIGH confidence (lowered from 15)
  CONFIDENCE_MED_SAMPLE: 2,        // Sample ≥ 2 → MED confidence (lowered from 5)
  CONFIDENCE_HIGH_VARIANCE: 0.35,  // Variance > 35% → LOW confidence

  // Velocity clamp range (LOCKED)
  VELOCITY_CLAMP_MIN: 0.2,         // Clamp min velocity ratio
  VELOCITY_CLAMP_MAX: 3.0,         // Clamp max velocity ratio

  // Suggested % step rules (based on margin brackets)
  SUGGESTED_STEPS: {
    MARGIN_20_25: 3,   // margin 20-25% → +3%
    MARGIN_25_30: 5,   // margin 25-30% → +5%
    MARGIN_30_PLUS: 7, // margin 30%+ → +7% (capped)
    VELOCITY_BOOST: 2, // velocityRatio > 1.3 → +2%
    LEAD_TIME_BOOST: 1,// leadTime > 30d → +1%
  },
} as const;

/** Confidence level for forecast estimates */
export type ForecastConfidence = 'HIGH' | 'MED' | 'LOW';

/** Signal reason explains WHY a signal was assigned */
export type SignalReason =
  | 'MISSING_HOST_ADR'              // Thiếu Host ADR (không đủ sample)
  | 'MISSING_VELOCITY_BASELINE'     // Thiếu baseline Velocity (n < MIN_SAMPLE)
  | 'LOW_CONFIDENCE'                // Độ tin cậy thấp
  | 'HIGH_MARGIN_GOOD_VELOCITY'     // Margin cao + velocity tốt → Tăng
  | 'HIGH_MARGIN_WEAK_VELOCITY'     // Margin cao nhưng velocity yếu → Giữ
  | 'HIGH_MARGIN_LOW_VELOCITY'      // Margin > 25% + velocity < 0.7 → Giảm
  | 'HIGH_MARGIN_VERY_LOW_VELOCITY' // Margin > 20% + velocity < 0.5 → Giảm
  | 'MID_MARGIN'                    // Margin trung bình (12-20%) → Giữ/Tăng nhẹ
  | 'MID_MARGIN_HIGH_VELOCITY'      // Margin 12-20% + velocity cao → Tăng
  | 'MID_MARGIN_LOW_VELOCITY'       // Margin 15-20% + velocity thấp → Giảm nhẹ
  | 'BELOW_MIN_MARGIN'              // Margin < 12% → PHẢI TĂNG
  | 'NEGATIVE_MARGIN'               // Margin âm → Lỗ (cần xử lý gấp)
  | 'HOLD_ZONE';                    // Trong vùng ổn định

/** Human-readable signal reason labels */
export const SIGNAL_REASON_LABELS: Record<SignalReason, string> = {
  MISSING_HOST_ADR: 'Thiếu dữ liệu chi phí Host',
  MISSING_VELOCITY_BASELINE: 'Thiếu dữ liệu nhu cầu',
  LOW_CONFIDENCE: 'Độ tin cậy thấp - cần thêm dữ liệu',
  HIGH_MARGIN_GOOD_VELOCITY: 'Biên lợi nhuận tốt + nhu cầu cao → Tăng giá',
  HIGH_MARGIN_WEAK_VELOCITY: 'Biên lợi nhuận tốt, nhu cầu yếu → Giữ giá',
  HIGH_MARGIN_LOW_VELOCITY: 'Biên lợi nhuận cao (>25%) + nhu cầu thấp → Giảm giá để tăng demand',
  HIGH_MARGIN_VERY_LOW_VELOCITY: 'Biên lợi nhuận cao + nhu cầu rất thấp → Nên giảm giá',
  MID_MARGIN: 'Biên lợi nhuận trong vùng tối ưu (12-20%)',
  MID_MARGIN_HIGH_VELOCITY: 'Biên lợi nhuận tốt + nhu cầu cao → Cơ hội tăng giá',
  MID_MARGIN_LOW_VELOCITY: 'Biên lợi nhuận tốt nhưng nhu cầu thấp → Có thể giảm nhẹ',
  BELOW_MIN_MARGIN: '⚠️ Dưới biên lợi nhuận tối thiểu 12% - PHẢI TĂNG GIÁ',
  NEGATIVE_MARGIN: '🚨 Đang bán lỗ - Cần xử lý gấp',
  HOLD_ZONE: 'Trong vùng ổn định',
};

/**
 * Clamp velocity ratio to configured range.
 * Prevents extreme values from distorting signals.
 */
export function clampVelocityRatio(ratio: number | null): number | null {
  if (ratio === null) return null;
  return Math.max(
    FORECAST_CONFIG.VELOCITY_CLAMP_MIN,
    Math.min(FORECAST_CONFIG.VELOCITY_CLAMP_MAX, ratio)
  );
}

/**
 * Calculate confidence level based on sample size and variance.
 */
export function getForecastConfidence(
  sampleSize: number,
  variance: number | null,
  hasFulfillmentRate: boolean
): ForecastConfidence {
  // Low confidence if sample too small
  if (sampleSize < FORECAST_CONFIG.MIN_SAMPLE_FORECAST) return 'LOW';

  // Low confidence if variance too high
  if (variance !== null && variance > FORECAST_CONFIG.CONFIDENCE_HIGH_VARIANCE) return 'LOW';

  // High confidence needs good sample AND low variance AND fulfillment data
  if (
    sampleSize >= FORECAST_CONFIG.CONFIDENCE_HIGH_SAMPLE &&
    (variance === null || variance <= FORECAST_CONFIG.CONFIDENCE_HIGH_VARIANCE) &&
    hasFulfillmentRate
  ) {
    return 'HIGH';
  }

  // Medium otherwise
  if (sampleSize >= FORECAST_CONFIG.CONFIDENCE_MED_SAMPLE) return 'MED';

  return 'LOW';
}

/**
 * Calculate suggested price adjustment % based on margin, velocity, volume score, and day type.
 * 
 * BUSINESS RULES (Updated 2026-01-29):
 * - MIN_MARGIN_FLOOR = 12% → HARD FLOOR, dưới mức này PHẢI TĂNG
 * - TARGET_RANGE = 12-20% → Vùng tối ưu
 * - Above 20% + low demand → CÓ THỂ GIẢM để tăng demand
 * 
 * DEMAND SIGNALS (kết hợp Velocity + Volume):
 * - Velocity = tốc độ đặt phòng so với baseline (đang đặt nhanh hay chậm?)
 * - Volume = số đêm đặt so với kỳ vọng (đã đặt nhiều hay ít?)
 * 
 * LOGIC MA TRẬN:
 * | Velocity | Volume  | Demand      | Action                            |
 * |----------|---------|-------------|-----------------------------------|
 * | High     | High    | Rất cao     | Tăng mạnh (nếu margin OK)         |
 * | High     | Low     | Đang tăng   | Giữ hoặc tăng nhẹ                 |
 * | Low      | High    | Đang giảm   | Giữ (đã có nhiều đặt phòng)       |
 * | Low      | Low     | Thấp        | Giảm (nếu margin > target)        |
 */
export function getSuggestedAdjustment(
  marginPercent: number,
  velocityRatio: number | null,
  dayTypeMix: DayTypeMix,
  leadTimeDays: number | null,
  volumeScore: number | null = null  // NEW: Volume Score
): number | null {
  // Cannot suggest if velocity missing
  if (velocityRatio === null) return null;

  // Default volume score to 1.0 (neutral) if not provided
  const volume = volumeScore ?? 1.0;

  let suggested = 0;

  // ========================================
  // NEGATIVE MARGIN → MUST INCREASE (bán lỗ)
  // ========================================
  // Đang bán lỗ → PHẢI tăng giá để thoát lỗ
  // Mức tăng = đủ để đạt MIN_MARGIN_FLOOR (12%) + buffer
  if (marginPercent < PRICING_THRESHOLDS.LOSS_THRESHOLD) {
    const gapToFloor = PRICING_THRESHOLDS.MIN_MARGIN_FLOOR - marginPercent;
    // Tăng đủ để đạt floor + 3% buffer, max 15%
    suggested = Math.min(gapToFloor + 3, 15);
    // Minimum tăng 5% cho case bán lỗ
    suggested = Math.max(5, suggested);
    return suggested;
  }

  // ========================================
  // BELOW MIN FLOOR (< 12%) → MUST INCREASE
  // ========================================
  if (marginPercent < PRICING_THRESHOLDS.MIN_MARGIN_FLOOR) {
    const gapToFloor = PRICING_THRESHOLDS.MIN_MARGIN_FLOOR - marginPercent;
    suggested = Math.min(gapToFloor + 3, 15); // +3% buffer
    return suggested; // Always positive!
  }

  // ========================================
  // COMBINED DEMAND SCORE
  // ========================================
  // demandScore kết hợp velocity và volume
  // velocity weight = 0.6, volume weight = 0.4
  const demandScore = velocityRatio * 0.6 + volume * 0.4;

  // ========================================
  // CASE 1: HIGH MARGIN (> 25%) + LOW DEMAND → DECREASE
  // ========================================
  if (marginPercent > PRICING_THRESHOLDS.DECREASE_THRESHOLD) {
    if (demandScore < 0.6) {
      // High margin + low demand → decrease to boost bookings
      const excessMargin = marginPercent - PRICING_THRESHOLDS.TARGET_MARGIN_HIGH;
      suggested = -Math.min(excessMargin * 0.5, PRICING_THRESHOLDS.MAX_DECREASE);
      return suggested;
    }
    // High margin + good demand → can still increase
    if (demandScore >= 1.2) {
      suggested = FORECAST_CONFIG.SUGGESTED_STEPS.MARGIN_25_30;
    } else {
      suggested = 0; // Hold - margin already very good
    }
  }
  // ========================================
  // CASE 2: ABOVE TARGET (20-25%) 
  // ========================================
  else if (marginPercent > PRICING_THRESHOLDS.TARGET_MARGIN_HIGH) {
    if (demandScore < 0.5) {
      // Above target + very low demand → decrease
      suggested = -Math.min(5, PRICING_THRESHOLDS.MAX_DECREASE);
    } else if (demandScore >= 1.0) {
      // Good demand → can increase
      suggested = FORECAST_CONFIG.SUGGESTED_STEPS.MARGIN_20_25;
    } else {
      suggested = 0; // Hold
    }
  }
  // ========================================
  // CASE 3: OPTIMAL ZONE (12-20%)
  // ========================================
  else {
    if (demandScore >= 1.3) {
      // Very high demand → increase
      suggested = 3;
    } else if (demandScore >= 1.0) {
      // Normal demand → small increase
      suggested = 2;
    } else if (demandScore >= 0.7) {
      // Slightly low demand → hold
      suggested = 0;
    } else if (marginPercent > PRICING_THRESHOLDS.TARGET_MARGIN_LOW) {
      // Low demand + margin > 15% → can decrease slightly
      suggested = -2;
    } else {
      // Low demand but margin near floor → hold (cannot risk lower margin)
      suggested = 0;
    }
  }

  // ========================================
  // VOLUME MODIFIER: Chưa đặt đủ thì hạn chế tăng giá
  // ========================================
  if (suggested > 0 && volume < PRICING_THRESHOLDS.VOLUME_LOW) {
    // Đã đặt < 50% kỳ vọng → giảm mức tăng hoặc không tăng
    if (volume < PRICING_THRESHOLDS.VOLUME_VERY_LOW) {
      suggested = 0; // Đặt quá ít → không tăng
    } else {
      suggested = Math.max(1, Math.floor(suggested / 2)); // Giảm một nửa
    }
  }

  // Lead time boost (only for increases + high volume)
  if (suggested > 0 && leadTimeDays !== null && leadTimeDays > 30 && volume >= PRICING_THRESHOLDS.VOLUME_TARGET) {
    suggested += FORECAST_CONFIG.SUGGESTED_STEPS.LEAD_TIME_BOOST;
  }

  // Apply caps
  if (suggested > 0) {
    const maxIncrease = dayTypeMix === 'WEEKEND'
      ? PRICING_THRESHOLDS.MAX_INCREASE_WEEKEND
      : PRICING_THRESHOLDS.MAX_INCREASE_WEEKDAY;
    return Math.min(suggested, maxIncrease);
  } else {
    return Math.max(suggested, -PRICING_THRESHOLDS.MAX_DECREASE);
  }
}

/**
 * ============================================================================
 * SMART PRICING RECOMMENDATION
 * ============================================================================
 * 
 * LOGIC 2 BƯỚC:
 * 
 * BƯỚC 1: Đề xuất HOST COST (giá host sẽ charge)
 * - Dựa trên min/max từ history
 * - Điều chỉnh theo demand signals (velocity, volume, timing)
 * - Điều chỉnh theo season và dayType
 * 
 * BƯỚC 2: Đề xuất OTA PRICE (giá bán trên OTA)
 * - OTA Price = Host Cost + Target Margin
 * - Target Margin = 18-22% tùy theo demand
 * - High demand → margin cao hơn (22%)
 * - Low demand → margin thấp hơn (15-18%)
 * 
 * OUTPUT:
 * - recommendedHostCost: Giá host nên charge
 * - recommendedOtaPrice: Giá OTA nên bán
 * - targetMarginPercent: Margin mục tiêu
 */
export interface SmartPricingRecommendation {
  // STEP 1: Host Cost Recommendation
  recommendedHostCost: number;      // Giá host nên charge
  hostCostMin: number;              // Min từ Host history
  hostCostMax: number;              // Max từ Host history
  currentHostCost: number | null;   // Host cost hiện tại (nếu có)
  hostCostReason: HostCostReason;   // Lý do đề xuất host cost

  // STEP 2: OTA Price Recommendation
  recommendedOtaPrice: number;      // Giá OTA nên bán
  currentOtaPrice: number | null;   // Giá OTA hiện tại
  targetMarginPercent: number;      // Margin mục tiêu (%)
  expectedMarginPercent: number;    // Margin kỳ vọng sau điều chỉnh
  otaPriceAdjustmentPercent: number; // % điều chỉnh OTA price

  // Signals
  demandScore: number;              // 0-2 (0=rất thấp, 1=bình thường, 2=rất cao)
  confidence: 'HIGH' | 'MED' | 'LOW';

  // Season/DayType applied
  seasonMultiplier: number;
  dayTypeMultiplier: number;
}

export type HostCostReason =
  | 'DEMAND_HIGH_USE_MAX'           // Demand cao → dùng giá max
  | 'DEMAND_LOW_USE_MIN'            // Demand thấp → dùng giá min
  | 'DEMAND_NORMAL_USE_MEDIAN'      // Demand bình thường → dùng median
  | 'VOLUME_LOW_USE_LOWER'          // Ít booking → dùng giá thấp hơn
  | 'LASTMINUTE_HIGH_USE_HIGHER'    // Nhiều lastminute → có thể dùng giá cao
  | 'SEASON_HIGH_PREMIUM'           // Cao điểm → premium
  | 'SEASON_LOW_DISCOUNT'           // Thấp điểm → discount
  | 'INSUFFICIENT_DATA';            // Không đủ dữ liệu

export interface SmartPricingInput {
  currentOtaAdr: number | null;
  currentHostAdr: number | null;    // Host ADR hiện tại (nếu có)
  hostSegmentMinAdr: number | null;
  hostSegmentMaxAdr: number | null;
  hostSegmentMedianAdr: number | null;
  velocityRatio: number | null;
  volumeScore: number | null;
  lastMinuteShare: number | null;   // % đặt trong 0-3 ngày
  earlyBirdShare: number | null;    // % đặt trong 31+ ngày
  marginPercent: number | null;
  dayType: 'weekday' | 'weekend';
  season: 'HIGH' | 'LOW' | 'SHOULDER';
}

/**
 * Target margin based on demand level
 * High demand → can charge higher margin
 * Low demand → need lower margin to attract bookings
 */
function getTargetMargin(demandScore: number): number {
  if (demandScore >= 1.5) return 22;      // Very high demand → 22%
  if (demandScore >= 1.2) return 20;      // High demand → 20%
  if (demandScore >= 0.8) return 18;      // Normal demand → 18%
  if (demandScore >= 0.5) return 16;      // Low demand → 16%
  return 15;                               // Very low demand → 15%
}

export function calculateSmartPricingRecommendation(
  input: SmartPricingInput
): SmartPricingRecommendation | null {
  const {
    currentOtaAdr,
    currentHostAdr,
    hostSegmentMinAdr,
    hostSegmentMaxAdr,
    hostSegmentMedianAdr,
    velocityRatio,
    volumeScore,
    lastMinuteShare,
    earlyBirdShare,
    dayType,
    season
  } = input;

  // Need minimum data to make recommendation
  if (hostSegmentMinAdr === null || hostSegmentMaxAdr === null) {
    return null;
  }

  const min = hostSegmentMinAdr;
  const max = hostSegmentMaxAdr;
  const median = hostSegmentMedianAdr ?? (min + max) / 2;

  // ============================================================
  // CALCULATE DEMAND SCORE (0-2 scale)
  // ============================================================
  const velocityScore = velocityRatio !== null ? Math.min(2, velocityRatio) : 1;
  const volScore = volumeScore !== null ? Math.min(2, volumeScore) : 1;

  // Timing score: lastminute = high demand signal
  const timingScore = lastMinuteShare !== null && lastMinuteShare > 40 ? 1.3
    : lastMinuteShare !== null && lastMinuteShare > 25 ? 1.1
      : earlyBirdShare !== null && earlyBirdShare > 50 ? 0.9
        : 1.0;

  const demandScore = velocityScore * 0.5 + volScore * 0.3 + timingScore * 0.2;

  // Confidence level
  let confidence: 'HIGH' | 'MED' | 'LOW' = 'MED';
  if (velocityRatio !== null && volumeScore !== null && lastMinuteShare !== null) {
    confidence = 'HIGH';
  } else if (velocityRatio === null && volumeScore === null) {
    confidence = 'LOW';
  }

  // Season & DayType multipliers
  const seasonMultiplier = season === 'HIGH' ? 1.10 : season === 'LOW' ? 0.92 : 1.0;
  const dayTypeMultiplier = dayType === 'weekend' ? 1.08 : 1.0;

  // ============================================================
  // STEP 1: RECOMMEND HOST COST
  // ============================================================
  let recommendedHostCost: number;
  let hostCostReason: HostCostReason;

  // Apply season adjustment to boundaries
  const effectiveMin = min * (season === 'LOW' ? 0.95 : 1.0);
  const effectiveMax = max * seasonMultiplier;

  // Determine host cost based on demand
  if (demandScore >= 1.5) {
    // Very high demand → use max (host can charge premium)
    recommendedHostCost = effectiveMax;
    hostCostReason = 'DEMAND_HIGH_USE_MAX';
  } else if (demandScore >= 1.2) {
    // High demand → 70-90% towards max
    const ratio = 0.7 + (demandScore - 1.2) * 0.67; // 0.7 to 0.9
    recommendedHostCost = effectiveMin + (effectiveMax - effectiveMin) * ratio;
    hostCostReason = 'DEMAND_HIGH_USE_MAX';
  } else if (demandScore < 0.5) {
    // Very low demand → use min
    recommendedHostCost = effectiveMin;
    hostCostReason = 'DEMAND_LOW_USE_MIN';
  } else if (demandScore < 0.8) {
    // Low demand → 20-40% towards max
    const ratio = 0.2 + (demandScore - 0.5) * 0.67; // 0.2 to 0.4
    recommendedHostCost = effectiveMin + (effectiveMax - effectiveMin) * ratio;
    hostCostReason = 'DEMAND_LOW_USE_MIN';
  } else {
    // Normal demand → use median (adjusted by demand)
    const demandAdjustment = (demandScore - 1) * 0.15; // ±15%
    recommendedHostCost = median * (1 + demandAdjustment);
    hostCostReason = 'DEMAND_NORMAL_USE_MEDIAN';
  }

  // Volume override: if very few bookings, be conservative
  if (volumeScore !== null && volumeScore < 0.3 && demandScore < 1.2) {
    recommendedHostCost = Math.min(recommendedHostCost, median);
    hostCostReason = 'VOLUME_LOW_USE_LOWER';
  }

  // LastMinute override: if many lastminute bookings, can push higher
  if (lastMinuteShare !== null && lastMinuteShare > 50 && demandScore >= 1.0) {
    recommendedHostCost = Math.max(recommendedHostCost, median * 1.1);
    hostCostReason = 'LASTMINUTE_HIGH_USE_HIGHER';
  }

  // Season-specific reason
  if (season === 'HIGH' && recommendedHostCost > median * 1.05) {
    hostCostReason = 'SEASON_HIGH_PREMIUM';
  } else if (season === 'LOW' && recommendedHostCost < median * 0.95) {
    hostCostReason = 'SEASON_LOW_DISCOUNT';
  }

  // Apply dayType multiplier to host cost
  recommendedHostCost *= dayTypeMultiplier;

  // Clamp to effective range
  recommendedHostCost = Math.max(effectiveMin, Math.min(effectiveMax * dayTypeMultiplier, recommendedHostCost));
  recommendedHostCost = Math.round(recommendedHostCost);

  // ============================================================
  // STEP 2: RECOMMEND OTA PRICE
  // ============================================================
  const targetMarginPercent = getTargetMargin(demandScore);

  // OTA Price = Host Cost / (1 - margin%)
  // Example: Host = 1,500,000, Margin = 20% → OTA = 1,500,000 / 0.8 = 1,875,000
  const recommendedOtaPrice = Math.round(recommendedHostCost / (1 - targetMarginPercent / 100));

  // Calculate expected margin after recommendation
  const expectedMarginPercent = ((recommendedOtaPrice - recommendedHostCost) / recommendedOtaPrice) * 100;

  // Calculate OTA price adjustment from current
  const otaPriceAdjustmentPercent = currentOtaAdr !== null && currentOtaAdr > 0
    ? ((recommendedOtaPrice - currentOtaAdr) / currentOtaAdr) * 100
    : 0;

  return {
    // Step 1: Host Cost
    recommendedHostCost,
    hostCostMin: Math.round(effectiveMin),
    hostCostMax: Math.round(effectiveMax * dayTypeMultiplier),
    currentHostCost: currentHostAdr !== null ? Math.round(currentHostAdr) : null,
    hostCostReason,

    // Step 2: OTA Price
    recommendedOtaPrice,
    currentOtaPrice: currentOtaAdr !== null ? Math.round(currentOtaAdr) : null,
    targetMarginPercent: Math.round(targetMarginPercent * 10) / 10,
    expectedMarginPercent: Math.round(expectedMarginPercent * 10) / 10,
    otaPriceAdjustmentPercent: Math.round(otaPriceAdjustmentPercent * 10) / 10,

    // Signals
    demandScore: Math.round(demandScore * 100) / 100,
    confidence,
    seasonMultiplier,
    dayTypeMultiplier
  };
}

// LEGACY aliases - deprecated, mapped to new thresholds
// @deprecated Use PRICING_THRESHOLDS.TARGET_MARGIN_HIGH instead
export const SPREAD_THRESHOLD_INCREASE = PRICING_THRESHOLDS.TARGET_MARGIN_HIGH; // 20%
// @deprecated Use PRICING_THRESHOLDS.MIN_MARGIN_FLOOR instead  
export const SPREAD_THRESHOLD_HOLD = PRICING_THRESHOLDS.MIN_MARGIN_FLOOR; // 12%

// ============================================================================
// OTA NET SANITY CHECK FLAGS
// ============================================================================

/**
 * Flags for OTA NET revenue data quality issues.
 * These are for debugging/auditing, NOT production UI.
 */
export interface OtaNetSanityFlags {
  /** HOTEL_COLLECT with null/0 commission - commission data missing */
  missingCommission: boolean;
  /** OTA_COLLECT with commission > 0 - possible double accounting */
  possibleDoubleAccount: boolean;
  /** ota_net_amount > gross_amount - anomalous data */
  anomalousNetGtGross: boolean;
}

/**
 * Check OTA NET data for sanity issues.
 * Returns flags indicating potential data quality problems.
 */
export function checkOtaNetSanity(
  paymentType: string | null,
  grossAmount: number | null,
  commissionRate: number | null,
  commissionAmount: number | null,
  otaNetAmount?: number | null
): OtaNetSanityFlags {
  const flags: OtaNetSanityFlags = {
    missingCommission: false,
    possibleDoubleAccount: false,
    anomalousNetGtGross: false,
  };

  // Check 1: HOTEL_COLLECT with missing commission
  if (paymentType === 'HOTEL_COLLECT') {
    if ((commissionRate === null || commissionRate === 0) &&
      (commissionAmount === null || commissionAmount === 0)) {
      flags.missingCommission = true;
    }
  }

  // Check 2: OTA_COLLECT with commission > 0 (should be 0 since OTA already deducted)
  if (paymentType === 'OTA_COLLECT') {
    if ((commissionRate !== null && commissionRate > 0) ||
      (commissionAmount !== null && commissionAmount > 0)) {
      flags.possibleDoubleAccount = true;
    }
  }

  // Check 3: NET > GROSS (anomalous)
  if (otaNetAmount !== null && grossAmount !== null && otaNetAmount > grossAmount) {
    flags.anomalousNetGtGross = true;
  }

  return flags;
}

/**
 * Log sanity check warnings to console (dev only).
 */
export function logOtaNetSanityWarnings(
  bookingId: string,
  flags: OtaNetSanityFlags
): void {
  if (import.meta.env.DEV) {
    if (flags.missingCommission) {
      console.warn(`[OTA NET] ${bookingId}: HOTEL_COLLECT with missing commission data`);
    }
    if (flags.possibleDoubleAccount) {
      console.warn(`[OTA NET] ${bookingId}: OTA_COLLECT with non-zero commission - possible double accounting`);
    }
    if (flags.anomalousNetGtGross) {
      console.warn(`[OTA NET] ${bookingId}: NET > GROSS - anomalous data`);
    }
  }
}

// ============================================================================
// DAY TYPE MIX CLASSIFICATION
// ============================================================================

/**
 * Day type mix for pricing decisions.
 * Replaces misleading "dominant" day type with threshold-based classification.
 */
export type DayTypeMix = 'WEEKEND' | 'WEEKDAY' | 'MIXED';

/**
 * Get day type mix based on 65% threshold rule.
 * - WEEKEND: weekend nights ≥ 65% of total
 * - WEEKDAY: weekday nights ≥ 65% of total
 * - MIXED: neither reaches threshold
 */
export function getDayTypeMix(
  weekdayNights: number,
  weekendNights: number,
  sundayNights: number
): DayTypeMix {
  const totalNights = weekdayNights + weekendNights + sundayNights;
  if (totalNights === 0) return 'MIXED';

  const weekendTotal = weekendNights + sundayNights; // Fri-Sat-Sun as "weekend-adjacent"
  const weekendRatio = (weekendTotal / totalNights) * 100;
  const weekdayRatio = (weekdayNights / totalNights) * 100;

  if (weekendRatio >= PRICING_THRESHOLDS.DAY_TYPE_DOMINANT_THRESHOLD) return 'WEEKEND';
  if (weekdayRatio >= PRICING_THRESHOLDS.DAY_TYPE_DOMINANT_THRESHOLD) return 'WEEKDAY';
  return 'MIXED';
}

/**
 * Day type mix labels (Vietnamese)
 */
export const DAY_TYPE_MIX_LABELS: Record<DayTypeMix, string> = {
  WEEKEND: 'Cuối tuần',
  WEEKDAY: 'Ngày thường',
  MIXED: 'Hỗn hợp',
};

// ============================================================================
// SAMPLE GUARDS
// ============================================================================

/** 
 * Minimum nights required to show ADR metrics. Below this, show "Low sample" badge.
 * Set to 1 to show ADR for all data (user requested best UX).
 * ADR calculation is still valid even with 1 night - it's just less statistically representative.
 */
export const MIN_NIGHTS_FOR_ADR = 1;

/** Threshold below which we show "Low sample" warning badge (but still show ADR) */
export const LOW_SAMPLE_THRESHOLD = 5;

/** Minimum bookings to consider data statistically meaningful */
export const MIN_BOOKINGS_FOR_RANKING = 3;

/** Label for unmapped/unknown properties and areas */
export const UNMAPPED_LABEL = 'Chưa mapping';

/** Label for zero-cost segments (data quality issue) */
export const ZERO_COST_WARNING = 'Chi phí = 0';

// ============================================================================
// DATE DEFAULTS
// ============================================================================

/** Default date range in months (last 6 months for better focus) */
export const DEFAULT_DATE_RANGE_MONTHS = 6;

/** Future months to include for Revenue Analytics */
export const REVENUE_FUTURE_MONTHS = 3;

/** Maximum date range in months */
export const MAX_DATE_RANGE_MONTHS = 36;

// ============================================================================
// DISPLAY LIMITS
// ============================================================================

/** Number of items in ranking charts */
export const RANKING_CHART_LIMIT = 10;

/** Number of items in channel share chart (others grouped) */
export const CHANNEL_SHARE_LIMIT = 8;

/** Maximum rows to export in CSV */
export const MAX_EXPORT_ROWS = 10000;

// ============================================================================
// CURRENCY FORMATTING
// ============================================================================

export const CURRENCY_LOCALE = 'vi-VN';
export const CURRENCY_CODE = 'VND';

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatCurrencyShort = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '—';
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K`;
  }
  return formatCurrency(amount);
};

/**
 * P1-03: Compact currency formatter for KPI cards.
 * Shows full currency value when small enough (≤999,999).
 * Otherwise uses B/M suffix to prevent truncation in tight layouts.
 * Example: 10.486.960.000 → "10.5B đ", 3.044.550 → "3.0M đ", 50000 → "50.000 ₫"
 */
export const formatCurrencyCompact = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '—';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1)}B ₫`;
  }
  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M ₫`;
  }
  return formatCurrency(amount);
};

// ============================================================================
// NUMBER FORMATTING
// ============================================================================

export const formatNumber = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return '—';
  return new Intl.NumberFormat(CURRENCY_LOCALE).format(num);
};

export const formatPercent = (value: number | null | undefined, decimals = 1): string => {
  if (value === null || value === undefined) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

export const formatPercentNoSign = (value: number | null | undefined, decimals = 1): string => {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(decimals)}%`;
};

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format period start string to human-readable label.
 * Handles multiple input formats robustly with null-safety.
 * @param periodStart - ISO date string (YYYY-MM-DD, YYYY-MM) or quarter key (YYYY-QN)
 * @param granularity - 'month' or 'quarter'
 * @returns Formatted label or '—' if invalid
 */
export const formatPeriodLabel = (periodStart: string | null | undefined, granularity: string): string => {
  // Null-safe check
  if (!periodStart || typeof periodStart !== 'string') return '—';

  const trimmed = periodStart.trim();
  if (!trimmed || trimmed === 'Invalid Date' || trimmed === 'null' || trimmed === 'undefined') return '—';

  try {
    // Day granularity: show "dd/MM/yyyy"
    if (granularity === 'day') {
      const parts = trimmed.split('-');
      if (parts.length >= 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return trimmed;
    }

    // Week granularity: show "Tuần dd/MM" (ISO week start)
    if (granularity === 'week') {
      const parts = trimmed.split('-');
      if (parts.length >= 3) {
        return `T.${parts[2]}/${parts[1]}`;
      }
      return trimmed;
    }

    if (granularity === 'quarter') {
      // periodStart is like "2025-Q1" or "2025 Q1"
      if (trimmed.includes('Q')) {
        const match = trimmed.match(/(\d{4})[\s-]?Q([1-4])/);
        if (match) {
          return `Q${match[2]} ${match[1]}`;
        }
        return trimmed.replace('-', ' ');
      }
      // periodStart is like "2025-01-01" - derive quarter
      const [year, month] = trimmed.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || year < 2000 || year > 2100 || month < 1 || month > 12) return '—';
      const quarter = Math.ceil(month / 3);
      return `Q${quarter} ${year}`;
    }

    // periodStart is like "2025-01" or "2025-01-01"
    const parts = trimmed.split('-');
    if (parts.length < 2) return '—';

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);

    // Validate year and month ranges
    if (isNaN(year) || isNaN(month) || year < 2000 || year > 2100 || month < 1 || month > 12) return '—';

    // Create date safely (month is 0-indexed in JS Date)
    const date = new Date(year, month - 1, 1);
    if (isNaN(date.getTime())) return '—';

    return date.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
};

// ============================================================================
// METRIC CALCULATIONS (CANONICAL FORMULAS)
// ============================================================================

/**
 * Revenue ADR = Revenue / Nights
 * Returns null if nights below threshold
 */
export const calculateRevenueAdr = (revenue: number, nights: number): number | null => {
  if (nights < MIN_NIGHTS_FOR_ADR) return null;
  if (nights === 0) return null;
  return revenue / nights;
};

/**
 * Host ADR = Host Cost / Nights
 * Returns null if nights below threshold
 */
export const calculateHostAdr = (hostCost: number, nights: number): number | null => {
  if (nights < MIN_NIGHTS_FOR_ADR) return null;
  if (nights === 0) return null;
  return hostCost / nights;
};

/**
 * Margin Spread = Revenue ADR - Host ADR
 * Returns null if either ADR is null
 */
export const calculateMarginSpread = (
  revenueAdr: number | null,
  hostAdr: number | null
): number | null => {
  if (revenueAdr === null || hostAdr === null) return null;
  return revenueAdr - hostAdr;
};

/**
 * Period-over-period change (percentage)
 */
export const calculatePopChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

/**
 * Share percentage
 */
export const calculateSharePct = (part: number, total: number): number => {
  if (total === 0) return 0;
  return (part / total) * 100;
};

// ============================================================================
// CHART COLORS
// ============================================================================

export const CHART_COLORS = {
  revenue: 'hsl(var(--chart-1))',
  revenueAdr: 'hsl(var(--chart-2))',
  hostCost: 'hsl(var(--chart-3))',
  hostAdr: 'hsl(var(--chart-4))',
  marginSpread: 'hsl(var(--chart-5))',
  positive: 'hsl(142.1 76.2% 36.3%)',  // green
  negative: 'hsl(0 84.2% 60.2%)',       // red
  neutral: 'hsl(var(--muted-foreground))',
};

// ============================================================================
// LABELS
// ============================================================================

export const METRIC_LABELS = {
  revenueTotal: 'Doanh thu (Booked)',
  hostCostTotal: 'Chi phí Host',
  nightsTotal: 'Số đêm',
  bookingsCount: 'Số booking',
  revenueAdr: 'ADR Doanh thu',
  hostAdr: 'ADR Host',
  marginSpread: 'Biên Spread',
};

export const PIVOT_LABELS: Record<string, string> = {
  all: 'Tất cả',
  channel: 'Kênh bán',
  property: 'Chỗ nghỉ',
  area: 'Khu vực',
};

export const GRANULARITY_LABELS: Record<string, string> = {
  day: 'Theo ngày',
  week: 'Theo tuần',
  month: 'Theo tháng',
  quarter: 'Theo quý',
};

// ============================================================================
// CHANNEL NAME MAPPING (BUG 1 FIX: Normalize all channel names to prevent duplicates)
// ============================================================================

/** 
 * Canonical channel names - all variations map to a single normalized name.
 * Bug 1 fix: AGODA/Agoda, EXPEDIA/Expedia must map to same key.
 */
export const KNOWN_CHANNELS: Record<string, string> = {
  // Booking.com variations
  'Booking.com': 'Booking.com',
  'booking.com': 'Booking.com',
  'BOOKING.COM': 'Booking.com',
  'bookingcom': 'Booking.com',
  'BOOKINGCOM': 'Booking.com',

  // Agoda variations (BUG 1)
  'Agoda': 'Agoda',
  'agoda': 'Agoda',
  'AGODA': 'Agoda',

  // Expedia variations (BUG 1)
  'Expedia': 'Expedia',
  'expedia': 'Expedia',
  'EXPEDIA': 'Expedia',

  // Traveloka variations
  'Traveloka': 'Traveloka',
  'traveloka': 'Traveloka',
  'TRAVELOKA': 'Traveloka',

  // Trip.com / Ctrip variations
  'Trip.com': 'Trip.com',
  'trip.com': 'Trip.com',
  'TRIP.COM': 'Trip.com',
  'Ctrip': 'Trip.com',
  'ctrip': 'Trip.com',
  'CTRIP': 'Trip.com',

  // Airbnb variations
  'Airbnb': 'Airbnb',
  'airbnb': 'Airbnb',
  'AIRBNB': 'Airbnb',

  // Direct/Manual variations
  'Direct': 'Direct',
  'direct': 'Direct',
  'DIRECT': 'Direct',
  'MANUAL': 'Manual',
  'manual': 'Manual',
  'Manual': 'Manual',
};

/**
 * Normalize channel name to canonical form.
 * Bug 1 fix: Prevents duplicates like "AGODA" and "Agoda" appearing separately.
 * 
 * Algorithm:
 * 1. Check exact match in KNOWN_CHANNELS
 * 2. Check case-insensitive match by uppercasing
 * 3. Return original or 'Unknown'
 */
export const normalizeChannelName = (source: string): string => {
  if (!source) return 'Unknown';

  // Direct lookup first
  if (KNOWN_CHANNELS[source]) {
    return KNOWN_CHANNELS[source];
  }

  // Try uppercase lookup for case-insensitive matching
  const upperSource = source.toUpperCase().trim();
  if (KNOWN_CHANNELS[upperSource]) {
    return KNOWN_CHANNELS[upperSource];
  }

  // Try lowercase lookup
  const lowerSource = source.toLowerCase().trim();
  if (KNOWN_CHANNELS[lowerSource]) {
    return KNOWN_CHANNELS[lowerSource];
  }

  // Return trimmed original if not found (preserve unknown channels)
  return source.trim() || 'Unknown';
};

// ============================================================================
// PERIOD-OVER-PERIOD CALCULATION (BUG 3 FIX: Prevent % explosion)
// ============================================================================

/** 
 * Minimum absolute value for PoP denominator to prevent % explosion.
 * Bug 3 fix: If previous value is near zero, return null instead of huge %.
 */
export const MIN_POP_DENOMINATOR = 100; // Minimum 100đ to calculate PoP %

/**
 * Calculate period-over-period change with guards.
 * Bug 3 fix: Returns null if previous value is too small (near zero).
 */
export const calculatePopChangeSafe = (current: number, previous: number): number | null => {
  // Guard: if previous is near zero, don't calculate (would cause % explosion)
  if (Math.abs(previous) < MIN_POP_DENOMINATOR) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};
