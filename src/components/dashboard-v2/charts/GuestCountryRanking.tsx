/**
 * GuestCountryRanking — Top 10 countries by booking volume.
 *
 * Desktop: compact list with flag, name, count, share.
 * Mobile: card-style layout.
 *
 * NON-BREAKING: Standalone display component.
 */

import { memo } from "react";
import type { GuestOriginRow } from "@/hooks/useGuestOriginAnalytics";
import { getCountryName, getFlag } from "@/lib/countryMapping";

interface GuestCountryRankingProps {
    data: GuestOriginRow[];
    totalBookings: number;
    isMobile?: boolean;
    className?: string;
    hoveredIso3?: string | null;
    onHoverChange?: (iso3: string | null) => void;
}

/** Format currency in VND (compact) */
function formatADR(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `₫${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `₫${(value / 1_000).toFixed(0)}K`;
    return `₫${value.toFixed(0)}`;
}

function GuestCountryRankingInner({
    data,
    totalBookings,
    isMobile = false,
    className,
    hoveredIso3,
    onHoverChange,
}: GuestCountryRankingProps) {
    const top10 = data.slice(0, 10);

    if (top10.length === 0) {
        return (
            <div className={`text-sm text-muted-foreground text-center py-8 ${className || ""}`}>
                Chưa có dữ liệu quốc tịch
            </div>
        );
    }

    // Insight: top country share
    const topCountry = top10[0];
    const insightText = topCountry
        ? `${getCountryName(topCountry.iso3)} chiếm ${topCountry.share.toFixed(0)}% tổng số đặt phòng.`
        : null;

    if (isMobile) {
        return (
            <div className={`space-y-2 ${className || ""}`}>
                {top10.map((row, idx) => (
                    <div
                        key={row.iso3}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${hoveredIso3 === row.iso3 ? "bg-muted/60 ring-1 ring-border" : "bg-muted/30"
                            }`}
                        onMouseEnter={() => onHoverChange?.(row.iso3)}
                        onMouseLeave={() => onHoverChange?.(null)}
                    >
                        <span className="text-xs font-medium text-muted-foreground w-5 text-right tabular-nums">
                            {idx + 1}
                        </span>
                        <span className="text-lg leading-none w-6 flex justify-center">
                            {getFlag(row.iso3) ? (
                                <img
                                    src={getFlag(row.iso3) as string}
                                    width={24}
                                    alt={row.iso3}
                                    className="rounded shadow-sm"
                                    loading="lazy"
                                />
                            ) : (
                                "🏳️"
                            )}
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                                {getCountryName(row.iso3)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {row.bookings.toLocaleString()} đặt phòng
                            </p>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground tabular-nums">
                            {row.share.toFixed(1)}%
                        </span>
                    </div>
                ))}

                {insightText && (
                    <p className="text-xs text-muted-foreground px-2 pt-1 italic">
                        💡 {insightText}
                    </p>
                )}
            </div>
        );
    }

    // Desktop: clean table-like list
    return (
        <div className={`space-y-0 ${className || ""}`}>
            {/* Header row */}
            <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-2 px-1">
                <span className="w-5 text-right">#</span>
                <span className="w-6" />
                <span className="flex-1">Quốc gia</span>
                <span className="w-16 text-right">Đặt phòng</span>
                <span className="w-12 text-right">Tỷ lệ</span>
                <span className="w-16 text-right">ADR</span>
            </div>

            {top10.map((row, idx) => {
                // Bar width for visual weight
                const maxBookings = top10[0]?.bookings || 1;
                const barWidth = (row.bookings / maxBookings) * 100;

                return (
                    <div
                        key={row.iso3}
                        className={`group relative flex items-center gap-2 py-1.5 px-1 rounded-lg transition-colors cursor-default ${hoveredIso3 === row.iso3 ? "bg-muted/50 ring-1 ring-border/50" : "hover:bg-muted/30"
                            }`}
                        onMouseEnter={() => onHoverChange?.(row.iso3)}
                        onMouseLeave={() => onHoverChange?.(null)}
                    >
                        {/* Background bar — subtle progress indicator */}
                        <div
                            className="absolute inset-y-0 left-0 bg-primary/5 rounded-lg transition-all"
                            style={{ width: `${barWidth}%` }}
                        />

                        <span className="relative z-10 text-xs font-medium text-muted-foreground w-5 text-right tabular-nums">
                            {idx + 1}
                        </span>
                        <span className="relative z-10 text-base leading-none w-6 text-center flex justify-center">
                            {getFlag(row.iso3) ? (
                                <img
                                    src={getFlag(row.iso3) as string}
                                    width={20}
                                    alt={row.iso3}
                                    className="rounded shadow-sm"
                                    loading="lazy"
                                />
                            ) : (
                                "🏳️"
                            )}
                        </span>
                        <span className="relative z-10 flex-1 text-sm font-medium text-foreground truncate pl-2">
                            {getCountryName(row.iso3)}
                        </span>
                        <span className="relative z-10 w-16 text-right text-sm font-semibold tabular-nums text-foreground">
                            {row.bookings.toLocaleString()}
                        </span>
                        <span className="relative z-10 w-12 text-right text-xs text-muted-foreground tabular-nums">
                            {row.share.toFixed(1)}%
                        </span>
                        <span className="relative z-10 w-16 text-right text-xs text-muted-foreground tabular-nums">
                            {formatADR(row.adr)}
                        </span>
                    </div>
                );
            })}

            {insightText && (
                <p className="text-xs text-muted-foreground px-1 pt-3 italic">
                    💡 {insightText}
                </p>
            )}
        </div>
    );
}

export const GuestCountryRanking = memo(GuestCountryRankingInner);
