/**
 * Cache Pressure Monitor — Tracks React Query cache health for heavy routes.
 *
 * Monitors:
 * - Number of active heavy query caches
 * - Estimated total cache size
 * - Stale query retention
 *
 * Warns if cache grows beyond thresholds (DEV only).
 * Production: metrics available via window.__CACHE_PRESSURE__ but no console output.
 */

import { queryClient } from '@/lib/queryClient';

const isDev = import.meta.env.DEV;

// ── Thresholds ──

const CACHE_COUNT_WARNING = 50;     // Warn if more than 50 heavy query caches
const STALE_RETENTION_WARNING = 20; // Warn if more than 20 stale queries retained
const CACHE_SIZE_WARNING_MB = 10;   // Warn if estimated cache size > 10MB

// ── Known heavy query key prefixes ──

const HEAVY_KEY_PREFIXES = [
    'unified_bookings_paginated',
    'booking_filter_options',
    'booking_type_counts',
    'stays_operations',
    'declaration_warning',
    'dispute_tracking',
    'collections',
    'ota_payouts',
    'host_payables',
    'host_settlement',
    'host_deposits',
    'reports_pnl',
    'cashflow',
    'analytics',
    'ota_messages',
    'service_orders',
    'approval_requests',
    'payment_requests',
    'cash_outs',
    'dashboard',
];

function isHeavyQueryKey(key: readonly unknown[]): boolean {
    if (key.length === 0) return false;
    const first = String(key[0]);
    return HEAVY_KEY_PREFIXES.some(prefix => first.startsWith(prefix));
}

// ── Snapshot ──

export interface CachePressureSnapshot {
    totalQueryCount: number;
    heavyQueryCount: number;
    staleQueryCount: number;
    freshQueryCount: number;
    estimatedSizeBytes: number;
    estimatedSizeMB: number;
    warnings: string[];
    timestamp: number;
}

export function takeCachePressureSnapshot(): CachePressureSnapshot {
    const cache = queryClient.getQueryCache();
    const allQueries = cache.getAll();

    let heavyCount = 0;
    let staleCount = 0;
    let freshCount = 0;
    let estimatedBytes = 0;

    const now = Date.now();

    for (const query of allQueries) {
        const key = query.queryKey;
        const isHeavy = isHeavyQueryKey(key);

        if (isHeavy) {
            heavyCount++;

            // Check staleness: dataUpdatedAt + staleTime < now
            const state = query.state;
            const dataAge = state.dataUpdatedAt ? now - state.dataUpdatedAt : Infinity;
            if (dataAge > 30_000) {
                staleCount++;
            } else {
                freshCount++;
            }

            // Rough size estimate: JSON.stringify the data
            if (state.data !== undefined) {
                try {
                    const json = JSON.stringify(state.data);
                    estimatedBytes += json.length * 2; // UTF-16 chars
                } catch {
                    estimatedBytes += 1024; // Fallback estimate
                }
            }
        }
    }

    const estimatedMB = Math.round((estimatedBytes / (1024 * 1024)) * 100) / 100;
    const warnings: string[] = [];

    if (heavyCount > CACHE_COUNT_WARNING) {
        warnings.push(`⚠️ Heavy query count (${heavyCount}) exceeds threshold (${CACHE_COUNT_WARNING})`);
    }
    if (staleCount > STALE_RETENTION_WARNING) {
        warnings.push(`⚠️ Stale queries retained (${staleCount}) exceeds threshold (${STALE_RETENTION_WARNING})`);
    }
    if (estimatedMB > CACHE_SIZE_WARNING_MB) {
        warnings.push(`⚠️ Estimated cache size (${estimatedMB}MB) exceeds threshold (${CACHE_SIZE_WARNING_MB}MB)`);
    }

    return {
        totalQueryCount: allQueries.length,
        heavyQueryCount: heavyCount,
        staleQueryCount: staleCount,
        freshQueryCount: freshCount,
        estimatedSizeBytes: estimatedBytes,
        estimatedSizeMB: estimatedMB,
        warnings,
        timestamp: now,
    };
}

// ── DEV console report ──

export function printCachePressureReport(): void {
    if (!isDev) return;

    const snap = takeCachePressureSnapshot();

    console.group('[CACHE PRESSURE]');
    console.table({
        'Total queries': snap.totalQueryCount,
        'Heavy queries': snap.heavyQueryCount,
        'Fresh (< 30s)': snap.freshQueryCount,
        'Stale (> 30s)': snap.staleQueryCount,
        'Est. size': `${snap.estimatedSizeMB} MB`,
    });

    if (snap.warnings.length > 0) {
        for (const w of snap.warnings) {
            console.warn(w);
        }
    } else {
        console.log('✅ Cache pressure nominal');
    }
    console.groupEnd();
}

// ── Auto-monitor interval (DEV only, every 60s) ──

let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startCacheMonitor(intervalMs = 60_000): void {
    if (monitorInterval) return; // Already running
    monitorInterval = setInterval(() => {
        const snap = takeCachePressureSnapshot();
        if (snap.warnings.length > 0 && isDev) {
            printCachePressureReport();
        }
    }, intervalMs);
}

export function stopCacheMonitor(): void {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
}

// ── Expose on window in DEV ──

if (isDev && typeof window !== 'undefined') {
    (window as any).__CACHE_PRESSURE__ = {
        takeCachePressureSnapshot,
        printCachePressureReport,
        startCacheMonitor,
        stopCacheMonitor,
    };
}
