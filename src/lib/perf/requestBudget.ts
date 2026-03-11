/**
 * DEV-only Request Budget Tracker for Dashboard.
 *
 * Tracks Supabase query tags per route load.
 * Tags follow the convention: "critical:*" or "deferred:*"
 *
 * Usage:
 *   dashboardBudget.reset()          // on route enter
 *   dashboardBudget.bump("critical:stays")
 *   dashboardBudget.bump("deferred:pl")
 *   dashboardBudget.report()         // → snapshot
 *
 * Zero overhead in production: all calls are guarded by import.meta.env.DEV.
 */

interface BudgetSnapshot {
    totalRequests: number;
    criticalCount: number;
    deferredCount: number;
    tags: Record<string, number>;
    firstDeferredAtMs: number | null;
    resetAtMs: number;
}

class RequestBudget {
    private tags: Record<string, number> = {};
    private firstDeferredAtMs: number | null = null;
    private resetAtMs: number = 0;

    reset(): void {
        this.tags = {};
        this.firstDeferredAtMs = null;
        this.resetAtMs = performance.now();
    }

    bump(tag: string): void {
        this.tags[tag] = (this.tags[tag] || 0) + 1;

        if (tag.startsWith("deferred:") && this.firstDeferredAtMs === null) {
            this.firstDeferredAtMs = performance.now();
        }
    }

    report(): BudgetSnapshot {
        const entries = Object.entries(this.tags);
        const criticalCount = entries
            .filter(([k]) => k.startsWith("critical:"))
            .reduce((sum, [, v]) => sum + v, 0);
        const deferredCount = entries
            .filter(([k]) => k.startsWith("deferred:"))
            .reduce((sum, [, v]) => sum + v, 0);

        return {
            totalRequests: entries.reduce((sum, [, v]) => sum + v, 0),
            criticalCount,
            deferredCount,
            tags: { ...this.tags },
            firstDeferredAtMs: this.firstDeferredAtMs,
            resetAtMs: this.resetAtMs,
        };
    }
}

/**
 * Singleton budget tracker.
 * In production, calls are no-ops (callers gate with import.meta.env.DEV).
 */
export const dashboardBudget = new RequestBudget();
