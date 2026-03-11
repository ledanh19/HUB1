/**
 * useNewBookingCount — SOT hook for "new booking" count
 *
 * Single source of truth for "Đặt phòng mới" metric.
 * Used by Dashboard and Stays to ensure consistent numbers.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SOT TIMESTAMP SEMANTICS (important — read before modifying):
 *
 *   booking_date = BUSINESS DATE KEY (SOT for counting bookings per day)
 *     - Type: DATE (YYYY-MM-DD), NOT timestamp → no timezone issue
 *     - Meaning: "ngày khách đặt phòng trên OTA" or "ngày booking được tạo"
 *     - SQL: COALESCE(booking_date, date(created_at))
 *     - Granularity: calendar day (not 24h rolling window)
 *     - Example: booking at 23:30 Jan 1 → booking_date = Jan 1
 *                booking at 00:10 Jan 2 → booking_date = Jan 2
 *                ⬆ This is BY DESIGN — business dates, not rolling 24h
 *
 *   created_at = EVENT TIMELINE KEY (SOT for notifications/bell)
 *     - Type: TIMESTAMPTZ → timezone matters
 *     - Used by: NotificationBell (unread events since lastReadAt)
 *     - NOT used for booking count — different metric with different purpose
 *
 * ═══════════════════════════════════════════════════════════════════
 *
 * SOT Entity: unified_bookings (VIEW = bookings_mirror UNION ALL manual_bookings)
 * SOT Timestamp: booking_date (DATE)
 * Includes: ALL booking_type (PMS, MANUAL, IMPORTED, SYNCED)
 * Includes: ALL booking_status (including CANCELLED, NO_SHOW)
 *
 * BACKEND PATH: Calls get_new_booking_count() RPC if available,
 * falls back to direct unified_bookings query if RPC not deployed yet.
 * This allows the migration to be deployed independently.
 *
 * @param from - Start date (YYYY-MM-DD), inclusive
 * @param to   - End date (YYYY-MM-DD), inclusive. Defaults to `from` if not provided.
 * @param propertyIds - Optional array of An Gia property IDs for group filter
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// An Gia Residences group ID
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

export interface NewBookingCountResult {
    total: number;
    ota: number;
    manual: number;
    /** Sample booking IDs (up to 200) for debug mode */
    sampleIds?: string[];
}

interface UseNewBookingCountOptions {
    /** Start date (YYYY-MM-DD) — this is a BUSINESS DATE KEY, not a timestamp */
    from: string;
    /** End date (YYYY-MM-DD), inclusive. Defaults to `from` */
    to?: string;
    /** Property IDs for group filter. If empty, auto-fetches An Gia group. */
    propertyIds?: string[];
    /** If true, return sample booking IDs for debug */
    debug?: boolean;
    /** Custom stale time (ms) */
    staleTime?: number;
    /** Custom query key suffix for cache separation */
    queryKeySuffix?: string;
    /** Whether the query is enabled */
    enabled?: boolean;
}

/**
 * Resolve An Gia group property IDs (reusable across both paths).
 */
async function resolveAnGiaPropertyIds(): Promise<string[]> {
    const { data: propGroups } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", AN_GIA_GROUP_ID);

    return propGroups?.map(p => p.channex_property_id) || [];
}

/**
 * PRIMARY PATH: Call get_new_booking_count() RPC
 * Returns { count, ota_count, manual_count, booking_ids? }
 * Falls through to FALLBACK PATH if RPC is not deployed yet.
 */
