/**
 * DashboardV2Mobile — Mobile-first layout for Dashboard V2.
 * 
 * Single-column storytelling order, compact KPIs, responsive chart heights,
 * tap-friendly tooltips, card-based bookings (no tables).
 * 
 * Data layer is 100% preserved — all data comes via props from DashboardV2.
 */
import { useMemo, useRef, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth } from "date-fns";
import { CalendarCheck, Users, Home, Clock, Activity, ClipboardList, LogIn, LogOut, BedDouble } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { OtaBadge } from "@/components/ui/ota-badge";
import { getBookingStatusVariant } from "@/constants/status-config";
import {
    KpiCardV2,
    SectionHeaderV2,
    HealthBar,
    RevenueTrendChart,
    ChannelDonutChart,
    ForecastRevenueChart,
    ExpenseBreakdownChart,
    CashflowChart,
    ProfitCashComparisonChart,
    OtaReceivableAgingChart,
    HostSettlementProgressChart,
    ForecastExpensesChart,
    ProjectedNetCard,
    PropertyPerformanceTable,
    GuestOriginSection,
    FinancialWaterfallChart,
} from "@/components/dashboard-v2";
import { PaymentAnalyticsCharts } from "@/components/dashboard-v2/charts/PaymentAnalyticsCharts";
import type { PaymentTypeRow, PaymentMethodRow } from "@/hooks/usePaymentAnalytics";
import { KpiGroupCard } from "@/components/dashboard-v2/ui/KpiGroupCard";
import type { HealthAlert } from "@/components/dashboard-v2";
import { InfoTooltip } from "@/components/dashboard-v2/ui/InfoTooltip";
import { useGuestOriginAnalytics } from "@/hooks/useGuestOriginAnalytics";
import { DeferredSection } from "./DeferredSection";

// ─── HELPERS ───
const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
};

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

const formatTrend = (val: number | null) => {
    if (val === null) return "0%";
    const rounded = Math.round(val);
    return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
};

const getTrendColor = (val: number | null) => {
    if (val === null || val === 0) return "text-muted-foreground";
    return val > 0 ? "text-emerald-500" : "text-rose-500";
};

// ─── TYPES ───
type PeriodFilter = "7days" | "30days" | "month";

interface BookingItem {
    id: string;
    displayId: string;
    guest: string;
    source: string;
    status: string;
    checkIn: string;
    checkOut: string;
    amount: number;
}

export interface DashboardMobileProps {
    period: PeriodFilter;
    setPeriod: (p: PeriodFilter) => void;
    // KPI
    todayCheckIns: number;
    inHouse: number;
    todayCheckOuts: number;
    bookingsCount: number | null;
    staysLoading: boolean;
    pctChange: (curr: number, prev: number) => number | null;
    yesterdayKpis: { checkins: number; inHouse: number; checkouts: number };
    // Health
    healthAlerts: HealthAlert[];
    // Forecast
    forecastData: { committedIn: number; likelyIn: number; expectedServiceOut: number } | undefined;
    otaPayoutData: { pending: number; pendingCount: number; overdueCount?: number } | undefined;
    expectedIn: number;
    hostDebtData: {
        totalPayable: number; totalPaid: number;
        actualRemaining: number; expectedRemaining: number;
        actualUnsettled?: number; actualCount?: number; expectedCount?: number;
        expectedRevenue?: number;
    } | undefined;
    forecastSectionLoading: boolean;
    // P&L
    pl: {
        cash: { cash_in: number; cash_out: number; net_cash: number };
        accrual: { net_profit: number; revenue?: number; cogs_host?: number };
        difference: { profit_minus_cash: number };
    };
    plLoading: boolean;
    // Receivables
    otaReceivablesData: {
        total: number; count: number;
        aging?: {
            bucket0_7?: { amount: number; count: number };
            bucket8_14?: { amount: number; count: number };
            bucket15_30?: { amount: number; count: number };
            bucket30Plus?: { amount: number; count: number };
        };
    } | undefined;
    // Bookings
    recentBookings: BookingItem[] | undefined;
    bookingsLoading: boolean;
    // Navigation
    appNavigate: (path: string) => void;
    // Property performance
    propertyRanking: any[];
    analyticsLoading: boolean;
    // Payment analytics
    paymentTypes?: PaymentTypeRow[];
    paymentMethods?: PaymentMethodRow[];
    paymentAnalyticsLoading?: boolean;
    // Analytics (Revenue trend, KPIs, Channel share) — full parity with desktop
    analyticsKpi?: { revenueTotal: number; bookingsCount: number; nightsTotal: number; revenueAdr?: number; revenuePop?: number | null } | null;
    analyticsComparisonKpi?: { revenueTotal: number; bookingsCount: number; nightsTotal: number; revenueAdr?: number } | null;
    analyticsTimeSeries?: any[];
    analyticsChannelShare?: any[];
    analyticsChannelRanking?: any[];
    periodTrendLabel?: string;
    revenueTrendPct?: number | null;
}

