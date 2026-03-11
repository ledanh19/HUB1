import { ChevronRight } from "lucide-react";
import { PressableCard } from "@/components/motion/PressableCard";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MobileListItemProps {
    /** Left icon or avatar */
    leading?: ReactNode;
    /** Primary text */
    title: string;
    /** Secondary text below title */
    subtitle?: string;
    /** Right-side content (amount, date, badge) */
    trailing?: ReactNode;
    /** Additional meta line below subtitle */
    meta?: ReactNode;
    /** Click handler — navigates to detail */
    onClick?: () => void;
    /** Whether to show the chevron indicator */
    showChevron?: boolean;
    /** Dimmed state (e.g. voided items) */
    dimmed?: boolean;
    className?: string;
}

/**
 * Shared mobile list item card.
 * Replaces desktop table rows on mobile with a tappable card.
 * Uses PressableCard for native press feedback.
 */
export function MobileListItem({
    leading,
    title,
    subtitle,
    trailing,
    meta,
    onClick,
    showChevron = true,
    dimmed = false,
    className,
}: MobileListItemProps) {
    return (
        <PressableCard
            onClick={onClick}
            className={cn(
                "border border-border/60 bg-card rounded-xl px-3.5 py-3 transition-colors active:bg-muted/50",
                dimmed && "opacity-50",
                className
            )}
        >
            <div className="flex items-start gap-3">
                {/* Leading icon/avatar */}
                {leading && (
                    <div className="shrink-0 mt-0.5">{leading}</div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                                {title}
                            </p>
                            {subtitle && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                        {/* Trailing (amount, badge, etc.) */}
                        {trailing && (
                            <div className="shrink-0 text-right">
                                {trailing}
                            </div>
                        )}
                    </div>

                    {/* Meta row */}
                    {meta && (
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                            {meta}
                        </div>
                    )}
                </div>

                {/* Chevron */}
                {showChevron && onClick && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1" />
                )}
            </div>
        </PressableCard>
    );
}
