import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  KpiIndexBadge — Fixed-size numbered chip for KPI tile headers.    */
/*                                                                    */
/*  Replaces emoji digits (1️⃣ 2️⃣ …) that cause baseline/alignment  */
/*  issues. Renders a consistent h-5 w-5 chip with a centered number.*/
/*                                                                    */
/*  Usage:                                                            */
/*    <KpiIndexBadge index={1} />                                     */
/*    <KpiIndexBadge index={3} variant="warning" />                   */
/* ------------------------------------------------------------------ */

type KpiBadgeVariant = "default" | "warning" | "info" | "success" | "danger" | "primary";

const VARIANT_CLASS: Record<KpiBadgeVariant, string> = {
    default: "bg-muted text-muted-foreground",
    warning: "bg-warning/20 text-warning",
    info: "bg-info/20 text-info",
    success: "bg-success/20 text-success",
    danger: "bg-destructive/20 text-destructive",
    primary: "bg-primary/20 text-primary",
};

interface KpiIndexBadgeProps {
    /** The index number to display (1-9) */
    index: number;
    /** Color variant matching the tile's semantic group */
    variant?: KpiBadgeVariant;
    className?: string;
}

export function KpiIndexBadge({ index, variant = "default", className }: KpiIndexBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center justify-center shrink-0",
                "h-5 w-5 rounded-md",
                "text-[11px] font-bold leading-none",
                VARIANT_CLASS[variant],
                className,
            )}
            aria-hidden="true"
        >
            {index}
        </span>
    );
}
