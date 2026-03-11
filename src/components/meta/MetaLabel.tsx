import React from "react";
import { cn } from "@/lib/utils";

export interface MetaLabelProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * MetaLabel
 * Canonical label for metadata blocks.
 * Hard locks: text-micro, leading-4, font-normal, text-muted-foreground.
 * Labels are sentence-case (capitalize first letter only).
 * Card titles use uppercase — labels MUST NOT.
 * NEVER use text-xs, text-sm, font-medium, font-semibold, or uppercase on labels.
 */
export function MetaLabel({ children, className }: MetaLabelProps) {
    return (
        <label className={cn("block text-micro leading-4 font-normal text-muted-foreground", className)}>
            {children}
        </label>
    );
}

