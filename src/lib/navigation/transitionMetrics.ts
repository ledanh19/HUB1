/**
 * Transition Metrics — Production-safe observability for the Route Transition System.
 *
 * Records per-transition timing + outcome data, computes aggregates (avg, P95, hit ratio),
 * and exposes a DEV console summary.
 *
 * Production: metrics are recorded (in-memory) but verbose logs are stripped.
 * DEV: full console summary via printMetricsSummary() + auto-print every 10 transitions.
 */

const isDev = import.meta.env.DEV;

// ── Per-transition record ──

export interface TransitionRecord {
    route: string;
    totalMs: number;
    chunkMs: number;
    dataMs: number;
    cacheHit: boolean;
    aborted: boolean;
    stale: boolean;
    error: boolean;
    timestamp: number;
}

// ── In-memory ring buffer (last 200 transitions) ──

const MAX_RECORDS = 200;
const records: TransitionRecord[] = [];
let totalTransitions = 0;

// ── Recording ──

export function recordTransition(record: TransitionRecord): void {
    if (records.length >= MAX_RECORDS) {
        records.shift();
    }
    records.push(record);
    totalTransitions++;

    // Auto-print summary every 10 transitions in DEV
    if (isDev && totalTransitions % 10 === 0) {
        printMetricsSummary();
    }
}

// ── Aggregate computations ──

export interface TransitionAggregates {
    count: number;
    successCount: number;
    abortCount: number;
    errorCount: number;
    staleCount: number;
    avgTotalMs: number;
    p95TotalMs: number;
    avgChunkMs: number;
    avgDataMs: number;
    cacheHitRatio: number;
    abortFrequency: number;
}

export function computeAggregates(): TransitionAggregates {
    const count = records.length;
    if (count === 0) {
        return {
            count: 0, successCount: 0, abortCount: 0, errorCount: 0, staleCount: 0,
            avgTotalMs: 0, p95TotalMs: 0, avgChunkMs: 0, avgDataMs: 0,
            cacheHitRatio: 0, abortFrequency: 0,
        };
    }

    const successful = records.filter(r => !r.aborted && !r.stale && !r.error);
    const aborted = records.filter(r => r.aborted);
    const errored = records.filter(r => r.error);
    const stale = records.filter(r => r.stale);
    const cacheHits = successful.filter(r => r.cacheHit);

    // Timing aggregates (only from successful transitions)
    const totalTimes = successful.map(r => r.totalMs).sort((a, b) => a - b);
    const avgTotalMs = totalTimes.length > 0
        ? Math.round(totalTimes.reduce((s, v) => s + v, 0) / totalTimes.length)
        : 0;
    const p95TotalMs = totalTimes.length > 0
        ? Math.round(totalTimes[Math.floor(totalTimes.length * 0.95)] || totalTimes[totalTimes.length - 1])
        : 0;
    const avgChunkMs = successful.length > 0
        ? Math.round(successful.reduce((s, r) => s + r.chunkMs, 0) / successful.length)
        : 0;
    const avgDataMs = successful.length > 0
        ? Math.round(successful.reduce((s, r) => s + r.dataMs, 0) / successful.length)
        : 0;

    return {
        count,
        successCount: successful.length,
        abortCount: aborted.length,
        errorCount: errored.length,
        staleCount: stale.length,
        avgTotalMs,
        p95TotalMs,
        avgChunkMs,
        avgDataMs,
        cacheHitRatio: successful.length > 0
            ? Math.round((cacheHits.length / successful.length) * 100)
            : 0,
        abortFrequency: count > 0
            ? Math.round((aborted.length / count) * 100)
            : 0,
    };
}

// ── DEV console summary ──

export function printMetricsSummary(): void {
    if (!isDev) return;

    const agg = computeAggregates();
    console.group('[ROUTE TRANSITION METRICS]');
    console.table({
        'Total transitions': agg.count,
        'Successful': agg.successCount,
        'Aborted': agg.abortCount,
        'Stale (superseded)': agg.staleCount,
        'Errors': agg.errorCount,
        'Avg total (ms)': agg.avgTotalMs,
        'P95 total (ms)': agg.p95TotalMs,
        'Avg chunk (ms)': agg.avgChunkMs,
        'Avg data (ms)': agg.avgDataMs,
        'Cache hit ratio': `${agg.cacheHitRatio}%`,
        'Abort frequency': `${agg.abortFrequency}%`,
    });

    // Per-route breakdown
    const perRoute: Record<string, { count: number; avgMs: number; hits: number }> = {};
    for (const r of records.filter(r => !r.aborted && !r.stale && !r.error)) {
        if (!perRoute[r.route]) perRoute[r.route] = { count: 0, avgMs: 0, hits: 0 };
        const entry = perRoute[r.route];
        entry.avgMs = Math.round((entry.avgMs * entry.count + r.totalMs) / (entry.count + 1));
        entry.count++;
        if (r.cacheHit) entry.hits++;
    }
    if (Object.keys(perRoute).length > 0) {
        console.log('Per-route breakdown:');
        console.table(
            Object.fromEntries(
                Object.entries(perRoute).map(([route, d]) => [
                    route,
                    { transitions: d.count, avgMs: d.avgMs, cacheHitRate: `${Math.round((d.hits / d.count) * 100)}%` },
                ])
            )
        );
    }
    console.groupEnd();
}

// ── Raw access for tooling ──

export function getRecords(): readonly TransitionRecord[] {
    return records;
}

export function getTotalTransitions(): number {
    return totalTransitions;
}

// ── Expose on window in DEV for manual inspection ──

if (isDev && typeof window !== 'undefined') {
    (window as any).__ROUTE_METRICS__ = {
        getRecords,
        computeAggregates,
        printMetricsSummary,
    };
}
