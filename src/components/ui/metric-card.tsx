import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  MetricCard — Canonical KPI tile component.                        */
/*                                                                    */
/*  SOT: docs/KPI_SYSTEM_SOT.md §A                                   */
/*  Hard locks: min-h-[104px], p-4, gap-3, h-4 w-4 icons,           */
/*              text-2xl value, text-xs label, tabular-nums.          */
/*                                                                    */
/*  Usage:                                                            */
/*    <MetricCard title="Revenue" value={formatCurrency(rev)}         */
/*      icon={DollarSign} tone="success" />                           */
/* ------------------------------------------------------------------ */

export type MetricCardTone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

const TONE_VALUE_CLASS: Record<MetricCardTone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  primary: "text-primary",
};

const TONE_ICON_BG: Record<MetricCardTone, string> = {
  neutral: "bg-primary/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  danger: "bg-destructive/10",
  info: "bg-info/10",
  primary: "bg-primary/10",
};

const TONE_ICON_COLOR: Record<MetricCardTone, string> = {
  neutral: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  primary: "text-primary",
};

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: {
    value: number;
    label: string;
  };
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  /** Semantic color tone. Preferred over valueClassName for consistency. */
  tone?: MetricCardTone;
  /** Density: standard (default) or compact (rare, toolbar-only). */
  density?: "standard" | "compact";
  className?: string;
  /** @deprecated Use `tone` prop instead. Kept for backward compat. */
  valueClassName?: string;
  onClick?: () => void;
}

export const MetricCard = React.forwardRef<HTMLDivElement, MetricCardProps>(
  ({
    title,
    value,
    subtitle,
    change,
    icon: Icon,
    trend = "neutral",
    tone = "neutral",
    density = "standard",
    className,
    valueClassName,
    onClick,
  }, ref) => {
    // Resolve value color: tone prop takes precedence, valueClassName is fallback
    const valueColor = valueClassName || TONE_VALUE_CLASS[tone];
    const iconBg = TONE_ICON_BG[tone];
    const iconColor = TONE_ICON_COLOR[tone];

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          // Hard layout locks (SOT §A)
          "relative overflow-hidden rounded-none sm:rounded-lg border-y border-x-0 sm:border border-border/60 bg-card p-4 transition-all duration-150 hover:shadow-md group",
          density === "standard" && "min-h-[104px]",
          density === "compact" && "min-h-[72px] p-3",
          onClick && "cursor-pointer active:scale-[0.99]",
          className
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className={cn(
              "text-2xl font-semibold tracking-tight tabular-nums",
              valueColor
            )}>
              {value}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            {change && (
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend === "up" && "text-success",
                    trend === "down" && "text-destructive",
                    trend === "neutral" && "text-muted-foreground"
                  )}
                >
                  {trend === "up" && "+"}
                  {change.value}%
                </span>
                <span className="text-xs text-muted-foreground">{change.label}</span>
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn("rounded-md p-2 transition-colors", iconBg)}>
              <Icon className={cn("h-4 w-4", iconColor)} />
            </div>
          )}
        </div>
      </div>
    );
  }
);
MetricCard.displayName = "MetricCard";
