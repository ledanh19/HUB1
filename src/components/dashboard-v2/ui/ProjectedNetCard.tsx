/**
 * ProjectedNetCard — KPI card: Revenue Forecast − Expense Forecast
 * Answers: "Dự kiến lãi hay lỗ?"
 */
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Scale } from "lucide-react";

const fmtFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);

interface Props {
    revenueTotal: number;
    expenseTotal: number;
    className?: string;
}

export function ProjectedNetCard({ revenueTotal, expenseTotal, className }: Props) {
    const net = revenueTotal - expenseTotal;
    const isPositive = net >= 0;
    const marginPct = revenueTotal > 0 ? (net / revenueTotal) * 100 : 0;

    return (
        <div
            className={cn(
                "dv2-card rounded-none sm:rounded-2xl border-y border-x-0 sm:border p-5 md:p-6",
                "shadow-[0_2px_6px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.05)]",
                isPositive
                    ? "bg-card border-emerald-200/40"
                    : "bg-card border-red-200/40",
                className
            )}
        >
            <div className="flex items-start justify-between gap-4">
                {/* Left: main info */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Scale className="dv2-kpi-icon h-4 w-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-500">Dòng tiền dự kiến</span>
                    </div>
                    <p className={cn(
                        "dv2-kpi-value text-2xl md:text-3xl font-bold tabular-nums tracking-tight",
                        isPositive ? "text-emerald-700" : "text-red-600"
                    )}>
                        {isPositive ? "+" : ""}{fmtFull(net)}
                    </p>
                    <p className="text-xs text-slate-400">
                        Dự báo thu {fmtFull(revenueTotal)} − Dự báo chi {fmtFull(expenseTotal)}
                    </p>
                </div>

                {/* Right: trend indicator */}
                <div className={cn(
                    "dv2-trend flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
                    isPositive
                        ? "bg-emerald-50/60 text-emerald-700"
                        : "bg-red-50/60 text-red-600"
                )}>
                    {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {isPositive ? "Dương" : "Âm"}
                </div>
            </div>

            {/* Tooltip-style description */}
            <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                Dòng tiền dự kiến sau khi trừ chi phí khỏi doanh thu.
                {isPositive
                    ? " Dương = kinh doanh tạo lợi nhuận."
                    : " Âm = chi phí vượt doanh thu, cần điều chỉnh."}
            </p>
        </div>
    );
}
