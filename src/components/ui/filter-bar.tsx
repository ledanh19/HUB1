import { cn } from "@/lib/utils";
import { Filter, RotateCcw, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface FilterBarProps {
  children: React.ReactNode;
  /** Title shown in the filter bar header (default: "Bộ lọc") */
  title?: string;
  /** Subtitle / description */
  subtitle?: string;
  /** Whether any filter is currently active */
  hasActiveFilters?: boolean;
  /** Callback to clear all filters */
  onClearFilters?: () => void;
  /** Clear button label */
  clearLabel?: string;
  /** Additional class names for the outer container */
  className?: string;
}

/**
 * FilterBar — standardized filter container for all pages.
 * Use FilterBar.Field for primary filters (always visible).
 * Use FilterBar.AdvancedSection to group secondary filters behind a toggle.
 */
export function FilterBar({
  children,
  title = "Bộ lọc",
  subtitle,
  hasActiveFilters = false,
  onClearFilters,
  clearLabel = "Đặt lại",
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        "rounded-none sm:rounded-xl border-y border-x-0 sm:border border-border bg-card p-3 sm:p-4 md:p-5 -mx-3 sm:mx-0",
        className
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <div>
            <span className="font-medium text-xs text-foreground">{title}</span>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {hasActiveFilters && onClearFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            className="h-8 gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {clearLabel}
          </Button>
        )}
      </div>

      {/* Filter fields grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        {children}
      </div>
    </div>
  );
}

interface FilterFieldProps {
  children: React.ReactNode;
  /** Field label */
  label?: string;
  /** Span multiple columns */
  colSpan?: 1 | 2 | 3 | "full";
  /** Additional class names */
  className?: string;
}

/**
 * FilterBar.Field — individual filter field with optional label.
 */
function FilterField({ children, label, colSpan, className }: FilterFieldProps) {
  return (
    <div
      className={cn(
        "space-y-1.5",
        colSpan === 2 && "col-span-2",
        colSpan === 3 && "col-span-3",
        colSpan === "full" && "col-span-full",
        className
      )}
    >
      {label && (
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

interface AdvancedSectionProps {
  children: React.ReactNode;
  /** Number of advanced filters that are currently active (shows badge) */
  activeCount?: number;
  /** Label for expand button */
  label?: string;
  /** Default open state */
  defaultOpen?: boolean;
}

/**
 * FilterBar.AdvancedSection — collapsible group for secondary filters.
 * Shows a toggle button; when expanded, renders filters in the same grid.
 */
function AdvancedSection({
  children,
  activeCount = 0,
  label = "Thêm bộ lọc",
  defaultOpen = false,
}: AdvancedSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="col-span-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mt-1 mb-1"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>{open ? "Ẩn bộ lọc" : label}</span>
        {activeCount > 0 && !open && (
          <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 md:gap-4 pt-3 mt-2 border-t border-border/50">
          {children}
        </div>
      )}
    </div>
  );
}

FilterBar.Field = FilterField;
FilterBar.AdvancedSection = AdvancedSection;
