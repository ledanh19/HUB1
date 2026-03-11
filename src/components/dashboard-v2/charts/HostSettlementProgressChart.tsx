/**
 * HostSettlementProgressChart — Stacked progress bar: Đã trả / Đã phát sinh / Dự kiến
 * Answers: "Host được trả đúng hạn không?"
 * 
 * Hover sync: hovering a legend row highlights the corresponding progress segment,
 * and hovering a segment highlights the corresponding legend row.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { chartColors, CHART_OPACITY } from "../chartColors";

const fmtFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);
const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return `${(v / 1_000).toFixed(0)}K`;
};

const SEGMENTS = [
    { key: "paid", label: "Đã trả", color: chartColors.paid, gradient: "linear-gradient(90deg, #34d399 0%, #059669 100%)", desc: "Số tiền đã thanh toán cho host." },
    { key: "outstanding", label: "Đã phát sinh", color: chartColors.outstanding, gradient: "linear-gradient(90deg, #f87171 0%, #dc2626 100%)", desc: "Nợ host từ booking đã check-in + supply đã bắt đầu. Cần trả." },
    { key: "upcoming", label: "Dự kiến", color: chartColors.upcoming, gradient: "linear-gradient(90deg, #fbbf24 0%, #b45309 100%)", desc: "Nợ host từ booking tương lai, có thể thay đổi nếu hủy." },
] as const;

interface Props {
    paid: number;
    outstanding: number;
    upcoming: number;
    totalPayable: number;
    actualUnsettled?: number;
    actualCount?: number;
    expectedCount?: number;
    className?: string;
}

export function HostSettlementProgressChart({
    paid, outstanding, upcoming, totalPayable,
    actualUnsettled, actualCount, expectedCount, className
}: Props) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const total = paid + outstanding + upcoming;
    const paidPct = total > 0 ? (paid / total) * 100 : 0;
    const outPct = total > 0 ? (outstanding / total) * 100 : 0;
    const upPct = total > 0 ? (upcoming / total) * 100 : 0;
    const pcts = [paidPct, outPct, upPct];
    const vals = [paid, outstanding, upcoming];

    return (
        <div className={className}>
            {/* Header stats — animated value */}
            <div className="flex items-baseline gap-2 mb-4">
                <span className="dv2-kpi-value text-2xl font-bold tabular-nums text-slate-900">{fmtShort(total)}</span>
                <span className="text-xs text-slate-500">tổng phát sinh</span>
            </div>

            {/* Progress bar — segments with hover sync */}
            <div className="relative h-7 rounded-full overflow-visible bg-slate-100 flex">
                {pcts.map((pct, i) => pct > 0 && (
                    <div
                        key={SEGMENTS[i].key}
                        className={cn(
                            "dv2-progress-seg h-full relative group",
                            hoveredIdx !== null && hoveredIdx !== i && "opacity-40"
                        )}
                        style={{
                            width: `${pct}%`,
                            background: hoveredIdx === i ? SEGMENTS[i].gradient : SEGMENTS[i].gradient,
                            opacity: hoveredIdx === i ? 1 : (hoveredIdx !== null ? undefined : CHART_OPACITY),
                            filter: hoveredIdx === i ? "brightness(1.2)" : undefined,
                            transform: hoveredIdx === i ? "scaleY(1.3) translateY(-2px)" : undefined,
                            zIndex: hoveredIdx === i ? 10 : undefined,
                            borderRadius: hoveredIdx === i ? "4px" : undefined,
                            boxShadow: hoveredIdx === i ? `0 6px 16px ${SEGMENTS[i].color}66` : undefined,
                            transition: "all 150ms ease-out",
                        }}
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                    >
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            {pct.toFixed(0)}%
                        </div>
                    </div>
                ))}
            </div>

            {/* Legend — hover synced with progress bar */}
            <div className="mt-4 space-y-2 overflow-visible relative z-30">
                {SEGMENTS.map((s, i) => {
                    const val = vals[i];
                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
                    const isActive = hoveredIdx === i;
                    const isDimmed = hoveredIdx !== null && hoveredIdx !== i;

                    return (
                        <div
                            key={s.key}
                            className={cn(
                                "dv2-legend-item relative flex items-center justify-between text-xs group cursor-default rounded-lg px-2 py-1.5 -mx-2",
                                "transition-all duration-150 ease-out",
                                isActive && "bg-slate-100 shadow-sm",
                                isDimmed && "opacity-40",
                            )}
                            onMouseEnter={() => setHoveredIdx(i)}
                            onMouseLeave={() => setHoveredIdx(null)}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className="w-2.5 h-2.5 rounded-sm transition-transform duration-150"
                                    style={{
                                        background: s.color,
                                        opacity: CHART_OPACITY,
                                        transform: isActive ? "scale(1.4)" : "scale(1)",
                                    }}
                                />
                                <span className={cn("text-slate-500", isActive && "text-slate-900 font-medium")}>{s.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "font-semibold tabular-nums",
                                    isActive ? "text-slate-900 text-sm" : "text-slate-900"
                                )}>{fmtShort(val)}</span>
                                <span className="text-slate-400 w-10 text-right">{pct}%</span>
                            </div>
                            {/* Inline description on hover */}
                            {isActive && (
                                <div className="w-full mt-1 text-[10px] text-slate-400 leading-relaxed pl-[18px] dv2-tooltip-enter">
                                    {s.desc}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
