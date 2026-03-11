/**
 * ═══════════════════════════════════════════════════════════
 * TANSTACK QUERY PERFORMANCE HELPERS
 * ═══════════════════════════════════════════════════════════
 *
 * Helpers to enforce Enterprise PMS 2026 data-fetch standards:
 * - Stable query keys (no unnecessary refetches)
 * - keepPreviousData by default on list queries
 * - Cancel in-flight requests on filter change
 */

import { useRef, useMemo } from 'react';

/**
 * Returns a referentially-stable query key array.
 * Only updates the reference when the *serialised* value changes.
 * Prevents TanStack Query from refetching when a new object is created
 * with identical contents (e.g. inline `{ status, page }` in renders).
 */
export function useStableQueryKey<T extends readonly unknown[]>(key: T): T {
  const serialised = JSON.stringify(key);
  const ref = useRef<{ serialised: string; key: T }>({ serialised, key });

  if (ref.current.serialised !== serialised) {
    ref.current = { serialised, key: key };
  }

  return ref.current.key;
}

/**
 * Standard placeholderData function for TanStack Query v5.
 * Returns the previous data while a new query is loading,
 * preventing flash-of-empty when filters change.
 *
 * Usage:
 * ```ts
 * useQuery({
 *   queryKey: [...],
 *   queryFn: ...,
 *   placeholderData: keepPrevious,
 * })
 * ```
 */
export const keepPrevious = <T>(previousData: T | undefined) => previousData;

/**
 * Recommended staleTime values by data category.
 * Use these instead of ad-hoc values to keep the system consistent.
 */
export const STALE_TIMES = {
  /** Operational data updated in real-time (bookings, stays) */
  realtime: 10_000,       // 10s
  /** Dashboard metrics, KPIs */
  operational: 30_000,    // 30s
  /** Financial aggregates (cash, P&L) */
  financial: 2 * 60_000, // 2min
  /** Reference/config data (properties, mappings) */
  reference: 5 * 60_000, // 5min
  /** Static data (documentation, labels) */
  static: 30 * 60_000,   // 30min
} as const;
