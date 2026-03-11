/**
 * ForecastRevenueChart — Stacked horizontal bar: Đã cam kết / Khả năng cao / Dự kiến (OTA AR) / Dự kiến thu (booking mới)
 * Answers: "Bao nhiêu tiền sẽ về?"
 *
 * Hover sync: hovering a legend item highlights the corresponding bar segment.
 */
import { useState } from "react";
import {
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell,
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
    { key: "committed", name: "Đã cam kết", color: chartColors.committed, desc: "Payout OTA trạng thái PARTIAL — đã nhận một phần, chắc chắn sẽ về thêm. Tất cả payout PARTIAL chưa voided." },
    { key: "likely", name: "Khả năng cao", color: chartColors.likely, desc: "Payout OTA trạng thái PENDING — payout đã tạo, chờ OTA chuyển khoản. = \"Đang chuyển về\" trên trang OTA Payout." },
    { key: "expected", name: "Dự kiến (OTA AR)", color: chartColors.expected, desc: "Booking đã checkout nhưng OTA chưa tạo payout. = \"Chờ tạo payout\" trên trang OTA Payout." },
    { key: "hostDebtRevenue", name: "Dự kiến thu (booking mới)", color: "#6366f1", desc: "Doanh thu dự kiến từ các đặt phòng chưa nhận phòng có nợ host. Tiền sẽ thu được khi khách đến." },
] as const;

interface Props {
    committed: number;
    likely: number;
    expected: number;
    /** Expected revenue from future host-debt bookings (not yet checked in) */
    hostDebtRevenue?: number;
    isLoading?: boolean;
    className?: string;
    chartHeight?: number;
}

export function ForecastRevenueChart({ committed, likely, expected, hostDebtRevenue = 0, isLoading, className, chartHeight = 48 }: Props) {
    const [activeIdx, setActiveIdx] = useState<number | null>(null);
    const vals = [committed, likely, expected, hostDebtRevenue];
    const total = committed + likely + expected + hostDebtRevenue;

    if (isLoading) {
        return <div className={`h-32 dv2-skeleton ${className || ""}`} />;
    }

    return (
        <div className={`dv2-chart-interactive ${className || ""}`}>
            {/* Summary — animated value */}
            <div className="flex items-baseline gap-3 mb-5">
                <span className="dv2-kpi-value text-2xl font-bold tabular-nums text-slate-900">{fmtFull(total)}</span>
                <span className="text-sm text-slate-500">tổng dự kiến thu</span>
            </div>

            {/* Chart — single stacked bar */}
            <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={[{ committed, likely, expected, hostDebtRevenue }]} layout="vertical" barSize={32}>
                    <defs>
                        <linearGradient id="frc-committed" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.7} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.95} />
                        </linearGradient>
                        <linearGradient id="frc-likely" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.7} />
                            <stop offset="100%" stopColor="#1e3a5f" stopOpacity={0.95} />
                        </linearGradient>
                        <linearGradient id="frc-expected" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#0891b2" stopOpacity={0.75} />
                        </linearGradient>
                        <linearGradient id="frc-hostDebt" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#a5b4fc" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.75} />
                        </linearGradient>
                    </defs>
                    <XAxis type="number" hide domain={[0, total || 1]} />
                    <YAxis type="category" dataKey="name" hide />
                    <Bar dataKey="committed" stackId="a" radius={[8, 0, 0, 8]} fill="url(#frc-committed)"
                        fillOpacity={activeIdx !== null && activeIdx !== 0 ? 0.3 : 1}
                        animationDuration={800} animationEasing="ease-out"
                        onMouseEnter={() => setActiveIdx(0)} onMouseLeave={() => setActiveIdx(null)}
                        activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        style={{ cursor: "pointer", transition: "fill-opacity 150ms ease-out" }}
                    />
                    <Bar dataKey="likely" stackId="a" radius={0} fill="url(#frc-likely)"
                        fillOpacity={activeIdx !== null && activeIdx !== 1 ? 0.3 : 1}
                        animationDuration={800} animationEasing="ease-out" animationBegin={200}
                        onMouseEnter={() => setActiveIdx(1)} onMouseLeave={() => setActiveIdx(null)}
                        activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        style={{ cursor: "pointer", transition: "fill-opacity 150ms ease-out" }}
                    />
                    <Bar dataKey="expected" stackId="a" radius={0} fill="url(#frc-expected)"
                        fillOpacity={activeIdx !== null && activeIdx !== 2 ? 0.3 : 1}
                        animationDuration={800} animationEasing="ease-out" animationBegin={400}
                        onMouseEnter={() => setActiveIdx(2)} onMouseLeave={() => setActiveIdx(null)}
                        activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                        style={{ cursor: "pointer", transition: "fill-opacity 150ms ease-out" }}
                    />
                    {hostDebtRevenue > 0 && (
                        <Bar dataKey="hostDebtRevenue" stackId="a" radius={[0, 8, 8, 0]} fill="url(#frc-hostDebt)"
                            fillOpacity={activeIdx !== null && activeIdx !== 3 ? 0.3 : 1}
                            animationDuration={800} animationEasing="ease-out" animationBegin={600}
                            onMouseEnter={() => setActiveIdx(3)} onMouseLeave={() => setActiveIdx(null)}
                            activeBar={{ fillOpacity: 1, style: { filter: "brightness(1.25) drop-shadow(0 4px 10px rgba(0,0,0,0.2))" } }}
                            style={{ cursor: "pointer", transition: "fill-opacity 150ms ease-out" }}
                        />
                    )}
                </BarChart>
            </ResponsiveContainer>

            {/* Legend — hover synced with bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
                {SEGMENTS.map((s, i) => {
                    const val = vals[i];
                    if (i === 3 && val === 0) return null; // Hide hostDebtRevenue if zero
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
                                className="w-3 h-3 rounded-sm shrink-0 transition-transform duration-150"
                                style={{
                                    background: s.color,
                                    opacity: i >= 2 ? 0.7 : CHART_OPACITY,
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
