import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /** Main heading */
  title?: string;
  /** Descriptive text */
  description?: string;
  /** Lucide icon component (default: Inbox) */
  icon?: LucideIcon;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
  };
  /** Compact (inline) or full (centered block) */
  size?: "compact" | "full";
  className?: string;
  children?: React.ReactNode;
}

/**
 * EmptyState – standard "no data" placeholder.
 *
 * Replaces all ad-hoc "No data" text and custom empty states.
 * Uses only semantic tokens – dark mode ready.
 *
 * Usage:
 * ```tsx
 * <EmptyState
 *   icon={FileSearch}
 *   title="Không có dữ liệu"
 *   description="Thử thay đổi bộ lọc hoặc khoảng thời gian."
 *   action={{ label: "Reset bộ lọc", onClick: resetFilters }}
 * />
 * ```
 */
export function EmptyState({
  title = "Không có dữ liệu",
  description,
  icon: Icon = Inbox,
  action,
  size = "full",
  className,
  children,
}: EmptyStateProps) {
  if (size === "compact") {
    return (
      <div className={cn("flex items-center gap-3 py-8 px-4 text-muted-foreground", className)}>
        <Icon className="h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action && (
          <Button variant={action.variant ?? "ghost"} size="sm" onClick={action.onClick} className="ml-auto">
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      <div className="rounded-xl bg-muted/50 p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground/60" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && (
        <Button
          variant={action.variant ?? "outline"}
          size="sm"
          onClick={action.onClick}
          className="mt-4"
        >
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
