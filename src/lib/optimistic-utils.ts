/**
 * Optimistic Update Utilities
 * 
 * Provides standardized patterns for optimistic UI updates across all mutations.
 * Ensures <200ms perceived response time and proper rollback on errors.
 * 
 * Pattern: onMutate → cancelQueries → snapshot → setQueryData → onError rollback → onSuccess partial invalidation
 */

import { QueryClient } from "@tanstack/react-query";

// === Types ===
export interface OptimisticContext<T = unknown> {
  previousData: Map<string, T>;
  optimisticIds: string[];
}

export interface InvalidationConfig {
  immediate?: string[][]; // QueryKeys to invalidate immediately
  highPriority?: string[][]; // After 100ms
  lowPriority?: string[][]; // After 500ms
}

// === Core Functions ===

/**
 * Cancel in-flight queries to prevent race conditions
 */
export async function cancelRelatedQueries(
  queryClient: QueryClient,
  queryKeys: string[][]
): Promise<void> {
  await Promise.all(
    queryKeys.map((key) => queryClient.cancelQueries({ queryKey: key }))
  );
}

/**
 * Snapshot current query data for potential rollback
 */
export function snapshotQueries<T = unknown>(
  queryClient: QueryClient,
  queryKeys: string[][]
): Map<string, T> {
  const snapshots = new Map<string, T>();
  
  queryKeys.forEach((key) => {
    const data = queryClient.getQueryData(key);
    if (data !== undefined) {
      snapshots.set(JSON.stringify(key), data as T);
    }
  });
  
  return snapshots;
}

/**
 * Restore queries from snapshot (rollback)
 */
export function rollbackFromSnapshot<T = unknown>(
  queryClient: QueryClient,
  snapshots: Map<string, T>
): void {
  snapshots.forEach((data, keyStr) => {
    const key = JSON.parse(keyStr);
    queryClient.setQueryData(key, data);
  });
}

/**
 * Update a list query with optimistic data
 * Marks updated items with _isOptimistic flag
 */
export function updateListQueryOptimistically<T extends Record<string, unknown>>(
  queryClient: QueryClient,
  queryKey: string[],
  idField: keyof T,
  targetId: string,
  updates: Partial<T>
): void {
  queryClient.setQueryData(queryKey, (oldData: T[] | undefined) => {
    if (!oldData || !Array.isArray(oldData)) return oldData;
    
    return oldData.map((item) =>
      item[idField] === targetId
        ? { ...item, ...updates, _isOptimistic: true }
        : item
    );
  });
}

/**
 * Update a single record query with optimistic data
 */
export function updateSingleQueryOptimistically<T extends Record<string, unknown>>(
  queryClient: QueryClient,
  queryKey: string[],
  updates: Partial<T>
): void {
  queryClient.setQueryData(queryKey, (oldData: T | undefined) => {
    if (!oldData || typeof oldData !== "object") return oldData;
    return { ...oldData, ...updates, _isOptimistic: true };
  });
}

/**
 * Add new item to list query optimistically
 */
export function addToListQueryOptimistically<T extends Record<string, unknown>>(
  queryClient: QueryClient,
  queryKey: string[],
  newItem: T,
  position: "start" | "end" = "start"
): void {
  queryClient.setQueryData(queryKey, (oldData: T[] | undefined) => {
    if (!oldData || !Array.isArray(oldData)) return [{ ...newItem, _isOptimistic: true }];
    
    const optimisticItem = { ...newItem, _isOptimistic: true };
    return position === "start"
      ? [optimisticItem, ...oldData]
      : [...oldData, optimisticItem];
  });
}

/**
 * Remove item from list query optimistically
 */
export function removeFromListQueryOptimistically<T extends Record<string, unknown>>(
  queryClient: QueryClient,
  queryKey: string[],
  idField: keyof T,
  targetId: string
): void {
  queryClient.setQueryData(queryKey, (oldData: T[] | undefined) => {
    if (!oldData || !Array.isArray(oldData)) return oldData;
    return oldData.filter((item) => item[idField] !== targetId);
  });
}

/**
 * Partial invalidation with priority tiers
 * Prevents UI freeze from simultaneous invalidations
 */
export function partialInvalidate(
  queryClient: QueryClient,
  config: InvalidationConfig
): void {
  // Immediate invalidations (rare, use sparingly)
  config.immediate?.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: key });
  });

  // High priority: After short delay (100ms)
  if (config.highPriority?.length) {
    setTimeout(() => {
      config.highPriority?.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    }, 100);
  }

  // Low priority: After longer delay (500ms) - dashboards, stats
  if (config.lowPriority?.length) {
    setTimeout(() => {
      config.lowPriority?.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    }, 500);
  }
}

