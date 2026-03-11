import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, startOfToday, differenceInDays, parseISO, subWeeks, getDay, differenceInMinutes, isWithinInterval, eachDayOfInterval, endOfMonth } from "date-fns";

// An Gia Residences group ID - same as useBookings
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

// Baseline window options (weeks)
export const BASELINE_WINDOWS = [
  { value: 8, label: "8 tuần" },
  { value: 10, label: "10 tuần" },
  { value: 12, label: "12 tuần" },
] as const;

// ============================================
// BOOKING STATUS RULES (AUDIT-GRADE SPEC)
// ============================================
// Sold rooms / Occupancy calculation: only count rooms that are actively occupied
const SOLD_BOOKING_STATUSES = ['CONFIRMED', 'CHECKED_IN'];

// Velocity 7d calculation: include completed bookings to measure booking pace accurately
const VELOCITY_BOOKING_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'];

// Statuses to exclude from all calculations
const EXCLUDED_BOOKING_STATUSES = ['CANCELLED', 'NO_SHOW'];

// ============================================
// TYPES - Enterprise Spec Compliant
// ============================================

export interface Property {
  id: string; // channex_mappings.id - used for inventory_cells query
  channex_property_id: string; // used for bookings_mirror query
  property_name: string;
}

export interface RoomType {
  id: string;
  provider_room_type_id: string;
  provider_property_id: string;
  room_type_name: string;
  occupancy: number;
  count_of_rooms: number;
}

export interface InventoryCell {
  cell_date: string;
  availability: number;
  max_availability: number | null;
  rate: number | null;
  stop_sell: boolean;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  room_type_id: string;
  property_id: string;
  updated_at: string;
  rate_plan_id: string | null;
}

export interface Booking {
  unified_booking_id: string;
  check_in_date: string;
  check_out_date: string;
  booking_date: string | null;
  booking_status: string;
  channex_property_id: string;
  channex_room_type_id: string | null;
  total_amount_net: number | null;
  nights: number;
}

export type DemandSignal = 'high' | 'normal' | 'low';
export type PricingSignal = 'increase' | 'hold' | 'decrease' | 'inactive';
export type AlertType = 'vacancy' | 'sellout' | 'data_issue' | 'anomaly';

// ============================================
// INSIGHT VALIDATION LAYER - Enterprise Fix
// ============================================
// 3 Insight States (CRITICAL - determines what UI can show)
export type InsightState = 'VALID' | 'DEGRADED' | 'INVALID';

// R2: Inventory Intent Classification (legacy - kept for backward compatibility)
export type InventoryIntent = 'SOLD_OUT_REAL' | 'OPS_BLOCK' | 'OWNER_HOLD' | 'MAINTENANCE' | 'UNKNOWN';

// ============================================
// INVENTORY STATUS - NEW SPEC (TOP 1 AUDIT-GRADE)
// ============================================
// 5 statuses based on spec: SOLD_OUT, BLOCKED, INVENTORY_CUT, NORMAL, UNKNOWN
export type InventoryStatus = 'SOLD_OUT' | 'BLOCKED' | 'INVENTORY_CUT' | 'NORMAL' | 'UNKNOWN';

export interface InventoryStatusInfo {
  status: InventoryStatus;
  label: string;       // Badge label
  explanation: string; // 1-line explanation
  evidence: {
    soldRooms: number;
    remainingRooms: number;
    capacity: number;
    stopSell: boolean | null;
    closedToArrival: boolean | null;
    closedToDeparture: boolean | null;
    deltaRemaining24h: number | null;
    dataLagMinutes: number;
  };
}

// R3: Volume Qualifier
export type VolumeQualifier = 'LOW_VOLUME' | 'NORMAL' | 'HIGH';

// R4: Baseline Reliability
export type BaselineReliability = 'HIGH' | 'MEDIUM' | 'LOW';

// R6: Signal Severity
export type SignalSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

// Section 5: Eligibility Levels
export type EligibilityLevel = 'A_INSIGHT' | 'B_SIGNAL' | 'C_RECOMMENDATION' | 'NONE';

// Section 3: Quality Flags
export interface QualityFlags {
  DATA_LAG: boolean;
  BASELINE_LOW: boolean;
  LOW_VOLUME: boolean;
  STOP_SELL: boolean;
  INTENT_UNKNOWN: boolean;
  INVENTORY_BOOKING_MISMATCH: boolean;
  RATEPLAN_UNCERTAIN: boolean;
  LIFECYCLE_LIMITED: boolean;
  DATA_INVALID: boolean;
}

// Insight State Reasons (for UI display)
export interface InsightStateInfo {
  state: InsightState;
  reasons: string[];
  canShowKPI: boolean;
  canShowChart: boolean;
  canShowSignal: boolean;
  canShowExplanation: boolean;
  canClick: boolean;
}

export interface Alert {
  type: AlertType;
  message: string;
  severity: 'warning' | 'critical' | 'info';
  affectedDates: string[];
}

export type WarningType = 'vacancy_risk' | 'sellout_risk' | 'data_lag' | 'inventory_anomaly' | null;

export interface CalendarDay {
  date: Date;
  dateStr: string;
  
  // ============================================
  // INSIGHT VALIDATION LAYER (Enterprise Fix)
  // ============================================
  insightState: InsightState;
  insightStateInfo: InsightStateInfo;
  
  // Section 2.1: Inventory Metrics (SoT) - new names
  totalInventory: number;
  remainingInventory: number;
  soldRooms: number;
  occupancyRate: number;
  
  // Clamped display values (for UI - safe to show)
  displayOccupancy: number;       // clamped 0-100
  displayConfidence: number;      // rounded to bucket (0,25,50,75,100)
  
  // Backward-compatible aliases
  inventory: number;             // = remainingInventory
  maxInventory: number;          // = totalInventory
  
  // Section 2.2: Booking-derived Metrics
  pickup7d: number;
  pickup24h: number;
  baselinePickup7d: number;
  bookingsCount: number;
  
  // Section 2.3: Baseline
  baselineOccupancy: number;
  baselineBookings: number;
  baselineReliability: BaselineReliability;
  baselineWeeksAvailable: number;
  
  // Section 2.4: Velocity vs Baseline
  velocityDeltaAbs: number;
  velocityDeltaPct: number | null;
  velocity: number;              // = velocityDeltaPct ?? 0
  velocityAbsolute: number;      // = velocityDeltaAbs
  velocity7d: number;
  velocity24h: number;
  
  // Current rate info
  currentRate: number | null;
  ratePlanName: string | null;
  
  // Lead time
  leadTime: number;
  
  // Section 3: Quality Flags
  flags: QualityFlags;
  
  // Section 4: Data Confidence
  dataConfidence: number;
  confidence: number;            // = dataConfidence * 100
  confidenceReasons: string[];
  confidenceFactors: string[];   // = confidenceReasons
  
  // Section 5: Eligibility
  eligibilityLevel: EligibilityLevel;
  eligibilityReasons: string[];
  
  // Signals
  demandSignal: DemandSignal;
  pricingSignal: PricingSignal;
  signalSeverity: SignalSeverity;
  warning: WarningType;
  
  // R2: Inventory Intent (legacy)
  inventoryIntent: InventoryIntent;
  
  // NEW: Inventory Status (TOP 1 SPEC)
  inventoryStatusInfo: InventoryStatusInfo;
  
  // R3: Volume Qualifier
  volumeQualifier: VolumeQualifier;
  
  // Auto-Gating (Section 5.2)
  isAutoEligible: boolean;
  autoGateReasons: string[];
  
  // Data source info
  hasInventoryData: boolean;
  hasBookingData: boolean;       // NEW: indicates if booking data is available for this property
  stopSell: boolean;
  dataFreshnessMinutes: number;
}

export interface BookingPacePoint {
  daysBeforeCheckin: number;
  currentPace: number; // % inventory sold
  baselinePace: number; // Historical average
}

export interface MarketKPIs {
  avgOccupancy: number;
  bookingVelocity: number | null; // % change vs baseline, null if insufficient data
  daysToFull: number;
  inventoryAtRisk: number; // % of days with vacancy risk
  totalInventory: number;
  totalBooked: number;
  selloutRiskDays: number;
  vacancyRiskDays: number;
  dataFreshnessMinutes: number;
  coverageRatio: number; // % of cells with inventory data
  hasBookingData: boolean; // NEW: indicates if booking data exists for this property
}

