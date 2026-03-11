/**
 * TopRouteLoadingBar — Premium indeterminate loading bar for route transitions.
 *
 * DEFINITIVE BAR VISIBILITY FIX:
 * - Uses elapsed time from context startTime (not just boolean state)
 * - 150ms debounce: bar becomes visible only if transition >150ms
 * - Minimum visible time 300ms AFTER becoming visible (prevent flash)
 * - succeed() cannot hide bar before debounce triggers because we check
 *   elapsed time, not just isLoading boolean
 */

import { useEffect, useRef, useState } from 'react';
import { useRouteTransition } from '@/contexts/RouteTransitionContext';

const DEBOUNCE_MS = 150;
const MIN_VISIBLE_MS = 300;

export function TopRouteLoadingBar() {
    const { state } = useRouteTransition();
    const isLoading = state.status === 'PREFETCHING' || state.status === 'TIMEOUT';

    const [visible, setVisible] = useState(false);
    const visibleSinceRef = useRef<number | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Clean up any pending hide timer
        if (hideRef.current) {
            clearTimeout(hideRef.current);
            hideRef.current = null;
        }

        if (isLoading) {
            // Start debounce: show bar after 150ms of continuous loading
            if (!visible && !debounceRef.current) {
                debounceRef.current = setTimeout(() => {
                    debounceRef.current = null;
                    setVisible(true);
                    visibleSinceRef.current = Date.now();
                }, DEBOUNCE_MS);
            }
        } else {
            // Loading ended
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }

            if (visible && visibleSinceRef.current) {
                // Ensure minimum visible time before hiding
                const elapsed = Date.now() - visibleSinceRef.current;
                const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
                hideRef.current = setTimeout(() => {
                    setVisible(false);
                    visibleSinceRef.current = null;
                    hideRef.current = null;
                }, remaining + 200); // +200ms for fade-out transition
            } else {
                // Never became visible — hide immediately
                setVisible(false);
                visibleSinceRef.current = null;
            }
        }

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [isLoading, visible]);

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[9999] h-1.5 overflow-hidden pointer-events-none transition-opacity duration-200"
            style={{ opacity: visible ? 1 : 0 }}
            role="progressbar"
            aria-label="Đang tải trang..."
            aria-busy={isLoading}
        >
            {/* Animated indeterminate bar */}
            <div
                className="absolute inset-y-0 animate-route-bar bg-gradient-to-r from-transparent via-foreground/30 to-transparent dark:via-foreground/20"
            />
        </div>
    );
}
