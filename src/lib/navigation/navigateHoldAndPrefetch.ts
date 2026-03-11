/**
 * navigateHoldAndPrefetch — Core navigation function for heavy routes.
 *
 * Flow:
 * 1. If light route → navigate immediately (unchanged behavior)
 * 2. If heavy route:
 *    a. Keep current UI visible (no navigation yet)
 *    b. Show loading bar via RouteTransitionContext
 *    c. Abort any previous in-flight request (AbortController)
 *    d. Run in PARALLEL: Promise.all([preloadChunk, prefetchData])
 *    e. On success → navigate (page reads warm cache + loaded chunk, zero flash)
 *    f. On fail → stay on old page, show error with retry
 *    g. Timeout timer (10s) → only changes overlay UI, does NOT auto-cancel
 *
 * Concurrency: "latest wins" — each call increments requestId,
 * stale completions are ignored.
 *
 * DEV governance: if heavy route is missing preloader or prefetcher → ERROR state.
 */

import { getRoutePreloader } from './routePreloaders';
import { getRoutePrefetcher } from './routePrefetchRegistry';
import { recordTransition } from './transitionMetrics';
import { startCacheMonitor } from './cachePressureMonitor';
import type { RouteTransitionActions } from '@/contexts/RouteTransitionContext';
import type { NavigateFunction } from 'react-router-dom';

let cacheMonitorStarted = false;

const TIMEOUT_MS = 10_000;
const isDev = import.meta.env.DEV;

interface NavigateOptions {
    to: string;
    navigate: NavigateFunction;
    actions: RouteTransitionActions;
}

export async function navigateHoldAndPrefetch({ to, navigate, actions }: NavigateOptions): Promise<void> {
    // ── Resolve preloader + prefetcher (both optional) ──
    const preloader = getRoutePreloader(to);
    const prefetcher = getRoutePrefetcher(to);

    // If NEITHER preloader NOR prefetcher exists, navigate immediately
    // (truly static pages like /login, external links, etc.)
    if (!preloader && !prefetcher) {
        navigate(to);
        return;
    }

    // ── Create retry function (captures `to`) ──
    const retryFn = () => navigateHoldAndPrefetch({ to, navigate, actions });

    // ── Start transition ──
    const requestId = actions.start(to, retryFn);
    const abortController = actions.getAbortController();
    const signal = abortController?.signal;
    const t0 = performance.now();
    let chunkMs = 0;
    let dataMs = 0;

    // Start cache monitor on first heavy transition
    if (!cacheMonitorStarted) {
        cacheMonitorStarted = true;
        startCacheMonitor();
    }

    if (isDev) {
        console.group(`[TRANSITION] ${to}`);
        console.log('requestId:', requestId, '| startAt:', Math.round(t0));
    }

    // ── Timeout watcher (only changes UI, does NOT cancel) ──
    const timeoutId = setTimeout(() => {
        if (actions.getRequestId() === requestId) {
            actions.timeout();
            if (isDev) {
                console.warn(`⏱ Timeout after ${TIMEOUT_MS}ms`);
            }
        }
    }, TIMEOUT_MS);

    try {
        // ── Run chunk preload + data prefetch in PARALLEL ──
        // Either can be null if not registered for this route — just skip it
        const chunkPromise = preloader ? (async () => {
            const ct0 = performance.now();
            await preloader();
            chunkMs = Math.round(performance.now() - ct0);
            if (isDev) console.log(`📦 chunk: ${chunkMs}ms`);
        })() : Promise.resolve();

        const dataPromise = (prefetcher && signal) ? (async () => {
            const dt0 = performance.now();
            await prefetcher({ signal, to });
            dataMs = Math.round(performance.now() - dt0);
            if (isDev) console.log(`📊 data: ${dataMs}ms`);
        })() : Promise.resolve();

        // Wait for BOTH to complete
        await Promise.all([chunkPromise, dataPromise]);

        // ── Staleness check: is this still the latest request? ──
        if (actions.getRequestId() !== requestId) {
            if (isDev) {
                console.log(`🔄 Stale request ignored (id ${requestId})`);
                console.groupEnd();
            }
            clearTimeout(timeoutId);
            recordTransition({ route: to, totalMs: Math.round(performance.now() - t0), chunkMs, dataMs, cacheHit: false, aborted: false, stale: true, error: false, timestamp: Date.now() });
            return;
        }

        // ── Abort check ──
        if (signal?.aborted) {
            if (isDev) {
                console.log('🚫 Aborted');
                console.groupEnd();
            }
            clearTimeout(timeoutId);
            recordTransition({ route: to, totalMs: Math.round(performance.now() - t0), chunkMs, dataMs, cacheHit: false, aborted: true, stale: false, error: false, timestamp: Date.now() });
            return;
        }

        // ── SUCCESS: Navigate → page finds warm cache + loaded chunk ──
        clearTimeout(timeoutId);
        navigate(to);

        // Double rAF: ensure the browser has painted the new page
        // before we tell the loading bar to hide.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                actions.succeed();
            });
        });

        const totalMs = Math.round(performance.now() - t0);
        // Cache hit = data arrived fast enough that chunk was the bottleneck
        const cacheHit = dataMs < 50;
        recordTransition({ route: to, totalMs, chunkMs, dataMs, cacheHit, aborted: false, stale: false, error: false, timestamp: Date.now() });

        if (isDev) {
            console.log(`✅ navigate() called | total: ${totalMs}ms`);
            console.groupEnd();
        }
    } catch (error: any) {
        clearTimeout(timeoutId);

        // Ignore AbortError — user cancelled or navigation superseded
        if (error?.name === 'AbortError') {
            if (isDev) {
                console.log('🚫 Aborted');
                console.groupEnd();
            }
            recordTransition({ route: to, totalMs: Math.round(performance.now() - t0), chunkMs, dataMs, cacheHit: false, aborted: true, stale: false, error: false, timestamp: Date.now() });
            return;
        }

        // Check if still current request
        if (actions.getRequestId() !== requestId) {
            if (isDev) console.groupEnd();
            return;
        }

        const errorTotalMs = Math.round(performance.now() - t0);
        recordTransition({ route: to, totalMs: errorTotalMs, chunkMs, dataMs, cacheHit: false, aborted: false, stale: false, error: true, timestamp: Date.now() });

        if (isDev) {
            console.error(`❌ Failed: ${errorTotalMs}ms`, error);
            console.groupEnd();
        }

        actions.fail(
            error instanceof Error ? error : new Error(String(error)),
            retryFn
        );
    }
}

/**
 * Create a stable navigate-with-prefetch function for use in components.
 * Usage: const nav = createNavigateWithPrefetch(navigate, actions);
 *        onClick={() => nav('/bookings')}
 */
export function createNavigateWithPrefetch(
    navigate: NavigateFunction,
    actions: RouteTransitionActions
) {
    return (to: string) => navigateHoldAndPrefetch({ to, navigate, actions });
}
