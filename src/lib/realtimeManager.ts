/**
 * CENTRALIZED REALTIME MANAGER
 * 
 * Goals:
 * - Single subscription per (table + filter) combination
 * - Reference counting for multiple listeners
 * - Event deduplication with composite key + TTL
 * - Buffer events during fetch to prevent race condition
 * - Memory-safe cleanup
 * 
 * @author Senior Realtime Systems Engineer
 * @date 31/12/2024
 */

import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

// Types
export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";
export type RealtimeTable =
  | "booking_changes"
  | "messages"
  | "conversations"
  | "bookings_mirror"
  | "manual_bookings"
  | "payment_requests"
  | "cash_outs"
  | "host_payables"
  | "host_payments"
  | "guest_documents"
  | "notifications";

export interface RealtimeEvent {
  table: RealtimeTable;
  eventType: RealtimeEventType;
  payload: RealtimePostgresChangesPayload<any>;
  receivedAt: number;
  eventKey: string; // Composite dedup key
}

export type RealtimeListener = (event: RealtimeEvent) => void;

interface Subscription {
  channel: RealtimeChannel;
  refCount: number;
  listeners: Set<RealtimeListener>;
}

interface PendingEvent {
  event: RealtimeEvent;
  bufferedAt: number;
}

// Constants
const EVENT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEDUP_WINDOW_MS = 60 * 1000; // 60 seconds for same canonical event

/**
 * Generate deterministic channel key
 * Format: rt:{table}:{filter_key}
 */
function getChannelKey(table: RealtimeTable, filter?: string): string {
  return filter ? `rt:${table}:${filter}` : `rt:${table}:*`;
}

/**
 * Generate composite event key for deduplication
 * Format: {table}:{row.id}:{row.created_at || row.updated_at}
 */
function generateEventKey(table: RealtimeTable, payload: any): string {
  const row = payload.new || payload.old || {};
  const id = row.id || "unknown";
  const timestamp = row.created_at || row.updated_at || new Date().toISOString();
  return `${table}:${id}:${timestamp}`;
}

/**
 * Generate canonical key for logical event dedup
 * (same entity + same event type within time window)
 */
function generateCanonicalKey(table: RealtimeTable, eventType: RealtimeEventType, payload: any): string {
  const row = payload.new || payload.old || {};

  // For booking_changes, use unified_booking_id + change_type
  if (table === "booking_changes") {
    return `bc:${row.unified_booking_id}:${row.change_type}`;
  }

  // For messages, use conversation_id + external_message_id
  if (table === "messages") {
    return `msg:${row.conversation_id}:${row.external_message_id || row.id}`;
  }

  // Default: table + id
  return `${table}:${row.id}`;
}

/**
 * RealtimeManager Singleton
 */
class RealtimeManagerClass {
  private subscriptions: Map<string, Subscription> = new Map();
  private processedEvents: Map<string, number> = new Map(); // eventKey → timestamp
  private canonicalEvents: Map<string, number> = new Map(); // canonicalKey → timestamp
  private pendingBuffer: Map<string, PendingEvent[]> = new Map(); // channelKey → buffered events
  private fetchingChannels: Set<string> = new Set();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;
  private _visibilityHandler: (() => void) | null = null;
  private _reconnectAttempts = 0;

