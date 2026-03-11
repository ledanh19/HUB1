import * as React from "react";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
  /** Right-aligned actions (buttons, toggles) */
  actions?: React.ReactNode;
}

/**
 * FilterBar – standard toolbar for search + filters + actions.
 *
 * All child inputs align to h-10 (40px) height.
 * Wraps responsively on mobile, single row on desktop.
 *
 * Usage:
 * ```tsx
 * <FilterBar actions={<Button>Export</Button>}>
 *   <DebouncedSearch … />
 *   <Select …>…</Select>
 *   <DateRangePicker … />
 * </FilterBar>
 * ```
 */
export function FilterBar({ children, className, actions }: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        "[&_input]:h-10 [&_button[role=combobox]]:h-10 [&_.select-trigger]:h-10",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {children}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
