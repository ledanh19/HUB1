/**
 * Feature flag: DASHBOARD_AGG_V1
 *
 * Controls whether Dashboard uses aggregated Postgres RPCs
 * (1 request per chain) instead of client-side parallel fetches
 * (2-4 requests per chain).
 *
 * Precedence (highest → lowest):
 *   1. localStorage override:  DASHBOARD_AGG_V1 = "1" | "0"
 *   2. Environment canary:     VITE_DASHBOARD_AGG_CANARY_PCT (0–100)
 *      Hash of userId % 100 < N  →  enabled for that user
 *   3. Environment toggle:     VITE_DASHBOARD_AGG_V1 = "1" | "0"
 *   4. Default: OFF
 *
 * Usage in browser console:
 *   Enable:   localStorage.setItem("DASHBOARD_AGG_V1", "1"); location.reload();
 *   Disable:  localStorage.setItem("DASHBOARD_AGG_V1", "0"); location.reload();
 *   Clear:    localStorage.removeItem("DASHBOARD_AGG_V1"); location.reload();
 *
 * Usage in .env:
 *   VITE_DASHBOARD_AGG_V1=1             # enable for all
 *   VITE_DASHBOARD_AGG_CANARY_PCT=5     # enable for 5% of users
 */

export type DashboardAggMode = "off" | "on" | "canary" | "override";

/**
 * Simple deterministic hash for canary bucketing.
 * Returns 0–99. Same userId always gets the same bucket.
 */
function hashBucket(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 100;
}

/** Get current mode for diagnostics */
export function getDashboardAggMode(userId?: string): DashboardAggMode {
    // 1. localStorage override (highest priority)
    const ls = localStorage.getItem("DASHBOARD_AGG_V1");
    if (ls === "1") return "override";
    if (ls === "0") return "off";

    // 2. Canary (if userId available)
    const canaryPct = parseInt(import.meta.env.VITE_DASHBOARD_AGG_CANARY_PCT || "0", 10);
    if (canaryPct > 0 && userId) {
        return hashBucket(userId) < canaryPct ? "canary" : "off";
    }

    // 3. Environment toggle
    if (import.meta.env.VITE_DASHBOARD_AGG_V1 === "1") return "on";

    // 4. Default
    return "off";
}

/** Check if aggregated RPCs are enabled for this user */
export function isDashboardAggEnabled(userId?: string): boolean {
    return getDashboardAggMode(userId) !== "off";
}
