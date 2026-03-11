import { useEffect, useCallback, useRef } from "react";

const SCROLL_PREFIX = "roomrise_mobile_scroll_";

interface UsePreservedScrollOptions {
    /** Unique key identifying this scroll context (e.g., "collections-list") */
    key: string;
    /** Whether scroll restoration is enabled (typically: currentView === "list") */
    enabled?: boolean;
}

interface UsePreservedScrollReturn {
    /** Ref to attach to the scroll container */
    scrollRef: React.RefObject<HTMLDivElement | null>;
    /** Save current scroll position (call before navigating away) */
    saveScroll: () => void;
    /** Restore saved scroll position */
    restoreScroll: () => void;
}

/**
 * Enhanced scroll preservation hook for container-based scroll regions.
 *
 * Unlike the existing useScrollPreservation (which uses window.scrollY),
 * this hook works with ref-based scroll containers (flex-1 overflow-y-auto).
 *
 * Usage:
 * ```tsx
 * const { scrollRef, saveScroll } = usePreservedScroll({ key: "collections" });
 *
 * // Attach ref to MobileTaskBody's inner container
 * <MobileTaskBody ref={scrollRef}>
 *   {items.map(item => (
 *     <MobileListItem onClick={() => { saveScroll(); goToDetail(item.id); }} />
 *   ))}
 * </MobileTaskBody>
 * ```
 */
export function usePreservedScroll({
    key,
    enabled = true,
}: UsePreservedScrollOptions): UsePreservedScrollReturn {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const storageKey = `${SCROLL_PREFIX}${key}`;
    const isRestoringRef = useRef(false);

    // Save scroll position
    const saveScroll = useCallback(() => {
        if (!enabled || isRestoringRef.current || !scrollRef.current) return;
        const scrollTop = scrollRef.current.scrollTop;
        if (scrollTop > 0) {
            sessionStorage.setItem(storageKey, String(scrollTop));
        }
    }, [storageKey, enabled]);

    // Restore scroll position
    const restoreScroll = useCallback(() => {
        if (!enabled || !scrollRef.current) return;
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
            isRestoringRef.current = true;
            const scrollTop = parseInt(saved, 10);
            requestAnimationFrame(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTo({ top: scrollTop, behavior: "instant" });
                }
                sessionStorage.removeItem(storageKey);
                setTimeout(() => {
                    isRestoringRef.current = false;
                }, 100);
            });
        }
    }, [storageKey, enabled]);

    // Restore on mount (when returning to list)
    useEffect(() => {
        if (enabled) {
            // Delay slightly to ensure content is rendered
            const timer = setTimeout(restoreScroll, 50);
            return () => clearTimeout(timer);
        }
    }, [enabled, restoreScroll]);

    return {
        scrollRef,
        saveScroll,
        restoreScroll,
    };
}
