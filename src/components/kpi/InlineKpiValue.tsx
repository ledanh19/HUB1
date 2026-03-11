import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  InlineKpiValue — Canonical primitive for inline KPI numbers.      */
/*                                                                    */
/*  SOT: docs/KPI_SYSTEM_SOT.md §C                                   */
/*  Use for: summary rows, table cells, dialog values.                */
/*  NOT for: standalone KPI tiles (use MetricCard instead).           */
/*                                                                    */
/*  Usage:                                                            */
/*    <InlineKpiValue value={formatCurrency(amount)} tone="success" />*/
/*    <InlineKpiValue value={total} size="body" align="right" />      */
/* ------------------------------------------------------------------ */

export type KpiTone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

const TONE_CLASS: Record<KpiTone, string> = {
    neutral: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    info: "text-info",
    primary: "text-primary",
};

interface InlineKpiValueProps {
    /** The formatted KPI value (string or ReactNode) */
    value: React.ReactNode;
    /** Size variant: "kpi" (summary) or "body" (table cell) */
    size?: "kpi" | "body";
    /** Text alignment */
    align?: "left" | "right";
    /** Semantic color tone */
    tone?: KpiTone;
    className?: string;
}

export function InlineKpiValue({
    value,
    size = "kpi",
    align = "left",
    tone = "neutral",
    className,
}: InlineKpiValueProps) {
    return (
        <span
            className={cn(
                "tabular-nums tracking-tight whitespace-nowrap",
                size === "kpi" && "text-kpi font-semibold",
                size === "body" && "text-sm font-medium",
                align === "right" && "text-right",
                TONE_CLASS[tone],
                className,
            )}
        >
            {value}
        </span>
    );
}
