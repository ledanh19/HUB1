/**
 * HostRankingChart — Host ranking by segment cost (room + extra charges).
 *
 * Features:
 * - Horizontal bar chart with stacked room cost + extra charges
 * - Trend % badge per host vs previous period
 * - Top 10 hosts
 * - Follows AnalyticsCard styling pattern
 */

import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import type { HostRankingRow } from "@/hooks/dashboard/useHostRanking";

// ── Colors ────────────────────────────────────────────────────────────────────

const ROOM_COLOR = "#2563EB";
const EXTRA_COLOR = "#7C3AED";

// ── Formatters ────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) =>
    "₫" + new Intl.NumberFormat("vi-VN").format(Math.round(amount));

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return `${(v / 1_000).toFixed(0)}K`;
};

// ── Trend Badge ───────────────────────────────────────────────────────────────

function TrendBadge({ pct }: { pct: number | null }) {
    if (pct === null) return null;
    const isPositive = pct > 0;
    const isZero = Math.abs(pct) < 0.5;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded",
                isZero && "text-muted-foreground bg-muted/50",
                !isZero && isPositive && "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30",
                !isZero && !isPositive && "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/30",
            )}
        >
            {isZero ? "—" : isPositive ? "▲" : "▼"}
            {!isZero && `${Math.abs(pct).toFixed(0)}%`}
        </span>
    );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function HostTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
            <p className="font-semibold mb-1">{data.partnerName}</p>
            <div className="space-y-0.5 text-muted-foreground">
                <p>
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ backgroundColor: ROOM_COLOR }} />
                    Tiền phòng: <span className="font-medium text-foreground">{formatCurrency(data.roomCost)}</span>
                </p>
                <p>
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-1" style={{ backgroundColor: EXTRA_COLOR }} />
                    Phụ phí: <span className="font-medium text-foreground">{formatCurrency(data.extraCharges)}</span>
                </p>
                <p className="pt-1 border-t border-border/50">
                    Tổng: <span className="font-semibold text-foreground">{formatCurrency(data.totalCost)}</span>
                    {data.trendPct !== null && (
                        <span className="ml-2"><TrendBadge pct={data.trendPct} /></span>
                    )}
                </p>
                <p>Segments: <span className="font-medium text-foreground">{data.segmentCount}</span></p>
            </div>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface HostRankingChartProps {
    hostRanking: HostRankingRow[];
    isLoading: boolean;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function HostRankingChart({ hostRanking, isLoading }: HostRankingChartProps) {
    const isMobile = useIsMobile();
    const maxLen = isMobile ? 12 : 20;
    const chartData = useMemo(() =>
        hostRanking.map(row => ({
            ...row,
            // Short name for axis — shorter on mobile
            label: row.partnerName.length > maxLen
                ? row.partnerName.slice(0, maxLen - 2) + "…"
                : row.partnerName,
        })),
        [hostRanking, maxLen]
    );

    // Total for share %
    const total = useMemo(() => hostRanking.reduce((s, r) => s + r.totalCost, 0), [hostRanking]);

    return (
        <div>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Xếp hạng Host
            </h3>

            {isLoading ? (
                <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        Đang tải...
                    </div>
                </div>
            ) : chartData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                    Chưa có dữ liệu host
                </div>
            ) : (
                <>
                    {/* Stacked horizontal bar chart */}
                    <div style={{ height: Math.max(250, chartData.length * (isMobile ? 36 : 40) + 40) }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                layout="vertical"
                                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                                <XAxis
                                    type="number"
                                    tickFormatter={formatCurrencyShort}
                                    tick={{ fontSize: isMobile ? 9 : 10, fill: "hsl(var(--muted-foreground))" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="label"
                                    width={isMobile ? 85 : 140}
                                    tick={{ fontSize: isMobile ? 10 : 11, fill: "hsl(var(--foreground))" }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <RechartsTooltip content={<HostTooltip />} />
                                <Legend
                                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                                    formatter={(value: string) =>
                                        value === "roomCost" ? "Tiền phòng" : "Phụ phí"
                                    }
                                />
                                <Bar
                                    dataKey="roomCost"
                                    stackId="cost"
                                    fill={ROOM_COLOR}
                                    fillOpacity={0.85}
                                    radius={[0, 0, 0, 0]}
                                    animationDuration={600}
                                />
                                <Bar
                                    dataKey="extraCharges"
                                    stackId="cost"
                                    fill={EXTRA_COLOR}
                                    fillOpacity={0.85}
                                    radius={[0, 4, 4, 0]}
                                    animationDuration={600}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Detail table */}
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border text-left text-muted-foreground">
                                    <th className="pb-2 font-medium">#</th>
                                    <th className="pb-2 font-medium">Host</th>
                                    <th className="pb-2 font-medium text-right">Tiền phòng</th>
                                    <th className="pb-2 font-medium text-right hidden sm:table-cell">Phụ phí</th>
                                    <th className="pb-2 font-medium text-right">Tổng</th>
                                    <th className="pb-2 font-medium text-right hidden sm:table-cell">Tỷ trọng</th>
                                    <th className="pb-2 font-medium text-right hidden md:table-cell">Segments</th>
                                    <th className="pb-2 font-medium text-right">Trend</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hostRanking.map((row, idx) => (
                                    <tr
                                        key={row.partnerId}
                                        className="border-b border-border/50 last:border-0 hover:bg-primary/5 transition-colors"
                                    >
                                        <td className="py-2 text-muted-foreground">{idx + 1}</td>
                                        <td className="py-2 font-medium max-w-[160px] truncate">{row.partnerName}</td>
                                        <td className="py-2 text-right tabular-nums">{formatCurrency(row.roomCost)}</td>
                                        <td className="py-2 text-right tabular-nums hidden sm:table-cell">{formatCurrency(row.extraCharges)}</td>
                                        <td className="py-2 text-right tabular-nums font-medium">{formatCurrency(row.totalCost)}</td>
                                        <td className="py-2 text-right tabular-nums hidden sm:table-cell">
                                            {total > 0 ? `${((row.totalCost / total) * 100).toFixed(1)}%` : "—"}
                                        </td>
                                        <td className="py-2 text-right tabular-nums hidden md:table-cell">{row.segmentCount}</td>
                                        <td className="py-2 text-right">
                                            <TrendBadge pct={row.trendPct} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

// Export TrendBadge for reuse in other components
export { TrendBadge };
