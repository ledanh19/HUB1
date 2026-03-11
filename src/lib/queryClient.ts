import { QueryClient, focusManager } from "@tanstack/react-query";
import { sessionManager } from "@/auth/sessionManager";
import { isAuthError } from "@/integrations/supabase/safeQuery";
import { SESSION_RECOVERY_V1 } from "@/auth/featureFlags";

/**
 * OPTIMIZED QUERY CLIENT CONFIGURATION
 * 
 * SESSION_RECOVERY_V1 additions:
 * - Smart refetchOnWindowFocus via focusManager (validates session first)
 * - Auth-aware retry (skip retry on auth errors — let safeQuery handle)
 * - refetchOnReconnect for network recovery
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 10 seconds - faster updates
      staleTime: 10 * 1000,

      // Keep data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,

      // SESSION_RECOVERY_V1: re-enable refetchOnWindowFocus
      // The focusManager below ensures session is validated before refetching
      refetchOnWindowFocus: SESSION_RECOVERY_V1 ? true : false,

      // Auth-aware retry: skip retry on auth errors (safeQuery handles recovery)
      retry: (failureCount, error) => {
        if (SESSION_RECOVERY_V1 && isAuthError(error)) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),

      // Refetch on reconnect to catch updates during disconnection
      refetchOnReconnect: true,
    },
    mutations: {
      // No auto-retry for mutations — prevents double-execution of financial operations
      retry: 0,
    },
  },
});

// ── SESSION_RECOVERY_V1: Smart Focus Manager ──
// Override the default focus detection to validate session before allowing refetch
if (SESSION_RECOVERY_V1) {
  // Custom focus handler: on tab resume, validate session then allow refetch
  let _focusRecoveryInProgress = false;

  const handleFocusRecovery = () => {
    if (_focusRecoveryInProgress) return;
    _focusRecoveryInProgress = true;

    sessionManager.ensureValidSession()
      .then((result) => {
        if (result === 'OK') {
          // Session is valid — tell React Query it's OK to refetch
          focusManager.setFocused(true);
          // Reset after a tick so it can fire again
          setTimeout(() => focusManager.setFocused(undefined), 100);
        }
        // If EXPIRED, sessionManager will emit session:expired → modal handles it
      })
      .catch(() => {
        // Ignore — sessionManager handles errors internally
      })
      .finally(() => {
        _focusRecoveryInProgress = false;
      });
  };

  // Replace default focus detection with our session-aware handler
  focusManager.setEventListener((handleFocus) => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocusRecovery();
      }
    };
    const onFocus = () => {
      handleFocusRecovery();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  });
}


/**
 * Feature flags for gradual rollout
 */
export const FEATURE_FLAGS = {
  // Optimistic UI updates - show changes immediately before server confirms
  OPTIMISTIC_UI: true,

  // Realtime invalidation - use WebSocket for cache invalidation
  REALTIME_INVALIDATE: true,

  // Anti-double-click protection for financial operations
  SAFE_PAY_GUARD: true,

  // Background polling for critical data
  BACKGROUND_POLLING: true,

  // Smart polling interval (ms) - used when realtime fails
  POLLING_INTERVAL_ACTIVE: 30000,
  POLLING_INTERVAL_BACKGROUND: 60000,
};

/**
 * Query key factory for consistent key generation
 */
export const queryKeys = {
  // Bookings
  bookings: {
    all: ["unified_bookings"] as const,
    list: (filters?: Record<string, any>) => ["unified_bookings", filters] as const,
    detail: (id: string) => ["booking_detail", id] as const,
    changes: (id: string) => ["booking_changes", id] as const,
    audit: (id: string) => ["booking_audit_logs", id] as const,
  },

  // Stays
  stays: {
    all: ["stays"] as const,
    operations: ["stays_operations"] as const,
    withBookings: ["stays_with_bookings"] as const,
    record: (id: string) => ["stay_record", id] as const,
  },

  // Collections
  collections: {
    all: ["collections"] as const,
    hotelCollects: (bookingId?: string) => bookingId
      ? ["hotel_collects", bookingId] as const
      : ["hotel_collects"] as const,
    summary: (bookingId: string) => ["collection-summary", bookingId] as const,
    withRelated: (id: string) => ["collection-with-related", id] as const,
  },

  // Payments
  payments: {
    requests: (filters?: Record<string, any>) => ["payment-requests", filters] as const,
    approvedForCashout: ["approved-requests-for-cashout"] as const,
    requestStats: ["payment-request-stats"] as const,
  },

  // Cash Outs
  cashOuts: {
    all: (filters?: Record<string, any>) => ["cash-outs", filters] as const,
    stats: (from?: string, to?: string) => ["cash-out-stats", from, to] as const,
  },

  // Host Payables
  hostPayables: {
    all: ["host_payables"] as const,
    enhanced: ["enhanced-host-payables"] as const,
    detail: (id: string) => ["host-payable-detail", id] as const,
    deposits: ["host_deposits"] as const,
    prepaids: ["host_prepaids"] as const,
    settlements: ["host_settlements"] as const,
    depositPrepaidSummary: ["deposit-prepaid-summary"] as const,
    supplySegments: ["host_supply_segments"] as const,
  },

  // Dashboard
  dashboard: {
    all: ["dashboard"] as const,
    todayCollections: ["dashboard-today-collections"] as const,
    monthCollections: ["dashboard-month-collections"] as const,
    kpis: ["dashboard-kpis"] as const,
  },

  // Cashflow
  cashflow: {
    entries: ["cashflow-entries"] as const,
  },

  // Disputes
  disputes: {
    all: ["disputes"] as const,
    detail: (id: string) => ["dispute-detail", id] as const,
  },

  // Service Orders
  serviceOrders: {
    all: ["service_orders"] as const,
    detail: (id: string) => ["service-order-detail", id] as const,
  },

  // Approvals
  approvals: {
    all: ["approvals"] as const,
    pending: ["pending-approvals"] as const,
  },

  // Conversations
  conversations: {
    all: ["conversations"] as const,
    detail: (id: string) => ["conversation-detail", id] as const,
    messages: (id: string) => ["conversation-messages", id] as const,
  },

  // Live Feed
  liveFeed: {
    bookingChanges: ["live-feed-booking-changes"] as const,
    messages: ["live-feed-messages"] as const,
  },
};

