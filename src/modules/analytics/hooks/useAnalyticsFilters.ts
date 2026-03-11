/**
 * useAnalyticsFilters Hook
 * 
 * Shared filter state for the Analytics module with URL persistence.
 * Filters persist when navigating between analytics pages.
 * 
 * Phase 1 Enhancement:
 * - compareMode URL param (none / previous / yoy)
 * - Comparison alignment logic (getComparisonRange)
 * - day/week granularity support
 * - MTD/YTD quick presets
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  subDays, subYears, addMonths, startOfMonth, endOfMonth, startOfYear,
  format, parseISO, subMonths, differenceInCalendarDays,
} from 'date-fns';
import type { AnalyticsFilters, Granularity, PivotType, DateFilterType, CompareMode } from '../types';
import { DEFAULT_DATE_RANGE_MONTHS } from '../constants';

// ============================================================================
// URL PARAM KEYS
// ============================================================================

const PARAM_DATE_START = 'from';
const PARAM_DATE_END = 'to';
const PARAM_GRANULARITY = 'granularity';
const PARAM_PIVOT = 'pivot';
const PARAM_SELECTED_IDS = 'ids';
const PARAM_DATE_FILTER_TYPE = 'dateType';
const PARAM_COMPARE_MODE = 'compare';

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_DAYS = 30;

const getDefaultDateRange = (futureMonths = 0): { dateStart: string; dateEnd: string } => {
  const now = new Date();
  // Default: last 30 days (matching "30 ngày" quick preset)
  const dateEnd = futureMonths > 0
    ? format(endOfMonth(addMonths(now, futureMonths)), 'yyyy-MM-dd')
    : format(now, 'yyyy-MM-dd');
  const dateStart = format(subDays(now, DEFAULT_DAYS), 'yyyy-MM-dd');
  return { dateStart, dateEnd };
};

const DEFAULT_GRANULARITY: Granularity = 'month';
const DEFAULT_PIVOT: PivotType = 'all';
const DEFAULT_DATE_FILTER_TYPE: DateFilterType = 'check_in';
const DEFAULT_COMPARE_MODE: CompareMode = 'previous';

// ============================================================================
// COMPARISON ALIGNMENT LOGIC
// ============================================================================

/**
 * Calculate comparison date range based on mode.
 * 
 * Previous Period: Same length immediately preceding.
 *   e.g., [Feb 01 – Mar 03] (30 days) → [Jan 02 – Feb 01]
 * 
 * YoY: Shift range by exactly 1 year.
 *   e.g., [Feb 01 – Mar 03] → [Feb 01 – Mar 03] of previous year
 * 
 * Returns null if mode is 'none'.
 */
export function getComparisonRange(
  dateStart: string,
  dateEnd: string,
  mode: CompareMode
): { dateStart: string; dateEnd: string } | null {
  if (mode === 'none') return null;

  const start = parseISO(dateStart);
  const end = parseISO(dateEnd);

  if (mode === 'yoy') {
    return {
      dateStart: format(subYears(start, 1), 'yyyy-MM-dd'),
      dateEnd: format(subYears(end, 1), 'yyyy-MM-dd'),
    };
  }

  // Previous period: same length immediately preceding
  const days = differenceInCalendarDays(end, start);
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, days);
  return {
    dateStart: format(prevStart, 'yyyy-MM-dd'),
    dateEnd: format(prevEnd, 'yyyy-MM-dd'),
  };
}

// ============================================================================
// HOOK
// ============================================================================

interface UseAnalyticsFiltersOptions {
  /** Number of future months to include in default date range */
  futureMonths?: number;
}

