/**
 * Route Governance — DEV-only validation + runtime reporting.
 *
 * PHASE 1: Validates every HEAVY_ROUTE has preloader + prefetcher.
 * PHASE 3: Fail-fast — throws Error on violation in DEV.
 * PHASE 4: Health score summary in console.
 *
 * Called once at app startup after all registrations (App.tsx line 127).
 */

import { HEAVY_ROUTES } from './routeLoadingPolicy';
import { getRoutePreloader } from './routePreloaders';
import { getRoutePrefetcher } from './routePrefetchRegistry';

const isDev = import.meta.env.DEV;

// ── Types ──
interface RouteAuditEntry {
    route: string;
    hasPreloader: boolean;
    hasPrefetcher: boolean;
    status: 'OK' | 'MISSING_PRELOADER' | 'MISSING_PREFETCHER' | 'MISSING_BOTH';
}

interface GovernanceReport {
    timestamp: string;
    totalHeavyRoutes: number;
    covered: number;
    missingPreloader: string[];
    missingPrefetcher: string[];
    entries: RouteAuditEntry[];
    healthScore: number; // 0-100
    healthGrade: 'A' | 'B' | 'C' | 'F';
}

// ── Singleton report (accessible to other DEV tools) ──
let _lastReport: GovernanceReport | null = null;
export function getLastGovernanceReport() { return _lastReport; }

/**
 * Full route governance validation.
 * Logs [ROUTE GOVERNANCE REPORT] to console.
 * In DEV: throws Error if any heavy route is missing preloader/prefetcher.
 */
export function validateRouteGovernance(): GovernanceReport {
    const entries: RouteAuditEntry[] = [];
    const missingPreloader: string[] = [];
    const missingPrefetcher: string[] = [];

    for (const route of HEAVY_ROUTES) {
        const hasPreloader = getRoutePreloader(route) !== null;
        const hasPrefetcher = getRoutePrefetcher(route) !== null;

        let status: RouteAuditEntry['status'] = 'OK';
        if (!hasPreloader && !hasPrefetcher) {
            status = 'MISSING_BOTH';
            missingPreloader.push(route);
            missingPrefetcher.push(route);
        } else if (!hasPreloader) {
            status = 'MISSING_PRELOADER';
            missingPreloader.push(route);
        } else if (!hasPrefetcher) {
            status = 'MISSING_PREFETCHER';
            missingPrefetcher.push(route);
        }

        entries.push({ route, hasPreloader, hasPrefetcher, status });
    }

    const covered = entries.filter(e => e.status === 'OK').length;
    const total = HEAVY_ROUTES.length;
    const healthScore = total > 0 ? Math.round((covered / total) * 100) : 100;
    const healthGrade = healthScore === 100 ? 'A' : healthScore >= 80 ? 'B' : healthScore >= 50 ? 'C' : 'F';

    const report: GovernanceReport = {
        timestamp: new Date().toISOString(),
        totalHeavyRoutes: total,
        covered,
        missingPreloader,
        missingPrefetcher,
        entries,
        healthScore,
        healthGrade,
    };

    _lastReport = report;

    // ── Console output ──
    if (isDev) {
        printGovernanceReport(report);
    }

    // ── PHASE 3: Fail-fast in DEV ──
    if (isDev && (missingPreloader.length > 0 || missingPrefetcher.length > 0)) {
        const violations = [
            ...missingPreloader.map(r => `  ❌ "${r}" — MISSING PRELOADER`),
            ...missingPrefetcher.filter(r => !missingPreloader.includes(r)).map(r => `  ❌ "${r}" — MISSING PREFETCHER`),
        ].join('\n');

        throw new Error(
            `[RouteGovernance] FAIL-FAST: Heavy routes missing preloader/prefetcher!\n${violations}\n\n` +
            `Fix: Register missing preloaders in routePreloads (App.tsx) and prefetchers in routePrefetchRegistry.ts.`
        );
    }

    return report;
}

/**
 * Print formatted governance report to DEV console.
 */
function printGovernanceReport(report: GovernanceReport) {
    console.group('%c[ROUTE GOVERNANCE REPORT]', 'color: #6366f1; font-weight: bold; font-size: 14px');

    // Summary table
    console.log(
        `📊 Total heavy routes: ${report.totalHeavyRoutes}\n` +
        `✅ Covered: ${report.covered}\n` +
        `❌ Missing preloaders: ${report.missingPreloader.length}\n` +
        `❌ Missing prefetchers: ${report.missingPrefetcher.length}`
    );

    // Per-route table
    console.table(
        report.entries.map(e => ({
            Route: e.route,
            Preloader: e.hasPreloader ? '✅' : '❌',
            Prefetcher: e.hasPrefetcher ? '✅' : '❌',
            Status: e.status,
        }))
    );

    // Health score
    const scoreColor =
        report.healthGrade === 'A' ? '#22c55e' :
            report.healthGrade === 'B' ? '#eab308' :
                report.healthGrade === 'C' ? '#f97316' : '#ef4444';

    console.log(
        `%c[ROUTE TRANSITION HEALTH SCORE]%c\n` +
        `  Heavy routes covered: ${report.covered}/${report.totalHeavyRoutes}\n` +
        `  Health score: ${report.healthScore}% (${report.healthGrade})\n` +
        `  Query consistency: ${report.missingPrefetcher.length === 0 ? 'PASS ✅' : 'FAIL ❌'}`,
        `color: ${scoreColor}; font-weight: bold; font-size: 12px`,
        'color: inherit'
    );

    if (report.missingPrefetcher.length > 0) {
        console.warn(
            '[RouteGovernance] Missing prefetchers:\n' +
            report.missingPrefetcher.map(r => `  → ${r}`).join('\n')
        );
    }

    console.groupEnd();
}

/**
 * NAVIGATION MIGRATION COMPLETE
 *
 * All raw <Link to=> targeting heavy routes have been migrated to <AppLink>.
 * The previous KNOWN_RAW_LINK_TO_HEAVY_ROUTES tracker has been removed.
 *
 * Files migrated (2025-02-25):
 * Dashboard.tsx, BookingDetailPage.tsx, HostSettlementPage.tsx,
 * ServiceOrderDetailPage.tsx, ServiceOrdersPage.tsx, DisputeDetailPage.tsx,
 * HostPayablesPage.tsx, OtaPayoutDetailPage.tsx, DocumentationPage.tsx,
 * AccessDeniedPage.tsx, ServicePayablesPage.tsx
 */