export interface InsightsResult {
  calendarData: CalendarDay[];
  kpis: MarketKPIs;
  alerts: Alert[];
  bookingPace: BookingPacePoint[];
  dataFreshness: {
    lastSync: Date | null;
    minutesAgo: number;
    isStale: boolean; // > 60 minutes
  };
}

// ============================================
// DATA FETCHING HOOKS
// ============================================

// Fetch ALL Channex properties from channex_mappings that have inventory data
export function useAnGiaPropertiesForPricing() {
  return useQuery({
    queryKey: ['all-channex-properties-pricing'],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Fetch ALL properties from channex_mappings (no group filter)
      const { data: mappings, error } = await supabase
        .from("channex_mappings")
        .select("id, channex_property_id, property_name")
        .not("property_name", "is", null)
        .order("property_name");

      if (error) throw error;
      if (!mappings || mappings.length === 0) return [];

      // Get inventory count per mapping to find the one with most data
      // NOTE: backend default limit is 1000 rows, so we must page through results.
      const mappingIds = mappings.map(m => m.id);

      const inventoryCountMap = new Map<string, number>();
      const pageSize = 10000;
      const maxRows = 200000;

      const buildInventoryCountQuery = () =>
        supabase
          .from("inventory_cells")
          .select("property_id")
          .in("property_id", mappingIds);

      for (let from = 0; from < maxRows; from += pageSize) {
        const { data: page, error: invCountErr } = await buildInventoryCountQuery().range(from, from + pageSize - 1);
        if (invCountErr) throw invCountErr;
        if (!page || page.length === 0) break;

        page.forEach((ic) => {
          const count = inventoryCountMap.get(ic.property_id) || 0;
          inventoryCountMap.set(ic.property_id, count + 1);
        });

        if (page.length < pageSize) break;
      }

      // Also check for room types (some properties may have room types but pending inventory sync)
      const channexPropertyIds = mappings.map(m => m.channex_property_id);
      const { data: roomTypesData } = await supabase
        .from("room_types_mirror")
        .select("provider_property_id")
        .in("provider_property_id", channexPropertyIds);

      const propertiesWithRoomTypes = new Set(
        roomTypesData?.map(r => r.provider_property_id) || []
      );

      // Group mappings by channex_property_id, then pick the one with most inventory
      const mappingsByProperty = new Map<string, typeof mappings>();
      for (const m of mappings) {
        const existing = mappingsByProperty.get(m.channex_property_id) || [];
        existing.push(m);
        mappingsByProperty.set(m.channex_property_id, existing);
      }

      const uniqueProperties: Property[] = [];
      
      for (const [channexPropId, propMappings] of mappingsByProperty) {
        // Sort by inventory count DESC, pick the one with most data
        const sorted = propMappings.sort((a, b) => {
          const aCount = inventoryCountMap.get(a.id) || 0;
          const bCount = inventoryCountMap.get(b.id) || 0;
          return bCount - aCount;
        });
        
        const bestMapping = sorted[0];
        const hasInventory = (inventoryCountMap.get(bestMapping.id) || 0) > 0;
        const hasRoomTypes = propertiesWithRoomTypes.has(channexPropId);
        
        if (hasInventory || hasRoomTypes) {
          uniqueProperties.push({
            id: bestMapping.id,
            channex_property_id: bestMapping.channex_property_id,
            property_name: bestMapping.property_name || 'Unknown Property',
          });
        }
      }
      
      // Sort final result by property_name
      return uniqueProperties.sort((a, b) => a.property_name.localeCompare(b.property_name));
    },
  });
}

// Fetch room types for a property (using channex_property_id)
export function useRoomTypesForPricing(channexPropertyId: string | undefined) {
  return useQuery({
    queryKey: ['room-types-pricing', channexPropertyId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!channexPropertyId) return [];

      const { data, error } = await supabase
        .from("room_types_mirror")
        .select("id, provider_room_type_id, provider_property_id, room_type_name, occupancy, raw_data")
        .eq("provider_property_id", channexPropertyId)
        .order("room_type_name");

      if (error) throw error;
      
      return (data || []).map(rt => {
        const rawData = rt.raw_data as { count_of_rooms?: number } | null;
        return {
          id: rt.id,
          provider_room_type_id: rt.provider_room_type_id,
          provider_property_id: rt.provider_property_id,
          room_type_name: rt.room_type_name,
          occupancy: rt.occupancy || 2,
          count_of_rooms: rawData?.count_of_rooms || 1,
        };
      }) as RoomType[];
    },
    enabled: !!channexPropertyId,
  });
}

// ============================================
// MAIN HOOK - Enterprise Spec Implementation
// ============================================

