/**
 * Route Preloaders — JS chunk preloading registry.
 *
 * Reuses the existing preload registry from lazyPage.tsx.
 * Each entry maps a route path to an import() factory that loads the chunk.
 * When the chunk is loaded, React.lazy won't show <Suspense> fallback.
 *
 * IMPORTANT: This is separate from data prefetching (routePrefetchers.ts).
 * Both must complete before navigation for a flash-free swap.
 */

// ── Internal registry ──
const preloaderRegistry = new Map<string, () => Promise<any>>();

/**
 * Register a chunk preloader for a route.
 * Called from App.tsx alongside registerRoutePreload (hover preload).
 */
export function registerRouteChunkPreloader(path: string, factory: () => Promise<any>) {
    preloaderRegistry.set(path, factory);
}

/**
 * Get the chunk preloader for a given pathname.
 * Tries exact match first, then prefix match (most specific wins).
 */
export function getRoutePreloader(pathname: string): (() => Promise<void>) | null {
    // Exact match
    if (preloaderRegistry.has(pathname)) {
        const factory = preloaderRegistry.get(pathname)!;
        return () => factory().then(() => { });
    }
    // Prefix match — find the most specific matching route
    const match = Array.from(preloaderRegistry.keys())
        .filter(route => route !== '/' && pathname.startsWith(route))
        .sort((a, b) => b.length - a.length)[0];
    if (match) {
        const factory = preloaderRegistry.get(match)!;
        return () => factory().then(() => { });
    }
    return null;
}

/**
 * Bulk register preloaders from the existing routePreloads array.
 * Call this once at app initialization.
 */
export function registerChunkPreloadersFromRoutePreloads(
    preloads: [string, () => Promise<any>][]
) {
    preloads.forEach(([path, factory]) => registerRouteChunkPreloader(path, factory));
}
