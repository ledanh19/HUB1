/**
 * AreaRankingChart — Area ranking (Province/District/Ward) by accommodation category.
 *
 * Features:
 * - Tab switcher: Khu vực | Quận | Phường
 * - Horizontal bar chart grouped by accommodation category
 * - Top areas shown
 * - Follows AnalyticsCard styling pattern
 */

import { useState, useMemo, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import type { AreaRankingRow } from "@/hooks/dashboard/useAreaRanking";

// ── Types ─────────────────────────────────────────────────────────────────────

type AreaTab = "province" | "district" | "ward";

interface AreaRankingChartProps {
    provinceRanking: AreaRankingRow[];
    districtRanking: AreaRankingRow[];
    wardRanking: AreaRankingRow[];
    isLoading: boolean;
}

// ── Color palette ─────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
    "#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626",
    "#0891B2", "#4338CA", "#65A30D", "#E11D48", "#9333EA",
    "#0D9488", "#CA8A04", "#BE185D", "#1D4ED8", "#7E22CE",
];

function getCategoryColor(category: string): string {
    if (!CATEGORY_COLORS[category]) {
        const idx = Object.keys(CATEGORY_COLORS).length % COLOR_PALETTE.length;
        CATEGORY_COLORS[category] = COLOR_PALETTE[idx];
    }
    return CATEGORY_COLORS[category];
}

// ── Formatters ────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) =>
    "₫" + new Intl.NumberFormat("vi-VN").format(Math.round(amount));

const formatCurrencyShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return `${(v / 1_000).toFixed(0)}K`;
};

// ── Tab config ────────────────────────────────────────────────────────────────

const AREA_TABS: { key: AreaTab; label: string }[] = [
    { key: "province", label: "Khu vực" },
    { key: "district", label: "Quận" },
    { key: "ward", label: "Phường" },
];

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function AreaTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
            <p className="font-semibold mb-1">{data.areaName}</p>
            <div className="flex items-center gap-2 mb-1">
                <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: getCategoryColor(data.categoryName) }}
                />
                <span className="text-muted-foreground">{data.categoryName}</span>
            </div>
            <div className="space-y-0.5 text-muted-foreground">
                <p>Doanh thu: <span className="font-medium text-foreground">{formatCurrency(data.revenue)}</span></p>
                <p>Đặt phòng: <span className="font-medium text-foreground">{data.reservations}</span></p>
                <p>Đêm phòng: <span className="font-medium text-foreground">{data.roomNights}</span></p>
                <p>Số chỗ nghỉ: <span className="font-medium text-foreground">{data.propertyCount}</span></p>
            </div>
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function AreaSkeleton() {
    return (
        <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Đang tải...
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AreaRankingChart({
    provinceRanking,
    districtRanking,
    wardRanking,
    isLoading,
}: AreaRankingChartProps) {
    const [activeTab, setActiveTab] = useState<AreaTab>("district");
    const isMobile = useIsMobile();

    const data = useMemo(() => {
        switch (activeTab) {
            case "province": return provinceRanking;
            case "district": return districtRanking;
            case "ward": return wardRanking;
        }
    }, [activeTab, provinceRanking, districtRanking, wardRanking]);

    // Aggregate by area for chart (combine categories)
    const chartData = useMemo(() => {
        const byArea = new Map<string, { revenue: number; categories: string[] }>();
        for (const row of data) {
            const e = byArea.get(row.areaName) || { revenue: 0, categories: [] };
            e.revenue += row.revenue;
            if (!e.categories.includes(row.categoryName)) e.categories.push(row.categoryName);
            byArea.set(row.areaName, e);
        }
        return Array.from(byArea.entries())
            .map(([name, e]) => ({
                areaName: name,
                revenue: e.revenue,
                categories: e.categories,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
    }, [data]);

    // Legend: unique categories
    const categories = useMemo(() => {
        const s = new Set<string>();
        data.forEach(r => s.add(r.categoryName));
        return Array.from(s);
    }, [data]);

    return (
        <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Xếp hạng khu vực
            </h3>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-4 bg-muted/50 rounded-lg p-0.5 w-fit">
                {AREA_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                            activeTab === tab.key
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <AreaSkeleton />
            ) : chartData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                    Chưa có dữ liệu khu vực
                </div>
            ) : (
                <>
                    {/* Bar chart */}
                    <div style={{ height: Math.max(200, chartData.length * (isMobile ? 36 : 40) + 40) }}>
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
                                    dataKey="areaName"
                                    width={isMobile ? 80 : 120}
                                    tick={{ fontSize: isMobile ? 10 : 11, fill: "hsl(var(--foreground))" }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(v: string) => isMobile && v.length > 12 ? v.slice(0, 10) + "…" : v}
                                />
                                <RechartsTooltip content={<AreaTooltip />} />
                                <Bar
                                    dataKey="revenue"
                                    radius={[0, 4, 4, 0]}
                                    animationDuration={600}
                                >
                                    {chartData.map((entry, idx) => (
                                        <Cell
                                            key={entry.areaName}
                                            fill={getCategoryColor(entry.categories[0] || "Khác")}
                                            fillOpacity={0.85}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Category legend */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-3 mt-3 px-1">
                            {categories.map(cat => (
                                <div key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <div
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: getCategoryColor(cat) }}
                                    />
                                    {cat}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Detail table */}
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border text-left text-muted-foreground">
                                    <th className="pb-2 font-medium">#</th>
                                    <th className="pb-2 font-medium">Khu vực</th>
                                    <th className="pb-2 font-medium">Danh mục</th>
                                    <th className="pb-2 font-medium text-right">Doanh thu</th>
                                    <th className="pb-2 font-medium text-right hidden sm:table-cell">Đặt phòng</th>
                                    <th className="pb-2 font-medium text-right hidden sm:table-cell">Đêm phòng</th>
                                    <th className="pb-2 font-medium text-right hidden md:table-cell">Chỗ nghỉ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.slice(0, 15).map((row, idx) => (
                                    <tr
                                        key={`${row.areaName}-${row.categoryName}`}
                                        className="border-b border-border/50 last:border-0 hover:bg-primary/5 transition-colors"
                                    >
                                        <td className="py-2 text-muted-foreground">{idx + 1}</td>
                                        <td className="py-2 font-medium">{row.areaName}</td>
                                        <td className="py-2">
                                            <div className="flex items-center gap-1.5">
                                                <div
                                                    className="w-2 h-2 rounded-full shrink-0"
                                                    style={{ backgroundColor: getCategoryColor(row.categoryName) }}
                                                />
                                                <span className="text-muted-foreground">{row.categoryName}</span>
                                            </div>
                                        </td>
                                        <td className="py-2 text-right tabular-nums font-medium">{formatCurrency(row.revenue)}</td>
                                        <td className="py-2 text-right tabular-nums hidden sm:table-cell">{row.reservations}</td>
                                        <td className="py-2 text-right tabular-nums hidden sm:table-cell">{row.roomNights}</td>
                                        <td className="py-2 text-right tabular-nums hidden md:table-cell">{row.propertyCount}</td>
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
