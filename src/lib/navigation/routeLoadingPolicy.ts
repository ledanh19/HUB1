/**
 * Route Loading Policy — Single source of truth for heavy vs light routes.
 *
 * HEAVY_BLOCK routes use "hold + prefetch + swap" behavior:
 *   - Keep current UI visible
 *   - Prefetch JS chunk + critical data in background
 *   - Only navigate when both are ready
 *
 * All other routes navigate immediately (skeleton fallback).
 *
 * GOVERNANCE: Every HEAVY route MUST have both a preloader (chunk)
 * and a prefetcher (data) registered. DEV mode will log errors if missing.
 */

// ── HEAVY routes that require data prefetch before navigation ──
// Only include routes that users actually navigate to from the Sidebar.
// Each must have a matching chunk preloader AND data prefetcher.
export const HEAVY_ROUTES: string[] = [
    '/',                          // Dashboard — aggregation KPIs + charts (EXACT match)
    '/bookings',                  // Paginated table + filter options + type counts
    '/stays',                     // Large dataset with operations
    '/collections',               // Financial data table
    '/ota-payouts',               // Financial aggregations
    '/disputes',                  // Financial disputes table
    '/host-payables',             // Complex payables view
    '/host-deposits',             // Deposits table
    '/reports/pnl',               // P&L report — heavy aggregation
    '/reports/cashflow',          // Cashflow report — heavy aggregation
    '/reports/collections',       // Collection reports
    '/analytics',                 // Multiple chart queries
    '/ota-messages',              // Conversations + enrichment
    '/services/orders',           // Service orders table (sidebar: /services)
    '/approvals',                 // Approvals queue
    '/payments/requests',         // Payment requests + stats
    '/payments/cashout',          // Cash out records
];

/**
 * Check if a given pathname is a HEAVY route.
 * '/' uses EXACT match only (avoid matching everything).
 * Others use prefix match for nested routes (e.g. /bookings/123).
 */
export function isHeavyRoute(pathname: string): boolean {
    return HEAVY_ROUTES.some(route => {
        if (route === '/') return pathname === '/';
        return pathname === route || pathname.startsWith(route + '/');
    });
}

/**
 * Route classification for governance reporting.
 */
export type RouteClassification = 'HEAVY_BLOCK' | 'LIGHT';

export function classifyRoute(pathname: string): RouteClassification {
    return isHeavyRoute(pathname) ? 'HEAVY_BLOCK' : 'LIGHT';
}