  /**
   * Initialize the manager (call once at app start)
   */
  initialize(): void {
    if (this.isInitialized) return;

    console.log("[RealtimeManager] Initializing...");

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEvents();
    }, CLEANUP_INTERVAL_MS);

    // SESSION_RECOVERY_V1: Listen for tab visibility to reconnect channels
    this._visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this._onTabResume();
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    this.isInitialized = true;
  }

  /**
   * SESSION_RECOVERY_V1: Check and reconnect disconnected channels on tab resume
   */
  private _onTabResume(): void {
    if (this.subscriptions.size === 0) return;

    console.log("[RealtimeManager] Tab resumed, checking channel states...");

    let disconnectedCount = 0;
    this.subscriptions.forEach((sub, key) => {
      // Check channel state — Supabase channels have a .state property
      const state = (sub.channel as any)?.state;
      if (state && state !== 'joined' && state !== 'joining') {
        disconnectedCount++;
        console.log(`[RealtimeManager] Channel ${key} is ${state}, reconnecting...`);

        // Force resubscribe
        try {
          sub.channel.subscribe((status) => {
            console.log(`[RealtimeManager] Reconnect ${key}: ${status}`);
            if (status === 'SUBSCRIBED') {
              this._reconnectAttempts = 0;
            }
          });
        } catch (err) {
          console.error(`[RealtimeManager] Reconnect failed for ${key}:`, err);
        }
      }
    });

    if (disconnectedCount > 0) {
      console.log(`[RealtimeManager] Reconnected ${disconnectedCount} channels`);
    } else {
      console.log("[RealtimeManager] All channels healthy");
    }
  }

  /**
   * Subscribe to realtime events for a table
   * Returns unsubscribe function
   */
  subscribe(
    table: RealtimeTable,
    listener: RealtimeListener,
    options?: {
      filter?: string;
      eventTypes?: RealtimeEventType[];
    }
  ): () => void {
    const { filter, eventTypes = ["INSERT", "UPDATE", "DELETE"] } = options || {};
    const channelKey = getChannelKey(table, filter);

    console.log(`[RealtimeManager] Subscribe request: ${channelKey}`);

    let subscription = this.subscriptions.get(channelKey);

    if (!subscription) {
      // Create new subscription
      const channel = supabase.channel(channelKey);

      // Subscribe to specified event types
      eventTypes.forEach((eventType) => {
        const config: any = {
          event: eventType,
          schema: "public",
          table,
        };

        // Add filter if specified
        if (filter) {
          config.filter = filter;
        }

        channel.on(
          "postgres_changes",
          config,
          (payload: RealtimePostgresChangesPayload<any>) => {
            this.handleEvent(channelKey, table, eventType, payload);
          }
        );
      });

      channel.subscribe((status) => {
        console.log(`[RealtimeManager] ${channelKey} status: ${status}`);
      });

      subscription = {
        channel,
        refCount: 0,
        listeners: new Set(),
      };

      this.subscriptions.set(channelKey, subscription);
    }

    // Add listener and increment ref count
    subscription.listeners.add(listener);
    subscription.refCount++;

    console.log(`[RealtimeManager] ${channelKey} refCount: ${subscription.refCount}`);

    // Return unsubscribe function
    return () => {
      this.unsubscribe(channelKey, listener);
    };
  }

  /**
   * Unsubscribe a listener
   */
  private unsubscribe(channelKey: string, listener: RealtimeListener): void {
    const subscription = this.subscriptions.get(channelKey);
    if (!subscription) return;

    subscription.listeners.delete(listener);
    subscription.refCount--;

    console.log(`[RealtimeManager] ${channelKey} refCount after unsub: ${subscription.refCount}`);

    // Clean up channel if no more listeners
    if (subscription.refCount <= 0) {
      console.log(`[RealtimeManager] Removing channel: ${channelKey}`);
      supabase.removeChannel(subscription.channel);
      this.subscriptions.delete(channelKey);
      this.pendingBuffer.delete(channelKey);
    }
  }

  /**
   * Handle incoming realtime event
   */
  private handleEvent(
    channelKey: string,
    table: RealtimeTable,
    eventType: RealtimeEventType,
    payload: RealtimePostgresChangesPayload<any>
  ): void {
    const now = Date.now();
    const eventKey = generateEventKey(table, payload);
    const canonicalKey = generateCanonicalKey(table, eventType, payload);

    // PHASE 2: Enhanced delay diagnostic logging
    const row = payload.new || payload.old || {};
    const dbCreatedAt = row.created_at ? new Date(row.created_at).getTime() : null;
    const commitTimestamp = (payload as any).commit_timestamp
      ? new Date((payload as any).commit_timestamp).getTime()
      : null;

    const delayFromDb = dbCreatedAt ? now - dbCreatedAt : null;
    const delayFromCommit = commitTimestamp ? now - commitTimestamp : null;

    console.log(`[RealtimeManager] Event received:`, {
      channelKey,
      table,
      eventType,
      eventKey,
      canonicalKey,
      // DELAY DIAGNOSTICS
      receivedAt: new Date(now).toISOString(),
      dbCreatedAt: dbCreatedAt ? new Date(dbCreatedAt).toISOString() : null,
      commitTimestamp: commitTimestamp ? new Date(commitTimestamp).toISOString() : null,
      delayFromDbMs: delayFromDb,
      delayFromCommitMs: delayFromCommit,
      // Flag significant delays (> 5 seconds)
      isDelayed: (delayFromDb && delayFromDb > 5000) || (delayFromCommit && delayFromCommit > 5000),
    });

    // DEDUP CHECK 1: Exact event key (same row, same timestamp)
    if (this.processedEvents.has(eventKey)) {
      console.log(`[RealtimeManager] SKIP: Exact duplicate - ${eventKey}`);
      return;
    }

    // DEDUP CHECK 2: Canonical key within time window (same logical event)
    const lastCanonical = this.canonicalEvents.get(canonicalKey);
    if (lastCanonical && now - lastCanonical < DEDUP_WINDOW_MS) {
      console.log(`[RealtimeManager] SKIP: Canonical duplicate within ${DEDUP_WINDOW_MS}ms - ${canonicalKey}`);
      return;
    }

    // Mark as processed
    this.processedEvents.set(eventKey, now);
    this.canonicalEvents.set(canonicalKey, now);

    const event: RealtimeEvent = {
      table,
      eventType,
      payload,
      receivedAt: now,
      eventKey,
    };

    // Check if fetch is in progress for this channel
    if (this.fetchingChannels.has(channelKey)) {
      console.log(`[RealtimeManager] BUFFER: Fetch in progress - ${channelKey}`);
      this.bufferEvent(channelKey, event);
      return;
    }

    // Dispatch to listeners
    this.dispatchEvent(channelKey, event);
  }

  /**
   * Buffer event during fetch
   */
  private bufferEvent(channelKey: string, event: RealtimeEvent): void {
    let buffer = this.pendingBuffer.get(channelKey);
    if (!buffer) {
      buffer = [];
      this.pendingBuffer.set(channelKey, buffer);
    }
    buffer.push({
      event,
      bufferedAt: Date.now(),
    });
  }

  /**
   * Dispatch event to all listeners
   */
  private dispatchEvent(channelKey: string, event: RealtimeEvent): void {
    const subscription = this.subscriptions.get(channelKey);
    if (!subscription) return;

    console.log(`[RealtimeManager] DISPATCH to ${subscription.listeners.size} listeners:`, {
      channelKey,
      eventKey: event.eventKey,
    });

    subscription.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(`[RealtimeManager] Listener error:`, error);
      }
    });
  }

  /**
   * Mark fetch start for a channel (buffer events)
   */
  markFetchStart(table: RealtimeTable, filter?: string): void {
    const channelKey = getChannelKey(table, filter);
    console.log(`[RealtimeManager] Fetch START: ${channelKey}`);
    this.fetchingChannels.add(channelKey);
  }

  /**
   * Mark fetch complete for a channel (flush buffer)
   */
  markFetchComplete(table: RealtimeTable, filter?: string): void {
    const channelKey = getChannelKey(table, filter);
    console.log(`[RealtimeManager] Fetch COMPLETE: ${channelKey}`);
    this.fetchingChannels.delete(channelKey);

    // Flush buffered events
    const buffer = this.pendingBuffer.get(channelKey);
    if (buffer && buffer.length > 0) {
      console.log(`[RealtimeManager] FLUSHING ${buffer.length} buffered events for ${channelKey}`);
      buffer.forEach(({ event }) => {
        this.dispatchEvent(channelKey, event);
      });
      this.pendingBuffer.delete(channelKey);
    }
  }

  /**
   * Check if an event has been processed (for external dedup)
   */
  isEventProcessed(table: RealtimeTable, rowId: string, timestamp: string): boolean {
    const eventKey = `${table}:${rowId}:${timestamp}`;
    return this.processedEvents.has(eventKey);
  }

  /**
   * Manually mark an event as processed (for fetch results)
   */
  markEventProcessed(table: RealtimeTable, rowId: string, timestamp: string): void {
    const eventKey = `${table}:${rowId}:${timestamp}`;
    this.processedEvents.set(eventKey, Date.now());
  }

  /**
   * Cleanup expired events to prevent memory leak
   */
  private cleanupExpiredEvents(): void {
    const now = Date.now();
    let processedRemoved = 0;
    let canonicalRemoved = 0;

    // Clean processed events
    this.processedEvents.forEach((timestamp, key) => {
      if (now - timestamp > EVENT_TTL_MS) {
        this.processedEvents.delete(key);
        processedRemoved++;
      }
    });

    // Clean canonical events
    this.canonicalEvents.forEach((timestamp, key) => {
      if (now - timestamp > EVENT_TTL_MS) {
        this.canonicalEvents.delete(key);
        canonicalRemoved++;
      }
    });

    if (processedRemoved > 0 || canonicalRemoved > 0) {
      console.log(`[RealtimeManager] Cleanup: removed ${processedRemoved} processed, ${canonicalRemoved} canonical events`);
    }
  }

  /**
   * Get current state for debugging
   */
  getDebugState(): {
    subscriptions: string[];
    processedCount: number;
    canonicalCount: number;
    fetchingCount: number;
    bufferSizes: Record<string, number>;
  } {
    const bufferSizes: Record<string, number> = {};
    this.pendingBuffer.forEach((buffer, key) => {
      bufferSizes[key] = buffer.length;
    });

    return {
      subscriptions: Array.from(this.subscriptions.keys()),
      processedCount: this.processedEvents.size,
      canonicalCount: this.canonicalEvents.size,
      fetchingCount: this.fetchingChannels.size,
      bufferSizes,
    };
  }

  /**
   * Destroy the manager (call on app unmount)
   */
  destroy(): void {
    console.log("[RealtimeManager] Destroying...");

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // SESSION_RECOVERY_V1: Remove visibility handler
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }

    // Remove all channels
    this.subscriptions.forEach((subscription, key) => {
      console.log(`[RealtimeManager] Removing channel: ${key}`);
      supabase.removeChannel(subscription.channel);
    });

    // Clear all maps
    this.subscriptions.clear();
    this.processedEvents.clear();
    this.canonicalEvents.clear();
    this.pendingBuffer.clear();
    this.fetchingChannels.clear();

    this.isInitialized = false;
  }
}

