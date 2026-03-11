import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { FEATURE_FLAGS, queryKeys, invalidateDashboard } from "@/lib/queryClient";

/**
 * REALTIME SYSTEM v2 - RESTORED
 * 
 * All 19 tables restored for proper query invalidation.
 * Disk IO optimization should be done via:
 * - Query limits (useBookings, useCollections)
 * - Log retention policies
 * - NOT by removing realtime subscriptions (breaks cache invalidation)
 */

// All tables that need realtime updates
const REALTIME_TABLES = [
  "bookings_mirror",
  "manual_bookings",
  "stays",
  "booking_changes",
  "hotel_collects",
  "host_payables",
  "host_payments",
  "host_deposits",
  "host_prepaids",
  "host_settlements",
  "host_supply_segments",
  "payment_requests",
  "cash_outs",
  "ota_disputes",
  "service_orders",
  "approvals",
  "conversations",
  "messages",
  "guest_documents",
  "audit_logs", // For responsible owner realtime sync
] as const;

type RealtimeTable = typeof REALTIME_TABLES[number];

interface PendingUpdate {
  table: RealtimeTable;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  timestamp: number;
  payload: any;
}

interface RealtimeSystemState {
  isConnected: boolean;
  pendingUpdates: PendingUpdate[];
  lastUpdateAt: number | null;
}

// Query key mappings - RESTORED full mapping for all 18 tables
const TABLE_QUERY_KEYS: Record<RealtimeTable, readonly (readonly string[])[]> = {
  bookings_mirror: [
    queryKeys.bookings.all,
    queryKeys.stays.all,
    queryKeys.stays.operations,
    queryKeys.stays.withBookings,
    queryKeys.dashboard.all,
    queryKeys.dashboard.kpis,
  ],
  manual_bookings: [
    queryKeys.bookings.all,
    queryKeys.stays.all,
    queryKeys.stays.operations,
    queryKeys.stays.withBookings,
    queryKeys.dashboard.all,
    queryKeys.dashboard.kpis,
  ],
  stays: [
    queryKeys.stays.all,
    queryKeys.stays.operations,
    queryKeys.stays.withBookings,
    queryKeys.dashboard.all,
    queryKeys.dashboard.kpis,
    queryKeys.hostPayables.enhanced,
  ],
  booking_changes: [
    queryKeys.liveFeed.bookingChanges,
    ["booking_changes"],
    ["notification-booking-changes"],
    ["notification-bookings-info"],
  ],
  hotel_collects: [
    queryKeys.collections.all,
    queryKeys.dashboard.todayCollections,
    queryKeys.dashboard.monthCollections,
    queryKeys.hostPayables.enhanced,
    queryKeys.dashboard.kpis,
  ],
  host_payables: [
    queryKeys.hostPayables.all,
    queryKeys.hostPayables.enhanced,
    queryKeys.dashboard.kpis,
  ],
  host_payments: [
    ["host_payments"],
    queryKeys.hostPayables.enhanced,
    queryKeys.dashboard.kpis,
  ],
  host_deposits: [
    queryKeys.hostPayables.deposits,
    queryKeys.hostPayables.depositPrepaidSummary,
    queryKeys.hostPayables.enhanced,
    queryKeys.dashboard.kpis,
  ],
  host_prepaids: [
    queryKeys.hostPayables.prepaids,
    queryKeys.hostPayables.depositPrepaidSummary,
    queryKeys.hostPayables.enhanced,
  ],
  host_settlements: [
    queryKeys.hostPayables.settlements,
    queryKeys.hostPayables.enhanced,
    queryKeys.dashboard.kpis,
  ],
  host_supply_segments: [
    queryKeys.hostPayables.supplySegments,
    queryKeys.hostPayables.enhanced,
    queryKeys.stays.all,
    queryKeys.stays.operations,
    queryKeys.stays.withBookings,
    ["host-supply-segments"],
  ],
  payment_requests: [
    ["payment-requests"],
    queryKeys.payments.approvedForCashout,
    queryKeys.payments.requestStats,
    queryKeys.dashboard.kpis,
  ],
  cash_outs: [
    ["cash-outs"],
    ["cash-out-stats"],
    queryKeys.cashflow.entries,
    queryKeys.dashboard.kpis,
  ],
  ota_disputes: [
    queryKeys.disputes.all,
  ],
  service_orders: [
    queryKeys.serviceOrders.all,
  ],
  approvals: [
    queryKeys.approvals.all,
    queryKeys.approvals.pending,
  ],
  conversations: [
    queryKeys.conversations.all,
  ],
  messages: [
    ["messages"],
    queryKeys.liveFeed.messages,
    ["notification-messages"],
  ],
  guest_documents: [
    ["guest_documents"],
    ["declaration_warning"],
    queryKeys.stays.operations,
  ],
  audit_logs: [
    // Responsible owner queries
    ["derived_owner"],
    ["derived_owners_batch"],
    ["last_handler"],
    ["last_handlers_batch"],
    // Booking audit logs
    ["booking_audit_logs"],
  ],
};

