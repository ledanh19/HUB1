import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, startOfToday, differenceInDays, format, parseISO, getDay, isWeekend } from "date-fns";

// === TYPES ===

// Silence conditions for AI Humility Layer
export interface SilenceConditions {
  dataLagExceeded: boolean;      // data_lag_minutes > 180
  baselineLow: boolean;          // baseline_reliability < 0.4
  sampleSizeInsufficient: boolean; // sample_size < MIN_SAMPLE
  inventoryMissing: boolean;     // no inventory data
  reason: string | null;         // Human-readable reason for silence
}

// Property context from property_pricing_profiles
export interface PropertyContext {
  propertyId: string;
  roomsCount: number;
  avgOccupancy90d: number;
  avgAdr90d: number;
  avgVelocity90d: number;
  volatilityScore: number;
  otaMixRatio: number;
  pricingIntent: 'MAX_REVENUE' | 'MAX_OCCUPANCY' | 'BALANCED';
  peakMonths: number[];
  lowMonths: number[];
}

// Calendar/temporal context
export interface TemporalContext {
  date: Date;
  dateType: 'NORMAL' | 'WEEKEND' | 'PEAK' | 'EVENT' | 'LOW';
  eventName?: string;
  priceWeight: number; // Multiplier for pricing decisions
}

// Data evidence for transparency (TOP 1 SPEC compliant)
export interface DataEvidence {
  soldRooms: number;
  availableRooms: number;
  totalCapacity: number;
  velocity7d: number;
  baselineVelocity: number | null; // null = không đủ dữ liệu
  baselineSampleSize: number;      // Number of historical bookings used
  leadTimeBucket: string;
  dataLagMinutes: number;
  occupancyPct: number;
  roomType?: string;
  currentRate?: number;
  computedAt: string;              // ISO timestamp of when this was calculated
  statusRules: readonly string[];  // Booking statuses used for calculation
  aggregationRules: {
    sold: 'max_by_day' | 'sum_by_day';
    remaining: 'min_by_day' | 'avg_by_day';
    capacity: 'max_by_day';
    occupancy: 'sum_sold_over_sum_capacity';
  };
  // Context layers
  temporalContext?: TemporalContext;
  propertyContext?: Partial<PropertyContext>;
  silenceConditions?: SilenceConditions;
}

// Percentage range for recommendations (TOP 1 spec)
export interface PercentRange {
  min: number;      // e.g., 5 for +5%
  max: number;      // e.g., 8 for +8%
  recommended: number; // e.g., 6 for +6% (neo point)
  minLabel: string; // "an toàn"
  maxLabel: string; // "tối ưu doanh thu" or "aggressive"
}

export interface RecommendationGroupData {
  id: string;
  dateRange: { start: Date; end: Date };
  action: 'increase' | 'decrease' | 'hold' | 'watch' | 'silence';
  actionStrength?: 'strong' | 'moderate' | 'light';
  priority: 'immediate' | 'watch' | 'optional';
  confidence: number;
  shortReason: string;
  daysCount: number;
  validity: string;
  impactHint?: string;
  dataEvidence?: DataEvidence;
  // NEW: Context layers
  isSilenced?: boolean;
  silenceReason?: string;
  temporalContext?: TemporalContext;
  // NEW: Percentage range (TOP 1 spec)
  percentRange?: PercentRange;
  decisionSentence?: string; // Short decision summary
  keyDrivers?: string[];     // 1-2 key drivers
  scope?: {
    roomTypes?: string[];
    ratePlans?: string[];
  };
}

export interface DayMetrics {
  date: Date;
  dateStr: string;
  dayOfWeek: number;
  daysToCheckin: number;
  leadTimeBucket: string;

  // Inventory
  totalInventory: number;
  remainingInventory: number;
  occupancyPct: number;

  // Booking stats (CONFIRMED + CHECKED_IN + CHECKED_OUT only)
  confirmedBookings: number;
  velocity7d: number;
  velocity24h: number;

  // Baseline comparison
  baselineVelocity: number;
  baselineSampleSize: number; // Number of historical bookings used
  velocityVsBaseline: number;

  // Long-term baseline anchor (Anti-Drift)
  longTermBaselineRate?: number;
  rateVsLongTermBaseline?: number;

  // Rate
  currentRate: number | null;

  // Signal
  signalClass: 'vacancy_risk' | 'sellout_risk' | 'hold' | 'watch' | 'silence';
  advisoryDirection: 'increase' | 'decrease' | 'hold' | 'watch' | 'silence';
  confidence: number;
  explanation: string;

  // Data quality (AI Humility Layer)
  dataLagMinutes: number;
  hasDataLag: boolean;
  hasInventoryAnomaly: boolean;
  silenceConditions: SilenceConditions;

  // Temporal context
  temporalContext: TemporalContext;

  // Property context
  propertyContext?: PropertyContext;
}

