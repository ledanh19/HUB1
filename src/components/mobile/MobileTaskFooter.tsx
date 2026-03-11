import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MobileTaskFooterProps {
    children: ReactNode;
    className?: string;
}

/**
 * Shared mobile task footer — sticky bottom action bar.
 *
 * Features:
 *  - Fixed at bottom of task page
 *  - Safe-area-aware padding
 *  - Border-top separator
 *  - Background blur for content scrolling behind
 */
export function MobileTaskFooter({ children, className }: MobileTaskFooterProps) {
    return (
        <div
            className={cn(
                "shrink-0 border-t border-border bg-card/95 backdrop-blur-sm px-4 py-3",
                className
            )}
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
        >
            {children}
        </div>
    );
}
