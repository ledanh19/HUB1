import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export type KpiSeverity = "green" | "yellow" | "red" | "neutral";

export interface KpiCardV2Props {
    label: string;
    value: string | number;
    subtitle?: string;
    icon?: LucideIcon;
    /** Trend percentage vs comparison period */
    trendPct?: number | null;
    /** e.g. "vs hôm qua", "so với kỳ trước" */
    trendLabel?: string;
    /** Small badge top-right, e.g. "+15" */
    badge?: string | number | null;
    severity?: KpiSeverity;
    tooltip?: string;
    onClick?: () => void;
    className?: string;
    /** Mobile compact mode: smaller text, no icon block, reduced padding */
    compact?: boolean;
}

// ── Palette per severity ──
const ICON_BG: Record<KpiSeverity, string> = {
    neutral: "bg-slate-50",
    green: "bg-emerald-50/60",
    yellow: "bg-amber-50/60",
    red: "bg-red-50/60",
};

const ICON_COLOR: Record<KpiSeverity, string> = {
    neutral: "text-slate-600",
    green: "text-emerald-600",
    yellow: "text-amber-600",
    red: "text-red-600",
};

const ICON_BORDER: Record<KpiSeverity, string> = {
    neutral: "border-slate-200",
    green: "border-emerald-200/60",
    yellow: "border-amber-200/60",
    red: "border-red-200/60",
};

export function KpiCardV2({
    label,
    value,
    subtitle,
    icon: Icon,
    trendPct,
    trendLabel = "so với kỳ trước",
    badge,
    severity = "neutral",
    tooltip,
    onClick,
    className,
    compact = false,
}: KpiCardV2Props) {
    const hasTrend = trendPct !== null && trendPct !== undefined;
    const isUp = hasTrend && trendPct! > 0;
    const isDown = hasTrend && trendPct! < 0;

    const card = (
        <div
            onClick={onClick}
            className={cn(
                "relative rounded-2xl bg-white group dv2-card",
                "border border-slate-200/80",
                "shadow-[0_2px_6px_rgba(0,0,0,0.08),0_6px_20px_rgba(0,0,0,0.05)]",
                compact ? "p-3" : "p-4",
                onClick && "cursor-pointer",
                className
            )}
        >
            {/* Icon badge — hidden in compact mode */}
            {Icon && !compact && (
                <div className={cn(
                    "dv2-kpi-icon flex items-center justify-center h-10 w-10 rounded-xl border mb-3",
                    ICON_BG[severity],
                    ICON_BORDER[severity],
                )}>
                    <Icon className={cn("h-[18px] w-[18px]", ICON_COLOR[severity])} />
                </div>
            )}

            {/* Label */}
            <p className={cn(
                "text-muted-foreground leading-none",
                compact ? "text-[11px] mb-1" : "text-[13px] mb-1.5"
            )}>
                {label}
            </p>

            {/* Value — animated counter entrance */}
            <p className={cn(
                "dv2-kpi-value tracking-tight tabular-nums leading-none text-foreground",
                compact ? "text-2xl font-semibold" : "text-[26px] font-bold"
            )}>
                {value}
            </p>

            {/* Trend row — delayed entrance */}
            {(hasTrend || subtitle) && (
                <div className={cn("dv2-trend flex items-center gap-1", compact ? "mt-1.5" : "mt-2")}>
                    {hasTrend && (
                        <>
                            {isUp && <TrendingUp className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5", "text-emerald-500")} />}
                            {isDown && <TrendingDown className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5", "text-red-500")} />}
                            {!isUp && !isDown && <Minus className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5", "text-muted-foreground")} />}
                            <span className={cn(
                                "font-semibold tabular-nums",
                                compact ? "text-[10px]" : "text-[12px]",
                                isUp && "text-emerald-600",
                                isDown && "text-red-500",
                                !isUp && !isDown && "text-muted-foreground"
                            )}>
                                {isUp ? "+" : ""}{trendPct!.toFixed(1)}%
                            </span>
                            {!compact && (
                                <span className="text-[12px] text-muted-foreground/70 ml-0.5">
                                    {trendLabel}
                                </span>
                            )}
                        </>
                    )}
                    {!hasTrend && subtitle && (
                        <span className={cn("text-muted-foreground", compact ? "text-[10px]" : "text-[12px]")}>{subtitle}</span>
                    )}
                </div>
            )}

            {/* Badge (top-right) — pop-in animation */}
            {badge !== null && badge !== undefined && (
                <span className="dv2-badge absolute top-3 right-3 inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold tabular-nums">
                    +{badge}
                </span>
            )}
        </div>
    );

    if (!tooltip) return card;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>{card}</TooltipTrigger>
                <TooltipContent
                    side="bottom"
                    className="max-w-80 text-xs whitespace-pre-wrap dv2-tooltip-enter"
                >
                    {tooltip}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
