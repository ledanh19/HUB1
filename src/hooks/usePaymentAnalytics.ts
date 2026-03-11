/**
 * usePaymentAnalytics — P&L-aligned payment analytics hook.
 *
 * ═══ FULLY ALIGNED WITH P&L SOT (usePLCalculator) ═══
 *
 * 1. Hình thức thu (payment_type): HOTEL_COLLECT vs OTA_COLLECT
 *    → Uses bookings_mirror + manual_bookings + check_out_date + CHECKED_OUT stays
 *    → Same time-key & filter logic as P&L room revenue
 *
 * 2. Phương thức thanh toán (payment_method): CASH, BANK_TRANSFER, CARD, etc.
 *    → Uses P&L revenue per booking, grouped by payment_method from hotel_collects
 *    → OTA_COLLECT bookings → "OTA chuyển"
 *    → Total matches P&L room revenue exactly
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";
import { computeBookingAmount } from "@/hooks/useBookingAmountOverrides";

const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

export interface PaymentTypeRow {
    label: string;
    value: number;    // revenue
    count: number;    // number of bookings
    share: number;    // % of total revenue
}

export interface PaymentMethodRow {
    label: string;
    value: number;    // amount collected
    count: number;    // number of collections
    share: number;    // % of total
}

export interface PaymentAnalyticsData {
    /** Hình thức thu: HOTEL_COLLECT / OTA_COLLECT */
    paymentTypes: PaymentTypeRow[];
    /** Phương thức thanh toán: CASH / BANK_TRANSFER / CARD / OTA_PAYOUT */
    paymentMethods: PaymentMethodRow[];
    isLoading: boolean;
}

interface UsePaymentAnalyticsParams {
    dateStart: string;
    dateEnd: string;
    enabled?: boolean;
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
    HOTEL_COLLECT: "Khách sạn thu",
    OTA_COLLECT: "OTA thu",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH: "Tiền mặt",
    BANK_TRANSFER: "Chuyển khoản",
    CARD: "Thẻ",
    OTA_PAYOUT: "OTA chuyển",
    MOMO: "MoMo",
    ZALO_PAY: "ZaloPay",
    ONEPAY: "OnePay",
    "9PAY": "9Pay",
    VPBANK: "VPBank",
    UPC: "UPC",
    PAYMENT_LINK: "Payment Link",
};

/** Paginated fetch helper */
async function fetchAllPages<T>(
    table: string,
    select: string,
    applyFilters: (q: any) => any,
    pageSize = 1000,
): Promise<T[]> {
    const all: T[] = [];
    for (let from = 0; ; from += pageSize) {
        const q = applyFilters(
            (supabase.from as any)(table).select(select).range(from, from + pageSize - 1)
        );
        const { data, error } = await q;
        if (error) { console.error(`[usePaymentAnalytics] ${table} error:`, error); break; }
        if (!data || data.length === 0) break;
        all.push(...(data as T[]));
        if (data.length < pageSize) break;
    }
    return all;
}

