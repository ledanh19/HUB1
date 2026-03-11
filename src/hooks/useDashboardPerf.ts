import { useEffect, useMemo, useRef } from "react";
import { dashboardBudget } from "@/lib/perf/requestBudget";
import { checkDashboardBudget } from "@/lib/perf/dashboardBudgetRules";

type DashboardPerfApi = {
    /** Call once when the first chart component paints / mounts */
    onFirstChartPaint: () => void;
    /** Report total Supabase query count */
    reportQueryCount: (n: number) => void;
    /** Call once when all critical queries (sections 1–5) are resolved */
    onCriticalReady: () => void;
    /**
     * Call when the first deferred query begins execution.
     * @param label — e.g. "pl", "analytics", "recentBookings"
     */
    onDeferredFire: (label: string) => void;
    /**
     * Tag a query for budget tracking (DEV-only).
     * @param tag — e.g. "critical:stays", "deferred:pl"
     */
    budgetBump: (tag: string) => void;
};

/**
 * DEV-only performance observability for Dashboard.
 * Measures:
 *   - mount → critical data ready (sections 1–5)
 *   - mount → first deferred query fire (scroll-triggered)
 *   - mount → first chart paint
 *   - Budget: tracks total requests and regression checks
 * Zero overhead in production builds.
 */
export function useDashboardPerf(isMobile: boolean): DashboardPerfApi {
    const enabled = import.meta.env.DEV;
    const firstChartPainted = useRef(false);
    const criticalMarked = useRef(false);
    const deferredMarked = useRef(false);
    const queryCountRef = useRef<number | null>(null);

    const api = useMemo<DashboardPerfApi>(
        () => ({
            onFirstChartPaint: () => {
                if (!enabled) return;
                if (firstChartPainted.current) return;
                firstChartPainted.current = true;
                performance.mark("dashboard:firstChartPaint");
            },
            reportQueryCount: (n: number) => {
                queryCountRef.current = n;
            },
            onCriticalReady: () => {
                if (!enabled) return;
                if (criticalMarked.current) return;
                criticalMarked.current = true;
                performance.mark("dashboard:criticalReady");
                try {
                    performance.measure(
                        "dashboard:mountToCritical",
                        "dashboard:mount",
                        "dashboard:criticalReady",
                    );
                    const measures = performance.getEntriesByName("dashboard:mountToCritical");
                    const ms = measures?.[measures.length - 1]?.duration;
                    console.info("[Dashboard Perf] criticalReady", {
                        isMobile,
                        mountToCriticalMs: ms ? Math.round(ms) : null,
                    });
                } catch {
                    // noop
                }

                // Run budget check after criticalReady (microtask to let React settle)
                queueMicrotask(() => {
                    checkDashboardBudget(isMobile);
                });
            },
            onDeferredFire: (label: string) => {
                if (!enabled) return;
                // Tag for budget tracking
                dashboardBudget.bump(`deferred:${label}`);

                if (deferredMarked.current) return; // only first deferred counts for timing
                deferredMarked.current = true;
                performance.mark("dashboard:firstDeferredFire");
                try {
                    performance.measure(
                        "dashboard:mountToFirstDeferred",
                        "dashboard:mount",
                        "dashboard:firstDeferredFire",
                    );
                    const measures = performance.getEntriesByName("dashboard:mountToFirstDeferred");
                    const ms = measures?.[measures.length - 1]?.duration;
                    console.info("[Dashboard Perf] firstDeferredFire", {
                        isMobile,
                        label,
                        mountToFirstDeferredMs: ms ? Math.round(ms) : null,
                    });
                } catch {
                    // noop
                }
            },
            budgetBump: (tag: string) => {
                if (!enabled) return;
                dashboardBudget.bump(tag);
            },
        }),
        [enabled, isMobile],
    );

    useEffect(() => {
        if (!enabled) return;

        // Reset budget on route enter
        dashboardBudget.reset();
        performance.mark("dashboard:mount");

        return () => {
            try {
                performance.measure(
                    "dashboard:mountToFirstChart",
                    "dashboard:mount",
                    "dashboard:firstChartPaint",
                );
                const measures = performance.getEntriesByName("dashboard:mountToFirstChart");
                const mountToFirstChart = measures?.[measures.length - 1]?.duration;

                // Final summary with budget report
                const budgetSnap = dashboardBudget.report();
                console.info("[Dashboard Perf] summary", {
                    isMobile,
                    mountToFirstChart: mountToFirstChart ? Math.round(mountToFirstChart) : null,
                    totalQueries: queryCountRef.current,
                    budget: {
                        total: budgetSnap.totalRequests,
                        critical: budgetSnap.criticalCount,
                        deferred: budgetSnap.deferredCount,
                    },
                });

                performance.clearMarks("dashboard:mount");
                performance.clearMarks("dashboard:firstChartPaint");
                performance.clearMarks("dashboard:criticalReady");
                performance.clearMarks("dashboard:firstDeferredFire");
                performance.clearMeasures("dashboard:mountToFirstChart");
                performance.clearMeasures("dashboard:mountToCritical");
                performance.clearMeasures("dashboard:mountToFirstDeferred");
            } catch {
                // noop
            }
        };
    }, [enabled, isMobile]);

    return api;
}
