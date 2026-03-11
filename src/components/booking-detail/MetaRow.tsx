import { cn } from "@/lib/utils";

interface MetaRowProps {
    label: string;
    children: React.ReactNode;
    /** Span multiple grid columns */
    colSpan?: number;
    className?: string;
}

/**
 * MetaRow — single label + value cell inside a MetaGrid.
 *
 * Locks:
 *   label → text-micro uppercase tracking-wider text-muted-foreground font-medium
 *   value → text-sm font-semibold (applied by caller or default slot)
 */
const spanMap: Record<number, string> = {
    2: "col-span-2",
    3: "col-span-3",
    4: "col-span-4",
    5: "col-span-5",
    6: "col-span-6",
};

export function MetaRow({
    label,
    children,
    colSpan,
    className,
}: MetaRowProps) {
    return (
        <div
            className={cn(colSpan && spanMap[colSpan], className)}
        >
            <p className="text-micro uppercase tracking-wider text-muted-foreground font-medium">
                {label}
            </p>
            <div className="mt-1 text-sm font-semibold text-foreground">
                {children}
            </div>
        </div>
    );
}