// === CONSTANTS ===
// Status rules per spec: different for Sold vs Velocity
const SOLD_BOOKING_STATUSES = ['CONFIRMED', 'CHECKED_IN'] as const;
const VELOCITY_BOOKING_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] as const;
const VALID_BOOKING_STATUSES = VELOCITY_BOOKING_STATUSES; // For query (superset)
const HORIZON_DAYS = 30;

// AI Humility Layer thresholds (relaxed for MVP - show recommendations even with limited data)
const MAX_DATA_LAG_MINUTES = 2880; // 48 hours - very lenient for MVP
const MIN_BASELINE_RELIABILITY = 0.1; // Very low for initial deployment
const MIN_SAMPLE_SIZE = 0; // Allow recommendations even with no baseline (with reduced confidence)
const CONFIDENCE_PENALTY_NO_INVENTORY = 0.3; // Reduce confidence by 30% if no inventory

// Lead time buckets
function getLeadTimeBucket(daysToCheckin: number): string {
  if (daysToCheckin <= 3) return '0-3 ngày';
  if (daysToCheckin <= 7) return '4-7 ngày';
  if (daysToCheckin <= 14) return '8-14 ngày';
  if (daysToCheckin <= 30) return '15-30 ngày';
  return '30+ ngày';
}

// Get temporal context for a date
function getTemporalContext(date: Date, calendarEvents: any[]): TemporalContext {
  const dateStr = format(date, 'yyyy-MM-dd');
  const event = calendarEvents.find(e => e.event_date === dateStr);

  if (event) {
    return {
      date,
      dateType: event.event_type as TemporalContext['dateType'],
      eventName: event.event_name || undefined,
      priceWeight: Number(event.price_weight) || 1.0,
    };
  }

  // Default: detect weekend
  if (isWeekend(date)) {
    return {
      date,
      dateType: 'WEEKEND',
      priceWeight: 1.1, // Slight premium for weekends
    };
  }

  return {
    date,
    dateType: 'NORMAL',
    priceWeight: 1.0,
  };
}

// Check silence conditions (AI Humility Layer) - MVP: be more lenient
function checkSilenceConditions(
  dataLagMinutes: number,
  baselineReliability: number,
  sampleSize: number,
  hasInventory: boolean
): SilenceConditions {
  const conditions: SilenceConditions = {
    dataLagExceeded: dataLagMinutes > MAX_DATA_LAG_MINUTES,
    baselineLow: baselineReliability < MIN_BASELINE_RELIABILITY,
    sampleSizeInsufficient: sampleSize < MIN_SAMPLE_SIZE,
    inventoryMissing: !hasInventory,
    reason: null,
  };

  // Build human-readable reason (but don't force silence for MVP)
  const warnings: string[] = [];
  if (conditions.dataLagExceeded) warnings.push(`Dữ liệu chậm ${Math.round(dataLagMinutes)} phút`);
  if (conditions.baselineLow) warnings.push('Baseline hạn chế');
  if (conditions.sampleSizeInsufficient) warnings.push('Mẫu dữ liệu ít');
  if (conditions.inventoryMissing) warnings.push('Thiếu tồn kho');

  if (warnings.length > 0) {
    conditions.reason = `Lưu ý: ${warnings.join(', ')}`;
  }

  return conditions;
}

// Apply Business Intent Mode thresholds
function adjustThresholdsForIntent(
  intent: PropertyContext['pricingIntent'],
  occupancyPct: number,
  velocityVsBaseline: number
): { shouldIncrease: boolean; shouldDecrease: boolean; confidenceBonus: number } {
  let increaseThreshold = 80; // occupancy % to trigger increase
  let decreaseThreshold = 0.5; // velocity ratio to trigger decrease
  let confidenceBonus = 0;

  switch (intent) {
    case 'MAX_REVENUE':
      // More aggressive on price increases
      increaseThreshold = 70;
      decreaseThreshold = 0.3; // Less likely to decrease
      confidenceBonus = 0.05;
      break;
    case 'MAX_OCCUPANCY':
      // More aggressive on price decreases to fill rooms
      increaseThreshold = 90;
      decreaseThreshold = 0.7; // More likely to decrease
      confidenceBonus = 0.05;
      break;
    case 'BALANCED':
    default:
      // Default balanced approach
      break;
  }

  return {
    shouldIncrease: occupancyPct >= increaseThreshold,
    shouldDecrease: velocityVsBaseline < -((1 - decreaseThreshold) * 100),
    confidenceBonus,
  };
}