/**
 * Query Impact Map - defines which queries to invalidate for each action
 * This ensures cross-page sync without manual F5
 */
export const QUERY_IMPACT_MAP = {
  // Payment Request Actions
  "payment_request:create": [
    queryKeys.payments.requests(),
    queryKeys.payments.requestStats,
    queryKeys.dashboard.kpis,
  ],
  "payment_request:approve": [
    queryKeys.payments.requests(),
    queryKeys.payments.approvedForCashout,
    queryKeys.payments.requestStats,
    queryKeys.dashboard.kpis,
  ],
  "payment_request:reject": [
    queryKeys.payments.requests(),
    queryKeys.payments.requestStats,
    queryKeys.dashboard.kpis,
  ],

  // Cash Out Actions
  "cash_out:create": [
    queryKeys.cashOuts.all(),
    queryKeys.payments.requests(),
    queryKeys.payments.approvedForCashout,
    queryKeys.cashflow.entries,
    queryKeys.dashboard.kpis,
  ],

  // Collection Actions
  "collection:create": [
    queryKeys.collections.all,
    queryKeys.dashboard.todayCollections,
    queryKeys.dashboard.monthCollections,
    queryKeys.hostPayables.enhanced,
    queryKeys.hostPayables.all,
  ],
  "collection:refund": [
    queryKeys.collections.all,
    queryKeys.dashboard.todayCollections,
    queryKeys.dashboard.monthCollections,
    queryKeys.hostPayables.enhanced,
    queryKeys.hostPayables.all,
    queryKeys.cashflow.entries,
  ],
  "collection:void": [
    queryKeys.collections.all,
    queryKeys.dashboard.todayCollections,
    queryKeys.dashboard.monthCollections,
    queryKeys.hostPayables.enhanced,
    queryKeys.hostPayables.all,
  ],

  // Host Payable Actions
  "host_payable:update": [
    queryKeys.hostPayables.all,
    queryKeys.hostPayables.enhanced,
    queryKeys.dashboard.kpis,
  ],
  "host_deposit:create": [
    queryKeys.hostPayables.deposits,
    queryKeys.hostPayables.depositPrepaidSummary,
    queryKeys.hostPayables.enhanced,
    queryKeys.payments.requests(),
  ],
  "host_settlement:create": [
    queryKeys.hostPayables.settlements,
    queryKeys.hostPayables.enhanced,
    queryKeys.payments.requests(),
  ],
  "host_settlement:settle": [
    queryKeys.hostPayables.settlements,
    queryKeys.hostPayables.enhanced,
    queryKeys.hostPayables.supplySegments,
    queryKeys.payments.requests(),
  ],

  // Booking Actions
  "booking:update": [
    queryKeys.bookings.all,
    queryKeys.stays.all,
    queryKeys.stays.operations,
    queryKeys.stays.withBookings,
    queryKeys.dashboard.all,
  ],
  "booking:checkin": [
    queryKeys.stays.all,
    queryKeys.stays.operations,
    queryKeys.stays.withBookings,
    queryKeys.dashboard.all,
  ],
  "booking:checkout": [
    queryKeys.stays.all,
    queryKeys.stays.operations,
    queryKeys.stays.withBookings,
    queryKeys.dashboard.all,
    queryKeys.hostPayables.all,
    queryKeys.hostPayables.enhanced,
  ],
} as const;

export type QueryImpactAction = keyof typeof QUERY_IMPACT_MAP;

/**
 * Batch invalidate queries based on action
 */
export function invalidateForAction(action: QueryImpactAction, additionalKeys?: readonly string[][]) {
  const keys = QUERY_IMPACT_MAP[action] || [];

  // Invalidate all mapped keys
  keys.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: key as readonly unknown[] });
  });

  // Invalidate additional specific keys
  additionalKeys?.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: key });
  });
}

/**
 * Invalidate queries for a specific booking update
 */
export function invalidateBookingRelated(bookingId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.changes(bookingId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.bookings.audit(bookingId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.collections.summary(bookingId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.collections.hotelCollects(bookingId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.stays.record(bookingId) });
}

/**
 * Invalidate all dashboard-related queries
 */
export function invalidateDashboard() {
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.kpis });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.todayCollections });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.monthCollections });
}
