/**
 * DashboardV2 — Stripe-Level SaaS Analytics Dashboard (V3 Redesign)
 *
 * Architecture: Composable hooks (no monolithic useDashboardAnalytics)
 *   - useHistoricalAnalytics → revenue trends, channel share, property ranking
 *   - usePLCalculator → P&L and cashflow
 *   - fetchStaysOperations → operational KPIs
 *   - useNewBookingCount → new bookings today
 *   - useOtaArSummary / useOtaPayoutPendingSummary → OTA receivables
 *   - Inline queries → forecast, disputes, recent bookings
 *
 * Design: Chart-first (70% charts / 30% numbers), Stripe/Linear/Vercel style
 */

import { useState, useMemo, useEffect, useRef } from "react";
import "@/components/dashboard-v2/dashboard-motion.css";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, subDays, startOfMonth, addDays } from "date-fns";
import { toast } from "sonner";
import {
    CalendarCheck, Users, Home, Clock, DollarSign, TrendingUp,
    ArrowUpFromLine, ArrowDownToLine, Wallet, BarChart3,
    Building2, Receipt, Activity, Target, Scale,
    ClipboardList, LogIn, LogOut, BedDouble,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { supabase, safeFrom } from "@/integrations/supabase";
import { StatusBadge } from "@/components/ui/status-badge";
import { OtaBadge } from "@/components/ui/ota-badge";
import { getBookingStatusVariant } from "@/constants/status-config";

// SOT Hooks
import { usePLCalculator } from "@/hooks/usePLCalculator";
import { useOtaPayoutPendingSummary } from "@/hooks/useOtaArSummary";
import { useOtaArDashboardV2 } from "@/hooks/useOtaArDashboardV2";
import { useNewBookingCount } from "@/hooks/useNewBookingCount";
import { fetchStaysOperations, type StayWithBooking } from "@/lib/stays/fetchStaysOperations";
import { useHistoricalAnalyticsPL } from "@/hooks/useHistoricalAnalyticsPL";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { isDashboardAggEnabled, getDashboardAggMode } from "@/lib/flags/dashboardAgg";
import { validateForecastV1, validateHostDebtV1 } from "@/lib/validate/dashboardAggSchemas";
import { useGuestOriginAnalytics } from "@/hooks/useGuestOriginAnalytics";

const IN_BATCH_SIZE = 200;
async function fetchWithBatchedIn(
    tableName: string,
    selectQuery: string,
    columnName: string,
    ids: string[],
): Promise<any[]> {
    if (!ids.length) return [];
    const all: any[] = [];
    for (let i = 0; i < ids.length; i += IN_BATCH_SIZE) {
        const batch = ids.slice(i, i + IN_BATCH_SIZE);
        const { data, error } = await safeFrom(tableName as any).select(selectQuery)
            .in(columnName, batch);
        if (error) throw error;
        if (data) all.push(...data);
    }
    return all;
}

// Dashboard V2 components
import {
    KpiCardV2,
    SectionHeaderV2,
    HealthBar,
    RevenueTrendChart,
    ChannelDonutChart,
    FinancialWaterfallChart,
    ForecastLineChart,
    ForecastRevenueChart,
    ExpenseBreakdownChart,
    CashflowChart,
    ProfitCashComparisonChart,
    OtaReceivableAgingChart,
    HostSettlementProgressChart,
    ForecastExpensesChart,
    ProjectedNetCard,
    OtaPerformanceTable,
    PropertyPerformanceTable,
    GuestOriginSection,
} from "@/components/dashboard-v2";
import type { HealthAlert } from "@/components/dashboard-v2";

import { useDashboardIsMobile } from "@/hooks/useDashboardIsMobile";
import { useDashboardPerf } from "@/hooks/useDashboardPerf";
import { DashboardV2Mobile } from "@/components/dashboard-v2/mobile/DashboardV2Mobile";
import type { DashboardMobileProps } from "@/components/dashboard-v2/mobile/DashboardV2Mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DashboardAnalyticsTab } from "@/components/dashboard-v2/tabs/DashboardAnalyticsTab";
import { usePaymentAnalytics } from "@/hooks/usePaymentAnalytics";
import { PaymentAnalyticsCharts } from "@/components/dashboard-v2/charts/PaymentAnalyticsCharts";
import { useHostRanking } from "@/hooks/dashboard/useHostRanking";
import { useAreaRanking } from "@/hooks/dashboard/useAreaRanking";
import { HostRankingChart } from "@/components/dashboard-v2/charts/HostRankingChart";
import { AreaRankingChart } from "@/components/dashboard-v2/charts/AreaRankingChart";

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return `${(v / 1_000).toFixed(0)}K`;
};

const formatCurrencyFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(v);

const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

type PeriodFilter = "7days" | "30days" | "month";

const periodTrendLabel = (p: PeriodFilter) => {
    switch (p) {
        case "7days": return "so với 7 ngày trước";
        case "30days": return "so với 30 ngày trước";
        case "month": return "so với tháng trước";
    }
};

// ============================================================================
// CARD WRAPPER — Lightweight Stripe-style card
// ============================================================================

