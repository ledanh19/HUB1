import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MobileTaskBodyProps {
    children: ReactNode;
    className?: string;
    /** Padding variant: "default" adds px-4 py-4, "none" removes all padding */
    padding?: "default" | "none";
}

/**
 * Shared mobile task body — the single primary scroll region.
 *
 * Rules:
 *  - flex-1 min-h-0 → inherits height from parent flex column
 *  - overflow-y-auto → single scroll region
 *  - overscroll-contain → prevents scroll chaining to parent
 *  - No viewport calc — height comes from flex chain
 */
export const MobileTaskBody = forwardRef<HTMLDivElement, MobileTaskBodyProps>(
    function MobileTaskBody({ children, className, padding = "default" }, ref) {
        return (
            <div
                ref={ref}
                className={cn(
                    "flex-1 min-h-0 overflow-y-auto overscroll-contain",
                    padding === "default" && "px-4 py-4",
                    className
                )}
            >
                {children}
            </div>
        );
    }
);
