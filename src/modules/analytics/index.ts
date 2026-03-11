/**
 * Analytics Module
 * 
 * Hub-and-spoke analytics for ROOMRISE Control Hub.
 * 
 * Pages:
 * - Overview (hub) - /analytics/overview
 * - Revenue Analytics - /analytics/revenue
 * - Host Cost Analytics - /analytics/host-cost
 * - Price Spread Analytics - /analytics/price-spread
 * 
 * Features:
 * - Shared filter state via URL params
 * - Canonical metric definitions (night-based ADR)
 * - Sample guards for low data volume
 * - SOT-first: uses unified_bookings
 */

// Export types with explicit names to avoid conflicts
export type {
  Granularity,
  PivotType,
  AnalyticsFilters,
  FilterOption,
  TimeSeriesRow,
  PivotRankingRow,
  ChannelShareRow,
  KpiData,
  AnalyticsBooking,
  ChartDataPoint,
  TrendChartConfig,
  DualLineConfig,
  ExportRow,
  AnalyticsTimeSeriesResponse,
  AnalyticsPivotRankingResponse,
  AnalyticsChannelShareResponse,
} from './types';

export * from './constants';
export * from './hooks';
export * from './components';