/**
 * Core realtime system hook
 * Manages subscriptions to all critical tables
 */
export function useRealtimeSystem(options?: {
  /** Show toast notifications for new data */
  showToasts?: boolean;
  /** Buffer updates instead of immediate invalidation */
  bufferUpdates?: boolean;
  /** Callback when new data arrives */
  onUpdate?: (table: RealtimeTable, payload: any) => void;
}) {
  const queryClient = useQueryClient();
  const { showToasts = false, bufferUpdates = false, onUpdate } = options || {};

  const [state, setState] = useState<RealtimeSystemState>({
    isConnected: false,
    pendingUpdates: [],
    lastUpdateAt: null,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  // ── FIX #3: Event batching — collect tables in 150ms window, deduplicate keys ──
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchTablesRef = useRef<Set<RealtimeTable>>(new Set());
  const batchAuditPayloadsRef = useRef<any[]>([]);

  const flushBatch = useCallback(() => {
    const tables = batchTablesRef.current;
    const auditPayloads = batchAuditPayloadsRef.current;
    if (tables.size === 0 && auditPayloads.length === 0) return;

    // Deduplicate query keys across all batched tables
    const keysToInvalidate = new Set<string>();
    tables.forEach((table) => {
      if (table === "audit_logs") return; // handled separately below
      const keys = TABLE_QUERY_KEYS[table] || [];
      keys.forEach((key) => keysToInvalidate.add(JSON.stringify(key)));
    });

    keysToInvalidate.forEach((keyStr) => {
      const key = JSON.parse(keyStr);
      queryClient.invalidateQueries({ queryKey: key });
    });

    // Handle audit_logs entity-specific invalidation
    if (tables.has("audit_logs")) {
      const entityIds = new Set<string>();
      for (const p of auditPayloads) {
        const newRecord = p.new || p.record;
        if (newRecord?.entity_id) entityIds.add(newRecord.entity_id);
      }
      entityIds.forEach((eid) => {
        queryClient.invalidateQueries({ queryKey: ["derived_owner", eid] });
        queryClient.invalidateQueries({ queryKey: ["last_handler", eid] });
        queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", eid] });
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "derived_owners_batch" ||
          query.queryKey[0] === "last_handlers_batch",
      });
    }

    // Reset batch state
    batchTablesRef.current = new Set();
    batchAuditPayloadsRef.current = [];
    batchTimerRef.current = null;

    setState((prev) => ({ ...prev, lastUpdateAt: Date.now() }));
    console.log(`[Realtime] Flushed batch: ${tables.size} tables`);
  }, [queryClient]);

  // Apply pending updates (invalidate queries)
  const applyUpdates = useCallback(() => {
    const updates = state.pendingUpdates;
    if (updates.length === 0) return;

    // Get unique query keys to invalidate
    const keysToInvalidate = new Set<string>();
    updates.forEach((update) => {
      const keys = TABLE_QUERY_KEYS[update.table] || [];
      keys.forEach((key) => keysToInvalidate.add(JSON.stringify(key)));
    });

    // Invalidate all affected queries
    keysToInvalidate.forEach((keyStr) => {
      const key = JSON.parse(keyStr);
      queryClient.invalidateQueries({ queryKey: key });
    });

    // Clear pending updates
    setState((prev) => ({
      ...prev,
      pendingUpdates: [],
      lastUpdateAt: Date.now(),
    }));
  }, [state.pendingUpdates, queryClient]);

  // Handle incoming realtime event
  const handleRealtimeEvent = useCallback(
    (table: RealtimeTable, eventType: "INSERT" | "UPDATE" | "DELETE", payload: any) => {
      console.log(`[Realtime] ${table} ${eventType}`);

      const update: PendingUpdate = {
        table,
        eventType,
        timestamp: Date.now(),
        payload,
      };

      if (bufferUpdates) {
        // Buffer mode: add to pending updates
        setState((prev) => ({
          ...prev,
          pendingUpdates: [...prev.pendingUpdates, update],
        }));
      } else {
        // ── FIX #3: Batched immediate mode — 150ms debounce window ──
        batchTablesRef.current.add(table);
        if (table === "audit_logs") {
          batchAuditPayloadsRef.current.push(payload);
        }
        if (!batchTimerRef.current) {
          batchTimerRef.current = setTimeout(flushBatch, 150);
        }
      }

      // Call external callback
      if (onUpdate) {
        onUpdate(table, payload);
      }
    },
    [bufferUpdates, flushBatch, onUpdate]
  );

  // Setup realtime subscriptions
  useEffect(() => {
    console.log("[Realtime] Setting up subscriptions...");

    const channel = supabase.channel("realtime-system");

    // Subscribe to all tables
    REALTIME_TABLES.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
        },
        (payload) => {
          handleRealtimeEvent(
            table,
            payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            payload
          );
        }
      );
    });

    channel.subscribe((status) => {
      console.log("[Realtime] Subscription status:", status);
      setState((prev) => ({
        ...prev,
        isConnected: status === "SUBSCRIBED",
      }));
    });

    channelRef.current = channel;

    // SESSION_RECOVERY_V1: Reconnect + invalidate on tab resume
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!channelRef.current) return;

      const channelState = (channelRef.current as any)?.state;
      console.log(`[Realtime] Tab resumed, channel state: ${channelState}`);

      if (channelState && channelState !== 'joined' && channelState !== 'joining') {
        console.log("[Realtime] Channel disconnected, resubscribing...");
        channelRef.current.subscribe((status) => {
          console.log("[Realtime] Reconnect status:", status);
          if (status === 'SUBSCRIBED') {
            setState((prev) => ({ ...prev, isConnected: true }));
            // Invalidate critical queries to refetch stale data
            console.log("[Realtime] Reconnected — invalidating active queries");
            queryClient.invalidateQueries({ type: 'active' });
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      console.log("[Realtime] Cleaning up subscriptions...");
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      // Flush any pending batch before unmount
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
        flushBatch();
      }
    };
  }, [handleRealtimeEvent]);

  return {
    isConnected: state.isConnected,
    pendingUpdatesCount: state.pendingUpdates.length,
    lastUpdateAt: state.lastUpdateAt,
    applyUpdates,
    hasPendingUpdates: state.pendingUpdates.length > 0,
  };
}