export function useAnalyticsFilters(options: UseAnalyticsFiltersOptions = {}) {
  const { futureMonths = 0 } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = useMemo(() => getDefaultDateRange(futureMonths), [futureMonths]);

  // Parse current filter state from URL
  const filters: AnalyticsFilters = useMemo(() => {
    const dateStart = searchParams.get(PARAM_DATE_START) || defaults.dateStart;
    const dateEnd = searchParams.get(PARAM_DATE_END) || defaults.dateEnd;
    const granularity = (searchParams.get(PARAM_GRANULARITY) as Granularity) || DEFAULT_GRANULARITY;
    const pivot = (searchParams.get(PARAM_PIVOT) as PivotType) || DEFAULT_PIVOT;
    const selectedIdsParam = searchParams.get(PARAM_SELECTED_IDS);
    const selectedIds = selectedIdsParam ? selectedIdsParam.split(',').filter(Boolean) : [];
    const dateFilterType = (searchParams.get(PARAM_DATE_FILTER_TYPE) as DateFilterType) || DEFAULT_DATE_FILTER_TYPE;
    const compareMode = (searchParams.get(PARAM_COMPARE_MODE) as CompareMode) || DEFAULT_COMPARE_MODE;

    return {
      dateStart,
      dateEnd,
      granularity,
      pivot,
      selectedIds,
      dateFilterType,
      compareMode,
    };
  }, [searchParams, defaults]);

  // Derived: comparison range (memoized)
  const comparisonRange = useMemo(
    () => getComparisonRange(filters.dateStart, filters.dateEnd, filters.compareMode),
    [filters.dateStart, filters.dateEnd, filters.compareMode]
  );

  // Update filters (merges with existing params)
  const setFilters = useCallback(
    (updates: Partial<AnalyticsFilters>) => {
      setSearchParams((prev) => {
        const newParams = new URLSearchParams(prev);

        if (updates.dateStart !== undefined) {
          if (updates.dateStart === defaults.dateStart) {
            newParams.delete(PARAM_DATE_START);
          } else {
            newParams.set(PARAM_DATE_START, updates.dateStart);
          }
        }

        if (updates.dateEnd !== undefined) {
          if (updates.dateEnd === defaults.dateEnd) {
            newParams.delete(PARAM_DATE_END);
          } else {
            newParams.set(PARAM_DATE_END, updates.dateEnd);
          }
        }

        if (updates.granularity !== undefined) {
          if (updates.granularity === DEFAULT_GRANULARITY) {
            newParams.delete(PARAM_GRANULARITY);
          } else {
            newParams.set(PARAM_GRANULARITY, updates.granularity);
          }
        }

        if (updates.pivot !== undefined) {
          if (updates.pivot === DEFAULT_PIVOT) {
            newParams.delete(PARAM_PIVOT);
          } else {
            newParams.set(PARAM_PIVOT, updates.pivot);
          }
          // Clear selected IDs when pivot changes
          newParams.delete(PARAM_SELECTED_IDS);
        }

        if (updates.selectedIds !== undefined) {
          if (updates.selectedIds.length === 0) {
            newParams.delete(PARAM_SELECTED_IDS);
          } else {
            newParams.set(PARAM_SELECTED_IDS, updates.selectedIds.join(','));
          }
        }

        if (updates.dateFilterType !== undefined) {
          if (updates.dateFilterType === DEFAULT_DATE_FILTER_TYPE) {
            newParams.delete(PARAM_DATE_FILTER_TYPE);
          } else {
            newParams.set(PARAM_DATE_FILTER_TYPE, updates.dateFilterType);
          }
        }

        if (updates.compareMode !== undefined) {
          if (updates.compareMode === DEFAULT_COMPARE_MODE) {
            newParams.delete(PARAM_COMPARE_MODE);
          } else {
            newParams.set(PARAM_COMPARE_MODE, updates.compareMode);
          }
        }

        return newParams;
      }, { replace: true });
    },
    [setSearchParams, defaults]
  );

  // Reset all filters to defaults
  const resetFilters = useCallback(() => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete(PARAM_DATE_START);
      newParams.delete(PARAM_DATE_END);
      newParams.delete(PARAM_GRANULARITY);
      newParams.delete(PARAM_PIVOT);
      newParams.delete(PARAM_SELECTED_IDS);
      newParams.delete(PARAM_DATE_FILTER_TYPE);
      newParams.delete(PARAM_COMPARE_MODE);
      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  // Build URL with filters preserved (for navigation between analytics pages)
  const buildAnalyticsUrl = useCallback(
    (path: string): string => {
      const params = new URLSearchParams();

      if (filters.dateStart !== defaults.dateStart) {
        params.set(PARAM_DATE_START, filters.dateStart);
      }
      if (filters.dateEnd !== defaults.dateEnd) {
        params.set(PARAM_DATE_END, filters.dateEnd);
      }
      if (filters.granularity !== DEFAULT_GRANULARITY) {
        params.set(PARAM_GRANULARITY, filters.granularity);
      }
      if (filters.pivot !== DEFAULT_PIVOT) {
        params.set(PARAM_PIVOT, filters.pivot);
      }
      if (filters.selectedIds.length > 0) {
        params.set(PARAM_SELECTED_IDS, filters.selectedIds.join(','));
      }
      if (filters.dateFilterType !== DEFAULT_DATE_FILTER_TYPE) {
        params.set(PARAM_DATE_FILTER_TYPE, filters.dateFilterType);
      }
      if (filters.compareMode !== DEFAULT_COMPARE_MODE) {
        params.set(PARAM_COMPARE_MODE, filters.compareMode);
      }

      const queryString = params.toString();
      return queryString ? `${path}?${queryString}` : path;
    },
    [filters, defaults]
  );

  // Helper to get date range as Date objects
  const dateRange = useMemo(() => ({
    from: parseISO(filters.dateStart),
    to: parseISO(filters.dateEnd),
  }), [filters.dateStart, filters.dateEnd]);

  // Set date range from Date objects
  const setDateRange = useCallback(
    (range: { from: Date | undefined; to: Date | undefined }) => {
      if (range.from && range.to) {
        setFilters({
          dateStart: format(range.from, 'yyyy-MM-dd'),
          dateEnd: format(range.to, 'yyyy-MM-dd'),
        });
      }
    },
    [setFilters]
  );

  return {
    filters,
    setFilters,
    resetFilters,
    buildAnalyticsUrl,
    dateRange,
    setDateRange,
    comparisonRange,
  };
}

// ============================================================================
// PRESET DATE RANGES (legacy — kept for backward compat)
// ============================================================================

export type DatePreset = 'last3m' | 'last6m' | 'last12m' | 'ytd' | 'lastYear' | 'custom';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'last3m', label: '3 tháng gần nhất' },
  { value: 'last6m', label: '6 tháng gần nhất' },
  { value: 'last12m', label: '12 tháng gần nhất' },
  { value: 'ytd', label: 'Năm nay (YTD)' },
  { value: 'lastYear', label: 'Năm trước' },
  { value: 'custom', label: 'Tùy chỉnh' },
];

export const getPresetDateRange = (preset: DatePreset): { from: Date; to: Date } => {
  const now = new Date();

  switch (preset) {
    case 'last3m':
      return {
        from: startOfMonth(subMonths(now, 2)),
        to: endOfMonth(now),
      };
    case 'last6m':
      return {
        from: startOfMonth(subMonths(now, 5)),
        to: endOfMonth(now),
      };
    case 'last12m':
      return {
        from: startOfMonth(subMonths(now, 11)),
        to: endOfMonth(now),
      };
    case 'ytd':
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: endOfMonth(now),
      };
    case 'lastYear':
      return {
        from: new Date(now.getFullYear() - 1, 0, 1),
        to: new Date(now.getFullYear() - 1, 11, 31),
      };
    case 'custom':
    default:
      return {
        from: startOfMonth(subMonths(now, DEFAULT_DATE_RANGE_MONTHS - 1)),
        to: endOfMonth(now),
      };
  }
};
