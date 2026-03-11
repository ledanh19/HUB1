/**
 * DashboardAnalyticsTab — Tab 2 for Dashboard (Phân tích).
 *
 * Self-contained component with its own filter state and data hooks.
 * All hooks receive `enabled` prop to avoid running when tab is not active.
 *
 * Layout:
 *   1. Global filter bar (presets + custom date picker + timeKey + property filter)
 *   2. KPI row
 *   3. Time series chart (bar chart, day/month bucket)
 *   4. Property ranking (horizontal bar chart)
 *   5. Room type ranking (horizontal bar chart)
 *   6. Property × Channel breakdown table
 *   7. Channel breakdown (table + donut)
 *   8. Guest origin (map + country ranking)
 *
 * NON-BREAKING: New component, no modifications to existing code.
 */

import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
    BarChart3,
    Calendar,
    DollarSign,
    TrendingUp,
    Users,
    Moon,
    XCircle,
    Clock,
    BedDouble,
    Globe,
    Building2,
    Layers,
    Filter,
} from "lucide-react";
import {
    ComposedChart,
    BarChart,
    Bar,
    Line,
    LabelList,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { vi } from "date-fns/locale";
import { format } from "date-fns";

import {
    useDashboardAnalyticsFilters,
    type Preset,
    type TimeKey,
} from "@/hooks/dashboard/useDashboardAnalyticsFilters";
import { useBookingAnalyticsTimeSeries } from "@/hooks/dashboard/useBookingAnalyticsTimeSeries";
import { useBookingAnalyticsByChannel } from "@/hooks/dashboard/useBookingAnalyticsByChannel";
import { useGuestOriginAnalyticsV2 } from "@/hooks/dashboard/useGuestOriginAnalyticsV2";
import { useBookingAnalyticsRankings } from "@/hooks/dashboard/useBookingAnalyticsRankings";
import { useAreaRanking } from "@/hooks/dashboard/useAreaRanking";
import { GuestOriginSection } from "@/components/dashboard-v2/charts/GuestOriginSection";
import { AreaRankingChart } from "@/components/dashboard-v2/charts/AreaRankingChart";
import type { GuestOriginRow } from "@/hooks/useGuestOriginAnalytics";

// ─── OTA Config (same as BookingSourcesChart) ─────────────────────────────────

import expediaLogo from "@/assets/ota-logos/expedia.png";
import agodaLogo from "@/assets/ota-logos/agoda.png";
import ctripLogo from "@/assets/ota-logos/ctrip.png";
import bookingLogo from "@/assets/ota-logos/booking.png";
import travelokaLogo from "@/assets/ota-logos/traveloka.png";

const OTA_CONFIG: Record<string, { logo: string; color: string; label: string }> = {
    EXPEDIA: { logo: expediaLogo, color: "#1a365d", label: "Expedia" },
    AGODA: { logo: agodaLogo, color: "#e53935", label: "Agoda" },
    CTRIP: { logo: ctripLogo, color: "#2e7d32", label: "CTrip" },
    "BOOKING.COM": { logo: bookingLogo, color: "#003580", label: "Booking.com" },
    BOOKING: { logo: bookingLogo, color: "#003580", label: "Booking.com" },
    TRAVELOKA: { logo: travelokaLogo, color: "#0194f3", label: "Traveloka" },
    OTHER: { logo: "", color: "#f59e0b", label: "Khác" },
    DIRECT: { logo: "", color: "#10b981", label: "Trực tiếp" },
};

// Chart color palette for rankings
const RANKING_COLORS = [
    "#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626",
    "#0891B2", "#4338CA", "#65A30D", "#E11D48", "#9333EA",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) =>
    "₫" + new Intl.NumberFormat("vi-VN").format(Math.round(amount));

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `đ${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `đ${(v / 1_000_000).toFixed(1)}M`;
    return `đ${(v / 1_000).toFixed(0)}K`;
};

const formatNumber = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

// ─── Presets Config ───────────────────────────────────────────────────────────

const PRESET_OPTIONS: { value: Preset; label: string }[] = [
    { value: "THIS_YEAR", label: "Năm nay" },
    { value: "LAST_YEAR", label: "Năm trước" },
    { value: "THIS_MONTH", label: "Tháng này" },
    { value: "LAST_MONTH", label: "Tháng trước" },
    { value: "LAST_90D", label: "90 ngày" },
    { value: "CUSTOM", label: "Tùy chỉnh" },
];

const TIMEKEY_OPTIONS: { value: TimeKey; label: string }[] = [
    { value: "booking_date", label: "Ngày đặt" },
    { value: "check_in_date", label: "Ngày nhận phòng" },
    { value: "check_out_date", label: "Ngày trả phòng" },
];

// ─── Card wrapper (reuse DashCard style) ──────────────────────────────────────

function AnalyticsCard({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-2xl bg-card border border-border/30",
                "shadow-[0_2px_6px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.05)]",
                "relative overflow-visible p-4",
                className
            )}
        >
            {children}
        </div>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SectionSkeleton({ height = 200 }: { height?: number }) {
    return (
        <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
        >
            <div className="flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Đang tải...
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DashboardAnalyticsTabProps {
    enabled: boolean;
}

function DashboardAnalyticsTabInner({ enabled }: DashboardAnalyticsTabProps) {
    const filters = useDashboardAnalyticsFilters();
    const [fromCalendarOpen, setFromCalendarOpen] = useState(false);
    const [toCalendarOpen, setToCalendarOpen] = useState(false);
    const [propertyFilterOpen, setPropertyFilterOpen] = useState(false);

    // ── Data hooks (only run when tab is active) ──
    const timeSeries = useBookingAnalyticsTimeSeries({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        timeKey: filters.timeKey,
        bucket: filters.bucket,
        propertyId: filters.propertyId,
        enabled,
    });

    const channelBreakdown = useBookingAnalyticsByChannel({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        timeKey: filters.timeKey,
        propertyId: filters.propertyId,
        enabled,
    });

    const guestOrigin = useGuestOriginAnalyticsV2({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        timeKey: filters.timeKey,
        enabled,
    });

    const rankings = useBookingAnalyticsRankings({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        timeKey: filters.timeKey,
        propertyId: filters.propertyId,
        enabled,
    });

    // ── Area ranking (queries bookings_mirror directly — same SOT as OTA tab) ──
    const areaRanking = useAreaRanking({
        dateStart: filters.dateFrom,
        dateEnd: filters.dateTo,
        sot: "ota",
        timeKey: filters.timeKey,
        propertyId: filters.propertyId,
        enabled,
    });

    // ── Donut chart data ──
    const donutData = useMemo(
        () =>
            channelBreakdown.rows.map((r) => {
                const config = OTA_CONFIG[r.channel] || OTA_CONFIG.OTHER;
                return {
                    name: config.label,
                    value: r.revenue,
                    color: config.color,
                };
            }),
        [channelBreakdown.rows]
    );

    // ── Guest origin data mapped to GuestOriginRow type ──
    const guestOriginRows: GuestOriginRow[] = useMemo(
        () =>
            guestOrigin.rows.map((r) => ({
                iso3: r.iso3,
                country: r.country,
                bookings: r.bookings,
                revenue: r.revenue,
                adr: r.adr,
                share: r.share,
            })),
        [guestOrigin.rows]
    );

    // ── Property ranking chart data (top 10) ──
    const propertyChartData = useMemo(
        () =>
            rankings.propertyRanking.slice(0, 10).map((r, i) => ({
                name: r.propertyName || r.otaPropertyId,
                revenue: r.revenue,
                reservations: r.reservations,
                fill: RANKING_COLORS[i % RANKING_COLORS.length],
            })),
        [rankings.propertyRanking]
    );

    // ── Room type ranking chart data (top 10) ──
    const roomTypeChartData = useMemo(
        () =>
            rankings.roomTypeRanking.slice(0, 10).map((r, i) => ({
                name: r.roomType,
                revenue: r.revenue,
                reservations: r.reservations,
                fill: RANKING_COLORS[i % RANKING_COLORS.length],
            })),
        [rankings.roomTypeRanking]
    );

    // ── Custom tooltip for bar chart ──
    // ── Enrich series with ADR per point ──
    const enrichedSeries = useMemo(
        () => {
            const mapped = timeSeries.series.map((p) => {
                const adr = p.roomNights > 0 ? p.revenue / p.roomNights : 0;
                return { ...p, adr, adrMillion: adr / 1_000_000 };
            });
            // For DAY bucket, trim trailing days with no activity
            if (mapped.length > 0 && mapped[0].t.length === 10) {
                let lastIdx = mapped.length - 1;
                while (lastIdx >= 0 && mapped[lastIdx].revenue === 0 && mapped[lastIdx].reservations === 0 && mapped[lastIdx].cancellations === 0) {
                    lastIdx--;
                }
                return mapped.slice(0, lastIdx + 1);
            }
            return mapped;
        },
        [timeSeries.series]
    );

    const BarTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        const dataKeyLabels: Record<string, string> = {
            revenue: "Doanh thu",
            reservations: "Đặt phòng",
            roomNights: "Đêm phòng",
            adr: "ADR",
            adrMillion: "ADR",
        };
        return (
            <div className="rounded-lg border border-border/40 bg-card/95 backdrop-blur-sm p-3 shadow-lg text-xs space-y-1">
                <p className="font-medium text-foreground mb-1">{label}</p>
                {payload.map((p: any) => (
                    <div key={p.dataKey} className="flex items-center gap-2">
                        <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: p.color }}
                        />
                        <span className="text-muted-foreground">{dataKeyLabels[p.dataKey] || p.dataKey}:</span>
                        <span className="font-semibold tabular-nums ml-auto">
                            {p.dataKey === "revenue"
                                ? formatCurrencyShort(p.value)
                                : p.dataKey === "adrMillion"
                                    ? formatCurrencyShort(p.payload?.adr || 0)
                                    : formatNumber(p.value)}
                        </span>
                    </div>
                ))}
            </div>
        );
    };

    // ── Ranking tooltip ──
    const RankingTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.length) return null;
        const d = payload[0]?.payload;
        return (
            <div className="rounded-lg border border-border/40 bg-card/95 backdrop-blur-sm p-3 shadow-lg text-xs space-y-1">
                <p className="font-medium text-foreground mb-1">{d?.name}</p>
                <p>Doanh thu: <span className="font-semibold">{formatCurrencyShort(d?.revenue || 0)}</span></p>
                <p>Đặt phòng: <span className="font-semibold">{formatNumber(d?.reservations || 0)}</span></p>
            </div>
        );
    };

    // ── Selected property label ──
    const selectedPropertyLabel = useMemo(() => {
        if (!filters.propertyId) return "Tất cả chỗ nghỉ";
        const opt = rankings.propertyOptions.find((o) => o.id === filters.propertyId);
        return opt?.name || "Đang tải...";
    }, [filters.propertyId, rankings.propertyOptions]);

    return (
        <div className="space-y-4">
            {/* ═══════════════════════════════════════════════════════════
         FILTER BAR
         ═══════════════════════════════════════════════════════════ */}
            <AnalyticsCard>
                <div className="flex flex-wrap items-center gap-3">
                    {/* Preset chips */}
                    <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1">
                        {PRESET_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => filters.setPreset(opt.value)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                                    filters.preset === opt.value
                                        ? "bg-card text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Custom date range (shown when CUSTOM) */}
                    {filters.preset === "CUSTOM" && (
                        <div className="flex items-center gap-2">
                            <Popover open={fromCalendarOpen} onOpenChange={setFromCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {format(new Date(filters.dateFrom), "dd/MM/yyyy")}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                        mode="single"
                                        selected={new Date(filters.dateFrom)}
                                        onSelect={(date) => {
                                            if (date) {
                                                filters.setCustomRange(date, new Date(filters.dateTo));
                                                setFromCalendarOpen(false);
                                            }
                                        }}
                                        locale={vi}
                                        className="pointer-events-auto"
                                    />
                                </PopoverContent>
                            </Popover>
                            <span className="text-xs text-muted-foreground">→</span>
                            <Popover open={toCalendarOpen} onOpenChange={setToCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {format(new Date(filters.dateTo), "dd/MM/yyyy")}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                        mode="single"
                                        selected={new Date(filters.dateTo)}
                                        onSelect={(date) => {
                                            if (date) {
                                                filters.setCustomRange(new Date(filters.dateFrom), date);
                                                setToCalendarOpen(false);
                                            }
                                        }}
                                        locale={vi}
                                        className="pointer-events-auto"
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}

                    {/* Property filter dropdown */}
                    <Popover open={propertyFilterOpen} onOpenChange={setPropertyFilterOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                    "h-8 gap-2 text-xs",
                                    filters.propertyId && "border-primary text-primary"
                                )}
                            >
                                <Building2 className="h-3.5 w-3.5" />
                                {selectedPropertyLabel}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2" align="start">
                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                <button
                                    onClick={() => {
                                        filters.setPropertyId(null);
                                        setPropertyFilterOpen(false);
                                    }}
                                    className={cn(
                                        "w-full text-left px-3 py-2 text-xs rounded-lg transition-colors",
                                        !filters.propertyId
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "hover:bg-muted"
                                    )}
                                >
                                    Tất cả chỗ nghỉ
                                </button>
                                {rankings.propertyOptions.map((opt) => (
                                    <button
                                        key={opt.id}
                                        onClick={() => {
                                            filters.setPropertyId(opt.id);
                                            setPropertyFilterOpen(false);
                                        }}
                                        className={cn(
                                            "w-full text-left px-3 py-2 text-xs rounded-lg transition-colors",
                                            filters.propertyId === opt.id
                                                ? "bg-primary/10 text-primary font-medium"
                                                : "hover:bg-muted"
                                        )}
                                    >
                                        <span className="font-medium">{opt.name || opt.id}</span>
                                        <span className="text-muted-foreground ml-1.5 text-[10px]">#{opt.id}</span>
                                    </button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Spacer — hidden on mobile so controls wrap below */}
                    <div className="hidden md:block flex-1" />

                    {/* TimeKey segmented control */}
                    <div className="flex items-center rounded-lg border border-border overflow-x-auto">
                        {TIMEKEY_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => filters.setTimeKey(opt.value)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium transition-colors",
                                    filters.timeKey === opt.value
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-background text-muted-foreground hover:bg-muted"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Bucket indicator */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BarChart3 className="h-3.5 w-3.5" />
                        <span>
                            {filters.bucket === "DAY" ? "Theo ngày" : "Theo tháng"}
                        </span>
                    </div>
                </div>
            </AnalyticsCard>

            {/* ═══════════════════════════════════════════════════════════
         KPI ROW
         ═══════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {(() => {
                    const { kpis, comparisonKpis } = timeSeries;

                    const trendPct = (curr: number, prev: number | undefined | null): number | null => {
                        if (prev == null || prev === 0) return curr > 0 ? 100 : null;
                        return ((curr - prev) / Math.abs(prev)) * 100;
                    };

                    const kpiCards = [
                        { label: "Doanh thu", value: formatCurrencyShort(kpis.revenue), icon: DollarSign, trend: trendPct(kpis.revenue, comparisonKpis?.revenue) },
                        { label: "Đặt phòng", value: formatNumber(kpis.reservations), icon: Users, trend: trendPct(kpis.reservations, comparisonKpis?.reservations) },
                        { label: "Đêm phòng", value: formatNumber(kpis.roomNights), icon: Moon, trend: trendPct(kpis.roomNights, comparisonKpis?.roomNights) },
                        { label: "Hủy phòng", value: formatNumber(kpis.cancellations), icon: XCircle, trend: trendPct(kpis.cancellations, comparisonKpis?.cancellations), inverted: true },
                        { label: "ADR", value: formatCurrency(kpis.adr), icon: TrendingUp, trend: trendPct(kpis.adr, comparisonKpis?.adr) },
                        { label: "TB đêm lưu trú", value: kpis.avgLos.toFixed(1) + " đêm", icon: BedDouble, trend: trendPct(kpis.avgLos, comparisonKpis?.avgLos) },
                        { label: "TB lead time", value: kpis.avgLeadTime.toFixed(1) + " ngày", icon: Clock, trend: trendPct(kpis.avgLeadTime, comparisonKpis?.avgLeadTime) },
                    ];

                    if (timeSeries.isLoading) {
                        return kpiCards.map((c) => (
                            <AnalyticsCard key={c.label}>
                                <p className="text-[11px] text-muted-foreground mb-1">{c.label}</p>
                                <div className="h-5 w-16 bg-muted/50 rounded animate-pulse" />
                            </AnalyticsCard>
                        ));
                    }

                    return kpiCards.map((c) => {
                        const Icon = c.icon;
                        const t = c.trend;
                        const inverted = (c as any).inverted;
                        // For inverted KPIs (cancellations), up is bad
                        const isPositive = inverted ? (t != null && t < 0) : (t != null && t > 0);
                        const isNegative = inverted ? (t != null && t > 0) : (t != null && t < 0);

                        return (
                            <AnalyticsCard key={c.label}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                    <p className="text-[11px] text-muted-foreground">{c.label}</p>
                                </div>
                                <p className="text-lg font-bold tabular-nums tracking-tight">{c.value}</p>
                                {t != null && (
                                    <span className={cn(
                                        "inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full mt-1",
                                        isPositive ? "text-emerald-700 bg-emerald-50" : isNegative ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted/40"
                                    )}>
                                        {t > 0 ? "▲" : t < 0 ? "▼" : ""}
                                        {t > 0 ? "+" : ""}{t.toFixed(1)}%
                                    </span>
                                )}
                            </AnalyticsCard>
                        );
                    });
                })()}
            </div>

            {/* ═══════════════════════════════════════════════════════════
         TIME SERIES CHART
         ═══════════════════════════════════════════════════════════ */}
            <AnalyticsCard>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Biểu đồ theo thời gian
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                        ({filters.bucket === "DAY" ? "Ngày" : "Tháng"})
                    </span>
                </h3>

                {timeSeries.isLoading ? (
                    <SectionSkeleton height={300} />
                ) : timeSeries.series.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                        Chưa có dữ liệu
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={340}>
                        <ComposedChart data={enrichedSeries} margin={{ top: 20, right: 10, bottom: 5, left: 5 }}>
                            <defs>
                                <linearGradient id="time-bar-grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.95} />
                                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.85} />
                                </linearGradient>
                                <linearGradient id="time-booking-grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                                    <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                                </linearGradient>
                                <linearGradient id="adr-line-grad" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#f59e0b" />
                                    <stop offset="50%" stopColor="#ef4444" />
                                    <stop offset="100%" stopColor="#f59e0b" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                            <XAxis
                                dataKey="t"
                                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                tickLine={false}
                                axisLine={false}
                            />
                            {/* Left Y: Revenue */}
                            <YAxis
                                yAxisId="left"
                                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                tickLine={false}
                                axisLine={false}
                                width={50}
                                tickFormatter={(v) => formatCurrencyShort(v)}
                            />
                            {/* Right Y: ADR */}
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                tickLine={false}
                                axisLine={false}
                                width={52}
                                domain={[0, "auto"]}
                                tickFormatter={(v) => formatCurrencyShort(Number(v) * 1_000_000)}
                            />
                            <RechartsTooltip content={<BarTooltip />} />
                            <Legend
                                wrapperStyle={{ fontSize: 11 }}
                                formatter={(value: string) => {
                                    const labels: Record<string, string> = {
                                        revenue: "Doanh thu",
                                        reservations: "Số đặt phòng",
                                        adrMillion: "ADR",
                                    };
                                    return labels[value] || value;
                                }}
                            />
                            <Bar
                                yAxisId="left"
                                dataKey="revenue"
                                fill="url(#time-bar-grad)"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={36}
                                name="revenue"
                            >
                                <LabelList
                                    dataKey="reservations"
                                    position="top"
                                    style={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }}
                                    formatter={(v: number) => (v > 0 ? v : "")}
                                />
                            </Bar>
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="adrMillion"
                                stroke="url(#adr-line-grad)"
                                strokeWidth={2.5}
                                dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: "#ef4444" }}
                                name="adrMillion"
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </AnalyticsCard>

            {/* ═══════════════════════════════════════════════════════════
         PROPERTY RANKING & ROOM TYPE RANKING (side by side)
         ═══════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* ── Property Ranking ── */}
                <AnalyticsCard>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        Chỗ nghỉ OTA bán chạy nhất
                    </h3>
                    {rankings.isLoading ? (
                        <SectionSkeleton height={280} />
                    ) : propertyChartData.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                            Chưa có dữ liệu
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={Math.max(280, propertyChartData.length * 36)}>
                            <BarChart
                                data={propertyChartData}
                                layout="vertical"
                                margin={{ top: 0, right: 30, bottom: 0, left: 10 }}
                            >
                                <defs>
                                    {propertyChartData.map((entry, i) => (
                                        <linearGradient key={`prop-grad-${i}`} id={`prop-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor={entry.fill} stopOpacity={0.6} />
                                            <stop offset="100%" stopColor={entry.fill} stopOpacity={0.95} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} horizontal={false} />
                                <XAxis
                                    type="number"
                                    tickFormatter={(v) => formatCurrencyShort(v)}
                                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                    tickLine={false}
                                    axisLine={false}
                                    width={120}
                                />
                                <RechartsTooltip content={<RankingTooltip />} />
                                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={24}>
                                    {propertyChartData.map((entry, i) => (
                                        <Cell key={i} fill={`url(#prop-grad-${i})`} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </AnalyticsCard>

                {/* ── Room Type Ranking ── */}
                <AnalyticsCard>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        Loại phòng bán chạy nhất
                    </h3>
                    {rankings.isLoading ? (
                        <SectionSkeleton height={280} />
                    ) : roomTypeChartData.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                            Chưa có dữ liệu
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={Math.max(280, roomTypeChartData.length * 36)}>
                            <BarChart
                                data={roomTypeChartData}
                                layout="vertical"
                                margin={{ top: 0, right: 30, bottom: 0, left: 10 }}
                            >
                                <defs>
                                    {roomTypeChartData.map((entry, i) => (
                                        <linearGradient key={`room-grad-${i}`} id={`room-grad-${i}`} x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor={entry.fill} stopOpacity={0.6} />
                                            <stop offset="100%" stopColor={entry.fill} stopOpacity={0.95} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} horizontal={false} />
                                <XAxis
                                    type="number"
                                    tickFormatter={(v) => formatCurrencyShort(v)}
                                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                    tickLine={false}
                                    axisLine={false}
                                    width={140}
                                />
                                <RechartsTooltip content={<RankingTooltip />} />
                                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={24}>
                                    {roomTypeChartData.map((entry, i) => (
                                        <Cell key={i} fill={`url(#room-grad-${i})`} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </AnalyticsCard>
            </div>

            {/* ═══════════════════════════════════════════════════════════
         PROPERTY × CHANNEL BREAKDOWN TABLE
         ═══════════════════════════════════════════════════════════ */}
            <AnalyticsCard>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    ID Chỗ nghỉ OTA × Nguồn OTA
                </h3>
                {rankings.isLoading ? (
                    <SectionSkeleton height={200} />
                ) : rankings.propertyChannelRanking.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                        Chưa có dữ liệu
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border text-left text-muted-foreground">
                                    <th className="pb-2 font-medium">#</th>
                                    <th className="pb-2 font-medium">ID Chỗ nghỉ OTA</th>
                                    <th className="pb-2 font-medium">Tên chỗ nghỉ</th>
                                    <th className="pb-2 font-medium">Nguồn OTA</th>
                                    <th className="pb-2 font-medium text-right">Doanh thu</th>
                                    <th className="pb-2 font-medium text-right">Đặt phòng</th>
                                    <th className="pb-2 font-medium text-right">Đêm phòng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rankings.propertyChannelRanking.map((row, idx) => {
                                    const config = OTA_CONFIG[row.channel] || OTA_CONFIG.OTHER;
                                    return (
                                        <tr
                                            key={`${row.otaPropertyId}-${row.channel}`}
                                            className="border-b border-border/50 last:border-0 hover:bg-primary/5 transition-colors"
                                        >
                                            <td className="py-2.5 text-muted-foreground">{idx + 1}</td>
                                            <td className="py-2.5 font-mono text-[11px]">{row.otaPropertyId}</td>
                                            <td className="py-2.5">{row.propertyName || "—"}</td>
                                            <td className="py-2.5">
                                                <div className="flex items-center gap-1.5">
                                                    {config.logo ? (
                                                        <img src={config.logo} alt={config.label} className="w-3.5 h-3.5 object-contain" />
                                                    ) : (
                                                        <div
                                                            className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                                                            style={{ backgroundColor: config.color }}
                                                        >
                                                            {config.label.charAt(0)}
                                                        </div>
                                                    )}
                                                    <span>{config.label}</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 text-right tabular-nums font-medium">{formatCurrency(row.revenue)}</td>
                                            <td className="py-2.5 text-right tabular-nums">{row.reservations}</td>
                                            <td className="py-2.5 text-right tabular-nums">{row.roomNights}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </AnalyticsCard>

            {/* ═══════════════════════════════════════════════════════════
         PMS PROPERTY (CHANNEX) BREAKDOWN TABLE
         ═══════════════════════════════════════════════════════════ */}
            <AnalyticsCard>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Chỗ nghỉ PMS (Channex)
                </h3>
                {rankings.isLoading ? (
                    <SectionSkeleton height={200} />
                ) : rankings.pmsPropertyRanking.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                        Chưa có dữ liệu
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border text-left text-muted-foreground">
                                    <th className="pb-2 font-medium">#</th>
                                    <th className="pb-2 font-medium">Tên chỗ nghỉ</th>
                                    <th className="pb-2 font-medium text-right">Doanh thu</th>
                                    <th className="pb-2 font-medium text-right">Đặt phòng</th>
                                    <th className="pb-2 font-medium text-right">Đêm phòng</th>
                                    <th className="pb-2 font-medium text-right">ADR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rankings.pmsPropertyRanking.map((row, idx) => (
                                    <tr
                                        key={row.channexPropertyId}
                                        className="border-b border-border/50 last:border-0 hover:bg-primary/5 transition-colors"
                                    >
                                        <td className="py-2.5 text-muted-foreground">{idx + 1}</td>
                                        <td className="py-2.5 font-medium">{row.pmsPropertyName || row.channexPropertyId}</td>
                                        <td className="py-2.5 text-right tabular-nums font-medium">{formatCurrency(row.revenue)}</td>
                                        <td className="py-2.5 text-right tabular-nums">{row.reservations}</td>
                                        <td className="py-2.5 text-right tabular-nums">{row.roomNights}</td>
                                        <td className="py-2.5 text-right tabular-nums">{formatCurrency(row.adr)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </AnalyticsCard>

            <AnalyticsCard>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Phân tích theo kênh
                </h3>

                {channelBreakdown.isLoading ? (
                    <SectionSkeleton height={280} />
                ) : channelBreakdown.rows.length === 0 ? (
                    <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                        Chưa có dữ liệu kênh
                    </div>
                ) : (
                    <div className="flex flex-col lg:flex-row gap-6">
                        {/* Donut */}
                        <div className="relative w-[180px] h-[180px] shrink-0 mx-auto lg:mx-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={donutData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={55}
                                        outerRadius={80}
                                        paddingAngle={2}
                                        dataKey="value"
                                        animationDuration={800}
                                    >
                                        {donutData.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={entry.color}
                                                fillOpacity={0.85}
                                            />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                    Doanh thu
                                </span>
                                <span className="text-lg font-bold tabular-nums">
                                    {formatCurrencyShort(timeSeries.kpis.revenue)}
                                </span>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="pb-2 font-medium">Kênh</th>
                                        <th className="pb-2 font-medium text-right">Doanh thu</th>
                                        <th className="pb-2 font-medium text-right hidden sm:table-cell">Đặt phòng</th>
                                        <th className="pb-2 font-medium text-right hidden sm:table-cell">Đêm phòng</th>
                                        <th className="pb-2 font-medium text-right hidden md:table-cell">ADR</th>
                                        <th className="pb-2 font-medium text-right hidden md:table-cell">TB đêm</th>
                                        <th className="pb-2 font-medium text-right hidden lg:table-cell">TB lead time</th>
                                        <th className="pb-2 font-medium text-right hidden sm:table-cell">Hủy</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {channelBreakdown.rows.map((row) => {
                                        const config = OTA_CONFIG[row.channel] || OTA_CONFIG.OTHER;
                                        return (
                                            <tr
                                                key={row.channel}
                                                className="border-b border-border/50 last:border-0 hover:bg-primary/5 transition-colors"
                                            >
                                                <td className="py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        {config.logo ? (
                                                            <img
                                                                src={config.logo}
                                                                alt={config.label}
                                                                className="w-4 h-4 object-contain"
                                                            />
                                                        ) : (
                                                            <div
                                                                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                                                                style={{ backgroundColor: config.color }}
                                                            >
                                                                {config.label.charAt(0)}
                                                            </div>
                                                        )}
                                                        <span className="font-medium">{config.label}</span>
                                                    </div>
                                                </td>
                                                <td className="py-2.5 text-right tabular-nums">{formatCurrency(row.revenue)}</td>
                                                <td className="py-2.5 text-right tabular-nums hidden sm:table-cell">{row.reservations}</td>
                                                <td className="py-2.5 text-right tabular-nums hidden sm:table-cell">{row.roomNights}</td>
                                                <td className="py-2.5 text-right tabular-nums hidden md:table-cell">{formatCurrency(row.adr)}</td>
                                                <td className="py-2.5 text-right tabular-nums hidden md:table-cell">{row.avgLos.toFixed(1)}</td>
                                                <td className="py-2.5 text-right tabular-nums hidden lg:table-cell">{row.avgLeadTime.toFixed(1)}</td>
                                                <td className="py-2.5 text-right tabular-nums hidden sm:table-cell">{row.cancellations}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </AnalyticsCard>

            {/* ═══════════════════════════════════════════════════════════
         AREA RANKING
         ═══════════════════════════════════════════════════════════ */}
            <AnalyticsCard>
                <AreaRankingChart
                    provinceRanking={areaRanking.provinceRanking}
                    districtRanking={areaRanking.districtRanking}
                    wardRanking={areaRanking.wardRanking}
                    isLoading={areaRanking.isLoading}
                />
            </AnalyticsCard>

            {/* ═══════════════════════════════════════════════════════════
         GUEST ORIGIN
         ═══════════════════════════════════════════════════════════ */}
            <AnalyticsCard>
                <GuestOriginSection
                    data={guestOriginRows}
                    totalBookings={guestOrigin.totalBookings}
                    isLoading={guestOrigin.isLoading}
                />
            </AnalyticsCard>
        </div>
    );
}

export const DashboardAnalyticsTab = memo(DashboardAnalyticsTabInner);
