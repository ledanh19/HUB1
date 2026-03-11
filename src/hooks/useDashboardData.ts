import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation, safeFrom } from "@/integrations/supabase";
import { useMemo, useCallback } from "react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, addDays } from "date-fns";

/**
 * DASHBOARD DATA HOOK - Performance Optimized
 * 
 * Goals:
 * 1. Consolidate multiple queries into logical groups
 * 2. Use appropriate staleTime for each data category
 * 3. Share helper functions (avoid re-declaration)
 * 4. Enable parallel loading where possible
 * 5. Return loading states for skeleton UI
 */

// ============================================================================
// SHARED HELPER FUNCTIONS (avoid duplicate declarations in each query)
// ============================================================================
const QUERY_PAGE_SIZE = 1000;
const IN_BATCH_SIZE = 200;

export async function fetchAllRowsPaginated(
  tableName: string,
  selectQuery: string,
  applyFilters?: (query: any) => any
): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    let q = safeFrom(tableName as any).select(selectQuery)
      .range(from, from + QUERY_PAGE_SIZE - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < QUERY_PAGE_SIZE) break;
  }
  return all;
}

export async function fetchWithBatchedInClause(
  tableName: string,
  selectQuery: string,
  columnName: string,
  ids: string[],
  applyFilters?: (query: any) => any
): Promise<any[]> {
  if (!ids.length) return [];
  const all: any[] = [];
  for (let i = 0; i < ids.length; i += IN_BATCH_SIZE) {
    const batch = ids.slice(i, i + IN_BATCH_SIZE);
    let q = safeFrom(tableName as any).select(selectQuery)
      .in(columnName, batch);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (data) all.push(...data);
  }
  return all;
}

// ============================================================================
// CACHE SHARED DATA: An Gia Property IDs (used by multiple queries)
// ============================================================================
const AN_GIA_GROUP_TITLE = "An Gia Residences";

export function useAnGiaPropertyIds() {
  return useQuery({
    queryKey: ["dashboard-an-gia-properties"],
    queryFn: async () => {
      const { data: groupData } = await supabase
        .from("channex_groups")
        .select("channex_group_id")
        .eq("title", AN_GIA_GROUP_TITLE)
        .maybeSingle();

      if (!groupData?.channex_group_id) return [];

      const { data: propertyGroups } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", groupData.channex_group_id);

      return propertyGroups?.map((p) => p.channex_property_id) || [];
    },
    // Property IDs rarely change - cache for 10 minutes
    staleTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });
}

// ============================================================================
// STALE TIME CONFIGURATIONS by data type
// ============================================================================
export const DASHBOARD_STALE_TIMES = {
  // Realtime operations - short stale time (30 seconds)
  operations: 30 * 1000,

  // Cash data - medium stale time (2 minutes)
  cash: 2 * 60 * 1000,

  // P&L metrics - longer stale time (5 minutes) - computed from historical data
  pnl: 5 * 60 * 1000,

  // Receivables - medium stale time (2 minutes)
  receivables: 2 * 60 * 1000,

  // Forecast - longer stale time (5 minutes)
  forecast: 5 * 60 * 1000,

  // Data quality - long stale time (10 minutes) - diagnostic only
  dataQuality: 10 * 60 * 1000,
};

// ============================================================================
// PERIOD FILTER TYPES AND HELPERS
// ============================================================================
export type PeriodFilter = "today" | "7days" | "30days" | "month";

export function getDateRange(period: PeriodFilter) {
  const now = new Date();
  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "7days":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30days":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "month":
      // MTD: từ đầu tháng đến hôm nay
      return { from: startOfMonth(now), to: endOfDay(now) };
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

// ============================================================================
// COMBINED LOADING STATE HOOK
// ============================================================================
export interface DashboardLoadingState {
  isAnyLoading: boolean;
  isOperationsLoading: boolean;
  isCashLoading: boolean;
  isPnlLoading: boolean;
  isReceivablesLoading: boolean;
  isForecastLoading: boolean;
}

export function useDashboardLoadingState(queries: {
  staysLoading?: boolean;
  cashInLoading?: boolean;
  cashOutLoading?: boolean;
  roomRevenueLoading?: boolean;
  otaReceivablesLoading?: boolean;
  forecastLoading?: boolean;
}): DashboardLoadingState {
  return useMemo(() => ({
    isAnyLoading: Object.values(queries).some(Boolean),
    isOperationsLoading: queries.staysLoading || false,
    isCashLoading: queries.cashInLoading || queries.cashOutLoading || false,
    isPnlLoading: queries.roomRevenueLoading || false,
    isReceivablesLoading: queries.otaReceivablesLoading || false,
    isForecastLoading: queries.forecastLoading || false,
  }), [queries]);
}

// ============================================================================
// PREFETCH FUNCTION - Call on Dashboard mount to warm cache
// ============================================================================
export function useDashboardPrefetch() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    // Prefetch property IDs first (used by many queries)
    queryClient.prefetchQuery({
      queryKey: ["dashboard-an-gia-properties"],
      queryFn: async () => {
        const { data: groupData } = await supabase
          .from("channex_groups")
          .select("channex_group_id")
          .eq("title", AN_GIA_GROUP_TITLE)
          .maybeSingle();

        if (!groupData?.channex_group_id) return [];

        const { data: propertyGroups } = await supabase
          .from("channex_property_groups")
          .select("channex_property_id")
          .eq("channex_group_id", groupData.channex_group_id);

        return propertyGroups?.map((p) => p.channex_property_id) || [];
      },
    });
  }, [queryClient]);
}

// ============================================================================
// BATCH REFETCH FUNCTION - Refresh all dashboard data at once
// ============================================================================
export function useRefreshAllDashboard() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    // Invalidate all dashboard queries at once
    queryClient.invalidateQueries({
      predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].startsWith('dashboard-')
    });
  }, [queryClient]);
}
