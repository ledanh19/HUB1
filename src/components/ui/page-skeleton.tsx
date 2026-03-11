import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * PageSkeleton – Shown while a page's primary data is loading.
 * Matches the real layout structure to prevent layout shift.
 *
 * Usage:
 *   if (isLoading) return <MainLayout><PageSkeleton /></MainLayout>;
 */
interface PageSkeletonProps {
  /** Show metric cards row (default: true) */
  cards?: number;
  /** Show table skeleton (default: true) */
  table?: boolean;
  /** Number of table rows (default: 6) */
  rows?: number;
  /** Number of table columns (default: 5) */
  columns?: number;
  /** Show search/filter bar (default: true) */
  filters?: boolean;
  className?: string;
}

export function PageSkeleton({
  cards = 4,
  table = true,
  rows = 6,
  columns = 5,
  filters = true,
  className,
}: PageSkeletonProps) {
  return (
    <div className={cn("space-y-6 animate-in fade-in duration-200", className)}>
      {/* Page header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Metric cards */}
      {cards > 0 && (
        <div className={cn(
          "grid gap-4",
          cards <= 3 && "md:grid-cols-3",
          cards === 4 && "md:grid-cols-4",
          cards >= 5 && "md:grid-cols-5",
        )}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      {filters && (
        <div className="flex gap-4">
          <Skeleton className="h-9 flex-1 max-w-sm" />
          <Skeleton className="h-9 w-[180px]" />
        </div>
      )}

      {/* Table */}
      {table && <TableSkeleton rows={rows} columns={columns} />}
    </div>
  );
}

/**
 * TableSkeleton – Drop-in replacement for table loading states.
 * Renders rows matching the real table's column count to prevent layout shift.
 *
 * Usage:
 *   {isLoading ? <TableSkeleton rows={5} columns={6} /> : <RealTable />}
 */
interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
  /** Show a header row (default: true) */
  header?: boolean;
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
  header = true,
}: TableSkeletonProps) {
  // Vary column widths naturally
  const widths = ["w-24", "w-32", "w-20", "w-28", "w-16", "w-36", "w-24", "w-20"];

  return (
    <div className={cn("rounded-lg border border-border/60 bg-card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          {header && (
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {Array.from({ length: columns }).map((_, i) => (
                  <th key={i} className="px-4 py-3 text-left">
                    <Skeleton className={cn("h-3", widths[i % widths.length])} />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-border/50 last:border-0">
                {Array.from({ length: columns }).map((_, colIdx) => (
                  <td key={colIdx} className="px-4 py-3">
                    <Skeleton className={cn(
                      "h-4",
                      widths[(colIdx + rowIdx) % widths.length],
                    )} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
