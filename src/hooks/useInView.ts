import { useEffect, useRef, useState, useCallback } from "react";

type UseInViewOptions = {
    rootMargin?: string;
    /**
     * If true (default), once inView becomes true it stays true permanently.
     * Observer disconnects after first trigger — immune to scroll-back,
     * remount, and StrictMode double-invoke.
     */
    once?: boolean;
};

/**
 * IntersectionObserver-based viewport detection hook.
 * Returns { ref, inView } — attach `ref` to a sentinel div.
 *
 * By default `once = true`: flips to `true` once and never reverts.
 * Observer is disconnected immediately after first intersection.
 *
 * SSR-safe: falls back to `inView = true` if IntersectionObserver unavailable.
 */
export function useInView(options: UseInViewOptions = {}) {
    const { rootMargin = "200px", once = true } = options;

    const ref = useRef<HTMLDivElement | null>(null);
    const [inView, setInView] = useState(false);
    // StrictMode guard: useRef survives double-invoke of effects
    const firedRef = useRef(false);

    useEffect(() => {
        if (once && firedRef.current) return; // StrictMode resilience
        if (inView) return; // once true, stay true
        if (typeof window === "undefined") return;
        if (typeof IntersectionObserver === "undefined") {
            firedRef.current = true;
            setInView(true); // fallback: render immediately
            return;
        }

        const el = ref.current;
        if (!el) return;

        const obs = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry?.isIntersecting) {
                    firedRef.current = true;
                    setInView(true);
                    obs.disconnect();
                }
            },
            { rootMargin },
        );

        obs.observe(el);
        return () => obs.disconnect();
    }, [inView, rootMargin, once]);

    return { ref, inView } as const;
}
