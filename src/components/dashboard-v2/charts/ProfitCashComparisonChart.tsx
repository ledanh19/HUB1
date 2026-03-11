/**
 * ProfitCashComparisonChart — Side-by-side bars: Lợi nhuận vs Dòng tiền
 * Answers: "Lợi nhuận kế toán có thực sự thành tiền mặt không?"
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";
import { chartColors, CHART_OPACITY, BAR_RADIUS_TOP } from "../chartColors";

const fmtFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);

function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="dv2-tooltip-enter rounded-lg bg-slate-900 text-white px-3 py-2 shadow-lg max-w-[240px] text-xs space-y-1.5">
            <p className="font-semibold">{d.name}</p>
            <p className="text-[13px] font-bold tabular-nums">{fmtFull(d.value)}</p>
            <p className="text-slate-300 text-[10px]">{d.desc}</p>
        </div>
    );
}

interface Props {
    profit: number;
    cashflow: number;
    gap: number;
    isLoading?: boolean;
    className?: string;
    chartHeight?: number;
}

export function ProfitCashComparisonChart({ profit, cashflow, gap, isLoading, className, chartHeight = 200 }: Props) {
    if (isLoading) return <div className={`h-48 dv2-skeleton ${className || ""}`} />;

    const data = [
        { name: "Lợi nhuận (P&L)", value: profit, fill: chartColors.profit, desc: "Lợi nhuận kế toán tính theo phát sinh. Doanh thu trừ giá vốn host và chi phí vận hành." },
        { name: "Dòng tiền (thực)", value: cashflow, fill: chartColors.netCash, desc: "Tiền mặt thực tế vào ra. Thu từ khách trừ chi cho host/NCC." },
    ];

    return (
        <div className={`dv2-chart-interactive ${className || ""}`}>
            <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={data} barSize={48} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <defs>
                        <linearGradient id="pcc-profit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="pcc-cash" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.85} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="name" axisLine={false} tickLine={false}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dy={10} />
                    <YAxis hide />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
                    <Bar
                        dataKey="value"
                        radius={BAR_RADIUS_TOP}
                        animationDuration={800}
                        animationEasing="ease-out"
                        activeBar={{ stroke: "hsl(var(--primary))", strokeWidth: 2, fillOpacity: 1, style: { filter: "brightness(1.1) drop-shadow(0 4px 8px rgba(0,0,0,0.15))" } }}
                    >
                        <Cell fill="url(#pcc-profit)" />
                        <Cell fill="url(#pcc-cash)" />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            {/* Gap insight — delayed slide-in */}
            <div className={cn(
                "dv2-insight mt-3 rounded-lg px-4 py-2 text-xs flex items-center justify-between",
                gap > 0 ? "bg-slate-50 text-amber-700" : gap < 0 ? "bg-slate-50 text-blue-700" : "bg-slate-50 text-slate-500"
            )}>
                <span>
                    {gap > 0
                        ? "Chưa thu hết — lợi nhuận > tiền mặt thực tế"
                        : gap < 0
                            ? "Thu hơn sổ sách — tiền mặt > lợi nhuận"
                            : "Cân bằng — lợi nhuận = tiền mặt"}
                </span>
                <span className="font-bold tabular-nums">{gap >= 0 ? "+" : ""}{fmtFull(gap)}</span>
            </div>
        </div>
    );
}
