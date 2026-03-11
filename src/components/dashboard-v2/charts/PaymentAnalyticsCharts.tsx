/**
 * PaymentAnalyticsCharts — Donut charts for payment type + payment method.
 * Follows the same design language as ChannelDonutChart.
 */

import { useMemo, useState } from "react";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { PaymentTypeRow, PaymentMethodRow } from "@/hooks/usePaymentAnalytics";

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `đ${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `đ${(v / 1_000_000).toFixed(1)}M`;
    return `đ${(v / 1_000).toFixed(0)}K`;
};

// ── Colors ──
const PAYMENT_TYPE_COLORS: Record<string, string> = {
    "Khách sạn thu": "#2563EB",
    "OTA thu": "#F59E0B",
};

const PAYMENT_METHOD_COLORS: Record<string, string> = {
    "Tiền mặt": "#10B981",
    "Chuyển khoản": "#2563EB",
    "Thẻ": "#8B5CF6",
    "OTA chuyển": "#F59E0B",
    "MoMo": "#EC4899",
    "ZaloPay": "#06B6D4",
    "OnePay": "#6366F1",
    "9Pay": "#EF4444",
    "VPBank": "#14B8A6",
    "UPC": "#64748B",
};

const FALLBACK_COLORS = [
    "#2563EB", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899",
    "#06B6D4", "#EF4444", "#14B8A6", "#6366F1", "#64748B",
];

const CHART_OPACITY = 0.85;

// ============================================================================
// GENERIC DONUT
// ============================================================================

interface DonutItem {
    name: string;
    value: number;
    count: number;
    share: number;
    color: string;
}

function MiniDonut({
    data,
    title,
    centerLabel,
    centerValue,
    className,
}: {
    data: DonutItem[];
    title: string;
    centerLabel: string;
    centerValue: string;
    className?: string;
}) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const displayItem = hoveredIndex !== null ? data[hoveredIndex] : null;

    if (data.length === 0) {
        return (
            <div className={cn("h-[240px] flex items-center justify-center text-sm text-slate-500", className)}>
                Chưa có dữ liệu
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col", className)}>
            <h4 className="text-sm font-semibold text-foreground mb-3">{title}</h4>
            <div className="flex items-center gap-4">
                {/* Donut */}
                <div className="relative w-[160px] h-[160px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <defs>
                                {data.map((entry, index) => (
                                    <linearGradient key={`donut-grad-${index}`} id={`donut-grad-${title.replace(/\s/g, '')}-${index}`} x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor={entry.color} stopOpacity={0.65} />
                                        <stop offset="100%" stopColor={entry.color} stopOpacity={1} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={48}
                                outerRadius={72}
                                paddingAngle={2}
                                dataKey="value"
                                onMouseLeave={() => setHoveredIndex(null)}
                                animationBegin={0}
                                animationDuration={900}
                                animationEasing="ease-out"
                            >
                                {data.map((entry, index) => (
                                    <Cell
                                        key={entry.name}
                                        fill={`url(#donut-grad-${title.replace(/\s/g, '')}-${index})`}
                                        style={{
                                            transform: hoveredIndex === index ? "scale(1.06)" : "scale(1)",
                                            transformOrigin: "center",
                                            transition: "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                            cursor: "pointer",
                                            filter: hoveredIndex !== null && hoveredIndex !== index
                                                ? "opacity(0.4)" : "none",
                                        }}
                                        onMouseEnter={() => setHoveredIndex(index)}
                                    />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                            {displayItem ? displayItem.name : centerLabel}
                        </span>
                        <span className="text-lg font-bold tabular-nums text-slate-900">
                            {displayItem
                                ? formatCurrencyShort(displayItem.value)
                                : centerValue}
                        </span>
                        {displayItem && (
                            <span className="text-[10px] font-semibold tabular-nums text-slate-400">
                                {displayItem.share.toFixed(1)}%
                            </span>
                        )}
                    </div>
                </div>

                {/* Legend */}
                <div className="space-y-2 text-xs min-w-0 flex-1">
                    {data.map((item, i) => (
                        <div
                            key={item.name}
                            className={cn(
                                "flex items-center gap-2 cursor-pointer transition-all duration-200",
                                hoveredIndex !== null && hoveredIndex !== i && "opacity-40"
                            )}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        >
                            <div
                                className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-black/5"
                                style={{ backgroundColor: item.color, opacity: CHART_OPACITY }}
                            />
                            <span className="text-slate-600 truncate">{item.name}</span>
                            <span className="font-semibold tabular-nums ml-auto text-slate-900">
                                {formatCurrencyShort(item.value)}
                            </span>
                            <span className="text-slate-400 w-10 text-right tabular-nums">
                                {item.share.toFixed(0)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

interface PaymentAnalyticsChartsProps {
    paymentTypes: PaymentTypeRow[];
    paymentMethods: PaymentMethodRow[];
    isLoading?: boolean;
    className?: string;
}

export function PaymentAnalyticsCharts({
    paymentTypes,
    paymentMethods,
    isLoading,
    className,
}: PaymentAnalyticsChartsProps) {
    const typeData: DonutItem[] = useMemo(
        () =>
            paymentTypes.map((row, i) => ({
                name: row.label,
                value: row.value,
                count: row.count,
                share: row.share,
                color: PAYMENT_TYPE_COLORS[row.label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
            })),
        [paymentTypes]
    );

    const methodData: DonutItem[] = useMemo(
        () =>
            paymentMethods.map((row, i) => ({
                name: row.label,
                value: row.value,
                count: row.count,
                share: row.share,
                color: PAYMENT_METHOD_COLORS[row.label] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
            })),
        [paymentMethods]
    );

    const totalTypeRevenue = useMemo(() => paymentTypes.reduce((s, r) => s + r.value, 0), [paymentTypes]);
    const totalMethodAmount = useMemo(() => paymentMethods.reduce((s, r) => s + r.value, 0), [paymentMethods]);

    if (isLoading) {
        return (
            <div className={cn("h-[280px] flex items-center justify-center", className)}>
                <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-6", className)}>
            <MiniDonut
                data={typeData}
                title="Hình thức thu"
                centerLabel="Tổng thu"
                centerValue={formatCurrencyShort(totalTypeRevenue)}
            />
            <MiniDonut
                data={methodData}
                title="Phương thức thanh toán"
                centerLabel="Tổng thu"
                centerValue={formatCurrencyShort(totalMethodAmount)}
            />
        </div>
    );
}