// === Pre-built Patterns ===

/**
 * Standard status update pattern for list items
 */
export function createStatusUpdateOptimistic<
  T extends Record<string, unknown>,
  S extends string
>(config: {
  queryClient: QueryClient;
  listQueryKeys: string[][];
  detailQueryKey?: string[];
  idField: keyof T;
  statusField: keyof T;
}) {
  return {
    onMutate: async (params: { id: string; newStatus: S; extraUpdates?: Partial<T> }) => {
      const { id, newStatus, extraUpdates = {} } = params;

      // Cancel related queries
      await cancelRelatedQueries(config.queryClient, config.listQueryKeys);

      // Snapshot for rollback
      const snapshots = snapshotQueries(config.queryClient, [
        ...config.listQueryKeys,
        ...(config.detailQueryKey ? [config.detailQueryKey] : []),
      ]);

      // Apply optimistic updates
      const updates = { [config.statusField]: newStatus, ...extraUpdates } as Partial<T>;
      
      config.listQueryKeys.forEach((key) => {
        updateListQueryOptimistically(config.queryClient, key, config.idField, id, updates);
      });

      if (config.detailQueryKey) {
        updateSingleQueryOptimistically(config.queryClient, config.detailQueryKey, updates);
      }

      return { previousData: snapshots, targetId: id };
    },
    
    onError: (_error: unknown, _vars: unknown, context?: { previousData: Map<string, unknown> }) => {
      if (context?.previousData) {
        rollbackFromSnapshot(config.queryClient, context.previousData);
      }
    },
  };
}

// === Common Query Key Patterns ===
export const QUERY_KEYS = {
  // Stays/Operations
  stays: ["stays"],
  staysOperations: ["stays_operations"],
  staysWithBookings: ["stays_with_bookings"],
  stayRecord: (id: string) => ["stay_record", id],
  
  // Bookings
  unifiedBookings: ["unified_bookings"],
  bookingDetail: (id: string) => ["booking_detail", id],
  bookingAuditLogs: (id: string) => ["booking_audit_logs", id],
  
  // Payments
  paymentRequests: (filters?: unknown) => filters ? ["payment-requests", filters] : ["payment-requests"],
  paymentRequestStats: ["payment-request-stats"],
  
  // Cash Outs
  cashOuts: (filters?: unknown) => filters ? ["cash-outs", filters] : ["cash-outs"],
  cashOutStats: ["cash-out-stats"],
  
  // Disputes
  otaDisputes: ["ota_disputes"],
  
  // Dashboard
  dashboard: ["dashboard"],
  dashboardKpis: ["dashboard-kpis"],
  
  // Host Payables
  enhancedHostPayables: ["enhanced-host-payables"],
  hostPayables: ["host_payables"],
};

// === Standard Invalidation Configs ===
export const INVALIDATION_CONFIGS = {
  stayUpdate: (bookingId: string): InvalidationConfig => ({
    highPriority: [
      QUERY_KEYS.stays,
      QUERY_KEYS.staysOperations,
      QUERY_KEYS.staysWithBookings,
      QUERY_KEYS.stayRecord(bookingId),
      QUERY_KEYS.bookingDetail(bookingId),
      QUERY_KEYS.unifiedBookings,
    ],
    lowPriority: [
      QUERY_KEYS.bookingAuditLogs(bookingId),
      QUERY_KEYS.dashboard,
      QUERY_KEYS.dashboardKpis,
      QUERY_KEYS.enhancedHostPayables,
      QUERY_KEYS.hostPayables,
    ],
  }),
  
  paymentRequest: (filters?: unknown): InvalidationConfig => ({
    highPriority: [
      QUERY_KEYS.paymentRequests(filters) as unknown as string[],
      QUERY_KEYS.paymentRequestStats,
    ],
    lowPriority: [
      QUERY_KEYS.dashboard,
      QUERY_KEYS.dashboardKpis,
    ],
  }),
  
  cashOut: (filters?: unknown): InvalidationConfig => ({
    highPriority: [
      QUERY_KEYS.cashOuts(filters) as unknown as string[],
      QUERY_KEYS.cashOutStats,
    ],
    lowPriority: [
      QUERY_KEYS.dashboard,
      QUERY_KEYS.dashboardKpis,
    ],
  }),
};
