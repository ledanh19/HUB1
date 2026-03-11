import { cn } from "@/lib/utils";

interface MetaGridProps {
    /** Number of columns at md+ breakpoint (default 5) */
    cols?: 2 | 3 | 4 | 5 | 6;
    children: React.ReactNode;
    className?: string;
}

const colsMap: Record<number, string> = {
    2: "grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
    5: "md:grid-cols-5",
    6: "md:grid-cols-6",
};

/**
 * MetaGrid — canonical label/value grid for metadata sections.
 *
 * Locks: grid grid-cols-2 md:grid-cols-{cols} gap-4
 */
export function MetaGrid({ cols = 5, children, className }: MetaGridProps) {
    return (
        <div
            className={cn("grid grid-cols-2", colsMap[cols], "gap-4", className)}
        >
            {children}
        </div>
    );
}
