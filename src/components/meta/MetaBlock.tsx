import React from "react";
import { cn } from "@/lib/utils";

export interface MetaBlockProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * MetaBlock
 * Sub-section inside MetaCard. 
 * Enforces gap-1.5 between label and content. NEVER use gap-1 or gap-3.
 */
export function MetaBlock({ children, className }: MetaBlockProps) {
    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            {children}
        </div>
    );
}
