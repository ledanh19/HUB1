import { useMemo } from "react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import type { TimeSeriesRow } from "@/modules/analytics/types";

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
};

const formatCurrencyFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(v);

interface RevenueTrendChartProps {
    data: TimeSeriesRow[];
    isLoading?: boolean;
    className?: string;
}

// Dark premium tooltip
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="dv2-tooltip-enter rounded-xl bg-slate-900 text-white px-4 py-3 shadow-2xl border border-white/10 backdrop-blur-sm">
            <p className="text-[11px] text-slate-400 mb-2 font-medium tracking-wide uppercase">{label}</p>
            {payload.map((entry: any) => (
                <div key={entry.dataKey} className="flex items-center gap-2.5 py-0.5">
                    <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white/10"
                        style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-xs text-slate-300">
                        {entry.dataKey === "revenue"
                            ? "Doanh thu"
                            : entry.dataKey === "hostCost"
                                ? "Giá vốn Host"
                                : "Lợi nhuận"}
                    </span>
                    <span className="text-xs font-semibold ml-auto tabular-nums">
                        {formatCurrencyFull(entry.value)}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function RevenueTrendChart({
    data,
    isLoading,
    className,
}: RevenueTrendChartProps) {
    const chartData = useMemo(
        () =>
            data.map((row) => ({
                name: row.periodLabel,
                revenue: row.revenueTotal,
                hostCost: row.hostCostTotal,
                grossProfit: row.revenueTotal - row.hostCostTotal,
            })),
        [data]
    );

    if (isLoading) {
        return (
            <div className={cn("h-[420px] rounded-xl flex items-center justify-center", className)}>
                <div className="w-full h-full dv2-skeleton" />
            </div>
        );
    }

    if (chartData.length === 0) {
        return (
            <div className={cn("h-[420px] flex items-center justify-center text-sm text-muted-foreground", className)}>
                Chưa có dữ liệu trong khoảng thời gian này
            </div>
        );
    }

    return (
        <div className={cn("dv2-chart-interactive h-[420px]", className)}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0B3C5D" stopOpacity={0.18} />
                            <stop offset="50%" stopColor="#0B3C5D" stopOpacity={0.06} />
                            <stop offset="100%" stopColor="#0B3C5D" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradHostCost" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ea580c" stopOpacity={0.10} />
                            <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#059669" stopOpacity={0.12} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        strokeDasharray="0"
                        stroke="hsl(var(--border))"
                        opacity={0.2}
                        horizontal={true}
                        vertical={false}
                    />
                    <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        dy={8}
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={formatCurrencyShort}
                        width={56}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        formatter={(value: string) =>
                            value === "revenue"
                                ? "Doanh thu"
                                : value === "hostCost"
                                    ? "Giá vốn Host"
                                    : "Lợi nhuận gộp"
                        }
                        wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                        iconType="circle"
                        iconSize={8}
                    />
                    <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#0B3C5D"
                        strokeWidth={2.5}
                        fill="url(#gradRevenue)"
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 3, fill: "#fff", stroke: "#0B3C5D" }}
                        animationDuration={900}
                        animationEasing="ease-out"
                    />
                    <Area
                        type="monotone"
                        dataKey="hostCost"
                        stroke="#ea580c"
                        strokeWidth={2}
                        fill="url(#gradHostCost)"
                        dot={false}
                        strokeDasharray="6 3"
                        activeDot={{ r: 4, strokeWidth: 2, fill: "#fff", stroke: "#ea580c" }}
                        animationDuration={1100}
                        animationEasing="ease-out"
                        animationBegin={200}
                    />
                    <Area
                        type="monotone"
                        dataKey="grossProfit"
                        stroke="#059669"
                        strokeWidth={2}
                        fill="url(#gradProfit)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, fill: "#fff", stroke: "#059669" }}
                        animationDuration={1100}
                        animationEasing="ease-out"
                        animationBegin={400}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