/**
 * Hook for smart polling fallback
 * Only polls when tab is active, with reduced frequency for background tabs
 */
export function useSmartPolling(
  queryKey: string[],
  pollFn: () => Promise<void>,
  options?: {
    activeInterval?: number; // Default 20s
    backgroundInterval?: number; // Default 60s
    enabled?: boolean;
  }
) {
  const {
    activeInterval = 20000,
    backgroundInterval = 60000,
    enabled = true,
  } = options || {};

  const [isTabActive, setIsTabActive] = useState(!document.hidden);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabActive(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const interval = isTabActive ? activeInterval : backgroundInterval;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      pollFn();
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, isTabActive, activeInterval, backgroundInterval, pollFn]);

  return { isTabActive };
}

/**
 * Optimistic locking helper
 * Checks if record has been modified since last fetch
 */
export async function checkOptimisticLock(
  table: string,
  id: string,
  expectedUpdatedAt: string
): Promise<{ isStale: boolean; currentRecord?: any }> {
  const { data, error } = await supabase
    .from(table as any)
    .select("updated_at, *")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[OptimisticLock] Error checking lock:", error);
    return { isStale: false };
  }

  if (!data) {
    return { isStale: true }; // Record deleted
  }

  const record = data as any;
  const isStale = record.updated_at !== expectedUpdatedAt;
  return { isStale, currentRecord: record };
}

/**
 * Generate idempotency key for financial transactions
 * Format: {userId}-{action}-{targetId}-{timestamp}
 */
export function generateIdempotencyKey(
  userId: string,
  action: string,
  targetId: string
): string {
  const timestamp = Math.floor(Date.now() / 1000); // Seconds precision
  return `${userId}-${action}-${targetId}-${timestamp}`;
}

/**
 * Hook to track which users are viewing/editing a record
 * Uses Supabase Realtime Presence
 */
export function useRecordPresence(
  recordId: string | undefined,
  recordType: string
) {
  const [viewers, setViewers] = useState<string[]>([]);
  const [editors, setEditors] = useState<{ userId: string; userName: string; startedAt: string }[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!recordId) return;

    const roomName = `presence-${recordType}-${recordId}`;
    const channel = supabase.channel(roomName);

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const allPresences = Object.values(presenceState).flat() as any[];

        const viewerIds = allPresences.map((p) => p.user_id);
        const editingUsers = allPresences
          .filter((p) => p.is_editing)
          .map((p) => ({
            userId: p.user_id,
            userName: p.user_name || "Unknown",
            startedAt: p.editing_started_at,
          }));

        setViewers(viewerIds);
        setEditors(editingUsers);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [recordId, recordType]);

  const trackView = useCallback(
    async (userId: string, userName?: string) => {
      if (!channelRef.current) return;

      await channelRef.current.track({
        user_id: userId,
        user_name: userName,
        is_editing: false,
        joined_at: new Date().toISOString(),
      });
    },
    []
  );

  const trackEdit = useCallback(
    async (userId: string, userName?: string) => {
      if (!channelRef.current) return;

      await channelRef.current.track({
        user_id: userId,
        user_name: userName,
        is_editing: true,
        editing_started_at: new Date().toISOString(),
      });
    },
    []
  );

  const stopEdit = useCallback(
    async (userId: string, userName?: string) => {
      if (!channelRef.current) return;

      await channelRef.current.track({
        user_id: userId,
        user_name: userName,
        is_editing: false,
      });
    },
    []
  );

  return {
    viewersCount: viewers.length,
    editors,
    isBeingEdited: editors.length > 0,
    trackView,
    trackEdit,
    stopEdit,
  };
}
