/**
 * ForecastExpensesChart — Horizontal stacked bar: Đã phát sinh / Dự kiến / Chi phí dịch vụ
 * Answers: "Bao nhiêu tiền sẽ chi?"
 *
 * Hover sync: hovering a legend item highlights the corresponding bar segment.
 */
import { useState } from "react";
import {
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
} from "recharts";
import { chartColors, CHART_OPACITY } from "../chartColors";
import { cn } from "@/lib/utils";

const fmt = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
};
const fmtFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);

const SEGMENTS = [
    { key: "confirmed", name: "Đã phát sinh", color: chartColors.outstanding, desc: "Chi phí đã phát sinh từ booking đã check-in, phải trả cho host. Đây là khoản nợ chắc chắn." },
    { key: "upcoming", name: "Dự kiến", color: chartColors.upcoming, desc: "Chi phí dự kiến từ booking tương lai, sẽ cần trả cho host khi khách check-in." },
    { key: "service", name: "Chi phí dịch vụ", color: chartColors.service, desc: "Chi phí vận hành như dọn dẹp, đón khách, bảo trì từ NCC dịch vụ đã quyết toán." },
] as const;

interface Props {
    confirmed: number;
    upcoming: number;
    service: number;
    isLoading?: boolean;
    className?: string;
    chartHeight?: number;
}

export function ForecastExpensesChart({ confirmed, upcoming, service, isLoading, className, chartHeight = 48 }: Props) {
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const vals = [confirmed, upcoming, service];
    const total = confirmed + upcoming + service;

    if (isLoading) {
        return <div className={`h-32 dv2-skeleton ${className || ""}`} />;
    }

    return (
        <div className={`dv2-chart-interactive ${className || ""}`}>
            {/* Summary */}
            <div className="flex items-baseline gap-3 mb-5">
                <span className="dv2-kpi-value text-2xl font-bold tabular-nums text-slate-900">{fmtFull(total)}</span>
                <span className="text-sm text-slate-500">tổng dự kiến chi</span>
            </div>

            {/* Chart — stacked bar */}
            <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={[{ confirmed, upcoming, service }]} layout="vertical" barSize={32}>
                    <defs>
                        <linearGradient id="fec-confirmed" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.7} />
                            <stop offset="100%" stopColor="#dc2626" stopOpacity={0.95} />
                        </linearGradient>
                        <linearGradient id="fec-upcoming" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.7} />
                            <stop offset="100%" stopColor="#b45309" stopOpacity={0.95} />
                        </linearGradient>
                        <linearGradient id="fec-service" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.45} />
                            <stop offset="100%" stopColor="#64748b" stopOpacity={0.7} />
                        </linearGradient>
                    </defs>
                    <XAxis type="number" hide domain={[0, total || 1]} />
                    <YAxis type="category" dataKey="name" hide />
                    <Bar dataKey="confirmed" stackId="a" radius={[8, 0, 0, 8]} fill="url(#fec-confirmed)"
                        fillOpacity={activeIdx !== null && activeIdx !== 0 ? 0.3 : 1}
                        animationDuration={800} animationEasing="ease-out"
                        onMouseEnter={() => setActiveIdx(0)} onMouseLeave={() => setActiveIdx(null)}
                        activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        style={{ cursor: "pointer", transition: "fill-opacity 150ms ease-out" }}
                    />
                    <Bar dataKey="upcoming" stackId="a" radius={0} fill="url(#fec-upcoming)"
                        fillOpacity={activeIdx !== null && activeIdx !== 1 ? 0.3 : 1}
                        animationDuration={800} animationEasing="ease-out" animationBegin={200}
                        onMouseEnter={() => setActiveIdx(1)} onMouseLeave={() => setActiveIdx(null)}
                        activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        style={{ cursor: "pointer", transition: "fill-opacity 150ms ease-out" }}
                    />
                    <Bar dataKey="service" stackId="a" radius={[0, 8, 8, 0]} fill="url(#fec-service)"
                        fillOpacity={activeIdx !== null && activeIdx !== 2 ? 0.2 : 1}
                        animationDuration={800} animationEasing="ease-out" animationBegin={400}
                        onMouseEnter={() => setActiveIdx(2)} onMouseLeave={() => setActiveIdx(null)}
                        activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        style={{ cursor: "pointer", transition: "fill-opacity 150ms ease-out" }}
                    />
                </BarChart>
            </ResponsiveContainer>

            {/* Legend — hover synced with bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
                {SEGMENTS.map((s, i) => {
                    const val = vals[i];
                    const isActive = activeIdx === i;
                    const isDimmed = activeIdx !== null && activeIdx !== i;
                    return (
                        <div
                            key={s.key}
                            className={cn(
                                "dv2-legend-item flex items-center gap-1.5 text-xs cursor-default transition-all duration-150",
                                isDimmed && "opacity-40",
                            )}
                            onMouseEnter={() => setActiveIdx(i)}
                            onMouseLeave={() => setActiveIdx(null)}
                        >
                            <span
                                className="w-2.5 h-2.5 rounded-sm shrink-0 transition-transform duration-150"
                                style={{
                                    background: s.color,
                                    opacity: i === 2 ? 0.65 : CHART_OPACITY,
                                    transform: isActive ? "scale(1.3)" : "scale(1)",
                                }}
                            />
                            <span className={cn("text-slate-500", isActive && "text-slate-900 font-medium")}>{s.name}</span>
                            <span className={cn("font-bold tabular-nums text-slate-900 ml-1", isActive && "text-sm")}>{fmt(val)}</span>
                        </div>
                    );
                })}
            </div>

            {/* Inline description on hover */}
            {activeIdx !== null && (
                <div className="mt-2 text-[10px] text-slate-400 leading-relaxed dv2-tooltip-enter">
                    {fmtFull(vals[activeIdx])} ({total > 0 ? ((vals[activeIdx] / total) * 100).toFixed(1) : "0"}%) — {SEGMENTS[activeIdx].desc}
                </div>
            )}
        </div>
    );
}
