import React from "react";
import { cn } from "@/lib/utils";

/**
 * MetaDivider
 * Canonical divider for MetaCards.
 * Hard lock: border-t border-border/50 my-3.
 */
export function MetaDivider({ className }: { className?: string }) {
    return <div className={cn("border-t border-border/50 my-3", className)} />;
}
