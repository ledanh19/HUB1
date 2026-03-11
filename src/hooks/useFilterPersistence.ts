import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useUserScopedFilterState, FilterUpdateSource } from "./useUserScopedFilterState";
import { deepEqual } from "@/lib/deepEqual";

export interface FilterState {
  [key: string]: unknown;
  searchTerm: string;
  statusFilter: string;
  sourceFilter: string;
  typeFilter: string;
  paymentTypeFilter: string;
  dateFrom: string;
  dateTo: string;
  dateFilterType: "check_in" | "check_out" | "booking" | "actual_check_out";
  currentPage: number;
  pageSize: number | "all";
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

const DEFAULT_FILTER_STATE: FilterState = {
  searchTerm: "",
  statusFilter: "all",
  sourceFilter: "all",
  typeFilter: "all",
  paymentTypeFilter: "all",
  dateFrom: "",
  dateTo: "",
  dateFilterType: "check_in",
  currentPage: 1,
  pageSize: 10,
  sortBy: "created_at",
  sortDirection: "desc",
};

// ============================================================================
// SCOPE KEY MAPPING
// ============================================================================

/** Map moduleKey to valid scope_key for DB storage */
function toScopeKey(moduleKey: string): string {
  const mapping: Record<string, string> = {
    bookings: 'bookings.list',
    stays: 'stays.board',
    payments: 'payments.collect',
    'host-payables': 'host-payables.list',
    'ota-reconciliation': 'ota-reconciliation.payouts',
  };
  return mapping[moduleKey] || `${moduleKey}.list`;
}

/**
 * Hook for filter state persistence per Roomrise UI/UX Standard
 * 
 * Load Priority: URL query params > DB state > per-user localStorage > default
 * 
 * V2 Enhancements (Sprint 17):
 * - Per-user filter isolation via (org_id, user_id, scope_key)
 * - Cross-device sync via DB (debounced 500ms)
 * - Anti-loop: source flag + deep equality guard
 * - Legacy migration from shared localStorage key
 * - URL is always shareable (no auto-persist from URL)
 */
export function useFilterPersistence(moduleKey: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const scopeKey = toScopeKey(moduleKey);

  // ── Per-user scoped filter state (DB + per-user localStorage) ──
  const {
    state: persistedState,
    setState: setPersistedState,
    resetState: resetPersistedState,
    isHydrated,
  } = useUserScopedFilterState<FilterState>(scopeKey, DEFAULT_FILTER_STATE, {
    version: 1,
    legacyStorageKey: moduleKey,  // migrate from "roomrise_filter_{moduleKey}"
    persistToDb: true,
  });

  // ── Resolve initial state from URL or hydrated persisted state ──
  const resolveState = useCallback((): { state: FilterState; source: FilterUpdateSource } => {
    // URL params take highest priority
    if (hasUrlFilters(searchParams)) {
      const urlState = parseUrlParams(searchParams);
      return {
        state: { ...DEFAULT_FILTER_STATE, ...urlState },
        source: 'URL' as FilterUpdateSource,
      };
    }

    // Hydrated state from DB/localStorage
    if (isHydrated && !deepEqual(persistedState, DEFAULT_FILTER_STATE)) {
      // Exclude currentPage from restore — always start at page 1
      return {
        state: { ...persistedState, currentPage: 1 },
        source: 'HYDRATE' as FilterUpdateSource,
      };
    }

    return { state: DEFAULT_FILTER_STATE, source: 'HYDRATE' as FilterUpdateSource };
  }, [searchParams, persistedState, isHydrated]);

  const [filterState, setFilterState] = useState<FilterState>(() => resolveState().state);
  const [updateSource, setUpdateSource] = useState<FilterUpdateSource>('HYDRATE');
  const [scrollPosition, setScrollPosition] = useState(0);

  // ── Re-resolve when hydration completes or URL changes ──
  const hasUrlParams = hasUrlFilters(searchParams);
  const hydrationDone = isHydrated;

  useEffect(() => {
    const resolved = resolveState();
    // Only update if values actually changed (anti-loop)
    setFilterState(prev => {
      if (deepEqual(prev, resolved.state)) return prev;
      return resolved.state;
    });
    setUpdateSource(resolved.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrationDone, hasUrlParams]);

  // ── Sync URL params when filter state changes (from USER action only) ──
  useEffect(() => {
    // Don't update URL during hydration or URL-sourced updates
    if (updateSource !== 'USER') return;

    const params = new URLSearchParams();

    // Only add non-default values to URL
    if (filterState.searchTerm) params.set("q", filterState.searchTerm);
    if (filterState.statusFilter !== "all") params.set("status", filterState.statusFilter);
    if (filterState.sourceFilter !== "all") params.set("source", filterState.sourceFilter);
    if (filterState.typeFilter !== "all") params.set("type", filterState.typeFilter);
    if (filterState.paymentTypeFilter !== "all") params.set("payment", filterState.paymentTypeFilter);
    if (filterState.dateFrom) params.set("from", filterState.dateFrom);
    if (filterState.dateTo) params.set("to", filterState.dateTo);
    if (filterState.dateFilterType !== "check_in") params.set("dateType", filterState.dateFilterType);
    if (filterState.currentPage !== 1) params.set("page", String(filterState.currentPage));
    if (filterState.pageSize !== 10) params.set("size", String(filterState.pageSize));

    // Deep equality guard: don't call setSearchParams if URL would be the same
    const currentStr = searchParams.toString();
    const nextStr = params.toString();
    if (currentStr !== nextStr) {
      setSearchParams(params, { replace: true });
    }
  }, [filterState, updateSource, setSearchParams, searchParams]);

  // ── Persist to DB/localStorage when filter state changes (USER source only) ──
  useEffect(() => {
    if (updateSource !== 'USER') return;

    // Exclude pagination state from persistence  
    const { currentPage: _, ...filtersToPersist } = filterState;
    setPersistedState(filtersToPersist as FilterState, 'USER');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState, updateSource]);

  // Save scroll position before navigation
  const saveScrollPosition = useCallback(() => {
    setScrollPosition(window.scrollY);
  }, []);

  // Restore scroll position after navigation
  const restoreScrollPosition = useCallback(() => {
    if (scrollPosition > 0) {
      window.scrollTo(0, scrollPosition);
    }
  }, [scrollPosition]);

  // Update individual filter field (counts as USER action)
  const updateFilter = useCallback(<K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    setFilterState(prev => {
      const next = {
        ...prev,
        [key]: value,
        // Reset to page 1 when filters change (except page itself)
        ...(key !== "currentPage" && key !== "pageSize" ? { currentPage: 1 } : {}),
      };
      // Deep equality guard
      if (deepEqual(prev, next)) return prev;
      return next;
    });
    setUpdateSource('USER');
  }, []);

  // Reset filters to default (per Roomrise spec: reset = return to default, not "clear all")
  const resetFilters = useCallback(() => {
    setFilterState(DEFAULT_FILTER_STATE);
    setUpdateSource('USER');
    resetPersistedState();
  }, [resetPersistedState]);

  // Check if any non-default filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      filterState.searchTerm !== "" ||
      filterState.statusFilter !== "all" ||
      filterState.sourceFilter !== "all" ||
      filterState.typeFilter !== "all" ||
      filterState.paymentTypeFilter !== "all" ||
      filterState.dateFrom !== "" ||
      filterState.dateTo !== ""
    );
  }, [filterState]);

  return {
    ...filterState,
    updateFilter,
    resetFilters,
    hasActiveFilters,
    saveScrollPosition,
    restoreScrollPosition,
  };
}

