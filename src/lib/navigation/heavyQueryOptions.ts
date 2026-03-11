/**
 * Centralized query options for HEAVY route critical queries.
 *
 * RULES:
 * - Every prefetchQuery in routePrefetchRegistry MUST use these options.
 * - Every useQuery in a heavy-route page MUST spread these options.
 * - NO ad-hoc staleTime / refetchOnMount values per route.
 *
 * This ensures that after prefetching, the page mount finds fresh cache
 * and does NOT re-fetch immediately.
 */

/** Primary data queries (tables, main lists) — 30s stale window */
export const HEAVY_QUERY_OPTIONS = {
    staleTime: 30_000,
    refetchOnMount: false as const,       // Don't refetch if cache is fresh
    refetchOnWindowFocus: false as const,  // Don't refetch on alt-tab
    gcTime: 5 * 60_000,                   // Keep in cache for 5 minutes
} as const;

/** Secondary/metadata queries (filter dropdowns, counts) — 5min stale */
export const HEAVY_SECONDARY_OPTIONS = {
    staleTime: 5 * 60_000,
    refetchOnMount: false as const,
    refetchOnWindowFocus: false as const,
    gcTime: 10 * 60_000,
} as const;
