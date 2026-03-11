export { useAnalyticsFilters, DATE_PRESETS, getPresetDateRange, getComparisonRange } from './useAnalyticsFilters';
export type { DatePreset } from './useAnalyticsFilters';

// Sprint 3: Historical finance analytics from analytics_historical_daily_v
export { useHistoricalAnalytics, bucketBusinessDate } from './useHistoricalAnalytics';
export type { UseHistoricalAnalyticsOptions, HistoricalAnalyticsResult } from './useHistoricalAnalytics';

export { useContextMode } from './useContextMode';

export {
  useAnalyticsTimeSeries,
  useAnalyticsPivotRanking,
  useAnalyticsChannelShare,
  useAnalyticsFilterOptions,
  useChannelTimeSeries,
} from './useAnalyticsData';

export {
  useHostCostSegments,
  useHostCostByRoomType,
  useHostCostTimeSeries,
} from './useHostCostSegments';
export type {
  HostCostSegmentRow,
  HostCostRoomTypeRow,
  HostCostTimeSeriesRow,
  HostCostKpi,
} from './useHostCostSegments';

// P1: OTA Sell Price - EXACT room-line revenue from booking_room_lines_mirror
export {
  useOtaSellPrice,
  useOtaSellPriceByGroup,
  useOtaSellPriceTimeSeries,
} from './useOtaSellPrice';
export type {
  OtaSellPriceRow,
  OtaSellPriceAggRow,
  OtaSellPriceTimeSeriesRow,
  OtaSellPriceKpi,
  OtaSellPriceGroupBy,
  UseOtaSellPriceOptions,
} from './useOtaSellPrice';

// P3: Price Spread Matched - EXACT spread by matching segment↔room_line
export {
  usePriceSpreadMatched,
  usePriceSpreadByGroup,
  usePriceSpreadTimeSeries,
} from './usePriceSpreadMatched';
export type {
  PriceSignal,
  MatchedSpreadRow,
  SpreadAggRow,
  SpreadKpi,
  SpreadGroupBy,
  SpreadTimeSeriesRow,
  UsePriceSpreadMatchedOptions,
} from './usePriceSpreadMatched';

// P4: Price Spread Forecast - ESTIMATED future pricing
export { usePriceSpreadForecast } from './usePriceSpreadForecast';
export type {
  ForecastRow,
  ForecastKpi,
} from './usePriceSpreadForecast';