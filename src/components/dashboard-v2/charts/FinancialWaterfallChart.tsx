import { useMemo } from "react";
import { CHART_OPACITY } from "../chartColors";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
    LabelList,
} from "recharts";
import { cn } from "@/lib/utils";

const formatCurrencyFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(v);

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return `${(v / 1_000).toFixed(0)}K`;
};

interface FinancialWaterfallChartProps {
    revenue: number;
    hostCost: number;
    isLoading?: boolean;
    className?: string;
}

// Premium tooltip
function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;
    return (
        <div className="dv2-tooltip-enter rounded-xl bg-slate-900 text-white px-4 py-3 shadow-2xl border border-white/10">
            <p className="text-[11px] text-slate-400 mb-1 uppercase tracking-wide">{item.name}</p>
            <p className="text-sm font-semibold tabular-nums">
                {formatCurrencyFull(Math.abs(item.total))}
            </p>
            {item.marginPct !== undefined && (
                <p className="text-[10px] text-slate-400 mt-1">
                    Margin: {item.marginPct.toFixed(1)}%
                </p>
            )}
        </div>
    );
}

export function FinancialWaterfallChart({
    revenue,
    hostCost,
    isLoading,
    className,
}: FinancialWaterfallChartProps) {
    const grossProfit = revenue - hostCost;
    const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const chartData = useMemo(() => [
        {
            name: "Doanh thu",
            base: 0,
            delta: revenue,
            total: revenue,
            color: "#0B3C5D",
            label: formatCurrencyShort(revenue),
        },
        {
            name: "Giá vốn Host",
            base: grossProfit,
            delta: hostCost,
            total: -hostCost,
            color: "#dc2626",
            label: formatCurrencyShort(hostCost),
        },
        {
            name: "Lợi nhuận gộp",
            base: 0,
            delta: grossProfit,
            total: grossProfit,
            color: grossProfit >= 0 ? "#059669" : "#dc2626",
            label: `${formatCurrencyShort(grossProfit)} (${marginPct.toFixed(0)}%)`,
            marginPct,
        },
    ], [revenue, hostCost, grossProfit, marginPct]);

    if (isLoading) {
        return (
            <div className={cn("h-[280px] flex items-center justify-center", className)}>
                <div className="w-full h-full dv2-skeleton" />
            </div>
        );
    }

    return (
        <div className={cn("dv2-chart-interactive h-[280px]", className)}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={chartData}
                    margin={{ top: 24, right: 16, left: 0, bottom: 5 }}
                    barGap={0}
                    barSize={72}
                >
                    <defs>
                        <linearGradient id="wf-revenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#334155" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#0B3C5D" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="wf-cost" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#dc2626" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="wf-profit-pos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="wf-profit-neg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#991b1b" stopOpacity={0.85} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={formatCurrencyShort}
                        width={56}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.1)" }} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    {/* Invisible base */}
                    <Bar dataKey="base" stackId="waterfall" fill="transparent" />
                    {/* Visible delta */}
                    <Bar
                        dataKey="delta"
                        stackId="waterfall"
                        radius={[16, 16, 0, 0]}
                        animationDuration={900}
                        animationEasing="ease-out"
                        activeBar={{ stroke: "hsl(var(--primary))", strokeWidth: 2, fillOpacity: 1, style: { filter: "brightness(1.2) drop-shadow(0 4px 12px rgba(0,0,0,0.25))", transform: "scaleY(1.04)", transformOrigin: "bottom" } }}
                    >
                        <Cell fill="url(#wf-revenue)" />
                        <Cell fill="url(#wf-cost)" />
                        <Cell fill={grossProfit >= 0 ? "url(#wf-profit-pos)" : "url(#wf-profit-neg)"} />
                        <LabelList
                            dataKey="label"
                            position="top"
                            fill="hsl(var(--muted-foreground))"
                            fontSize={12}
                            fontWeight={600}
                        />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
