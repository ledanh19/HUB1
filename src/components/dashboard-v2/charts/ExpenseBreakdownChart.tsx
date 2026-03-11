/**
 * ExpenseBreakdownChart — Donut chart: Chi phí host / dịch vụ / dự kiến
 * Answers: "Tiền đang đi đâu?"
 * 
 * Hover sync: hovering a legend item highlights the corresponding donut sector,
 * and hovering a sector highlights the corresponding legend item.
 */
import { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from "recharts";
import { chartColors, CHART_OPACITY } from "../chartColors";

const fmtFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);
const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return `${(v / 1_000).toFixed(0)}K`;
};

const SEGMENTS = [
    { key: "hostIncurred", label: "Nợ host (đã phát sinh)", color: chartColors.hostCost, desc: "Tiền phải trả cho host từ booking đã check-in và ngày cung cấp phòng đã bắt đầu." },
    { key: "hostProjected", label: "Nợ host (dự kiến)", color: chartColors.upcomingCost, desc: "Tiền dự kiến trả cho host từ booking tương lai, có thể thay đổi nếu hủy." },
    { key: "serviceOut", label: "Dịch vụ đã quyết toán", color: chartColors.service, desc: "Nợ NCC dịch vụ đã finalize, phải trả." },
] as const;

// Active shape renderer — enlarged sector with glow
function renderActiveShape(props: any) {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
        <g>
            <Sector
                cx={cx} cy={cy}
                innerRadius={innerRadius - 3}
                outerRadius={outerRadius + 6}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
                fillOpacity={1}
                style={{ filter: `brightness(1.15) drop-shadow(0 4px 12px ${fill}55)` }}
            />
        </g>
    );
}

interface Props {
    hostIncurred: number;
    hostProjected: number;
    serviceOut: number;
    netExpected?: number;
    className?: string;
}

export function ExpenseBreakdownChart({ hostIncurred, hostProjected, serviceOut, netExpected, className }: Props) {
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const total = hostIncurred + hostProjected + serviceOut;
    const vals = [hostIncurred, hostProjected, serviceOut];

    const data = SEGMENTS.map((s, i) => ({
        name: s.label,
        value: vals[i],
        color: s.color,
    })).filter(d => d.value > 0);

    // Map filtered index back to SEGMENTS index for sync
    const filteredToSegIdx: number[] = [];
    SEGMENTS.forEach((s, i) => { if (vals[i] > 0) filteredToSegIdx.push(i); });

    return (
        <div className={`dv2-chart-interactive ${className || ""}`}>
            <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Donut — spin-in entrance */}
                <div className="dv2-donut relative w-[160px] h-[160px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <defs>
                                {data.map((d, i) => (
                                    <linearGradient key={`eb-grad-${i}`} id={`eb-grad-${i}`} x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor={d.color} stopOpacity={0.6} />
                                        <stop offset="100%" stopColor={d.color} stopOpacity={1} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <Pie
                                data={data}
                                cx="50%" cy="50%"
                                innerRadius={48} outerRadius={72}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="none"
                                animationDuration={900}
                                animationEasing="ease-out"
                                activeIndex={activeIdx !== null ? filteredToSegIdx.indexOf(activeIdx) : undefined}
                                activeShape={renderActiveShape}
                                onMouseLeave={() => setActiveIdx(null)}
                            >
                                {data.map((d, fi) => (
                                    <Cell
                                        key={d.name}
                                        fill={`url(#eb-grad-${fi})`}
                                        fillOpacity={activeIdx !== null && activeIdx !== filteredToSegIdx[fi] ? 0.3 : 1}
                                        style={{
                                            cursor: "pointer",
                                            transition: "fill-opacity 150ms ease-out",
                                        }}
                                        onMouseEnter={() => setActiveIdx(filteredToSegIdx[fi])}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={() => null} />
                        </PieChart>
                    </ResponsiveContainer>
                    {/* Center label — shows hovered item or total */}
                    <div className="dv2-donut-center absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-slate-500">
                            {activeIdx !== null ? SEGMENTS[activeIdx].label.split(" ")[0] : "Tổng chi"}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                            {activeIdx !== null ? fmtShort(vals[activeIdx]) : fmtShort(total)}
                        </span>
                    </div>
                </div>
                {/* Legend — hover synced with donut */}
                <div className="w-full sm:flex-1 space-y-2 sm:space-y-3">
                    {SEGMENTS.map((s, i) => {
                        const val = vals[i];
                        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
                        const isActive = activeIdx === i;
                        const isDimmed = activeIdx !== null && activeIdx !== i;

                        return (
                            <div
                                key={s.key}
                                className={`dv2-legend-item flex items-center justify-between text-xs rounded-lg px-2 py-1.5 -mx-2 cursor-default transition-all duration-150 ease-out ${isActive ? "bg-slate-100 shadow-sm" : ""} ${isDimmed ? "opacity-40" : ""}`}
                                onMouseEnter={() => setActiveIdx(i)}
                                onMouseLeave={() => setActiveIdx(null)}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span
                                        className="w-2.5 h-2.5 rounded-sm shrink-0 transition-transform duration-150"
                                        style={{
                                            background: s.color,
                                            opacity: CHART_OPACITY,
                                            transform: isActive ? "scale(1.4)" : "scale(1)",
                                        }}
                                    />
                                    <span className={`truncate ${isActive ? "text-slate-900 font-medium" : "text-slate-500"}`}>{s.label}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                    <span className={`font-semibold tabular-nums text-slate-900 ${isActive ? "text-sm" : ""}`}>{fmtShort(val)}</span>
                                    <span className="text-slate-400">{pct}%</span>
                                </div>
                            </div>
                        );
                    })}
                    {netExpected !== undefined && (
                        <div className="dv2-insight pt-2 border-t border-slate-200">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">Lãi ròng (Thu − Chi)</span>
                                <span className={`font-bold tabular-nums ${netExpected >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                    {fmtFull(netExpected)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
