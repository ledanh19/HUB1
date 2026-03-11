import * as React from "react";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TruncatedCellProps {
    /** Visible inline content (will be truncated) */
    children: React.ReactNode;
    /** Tooltip content — defaults to children if omitted */
    tooltip?: React.ReactNode;
    /** Additional className for the trigger span */
    className?: string;
    /** Max-width token, e.g. "max-w-[200px]" */
    maxWidth?: string;
}

/**
 * TruncatedCell — single-line text with ellipsis + tooltip on hover.
 *
 * Assumes a `<TooltipProvider>` exists higher in the tree (App root).
 * Use inside table cells for columns with potentially long text.
 *
 * Usage:
 * ```tsx
 * <TruncatedCell maxWidth="max-w-[200px]" tooltip="Full property name + details">
 *   Short display text…
 * </TruncatedCell>
 * ```
 */
export function TruncatedCell({
    children,
    tooltip,
    className,
    maxWidth,
}: TruncatedCellProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    className={cn(
                        "block truncate",
                        maxWidth,
                        className,
                    )}
                >
                    {children}
                </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
                {tooltip ?? children}
            </TooltipContent>
        </Tooltip>
    );
}
