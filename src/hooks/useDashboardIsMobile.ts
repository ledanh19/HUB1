import { useLayoutEffect, useState } from "react";

const MQ = "(max-width: 639px)";

/**
 * Returns true when viewport width < 640px (Tailwind `sm` breakpoint).
 * Uses matchMedia for synchronous initial state — prevents desktop→mobile flash.
 * Used to branch Dashboard rendering between mobile and desktop layouts.
 */
export function useDashboardIsMobile(): boolean {
    const getMatch = () => {
        if (typeof window === "undefined" || typeof window.matchMedia === "undefined")
            return false;
        return window.matchMedia(MQ).matches;
    };

    // Sync init from matchMedia — prevents flash on first paint
    const [isMobile, setIsMobile] = useState<boolean>(() => getMatch());

    useLayoutEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia === "undefined")
            return;

        const mql = window.matchMedia(MQ);
        const onChange = () => setIsMobile(mql.matches);

        // Re-check in layout phase (covers rare hydration mismatches)
        onChange();

        // Modern + legacy browser support
        if ("addEventListener" in mql) mql.addEventListener("change", onChange);
        else (mql as any).addListener(onChange);

        return () => {
            if ("removeEventListener" in mql)
                mql.removeEventListener("change", onChange);
            else (mql as any).removeListener(onChange);
        };
    }, []);

    return isMobile;
}