// ── FULL BLEED WRAPPER (Mobile only) ──
const FullBleed: React.FC<React.PropsWithChildren> = ({ children }) => (
    <div className="-mx-3 sm:mx-0">{children}</div>
);

// ── MOBILE CARD WRAPPER (matches desktop DashCard exactly) ──
function MobileCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn(
            "rounded-none sm:rounded-2xl bg-card border-y border-l-0 border-r-0 sm:border border-border/30 dv2-card",
            "shadow-[0_2px_6px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.05)]",
            "relative overflow-visible hover:z-20",
            "p-3 sm:p-4",
            className
        )}>
            {children}
        </div>
    );
}

// ─── SECTION HEADER WITH INFO TOOLTIP ───
function MobileSectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-1.5 mb-3">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {children}
        </div>
    );
}

// ─── MAIN MOBILE COMPONENT ───
export function DashboardV2Mobile(props: DashboardMobileProps) {
    const {
        period, setPeriod,
        todayCheckIns, inHouse, todayCheckOuts, bookingsCount,
        staysLoading, pctChange, yesterdayKpis,
        healthAlerts,
        forecastData, otaPayoutData, expectedIn, hostDebtData,
        forecastSectionLoading,
        pl, plLoading,
        otaReceivablesData,
        recentBookings, bookingsLoading,
        appNavigate,
        propertyRanking, analyticsLoading,
        paymentTypes, paymentMethods, paymentAnalyticsLoading,
        analyticsKpi, analyticsComparisonKpi, analyticsTimeSeries,
        analyticsChannelShare, analyticsChannelRanking,
        periodTrendLabel: trendLabel, revenueTrendPct,
    } = props;

    // ── PERF INSTRUMENTATION (dev only) ──
    const renderCount = useRef(0);
    const mountTime = useRef(performance.now());
    renderCount.current++;

    useEffect(() => {
        if (import.meta.env.DEV) {
            console.log(`[DashboardMobile] Mount at ${performance.now().toFixed(0)}ms`);
        }
        return () => {
            if (import.meta.env.DEV) {
                console.log(`[DashboardMobile] Unmount after ${renderCount.current} renders, lived ${(performance.now() - mountTime.current).toFixed(0)}ms`);
            }
        };
    }, []);

    // Derived values for forecast sections
    const forecastDerived = useMemo(() => {
        const committedIn = forecastData?.committedIn || 0;
        const likelIn = forecastData?.likelyIn || 0;
        const confirmedExpense = hostDebtData?.actualRemaining || 0;
        const upcomingExpense = hostDebtData?.expectedRemaining || 0;
        const serviceExpense = forecastData?.expectedServiceOut || 0;
        const totalRevenueForecast = committedIn + likelIn + expectedIn;
        const totalExpenseForecast = confirmedExpense + upcomingExpense + serviceExpense;
        const hostIncurred = hostDebtData?.actualRemaining || 0;
        const hostProjected = hostDebtData?.expectedRemaining || 0;
        const serviceOut = forecastData?.expectedServiceOut || 0;
        const totalPotentialIn = committedIn + likelIn + expectedIn;
        const expectedOut = hostIncurred + hostProjected + serviceOut;
        const netExp = totalPotentialIn - expectedOut;
        return {
            committedIn, likelIn, confirmedExpense, upcomingExpense, serviceExpense,
            totalRevenueForecast, totalExpenseForecast,
            hostIncurred, hostProjected, serviceOut, netExp,
        };
    }, [forecastData, expectedIn, hostDebtData]);

    // Guest Origin analytics — respects period filter
    const mobileDateRange = useMemo(() => {
        const now = new Date();
        switch (period) {
            case "7days":
                return { from: subDays(now, 6), to: now };
            case "30days":
                return { from: subDays(now, 29), to: now };
            case "month":
                return { from: startOfMonth(now), to: now };
        }
    }, [period]);
    const guestOrigin = useGuestOriginAnalytics({
        dateStart: format(mobileDateRange.from, "yyyy-MM-dd"),
        dateEnd: format(mobileDateRange.to, "yyyy-MM-dd"),
    });

    // ── UNIFIED LOADING GATE ──
    const isPageReady = !staysLoading && !bookingsLoading && !forecastSectionLoading && !plLoading;

    useEffect(() => {
        if (import.meta.env.DEV && isPageReady) {
            const elapsed = performance.now() - mountTime.current;
            console.log(`[DashboardMobile] Ready in ${elapsed.toFixed(0)}ms, renders: ${renderCount.current}`);
        }
    }, [isPageReady]);

    if (!isPageReady) {
        return (
            <div className="w-full pb-6">
                <div className="space-y-3 sm:space-y-4 pt-2">
                    {/* Skeleton for HealthBar — full bleed */}
                    <FullBleed>
                        <div className="h-14 animate-pulse rounded-none sm:rounded-2xl bg-muted/30" />
                    </FullBleed>
                    {/* Skeleton for 2×2 KPIs — full bleed */}
                    <FullBleed>
                        <div className="grid grid-cols-2 rounded-none sm:rounded-2xl overflow-hidden border-y sm:border border-border/30 bg-card shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className={cn(
                                    "p-3 sm:p-4 animate-pulse",
                                    i % 2 === 0 && "border-r border-border/50",
                                    i < 2 && "border-b border-border/50",
                                )} style={{ animationDelay: `${i * 60}ms` }}>
                                    <div className="h-3 w-16 bg-muted/40 rounded mb-2" />
                                    <div className="h-7 w-10 bg-muted/30 rounded mb-1.5" />
                                    <div className="h-3 w-20 bg-muted/20 rounded" />
                                </div>
                            ))}
                        </div>
                    </FullBleed>
                    {/* Skeleton for chart cards — full bleed */}
                    {[...Array(4)].map((_, i) => (
                        <FullBleed key={i}>
                            <div
                                className="h-40 animate-pulse rounded-none sm:rounded-2xl bg-card border-y sm:border border-border/30 shadow-[0_2px_6px_rgba(0,0,0,0.08)] p-3"
                                style={{ animationDelay: `${(i + 4) * 60}ms` }}
                            >
                                <div className="h-3.5 w-24 bg-muted/40 rounded mb-3" />
                                <div className="h-20 w-full bg-muted/20 rounded-lg" />
                            </div>
                        </FullBleed>
                    ))}
                </div>
            </div>
        );
    }

    const {
        committedIn, likelIn, confirmedExpense, upcomingExpense, serviceExpense,
        totalRevenueForecast, totalExpenseForecast,
        hostIncurred, hostProjected, serviceOut, netExp,
    } = forecastDerived;

    return (
        <div className="w-full pb-6">
            <div className="space-y-3 sm:space-y-4">
                {/* ─── 1. HEALTH BAR (ACTION REQUIRED) ─── */}
                <FullBleed>
                    <HealthBar alerts={healthAlerts} periodLabel="Trong tuần" />
                </FullBleed>

                {/* ─── 2. FINANCIAL KPIs (Doanh thu / Đặt phòng / Đêm phòng / ADR) — Same as Desktop S2 ─── */}
                <section>
                    <div className="grid grid-cols-2 gap-3">
                        <KpiCardV2
                            label="Doanh thu"
                            value={analyticsLoading ? "..." : `đ${fmtShort(analyticsKpi?.revenueTotal ?? 0)}`}
                            icon={CalendarCheck}
                            severity={(analyticsKpi?.revenueTotal ?? 0) > 0 ? "green" : "neutral"}
                            trendPct={analyticsKpi?.revenuePop}
                            trendLabel={trendLabel || "so với kỳ trước"}
                            tooltip="Tổng doanh thu theo P&L SOT trong kỳ"
                        />
                        <KpiCardV2
                            label="Đặt phòng"
                            value={analyticsLoading ? "..." : (analyticsKpi?.bookingsCount ?? 0)}
                            icon={Users}
                            severity="neutral"
                            trendPct={analyticsKpi && analyticsComparisonKpi && analyticsComparisonKpi.bookingsCount > 0
                                ? ((analyticsKpi.bookingsCount - analyticsComparisonKpi.bookingsCount) / analyticsComparisonKpi.bookingsCount) * 100
                                : null}
                            trendLabel={trendLabel || "so với kỳ trước"}
                            tooltip="Tổng số đặt phòng trong kỳ"
                        />
                        <KpiCardV2
                            label="Đêm phòng"
                            value={analyticsLoading ? "..." : (analyticsKpi?.nightsTotal ?? 0)}
                            icon={Home}
                            severity={(analyticsKpi?.nightsTotal ?? 0) > 0 ? "green" : "neutral"}
                            trendPct={analyticsKpi && analyticsComparisonKpi && analyticsComparisonKpi.nightsTotal > 0
                                ? ((analyticsKpi.nightsTotal - analyticsComparisonKpi.nightsTotal) / analyticsComparisonKpi.nightsTotal) * 100
                                : null}
                            trendLabel={trendLabel || "so với kỳ trước"}
                            tooltip="Tổng số đêm phòng trong kỳ"
                        />
                        <KpiCardV2
                            label="ADR"
                            value={analyticsLoading ? "..." : `đ${fmtShort(analyticsKpi?.revenueAdr ?? 0)}`}
                            icon={Clock}
                            severity="neutral"
                            trendPct={analyticsKpi && analyticsComparisonKpi && (analyticsComparisonKpi.revenueAdr ?? 0) > 0
                                ? (((analyticsKpi.revenueAdr ?? 0) - (analyticsComparisonKpi.revenueAdr ?? 0)) / (analyticsComparisonKpi.revenueAdr ?? 1)) * 100
                                : null}
                            trendLabel={trendLabel || "so với kỳ trước"}
                            tooltip="Giá phòng trung bình mỗi đêm trong kỳ"
                        />
                    </div>
                </section>

                {/* ─── 2b. OPS KPIs (Đặt phòng mới / Nhận phòng / Đang ở / Trả phòng) — Same as Desktop S2b ─── */}
                <section>
                    <div className="flex items-center gap-2 mb-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-muted-foreground">Vận hành</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <KpiCardV2
                            label="Đặt phòng mới hôm nay"
                            value={bookingsCount ?? "..."}
                            icon={ClipboardList}
                            severity={(bookingsCount ?? 0) > 0 ? "green" : "neutral"}
                            tooltip="Booking mới nhận được hôm nay"
                        />
                        <KpiCardV2
                            label="Nhận phòng hôm nay"
                            value={staysLoading ? "..." : todayCheckIns}
                            icon={LogIn}
                            severity={todayCheckIns > 0 ? "green" : "neutral"}
                            trendPct={pctChange(todayCheckIns, yesterdayKpis.checkins)}
                            trendLabel="vs hôm qua"
                            tooltip="Số lượng khách nhận phòng trong ngày"
                        />
                        <KpiCardV2
                            label="Đang ở"
                            value={staysLoading ? "..." : inHouse}
                            icon={BedDouble}
                            severity="neutral"
                            trendPct={pctChange(inHouse, yesterdayKpis.inHouse)}
                            trendLabel="vs hôm qua"
                            tooltip="Tổng khách đang ở trong các căn hộ"
                        />
                        <KpiCardV2
                            label="Trả phòng hôm nay"
                            value={staysLoading ? "..." : todayCheckOuts}
                            icon={LogOut}
                            severity={todayCheckOuts > 0 ? "green" : "neutral"}
                            trendPct={pctChange(todayCheckOuts, yesterdayKpis.checkouts)}
                            trendLabel="vs hôm qua"
                            tooltip="Số lượng khách trả phòng trong ngày"
                        />
                    </div>
                </section>

                {/* ─── 2.6. REVENUE TREND CHART ─── */}
                <DeferredSection rootMargin="300px" placeholderHeight={220}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Doanh thu">
                                {analyticsKpi && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-foreground tabular-nums">
                                            đ{fmtShort(analyticsKpi.revenueTotal)}
                                        </span>
                                        {revenueTrendPct != null && (
                                            <span className={cn(
                                                "text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full",
                                                revenueTrendPct > 0 ? "text-emerald-700 bg-emerald-50" : revenueTrendPct < 0 ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted/40"
                                            )}>
                                                {revenueTrendPct > 0 ? "▲+" : revenueTrendPct < 0 ? "▼" : ""}{revenueTrendPct.toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                )}
                            </MobileSectionHeader>
                            <RevenueTrendChart
                                data={analyticsTimeSeries || []}
                                isLoading={analyticsLoading}
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── 2.7. NGUỒN ĐẶT PHÒNG (Channel Donut + Ranking) ─── */}
                <DeferredSection rootMargin="200px" placeholderHeight={280}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Nguồn đặt phòng">
                                {analyticsKpi && (
                                    <span className="text-[10px] text-muted-foreground">
                                        {analyticsKpi.bookingsCount} đặt phòng
                                    </span>
                                )}
                            </MobileSectionHeader>
                            {analyticsLoading ? (
                                <div className="h-[200px] flex items-center justify-center">
                                    <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <ChannelDonutChart
                                        data={analyticsChannelShare || []}
                                        totalRevenue={analyticsKpi?.revenueTotal}
                                    />
                                    {(analyticsChannelRanking?.length ?? 0) > 0 && (
                                        <div className="overflow-x-auto -mx-1">
                                            <table className="w-full text-[11px]">
                                                <thead>
                                                    <tr className="border-b border-border text-left text-muted-foreground">
                                                        <th className="pb-1.5 font-medium">Kênh</th>
                                                        <th className="pb-1.5 font-medium text-right">Doanh thu</th>
                                                        <th className="pb-1.5 font-medium text-right">Tỷ lệ</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(analyticsChannelRanking || []).map((ch: any) => (
                                                        <tr key={ch.pivotId} className="border-b border-border/50 last:border-0">
                                                            <td className="py-1.5 font-medium">{ch.pivotName}</td>
                                                            <td className="py-1.5 text-right tabular-nums">đ{fmtShort(ch.revenueTotal)}</td>
                                                            <td className="py-1.5 text-right tabular-nums">{ch.sharePct.toFixed(1)}%</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── S5. PHÂN TÍCH THU & THANH TOÁN — Desktop S5 ─── */}
                <DeferredSection rootMargin="300px" placeholderHeight={280}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Phân tích thu & thanh toán">
                                <InfoTooltip title="Phân tích thu & thanh toán">
                                    <div className="space-y-1.5">
                                        <p><span className="font-semibold text-sky-400">Hình thức thu:</span> tỷ lệ Khách sạn thu vs OTA thu</p>
                                        <p><span className="font-semibold text-emerald-400">Phương thức:</span> tiền mặt, chuyển khoản, cà thẻ, OnePay, 9Pay...</p>
                                    </div>
                                </InfoTooltip>
                            </MobileSectionHeader>
                            <PaymentAnalyticsCharts
                                paymentTypes={paymentTypes || []}
                                paymentMethods={paymentMethods || []}
                                isLoading={paymentAnalyticsLoading}
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── S7. GUEST ORIGIN — Desktop S7 ─── */}
                <DeferredSection rootMargin="200px" placeholderHeight={300}>
                    <FullBleed>
                        <MobileCard>
                            <GuestOriginSection
                                data={guestOrigin.rows}
                                totalBookings={guestOrigin.totalBookings}
                                isLoading={guestOrigin.isLoading}
                                isMobile
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── S8. REVENUE WATERFALL (Doanh thu P&L) ─── */}
                {(pl.accrual.revenue ?? 0) > 0 && (
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Doanh thu (P&L)" />
                            <FinancialWaterfallChart
                                revenue={pl.accrual.revenue ?? 0}
                                hostCost={pl.accrual.cogs_host ?? 0}
                                isLoading={plLoading}
                            />
                        </MobileCard>
                    </FullBleed>
                )}

                {/* ─── S9. DỰ BÁO THU ─── */}
                <FullBleed>
                    <MobileCard>
                        <MobileSectionHeader title="Dự báo thu">
                            <InfoTooltip title="Pipeline doanh thu">
                                <div className="space-y-1.5">
                                    <p><span className="font-semibold text-emerald-400">Đã cam kết:</span> payout PARTIAL — đã nhận một phần</p>
                                    <p><span className="font-semibold text-sky-400">Khả năng cao:</span> payout PENDING — chờ OTA chuyển (= Đang chuyển về)</p>
                                    <p><span className="font-semibold text-amber-400">OTA AR:</span> booking đã checkout, chưa tạo payout (= Chờ tạo payout)</p>
                                </div>
                            </InfoTooltip>
                        </MobileSectionHeader>
                        <ForecastRevenueChart
                            committed={committedIn}
                            likely={likelIn}
                            expected={expectedIn}
                            hostDebtRevenue={hostDebtData?.expectedRevenue || 0}
                            isLoading={forecastSectionLoading}
                            chartHeight={40}
                        />
                    </MobileCard>
                </FullBleed>

                {/* ─── S9b. DỰ BÁO CHI PHÍ ─── */}
                <FullBleed>
                    <MobileCard>
                        <MobileSectionHeader title="Dự báo chi phí">
                            <InfoTooltip title="Dự báo chi phí">
                                <div className="space-y-1.5">
                                    <p><span className="font-semibold text-rose-400">Đã phát sinh:</span> chi phí host đã phát sinh từ booking đã checkout/hoàn tất</p>
                                    <p><span className="font-semibold text-amber-400">Dự kiến:</span> chi phí host dự kiến từ booking sắp tới</p>
                                    <p><span className="font-semibold text-purple-400">Chi phí dịch vụ:</span> các chi phí vận hành (cleaning/pickup/maintenance)</p>
                                </div>
                            </InfoTooltip>
                        </MobileSectionHeader>
                        <ForecastExpensesChart
                            confirmed={confirmedExpense}
                            upcoming={upcomingExpense}
                            service={serviceExpense}
                            isLoading={forecastSectionLoading}
                            chartHeight={140}
                        />
                    </MobileCard>
                </FullBleed>

                {/* ─── S9c. PROJECTED NET ─── */}
                <FullBleed>
                    <ProjectedNetCard
                        revenueTotal={totalRevenueForecast}
                        expenseTotal={totalExpenseForecast}
                    />
                </FullBleed>

                {/* ═══ DEFERRED SECTIONS ═══ */}

                {/* ─── S10. CƠ CẤU CHI PHÍ + DÒNG TIỀN ─── */}
                <DeferredSection rootMargin="300px" placeholderHeight={280}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Cơ cấu chi phí">
                                <InfoTooltip title="Cơ cấu chi phí">
                                    <p>Phân bổ chi phí giữa nợ host (đã phát sinh + dự kiến) và dịch vụ vận hành.</p>
                                </InfoTooltip>
                            </MobileSectionHeader>
                            <ExpenseBreakdownChart
                                hostIncurred={hostIncurred}
                                hostProjected={hostProjected}
                                serviceOut={serviceOut}
                                netExpected={netExp}
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                <DeferredSection rootMargin="200px" placeholderHeight={280}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Dòng tiền">
                                <InfoTooltip title="Dòng tiền">
                                    <div className="space-y-1.5">
                                        <p><span className="font-semibold text-emerald-400">Cash In:</span> tổng tiền vào kỳ</p>
                                        <p><span className="font-semibold text-rose-400">Cash Out:</span> tổng tiền chi kỳ</p>
                                        <p><span className="font-semibold text-sky-400">Net:</span> tiền ròng = in − out</p>
                                    </div>
                                </InfoTooltip>
                            </MobileSectionHeader>
                            <CashflowChart
                                cashIn={pl.cash.cash_in}
                                cashOut={pl.cash.cash_out}
                                netCash={pl.cash.net_cash}
                                isLoading={plLoading}
                                chartHeight={220}
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── S11. LỢI NHUẬN vs DÒNG TIỀN ─── */}
                <DeferredSection rootMargin="200px" placeholderHeight={260}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Lợi nhuận vs Dòng tiền">
                                <InfoTooltip title="Lợi nhuận vs Dòng tiền">
                                    <div className="space-y-1.5">
                                        <p><span className="font-semibold text-emerald-400">Profit (P&L):</span> lợi nhuận kế toán</p>
                                        <p><span className="font-semibold text-sky-400">Cashflow:</span> dòng tiền thực tế</p>
                                        <p><span className="font-semibold text-amber-400">Chênh lệch:</span> do payout timing / tạm thu / cọc / lệch kỳ</p>
                                    </div>
                                </InfoTooltip>
                            </MobileSectionHeader>
                            <ProfitCashComparisonChart
                                profit={pl.accrual.net_profit}
                                cashflow={pl.cash.net_cash}
                                gap={pl.difference.profit_minus_cash}
                                isLoading={plLoading}
                                chartHeight={200}
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── S12. CÔNG NỢ OTA ─── */}
                <DeferredSection rootMargin="200px" placeholderHeight={250}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Công nợ OTA">
                                <InfoTooltip title="Tuổi nợ OTA">
                                    <div className="space-y-1.5">
                                        <p><span className="font-semibold text-teal-400">0–7 ngày:</span> mới phát sinh, bình thường</p>
                                        <p><span className="font-semibold text-amber-400">8–30 ngày:</span> chậm hơn chu kỳ, cần theo dõi</p>
                                        <p><span className="font-semibold text-rose-400">&gt;30 ngày:</span> rủi ro, cần kiểm tra payout/case</p>
                                    </div>
                                </InfoTooltip>
                            </MobileSectionHeader>
                            <OtaReceivableAgingChart
                                arTotal={otaReceivablesData?.total || 0}
                                arCount={otaReceivablesData?.count || 0}
                                pendingTotal={otaPayoutData?.pending || 0}
                                pendingCount={otaPayoutData?.pendingCount || 0}
                                overdueCount={otaPayoutData?.overdueCount}
                                aging={otaReceivablesData?.aging}
                                chartHeight={180}
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── S12b. CÔNG NỢ HOST ─── */}
                <DeferredSection rootMargin="150px" placeholderHeight={250}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Công nợ Host">
                                <InfoTooltip title="Tiến độ thanh toán Host">
                                    <div className="space-y-1.5">
                                        <p><span className="font-semibold text-emerald-400">Paid:</span> đã thanh toán</p>
                                        <p><span className="font-semibold text-rose-400">Outstanding:</span> còn phải trả</p>
                                        <p><span className="font-semibold text-amber-400">Upcoming:</span> dự kiến sẽ phát sinh</p>
                                    </div>
                                </InfoTooltip>
                            </MobileSectionHeader>
                            <HostSettlementProgressChart
                                paid={hostDebtData?.totalPaid || 0}
                                outstanding={hostDebtData?.actualRemaining || 0}
                                upcoming={hostDebtData?.expectedRemaining || 0}
                                totalPayable={hostDebtData?.totalPayable || 0}
                                actualUnsettled={hostDebtData?.actualUnsettled}
                                actualCount={hostDebtData?.actualCount}
                                expectedCount={hostDebtData?.expectedCount}
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── S13. HIỆU SUẤT CHỖ NGHỈ ─── */}
                <DeferredSection rootMargin="100px" placeholderHeight={250}>
                    <FullBleed>
                        <MobileCard className="p-0 sm:p-0">
                            <div className="px-3 sm:px-4 pt-4">
                                <MobileSectionHeader title="Hiệu suất chỗ nghỉ" />
                            </div>
                            <PropertyPerformanceTable
                                data={propertyRanking}
                                isLoading={analyticsLoading}
                            />
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>

                {/* ─── S14. ĐẶT PHÒNG GẦN ĐÂY ─── */}
                <DeferredSection rootMargin="100px" placeholderHeight={300}>
                    <FullBleed>
                        <MobileCard>
                            <MobileSectionHeader title="Đặt phòng gần đây" />
                            {bookingsLoading ? (
                                <p className="text-xs text-muted-foreground text-center py-6">Đang tải...</p>
                            ) : !recentBookings?.length ? (
                                <p className="text-xs text-muted-foreground text-center py-6">Chưa có booking</p>
                            ) : (
                                <div className="space-y-3">
                                    {recentBookings.slice(0, 5).map((b) => (
                                        <div
                                            key={b.id}
                                            className="flex items-center gap-3 rounded-xl border border-border/30 p-2.5 sm:p-3 hover:bg-muted/20 cursor-pointer transition-colors min-w-0"
                                            onClick={() => appNavigate(`/bookings/${b.id}`)}
                                        >
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono text-primary">{b.displayId}</span>
                                                    <OtaBadge source={b.source} size="sm" />
                                                </div>
                                                <p className="text-xs text-foreground truncate">{b.guest}</p>
                                                <p className="text-[10px] text-muted-foreground tabular-nums">
                                                    {b.checkIn} → {b.checkOut}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0 space-y-1">
                                                <p className="text-xs font-semibold tabular-nums">{fmtShort(b.amount)}</p>
                                                <StatusBadge
                                                    variant={getBookingStatusVariant(b.status) as any}
                                                >
                                                    {statusLabel(b.status)}
                                                </StatusBadge>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        onClick={() => appNavigate("/bookings")}
                                        className="w-full text-center text-xs text-primary font-medium py-2 hover:underline"
                                    >
                                        Xem tất cả →
                                    </button>
                                </div>
                            )}
                        </MobileCard>
                    </FullBleed>
                </DeferredSection>
            </div>
        </div>
    );
}
