import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MobileDetailHeroProps {
    /** Main label (e.g., amount, title) */
    label: ReactNode;
    /** Status badge or secondary label */
    badge?: ReactNode;
    /** Key-value pairs displayed below the main label */
    items?: Array<{ label: string; value: ReactNode }>;
    className?: string;
}

/**
 * Shared mobile detail hero — compact summary at the top of detail pages.
 * Shows the primary identifier (amount, name) with status and key metrics.
 */
export function MobileDetailHero({
    label,
    badge,
    items,
    className,
}: MobileDetailHeroProps) {
    return (
        <div className={cn("bg-card border-b border-border px-4 py-4", className)}>
            {/* Main label + badge */}
            <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-xl font-bold text-foreground tabular-nums">
                    {label}
                </div>
                {badge && <div className="shrink-0">{badge}</div>}
            </div>

            {/* Key-value items grid */}
            {items && items.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {items.map((item, i) => (
                        <div key={i} className="min-w-0">
                            <p className="text-micro text-muted-foreground">{item.label}</p>
                            <p className="text-sm text-foreground truncate">{item.value}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
