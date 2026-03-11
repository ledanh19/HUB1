import React from "react";
import { cn } from "@/lib/utils";
import { SectionCard } from "@/components/layout/SectionCard";
import { LucideIcon } from "lucide-react";

export interface MetaCardProps {
    children: React.ReactNode;
    className?: string;
    /** Optional section title — renders as font-semibold header row with icon */
    title?: string;
    /** Optional icon displayed next to the title */
    icon?: LucideIcon | React.ElementType;
}

/**
 * MetaCard
 * Canonical container for metadata cards (Owner, Guest Info, Payment, Host, Settlement).
 * Delegates to SectionCard (never raw Card).
 * Hard locks: p-4 md:p-5, space-y-4, rounded-2xl border.
 * DO NOT use raw Card for any metadata context.
 */
export function MetaCard({ children, className, title, icon: Icon }: MetaCardProps) {
    /* Build an inline title node — uses <span> (not <div>) so it stays
       valid inside SectionCard's <h2>.  Icon colour = muted per SOT. */
    const titleNode = title ? (
        <span className="inline-flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span>{title}</span>
        </span>
    ) : undefined;

    return (
        <SectionCard title={titleNode} className={cn("space-y-4 bd-card-hover", className)}>
            {children}
        </SectionCard>
    );
}
