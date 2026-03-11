import React, { Suspense, memo } from 'react';
import { PageSkeleton } from '@/components/ui/page-skeleton';

// ── FIX #5: Route preload registry — sidebar triggers on hover ──
const preloadRegistry = new Map<string, () => Promise<any>>();

/** Register a route path → lazy factory for preloading */
export function registerRoutePreload(path: string, factory: () => Promise<any>) {
  preloadRegistry.set(path, factory);
}

/** Preload a route chunk by path (idempotent — vite caches the import) */
export function preloadRoute(path: string) {
  const factory = preloadRegistry.get(path);
  if (factory) {
    factory().catch(() => {/* swallow — network error is fine for preload */});
  }
}

/**
 * Route-level lazy loading wrapper.
 * Use this to lazy-load page components for code splitting.
 *
 * Usage:
 * ```ts
 * const BookingsPage = lazyPage(() => import('./pages/BookingsPage'));
 * ```
 */
export function lazyPage(
  factory: () => Promise<{ default: React.ComponentType<any> }>,
  fallback?: React.ReactNode
) {
  const LazyComponent = React.lazy(factory);

  const WrappedLazy = memo(function LazyPageWrapper(props: any) {
    return (
      <Suspense fallback={fallback ?? <DefaultPageFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  });

  WrappedLazy.displayName = `LazyPage(${factory.toString().slice(0, 60)})`;
  return WrappedLazy;
}

/**
 * Default fallback while lazy page is loading.
 * Shows a skeleton that matches the typical page layout,
 * so the user sees consistent structure instead of a blank screen.
 */
function DefaultPageFallback() {
  return (
    <div className="min-h-[60vh] animate-fade-in">
      <PageSkeleton cards={4} rows={8} columns={6} />
    </div>
  );
}
