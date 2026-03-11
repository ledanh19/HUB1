/**
 * useOtaArSummary — Shared hook for OTA Accounts Receivable summary
 * 
 * SINGLE SOURCE OF TRUTH for "Công nợ OTA" metrics.
 * Used by BOTH Dashboard card AND OTA Payout Dashboard tab.
 * 
 * Metrics:
 * - Eligible (Chờ tạo payout): OTA_COLLECT + CHECKED_OUT + no payout + no dispute
 * - Pending (Đang chuyển về): ota_payouts with status PENDING/PARTIAL
 * - Aging buckets: 0-7, 8-14, 15-30, >30 days since checkout
 */
import { useQuery } from "@tanstack/react-query";
import { supabase, safeFrom } from "@/integrations/supabase";
import { useMemo } from "react";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Query helpers (same as Dashboard — avoid 1000-row cap + large IN clauses)
// ---------------------------------------------------------------------------
const QUERY_PAGE_SIZE = 1000;
const IN_BATCH_SIZE = 200;
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

async function fetchAllRows(
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

async function fetchWithBatchedIn(
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AgingBucket {
    amount: number;
    count: number;
}

export interface OtaArSummary {
    /** Eligible AR total (chờ tạo payout) */
    total: number;
    /** Eligible booking count */
    count: number;
    /** Breakdown by OTA source */
    bySource: Record<string, { amount: number; count: number }>;
    /** Breakdown by property ID */
    byProperty: Record<string, { amount: number; count: number }>;
    /** Aging buckets (from checkout date) */
    aging: {
        bucket0_7: AgingBucket;
        bucket8_14: AgingBucket;
        bucket15_30: AgingBucket;
        bucket30Plus: AgingBucket;
    };
    /** Debug info for data quality panel */
    debug: {
        totalBookings: number;
        withStayCheckout: number;
        withPayout: number;
        withDispute: number;
    };
}

export interface OtaPayoutPendingSummary {
    /** Total amount pending (PENDING + PARTIAL) */
    pending: number;
    /** Number of pending payouts */
    pendingCount: number;
    /** Number of overdue payouts */
    overdueCount: number;
    /** Amount of overdue payouts */
    overdueAmount: number;
}

const EMPTY_AGING = {
    bucket0_7: { amount: 0, count: 0 },
    bucket8_14: { amount: 0, count: 0 },
    bucket15_30: { amount: 0, count: 0 },
    bucket30Plus: { amount: 0, count: 0 },
};

const EMPTY_SUMMARY: OtaArSummary = {
    total: 0,
    count: 0,
    bySource: {},
    byProperty: {},
    aging: EMPTY_AGING,
    debug: { totalBookings: 0, withStayCheckout: 0, withPayout: 0, withDispute: 0 },
};

// ---------------------------------------------------------------------------
// Hook: useOtaArSummary — Eligible OTA AR
// ---------------------------------------------------------------------------
/**
 * Fetches OTA AR eligible bookings summary.
 * Query key: ["dashboard-ota-receivables", today]
 * SAME key as Dashboard — shared cache.
 */
export function useOtaArSummary(options?: { enabled?: boolean }) {
    const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

    return useQuery({
        queryKey: ["dashboard-ota-receivables", today],
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: options?.enabled ?? true,
        queryFn: async (): Promise<OtaArSummary> => {
            // Get An Gia properties (TENANT SCOPE)
            const { data: propGroups } = await supabase
                .from("channex_property_groups")
                .select("channex_property_id")
                .eq("channex_group_id", AN_GIA_GROUP_ID);

            const propertyIds = propGroups?.map(p => p.channex_property_id) || [];

            if (propertyIds.length === 0) return EMPTY_SUMMARY;

            // Step 1: OTA_COLLECT bookings, not CANCELLED, in property scope (paginate)
            const bookingsData = await fetchAllRows(
                "bookings_mirror",
                "unified_booking_id, ota_source, total_amount_net, booking_status, channex_property_id, check_in_date, check_out_date",
                (q: any) =>
                    q.eq("payment_type", "OTA_COLLECT")
                        .neq("booking_status", "CANCELLED")
                        .in("channex_property_id", propertyIds)
            );

            if (!bookingsData || bookingsData.length === 0) return EMPTY_SUMMARY;

            const bookingIds = bookingsData.map((b: any) => b.unified_booking_id);

            // Step 2: GUARDRAIL - stays with CHECKED_OUT (batched IN)
            const staysData = await fetchWithBatchedIn(
                "stays",
                "unified_booking_id, actual_check_out_at",
                "unified_booking_id",
                bookingIds,
                (q: any) => q.eq("stay_status", "CHECKED_OUT")
            );

            // ANTI DOUBLE-COUNT: one CHECKED_OUT stay per booking
            const checkedOutBookings = new Set<string>();
            const stayCheckoutMap = new Map<string, string>();
            staysData?.forEach((s: any) => {
                if (!checkedOutBookings.has(s.unified_booking_id)) {
                    checkedOutBookings.add(s.unified_booking_id);
                    stayCheckoutMap.set(s.unified_booking_id, s.actual_check_out_at);
                }
            });

            // Step 3: bookings already mapped to payout (batched IN)
            const payoutDetails = await fetchWithBatchedIn(
                "ota_payout_details",
                "unified_booking_id",
                "unified_booking_id",
                bookingIds
            );
            const bookingsWithPayout = new Set(
                payoutDetails?.map((p: any) => p.unified_booking_id) || []
            );

            // Step 4: exclude active disputes (batched IN)
            const disputes = await fetchWithBatchedIn(
                "ota_disputes",
                "unified_booking_id, status",
                "unified_booking_id",
                bookingIds,
                (q: any) => q.or("status.eq.OPEN,status.eq.IN_REVIEW")
            );
            const bookingsWithDispute = new Set(
                disputes?.map((d: any) => d.unified_booking_id) || []
            );

            // Step 5: Eligible = CHECKED_OUT + NO payout + NO active dispute
            const eligibleBookings = bookingsData.filter((b: any) =>
                checkedOutBookings.has(b.unified_booking_id) &&
                !bookingsWithPayout.has(b.unified_booking_id) &&
                !bookingsWithDispute.has(b.unified_booking_id)
            );

            // Aggregate: total, bySource, byProperty, aging
            const bySource: Record<string, { amount: number; count: number }> = {};
            const byProperty: Record<string, { amount: number; count: number }> = {};
            const aging = {
                bucket0_7: { amount: 0, count: 0 },
                bucket8_14: { amount: 0, count: 0 },
                bucket15_30: { amount: 0, count: 0 },
                bucket30Plus: { amount: 0, count: 0 },
            };
            let total = 0;
            const todayDate = new Date(today);

            for (const booking of eligibleBookings) {
                const amount = Number(booking.total_amount_net) || 0;
                total += amount;

                // By OTA source
                const source = booking.ota_source || "Other";
                if (!bySource[source]) bySource[source] = { amount: 0, count: 0 };
                bySource[source].amount += amount;
                bySource[source].count += 1;

                // By Property
                const propId = booking.channex_property_id || "unknown";
                if (!byProperty[propId]) byProperty[propId] = { amount: 0, count: 0 };
                byProperty[propId].amount += amount;
                byProperty[propId].count += 1;

                // Aging (from actual checkout → fallback to planned checkout)
                const checkoutStr =
                    stayCheckoutMap.get(booking.unified_booking_id) || booking.check_out_date;
                if (checkoutStr) {
                    const checkoutDate = new Date(checkoutStr);
                    const daysDiff = Math.floor(
                        (todayDate.getTime() - checkoutDate.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    if (daysDiff <= 7) {
                        aging.bucket0_7.amount += amount;
                        aging.bucket0_7.count += 1;
                    } else if (daysDiff <= 14) {
                        aging.bucket8_14.amount += amount;
                        aging.bucket8_14.count += 1;
                    } else if (daysDiff <= 30) {
                        aging.bucket15_30.amount += amount;
                        aging.bucket15_30.count += 1;
                    } else {
                        aging.bucket30Plus.amount += amount;
                        aging.bucket30Plus.count += 1;
                    }
                }
            }

            return {
                total,
                count: eligibleBookings.length,
                bySource,
                byProperty,
                aging,
                debug: {
                    totalBookings: bookingsData.length,
                    withStayCheckout: checkedOutBookings.size,
                    withPayout: bookingsWithPayout.size,
                    withDispute: bookingsWithDispute.size,
                },
            };
        },
    });
}

// ---------------------------------------------------------------------------
// Hook: useOtaPayoutPendingSummary — Pending payouts snapshot
// ---------------------------------------------------------------------------
/**
 * Fetches pending OTA payout summary (PENDING + PARTIAL).
 * Query key: ["dashboard-ota-payout-pending"]
 * SAME key as Dashboard — shared cache.
 */
export function useOtaPayoutPendingSummary(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ["dashboard-ota-payout-pending"],
        staleTime: 5 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: options?.enabled ?? true,
        queryFn: async (): Promise<OtaPayoutPendingSummary> => {
            const { data, error } = await supabase
                .from("ota_payouts")
                .select("net_payout_amount, total_amount, status, payout_date")
                .in("status", ["PENDING", "PARTIAL"])
                .eq("is_voided", false);

            if (error) throw error;

            // SOT: use net_payout_amount (after deductions), fallback total_amount
            // Matches OTA Payout page (OtaPayoutsPage.tsx) logic exactly.
            const netAmount = (p: any) => Number(p.net_payout_amount ?? p.total_amount ?? 0);

            const pending = data?.reduce((sum, p) => sum + netAmount(p), 0) || 0;
            const pendingCount = data?.length || 0;

            const now = new Date();
            const overdueItems = data?.filter(p => new Date(p.payout_date) < now) || [];
            const overdueCount = overdueItems.length;
            const overdueAmount = overdueItems.reduce(
                (sum, p) => sum + netAmount(p), 0
            );

            return { pending, pendingCount, overdueCount, overdueAmount };
        },
    });
}
