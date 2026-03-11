/**
 * CashflowChart — Bar chart: Thu tiền / Chi tiền / Dòng tiền ròng
 * Answers: "Đang tạo ra tiền mặt không?"
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { chartColors, BAR_RADIUS_TOP } from "../chartColors";

const fmtFull = (v: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v);
const fmtShort = (v: number) => {
    if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    return `${(v / 1_000).toFixed(0)}K`;
};

const DESCS: Record<string, string> = {
    "Thu tiền": "Tổng tiền thực thu từ khách trong kỳ. Bao gồm: tiền phòng, phụ phí, dịch vụ.",
    "Chi tiền": "Tổng tiền thực chi trong kỳ. Bao gồm: trả host, NCC dịch vụ, hoàn tiền.",
    "Dòng tiền ròng": "Thu tiền trừ Chi tiền. Dương = tạo ra tiền mặt, Âm = đang chi nhiều hơn thu.",
};

// Gradient color pairs: [topColor, bottomColor]
const GRADIENT_COLORS: Record<string, [string, string]> = {
    "Thu tiền": ["#34d399", "#059669"],       // emerald gradient
    "Chi tiền": ["#f87171", "#dc2626"],       // red gradient
    "Dòng tiền ròng+": ["#60a5fa", "#1d4ed8"],  // blue gradient (positive)
    "Dòng tiền ròng-": ["#f87171", "#dc2626"],   // red gradient (negative)
};

function CustomTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const { name, value, fill } = payload[0].payload ? { name: payload[0].payload.name, value: payload[0].value, fill: payload[0].payload.fill } : payload[0];
    const pName = payload[0].payload?.name || name;
    return (
        <div className="dv2-tooltip-enter rounded-lg bg-slate-900 text-white px-3 py-2 shadow-lg max-w-[240px] text-xs">
            <p className="font-semibold mb-0.5">{pName}</p>
            <p className="text-[13px] font-bold tabular-nums mb-1">{fmtFull(payload[0].value)}</p>
            <p className="text-slate-300 text-[10px]">{DESCS[pName]}</p>
        </div>
    );
}

interface Props {
    cashIn: number;
    cashOut: number;
    netCash: number;
    isLoading?: boolean;
    className?: string;
    chartHeight?: number;
}

export function CashflowChart({ cashIn, cashOut, netCash, isLoading, className, chartHeight = 200 }: Props) {
    if (isLoading) return <div className={`h-48 dv2-skeleton ${className || ""}`} />;

    const netGradientKey = netCash >= 0 ? "Dòng tiền ròng+" : "Dòng tiền ròng-";

    const data = [
        { name: "Thu tiền", value: cashIn, gradientId: "cashIn-grad" },
        { name: "Chi tiền", value: cashOut, gradientId: "cashOut-grad" },
        { name: "Dòng tiền ròng", value: netCash, gradientId: "netCash-grad" },
    ];

    const thuColors = GRADIENT_COLORS["Thu tiền"];
    const chiColors = GRADIENT_COLORS["Chi tiền"];
    const netColors = GRADIENT_COLORS[netGradientKey];

    return (
        <div className={`dv2-chart-interactive ${className || ""}`}>
            <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={data} barSize={40} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <defs>
                        <linearGradient id="cashIn-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={thuColors[0]} stopOpacity={0.95} />
                            <stop offset="100%" stopColor={thuColors[1]} stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="cashOut-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={chiColors[0]} stopOpacity={0.95} />
                            <stop offset="100%" stopColor={chiColors[1]} stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="netCash-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={netColors[0]} stopOpacity={0.95} />
                            <stop offset="100%" stopColor={netColors[1]} stopOpacity={0.85} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="name" axisLine={false} tickLine={false}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dy={10} />
                    <YAxis hide />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
                    <Bar
                        dataKey="value"
                        radius={BAR_RADIUS_TOP}
                        animationDuration={800}
                        animationEasing="ease-out"
                        activeBar={{ stroke: "hsl(var(--primary))", strokeWidth: 2, fillOpacity: 1, style: { filter: "brightness(1.1) drop-shadow(0 4px 8px rgba(0,0,0,0.15))" } }}
                    >
                        {data.map((d, i) => (
                            <Cell key={i} fill={`url(#${d.gradientId})`} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
