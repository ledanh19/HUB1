import { cn } from "@/lib/utils";
import type { PivotRankingRow } from "@/modules/analytics/types";

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `đ${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `đ${(v / 1_000_000).toFixed(1)}M`;
    return `đ${(v / 1_000).toFixed(0)}K`;
};

interface PropertyPerformanceTableProps {
    data: PivotRankingRow[];
    comparisonData?: PivotRankingRow[];
    isLoading?: boolean;
    className?: string;
}

export function PropertyPerformanceTable({
    data,
    comparisonData,
    isLoading,
    className,
}: PropertyPerformanceTableProps) {
    if (isLoading) {
        return (
            <div className={cn("space-y-3 p-4", className)}>
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/20" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div className={cn("flex items-center justify-center py-12 text-sm text-muted-foreground", className)}>
                Chưa có dữ liệu
            </div>
        );
    }

    const totalRevenue = data.reduce((sum, r) => sum + r.revenueTotal, 0);
    const maxRevenue = Math.max(...data.map((r) => r.revenueTotal));

    return (
        <div className={cn("overflow-x-auto", className)}>
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs text-muted-foreground">
                        <th className="text-left font-medium pb-3 px-4 pt-1">Chỗ nghỉ</th>
                        <th className="text-right font-medium pb-3 px-4 pt-1">Doanh thu</th>
                        <th className="text-right font-medium pb-3 px-4 pt-1 hidden md:table-cell">ADR</th>
                        <th className="text-right font-medium pb-3 px-4 pt-1 hidden lg:table-cell">Bookings</th>
                        <th className="text-right font-medium pb-3 px-4 pt-1 hidden lg:table-cell">Nights</th>
                        <th className="text-right font-medium pb-3 px-4 pt-1">Tỷ trọng</th>
                        <th className="text-right font-medium pb-3 px-4 pt-1">Trend</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => {
                        const sharePct = totalRevenue > 0
                            ? ((row.revenueTotal / totalRevenue) * 100)
                            : 0;
                        const barWidthPct = maxRevenue > 0
                            ? ((row.revenueTotal / maxRevenue) * 100)
                            : 0;
                        const adr = row.nightsTotal > 0
                            ? row.revenueTotal / row.nightsTotal
                            : 0;
                        return (
                            <tr
                                key={row.pivotId}
                                className={cn(
                                    "border-t border-border/30 transition-colors hover:bg-muted/20",
                                    i === 0 && "bg-primary/[0.03]"
                                )}
                            >
                                <td className="py-3 px-4">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-medium text-foreground">{row.pivotName}</span>
                                        {/* Revenue bar visualization */}
                                        <div className="w-full max-w-[120px] h-1.5 bg-muted/20 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-700 ease-out"
                                                style={{
                                                    width: `${barWidthPct}%`,
                                                    backgroundColor: i === 0 ? "#0B3C5D" : i < 3 ? "#0B3C5D99" : "#94a3b8",
                                                }}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums font-semibold">
                                    {formatCurrencyShort(row.revenueTotal)}
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                                    {formatCurrencyShort(adr)}
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
                                    {row.bookingsCount}
                                </td>
                                <td className="py-3 px-4 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
                                    {row.nightsTotal}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <span className={cn(
                                        "inline-flex items-center justify-center min-w-[48px] px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums",
                                        i === 0
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-muted/40 text-muted-foreground"
                                    )}>
                                        {sharePct.toFixed(1)}%
                                    </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    {(() => {
                                        const comp = comparisonData?.find(c => c.pivotId === row.pivotId);
                                        const trendPct = comp && comp.revenueTotal > 0
                                            ? ((row.revenueTotal - comp.revenueTotal) / comp.revenueTotal) * 100
                                            : (row.revenueTotal > 0 && (!comp || comp.revenueTotal === 0) ? 100 : null);
                                        return trendPct != null ? (
                                            <span className={cn(
                                                "inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full",
                                                trendPct > 0 ? "text-emerald-700 bg-emerald-50" : trendPct < 0 ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted/40"
                                            )}>
                                                {trendPct > 0 ? "▲" : trendPct < 0 ? "▼" : ""}
                                                {trendPct > 0 ? "+" : ""}{trendPct.toFixed(1)}%
                                            </span>
                                        ) : null;
                                    })()}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
