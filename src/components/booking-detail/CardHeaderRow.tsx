import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface CardHeaderRowProps {
    icon?: LucideIcon;
    title: string;
    children?: React.ReactNode;
    className?: string;
}

/**
 * CardHeaderRow — canonical header for left-column SectionCards.
 *
 * Locks: icon h-4 w-4 text-muted-foreground · title text-base font-semibold tracking-tight
 * Right slot: pass children for badges, buttons, etc.
 */
export function CardHeaderRow({
    icon: Icon,
    title,
    children,
    className,
}: CardHeaderRowProps) {
    return (
        <div
            className={cn(
                "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2",
                className
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                {Icon && (
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <h2 className="text-base font-semibold tracking-tight uppercase">{title}</h2>
            </div>
            {children && (
                <div className="flex items-center gap-2 flex-wrap">{children}</div>
            )}
        </div>
    );
}