// Scale recommendation strength based on property context
function scaleActionStrength(
  baseStrength: 'light' | 'moderate' | 'strong',
  propertyContext: PropertyContext | undefined,
  temporalContext: TemporalContext
): 'light' | 'moderate' | 'strong' {
  if (!propertyContext) return baseStrength;

  const strengthScale = { light: 0, moderate: 1, strong: 2 };
  let scaleValue = strengthScale[baseStrength];

  // Adjust based on volatility (high volatility = more cautious)
  if (propertyContext.volatilityScore > 0.7) {
    scaleValue = Math.max(0, scaleValue - 1);
  }

  // Adjust based on temporal context (peak = stronger hold on increases)
  if (temporalContext.dateType === 'PEAK' || temporalContext.dateType === 'EVENT') {
    scaleValue = Math.min(2, scaleValue + 1);
  }

  // Adjust based on property size (larger properties = more moderate)
  if (propertyContext.roomsCount > 50) {
    scaleValue = Math.max(0, scaleValue - 1);
  }

  const strengthReverse = ['light', 'moderate', 'strong'] as const;
  return strengthReverse[scaleValue];
}

// === STRENGTH SCORE CALCULATION (TOP 1 SPEC) ===
// Based on: occupancy pressure + velocity delta + leadtime urgency
function calculateStrengthScore(
  occupancyPct: number,
  velocityVsBaseline: number,
  daysToCheckin: number
): { score: number; strength: 'light' | 'moderate' | 'strong' } {
  // A. Occupancy pressure score (0-100)
  let occScore = 0;
  if (occupancyPct >= 85) occScore = 85;
  else if (occupancyPct >= 70) occScore = 60;
  else if (occupancyPct >= 60) occScore = 30;
  else occScore = 10;

  // B. Velocity delta score (0-100)
  const velocityDelta = Math.abs(velocityVsBaseline);
  let velScore = 0;
  if (velocityDelta >= 40) velScore = 80;
  else if (velocityDelta >= 20) velScore = 55;
  else if (velocityDelta >= 10) velScore = 25;
  else velScore = 10;

  // C. Leadtime urgency score (0-100)
  let leadScore = 0;
  if (daysToCheckin < 7) leadScore = 70;
  else if (daysToCheckin <= 14) leadScore = 50;
  else leadScore = 30;

  // Weighted total: 45% occ + 40% vel + 15% lead
  const score = 0.45 * occScore + 0.40 * velScore + 0.15 * leadScore;

  // Map to strength
  let strength: 'light' | 'moderate' | 'strong';
  if (score > 70) strength = 'strong';
  else if (score >= 45) strength = 'moderate';
  else strength = 'light';

  return { score, strength };
}

// === PERCENTAGE RANGE MAPPING (TOP 1 SPEC) ===
function getPercentRange(
  action: 'increase' | 'decrease' | 'hold' | 'watch' | 'silence',
  strength: 'light' | 'moderate' | 'strong',
  intent: 'MAX_REVENUE' | 'MAX_OCCUPANCY' | 'BALANCED'
): PercentRange | undefined {
  if (action === 'hold' || action === 'watch' || action === 'silence') {
    return undefined; // No % for non-action recommendations
  }

  const isIncrease = action === 'increase';

  // Range mapping based on strength
  let min: number, max: number;
  switch (strength) {
    case 'light':
      min = 3; max = 5;
      break;
    case 'moderate':
      min = 5; max = 8;
      break;
    case 'strong':
      min = 8; max = 12;
      break;
  }

  // Cap at 15%
  max = Math.min(max, 15);

  // Calculate recommended point based on intent
  let recommended: number;
  switch (intent) {
    case 'MAX_REVENUE':
      recommended = Math.round(min + (max - min) * 0.7); // Lean upper
      break;
    case 'MAX_OCCUPANCY':
      recommended = Math.round(min + (max - min) * 0.3); // Lean lower
      break;
    case 'BALANCED':
    default:
      recommended = Math.round((min + max) / 2); // Middle
      break;
  }

  // Labels based on action type
  const minLabel = isIncrease ? 'an toàn' : 'nhẹ nhàng';
  const maxLabel = isIncrease ? 'tối ưu doanh thu' : 'kích cầu mạnh';

  // For decrease, values are negative
  if (!isIncrease) {
    return {
      min: -max, // e.g., -12%
      max: -min, // e.g., -3%
      recommended: -recommended,
      minLabel: maxLabel,
      maxLabel: minLabel,
    };
  }

  return { min, max, recommended, minLabel, maxLabel };
}

// Generate decision sentence (TOP 1 spec)
function generateDecisionSentence(
  action: 'increase' | 'decrease' | 'hold' | 'watch' | 'silence',
  strength: 'light' | 'moderate' | 'strong',
  daysToCheckin: number,
  keyDrivers: string[]
): string {
  const strengthVi = { light: 'nhẹ', moderate: 'trung bình', strong: 'mạnh' };
  const validityText = daysToCheckin <= 2 ? '6h' : daysToCheckin <= 7 ? '12h' : '24h';

  switch (action) {
    case 'increase':
      return `Tăng giá ${strengthVi[strength]} trong ${validityText} tới để tận dụng cầu tăng nhanh và tránh hết phòng sớm.`;
    case 'decrease':
      return `Giảm giá ${strengthVi[strength]} trong ${validityText} tới để kích cầu và giảm rủi ro tồn phòng.`;
    case 'hold':
      return `Giữ nguyên giá hiện tại. Nhu cầu ổn định, không cần điều chỉnh.`;
    case 'watch':
      return `Tiếp tục theo dõi. Cần thêm dữ liệu trước khi đưa ra khuyến nghị.`;
    case 'silence':
      return `Chưa đủ dữ liệu để đưa ra khuyến nghị đáng tin cậy.`;
  }
}

