/**
 * DEV-only Dashboard Budget Rules.
 *
 * Called after dashboard:criticalReady to verify that mobile initial load
 * did NOT fire deferred queries prematurely.
 *
 * Thresholds:
 *   - MOBILE_INITIAL_MAX_REQUESTS: max total requests before firstDeferredFire
 *   - Deferred tags must be 0 before firstDeferredFire (on mobile)
 *
 * Usage:
 *   import { checkDashboardBudget } from '@/lib/perf/dashboardBudgetRules';
 *   checkDashboardBudget(isMobile);
 */

import { dashboardBudget } from "./requestBudget";

/** Tunable threshold: max Supabase requests allowed on mobile initial load */
const MOBILE_INITIAL_MAX_REQUESTS = 10;

/**
 * Check budget rules after criticalReady.
 * Logs console.error (red) for regressions, console.warn for budget overrun.
 *
 * Should be called from useDashboardPerf after criticalReady fires.
 */
export function checkDashboardBudget(isMobile: boolean): void {
    if (!import.meta.env.DEV) return;

    const snap = dashboardBudget.report();

    if (!isMobile) {
        // Desktop: no budget enforcement, just log for reference
        console.info("[Dashboard Budget] desktop", snap);
        return;
    }

    // ── RULE 1: No deferred queries before firstDeferredFire ──
    // If deferred:* count > 0 but firstDeferredFire hasn't been marked yet,
    // that means deferred queries fired during initial load (regression).
    if (snap.deferredCount > 0 && snap.firstDeferredAtMs === null) {
        console.error(
            "%c[Dashboard Budget] REGRESSION: deferred queries fired on mobile initial load!",
            "color: red; font-weight: bold",
            {
                deferredCount: snap.deferredCount,
                tags: snap.tags,
                rule: "Deferred queries must NOT fire before user scrolls",
            },
        );
    }

    // ── RULE 2: Total request budget ──
    if (snap.totalRequests > MOBILE_INITIAL_MAX_REQUESTS) {
        console.warn(
            `%c[Dashboard Budget] Mobile initial load exceeded budget: ${snap.totalRequests} requests (max ${MOBILE_INITIAL_MAX_REQUESTS})`,
            "color: orange; font-weight: bold",
            snap.tags,
        );
    }

    // ── Summary ──
    console.info("[Dashboard Budget] mobile snapshot at criticalReady", {
        totalRequests: snap.totalRequests,
        criticalCount: snap.criticalCount,
        deferredCount: snap.deferredCount,
        msSinceReset: snap.resetAtMs ? Math.round(performance.now() - snap.resetAtMs) : null,
    });
}
