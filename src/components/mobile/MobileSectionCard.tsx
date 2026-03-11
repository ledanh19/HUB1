import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

interface MobileSectionCardProps {
    children: ReactNode;
    title?: string;
    /** Optional count badge next to title */
    count?: number;
    /** Whether the section can be collapsed */
    collapsible?: boolean;
    /** Initial collapsed state (only used if collapsible=true) */
    defaultCollapsed?: boolean;
    /** Remove default padding */
    noPadding?: boolean;
    className?: string;
}

/**
 * Shared mobile section card for detail pages.
 * Edge-to-edge on mobile, rounded on desktop.
 * Supports optional collapsible behavior.
 */
export function MobileSectionCard({
    children,
    title,
    count,
    collapsible = false,
    defaultCollapsed = false,
    noPadding = false,
    className,
}: MobileSectionCardProps) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    const showContent = !collapsible || !collapsed;

    return (
        <div
            className={cn(
                "bg-card border-y border-border",
                !noPadding && "px-4 py-3",
                className
            )}
        >
            {title && (
                <button
                    type="button"
                    onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
                    className={cn(
                        "flex items-center justify-between w-full text-left",
                        collapsible && "cursor-pointer active:opacity-70",
                        noPadding && "px-4 pt-3",
                        title && showContent && "mb-3"
                    )}
                    disabled={!collapsible}
                >
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                        {count !== undefined && count > 0 && (
                            <span className="text-micro tabular-nums text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 font-medium">
                                {count}
                            </span>
                        )}
                    </div>
                    {collapsible && (
                        <ChevronDown
                            className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform duration-200",
                                collapsed && "-rotate-90"
                            )}
                        />
                    )}
                </button>
            )}
            {showContent && children}
        </div>
    );
}
