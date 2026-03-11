import React from "react";
import { cn } from "@/lib/utils";

export interface MetaSecondaryTextProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * MetaSecondaryText
 * Canonical secondary text layer (e.g., "Assigned 2 hours ago", subtitle data).
 * Hard lock: text-xs, text-muted-foreground.
 * NO leading-none (to preserve Vietnamese diacritics).
 */
export function MetaSecondaryText({ children, className }: MetaSecondaryTextProps) {
    return (
        <span className={cn("text-xs text-muted-foreground", className)}>
            {children}
        </span>
    );
}
