import React from "react";
import { cn } from "@/lib/utils";

export interface MetaPrimaryTextProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * MetaPrimaryText
 * Canonical primary text layer for metadata properties (e.g., Guest name, Owner name).
 * Hard lock: text-sm, font-semibold, text-foreground, normal line-height.
 * NO tracking-tight. NO leading-none.
 */
export function MetaPrimaryText({ children, className }: MetaPrimaryTextProps) {
    return (
        <span className={cn("text-sm font-semibold text-foreground", className)}>
            {children}
        </span>
    );
}
