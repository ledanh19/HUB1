/**
 * OtaReceivableAgingChart — Canonical 4-bucket aging: 0–7 / 8–14 / 15–30 / >30
 * SOT: rpc_get_ota_ar_dashboard_v2 (same as OTA Payout page)
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { BAR_RADIUS_TOP } from "../chartColors";

const fmtFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);
const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return `${(v / 1_000).toFixed(0)}K`;
};

// 4 canonical buckets — matches OTA Payout page (rpc_get_ota_ar_dashboard_v2)
const BUCKET_META: Record<string, { label: string; gradientId: string; topColor: string; bottomColor: string; desc: string }> = {
    "0-7": { label: "0–7 ngày", gradientId: "aging-07-grad", topColor: "#94a3b8", bottomColor: "#334155", desc: "Booking mới checkout, đang chờ OTA tạo payout. Bình thường." },
    "8-14": { label: "8–14 ngày", gradientId: "aging-814-grad", topColor: "#38bdf8", bottomColor: "#0369a1", desc: "Bắt đầu chậm — cần theo dõi chu kỳ thanh toán OTA." },
    "15-30": { label: "15–30 ngày", gradientId: "aging-1530-grad", topColor: "#fbbf24", bottomColor: "#b45309", desc: "Payout bị chậm rõ ràng. Cần kiểm tra hoặc nhắc OTA." },
    ">30": { label: "> 30 ngày", gradientId: "aging-30p-grad", topColor: "#f87171", bottomColor: "#991b1b", desc: "Rủi ro cao — payout quá hạn, có thể cần điều tra hoặc liên hệ OTA." },
};

function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const meta = BUCKET_META[d.bucket];
    return (
        <div className="dv2-tooltip-enter rounded-lg bg-slate-900 text-white px-3 py-2 shadow-lg max-w-[240px] text-xs">
            <p className="font-semibold mb-0.5">{meta?.label || d.bucket}</p>
            <p className="text-[13px] font-bold tabular-nums mb-1">{fmtFull(d.amount)}</p>
            <p className="text-slate-300 text-[10px]">{meta?.desc}</p>
        </div>
    );
}

interface AgingBucket {
    amount: number;
    count: number;
}

interface Props {
    arTotal: number;
    arCount: number;
    pendingTotal: number;
    pendingCount: number;
    overdueCount?: number;
    aging?: {
        bucket0_7?: AgingBucket;
        bucket8_14?: AgingBucket;
        bucket15_30?: AgingBucket;
        bucket30Plus?: AgingBucket;
    };
    className?: string;
    chartHeight?: number;
}

export function OtaReceivableAgingChart({ arTotal, arCount, pendingTotal, pendingCount, overdueCount, aging, className, chartHeight = 120 }: Props) {
    // 4 canonical buckets — no merging, exact match with OTA Payout page
    const data = [
        { bucket: "0-7", amount: aging?.bucket0_7?.amount || 0 },
        { bucket: "8-14", amount: aging?.bucket8_14?.amount || 0 },
        { bucket: "15-30", amount: aging?.bucket15_30?.amount || 0 },
        { bucket: ">30", amount: aging?.bucket30Plus?.amount || 0 },
    ];

    return (
        <div className={`dv2-chart-interactive ${className || ""}`}>
            {/* Summary KPI mini cards — scale entrance */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="dv2-mini-card rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Chờ tạo payout</p>
                    <p className="dv2-kpi-value text-lg font-bold tabular-nums text-slate-900 mt-0.5">{fmtShort(arTotal)}</p>
                    <p className="text-[10px] text-slate-400">{arCount} booking đã checkout</p>
                </div>
                <div className="dv2-mini-card rounded-lg bg-slate-50 border border-slate-200 p-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Đang chuyển về</p>
                    <p className="dv2-kpi-value text-lg font-bold tabular-nums text-slate-900 mt-0.5">{fmtShort(pendingTotal)}</p>
                    <p className="text-[10px] text-slate-400">{pendingCount} payout{overdueCount ? `, ${overdueCount} quá hạn` : ""}</p>
                </div>
            </div>
            {/* Aging chart */}
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Tuổi nợ chờ payout (từ checkout)</p>
            <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={data} barSize={28} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <defs>
                        {Object.values(BUCKET_META).map((meta) => (
                            <linearGradient key={meta.gradientId} id={meta.gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={meta.topColor} stopOpacity={0.95} />
                                <stop offset="100%" stopColor={meta.bottomColor} stopOpacity={0.85} />
                            </linearGradient>
                        ))}
                    </defs>
                    <XAxis dataKey="bucket" axisLine={false} tickLine={false}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(v) => BUCKET_META[v]?.label || v} dy={10} />
                    <YAxis hide />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
                    <Bar
                        dataKey="amount"
                        radius={BAR_RADIUS_TOP}
                        animationDuration={800}
                        animationEasing="ease-out"
                        activeBar={{ stroke: "hsl(var(--primary))", strokeWidth: 2, fillOpacity: 1, style: { filter: "brightness(1.1) drop-shadow(0 4px 8px rgba(0,0,0,0.15))" } }}
                    >
                        {data.map((d, i) => (
                            <Cell key={i} fill={`url(#${BUCKET_META[d.bucket]?.gradientId || "aging-07-grad"})`} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

