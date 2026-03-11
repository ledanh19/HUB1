import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  KPIGrid — Canonical responsive grid for MetricCard tiles.         */
/*                                                                    */
/*  SOT: docs/KPI_SYSTEM_SOT.md §B                                   */
/*  Layout: 1 col (mobile) → 2 col (sm) → N col (lg)                 */
/*  Gap: gap-4 always. Items stretch for equal heights.               */
/*                                                                    */
/*  Usage:                                                            */
/*    <KPIGrid columns={4}>                                           */
/*      <MetricCard ... />                                            */
/*      <MetricCard ... />                                            */
/*    </KPIGrid>                                                      */
/* ------------------------------------------------------------------ */

interface KPIGridProps {
    /** Number of columns at lg+ breakpoint (default: 4) */
    columns?: 2 | 3 | 4;
    children: React.ReactNode;
    className?: string;
}

const GRID_COL_MAP: Record<number, string> = {
    2: "grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch",
    3: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch",
    4: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch",
};

export function KPIGrid({ columns = 4, children, className }: KPIGridProps) {
    return (
        <div className={cn(GRID_COL_MAP[columns], className)}>
            {children}
        </div>
    );
}
