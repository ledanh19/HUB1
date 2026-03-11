import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataTablePaginationProps {
  /** Current 1-based page number */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Total items (unfiltered or filtered) */
  totalItems: number;
  /** Number of items currently displayed on this page */
  displayedItems: number;
  /** Current page size */
  pageSize: number;
  /** Options for the page size dropdown */
  pageSizeOptions?: number[];
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Callback when page size changes */
  onPageSizeChange?: (size: number) => void;
  /** Label for items, e.g. "booking", "đơn", "dòng" */
  itemLabel?: string;
  /** Additional class names */
  className?: string;
}

/**
 * DataTablePagination — standardized table footer for all data tables.
 * Shows "Hiển thị X / Y {label}" + page size selector + prev/next navigation.
 */
export function DataTablePagination({
  currentPage,
  totalPages,
  totalItems,
  displayedItems,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  itemLabel = "dòng",
  className,
}: DataTablePaginationProps) {
  if (totalItems === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 px-3 sm:px-4 py-2 sm:py-3 border-t border-border bg-muted/20",
        className
      )}
    >
      {/* Left: count + page size */}
      <div className="flex items-center gap-4">
        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
          Hiển thị {displayedItems} / {totalItems} {itemLabel}
        </span>

        {onPageSizeChange && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Số dòng:
            </span>
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="w-[72px] h-8 bg-muted/50 border border-border text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={opt.toString()}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Right: page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Trang {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
