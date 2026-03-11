import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface SectionHeaderV2Props {
    icon?: LucideIcon;
    title: string;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

/**
 * SectionHeaderV2 — Minimal section title for dashboard.
 * Clean text, no icon boxes. Optional right-side actions.
 * Motion: title slides in from left, badge scales in delayed.
 */
export function SectionHeaderV2({
    icon: Icon,
    title,
    badge,
    actions,
    className,
}: SectionHeaderV2Props) {
    return (
        <div className={cn("flex items-center justify-between gap-3", className)}>
            <div className="flex items-center gap-2 min-w-0">
                <h2 className="dv2-section-title text-base font-semibold text-foreground truncate">
                    {title}
                </h2>
                {badge && <div className="dv2-section-badge">{badge}</div>}
            </div>
            {actions && (
                <div className="flex items-center gap-2 shrink-0">{actions}</div>
            )}
        </div>
    );
}