// Helper: Parse URL params into filter state
function parseUrlParams(params: URLSearchParams): Partial<FilterState> {
  const result: Partial<FilterState> = {};

  if (params.has("q")) result.searchTerm = params.get("q") || "";
  if (params.has("status")) result.statusFilter = params.get("status") || "all";
  if (params.has("source")) result.sourceFilter = params.get("source") || "all";
  if (params.has("type")) result.typeFilter = params.get("type") || "all";
  if (params.has("payment")) result.paymentTypeFilter = params.get("payment") || "all";
  if (params.has("from")) result.dateFrom = params.get("from") || "";
  if (params.has("to")) result.dateTo = params.get("to") || "";
  if (params.has("dateType")) {
    const dt = params.get("dateType");
    if (dt === "check_in" || dt === "check_out" || dt === "booking" || dt === "actual_check_out") {
      result.dateFilterType = dt;
    }
  }
  if (params.has("page")) {
    const p = parseInt(params.get("page") || "1", 10);
    if (!isNaN(p) && p > 0) result.currentPage = p;
  }
  if (params.has("size")) {
    const s = params.get("size");
    if (s === "all") {
      result.pageSize = "all";
    } else {
      const sizeNum = parseInt(s || "10", 10);
      if (!isNaN(sizeNum) && sizeNum > 0) result.pageSize = sizeNum;
    }
  }

  return result;
}

// Helper: Check if URL has any filter params
function hasUrlFilters(params: URLSearchParams): boolean {
  const filterKeys = ["q", "status", "source", "type", "payment", "from", "to", "dateType", "page", "size"];
  return filterKeys.some(key => params.has(key));
}