export function usePaymentAnalytics({
    dateStart,
    dateEnd,
    enabled,
}: UsePaymentAnalyticsParams): PaymentAnalyticsData {
    const { data, isLoading } = useQuery({
        queryKey: ["payment-analytics-v2", dateStart, dateEnd],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: enabled ?? true,
        queryFn: async () => {
            // ── 1. Resolve An Gia property IDs ──
            const { data: propertyLinks } = await supabase
                .from("channex_property_groups")
                .select("channex_property_id")
                .eq("channex_group_id", AN_GIA_GROUP_ID);
            const propertyIds = propertyLinks?.map((p) => p.channex_property_id) || [];

            // ══════════════════════════════════════════════════════
            // STEP 1: Get ALL bookings (OTA + Manual) — same as P&L
            // ══════════════════════════════════════════════════════

            // A. OTA bookings from bookings_mirror (scoped to An Gia properties)
            let otaBookings: any[] = [];
            if (propertyIds.length > 0) {
                otaBookings = await fetchAllPages<any>(
                    "bookings_mirror",
                    "unified_booking_id, total_amount_net, payment_type, booking_status, channex_status, booking_type",
                    (q: any) => q
                        .not("booking_status", "in", '("CANCELLED","NO_SHOW")')
                        .in("channex_property_id", propertyIds)
                        .gte("check_out_date", dateStart)
                        .lte("check_out_date", dateEnd)
                );
            }

            // B. Manual bookings (no channex_property_id)
            const manualBookings = await fetchAllPages<any>(
                "manual_bookings",
                "unified_booking_id, total_amount_net, payment_type, booking_status",
                (q: any) => q
                    .not("booking_status", "in", '("CANCELLED","NO_SHOW")')
                    .gte("check_out_date", dateStart)
                    .lte("check_out_date", dateEnd)
            );

            // Merge: normalize manual bookings
            const allBookings = [
                ...otaBookings,
                ...manualBookings.map((mb: any) => ({
                    ...mb,
                    booking_type: "MANUAL",
                    channex_status: null,
                })),
            ];

            if (allBookings.length === 0) {
                return { paymentTypes: [], paymentMethods: [] };
            }

            const bookingIds = allBookings.map((b: any) => b.unified_booking_id);

            // ══════════════════════════════════════════════════════
            // STEP 2: Get CHECKED_OUT stays (same as P&L)
            // ══════════════════════════════════════════════════════
            const stays = await fetchAllPages<any>(
                "stays",
                "unified_booking_id",
                (q: any) => q
                    .eq("stay_status", "CHECKED_OUT")
                    .in("unified_booking_id", bookingIds)
            );
            const checkedOutSet = new Set(stays.map((s: any) => s.unified_booking_id));

            // STEP 3: Get overrides (same as P&L)
            const overrides = await fetchAllPages<any>(
                "booking_amount_overrides",
                "unified_booking_id, amount",
                (q: any) => q.in("unified_booking_id", bookingIds)
            );
            const overrideMap = new Map<string, number>();
            overrides.forEach((o: any) => overrideMap.set(o.unified_booking_id, o.amount));

            // STEP 4: Get hotel_collects for payment_method lookup (for Section B)
            const collects = await fetchAllPages<any>(
                "hotel_collects",
                "unified_booking_id, payment_method, amount_collected",
                (q: any) => q
                    .eq("payee_type", "ROOMRISE")
                    .eq("collection_type", "COLLECT")
                    .neq("status", "VOIDED")
                    .in("unified_booking_id", bookingIds)
            );

            // Build a map: booking_id → primary payment_method (highest collected amount)
            const methodByBooking = new Map<string, string>();
            const methodAmountByBooking = new Map<string, Map<string, number>>();
            for (const c of collects) {
                const bid = c.unified_booking_id;
                const pm = (c.payment_method as string) || "OTHER";
                const amt = Math.abs(Number(c.amount_collected || 0));
                if (!methodAmountByBooking.has(bid)) {
                    methodAmountByBooking.set(bid, new Map());
                }
                const inner = methodAmountByBooking.get(bid)!;
                inner.set(pm, (inner.get(pm) || 0) + amt);
            }
            // Pick the payment method with highest collected amount per booking
            for (const [bid, methods] of methodAmountByBooking.entries()) {
                let best = "OTHER";
                let bestAmt = 0;
                for (const [pm, amt] of methods.entries()) {
                    if (amt > bestAmt) { best = pm; bestAmt = amt; }
                }
                methodByBooking.set(bid, best);
            }

            // ══════════════════════════════════════════════════════
            // SECTION A: Hình thức thu (payment_type breakdown)
            // Uses computeBookingAmount revenue — matches P&L exactly
            // ══════════════════════════════════════════════════════
            const typeMap = new Map<string, { revenue: number; count: number }>();
            let totalRevenue = 0;

            // ══════════════════════════════════════════════════════
            // SECTION B: Phương thức thanh toán (payment_method)
            // Uses P&L revenue per booking, grouped by payment_method
            // from hotel_collects. Total matches P&L exactly.
            // ══════════════════════════════════════════════════════
            const methodMap = new Map<string, { amount: number; count: number }>();
            let totalMethodRevenue = 0;

            for (const b of allBookings) {
                // Must have CHECKED_OUT stay (same filter as P&L)
                if (!checkedOutSet.has(b.unified_booking_id)) continue;

                const override = overrideMap.has(b.unified_booking_id)
                    ? { amount: overrideMap.get(b.unified_booking_id)! }
                    : null;
                const computed = computeBookingAmount(b, override as any);
                const rev = computed.amount || 0;

                // --- Section A: group by payment_type ---
                const pt = (b.payment_type as string) || "UNKNOWN";
                const existingType = typeMap.get(pt);
                if (existingType) {
                    existingType.revenue += rev;
                    existingType.count += 1;
                } else {
                    typeMap.set(pt, { revenue: rev, count: 1 });
                }
                totalRevenue += rev;

                // --- Section B: group by payment_method ---
                // OTA_COLLECT → method = "OTA_PAYOUT"
                // HOTEL_COLLECT / MANUAL → look up from hotel_collects
                let pm: string;
                if (pt === "OTA_COLLECT") {
                    pm = "OTA_PAYOUT";
                } else {
                    pm = methodByBooking.get(b.unified_booking_id) || "OTHER";
                }
                const existingMethod = methodMap.get(pm);
                if (existingMethod) {
                    existingMethod.amount += rev;
                    existingMethod.count += 1;
                } else {
                    methodMap.set(pm, { amount: rev, count: 1 });
                }
                totalMethodRevenue += rev;
            }

            // Build paymentTypes result
            const paymentTypes: PaymentTypeRow[] = [];
            for (const [key, d] of typeMap.entries()) {
                paymentTypes.push({
                    label: PAYMENT_TYPE_LABELS[key] || key,
                    value: d.revenue,
                    count: d.count,
                    share: totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0,
                });
            }
            paymentTypes.sort((a, b) => b.value - a.value);

            // Build paymentMethods result
            const paymentMethods: PaymentMethodRow[] = [];
            for (const [key, d] of methodMap.entries()) {
                paymentMethods.push({
                    label: PAYMENT_METHOD_LABELS[key] || key,
                    value: d.amount,
                    count: d.count,
                    share: totalMethodRevenue > 0 ? (d.amount / totalMethodRevenue) * 100 : 0,
                });
            }
            paymentMethods.sort((a, b) => b.value - a.value);

            return { paymentTypes, paymentMethods };
        },
    });

    return {
        paymentTypes: data?.paymentTypes || [],
        paymentMethods: data?.paymentMethods || [],
        isLoading,
    };
}
