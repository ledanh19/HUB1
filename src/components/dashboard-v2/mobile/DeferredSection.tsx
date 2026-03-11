/**
 * DeferredSection — Defers mounting of below-fold sections until they scroll
 * into view (or are close to viewport via rootMargin).
 *
 * On mobile, this prevents mounting heavy chart components until the user scrolls.
 * Desktop always renders immediately (no deferral).
 *
 * Uses IntersectionObserver; falls back to always-render in SSR / old browsers.
 */
import { useRef, useState, useEffect, type ReactNode } from "react";

interface DeferredSectionProps {
    children: ReactNode;
    /** Placeholder height to prevent layout shift (default: 200px) */
    placeholderHeight?: number;
    /** IntersectionObserver rootMargin (default: "200px" — pre-load 200px before viewport) */
    rootMargin?: string;
    /** If true, section is always rendered (used on desktop) */
    eager?: boolean;
    /** CSS className for the wrapping div */
    className?: string;
}

export function DeferredSection({
    children,
    placeholderHeight = 200,
    rootMargin = "200px",
    eager = false,
    className,
}: DeferredSectionProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [shouldRender, setShouldRender] = useState(eager);

    useEffect(() => {
        if (eager || shouldRender) return;
        if (typeof IntersectionObserver === "undefined") {
            setShouldRender(true);
            return;
        }

        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShouldRender(true);
                    observer.disconnect();
                }
            },
            { rootMargin }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [eager, rootMargin, shouldRender]);

    if (eager || shouldRender) {
        return <div ref={ref} className={className}>{children}</div>;
    }

    return (
        <div
            ref={ref}
            className={className}
            style={{ minHeight: placeholderHeight }}
            aria-hidden
        >
            <div className="flex items-center justify-center h-20 text-muted-foreground/30">
                <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            </div>
        </div>
    );
}