async function fetchViaRPC(
    from: string,
    to: string,
    propertyIds: string[],
    debug: boolean
): Promise<NewBookingCountResult | null> {
    try {
        const { data, error } = await (supabase.rpc as any)("get_new_booking_count", {
            p_from_date: from,
            p_to_date: to,
            p_property_ids: propertyIds.length > 0 ? propertyIds : null,
            p_include_ids: debug,
        });

        if (error) {
            // RPC not deployed yet — fall through to direct query
            console.warn("[useNewBookingCount] RPC not available, falling back to direct query:", error.message);
            return null;
        }

        const result = data as any;
        return {
            total: result.count ?? 0,
            // RPC currently returns total count only — OTA/manual split is done by FE fallback
            // When RPC is enhanced to return split counts, update here
            ota: result.ota_count ?? result.count ?? 0,
            manual: result.manual_count ?? 0,
            sampleIds: debug ? (result.booking_ids ?? []) : undefined,
        };
    } catch {
        // Network error or RPC truly not available
        return null;
    }
}

/**
 * FALLBACK PATH: Direct query to unified_bookings (same SOT, client-side).
 * Used when RPC is not deployed yet.
 */
async function fetchViaDirect(
    from: string,
    to: string,
    propertyIds: string[],
    debug: boolean
): Promise<NewBookingCountResult> {
    let query = supabase
        .from("unified_bookings" as any)
        .select("unified_booking_id, booking_type, booking_status, pms_property_id")
        .gte("booking_date", from)
        .lte("booking_date", to);

    // Group filter: pms_property_id IN group OR null (MANUAL bookings)
    if (propertyIds.length > 0) {
        query = query.or(
            `pms_property_id.in.(${propertyIds.join(",")}),pms_property_id.is.null`
        );
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []) as any[];
    const otaCount = rows.filter(
        b => b.booking_type === "PMS" || b.booking_type === "SYNCED" || !b.booking_type
    ).length;
    const manualCount = rows.filter(b => b.booking_type === "MANUAL").length;

    const result: NewBookingCountResult = {
        total: rows.length,
        ota: otaCount,
        manual: manualCount,
    };

    if (debug) {
        result.sampleIds = rows.slice(0, 200).map((r: any) => r.unified_booking_id);
    }

    return result;
}

export function useNewBookingCount(options: UseNewBookingCountOptions) {
    const {
        from,
        to = from,
        propertyIds,
        debug = false,
        staleTime = 30_000,
        queryKeySuffix = "",
        enabled = true,
    } = options;

    return useQuery<NewBookingCountResult>({
        queryKey: ["new-booking-count-sot", from, to, propertyIds?.join(",") ?? "auto", queryKeySuffix],
        staleTime,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled,
        queryFn: async () => {
            // Step 1: Resolve property IDs
            const resolvedPropertyIds = propertyIds ?? await resolveAnGiaPropertyIds();

            // Step 2: Try RPC first (single entrypoint, server-side count)
            const rpcResult = await fetchViaRPC(from, to, resolvedPropertyIds, debug);
            if (rpcResult) return rpcResult;

            // Step 3: Fallback to direct query (same SOT, client-side)
            return fetchViaDirect(from, to, resolvedPropertyIds, debug);
        },
    });
}

// ═══════════════════════════════════════════════════════════════════
// METRIC NAMING CONVENTION (for team reference)
// ═══════════════════════════════════════════════════════════════════
//
// ┌──────────────────────┬───────────────────────────────────────────┐
// │ METRIC NAME          │ MEANING                                   │
// ├──────────────────────┼───────────────────────────────────────────┤
// │ new-booking-count    │ # bookings by booking_date (business day) │
// │  (this hook)         │ Used by: Dashboard, Stays KPI              │
// │                      │ SOT: unified_bookings.booking_date (DATE) │
// ├──────────────────────┼───────────────────────────────────────────┤
// │ unread-inbox-events  │ # unread notification events               │
// │  (NotificationBell)  │ Used by: Bell badge only                   │
// │                      │ SOT: booking_changes.created_at (TSTZ)    │
// │                      │ Includes: booking + message events         │
// │                      │ ≠ booking count — different metric         │
// └──────────────────────┴───────────────────────────────────────────┘
//
// DO NOT attempt to unify Bell badge with booking count.
// They are fundamentally different metrics with different purposes.
// ═══════════════════════════════════════════════════════════════════
