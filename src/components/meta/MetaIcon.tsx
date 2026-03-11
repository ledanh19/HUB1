import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetaIconProps {
    icon: LucideIcon | React.ElementType;
    className?: string;
}

/**
 * MetaIcon
 * Canonical icon representation within MetaCards.
 * Hard lock: h-4 w-4, shrink-0, text-muted-foreground.
 * NEVER h-5 or h-3.
 */
export function MetaIcon({ icon: Icon, className }: MetaIconProps) {
    return <Icon className={cn("h-4 w-4 shrink-0 text-muted-foreground", className)} />;
}
