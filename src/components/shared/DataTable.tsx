import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "./EmptyState";
import { LucideIcon, Table2 } from "lucide-react";

// ─── Types ──────────────────────────────────────────

export interface DataTableColumn<T> {
  /** Unique key for the column */
  key: string;
  /** Header label */
  header: string;
  /** Cell renderer */
  cell: (row: T, index: number) => React.ReactNode;
  /** Header alignment */
  headerAlign?: "left" | "center" | "right";
  /** Cell alignment */
  cellAlign?: "left" | "center" | "right";
  /** Column width class (e.g. "w-20", "min-w-[200px]") */
  width?: string;
  /** Allow text wrapping in this column (default: false = single-line truncate) */
  wrap?: boolean;
  /** Whether to hide on mobile */
  hideMobile?: boolean;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Unique key extractor */
  rowKey: (row: T, index: number) => string | number;
  /** Loading state */
  loading?: boolean;
  /** Custom empty state props */
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Footer row renderer */
  footer?: React.ReactNode;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Additional row className */
  rowClassName?: (row: T, index: number) => string;
  className?: string;
  /** Compact mode: tighter padding */
  compact?: boolean;
}

// ─── Component ──────────────────────────────────────

/**
 * DataTable – standard table wrapper.
 *
 * Wraps the shared Table component + EmptyState + optional footer.
 * No raw HTML <table>/<th>/<td> allowed – this is the canonical replacement.
 * Already handles overflow via the Table component wrapper.
 *
 * Usage:
 * ```tsx
 * <DataTable
 *   columns={[
 *     { key: "name", header: "Tên", cell: (row) => row.name },
 *     { key: "total", header: "Tổng", cell: (row) => formatCurrency(row.total), headerAlign: "right", cellAlign: "right" },
 *   ]}
 *   data={bookings}
 *   rowKey={(row) => row.id}
 *   emptyTitle="Chưa có booking"
 * />
 * ```
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyIcon = Table2,
  emptyTitle = "Không có dữ liệu",
  emptyDescription,
  footer,
  onRowClick,
  rowClassName,
  className,
  compact = false,
}: DataTableProps<T>) {
  const alignClass = (align?: "left" | "center" | "right") => {
    if (align === "center") return "text-center";
    if (align === "right") return "text-right";
    return "text-left";
  };

  if (loading) {
    return (
      <div className={cn("animate-shimmer rounded-lg bg-muted/30 h-64", className)} />
    );
  }

  if (data.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.key}
              className={cn(
                alignClass(col.headerAlign),
                col.width,
                col.hideMobile && "hidden md:table-cell",
              )}
            >
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow
            key={rowKey(row, i)}
            className={cn(
              onRowClick && "cursor-pointer",
              rowClassName?.(row, i),
            )}
            onClick={onRowClick ? () => onRowClick(row, i) : undefined}
          >
            {columns.map((col) => (
              <TableCell
                key={col.key}
                className={cn(
                  alignClass(col.cellAlign),
                  compact && "py-2.5",
                  col.width,
                  col.wrap && "whitespace-normal overflow-visible",
                  col.hideMobile && "hidden md:table-cell",
                )}
              >
                {col.cell(row, i)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {footer && <tfoot className="border-t bg-muted/30 font-medium">{footer}</tfoot>}
    </Table>
  );
}