export function useAIPricingInsights(
  mappingId: string | undefined, // channex_mappings.id - for inventory_cells
  channexPropertyId: string | undefined, // for bookings_mirror
  roomTypeId: string | undefined,
  dateRangeDays: number,
  baselineWeeks: number = 8
): ReturnType<typeof useQuery<InsightsResult>> {
  return useQuery({
    queryKey: ['ai-pricing-insights', mappingId, channexPropertyId, roomTypeId, dateRangeDays, baselineWeeks],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<InsightsResult> => {
      if (!mappingId || !channexPropertyId) {
        return { 
          calendarData: [], 
          kpis: getEmptyKPIs(), 
          alerts: [],
          bookingPace: [],
          dataFreshness: { lastSync: null, minutesAgo: 999, isStale: true }
        };
      }

      const today = startOfToday();
      const now = new Date();

      // Fetch a wider range than what we render to avoid "N/A" when users switch ranges.
      // Additionally, always ensure coverage through end of February (requested).
      const febEndYear = today.getMonth() > 1 ? today.getFullYear() + 1 : today.getFullYear();
      const endOfFeb = endOfMonth(new Date(febEndYear, 1, 1));
      const daysUntilFebEnd = Math.max(0, differenceInDays(endOfFeb, today) + 1);

      const fetchRangeDays = Math.max(dateRangeDays, 60, daysUntilFebEnd);
      const endDate = addDays(today, fetchRangeDays);

      const startDateStr = format(today, 'yyyy-MM-dd');
      const endDateStr = format(endDate, 'yyyy-MM-dd');
      
      // Historical baseline period
      const baselineStart = format(subWeeks(today, baselineWeeks), 'yyyy-MM-dd');

      // ============================================
      // SECTION 1.0: Resolve Room Type ID
      // ============================================
      // UI sends provider_room_type_id but inventory_cells uses room_types_mirror.id
      let resolvedRoomTypeId: string | undefined = undefined;
      if (roomTypeId) {
        const { data: rtMatch } = await supabase
          .from("room_types_mirror")
          .select("id")
          .eq("provider_room_type_id", roomTypeId)
          .eq("provider_property_id", channexPropertyId)
          .maybeSingle();
        
        resolvedRoomTypeId = rtMatch?.id;
        // If no match found, the filter will return empty results (expected behavior)
      }

      // ============================================
      // SECTION 1.1: Fetch Inventory (SoT)
      // ============================================
      const buildInventoryQuery = () => {
        let q = supabase
          .from("inventory_cells")
          .select(
            "cell_date, availability, max_availability, rate, stop_sell, room_type_id, property_id, updated_at, rate_plan_id"
          )
          .eq("property_id", mappingId)
          .gte("cell_date", startDateStr)
          .lte("cell_date", endDateStr)
          .order("cell_date", { ascending: true });

        // Filter by room type if specified (using resolved ID)
        if (resolvedRoomTypeId) {
          q = q.eq("room_type_id", resolvedRoomTypeId);
        }

        return q;
      };

      // CRITICAL: backend default limit is 1000 rows; fetch in pages to ensure full coverage.
      // NOTE: Some properties can have 1000+ rows per day (room types × rate plans).
      // If maxRows is too low, later dates will be missing and UI shows "N/A".
      const pageSize = 10000;
      const maxRows = 250000;
      const inventoryCells: any[] = [];

      for (let from = 0; from < maxRows; from += pageSize) {
        const { data, error } = await buildInventoryQuery().range(from, from + pageSize - 1);
        if (error) throw error;
        if (data?.length) inventoryCells.push(...data);
        if (!data || data.length < pageSize) break;
      }

      // ============================================
      // SECTION 1.2: Fetch Bookings (OTA-only)
      // ============================================
      let bookingsQuery = supabase
        .from("bookings_mirror")
        .select("unified_booking_id, check_in_date, check_out_date, booking_date, booking_status, channex_property_id, channex_room_type_id, total_amount_net, nights")
        .eq("channex_property_id", channexPropertyId)
        .lte("check_in_date", endDateStr)
        .gte("check_out_date", startDateStr)
        .neq("booking_status", "CANCELLED");
      
      // Filter bookings by room type if specified (bookings use provider_room_type_id directly)
      if (roomTypeId) {
        bookingsQuery = bookingsQuery.eq("channex_room_type_id", roomTypeId);
      }

      const { data: currentBookings, error: bookErr } = await bookingsQuery;

      if (bookErr) throw bookErr;

      // Fetch historical bookings for baseline
      let historicalQuery = supabase
        .from("bookings_mirror")
        .select("unified_booking_id, check_in_date, check_out_date, booking_date, channex_property_id, booking_status, channex_room_type_id")
        .eq("channex_property_id", channexPropertyId)
        .gte("check_in_date", baselineStart)
        .lt("check_in_date", startDateStr)
        .neq("booking_status", "CANCELLED");
      
      // Filter historical bookings by room type if specified
      if (roomTypeId) {
        historicalQuery = historicalQuery.eq("channex_room_type_id", roomTypeId);
      }

      const { data: historicalBookings } = await historicalQuery;

      // Get room types count for max inventory calculation
      let roomTypesQuery = supabase
        .from("room_types_mirror")
        .select("provider_room_type_id, occupancy, raw_data")
        .eq("provider_property_id", channexPropertyId);
      
      // If filtering by room type, only count that specific room type
      if (roomTypeId) {
        roomTypesQuery = roomTypesQuery.eq("provider_room_type_id", roomTypeId);
      }

      const { data: roomTypes } = await roomTypesQuery;

      // Calculate max inventory from room types
      let maxInventoryPerDay = 0;
      if (roomTypes) {
        roomTypes.forEach(rt => {
          const rawData = rt.raw_data as { count_of_rooms?: number } | null;
          maxInventoryPerDay += rawData?.count_of_rooms || 1;
        });
      }
      if (maxInventoryPerDay === 0) maxInventoryPerDay = 5; // fallback

      // ============================================
      // SECTION 2.2: STAY-DATE EXPANSION (CRITICAL)
      // ============================================
      // A booking contributes to EACH stay_date where: check_in <= stay_date < check_out
      // Filter by SOLD_BOOKING_STATUSES for sold rooms calculation
      const soldBookings = (currentBookings || []).filter(b => 
        SOLD_BOOKING_STATUSES.includes(b.booking_status)
      );
      const bookingsByStayDate = expandBookingsByStayDate(soldBookings, startDateStr, endDateStr);
      
      // For velocity: use VELOCITY_BOOKING_STATUSES
      const velocityBookings = (currentBookings || []).filter(b => 
        VELOCITY_BOOKING_STATUSES.includes(b.booking_status)
      );
      
      const historicalByStayDate = expandBookingsByStayDate(historicalBookings || [], baselineStart, startDateStr);

      // Calculate baseline by weekday with proper same-weekday logic
      const baselineData = calculateBaselineByWeekday(
        historicalByStayDate,
        maxInventoryPerDay,
        baselineWeeks
      );

      // Calculate data freshness
      let lastSyncTime: Date | null = null;
      if (inventoryCells && inventoryCells.length > 0) {
        const updates = inventoryCells.map(c => new Date(c.updated_at).getTime());
        lastSyncTime = new Date(Math.max(...updates));
      }
      const minutesAgo = lastSyncTime ? differenceInMinutes(now, lastSyncTime) : 999;

      // Group inventory by date
      const inventoryByDate = groupInventoryByDate(inventoryCells || []);
      
      // Calculate velocity metrics (using velocity-eligible bookings)
      const velocityMetrics = calculateVelocityMetrics(velocityBookings, historicalBookings || [], today);
      
      // Pre-calculate velocity_7d per stay-date (bookings created in last 7 days with stay overlap)
      const velocityByStayDate = calculateVelocity7dByStayDate(velocityBookings, startDateStr, endDateStr, today);

      // Determine if this property has booking data in the system
      const hasBookingData = (currentBookings && currentBookings.length > 0) || 
                              (historicalBookings && historicalBookings.length > 0);

      // ============================================
      // BUILD CALENDAR DATA
      // ============================================
      const calendarData: CalendarDay[] = [];
      const alerts: Alert[] = [];

      // Track days with issues for alerts
      const vacancyRiskDates: string[] = [];
      const selloutRiskDates: string[] = [];
      const dataLagDates: string[] = [];
      let cellsWithData = 0;

      for (let i = 0; i < dateRangeDays; i++) {
        const date = addDays(today, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const weekday = getDay(date);
        const leadTime = i;

        // Get inventory for this date
        const dayInventory = inventoryByDate[dateStr] || [];

        // Normalize inventory across rate plans (avoid double-counting per room type)
        // inventory_cells can contain multiple rows per room_type_id (different rate plans).
        // For insight calculations we treat each room type as a single supply bucket.
        const roomTypeInventory = new Map<
          string,
          {
            available: number;
            hasOpenRatePlan: boolean;
            rates: number[];
            hasRatePlan: boolean;
            hasStopSell: boolean;
            hasClosedToArrival: boolean;
            hasClosedToDeparture: boolean;
          }
        >();

        for (const inv of dayInventory) {
          const prev = roomTypeInventory.get(inv.room_type_id) || {
            // IMPORTANT: Availability is meaningful even when stop_sell=true (ops block / closed).
            // We still show it as remaining inventory, but track stop_sell separately for intent/quality.
            available: 0,
            hasOpenRatePlan: false,
            rates: [],
            hasRatePlan: false,
            hasStopSell: false,
            hasClosedToArrival: false,
            hasClosedToDeparture: false,
          };

          // Always keep the max availability we see for this room type (avoid double-count per rate plan)
          prev.available = Math.max(prev.available, inv.availability || 0);

          // Collect rate for display even if stop_sell=true (closed/blocked still has a price)
          // NOTE: PostgREST can return numeric columns as strings; normalize to number to avoid NaN in UI.
          const rateValue = inv.rate == null ? null : Number(inv.rate);
          if (rateValue != null && Number.isFinite(rateValue) && rateValue > 0) prev.rates.push(rateValue);

          // If any rate plan is open, we consider the room type open
          if (!inv.stop_sell) {
            prev.hasOpenRatePlan = true;
          }
          if (inv.rate_plan_id != null) prev.hasRatePlan = true;
          
          // Track closure flags (NEW for inventory status spec)
          if (inv.stop_sell) prev.hasStopSell = true;
          if (inv.closed_to_arrival) prev.hasClosedToArrival = true;
          if (inv.closed_to_departure) prev.hasClosedToDeparture = true;

          roomTypeInventory.set(inv.room_type_id, prev);
        }

        const normalizedRoomTypes = Array.from(roomTypeInventory.values());
        const hasInventoryData = normalizedRoomTypes.length > 0;
        if (hasInventoryData) cellsWithData++;

        // ============================================
        // SECTION 2.1: INVENTORY METRICS (SoT)
        // ============================================
        const totalInventory = maxInventoryPerDay;

        // remaining_inventory from Channel Manager (sellable inventory; stop_sell makes it 0)
        const remainingInventoryRaw = normalizedRoomTypes.reduce(
          (sum, rt) => sum + (rt.hasOpenRatePlan ? rt.available : 0),
          0
        );
        const remainingInventoryFromCM = Math.min(totalInventory, Math.max(0, remainingInventoryRaw));

        // stop_sell flag (for UI / confidence): true if at least one room type is fully stop-sell
        const hasStopSell = normalizedRoomTypes.some(rt => !rt.hasOpenRatePlan);
        
        // NEW: Closure flags for inventory status
        const hasClosedToArrival = normalizedRoomTypes.some(rt => rt.hasClosedToArrival);
        const hasClosedToDeparture = normalizedRoomTypes.some(rt => rt.hasClosedToDeparture);

        // Inventory-derived sold rooms (what CM implies)
        const soldRoomsFromInventory = Math.max(0, totalInventory - remainingInventoryFromCM);

        // ============================================
        // CRITICAL FIX: Occupancy should not treat stop_sell as "sold".
        // Prefer BOOKINGS for sold rooms; clamp to inventory to avoid >100%.
        // ============================================
        const dayBookings = bookingsByStayDate[dateStr] || [];
        const soldRoomsFromBookings = Math.min(totalInventory, dayBookings.length);

        const soldRooms = hasBookingData ? soldRoomsFromBookings : soldRoomsFromInventory;

        // Sellable remaining inventory from Channel Manager (SoT)
        const remainingInventorySellable = remainingInventoryFromCM;

        // Display remaining inventory: keep UI consistent with soldRooms (bookings-based) when we have booking data.
        // This avoids confusing states like 0/6 remaining while occupancy is only 33%.
        const remainingInventoryDisplay = hasBookingData
          ? Math.max(0, totalInventory - soldRooms)
          : remainingInventoryFromCM;

        // occupancy = soldRooms / totalInventory
        const occupancyRate = totalInventory > 0 ? (soldRooms / totalInventory) * 100 : 0;

        // Current rate: derive directly from raw dayInventory as a robust fallback (avoids edge cases in normalization)
        const dayRates = dayInventory
          .map((inv) => (inv.rate == null ? null : Number(inv.rate)))
          .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
        const dayAvgRate = dayRates.length > 0 ? dayRates.reduce((s, v) => s + v, 0) / dayRates.length : null;

        // Get rate info with rate plan certainty
        const allRates = normalizedRoomTypes.flatMap(rt => rt.rates);
        const avgRate = allRates.length > 0
          ? allRates.reduce((s, v) => s + Number(v), 0) / allRates.length
          : null;
        const currentRate = dayAvgRate ?? avgRate;
        const hasRatePlan = normalizedRoomTypes.some(rt => rt.hasRatePlan);
        const ratePlanName = hasRatePlan ? "Standard" : null;

        // ============================================
        // SECTION 2.2: BOOKING-DERIVED METRICS
        // ============================================
        // dayBookings = sold rooms for this stay-date (SOLD_BOOKING_STATUSES)
        // For pickup/velocity we use velocity-eligible bookings with stay overlap
        
        // Velocity 7d per stay-date (SPEC COMPLIANT):
        // = count of bookings created in last 7 days that have stay overlap with D
        // / 7 days
        const velocityData = velocityByStayDate[dateStr] || { count: 0, velocity7d: 0 };
        const pickup7d = velocityData.count;
        
        const pickup24h = dayBookings.filter(b => {
          if (!b.booking_date) return false;
          const bookingDate = parseISO(b.booking_date);
          return differenceInDays(today, bookingDate) <= 1;
        }).length;

        // ============================================
        // SECTION 2.3: BASELINE
        // ============================================
        const baselineOccupancy = baselineData.baselineByWeekday[weekday] || 50;
        const baselinePickup7d = baselineData.baselinePickupByWeekday[weekday] || 0;
        const baselineReliability = baselineData.baselineReliabilityByWeekday[weekday] || 'LOW';
        const baselineWeeksAvailable = baselineData.weeksAvailableByWeekday[weekday] || 0;

        // ============================================
        // SECTION 2.4: VELOCITY VS BASELINE
        // ============================================
        const currentPickup = dayBookings.length;
        const velocityDeltaAbs = currentPickup - baselinePickup7d;
        const velocityDeltaPct = baselinePickup7d > 0 
          ? (velocityDeltaAbs / baselinePickup7d) * 100
          : null;

        // ============================================
        // SECTION 3: QUALITY FLAGS
        // ============================================
        const flags = calculateQualityFlags({
          freshnessMinutes: minutesAgo,
          baselineReliability,
          baselinePickup: baselinePickup7d,
          hasStopSell,
          inventoryIntent: determineInventoryIntent(remainingInventorySellable, hasStopSell, soldRoomsFromInventory, totalInventory),
          soldRoomsFromInventory: soldRoomsFromInventory,
          soldRoomsFromBookings: dayBookings.length,
          hasRatePlan,
          totalInventory,
          hasInventoryData,
        });

        // ============================================
        // SECTION 4: DATA CONFIDENCE
        // ============================================
        const { confidence, reasons } = calculateDataConfidence(flags);

        // ============================================
        // SECTION 5: ELIGIBILITY & GOVERNANCE
        // ============================================
        const { eligibilityLevel, eligibilityReasons } = calculateEligibility({
          totalInventory,
          hasInventoryData,
          dataConfidence: confidence,
          baselineReliability,
        });

        // Auto-gating
        const { isAutoEligible, autoGateReasons } = calculateAutoGateEligibility({
          dataFreshness: minutesAgo,
          baselineReliability,
          volumeQualifier: determineVolumeQualifier(baselinePickup7d, dayBookings.length),
          inventoryIntent: determineInventoryIntent(remainingInventorySellable, hasStopSell, soldRooms, totalInventory),
          hasInventoryData,
          flags,
        });

        // ============================================
        // SECTION 6: SIGNAL LOGIC
        // ============================================
        const signalResult = calculateSignals({
          occupancyRate,
          baselineOccupancy,
          baselineReliability,
          leadTime,
          velocityDeltaPct,
          remainingInventory: remainingInventorySellable,
          totalInventory,
          hasInventoryData,
          flags,
          dataConfidence: confidence,
        });

        // Track for alerts
        if (signalResult.warning === 'vacancy_risk') vacancyRiskDates.push(dateStr);
        if (signalResult.warning === 'sellout_risk') selloutRiskDates.push(dateStr);
        if (flags.DATA_LAG) dataLagDates.push(dateStr);

        // ============================================
        // INSIGHT VALIDATION LAYER (Enterprise Fix)
        // ============================================
        const insightStateInfo = calculateInsightState({
          remainingInventory: remainingInventorySellable,
          totalInventory,
          occupancyRate,
          bookingsCount: dayBookings.length,
          flags,
          dataConfidence: confidence,
          dataFreshnessMinutes: minutesAgo,
        });

        // Clamped display values
        const displayOccupancy = clampOccupancy(occupancyRate);
        const displayConfidence = clampConfidenceToBucket(confidence);

        // ============================================
        // NEW: INVENTORY STATUS (TOP 1 SPEC)
        // ============================================
        const inventoryStatusInfo = determineInventoryStatus({
          remainingInventory: remainingInventorySellable,
          soldRooms,
          capacity: totalInventory,
          stopSell: hasInventoryData ? hasStopSell : null,
          closedToArrival: hasInventoryData ? hasClosedToArrival : null,
          closedToDeparture: hasInventoryData ? hasClosedToDeparture : null,
          deltaRemaining24h: null, // TODO: Implement snapshot tracking for this
          dataLagMinutes: minutesAgo,
        });

        calendarData.push({
          date,
          dateStr,
          // Insight State
          insightState: insightStateInfo.state,
          insightStateInfo,
          totalInventory,
          // Keep SoT sellable inventory here
          remainingInventory: remainingInventorySellable,
          soldRooms,
          occupancyRate,
          displayOccupancy,
          displayConfidence,
          // Backward-compatible aliases used by UI
          inventory: remainingInventoryDisplay,
          maxInventory: totalInventory,
          pickup7d,
          pickup24h,
          baselinePickup7d,
          bookingsCount: dayBookings.length,
          baselineOccupancy,
          baselineBookings: baselinePickup7d,
          baselineReliability,
          baselineWeeksAvailable,
          velocityDeltaAbs,
          velocityDeltaPct,
          velocity: velocityDeltaPct ?? 0,
          velocityAbsolute: velocityDeltaAbs,
          velocity7d: velocityData.velocity7d,
          velocity24h: velocityMetrics.velocity24h,
          currentRate,
          ratePlanName,
          leadTime,
          flags,
          dataConfidence: confidence,
          confidence: confidence * 100,
          confidenceReasons: reasons,
          confidenceFactors: reasons,
          eligibilityLevel,
          eligibilityReasons,
          demandSignal: signalResult.demandSignal,
          pricingSignal: signalResult.pricingSignal,
          signalSeverity: signalResult.signalSeverity,
          warning: signalResult.warning,
          inventoryIntent: determineInventoryIntent(remainingInventorySellable, hasStopSell, soldRooms, totalInventory),
          inventoryStatusInfo, // NEW
          volumeQualifier: determineVolumeQualifier(baselinePickup7d, dayBookings.length),
          isAutoEligible,
          autoGateReasons,
          hasInventoryData,
          hasBookingData,
          stopSell: hasStopSell,
          dataFreshnessMinutes: minutesAgo,
        });
      }

      // ============================================
      // GENERATE ALERTS
      // ============================================
      if (vacancyRiskDates.length > 0) {
        alerts.push({
          type: 'vacancy',
          message: `${vacancyRiskDates.length} ngày có nguy cơ trống phòng cao trong ${dateRangeDays} ngày tới`,
          severity: vacancyRiskDates.length > 3 ? 'critical' : 'warning',
          affectedDates: vacancyRiskDates,
        });
      }
      if (selloutRiskDates.length > 0) {
        alerts.push({
          type: 'sellout',
          message: `${selloutRiskDates.length} ngày có thể hết phòng sớm`,
          severity: 'info',
          affectedDates: selloutRiskDates,
        });
      }
      if (dataLagDates.length > calendarData.length * 0.3) {
        alerts.push({
          type: 'data_issue',
          message: `Dữ liệu inventory bị trễ (> 2 giờ) ở ${dataLagDates.length} ngày`,
          severity: 'warning',
          affectedDates: dataLagDates,
        });
      }
      if (minutesAgo > 60) {
        alerts.push({
          type: 'data_issue',
          message: `Dữ liệu chưa được đồng bộ trong ${Math.round(minutesAgo / 60)} giờ`,
          severity: minutesAgo > 360 ? 'critical' : 'warning',
          affectedDates: [],
        });
      }

      // Calculate booking pace curve
      const bookingPace = calculateBookingPace(calendarData);

      // Calculate KPIs
      const kpis = calculateKPIs(calendarData, velocityMetrics.overallVelocity, minutesAgo, selloutRiskDates.length, vacancyRiskDates.length, cellsWithData, dateRangeDays, hasBookingData);

      return { 
        calendarData, 
        kpis,
        alerts,
        bookingPace,
        dataFreshness: {
          lastSync: lastSyncTime,
          minutesAgo,
          isStale: minutesAgo > 60,
        }
      };
    },
    enabled: !!mappingId && !!channexPropertyId,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function groupInventoryByDate(cells: InventoryCell[]): Record<string, InventoryCell[]> {
  return cells.reduce((acc, cell) => {
    // Defensive: normalize date keys in case backend returns a timestamp-like string.
    const key = (cell.cell_date || '').slice(0, 10);
    if (!key) return acc;

    if (!acc[key]) acc[key] = [];
    acc[key].push(cell);
    return acc;
  }, {} as Record<string, InventoryCell[]>);
}

/**
 * SECTION 1.2: Stay-date expansion (CRITICAL)
 * A booking contributes to each stay_date where: check_in_date <= stay_date < check_out_date
 * This is exclusive checkout as per enterprise spec
 */
function expandBookingsByStayDate(
  bookings: Array<{ check_in_date: string; check_out_date: string; booking_date?: string | null; [key: string]: unknown }>,
  rangeStart: string,
  rangeEnd: string
): Record<string, typeof bookings> {
  const result: Record<string, typeof bookings> = {};
  const start = parseISO(rangeStart);
  const end = parseISO(rangeEnd);

  bookings.forEach(booking => {
    const checkIn = parseISO(booking.check_in_date);
    const checkOut = parseISO(booking.check_out_date);

    // Generate all stay dates for this booking (exclusive checkout)
    try {
      const stayDates = eachDayOfInterval({
        start: checkIn,
        end: addDays(checkOut, -1), // Exclusive checkout
      });

      stayDates.forEach(stayDate => {
        // Only include if within our range
        if (stayDate >= start && stayDate < end) {
          const dateStr = format(stayDate, 'yyyy-MM-dd');
          if (!result[dateStr]) result[dateStr] = [];
          result[dateStr].push(booking);
        }
      });
    } catch {
      // Invalid interval (checkOut <= checkIn), skip
    }
  });

  return result;
}

/**
 * SECTION 4.5: Velocity 7d per stay-date (SPEC COMPLIANT)
 * 
 * velocity_7d(D) = bookings_created_7d(D) / 7
 * 
 * where bookings_created_7d(D) = count of distinct bookings where:
 *   - booking_date ∈ [NOW - 7 days, NOW]
 *   - check_in_date <= D < check_out_date (stay overlap)
 *   - booking_status ∈ VELOCITY_BOOKING_STATUSES
 */
function calculateVelocity7dByStayDate(
  bookings: Array<{ check_in_date: string; check_out_date: string; booking_date?: string | null; unified_booking_id: string; [key: string]: unknown }>,
  rangeStart: string,
  rangeEnd: string,
  today: Date
): Record<string, { count: number; velocity7d: number }> {
  const result: Record<string, { count: number; velocity7d: number }> = {};
  const start = parseISO(rangeStart);
  const end = parseISO(rangeEnd);
  const sevenDaysAgo = addDays(today, -7);

  // Filter bookings created in last 7 days
  const recentBookings = bookings.filter(b => {
    if (!b.booking_date) return false;
    const bookingDate = parseISO(b.booking_date);
    return bookingDate >= sevenDaysAgo && bookingDate <= today;
  });

  // For each day in range, count bookings with stay overlap
  const daysInRange = eachDayOfInterval({ start, end: addDays(end, -1) });
  
  daysInRange.forEach(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    
    // Count distinct bookings that have stay overlap with this day
    const bookingsWithOverlap = recentBookings.filter(b => {
      const checkIn = parseISO(b.check_in_date);
      const checkOut = parseISO(b.check_out_date);
      // Stay overlap: check_in_date <= D < check_out_date
      return checkIn <= day && day < checkOut;
    });

    // Use Set to ensure distinct booking IDs
    const distinctBookingIds = new Set(bookingsWithOverlap.map(b => b.unified_booking_id));
    const count = distinctBookingIds.size;
    
    result[dateStr] = {
      count,
      velocity7d: count / 7, // bookings per day
    };
  });

  return result;
}

interface BaselineData {
  baselineByWeekday: Record<number, number>;
  baselinePickupByWeekday: Record<number, number>;
  baselineReliabilityByWeekday: Record<number, BaselineReliability>;
  weeksAvailableByWeekday: Record<number, number>;
}

function calculateBaselineByWeekday(
  bookingsByStayDate: Record<string, unknown[]>,
  maxInventory: number,
  baselineWeeks: number
): BaselineData {
  // Group stay dates by weekday and count bookings
  const weekdayData: Record<number, { dates: string[]; bookings: number }> = {
    0: { dates: [], bookings: 0 },
    1: { dates: [], bookings: 0 },
    2: { dates: [], bookings: 0 },
    3: { dates: [], bookings: 0 },
    4: { dates: [], bookings: 0 },
    5: { dates: [], bookings: 0 },
    6: { dates: [], bookings: 0 },
  };

  Object.entries(bookingsByStayDate).forEach(([dateStr, bookings]) => {
    const date = parseISO(dateStr);
    const weekday = getDay(date);
    if (!weekdayData[weekday].dates.includes(dateStr)) {
      weekdayData[weekday].dates.push(dateStr);
    }
    weekdayData[weekday].bookings += bookings.length;
  });

  const baselineByWeekday: Record<number, number> = {};
  const baselinePickupByWeekday: Record<number, number> = {};
  const baselineReliabilityByWeekday: Record<number, BaselineReliability> = {};
  const weeksAvailableByWeekday: Record<number, number> = {};

  for (let i = 0; i < 7; i++) {
    const data = weekdayData[i];
    const weeksWithData = data.dates.length;
    weeksAvailableByWeekday[i] = weeksWithData;

    // Average bookings per weekday occurrence
    const avgBookings = weeksWithData > 0 ? data.bookings / weeksWithData : 0;
    baselinePickupByWeekday[i] = avgBookings;

    // Convert to occupancy percentage
    baselineByWeekday[i] = maxInventory > 0 ? (avgBookings / maxInventory) * 100 : 50;

    // Baseline reliability (per spec section 2.3)
    if (weeksWithData < 4) {
      baselineReliabilityByWeekday[i] = 'LOW';
    } else if (avgBookings < 3) {
      baselineReliabilityByWeekday[i] = 'LOW'; // LOW_VOLUME
    } else if (weeksWithData < 6) {
      baselineReliabilityByWeekday[i] = 'MEDIUM';
    } else {
      baselineReliabilityByWeekday[i] = 'HIGH';
    }
  }

  return {
    baselineByWeekday,
    baselinePickupByWeekday,
    baselineReliabilityByWeekday,
    weeksAvailableByWeekday,
  };
}

interface VelocityMetrics {
  overallVelocity: number;
  velocity7d: number;
  velocity24h: number;
}

function calculateVelocityMetrics(
  currentBookings: Booking[],
  historicalBookings: unknown[],
  today: Date
): VelocityMetrics {
  // Last 7 days bookings
  const recent7d = currentBookings.filter(b => {
    if (!b.booking_date) return false;
    const bookingDate = parseISO(b.booking_date);
    return differenceInDays(today, bookingDate) <= 7;
  }).length;

  // Last 24 hours bookings
  const recent24h = currentBookings.filter(b => {
    if (!b.booking_date) return false;
    const bookingDate = parseISO(b.booking_date);
    return differenceInDays(today, bookingDate) <= 1;
  }).length;

  // Historical average per week
  const historicalWeeklyAvg = historicalBookings.length / 8;
  const historicalDailyAvg = historicalWeeklyAvg / 7;

  const velocity7d = historicalWeeklyAvg > 0 
    ? ((recent7d - historicalWeeklyAvg) / historicalWeeklyAvg) * 100
    : 0;

  const velocity24h = historicalDailyAvg > 0 
    ? ((recent24h - historicalDailyAvg) / historicalDailyAvg) * 100
    : 0;

  return { overallVelocity: velocity7d, velocity7d, velocity24h };
}

// R2: Determine inventory intent (legacy - kept for backward compat)
function determineInventoryIntent(
  remainingInventory: number,
  hasStopSell: boolean,
  soldRooms: number,
  totalInventory: number
): InventoryIntent {
  // If remaining is 0 and we had high bookings, likely real sold out
  if (remainingInventory === 0 && soldRooms >= totalInventory * 0.8) {
    return 'SOLD_OUT_REAL';
  }
  // Stop-sell with low bookings suggests operational block
  if (hasStopSell && soldRooms < totalInventory * 0.5) {
    return 'OPS_BLOCK';
  }
  // Stop-sell with no indication
  if (hasStopSell) {
    return 'UNKNOWN';
  }
  // Zero remaining but low bookings - could be maintenance or owner hold
  if (remainingInventory === 0 && soldRooms < totalInventory * 0.3) {
    return 'UNKNOWN';
  }
  return 'SOLD_OUT_REAL';
}

// ============================================
// NEW: INVENTORY STATUS LOGIC (TOP 1 SPEC)
// ============================================
// Priority: BLOCKED > SOLD_OUT > INVENTORY_CUT > NORMAL > UNKNOWN
interface InventoryStatusInput {
  remainingInventory: number;
  soldRooms: number;
  capacity: number;
  stopSell: boolean | null;
  closedToArrival: boolean | null;
  closedToDeparture: boolean | null;
  deltaRemaining24h: number | null;
  dataLagMinutes: number;
}

function determineInventoryStatus(input: InventoryStatusInput): InventoryStatusInfo {
  const { remainingInventory, soldRooms, capacity, stopSell, closedToArrival, closedToDeparture, deltaRemaining24h, dataLagMinutes } = input;
  
  // Create evidence object
  const evidence = {
    soldRooms,
    remainingRooms: remainingInventory,
    capacity,
    stopSell,
    closedToArrival,
    closedToDeparture,
    deltaRemaining24h,
    dataLagMinutes,
  };

  // Check if any closure flag is set
  const hasClosureFlag = stopSell === true || closedToArrival === true || closedToDeparture === true;
  const hasRestrictionData = stopSell !== null;
  
  // ============================================
  // A) BLOCKED (Khóa bán / Stop-sell) - HIGHEST PRIORITY
  // ============================================
  if (hasClosureFlag) {
    let explanation = 'Ngày này đang bật stop-sell';
    if (closedToArrival) explanation = 'Ngày này đang đóng nhận khách (CTA)';
    if (closedToDeparture) explanation = 'Ngày này đang đóng trả phòng (CTD)';
    if (stopSell) explanation = 'Ngày này đang bật stop-sell nên không bán được';
    
    return {
      status: 'BLOCKED',
      label: 'Khóa bán',
      explanation,
      evidence,
    };
  }

  // ============================================
  // B) SOLD_OUT (Hết do khách đặt)
  // ============================================
  if (remainingInventory === 0 && soldRooms > 0 && !hasClosureFlag) {
    return {
      status: 'SOLD_OUT',
      label: 'Hết do khách đặt',
      explanation: 'Availability về 0 vì đã bán hết capacity.',
      evidence,
    };
  }

  // ============================================
  // C) INVENTORY_CUT (Tồn kho bị điều chỉnh)
  // ============================================
  // Condition: delta_remaining decreased significantly without corresponding booking increase
  // and no closure flags
  if (deltaRemaining24h !== null && deltaRemaining24h < -1 && !hasClosureFlag) {
    // Check if the decrease is NOT explained by sold rooms
    // If delta is -3 but we only had +1 booking, it's an inventory cut
    const unexplainedDecrease = Math.abs(deltaRemaining24h) > soldRooms;
    if (unexplainedDecrease) {
      return {
        status: 'INVENTORY_CUT',
        label: 'Tồn kho bị điều chỉnh',
        explanation: 'Availability giảm do cập nhật allotment/sync, không tương ứng booking.',
        evidence,
      };
    }
  }

  // ============================================
  // D) NORMAL (Bình thường / ổn định)
  // ============================================
  if (remainingInventory > 0) {
    return {
      status: 'NORMAL',
      label: 'Bình thường',
      explanation: 'Tồn kho còn, không có dấu hiệu khóa bán hoặc điều chỉnh bất thường.',
      evidence,
    };
  }

  // ============================================
  // E) UNKNOWN (Không xác định)
  // ============================================
  // Only when:
  // - No restriction data available
  // - AND remaining=0, sold=0 (can't determine why)
  // - OR no snapshot to detect inventory cut
  if (remainingInventory === 0 && soldRooms === 0 && !hasRestrictionData) {
    return {
      status: 'UNKNOWN',
      label: 'Không xác định',
      explanation: 'Chưa đủ dữ liệu restriction/snapshot để phân biệt do khách đặt hay do khóa/điều chỉnh tồn kho.',
      evidence,
    };
  }

  // Edge case: remaining=0, sold=0 but we have restriction data (all false)
  // This could be inventory cut or data issue
  if (remainingInventory === 0 && soldRooms === 0) {
    if (deltaRemaining24h === null) {
      return {
        status: 'UNKNOWN',
        label: 'Không xác định',
        explanation: 'Thiếu dữ liệu snapshot nên chưa kết luận được nguyên nhân.',
        evidence,
      };
    }
    // We have delta but didn't trigger inventory_cut - must be something else
    return {
      status: 'INVENTORY_CUT',
      label: 'Tồn kho bị điều chỉnh',
      explanation: 'Availability về 0 nhưng không có booking, có thể do điều chỉnh allotment.',
      evidence,
    };
  }

  // Fallback to NORMAL if remaining > 0
  return {
    status: 'NORMAL',
    label: 'Bình thường',
    explanation: 'Tồn kho còn, không có dấu hiệu bất thường.',
    evidence,
  };
}

// R3: Determine volume qualifier
function determineVolumeQualifier(baselinePickup: number, currentBookings: number): VolumeQualifier {
  const avgBookings = (baselinePickup + currentBookings) / 2;
  if (avgBookings < 3) return 'LOW_VOLUME';
  if (avgBookings > 10) return 'HIGH';
  return 'NORMAL';
}

// ============================================
// SECTION 3: QUALITY FLAGS
// ============================================

interface FlagInput {
  freshnessMinutes: number;
  baselineReliability: BaselineReliability;
  baselinePickup: number;
  hasStopSell: boolean;
  inventoryIntent: InventoryIntent;
  soldRoomsFromInventory: number;
  soldRoomsFromBookings: number;
  hasRatePlan: boolean;
  totalInventory: number;
  hasInventoryData: boolean;
}

function calculateQualityFlags(input: FlagInput): QualityFlags {
  // NOTE: soldRoomsFromInventory (total - available) vs soldRoomsFromBookings (booking count)
  // are NOT directly comparable because:
  // 1. One booking can have multiple rooms
  // 2. Inventory can be blocked for non-booking reasons (maintenance, owner holds, stop-sell)
  // 3. Bookings from OTA may not reflect all inventory usage (manual blocks, etc.)
  // 
  // IMPORTANT: In most hotel operations, inventory being blocked (stop_sell, maintenance)
  // is NORMAL and should NOT invalidate insights. We only flag when:
  // - Bookings EXCEED available inventory (which is truly anomalous)
  // 
  // DISABLE THIS FLAG FOR NOW: The comparison is fundamentally flawed in this data model
  // soldRoomsFromInventory = totalInventory - availableInventory (includes all blocks)
  // soldRoomsFromBookings = count of booking records (not room count, not including blocks)
  const hasMeaningfulMismatch = false; // Disabled - metrics not comparable
  
  return {
    // 3.1: Data freshness
    DATA_LAG: input.freshnessMinutes > 120, // > 2 hours
    
    // 3.2: Baseline quality
    BASELINE_LOW: input.baselineReliability === 'LOW',
    LOW_VOLUME: input.baselinePickup < 3,
    
    // 3.3: Stop sell
    STOP_SELL: input.hasStopSell,
    INTENT_UNKNOWN: input.inventoryIntent === 'UNKNOWN',
    
    // 3.4: Inventory-booking mismatch (audit flag)
    // DISABLED: soldRoomsFromInventory and soldRoomsFromBookings are not comparable
    // soldRoomsFromInventory includes stop-sell, maintenance, owner blocks
    // soldRoomsFromBookings is just booking count (not room count)
    INVENTORY_BOOKING_MISMATCH: hasMeaningfulMismatch,
    
    // 3.5: Rate plan certainty
    RATEPLAN_UNCERTAIN: !input.hasRatePlan,
    
    // Lifecycle limitation flag
    LIFECYCLE_LIMITED: true, // MVP mode - we don't track cancel/modify lifecycle
    
    // Data validity - only invalid if no inventory data at all
    DATA_INVALID: input.totalInventory <= 0,
  };
}

// ============================================
// INSIGHT VALIDATION LAYER (Enterprise Fix)
// Determines InsightState: VALID | DEGRADED | INVALID
// ============================================

interface InsightValidationInput {
  remainingInventory: number;
  totalInventory: number;
  occupancyRate: number;
  bookingsCount: number;
  flags: QualityFlags;
  dataConfidence: number;
  dataFreshnessMinutes: number;
}

const DATA_LAG_THRESHOLD = 120; // 2 hours

function calculateInsightState(input: InsightValidationInput): InsightStateInfo {
  const reasons: string[] = [];
  
  // ============================================
  // INVALID CONDITIONS (any one = INVALID)
  // ============================================
  const isInvalid = 
    input.remainingInventory < 0 ||
    input.totalInventory <= 0 ||
    input.remainingInventory > input.totalInventory ||
    input.occupancyRate < 0 ||
    input.occupancyRate > 100 ||
    input.bookingsCount < 0 ||
    input.flags.INVENTORY_BOOKING_MISMATCH ||
    input.flags.DATA_INVALID;

  if (isInvalid) {
    if (input.remainingInventory < 0) reasons.push("Remaining inventory < 0");
    if (input.totalInventory <= 0) reasons.push("Total inventory <= 0");
    if (input.remainingInventory > input.totalInventory) reasons.push("Remaining > Total inventory");
    if (input.occupancyRate < 0 || input.occupancyRate > 100) reasons.push("Occupancy out of valid range (0-100%)");
    if (input.bookingsCount < 0) reasons.push("Booking count < 0");
    if (input.flags.INVENTORY_BOOKING_MISMATCH) reasons.push("Inventory-booking mismatch detected");
    if (input.flags.DATA_INVALID) reasons.push("Data marked as invalid");
    
    return {
      state: 'INVALID',
      reasons,
      canShowKPI: false,
      canShowChart: false,
      canShowSignal: false,
      canShowExplanation: false,
      canClick: false,
    };
  }

  // ============================================
  // DEGRADED CONDITIONS
  // ============================================
  const isDegraded = 
    input.flags.LOW_VOLUME ||
    input.flags.BASELINE_LOW ||
    input.dataFreshnessMinutes > DATA_LAG_THRESHOLD;

  if (isDegraded) {
    if (input.flags.LOW_VOLUME) reasons.push("Low booking volume");
    if (input.flags.BASELINE_LOW) reasons.push("Baseline reliability low");
    if (input.dataFreshnessMinutes > DATA_LAG_THRESHOLD) reasons.push(`Data lag > ${DATA_LAG_THRESHOLD} minutes`);

    return {
      state: 'DEGRADED',
      reasons,
      canShowKPI: true, // but clamped
      canShowChart: true,
      canShowSignal: true, // advisory only
      canShowExplanation: true,
      canClick: true,
    };
  }

  // ============================================
  // VALID
  // ============================================
  return {
    state: 'VALID',
    reasons: [],
    canShowKPI: true,
    canShowChart: true,
    canShowSignal: true,
    canShowExplanation: true,
    canClick: true,
  };
}

// Clamp confidence to buckets (0, 25, 50, 75, 100) per spec
function clampConfidenceToBucket(confidence: number): number {
  const pct = confidence * 100;
  if (pct <= 12.5) return 0;
  if (pct <= 37.5) return 25;
  if (pct <= 62.5) return 50;
  if (pct <= 87.5) return 75;
  return 100;
}

// Clamp occupancy to 0-100
function clampOccupancy(occupancy: number): number {
  return Math.max(0, Math.min(100, occupancy));
}

// ============================================
// SECTION 4: DATA CONFIDENCE
// ============================================

function calculateDataConfidence(flags: QualityFlags): { confidence: number; reasons: string[] } {
  let confidence = 0.90; // Base score per spec
  const reasons: string[] = [];

  // Section 4.2: Penalties
  if (flags.DATA_LAG) {
    confidence -= 0.10;
    reasons.push("Dữ liệu cũ (DATA_LAG: -10%)");
  }
  if (flags.BASELINE_LOW) {
    confidence -= 0.20;
    reasons.push("Baseline yếu (BASELINE_LOW: -20%)");
  }
  if (flags.LOW_VOLUME) {
    confidence -= 0.10;
    reasons.push("Sample size thấp (LOW_VOLUME: -10%)");
  }
  if (flags.INVENTORY_BOOKING_MISMATCH) {
    confidence -= 0.20;
    reasons.push("Inventory-Booking không khớp (MISMATCH: -20%)");
  }
  if (flags.STOP_SELL && flags.INTENT_UNKNOWN) {
    confidence -= 0.10;
    reasons.push("Stop-sell + Intent unknown: -10%");
  }
  if (flags.RATEPLAN_UNCERTAIN) {
    confidence -= 0.05;
    reasons.push("Rate plan không xác định (-5%)");
  }
  if (flags.DATA_INVALID) {
    confidence = 0;
    reasons.push("Dữ liệu không hợp lệ (DATA_INVALID)");
  }

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    reasons,
  };
}

// ============================================
// SECTION 5: ELIGIBILITY & GOVERNANCE
// ============================================

interface EligibilityInput {
  totalInventory: number;
  hasInventoryData: boolean;
  dataConfidence: number;
  baselineReliability: BaselineReliability;
}

function calculateEligibility(input: EligibilityInput): { eligibilityLevel: EligibilityLevel; eligibilityReasons: string[] } {
  const reasons: string[] = [];
  const C_MIN = 0.6; // Minimum confidence for signal eligibility

  // Level A — Insight Eligible (được phân tích)
  if (input.totalInventory <= 0 || !input.hasInventoryData) {
    reasons.push("Không đủ dữ liệu inventory");
    return { eligibilityLevel: 'NONE', eligibilityReasons: reasons };
  }

  // Level B — Signal Eligible (được phép hiển thị signal)
  if (input.dataConfidence < C_MIN) {
    reasons.push(`Data confidence < ${C_MIN * 100}%`);
    return { eligibilityLevel: 'A_INSIGHT', eligibilityReasons: reasons };
  }
  if (input.baselineReliability === 'LOW') {
    reasons.push("Baseline reliability = LOW");
    return { eligibilityLevel: 'A_INSIGHT', eligibilityReasons: reasons };
  }

  // Level C — Recommendation Eligible (Phase 2)
  // For now, we're in Phase 1 so max is B_SIGNAL
  return { eligibilityLevel: 'B_SIGNAL', eligibilityReasons: [] };
}

// ============================================
// SECTION 5.2: AUTO-GATING
// ============================================

interface AutoGateInput {
  dataFreshness: number;
  baselineReliability: BaselineReliability;
  volumeQualifier: VolumeQualifier;
  inventoryIntent: InventoryIntent;
  hasInventoryData: boolean;
  flags: QualityFlags;
}

function calculateAutoGateEligibility(input: AutoGateInput): { isAutoEligible: boolean; autoGateReasons: string[] } {
  const reasons: string[] = [];

  // A. Data eligibility
  if (input.dataFreshness > 120) {
    reasons.push("Data freshness > 2h");
  }
  if (input.baselineReliability === 'LOW') {
    reasons.push("Baseline reliability LOW");
  }
  if (input.volumeQualifier === 'LOW_VOLUME') {
    reasons.push("Low booking volume");
  }
  if (input.inventoryIntent === 'UNKNOWN') {
    reasons.push("Inventory intent unknown");
  }
  if (!input.hasInventoryData) {
    reasons.push("Missing inventory data");
  }

  // B. Data quality
  if (input.flags.INVENTORY_BOOKING_MISMATCH) {
    reasons.push("Inventory-Booking mismatch");
  }
  if (input.flags.DATA_INVALID) {
    reasons.push("Data invalid");
  }

  return {
    isAutoEligible: reasons.length === 0,
    autoGateReasons: reasons,
  };
}

// ============================================
// SECTION 6: SIGNAL LOGIC
// ============================================

interface SignalInput {
  occupancyRate: number;
  baselineOccupancy: number;
  baselineReliability: BaselineReliability;
  leadTime: number;
  velocityDeltaPct: number | null;
  remainingInventory: number;
  totalInventory: number;
  hasInventoryData: boolean;
  flags: QualityFlags;
  dataConfidence: number;
}

function calculateSignals(input: SignalInput): {
  demandSignal: DemandSignal;
  pricingSignal: PricingSignal;
  signalSeverity: SignalSeverity;
  warning: 'vacancy_risk' | 'sellout_risk' | null;
} {
  // Section 5.2 Hard locks
  // remaining_inventory = 0 → SIGNAL = INACTIVE
  if (input.remainingInventory === 0) {
    return {
      demandSignal: 'high',
      pricingSignal: 'inactive',
      signalSeverity: 'LOW',
      warning: null,
    };
  }

  // Data invalid → No metrics
  if (input.flags.DATA_INVALID || !input.hasInventoryData) {
    return {
      demandSignal: 'normal',
      pricingSignal: 'hold',
      signalSeverity: 'LOW',
      warning: null,
    };
  }

  // BASELINE_LOW → HOLD only
  if (input.flags.BASELINE_LOW) {
    return {
      demandSignal: 'normal',
      pricingSignal: 'hold',
      signalSeverity: 'LOW',
      warning: detectWarning(input),
    };
  }

  // INVENTORY_BOOKING_MISMATCH → HOLD + Warning
  if (input.flags.INVENTORY_BOOKING_MISMATCH) {
    return {
      demandSignal: 'normal',
      pricingSignal: 'hold',
      signalSeverity: 'LOW',
      warning: detectWarning(input),
    };
  }

  // Section 6.1: Sell-out risk (INCREASE candidate)
  // occupancy >= 85%, velocity_delta > 0, days_to_checkin >= 1
  const velocity = input.velocityDeltaPct ?? 0;
  let pricingSignal: PricingSignal = 'hold';
  let demandSignal: DemandSignal = 'normal';
  let signalSeverity: SignalSeverity = 'LOW';

  if (input.occupancyRate >= 85 && velocity > 0 && input.leadTime >= 1) {
    pricingSignal = 'increase';
    demandSignal = 'high';
    
    // Severity
    if (input.occupancyRate >= 95 || input.remainingInventory <= 1) {
      signalSeverity = 'HIGH';
    } else if (input.occupancyRate >= 85) {
      signalSeverity = 'MEDIUM';
    }
  }
  // Section 6.2: Vacancy risk (DECREASE candidate)
  // days_to_checkin <= 5, occupancy <= 70%, velocity < 0
  else if (input.leadTime <= 5 && input.occupancyRate <= 70 && velocity < 0) {
    pricingSignal = 'decrease';
    demandSignal = 'low';
    
    // Severity
    if (input.leadTime <= 2 && input.occupancyRate <= 40) {
      signalSeverity = 'HIGH';
    } else if (input.leadTime <= 3 || input.occupancyRate <= 50) {
      signalSeverity = 'MEDIUM';
    }
  }
  // Moderate signals
  else if (velocity >= 20 && input.occupancyRate >= 70) {
    demandSignal = 'high';
    pricingSignal = input.remainingInventory < input.totalInventory * 0.3 ? 'increase' : 'hold';
    signalSeverity = 'LOW';
  }
  else if (velocity < -15 && input.occupancyRate < 50) {
    demandSignal = 'low';
    pricingSignal = input.leadTime < 7 ? 'decrease' : 'hold';
    signalSeverity = 'LOW';
  }

  return {
    demandSignal,
    pricingSignal,
    signalSeverity,
    warning: detectWarning(input),
  };
}

function detectWarning(input: SignalInput): 'vacancy_risk' | 'sellout_risk' | null {
  // Vacancy risk: Short lead time + high availability
  if (input.leadTime < 5 && input.remainingInventory > input.totalInventory * 0.6) {
    return 'vacancy_risk';
  }
  // Sell-out risk: Very short lead time + very low availability
  if (input.leadTime < 3 && input.remainingInventory > 0 && input.remainingInventory < input.totalInventory * 0.15) {
    return 'sellout_risk';
  }
  return null;
}

function calculateBookingPace(calendarData: CalendarDay[]): BookingPacePoint[] {
  const paceByLeadTime: Record<number, { current: number; baseline: number; count: number }> = {};

  calendarData.forEach(day => {
    const lt = day.leadTime;
    if (!paceByLeadTime[lt]) {
      paceByLeadTime[lt] = { current: 0, baseline: 0, count: 0 };
    }
    // CRITICAL: Use displayOccupancy (clamped 0-100) for chart data
    paceByLeadTime[lt].current = day.displayOccupancy;
    paceByLeadTime[lt].baseline = Math.max(0, Math.min(100, day.baselineOccupancy));
    paceByLeadTime[lt].count++;
  });

  return Object.entries(paceByLeadTime)
    .map(([lt, data]) => ({
      daysBeforeCheckin: parseInt(lt),
      // Ensure values are clamped for chart rendering
      currentPace: Math.max(0, Math.min(100, data.current)),
      baselinePace: Math.max(0, Math.min(100, data.baseline)),
    }))
    .sort((a, b) => b.daysBeforeCheckin - a.daysBeforeCheckin);
}

function calculateKPIs(
  calendarData: CalendarDay[],
  overallVelocity: number,
  dataFreshnessMinutes: number,
  selloutRiskDays: number,
  vacancyRiskDays: number,
  cellsWithData: number,
  totalDays: number,
  hasBookingData: boolean
): MarketKPIs {
  if (calendarData.length === 0) return getEmptyKPIs();

  // CRITICAL: Use displayOccupancy (clamped 0-100) for KPI calculations
  const avgOccupancy = calendarData.reduce((sum, d) => sum + d.displayOccupancy, 0) / calendarData.length;
  const inventoryAtRisk = Math.max(0, Math.min(100, (vacancyRiskDays / calendarData.length) * 100));
  const totalInventory = Math.max(0, calendarData.reduce((sum, d) => sum + d.totalInventory, 0));
  const totalBooked = Math.max(0, calendarData.reduce((sum, d) => sum + Math.max(0, d.soldRooms), 0));

  // Estimate days to full based on current velocity
  const avgDailyBookings = totalBooked / Math.max(calendarData.length, 1);
  const remainingInventory = calendarData.reduce((sum, d) => sum + Math.max(0, d.remainingInventory), 0) / Math.max(calendarData.length, 1);
  const daysToFull = avgDailyBookings > 0 ? Math.ceil(remainingInventory / avgDailyBookings) : 99;

  // Coverage ratio (Section 7)
  const coverageRatio = totalDays > 0 ? (cellsWithData / totalDays) * 100 : 0;

  // TOP 1 DESIGN: Velocity should be null if insufficient baseline data
  // Only show velocity when we have meaningful historical comparison
  // -100% typically means "no recent bookings compared to baseline with 0 bookings" = meaningless
  const velocityIsValid = !isNaN(overallVelocity) && isFinite(overallVelocity) && hasBookingData;
  const clampedVelocity = velocityIsValid ? Math.max(-100, Math.min(500, overallVelocity)) : null;

  return {
    avgOccupancy: Math.max(0, Math.min(100, avgOccupancy)), // Clamp to 0-100%
    bookingVelocity: clampedVelocity,
    daysToFull: Math.min(Math.max(0, daysToFull), 99),
    inventoryAtRisk,
    totalInventory,
    totalBooked,
    selloutRiskDays,
    vacancyRiskDays,
    dataFreshnessMinutes,
    coverageRatio,
    hasBookingData,
  };
}

function getEmptyKPIs(): MarketKPIs {
  return {
    avgOccupancy: 0,
    bookingVelocity: null, // null = insufficient data
    daysToFull: 0,
    inventoryAtRisk: 0,
    totalInventory: 0,
    totalBooked: 0,
    selloutRiskDays: 0,
    vacancyRiskDays: 0,
    dataFreshnessMinutes: 0,
    coverageRatio: 0,
    hasBookingData: false,
  };
}
