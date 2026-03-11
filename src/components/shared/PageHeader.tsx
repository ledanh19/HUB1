import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  /** Page title (rendered as h1 visually, but semantically it's the page heading) */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Leading icon */
  icon?: LucideIcon;
  /** Right-aligned actions */
  actions?: React.ReactNode;
  /** Optional breadcrumb or back link above the title */
  breadcrumb?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader – standard page title + actions block.
 *
 * Renders BELOW Header banner (inside PageContainer).
 * Use when a page needs a prominent title + action buttons.
 * Not all pages need this — many use SectionCard titles instead.
 *
 * Usage:
 * ```tsx
 * <PageContainer>
 *   <PageHeader
 *     title="Quản lý booking"
 *     description="Tổng hợp tất cả đặt phòng"
 *     icon={Calendar}
 *     actions={<Button>Tạo booking</Button>}
 *   />
 *   <SectionCard>…</SectionCard>
 * </PageContainer>
 * ```
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  breadcrumb,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {breadcrumb && <div className="mb-1">{breadcrumb}</div>}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="rounded-lg bg-primary/10 p-1.5 shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-page font-bold tracking-tight text-foreground truncate">
              {title}
            </h1>
            {description && (
              <p className="text-body text-muted-foreground mt-0.5 truncate">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