// Export singleton instance
export const realtimeManager = new RealtimeManagerClass();

// Export hook for React components
import { useEffect, useRef, useCallback } from "react";

/**
 * React hook to subscribe to realtime events
 * Automatically handles cleanup on unmount
 */
export function useRealtimeSubscription(
  table: RealtimeTable,
  listener: RealtimeListener,
  options?: {
    filter?: string;
    eventTypes?: RealtimeEventType[];
    enabled?: boolean;
  }
): void {
  const { filter, eventTypes, enabled = true } = options || {};
  const listenerRef = useRef(listener);

  // Keep listener ref up to date
  listenerRef.current = listener;

  // Stable callback wrapper
  const stableListener = useCallback((event: RealtimeEvent) => {
    listenerRef.current(event);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Initialize manager if not already
    realtimeManager.initialize();

    // Subscribe
    const unsubscribe = realtimeManager.subscribe(table, stableListener, {
      filter,
      eventTypes,
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [table, filter, eventTypes?.join(","), enabled, stableListener]);
}

/**
 * Hook to mark fetch boundaries
 */
export function useFetchBoundary(table: RealtimeTable, filter?: string) {
  const markStart = useCallback(() => {
    realtimeManager.markFetchStart(table, filter);
  }, [table, filter]);

  const markComplete = useCallback(() => {
    realtimeManager.markFetchComplete(table, filter);
  }, [table, filter]);

  return { markStart, markComplete };
}