function DashCard({
    children,
    className,
    noPadding,
}: {
    children: React.ReactNode;
    className?: string;
    noPadding?: boolean;
}) {
    return (
        <div
            className={cn(
                "rounded-2xl bg-card border border-border/30 dv2-card",
                "shadow-[0_2px_6px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.05)]",
                "relative overflow-visible hover:z-20",
                !noPadding && "p-4",
                className
            )}
        >
            {children}
        </div>
    );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DashboardV2() {
    const navigate = useNavigate();
    const { appNavigate } = useAppNavigate();
    const location = useLocation();
    const [period, setPeriod] = useState<PeriodFilter>("month");
    const [activeTab, setActiveTab] = useState("report");

    useEffect(() => {
        if (location.state?.accessDenied) {
            toast.error("Bạn không có quyền truy cập trang đó", {
                description: "Vui lòng liên hệ quản trị viên nếu cần cấp quyền",
            });
            navigate("/", { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

    const dateRange = useMemo(() => {
        const now = new Date();
        switch (period) {
            case "7days":
                return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
            case "30days":
                return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
            case "month":
                return { from: startOfMonth(now), to: endOfDay(now) };
        }
    }, [period]);

    const dateStart = useMemo(() => format(dateRange.from, "yyyy-MM-dd"), [dateRange]);
    const dateEnd = useMemo(() => format(dateRange.to, "yyyy-MM-dd"), [dateRange]);

    // ========================================================================
    // HOOKS (unchanged from V2)
    // ========================================================================
    const isMobile = useDashboardIsMobile();

    // ── PHASED LOADING (mobile only) ──
    // Phase 1: above-fold (KPIs + forecast + hostDebt) → fires immediately
    // Phase 2: below-fold (analytics, PL, OTA, guestOrigin, etc.) → waits for Phase 1
    // On desktop: all fire immediately (!isMobile = true bypasses gate)
    const [criticalReady, setCriticalReady] = useState(!isMobile);

    const analytics = useHistoricalAnalyticsPL({
        dateStart,
        dateEnd,
        granularity: "day",
        compareMode: "previous",
        enabled: !isMobile || criticalReady, // Phase 2: wait for above-fold on mobile
    });

    const hostRanking = useHostRanking({
        dateStart,
        dateEnd,
        enabled: !isMobile || criticalReady,
    });

    // Area ranking — queries P&L SOT directly for Dashboard tab
    const areaRanking = useAreaRanking({
        dateStart,
        dateEnd,
        sot: "pl",
        enabled: !isMobile || criticalReady,
    });

    const { data: pl, isLoading: plLoading } = usePLCalculator({
        startDate: dateRange.from,
        endDate: dateRange.to,
        enabled: !isMobile || criticalReady, // Phase 2: wait for above-fold on mobile
    });

    const staysQuery = useQuery<StayWithBooking[]>({
        queryKey: ["stays_operations", today],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: () => fetchStaysOperations(today),
    });
    const { data: staysData = [], isLoading: staysLoading } = staysQuery;

    // Yesterday stays for KPI trend comparison
    const yesterday = useMemo(() => format(subDays(new Date(), 1), "yyyy-MM-dd"), []);
    const { data: yesterdayStaysData = [] } = useQuery<StayWithBooking[]>({
        queryKey: ["stays_operations_yesterday", yesterday],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: !isMobile || criticalReady, // Phase 2: trend comparison
        queryFn: () => fetchStaysOperations(yesterday),
    });

    const { data: bookingsCountData } = useNewBookingCount({
        from: today,
        staleTime: DASHBOARD_STALE_TIMES.operations,
        queryKeySuffix: "dashboard-v2",
    });

    const { data: yesterdayBookingsCountData } = useNewBookingCount({
        from: yesterday,
        staleTime: DASHBOARD_STALE_TIMES.operations,
        queryKeySuffix: "dashboard-v2-yesterday",
        enabled: !isMobile || criticalReady,
    });

    const opsKpis = useMemo(() => {
        const checkinAll: StayWithBooking[] = [];
        const inHouseList: StayWithBooking[] = [];
        const checkoutAll: StayWithBooking[] = [];
        const noRoomAll: StayWithBooking[] = [];
        const seenNoRoom = new Set<string>();

        for (const s of staysData) {
            if (!s.booking) continue;
            if (s.booking.booking_status === "CANCELLED" || s.booking.booking_status === "NO_SHOW") continue;

            const hasSegment = !!s.segment;
            const checkedInAt = s.actual_check_in_at;
            const checkedOutAt = s.actual_check_out_at;

            const segmentDateFrom = s.segment?.date_from?.split("T")[0];
            if (hasSegment ? segmentDateFrom === today : s.booking.check_in_date === today) {
                checkinAll.push(s);
            }
            if (checkedInAt && !checkedOutAt) {
                inHouseList.push(s);
            }
            if (hasSegment) {
                const segmentDateTo = s.segment?.date_to?.split("T")[0];
                const checkOutDateForKpi = segmentDateTo || s.booking.check_out_date;
                if (checkOutDateForKpi === today) {
                    checkoutAll.push(s);
                }
            }
            if (!seenNoRoom.has(s.unified_booking_id)) {
                const isComplete = s.coverage?.isComplete ?? false;
                if (!isComplete) {
                    seenNoRoom.add(s.unified_booking_id);
                    noRoomAll.push(s);
                }
            }
        }
        return { checkinAll, inHouseList, checkoutAll, noRoomAll };
    }, [staysData, today]);

    const pendingRooms = useMemo(() => {
        const todayMs = new Date().setHours(0, 0, 0, 0);
        return opsKpis.noRoomAll.filter(s => {
            if (!s.booking?.check_in_date) return false;
            const checkInMs = new Date(s.booking.check_in_date + "T00:00:00").getTime();
            const diffDays = Math.floor((checkInMs - todayMs) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 7;
        }).length;
    }, [opsKpis.noRoomAll]);

    const todayCheckIns = opsKpis.checkinAll.length;
    const inHouse = opsKpis.inHouseList.length;
    const todayCheckOuts = opsKpis.checkoutAll.length;

    // Yesterday KPIs for trend %
    const yesterdayKpis = useMemo(() => {
        let checkins = 0, inHouseY = 0, checkouts = 0;
        for (const s of yesterdayStaysData) {
            if (!s.booking) continue;
            if (s.booking.booking_status === "CANCELLED" || s.booking.booking_status === "NO_SHOW") continue;
            const hasSegment = !!s.segment;
            const segmentDateFrom = s.segment?.date_from?.split("T")[0];
            if (hasSegment ? segmentDateFrom === yesterday : s.booking.check_in_date === yesterday) checkins++;
            if (s.actual_check_in_at && !s.actual_check_out_at) inHouseY++;
            if (hasSegment) {
                const segmentDateTo = s.segment?.date_to?.split("T")[0];
                if ((segmentDateTo || s.booking.check_out_date) === yesterday) checkouts++;
            }
        }
        return { checkins, inHouse: inHouseY, checkouts };
    }, [yesterdayStaysData, yesterday]);

    const pctChange = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? 100 : null;
        return ((curr - prev) / prev) * 100;
    };

    // OTA AR: use canonical RPC (same SOT as OTA Payout page) — eliminates aging drift
    const { data: otaArRpcData, isLoading: otaArLoading } = useOtaArDashboardV2();
    // Map RPC output to the shape Dashboard consumers expect
    const otaReceivablesData = otaArRpcData ? {
        total: otaArRpcData.summary.eligible_amount,
        count: otaArRpcData.summary.eligible_count,
        aging: {
            bucket0_7: otaArRpcData.aging.find(a => a.bucket === '0_7') || { amount: 0, count: 0 },
            bucket8_14: otaArRpcData.aging.find(a => a.bucket === '8_14') || { amount: 0, count: 0 },
            bucket15_30: otaArRpcData.aging.find(a => a.bucket === '15_30') || { amount: 0, count: 0 },
            bucket30Plus: otaArRpcData.aging.find(a => a.bucket === 'GT_30') || { amount: 0, count: 0 },
        },
    } : undefined;
    const { data: otaPayoutData, isLoading: otaPayoutLoading } = useOtaPayoutPendingSummary({ enabled: !isMobile || criticalReady });

    // Guest Origin analytics — respects period filter
    const guestOrigin = useGuestOriginAnalytics({ dateStart, dateEnd, enabled: !isMobile || criticalReady });

    // Payment analytics — follows period filter, P&L-aligned scope
    const paymentAnalytics = usePaymentAnalytics({ dateStart, dateEnd, enabled: !isMobile || criticalReady });

    const { data: openDisputes } = useQuery({
        queryKey: ["dashboard-open-disputes"],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: !isMobile || criticalReady, // Phase 2: health alerts
        queryFn: async () => {
            const { data, error } = await supabase
                .from("ota_disputes")
                .select("amount_in_dispute")
                .in("status", ["OPEN", "IN_REVIEW"]);
            if (error) throw error;
            return {
                amount: data?.reduce((sum, d) => sum + Number(d.amount_in_dispute), 0) || 0,
                count: data?.length || 0,
            };
        },
    });

    const forecast30d = useMemo(() => format(addDays(new Date(), 30), "yyyy-MM-dd"), []);

    const { data: forecastData, isLoading: forecastLoading } = useQuery({
        queryKey: ["dashboard-pipeline-forecast", today],
        staleTime: DASHBOARD_STALE_TIMES.forecast,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const isDev = import.meta.env.DEV;
            const t0 = isDev ? performance.now() : 0;
            const aggEnabled = isDashboardAggEnabled();

            // ── AGG V1: single RPC with auto-fallback ──
            if (aggEnabled) {
                try {
                    const { data, error } = await supabase.rpc("dashboard_forecast_summary_v1" as any);
                    if (error) throw error;
                    const validated = validateForecastV1(data);
                    if (validated) {
                        if (isDev) console.info("[Dashboard Agg] forecast_v1 ok", { ms: Math.round(performance.now() - t0), mode: getDashboardAggMode() });
                        return validated;
                    }
                    if (isDev) console.warn("[Dashboard Agg] forecast_v1 fallback reason=invalid_shape", data);
                } catch (err) {
                    if (isDev) console.warn("[Dashboard Agg] forecast_v1 fallback reason=error", err);
                }
            }

            // ── Phase 3A: Batch 1 — 3 independent queries in parallel ──
            // Pipeline status: ALL pending/partial payouts (no date window) — aligns with OTA Payout page SOT
            const [partialRes, pendingRes, serviceRes] = await Promise.all([
                supabase.from("ota_payouts").select("net_payout_amount, total_amount, status")
                    .eq("status", "PARTIAL").eq("is_voided", false),
                supabase.from("ota_payouts").select("net_payout_amount, total_amount, status")
                    .eq("status", "PENDING").eq("is_voided", false),
                supabase.from("service_settlements").select("id, net_amount")
                    .not("finalized_at", "is", null),
            ]);

            const committedIn = partialRes.data?.reduce((sum, p) => sum + Number(p.net_payout_amount ?? p.total_amount ?? 0), 0) || 0;
            const likelyIn = pendingRes.data?.reduce((sum, p) => sum + Number(p.net_payout_amount ?? p.total_amount ?? 0), 0) || 0;
            const pendingCount = pendingRes.data?.length || 0;
            const partialCount = partialRes.data?.length || 0;

            let expectedServiceOut = 0;
            const serviceSettlements = serviceRes.data;
            if (serviceSettlements && serviceSettlements.length > 0) {
                const serviceIds = serviceSettlements.map((s: any) => s.id);
                const { data: serviceCashflows } = await supabase
                    .from("cashflow_entries")
                    .select("source_id, amount, direction")
                    .eq("source_type", "SERVICE_SETTLEMENT_PAYMENT")
                    .in("source_id", serviceIds);
                const servicePaidMap = new Map<string, { in: number; out: number }>();
                serviceCashflows?.forEach((cf: any) => {
                    const current = servicePaidMap.get(cf.source_id || "") || { in: 0, out: 0 };
                    if (cf.direction === "IN") current.in += Number(cf.amount || 0);
                    else current.out += Number(cf.amount || 0);
                    servicePaidMap.set(cf.source_id || "", current);
                });
                for (const s of serviceSettlements) {
                    const netAmount = Number(s.net_amount || 0);
                    const netDirection = netAmount >= 0 ? "PAY" : "RECEIVE";
                    const absNet = Math.abs(netAmount);
                    const payments = servicePaidMap.get(s.id) || { in: 0, out: 0 };
                    const paidAmount = netDirection === "RECEIVE" ? payments.in : payments.out;
                    const remaining = Math.max(0, absNet - paidAmount);
                    expectedServiceOut += remaining;
                }
            }

            const tEnd = isDev ? performance.now() : 0;
            if (isDev) {
                console.info("[Dashboard Timing] forecast", {
                    batch1_ms: Math.round(t0 > 0 ? (tEnd - t0) : 0),
                    total_ms: Math.round(tEnd - t0),
                });
            }

            return { committedIn, likelyIn, pendingCount, partialCount, expectedServiceOut };
        },
    });

    const expectedIn = otaReceivablesData?.total || 0;


    // ========== Công nợ Host (EXACT V1 query — host_supply_segments SOT) ==========
    const { data: hostDebtData, isLoading: hostDebtLoading } = useQuery({
        queryKey: ["dashboard-host-debt"],
        staleTime: DASHBOARD_STALE_TIMES.receivables,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const isDev = import.meta.env.DEV;
            const t0 = isDev ? performance.now() : 0;
            const aggEnabled = isDashboardAggEnabled();

            // ── AGG V1: single RPC with auto-fallback ──
            if (aggEnabled) {
                try {
                    const { data, error } = await supabase.rpc("dashboard_host_debt_summary_v1" as any);
                    if (error) throw error;
                    const validated = validateHostDebtV1(data);
                    if (validated) {
                        if (isDev) console.info("[Dashboard Agg] hostDebt_v1 ok", { ms: Math.round(performance.now() - t0), mode: getDashboardAggMode() });
                        return validated;
                    }
                    if (isDev) console.warn("[Dashboard Agg] hostDebt_v1 fallback reason=invalid_shape", data);
                } catch (err) {
                    if (isDev) console.warn("[Dashboard Agg] hostDebt_v1 fallback reason=error", err);
                }
            }

            // ── Phase 3A fallback ──
            const todayStr = format(new Date(), 'yyyy-MM-dd');

            // 1. Get all host supply segments (source of debt) — with pagination safety
            const segments = await fetchAllRows<any>((from, to) =>
                safeFrom("host_supply_segments" as any)
                    .select("id, unified_booking_id, partner_id, total_amount, settlement_id, date_from")
                    .range(from, to) as any
            );
            if (segments.length === 0) return {
                totalPayable: 0, totalPaid: 0, remaining: 0, unpaidCount: 0, unsettledCount: 0,
                actualPayable: 0, actualUnsettled: 0, actualRemaining: 0, actualCount: 0,
                expectedPayable: 0, expectedRemaining: 0, expectedCount: 0,
                expectedRevenue: 0,
            };

            const bookingIds = [...new Set(segments.map((s: any) => s.unified_booking_id))];

            // 2–4b. Parallelize extra charges, cashflows, stays, and booking revenue lookups
            const [extraChargesRes, cashflowsRes, staysRaw, bookingRevenueRaw] = await Promise.all([
                supabase.from("host_extra_charges")
                    .select("unified_booking_id, partner_id, amount")
                    .in("unified_booking_id", bookingIds),
                supabase.from("cashflow_entries")
                    .select("amount, direction")
                    .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
                    .eq("direction", "OUT"),
                fetchWithBatchedIn(
                    "stays",
                    "unified_booking_id, stay_status, actual_check_in_at",
                    "unified_booking_id",
                    bookingIds
                ),
                // Fetch booking revenue for expected revenue calculation
                fetchWithBatchedIn(
                    "unified_bookings",
                    "unified_booking_id, total_amount_net",
                    "unified_booking_id",
                    bookingIds
                ),
            ]);

            const extraChargeMap = new Map<string, number>();
            extraChargesRes.data?.forEach((ec: any) => {
                const key = `${ec.unified_booking_id}|${ec.partner_id}`;
                extraChargeMap.set(key, (extraChargeMap.get(key) || 0) + Number(ec.amount || 0));
            });

            const totalPaid = cashflowsRes.data?.reduce((sum: number, cf: any) => sum + Number(cf.amount || 0), 0) || 0;

            const checkedInBookings = new Set<string>();
            const noShowBookings = new Set<string>();
            staysRaw?.forEach((s: any) => {
                if (s.actual_check_in_at || ['CHECKED_IN', 'IN_HOUSE', 'CHECKED_OUT'].includes(s.stay_status)) {
                    checkedInBookings.add(s.unified_booking_id);
                }
                if (s.stay_status === 'NO_SHOW') noShowBookings.add(s.unified_booking_id);
            });

            // Build booking revenue map
            const bookingRevenueMap = new Map<string, number>();
            bookingRevenueRaw?.forEach((b: any) => {
                if (b.unified_booking_id) {
                    bookingRevenueMap.set(b.unified_booking_id, Number(b.total_amount_net || 0));
                }
            });

            // 5. Calculate totals
            let totalPayable = 0, unsettledCount = 0;
            let actualPayable = 0, actualUnsettled = 0, actualCount = 0;
            let expectedPayable = 0, expectedCount = 0;
            let expectedRevenue = 0;
            const expectedBookingIdsSeen = new Set<string>();

            for (const seg of segments) {
                const key = `${seg.unified_booking_id}|${seg.partner_id}`;
                const extraAmount = extraChargeMap.get(key) || 0;
                const segmentTotal = Number(seg.total_amount || 0) + extraAmount;
                totalPayable += segmentTotal;
                if (!seg.settlement_id) unsettledCount++;

                const isCheckedIn = checkedInBookings.has(seg.unified_booking_id);
                const isNoShow = noShowBookings.has(seg.unified_booking_id) && !isCheckedIn;
                const supplyStarted = seg.date_from && seg.date_from <= todayStr;
                if (isNoShow) continue;

                if (isCheckedIn && supplyStarted) {
                    actualPayable += segmentTotal;
                    actualCount++;
                    if (!seg.settlement_id) actualUnsettled++;
                } else {
                    expectedPayable += segmentTotal;
                    expectedCount++;
                    // Track unique booking revenue for expected bookings
                    if (!expectedBookingIdsSeen.has(seg.unified_booking_id)) {
                        expectedBookingIdsSeen.add(seg.unified_booking_id);
                        expectedRevenue += bookingRevenueMap.get(seg.unified_booking_id) || 0;
                    }
                }
            }

            const remaining = Math.max(0, totalPayable - totalPaid);
            const unpaidCount = remaining > 0 ? segments.length : 0;
            const paidAppliedToActual = Math.min(totalPaid, actualPayable);
            const actualRemaining = Math.max(0, actualPayable - paidAppliedToActual);
            const expectedRemaining = expectedPayable;

            if (isDev) {
                console.info("[Dashboard Timing] hostDebt", {
                    total_ms: Math.round(performance.now() - t0),
                    segmentRows: segments.length,
                });
            }

            return {
                totalPayable, totalPaid, remaining, unpaidCount, unsettledCount,
                actualPayable, actualUnsettled, actualRemaining, actualCount,
                expectedPayable, expectedRemaining, expectedCount,
                expectedRevenue,
            };
        },
    });

    // Combined loading state — all forecast sections wait for ALL data
    const forecastSectionLoading = forecastLoading || otaArLoading || otaPayoutLoading || hostDebtLoading;

    // ── Phase gate: unlock Phase 2 queries after above-fold loads (mobile only) ──
    useEffect(() => {
        if (isMobile && !criticalReady && !staysLoading && !forecastLoading && !hostDebtLoading) {
            setCriticalReady(true);
        }
    }, [isMobile, criticalReady, staysLoading, forecastLoading, hostDebtLoading]);

    const { data: recentBookings, isLoading: bookingsLoading } = useQuery({
        queryKey: ["dashboard-v2-recent-bookings"],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: !isMobile || criticalReady, // Phase 2: below-fold
        queryFn: async () => {
            const { data: propertyLinks } = await supabase
                .from("channex_property_groups")
                .select("channex_property_id")
                .eq("channex_group_id", AN_GIA_GROUP_ID);
            const groupPropertyIds = new Set(propertyLinks?.map(p => p.channex_property_id) || []);

            const { data, error } = await supabase
                .from("bookings_mirror")
                .select("unified_booking_id, ota_booking_code, guest_name, ota_source, booking_status, channex_status, check_in_date, check_out_date, total_amount_net, payment_type, booking_type, channex_property_id")
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;

            const filteredData = groupPropertyIds.size > 0
                ? (data || []).filter(b => groupPropertyIds.has(b.channex_property_id))
                : (data || []);

            return filteredData.slice(0, 15).map(b => {
                let source = b.ota_source || "Direct";
                if (source === "OTHER" && b.ota_booking_code) {
                    const code = b.ota_booking_code.toUpperCase();
                    if (code.startsWith("BDC-")) source = "BOOKING.COM";
                    else if (code.startsWith("AGO-")) source = "AGODA";
                    else if (code.startsWith("EXP-")) source = "EXPEDIA";
                    else if (code.startsWith("TVL-")) source = "TRAVELOKA";
                    else if (code.startsWith("CTP-")) source = "CTRIP";
                }

                const rawDisplayId = b.ota_booking_code ||
                    (b.unified_booking_id?.startsWith("channex_")
                        ? b.unified_booking_id.replace("channex_", "").substring(0, 8).toUpperCase()
                        : b.unified_booking_id);
                const displayId = rawDisplayId?.replace(/^[A-Za-z]+-/, "") || rawDisplayId;

                return {
                    id: b.unified_booking_id,
                    displayId,
                    guest: b.guest_name || "—",
                    source,
                    status: b.booking_status,
                    checkIn: b.check_in_date,
                    checkOut: b.check_out_date,
                    amount: Number(b.total_amount_net || 0),
                };
            });
        },
    });

    // ========================================================================
    // DERIVED VALUES
    // ========================================================================

    // Revenue trend % — compare current vs previous period
    const revenueTrendPct = useMemo(() => {
        if (!analytics.kpi || !analytics.comparisonKpi) return null;
        const prev = analytics.comparisonKpi.revenueTotal;
        const curr = analytics.kpi.revenueTotal;
        if (!prev || prev === 0) return null;
        return ((curr - prev) / prev) * 100;
    }, [analytics.kpi, analytics.comparisonKpi]);

    const totalArrivals = Math.max(todayCheckIns, 1);
    const healthAlerts = useMemo<HealthAlert[]>(() => [
        {
            label: "chưa phân bổ phòng",
            value: pendingRooms,
            ratio: pendingRooms / totalArrivals,
            action: "/stays",
        },
        {
            label: "OTA payout chờ về",
            value: otaPayoutData?.pendingCount || 0,
            ratio: (otaPayoutData?.pendingCount || 0) / Math.max(otaReceivablesData?.total || 1, 1),
            action: "/ota-payouts",
        },
        {
            label: "disputes đang mở",
            value: openDisputes?.count || 0,
            ratio: (openDisputes?.count || 0) / Math.max(totalArrivals, 1),
            action: "/disputes",
        },
    ], [pendingRooms, totalArrivals, otaPayoutData, otaReceivablesData, openDisputes]);

    // Vietnamese status labels
    const statusLabel = (status: string) => {
        const map: Record<string, string> = {
            CONFIRMED: "Đã xác nhận",
            CHECKED_IN: "Đã nhận phòng",
            CHECKED_OUT: "Đã trả phòng",
            CANCELLED: "Đã hủy",
            NO_SHOW: "Không đến",
            PENDING: "Chờ xử lý",
        };
        return map[status] || status;
    };

    // ========================================================================
    // RENDER
    // ========================================================================
    // MOBILE DETECTION already done above (isMobile)
    // ========================================================================

    // ── Page entrance choreography ──
    const pageRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = pageRef.current;
        if (!el) return;
        // Small RAF delay so initial styles (opacity:0) paint first
        const raf = requestAnimationFrame(() => {
            el.classList.add("dv2-animated");
        });
        return () => cancelAnimationFrame(raf);
    }, []);

    // ── Mobile layout branch ──
    if (isMobile) {
        const mobileProps: DashboardMobileProps = {
            period,
            setPeriod,
            todayCheckIns,
            inHouse,
            todayCheckOuts,
            bookingsCount: bookingsCountData?.total ?? null,
            staysLoading,
            pctChange,
            yesterdayKpis,
            healthAlerts,
            forecastData,
            otaPayoutData,
            expectedIn,
            hostDebtData,
            forecastSectionLoading,
            pl,
            plLoading,
            otaReceivablesData,
            recentBookings,
            bookingsLoading,
            appNavigate,
            propertyRanking: analytics.propertyRanking,
            analyticsLoading: analytics.isLoading,
            paymentTypes: paymentAnalytics.paymentTypes,
            paymentMethods: paymentAnalytics.paymentMethods,
            paymentAnalyticsLoading: paymentAnalytics.isLoading,
            // Full analytics parity
            analyticsKpi: analytics.kpi,
            analyticsComparisonKpi: analytics.comparisonKpi,
            analyticsTimeSeries: analytics.timeSeries,
            analyticsChannelShare: analytics.channelShare,
            analyticsChannelRanking: analytics.channelRanking,
            periodTrendLabel: periodTrendLabel(period),
            revenueTrendPct,
        };

        return (
            <>
                <Header
                    title="Dashboard"
                    actions={
                        <select
                            value={period}
                            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
                            className="appearance-none bg-white/15 text-white text-xs font-medium rounded-lg px-3 py-1.5 pr-7 border border-white/20 cursor-pointer outline-none focus:ring-1 focus:ring-white/40 hover:bg-white/25 transition-colors"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
                        >
                            <option value="7days" className="text-foreground bg-background">7 ngày</option>
                            <option value="30days" className="text-foreground bg-background">30 ngày</option>
                            <option value="month" className="text-foreground bg-background">Tháng này</option>
                        </select>
                    }
                />
                <PageContainer>
                    {/* ─── MOBILE TAB SWITCHER ─── */}
                    <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 mb-3">
                        <button
                            onClick={() => setActiveTab("report")}
                            className={cn(
                                "flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all",
                                activeTab === "report"
                                    ? "bg-card text-foreground shadow-sm"
                                    : "text-muted-foreground"
                            )}
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => setActiveTab("analytics")}
                            className={cn(
                                "flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-all",
                                activeTab === "analytics"
                                    ? "bg-card text-foreground shadow-sm"
                                    : "text-muted-foreground"
                            )}
                        >
                            Xu hướng OTA
                        </button>
                    </div>

                    {/* ─── TAB CONTENT ─── */}
                    {activeTab === "report" ? (
                        <DashboardV2Mobile {...mobileProps} />
                    ) : (
                        <DashboardAnalyticsTab enabled={activeTab === 'analytics'} />
                    )}
                </PageContainer>
            </>
        );
    }
    return (
        <>
            <Header title="Dashboard" />
            <PageContainer>
                <div ref={pageRef} className="dv2-page space-y-4 pb-10">

                    {/* ─── TOP-LEVEL TABS ─── */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="report">Dashboard</TabsTrigger>
                            <TabsTrigger value="analytics">Xu hướng OTA</TabsTrigger>
                        </TabsList>

                        <TabsContent value="report" className="mt-0 space-y-4">

                            {/* ─── SECTION 1: ALERT BANNER + PERIOD TABS ─── */}
                            <DashCard>
                                <div className="flex items-center gap-4">
                                    <HealthBar alerts={healthAlerts} periodLabel="Trong tuần" className="flex-1" />
                                    {/* Period pill tabs */}
                                    <div className="flex items-center gap-1 shrink-0 bg-muted/40 rounded-xl p-1 dv2-tab-group">
                                        {(["7days", "30days", "month"] as PeriodFilter[]).map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setPeriod(p)}
                                                className={cn(
                                                    "dv2-tab px-3.5 py-1.5 text-xs font-medium rounded-lg",
                                                    period === p
                                                        ? "bg-card text-foreground shadow-sm"
                                                        : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                                                )}
                                            >
                                                {p === "7days" ? "7d" : p === "30days" ? "30d" : "Tháng"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </DashCard>

                            {/* ─── SECTION 2: KPI ROW (COMPACT) ─── */}
                            <section>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <KpiCardV2
                                        label="Doanh thu"
                                        value={analytics.isLoading ? "..." : `đ${formatCurrencyShort(analytics.kpi?.revenueTotal ?? 0)}`}
                                        icon={CalendarCheck}
                                        severity={(analytics.kpi?.revenueTotal ?? 0) > 0 ? "green" : "neutral"}
                                        trendPct={analytics.kpi?.revenuePop}
                                        trendLabel={periodTrendLabel(period)}
                                        tooltip="Tổng doanh thu theo P&L SOT trong kỳ"
                                    />
                                    <KpiCardV2
                                        label="Đặt phòng"
                                        value={analytics.isLoading ? "..." : (analytics.kpi?.bookingsCount ?? 0)}
                                        icon={Users}
                                        severity="neutral"
                                        trendPct={analytics.kpi && analytics.comparisonKpi && analytics.comparisonKpi.bookingsCount > 0
                                            ? ((analytics.kpi.bookingsCount - analytics.comparisonKpi.bookingsCount) / analytics.comparisonKpi.bookingsCount) * 100
                                            : null}
                                        trendLabel={periodTrendLabel(period)}
                                        tooltip="Tổng số đặt phòng trong kỳ"
                                    />
                                    <KpiCardV2
                                        label="Đêm phòng"
                                        value={analytics.isLoading ? "..." : (analytics.kpi?.nightsTotal ?? 0)}
                                        icon={Home}
                                        severity={(analytics.kpi?.nightsTotal ?? 0) > 0 ? "green" : "neutral"}
                                        trendPct={analytics.kpi && analytics.comparisonKpi && analytics.comparisonKpi.nightsTotal > 0
                                            ? ((analytics.kpi.nightsTotal - analytics.comparisonKpi.nightsTotal) / analytics.comparisonKpi.nightsTotal) * 100
                                            : null}
                                        trendLabel={periodTrendLabel(period)}
                                        tooltip="Tổng số đêm phòng trong kỳ"
                                    />
                                    <KpiCardV2
                                        label="ADR"
                                        value={analytics.isLoading ? "..." : `đ${formatCurrencyShort(analytics.kpi?.revenueAdr ?? 0)}`}
                                        icon={Clock}
                                        severity="neutral"
                                        trendPct={analytics.kpi && analytics.comparisonKpi && analytics.comparisonKpi.revenueAdr && analytics.comparisonKpi.revenueAdr > 0
                                            ? (((analytics.kpi.revenueAdr ?? 0) - analytics.comparisonKpi.revenueAdr) / analytics.comparisonKpi.revenueAdr) * 100
                                            : null}
                                        trendLabel={periodTrendLabel(period)}
                                        tooltip="Giá phòng trung bình mỗi đêm trong kỳ"
                                    />
                                </div>
                            </section>

                            {/* ─── SECTION 2b: OPERATIONAL KPI ROW ─── */}
                            <section>
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-semibold text-muted-foreground">Vận hành</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <KpiCardV2
                                        label="Đặt phòng mới hôm nay"
                                        value={bookingsCountData?.total ?? "..."}
                                        icon={ClipboardList}
                                        severity={(bookingsCountData?.total ?? 0) > 0 ? "green" : "neutral"}
                                        trendPct={pctChange(bookingsCountData?.total ?? 0, yesterdayBookingsCountData?.total ?? 0)}
                                        trendLabel="vs hôm qua"
                                        onClick={() => appNavigate("/bookings")}
                                        tooltip="Booking mới nhận được hôm nay"
                                    />
                                    <KpiCardV2
                                        label="Nhận phòng hôm nay"
                                        value={staysLoading ? "..." : todayCheckIns}
                                        icon={LogIn}
                                        severity={todayCheckIns > 0 ? "green" : "neutral"}
                                        trendPct={pctChange(todayCheckIns, yesterdayKpis.checkins)}
                                        trendLabel="vs hôm qua"
                                        onClick={() => appNavigate("/stays")}
                                        tooltip="Số lượng khách nhận phòng trong ngày"
                                    />
                                    <KpiCardV2
                                        label="Đang ở"
                                        value={staysLoading ? "..." : inHouse}
                                        icon={BedDouble}
                                        severity="neutral"
                                        trendPct={pctChange(inHouse, yesterdayKpis.inHouse)}
                                        trendLabel="vs hôm qua"
                                        onClick={() => appNavigate("/stays")}
                                        tooltip="Tổng khách đang ở trong các căn hộ"
                                    />
                                    <KpiCardV2
                                        label="Trả phòng hôm nay"
                                        value={staysLoading ? "..." : todayCheckOuts}
                                        icon={LogOut}
                                        severity={todayCheckOuts > 0 ? "green" : "neutral"}
                                        trendPct={pctChange(todayCheckOuts, yesterdayKpis.checkouts)}
                                        trendLabel="vs hôm qua"
                                        onClick={() => appNavigate("/stays")}
                                        tooltip="Số lượng khách trả phòng trong ngày"
                                    />
                                </div>
                            </section>

                            {/* ─── SECTION 3: HERO REVENUE CHART ─── */}
                            <DashCard>
                                <SectionHeaderV2
                                    title="Doanh thu"
                                    badge={
                                        analytics.kpi ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-foreground tabular-nums">
                                                    đ{formatCurrencyShort(analytics.kpi.revenueTotal)}
                                                </span>
                                                {revenueTrendPct !== null && (
                                                    <span className={cn(
                                                        "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full",
                                                        revenueTrendPct > 0 ? "text-emerald-700 bg-emerald-50" : revenueTrendPct < 0 ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted/40"
                                                    )}>
                                                        {revenueTrendPct > 0 ? "▲" : revenueTrendPct < 0 ? "▼" : ""}
                                                        {revenueTrendPct > 0 ? "+" : ""}{revenueTrendPct.toFixed(1)}%
                                                    </span>
                                                )}
                                            </div>
                                        ) : null
                                    }
                                    className="mb-4"
                                />
                                <RevenueTrendChart
                                    data={analytics.timeSeries}
                                    isLoading={analytics.isLoading}
                                />
                            </DashCard>


                            {/* ─── SECTION 4: BOOKING SOURCES (P&L SOT) ─── */}
                            <DashCard>
                                <SectionHeaderV2
                                    icon={TrendingUp}
                                    title="Nguồn đặt phòng"
                                    badge={
                                        analytics.kpi ? (
                                            <span className="text-xs text-muted-foreground">
                                                {analytics.kpi.bookingsCount} đặt phòng
                                            </span>
                                        ) : null
                                    }
                                />
                                {analytics.isLoading ? (
                                    <div className="h-[280px] flex items-center justify-center">
                                        <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <ChannelDonutChart
                                            data={analytics.channelShare}
                                            totalRevenue={analytics.kpi?.revenueTotal}
                                        />
                                        {analytics.channelRanking.length > 0 && (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="border-b border-border text-left text-muted-foreground">
                                                            <th className="pb-2 font-medium">Kênh</th>
                                                            <th className="pb-2 font-medium text-right">Doanh thu</th>
                                                            <th className="pb-2 font-medium text-right hidden sm:table-cell">Đặt phòng</th>
                                                            <th className="pb-2 font-medium text-right hidden sm:table-cell">Đêm phòng</th>
                                                            <th className="pb-2 font-medium text-right hidden md:table-cell">ADR</th>
                                                            <th className="pb-2 font-medium text-right">Tỷ lệ</th>
                                                            <th className="pb-2 font-medium text-right">Trend</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {analytics.channelRanking.map((ch) => {
                                                            const comp = analytics.comparisonChannelRanking.find(c => c.pivotId === ch.pivotId);
                                                            const trendPct = comp && comp.revenueTotal > 0
                                                                ? ((ch.revenueTotal - comp.revenueTotal) / comp.revenueTotal) * 100
                                                                : (ch.revenueTotal > 0 && (!comp || comp.revenueTotal === 0) ? 100 : null);
                                                            return (
                                                                <tr key={ch.pivotId} className="border-b border-border/50 last:border-0">
                                                                    <td className="py-2 font-medium">{ch.pivotName}</td>
                                                                    <td className="py-2 text-right tabular-nums">đ{formatCurrencyShort(ch.revenueTotal)}</td>
                                                                    <td className="py-2 text-right tabular-nums hidden sm:table-cell">{ch.bookingsCount}</td>
                                                                    <td className="py-2 text-right tabular-nums hidden sm:table-cell">{ch.nightsTotal}</td>
                                                                    <td className="py-2 text-right tabular-nums hidden md:table-cell">đ{formatCurrencyShort(ch.revenueAdr ?? 0)}</td>
                                                                    <td className="py-2 text-right tabular-nums">{ch.sharePct.toFixed(1)}%</td>
                                                                    <td className="py-2 text-right">
                                                                        {trendPct != null && (
                                                                            <span className={cn(
                                                                                "inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full",
                                                                                trendPct > 0 ? "text-emerald-700 bg-emerald-50" : trendPct < 0 ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted/40"
                                                                            )}>
                                                                                {trendPct > 0 ? "▲" : trendPct < 0 ? "▼" : ""}
                                                                                {trendPct > 0 ? "+" : ""}{trendPct.toFixed(1)}%
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </DashCard>


                            {/* ─── SECTION 5: PAYMENT ANALYTICS (P&L SOT) ─── */}
                            <DashCard>
                                <SectionHeaderV2
                                    icon={Wallet}
                                    title="Phân tích thu & thanh toán"
                                />
                                <PaymentAnalyticsCharts
                                    paymentTypes={paymentAnalytics.paymentTypes}
                                    paymentMethods={paymentAnalytics.paymentMethods}
                                    isLoading={paymentAnalytics.isLoading}
                                />
                            </DashCard>

                            {/* ─── SECTION 5b: HOST RANKING (P&L SOT) ─── */}
                            <DashCard>
                                <HostRankingChart
                                    hostRanking={hostRanking.hostRanking}
                                    isLoading={hostRanking.isLoading}
                                />
                            </DashCard>

                            {/* ─── SECTION 5c: AREA RANKING (P&L SOT) ─── */}
                            <DashCard>
                                <AreaRankingChart
                                    provinceRanking={areaRanking.provinceRanking}
                                    districtRanking={areaRanking.districtRanking}
                                    wardRanking={areaRanking.wardRanking}
                                    isLoading={areaRanking.isLoading}
                                />
                            </DashCard>

                            {/* ─── SECTION: GUEST ORIGIN ─── */}
                            <DashCard>
                                <GuestOriginSection
                                    data={guestOrigin.rows}
                                    totalBookings={guestOrigin.totalBookings}
                                    isLoading={guestOrigin.isLoading}
                                />
                            </DashCard>

                            {/* ════════════════════════════════════════════════
                         FINANCIAL ANALYTICS CHARTS
                       ════════════════════════════════════════════════ */}

                            {/* ─── ROW 1: DỰ BÁO DOANH THU (full width hero) ─── */}
                            <DashCard>
                                <SectionHeaderV2
                                    title="Dự báo thu"
                                    className="mb-4"
                                    badge={
                                        <span
                                            className="text-[10px] text-slate-400 cursor-help border-b border-dashed border-slate-300"
                                            title="Pipeline doanh thu sẽ về. (1) Đã cam kết — payout PARTIAL, đã nhận một phần. (2) Khả năng cao — payout PENDING, chờ OTA chuyển khoản (= Đang chuyển về trên trang OTA Payout). (3) OTA AR — booking đã checkout chưa tạo payout (= Chờ tạo payout). (4) Booking mới — doanh thu từ booking chưa nhận phòng."
                                        >
                                            Pipeline trạng thái thu
                                        </span>
                                    }
                                />
                                <ForecastRevenueChart
                                    committed={forecastData?.committedIn || 0}
                                    likely={forecastData?.likelyIn || 0}
                                    expected={expectedIn}
                                    hostDebtRevenue={hostDebtData?.expectedRevenue || 0}
                                    isLoading={forecastSectionLoading}
                                />
                            </DashCard>

                            {/* ─── ROW 1b: DỰ BÁO CHI PHÍ (full width) ─── */}
                            <DashCard>
                                <SectionHeaderV2 title="Dự báo chi phí" className="mb-4" />
                                {(() => {
                                    const confirmedExpense = hostDebtData?.actualRemaining || 0;
                                    const upcomingExpense = hostDebtData?.expectedRemaining || 0;
                                    const serviceExpense = forecastData?.expectedServiceOut || 0;
                                    return (
                                        <ForecastExpensesChart
                                            confirmed={confirmedExpense}
                                            upcoming={upcomingExpense}
                                            service={serviceExpense}
                                            isLoading={forecastSectionLoading}
                                        />
                                    );
                                })()}
                            </DashCard>

                            {/* ─── ROW 1c: PROJECTED NET (full width) ─── */}
                            {(() => {
                                const totalRevenueForecast = (forecastData?.committedIn || 0) + (forecastData?.likelyIn || 0) + expectedIn;
                                const totalExpenseForecast = (hostDebtData?.actualRemaining || 0) + (hostDebtData?.expectedRemaining || 0) + (forecastData?.expectedServiceOut || 0);
                                return (
                                    <ProjectedNetCard
                                        revenueTotal={totalRevenueForecast}
                                        expenseTotal={totalExpenseForecast}
                                    />
                                );
                            })()}

                            {/* ─── ROW 2: CHI PHÍ | DÒNG TIỀN (2 cols) ─── */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Expense Breakdown Donut */}
                                <DashCard>
                                    <SectionHeaderV2 title="Cơ cấu chi phí" className="mb-4" />
                                    {(() => {
                                        const hostIncurred = hostDebtData?.actualRemaining || 0;
                                        const hostProjected = hostDebtData?.expectedRemaining || 0;
                                        const serviceOut = forecastData?.expectedServiceOut || 0;
                                        const totalPotentialIn = (forecastData?.committedIn || 0) + (forecastData?.likelyIn || 0) + expectedIn;
                                        const expectedOut = hostIncurred + hostProjected + serviceOut;
                                        const netExp = totalPotentialIn - expectedOut;
                                        return (
                                            <ExpenseBreakdownChart
                                                hostIncurred={hostIncurred}
                                                hostProjected={hostProjected}
                                                serviceOut={serviceOut}
                                                netExpected={netExp}
                                            />
                                        );
                                    })()}
                                </DashCard>

                                {/* Cashflow Bars */}
                                <DashCard>
                                    <SectionHeaderV2 title="Dòng tiền" className="mb-4" />
                                    <CashflowChart
                                        cashIn={pl.cash.cash_in}
                                        cashOut={pl.cash.cash_out}
                                        netCash={pl.cash.net_cash}
                                        isLoading={plLoading}
                                    />
                                </DashCard>
                            </div>

                            {/* ─── ROW 3: LỢI NHUẬN vs DÒNG TIỀN (full width) ─── */}
                            <DashCard>
                                <SectionHeaderV2 title="Lợi nhuận vs Dòng tiền" className="mb-4" />
                                <ProfitCashComparisonChart
                                    profit={pl.accrual.net_profit}
                                    cashflow={pl.cash.net_cash}
                                    gap={pl.difference.profit_minus_cash}
                                    isLoading={plLoading}
                                />
                            </DashCard>

                            {/* ─── ROW 4: CÔNG NỢ OTA | CÔNG NỢ HOST (2 cols) ─── */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* OTA Receivables Aging */}
                                <DashCard>
                                    <SectionHeaderV2 title="Công nợ OTA" className="mb-4" />
                                    <OtaReceivableAgingChart
                                        arTotal={otaReceivablesData?.total || 0}
                                        arCount={otaReceivablesData?.count || 0}
                                        pendingTotal={otaPayoutData?.pending || 0}
                                        pendingCount={otaPayoutData?.pendingCount || 0}
                                        overdueCount={otaPayoutData?.overdueCount}
                                        aging={otaReceivablesData?.aging}
                                    />
                                </DashCard>

                                {/* Host Settlement Progress */}
                                <DashCard>
                                    <SectionHeaderV2 title="Công nợ Host" className="mb-4" />
                                    <HostSettlementProgressChart
                                        paid={hostDebtData?.totalPaid || 0}
                                        outstanding={hostDebtData?.actualRemaining || 0}
                                        upcoming={hostDebtData?.expectedRemaining || 0}
                                        totalPayable={hostDebtData?.totalPayable || 0}
                                        actualUnsettled={hostDebtData?.actualUnsettled}
                                        actualCount={hostDebtData?.actualCount}
                                        expectedCount={hostDebtData?.expectedCount}
                                    />
                                </DashCard>
                            </div>


                            {/* ─── SECTION 9+10: PROPERTY + RECENT BOOKINGS ─── */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Property Performance */}
                                <DashCard noPadding>
                                    <div className="px-5 pt-5 md:px-6 md:pt-6">
                                        <SectionHeaderV2 title="Hiệu suất chỗ nghỉ" />
                                    </div>
                                    <div className="mt-3">
                                        <PropertyPerformanceTable
                                            data={analytics.propertyRanking}
                                            comparisonData={analytics.comparisonPropertyRanking}
                                            isLoading={analytics.isLoading}
                                        />
                                    </div>
                                </DashCard>

                                {/* Recent Bookings */}
                                <DashCard noPadding>
                                    <div className="px-5 pt-5 md:px-6 md:pt-6 flex items-center justify-between">
                                        <SectionHeaderV2 title="Đặt phòng gần đây" />
                                        <Link
                                            to="/bookings"
                                            className="text-xs text-primary hover:underline font-medium"
                                        >
                                            Xem tất cả
                                        </Link>
                                    </div>
                                    <div className="mt-3 overflow-x-auto pb-4">
                                        <table className="w-full text-sm min-w-[700px]">
                                            <thead>
                                                <tr className="text-xs text-muted-foreground">
                                                    <th className="text-left font-medium pb-2.5 px-5">Mã</th>
                                                    <th className="text-left font-medium pb-2.5 px-3">Khách</th>
                                                    <th className="text-left font-medium pb-2.5 px-3 hidden md:table-cell">Kênh</th>
                                                    <th className="text-left font-medium pb-2.5 px-3 hidden sm:table-cell">Ngày</th>
                                                    <th className="text-right font-medium pb-2.5 px-3">Giá trị</th>
                                                    <th className="text-center font-medium pb-2.5 px-5 hidden sm:table-cell">Trạng thái</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bookingsLoading ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                                                            Đang tải...
                                                        </td>
                                                    </tr>
                                                ) : !recentBookings?.length ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                                                            Chưa có booking
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    recentBookings.map((b) => (
                                                        <tr
                                                            key={b.id}
                                                            className="dv2-table-row border-t border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
                                                            onClick={() => appNavigate(`/bookings/${b.id}`)}
                                                        >
                                                            <td className="py-2.5 px-5">
                                                                <span className="text-xs font-mono text-primary">
                                                                    {b.displayId}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-xs truncate max-w-[120px]">
                                                                {b.guest}
                                                            </td>
                                                            <td className="py-2.5 px-3 hidden md:table-cell">
                                                                <OtaBadge source={b.source} size="sm" />
                                                            </td>
                                                            <td className="py-2.5 px-3 hidden sm:table-cell">
                                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                                    {b.checkIn} → {b.checkOut}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right">
                                                                <span className="text-xs font-medium tabular-nums">
                                                                    {formatCurrencyShort(b.amount)}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 px-5 text-center hidden sm:table-cell">
                                                                <StatusBadge
                                                                    variant={getBookingStatusVariant(b.status) as any}
                                                                >
                                                                    {statusLabel(b.status)}
                                                                </StatusBadge>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </DashCard>
                            </div>

                        </TabsContent>

                        <TabsContent value="analytics" className="mt-0">
                            <DashboardAnalyticsTab enabled={activeTab === 'analytics'} />
                        </TabsContent>
                    </Tabs>

                </div>
            </PageContainer>
        </>
    );
}