// Extract key drivers from metrics
function extractKeyDrivers(
  action: 'increase' | 'decrease' | 'hold' | 'watch' | 'silence',
  occupancyPct: number,
  velocityVsBaseline: number,
  remainingInventory: number,
  daysToCheckin: number
): string[] {
  const drivers: string[] = [];

  if (action === 'increase') {
    if (velocityVsBaseline > 20) drivers.push(`Velocity ↑ +${velocityVsBaseline.toFixed(0)}%`);
    if (occupancyPct >= 80) drivers.push(`Occupancy cao (${occupancyPct.toFixed(0)}%)`);
    if (remainingInventory <= 3) drivers.push(`Inventory còn thấp (${remainingInventory})`);
  } else if (action === 'decrease') {
    if (velocityVsBaseline < -20) drivers.push(`Velocity ↓ ${velocityVsBaseline.toFixed(0)}%`);
    if (remainingInventory > 5) drivers.push(`Inventory còn nhiều (${remainingInventory})`);
    if (daysToCheckin <= 3) drivers.push(`Nhận phòng gần (${daysToCheckin} ngày)`);
  } else if (action === 'hold') {
    drivers.push('Nhu cầu ổn định');
  }

  return drivers.slice(0, 2); // Max 2 drivers
}

// === MAIN HOOK ===
export function useAIPricingRecommendations(propertyId: string | null) {
  const today = startOfToday();
  const horizonEnd = addDays(today, HORIZON_DAYS);

  // Fetch inventory cells for the property
  const inventoryQuery = useQuery({
    queryKey: ["ai-pricing-inventory", propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];

      const { data, error } = await supabase
        .from("inventory_cells")
        .select("property_id, room_type_id, cell_date, availability, rate, updated_at")
        .eq("property_id", propertyId)
        .gte("cell_date", format(today, "yyyy-MM-dd"))
        .lte("cell_date", format(horizonEnd, "yyyy-MM-dd"))
        .order("cell_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch bookings for the property (last 7 days created + future check-in)
  const bookingsQuery = useQuery({
    queryKey: ["ai-pricing-bookings", propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];

      const { data, error } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, channex_property_id, check_in_date, check_out_date, booking_status, room_type, created_at, total_amount_gross")
        .eq("channex_property_id", propertyId)
        .in("booking_status", VALID_BOOKING_STATUSES)
        .gte("check_in_date", format(today, "yyyy-MM-dd"))
        .lte("check_in_date", format(horizonEnd, "yyyy-MM-dd"))
        .order("check_in_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch historical bookings for baseline (same DOW, 4-8 weeks ago)
  const baselineQuery = useQuery({
    queryKey: ["ai-pricing-baseline", propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];

      const eightWeeksAgo = addDays(today, -56);
      const fourWeeksAgo = addDays(today, -28);

      const { data, error } = await supabase
        .from("bookings_mirror")
        .select("check_in_date, booking_status, room_type, created_at")
        .eq("channex_property_id", propertyId)
        .in("booking_status", VALID_BOOKING_STATUSES)
        .gte("check_in_date", format(eightWeeksAgo, "yyyy-MM-dd"))
        .lte("check_in_date", format(fourWeeksAgo, "yyyy-MM-dd"));

      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch property context (Property Context Layer)
  const propertyContextQuery = useQuery({
    queryKey: ["ai-pricing-property-context", propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return null;

      const { data, error } = await supabase
        .from("property_pricing_profiles")
        .select("*")
        .eq("property_id", propertyId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        return {
          propertyId: data.property_id,
          roomsCount: data.rooms_count || 0,
          avgOccupancy90d: Number(data.avg_occupancy_90d) || 0,
          avgAdr90d: Number(data.avg_adr_90d) || 0,
          avgVelocity90d: Number(data.avg_velocity_90d) || 0,
          volatilityScore: Number(data.volatility_score) || 0.5,
          otaMixRatio: Number(data.ota_mix_ratio) || 0.8,
          pricingIntent: (data.pricing_intent || 'BALANCED') as PropertyContext['pricingIntent'],
          peakMonths: data.peak_months || [],
          lowMonths: data.low_months || [],
        } as PropertyContext;
      }
      return null;
    },
    enabled: !!propertyId,
  });

  // Fetch calendar events (Temporal Context Layer)
  const calendarEventsQuery = useQuery({
    queryKey: ["ai-pricing-calendar", propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_calendar_events")
        .select("*")
        .or(`property_id.is.null,property_id.eq.${propertyId}`)
        .gte("event_date", format(today, "yyyy-MM-dd"))
        .lte("event_date", format(horizonEnd, "yyyy-MM-dd"));

      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch long-term baseline anchors (Anti-Drift Guardrail)
  const baselineAnchorsQuery = useQuery({
    queryKey: ["ai-pricing-baseline-anchors", propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];

      const { data, error } = await supabase
        .from("ai_pricing_baseline_anchors")
        .select("*")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("period_end", { ascending: false })
        .limit(4); // Get last 4 anchors

      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Fetch room types for capacity info
  const roomTypesQuery = useQuery({
    queryKey: ["ai-pricing-room-types", propertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!propertyId) return [];

      const { data, error } = await supabase
        .from("channex_mappings")
        .select("channex_property_id, channex_room_type_id, room_type_name")
        .eq("channex_property_id", propertyId)
        .not("channex_room_type_id", "is", null);

      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });

  // Calculate metrics per day
  const dayMetrics: DayMetrics[] = [];
  const propertyContext = propertyContextQuery.data || undefined;
  const calendarEvents = calendarEventsQuery.data || [];
  const baselineAnchors = baselineAnchorsQuery.data || [];

  // Get long-term baseline rate for anti-drift
  const longTermBaselineRate = baselineAnchors.length > 0
    ? Number(baselineAnchors[0].avg_rate)
    : undefined;

  if (inventoryQuery.data && bookingsQuery.data && baselineQuery.data) {
    const inventoryByDate = new Map<string, { availability: number; rate: number | null; updatedAt: string | null }>();

    // Aggregate inventory by date (sum across room types)
    inventoryQuery.data.forEach(cell => {
      const key = cell.cell_date;
      const existing = inventoryByDate.get(key) || { availability: 0, rate: null, updatedAt: null };
      existing.availability += cell.availability || 0;
      if (cell.rate && !existing.rate) existing.rate = Number(cell.rate);
      if (cell.updated_at) existing.updatedAt = cell.updated_at;
      inventoryByDate.set(key, existing);
    });

    // === STAY-DATE EXPANSION for Sold rooms ===
    // Status rules: CONFIRMED, CHECKED_IN only (NOT CHECKED_OUT)
    // Booking phủ nhiều ngày → expand theo từng stay_date (D thuộc [check_in, check_out))
    const soldByDate = new Map<string, number>();

    bookingsQuery.data.forEach(booking => {
      // Only count CONFIRMED and CHECKED_IN for sold/occupancy
      if (!SOLD_BOOKING_STATUSES.includes(booking.booking_status as typeof SOLD_BOOKING_STATUSES[number])) {
        return;
      }

      const checkIn = parseISO(booking.check_in_date);
      const checkOut = parseISO(booking.check_out_date);

      // Expand: count 1 room for each night the booking covers
      let current = checkIn;
      while (current < checkOut) {
        const dateKey = format(current, 'yyyy-MM-dd');
        soldByDate.set(dateKey, (soldByDate.get(dateKey) || 0) + 1);
        current = addDays(current, 1);
      }
    });

    // === VELOCITY 7d: Bookings CREATED in last 7 days (by booking_date/created_at) ===
    // Status rules: CONFIRMED, CHECKED_IN, CHECKED_OUT (all valid)
    // For each stay_date D in horizon, count bookings:
    //   - created_at within [now - 7d, now]
    //   - stay_date D within [check_in, check_out)
    const sevenDaysAgo = addDays(today, -7).getTime();
    const recentBookingsByStayDate = new Map<string, number>();

    bookingsQuery.data.forEach(booking => {
      // Velocity uses all valid statuses (CONFIRMED, CHECKED_IN, CHECKED_OUT)
      if (!VELOCITY_BOOKING_STATUSES.includes(booking.booking_status as typeof VELOCITY_BOOKING_STATUSES[number])) {
        return;
      }

      // Only count if booking was CREATED in last 7 days
      if (!booking.created_at) return;
      const createdTime = new Date(booking.created_at).getTime();
      if (createdTime < sevenDaysAgo) return;

      // Expand stay-dates
      const checkIn = parseISO(booking.check_in_date);
      const checkOut = parseISO(booking.check_out_date);

      let current = checkIn;
      while (current < checkOut) {
        const dateKey = format(current, 'yyyy-MM-dd');
        recentBookingsByStayDate.set(dateKey, (recentBookingsByStayDate.get(dateKey) || 0) + 1);
        current = addDays(current, 1);
      }
    });

    // Calculate baseline velocity by day of week
    // Count total bookings and number of weeks with data for each DOW
    const baselineByDow = new Map<number, { totalBookings: number; weeksWithData: number; uniqueDates: Set<string> }>();

    // Initialize all DOWs with empty sets
    for (let d = 0; d <= 6; d++) {
      baselineByDow.set(d, { totalBookings: 0, weeksWithData: 0, uniqueDates: new Set() });
    }

    baselineQuery.data.forEach(booking => {
      const dow = getDay(parseISO(booking.check_in_date));
      const existing = baselineByDow.get(dow)!;
      existing.totalBookings += 1;
      existing.uniqueDates.add(booking.check_in_date);
    });

    // Calculate weeks with data (unique dates = number of weeks sampled)
    baselineByDow.forEach((value, dow) => {
      value.weeksWithData = value.uniqueDates.size;
    });

    // Total baseline bookings for display
    const totalBaselineBookings = baselineQuery.data.length;

    // Generate metrics for each day in horizon
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const date = addDays(today, i);
      const dateStr = format(date, "yyyy-MM-dd");
      const dow = getDay(date);
      const daysToCheckin = i;

      const inv = inventoryByDate.get(dateStr) || { availability: 0, rate: null, updatedAt: null };
      // USE stay-date expansion: soldByDate instead of bookingsByDate
      const confirmedBookings = soldByDate.get(dateStr) || 0;
      // USE velocity by created_at: recentBookingsByStayDate instead of recentBookingsByDate
      const recentBookings = recentBookingsByStayDate.get(dateStr) || 0;

      // Get temporal context for this date
      const temporalContext = getTemporalContext(date, calendarEvents);

      // Estimate total capacity (availability + confirmed)
      const totalInventory = inv.availability + confirmedBookings;
      const remainingInventory = inv.availability;
      const occupancyPct = totalInventory > 0 ? ((totalInventory - remainingInventory) / totalInventory) * 100 : 0;

      // Calculate velocity
      const velocity7d = recentBookings / 7;
      const velocity24h = recentBookings > 0 ? recentBookings / 7 : 0;

      // Get baseline velocity for this DOW
      const baseline = baselineByDow.get(dow) || { totalBookings: 0, weeksWithData: 0, uniqueDates: new Set<string>() };
      // Sample size = total bookings in baseline period (for display)
      const baselineSampleSize = totalBaselineBookings;
      const weeksWithData = baseline.weeksWithData;
      // Only calculate baseline if we have weeks with data
      const hasValidBaseline = weeksWithData > 0 && baselineSampleSize >= MIN_SAMPLE_SIZE;
      // Baseline velocity = avg bookings per day for this DOW over the 4-week period
      const baselineVelocity = hasValidBaseline ? baseline.totalBookings / (weeksWithData * 7) : 0;
      const baselineReliability = weeksWithData >= 4 ? 0.8 : (weeksWithData / 5);

      // Calculate velocity vs baseline percentage
      const velocityVsBaseline = baselineVelocity > 0
        ? ((velocity7d - baselineVelocity) / baselineVelocity) * 100
        : 0;

      // Calculate data lag - use 0 if no timestamp (assume data is fresh)
      const dataLagMinutes = inv.updatedAt
        ? (Date.now() - new Date(inv.updatedAt).getTime()) / (1000 * 60)
        : 0; // Assume fresh if no timestamp available

      // === AI HUMILITY LAYER ===
      const silenceConditions = checkSilenceConditions(
        dataLagMinutes,
        baselineReliability,
        weeksWithData,
        totalInventory > 0
      );

      // MVP: Only silence if data lag is extreme - otherwise show recommendations with reduced confidence
      const shouldSilence = silenceConditions.dataLagExceeded;

      // Calculate confidence penalty based on data quality issues
      let confidencePenalty = 0;
      if (silenceConditions.inventoryMissing) confidencePenalty += 0.2;
      if (silenceConditions.baselineLow) confidencePenalty += 0.15;
      if (silenceConditions.sampleSizeInsufficient) confidencePenalty += 0.1;

      // === DETERMINE SIGNAL CLASS & ADVISORY ===
      let signalClass: DayMetrics['signalClass'];
      let advisoryDirection: DayMetrics['advisoryDirection'];
      let confidence: number;
      let explanation: string;

      if (shouldSilence) {
        // AI HUMILITY: Choose to remain silent only for extreme cases
        signalClass = 'silence';
        advisoryDirection = 'silence';
        confidence = 0;
        explanation = silenceConditions.reason || 'Dữ liệu quá cũ để đưa ra khuyến nghị.';
      } else {
        // Apply business intent thresholds
        const intentAdjustment = adjustThresholdsForIntent(
          propertyContext?.pricingIntent || 'BALANCED',
          occupancyPct,
          velocityVsBaseline
        );

        // Decision logic with temporal context
        const priceWeight = temporalContext.priceWeight;

        // MVP: When no inventory, use booking velocity as primary signal
        const hasInventoryData = totalInventory > 0;

        if (daysToCheckin <= 7 && velocity7d < baselineVelocity * 0.5 && baselineVelocity > 0) {
          // Vacancy risk - based on velocity being lower than baseline
          signalClass = 'vacancy_risk';
          advisoryDirection = 'decrease';
          confidence = Math.min(0.9, 0.6 + (baselineVelocity > 0 ? 0.2 : 0) + intentAdjustment.confidenceBonus);

          if (temporalContext.dateType === 'PEAK' || temporalContext.dateType === 'EVENT') {
            confidence *= 0.8;
            explanation = `Nhận phòng sau ${daysToCheckin} ngày, velocity thấp. Nhưng là ${temporalContext.eventName || 'ngày cao điểm'}, cân nhắc kỹ.`;
          } else {
            explanation = `Nhận phòng sau ${daysToCheckin} ngày. Tốc độ bán thấp hơn ${Math.abs(velocityVsBaseline).toFixed(0)}% so với baseline.`;
          }
        } else if (velocity7d > baselineVelocity * 1.3 && baselineVelocity > 0) {
          // Sellout risk - based on velocity being higher than baseline
          signalClass = 'sellout_risk';
          advisoryDirection = 'increase';
          confidence = Math.min(0.95, 0.65 + velocity7d * 0.1 + intentAdjustment.confidenceBonus);

          if (temporalContext.dateType === 'PEAK' || temporalContext.dateType === 'EVENT') {
            confidence = Math.min(0.98, confidence * 1.1);
            explanation = `${temporalContext.eventName || 'Ngày cao điểm'}. Velocity +${velocityVsBaseline.toFixed(0)}% so với baseline.`;
          } else {
            explanation = `Tốc độ đặt phòng cao (+${velocityVsBaseline.toFixed(0)}% so với baseline).`;
          }
        } else if (velocity7d > 0 && confirmedBookings > 0) {
          // Has bookings, stable velocity - HOLD
          signalClass = 'hold';
          advisoryDirection = 'hold';
          confidence = Math.min(0.85, 0.55 + (baselineVelocity > 0 ? 0.15 : 0));
          explanation = `Có ${confirmedBookings} booking. Velocity ${velocity7d.toFixed(2)}/ngày - ổn định.`;
        } else if (daysToCheckin <= 14) {
          // Near-term but no clear signal - WATCH
          signalClass = 'watch';
          advisoryDirection = 'watch';
          confidence = Math.max(0.4, 0.6 - daysToCheckin / 30);
          explanation = `Nhận phòng sau ${daysToCheckin} ngày. Cần theo dõi thêm.`;
        } else {
          // Far out - WATCH
          signalClass = 'watch';
          advisoryDirection = 'watch';
          confidence = Math.max(0.35, 0.5 - daysToCheckin / 60);
          explanation = `Lead time ${daysToCheckin} ngày. Theo dõi thêm.`;
        }

        // Apply confidence penalty for missing data
        confidence = Math.max(0.3, confidence - confidencePenalty);

        // Apply temporal context label
        if (temporalContext.dateType !== 'NORMAL') {
          explanation = `[${temporalContext.dateType}${temporalContext.eventName ? `: ${temporalContext.eventName}` : ''}] ${explanation}`;
        }

        // Add warning if missing inventory
        if (!hasInventoryData && silenceConditions.reason) {
          explanation += ` ⚠️ ${silenceConditions.reason}`;
        }
      }

      // Anti-drift check
      let rateVsLongTermBaseline: number | undefined;
      if (inv.rate && longTermBaselineRate) {
        rateVsLongTermBaseline = ((inv.rate - longTermBaselineRate) / longTermBaselineRate) * 100;

        // If rate has drifted significantly above long-term baseline, add warning
        if (rateVsLongTermBaseline > 20 && advisoryDirection === 'increase') {
          explanation += ` ⚠️ Giá đã cao hơn ${rateVsLongTermBaseline.toFixed(0)}% so với baseline dài hạn.`;
          confidence *= 0.9; // Reduce confidence for further increases
        }
      }

      const hasDataLag = dataLagMinutes > 60;
      const hasInventoryAnomaly = totalInventory <= 0 || remainingInventory < 0;

      dayMetrics.push({
        date,
        dateStr,
        dayOfWeek: dow,
        daysToCheckin,
        leadTimeBucket: getLeadTimeBucket(daysToCheckin),
        totalInventory,
        remainingInventory,
        occupancyPct,
        confirmedBookings,
        velocity7d,
        velocity24h,
        baselineVelocity,
        baselineSampleSize,
        velocityVsBaseline,
        longTermBaselineRate,
        rateVsLongTermBaseline,
        currentRate: inv.rate,
        signalClass,
        advisoryDirection,
        confidence,
        explanation,
        dataLagMinutes,
        hasDataLag,
        hasInventoryAnomaly,
        silenceConditions,
        temporalContext,
        propertyContext,
      });
    }
  }

  // Group consecutive days with same advisory direction into recommendation groups
  const recommendationGroups: RecommendationGroupData[] = [];

  if (dayMetrics.length > 0) {
    let currentGroup: RecommendationGroupData | null = null;

    dayMetrics.forEach((day) => {
      const shouldStartNewGroup = !currentGroup ||
        currentGroup.action !== day.advisoryDirection ||
        differenceInDays(day.date, currentGroup.dateRange.end) > 1;

      if (shouldStartNewGroup) {
        if (currentGroup) {
          recommendationGroups.push(currentGroup);
        }

        // Calculate strength score using TOP 1 formula
        const { score: strengthScore, strength: calculatedStrength } = calculateStrengthScore(
          day.occupancyPct,
          day.velocityVsBaseline,
          day.daysToCheckin
        );

        // Scale strength based on property context
        const actionStrength = scaleActionStrength(calculatedStrength, propertyContext, day.temporalContext);

        // Get percentage range (TOP 1 spec)
        const percentRange = getPercentRange(
          day.advisoryDirection,
          actionStrength,
          propertyContext?.pricingIntent || 'BALANCED'
        );

        // Extract key drivers
        const keyDrivers = extractKeyDrivers(
          day.advisoryDirection,
          day.occupancyPct,
          day.velocityVsBaseline,
          day.remainingInventory,
          day.daysToCheckin
        );

        // Generate decision sentence
        const decisionSentence = generateDecisionSentence(
          day.advisoryDirection,
          actionStrength,
          day.daysToCheckin,
          keyDrivers
        );

        // Calculate priority
        let priority: 'immediate' | 'watch' | 'optional' = 'watch';
        if (day.daysToCheckin <= 3 && day.confidence >= 0.7) priority = 'immediate';
        else if (day.daysToCheckin <= 7 && day.confidence >= 0.6) priority = 'watch';
        else priority = 'optional';

        // Calculate validity
        let validity = 'Còn hiệu lực 24h';
        if (day.daysToCheckin <= 2) validity = 'Còn hiệu lực 6h';
        else if (day.daysToCheckin <= 7) validity = 'Còn hiệu lực 12h';
        else if (day.daysToCheckin > 14) validity = 'Cập nhật khi có booking mới';

        // Impact hint
        let impactHint: string | undefined;
        if (day.advisoryDirection === 'increase' && day.confidence >= 0.7) {
          impactHint = 'Có nguy cơ bỏ lỡ cơ hội tối ưu doanh thu';
        } else if (day.advisoryDirection === 'decrease' && day.remainingInventory > 3) {
          impactHint = 'Nguy cơ tồn phòng nếu không kích cầu';
        }

        currentGroup = {
          id: `${propertyId}-${day.dateStr}`,
          dateRange: { start: day.date, end: day.date },
          action: day.advisoryDirection,
          actionStrength,
          priority,
          confidence: day.confidence,
          shortReason: day.explanation,
          daysCount: 1,
          validity,
          impactHint,
          isSilenced: day.advisoryDirection === 'silence',
          silenceReason: day.silenceConditions.reason || undefined,
          temporalContext: day.temporalContext,
          percentRange,
          decisionSentence,
          keyDrivers,
          scope: {
            roomTypes: ['Tất cả room types'],
          },
          dataEvidence: {
            soldRooms: day.confirmedBookings,
            availableRooms: day.remainingInventory,
            totalCapacity: day.totalInventory,
            velocity7d: day.velocity7d,
            // TOP 1 SPEC: null if not enough baseline data
            baselineVelocity: day.baselineVelocity > 0 ? day.baselineVelocity : null,
            baselineSampleSize: day.baselineSampleSize,
            leadTimeBucket: day.leadTimeBucket,
            dataLagMinutes: Math.round(day.dataLagMinutes),
            occupancyPct: Math.round(day.occupancyPct),
            currentRate: day.currentRate || undefined,
            computedAt: new Date().toISOString(),
            statusRules: SOLD_BOOKING_STATUSES, // Sold uses CONFIRMED, CHECKED_IN
            aggregationRules: {
              sold: 'max_by_day',
              remaining: 'min_by_day',
              capacity: 'max_by_day',
              occupancy: 'sum_sold_over_sum_capacity',
            },
            temporalContext: day.temporalContext,
            propertyContext: propertyContext ? {
              pricingIntent: propertyContext.pricingIntent,
              volatilityScore: propertyContext.volatilityScore,
              roomsCount: propertyContext.roomsCount,
            } : undefined,
            silenceConditions: day.silenceConditions,
          },
        };
      } else {
        // Extend current group
        currentGroup!.dateRange.end = day.date;
        currentGroup!.daysCount += 1;
        const totalDays = currentGroup!.daysCount;
        currentGroup!.confidence = (currentGroup!.confidence * (totalDays - 1) + day.confidence) / totalDays;
      }
    });

    if (currentGroup) {
      recommendationGroups.push(currentGroup);
    }
  }

  return {
    dayMetrics,
    recommendationGroups,
    propertyContext,
    isLoading: inventoryQuery.isLoading || bookingsQuery.isLoading || baselineQuery.isLoading || propertyContextQuery.isLoading,
    error: inventoryQuery.error || bookingsQuery.error || baselineQuery.error,
    roomTypes: roomTypesQuery.data || [],
  };
}
