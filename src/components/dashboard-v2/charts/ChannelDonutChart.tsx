import { useMemo, useState } from "react";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ChannelShareRow } from "@/modules/analytics/types";
import { channelColors, FALLBACK_CHANNEL_COLORS, CHART_OPACITY } from "../chartColors";
import { OtaLogo } from "@/components/ui/ota-badge";

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `đ${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `đ${(v / 1_000_000).toFixed(1)}M`;
    return `đ${(v / 1_000).toFixed(0)}K`;
};

interface ChannelDonutChartProps {
    data: ChannelShareRow[];
    isLoading?: boolean;
    /** Extra financial metrics to show beside the donut */
    cashIn?: number;
    cashOut?: number;
    netCash?: number;
    totalRevenue?: number;
    className?: string;
}

export function ChannelDonutChart({
    data,
    isLoading,
    cashIn,
    cashOut,
    netCash,
    totalRevenue: totalRevProp,
    className,
}: ChannelDonutChartProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const chartData = useMemo(
        () =>
            data.map((row, i) => ({
                name: row.channelName,
                value: row.revenueTotal,
                sharePct: row.sharePct,
                color:
                    channelColors[row.channelName] ??
                    FALLBACK_CHANNEL_COLORS[i % FALLBACK_CHANNEL_COLORS.length],
            })),
        [data]
    );

    const totalRevenue = totalRevProp ?? data.reduce((s, r) => s + r.revenueTotal, 0);
    const displayItem = hoveredIndex !== null ? chartData[hoveredIndex] : null;

    if (isLoading) {
        return (
            <div className={cn("h-[280px] flex items-center justify-center", className)}>
                <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (chartData.length === 0) {
        return (
            <div className={cn("h-[280px] flex items-center justify-center text-sm text-slate-500", className)}>
                Chưa có dữ liệu kênh
            </div>
        );
    }

    return (
        <div className={cn("dv2-chart-interactive flex flex-col", className)}>
            {/* Donut + Summary side by side */}
            <div className="flex items-center gap-4">
                {/* Donut */}
                <div className="dv2-donut relative w-[180px] h-[180px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <defs>
                                {chartData.map((entry, index) => (
                                    <linearGradient key={`ch-grad-${index}`} id={`ch-grad-${index}`} x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor={entry.color} stopOpacity={0.6} />
                                        <stop offset="100%" stopColor={entry.color} stopOpacity={1} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={82}
                                paddingAngle={2}
                                dataKey="value"
                                onMouseLeave={() => setHoveredIndex(null)}
                                animationBegin={0}
                                animationDuration={900}
                                animationEasing="ease-out"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={entry.name}
                                        fill={`url(#ch-grad-${index})`}
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
                    {/* Center label */}
                    <div className="dv2-donut-center absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                            {displayItem ? displayItem.name : "Doanh thu"}
                        </span>
                        <span className="text-lg font-bold tabular-nums text-slate-900">
                            {displayItem
                                ? formatCurrencyShort(displayItem.value)
                                : formatCurrencyShort(totalRevenue)}
                        </span>
                        {displayItem && (
                            <span className="text-[10px] font-semibold tabular-nums text-slate-400">
                                {displayItem.sharePct.toFixed(1)}%
                            </span>
                        )}
                    </div>
                </div>

                {/* Summary metrics */}
                <div className="space-y-2.5 text-sm min-w-0">
                    {cashIn !== undefined && (
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: "#16A34A", opacity: CHART_OPACITY }} />
                            <span className="text-slate-500">Tiền thu</span>
                        </div>
                    )}
                    {netCash !== undefined && (
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: "#DC2626", opacity: CHART_OPACITY }} />
                            <span className="text-slate-500">Dòng tiền ròng</span>
                            <span className="font-semibold tabular-nums ml-auto text-slate-900">
                                {formatCurrencyShort(netCash)}
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: "#2563EB", opacity: CHART_OPACITY }} />
                        <span className="text-slate-500">Doanh thu</span>
                    </div>
                </div>
            </div>

            {/* Legend — grid layout with OTA icons */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                {chartData.map((item, i) => (
                    <div
                        key={item.name}
                        className={cn(
                            "dv2-legend-item flex items-center gap-1.5 text-xs cursor-pointer transition-all duration-200",
                            hoveredIndex !== null && hoveredIndex !== i && "opacity-40"
                        )}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                    >
                        <OtaLogo source={item.name} size="xs" />
                        <span className="text-slate-500 truncate">{item.name}</span>
                        <span className="font-semibold tabular-nums ml-auto text-slate-900">{item.sharePct.toFixed(0)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
