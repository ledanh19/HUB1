import { useMemo } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { chartColors, CHART_OPACITY } from "../chartColors";

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

interface ForecastLineChartProps {
    /** Committed = partial OTA payouts */
    committed: number;
    /** Likely = pending OTA payouts */
    likely: number;
    /** Expected = OTA AR (outstanding) */
    expected: number;
    isLoading?: boolean;
    className?: string;
}

// Custom tooltip
function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="dv2-tooltip-enter rounded-xl bg-slate-900 text-white px-4 py-3 shadow-2xl border border-white/10">
            {payload.map((entry: any) => (
                <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
                    <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: entry.fill }}
                    />
                    <span className="text-xs text-slate-300">
                        {entry.dataKey === "committed"
                            ? "Đã cam kết (PARTIAL)"
                            : entry.dataKey === "likely"
                                ? "Khả năng cao (PENDING)"
                                : "Dự kiến (AR)"}
                    </span>
                    <span className="text-xs font-semibold ml-auto tabular-nums">
                        {formatCurrencyFull(entry.value)}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function ForecastLineChart({
    committed,
    likely,
    expected,
    isLoading,
    className,
}: ForecastLineChartProps) {
    const total = committed + likely + expected;

    const chartData = useMemo(
        () => [
            {
                label: "30 ngày tới",
                committed,
                likely,
                expected,
            },
        ],
        [committed, likely, expected]
    );

    if (isLoading) {
        return (
            <div className={cn("h-[160px] flex items-center justify-center", className)}>
                <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className={cn("dv2-chart-interactive space-y-4", className)}>
            {/* Segmented progress bar — visual summary */}
            <div className="relative w-full h-8 bg-slate-100 rounded-full overflow-hidden flex">
                {total > 0 && (
                    <>
                        {committed > 0 && (
                            <div
                                className="h-full transition-all duration-700 ease-out flex items-center justify-center"
                                style={{
                                    width: `${(committed / total) * 100}%`,
                                    background: "linear-gradient(90deg, #34d399, #059669)",
                                    opacity: CHART_OPACITY,
                                }}
                            >
                                {committed / total > 0.08 && (
                                    <span className="text-[10px] font-bold text-white tabular-nums">
                                        {formatCurrencyShort(committed)}
                                    </span>
                                )}
                            </div>
                        )}
                        {likely > 0 && (
                            <div
                                className="h-full transition-all duration-700 ease-out flex items-center justify-center"
                                style={{
                                    width: `${(likely / total) * 100}%`,
                                    background: "linear-gradient(90deg, #60a5fa, #1e3a5f)",
                                    opacity: CHART_OPACITY,
                                }}
                            >
                                {likely / total > 0.08 && (
                                    <span className="text-[10px] font-bold text-white tabular-nums">
                                        {formatCurrencyShort(likely)}
                                    </span>
                                )}
                            </div>
                        )}
                        {expected > 0 && (
                            <div
                                className="h-full transition-all duration-700 ease-out flex items-center justify-center"
                                style={{
                                    width: `${(expected / total) * 100}%`,
                                    background: "linear-gradient(90deg, #67e8f9, #0891b2)",
                                    opacity: 0.4,
                                }}
                            >
                                {expected / total > 0.12 && (
                                    <span className="text-[10px] font-bold text-slate-700 tabular-nums">
                                        {formatCurrencyShort(expected)}
                                    </span>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Stacked bar chart — detailed visualization */}
            <div className="dv2-chart-interactive h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
                        barSize={36}
                    >
                        <defs>
                            <linearGradient id="flc-committed" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#34d399" stopOpacity={0.7} />
                                <stop offset="100%" stopColor="#059669" stopOpacity={0.95} />
                            </linearGradient>
                            <linearGradient id="flc-likely" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.7} />
                                <stop offset="100%" stopColor="#1e3a5f" stopOpacity={0.95} />
                            </linearGradient>
                            <linearGradient id="flc-expected" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="#0891b2" stopOpacity={0.6} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            type="number"
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={formatCurrencyShort}
                        />
                        <YAxis
                            type="category"
                            dataKey="label"
                            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            width={100}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/0.1)" }} />
                        <Bar
                            dataKey="committed"
                            stackId="forecast"
                            fill="url(#flc-committed)"
                            radius={[0, 0, 0, 0]}
                            name="committed"
                            animationDuration={600}
                            animationEasing="ease-out"
                            activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        />
                        <Bar
                            dataKey="likely"
                            stackId="forecast"
                            fill="url(#flc-likely)"
                            name="likely"
                            animationDuration={800}
                            animationEasing="ease-out"
                            activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        />
                        <Bar
                            dataKey="expected"
                            stackId="forecast"
                            fill="url(#flc-expected)"
                            radius={[0, 4, 4, 0]}
                            name="expected"
                            animationDuration={1000}
                            animationEasing="ease-out"
                            activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6">
                <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-3 rounded-sm" style={{ background: chartColors.committed, opacity: CHART_OPACITY }} />
                    <span className="text-slate-500">Committed</span>
                    <span className="font-semibold tabular-nums text-slate-900">{formatCurrencyShort(committed)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-3 rounded-sm" style={{ background: chartColors.likely, opacity: CHART_OPACITY }} />
                    <span className="text-slate-500">Likely</span>
                    <span className="font-semibold tabular-nums text-slate-900">{formatCurrencyShort(likely)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                    <div className="h-3 w-3 rounded-sm" style={{ background: chartColors.expected, opacity: 0.4 }} />
                    <span className="text-slate-500">Expected</span>
                    <span className="font-semibold tabular-nums text-slate-900">{formatCurrencyShort(expected)}</span>
                </div>
            </div>
        </div>
    );
}
