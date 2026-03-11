import { cn } from "@/lib/utils";
import type { PivotRankingRow } from "@/modules/analytics/types";

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `đ${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `đ${(v / 1_000_000).toFixed(1)}M`;
    return `đ${(v / 1_000).toFixed(0)}K`;
};

interface OtaPerformanceTableProps {
    data: PivotRankingRow[];
    isLoading?: boolean;
    className?: string;
}

export function OtaPerformanceTable({
    data,
    isLoading,
    className,
}: OtaPerformanceTableProps) {
    if (isLoading) {
        return (
            <div className={cn("space-y-3", className)}>
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/20" style={{ animationDelay: `${i * 100}ms` }} />
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
                        <th className="text-left font-medium pb-3 px-3">Kênh</th>
                        <th className="text-right font-medium pb-3 px-3">Doanh thu</th>
                        <th className="text-right font-medium pb-3 px-3">Bookings</th>
                        <th className="text-right font-medium pb-3 px-3 hidden md:table-cell">Room Nights</th>
                        <th className="text-right font-medium pb-3 px-3 hidden lg:table-cell">ADR</th>
                        <th className="text-right font-medium pb-3 px-3">Tỷ trọng</th>
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
                        const adr = row.bookingsCount > 0
                            ? row.revenueTotal / row.bookingsCount
                            : 0;
                        return (
                            <tr
                                key={row.pivotId}
                                className="border-t border-border/30 transition-colors hover:bg-muted/20"
                                style={{ animationDelay: `${i * 60}ms` }}
                            >
                                <td className="py-3 px-3 font-medium text-foreground">
                                    <div className="flex items-center gap-2.5">
                                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{
                                            backgroundColor: ["#0B3C5D", "#ea580c", "#059669", "#6366f1", "#f59e0b"][i % 5]
                                        }} />
                                        {row.pivotName}
                                    </div>
                                </td>
                                <td className="py-3 px-3 text-right">
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="tabular-nums font-medium">
                                            {formatCurrencyShort(row.revenueTotal)}
                                        </span>
                                        {/* Inline progress bar */}
                                        <div className="w-20 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-700 ease-out"
                                                style={{
                                                    width: `${barWidthPct}%`,
                                                    backgroundColor: ["#0B3C5D", "#ea580c", "#059669", "#6366f1", "#f59e0b"][i % 5],
                                                }}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-muted-foreground">
                                    {row.bookingsCount}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                                    {row.nightsTotal}
                                </td>
                                <td className="py-3 px-3 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
                                    {formatCurrencyShort(adr)}
                                </td>
                                <td className="py-3 px-3 text-right">
                                    <span className={cn(
                                        "inline-flex items-center justify-center min-w-[48px] px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums",
                                        i === 0
                                            ? "bg-primary/10 text-primary"
                                            : "bg-muted/40 text-muted-foreground"
                                    )}>
                                        {sharePct.toFixed(1)}%
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
