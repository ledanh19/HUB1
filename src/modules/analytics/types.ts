/**
 * Analytics Module Types
 * 
 * Canonical metric definitions and data structures for the Analytics hub-and-spoke module.
 * All ADR metrics are NIGHT-BASED. Time key is CHECK-IN date unless explicitly labeled.
 */

// ============================================================================
// FILTER TYPES
// ============================================================================

export type Granularity = 'day' | 'week' | 'month' | 'quarter';
export type PivotType = 'all' | 'channel' | 'property' | 'area';

/**
 * Compare Mode - determines comparison period for KPI deltas
 * - none: No comparison
 * - previous: Same length immediately preceding the selected range
 * - yoy: Same range shifted back 1 year
 */
export type CompareMode = 'none' | 'previous' | 'yoy';

export const COMPARE_MODE_LABELS: Record<CompareMode, string> = {
  none: 'Không so sánh',
  previous: 'Kỳ trước',
  yoy: 'Năm ngoái',
};

/**
 * Context Mode - derived from property selection
 * - portfolio: 0 or >1 properties selected (aggregated view)
 * - property: Exactly 1 property selected (property-specific view)
 */
export type ContextMode = 'portfolio' | 'property';

/**
 * Date Filter Type - determines which date field to use for filtering
 * - check_in: Check-in date (ngày nhận phòng) - DEFAULT
 * - check_out: Check-out date (ngày trả phòng)
 * - booking_date: Booking created date (ngày đặt phòng)
 */
export type DateFilterType = 'check_in' | 'check_out' | 'booking_date';

export const DATE_FILTER_TYPE_LABELS: Record<DateFilterType, string> = {
  check_in: 'Ngày nhận phòng',
  check_out: 'Ngày trả phòng',
  booking_date: 'Ngày đặt phòng',
};

export interface AnalyticsFilters {
  dateStart: string;    // ISO date string (YYYY-MM-DD)
  dateEnd: string;      // ISO date string (YYYY-MM-DD)
  granularity: Granularity;
  pivot: PivotType;
  selectedIds: string[]; // IDs matching the pivot type (channel IDs, property IDs, or area IDs)
  dateFilterType: DateFilterType; // Which date field to filter by
  compareMode: CompareMode;      // Comparison period mode
}

export interface FilterOption {
  id: string;
  name: string;
}

// ============================================================================
// TIME SERIES DATA
// ============================================================================

export interface TimeSeriesRow {
  periodStart: string;       // Period key (YYYY-MM or YYYY-QN)
  periodLabel: string;       // Human-readable label
  revenueTotal: number;
  hostCostTotal: number;
  nightsTotal: number;
  bookingsCount: number;
  revenueAdr: number | null; // null when below sample threshold
  hostAdr: number | null;    // null when below sample threshold
  marginSpread: number | null; // null when below sample threshold
  belowSampleThreshold: boolean;
}

// ============================================================================
// PIVOT RANKING DATA
// ============================================================================

export interface PivotRankingRow {
  pivotId: string;
  pivotName: string;
  revenueTotal: number;
  hostCostTotal: number;
  nightsTotal: number;
  bookingsCount: number;
  revenueAdr: number | null;
  hostAdr: number | null;
  marginSpread: number | null;
  sharePct: number;          // % share of total for current metric
  belowSampleThreshold: boolean;
}

// ============================================================================
// CHANNEL SHARE DATA
// ============================================================================

export interface ChannelShareRow {
  channelId: string;
  channelName: string;
  revenueTotal: number;
  sharePct: number;
}

// ============================================================================
// KPI DATA
// ============================================================================

export interface KpiData {
  revenueTotal: number;
  hostCostTotal: number;
  nightsTotal: number;
  bookingsCount: number;
  revenueAdr: number | null;
  hostAdr: number | null;
  marginSpread: number | null;
  belowSampleThreshold: boolean;
  // Period-over-period changes
  revenuePop: number | null;     // % change vs prior period
  hostAdrPop: number | null;     // % change vs prior period
  marginSpreadPop: number | null; // absolute change vs prior period
}

// ============================================================================
// RAW BOOKING DATA (from unified_bookings SOT)
// ============================================================================

export interface AnalyticsBooking {
  unifiedBookingId: string;
  checkInDate: string;
  nights: number;
  roomRevenue: number;      // total_amount_net (OTA net revenue)
  hostCost: number;
  source: string;           // channel name
  pmsPropertyId: string | null;
  pmsPropertyName: string | null;
  area: string | null;      // derived from property mapping
}

// ============================================================================
// CHART CONFIGURATION
// ============================================================================

export interface ChartDataPoint {
  period: string;
  label: string;
  [key: string]: string | number | null;
}

export interface TrendChartConfig {
  barDataKey: string;
  barLabel: string;
  lineDataKey: string;
  lineLabel: string;
}

export interface DualLineConfig {
  line1DataKey: string;
  line1Label: string;
  line2DataKey: string;
  line2Label: string;
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export interface ExportRow {
  [key: string]: string | number | null;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface AnalyticsTimeSeriesResponse {
  data: TimeSeriesRow[];
  totalKpi: KpiData;
}

export interface AnalyticsPivotRankingResponse {
  data: PivotRankingRow[];
  totalInRange: number;
}

export interface AnalyticsChannelShareResponse {
  data: ChannelShareRow[];
}
