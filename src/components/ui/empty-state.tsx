import { cn } from "@/lib/utils";
import { LucideIcon, Inbox } from "lucide-react";

/**
 * EmptyState – Standard empty state for tables and lists.
 *
 * Usage:
 *   <EmptyState
 *     icon={Package}
 *     title="Chưa có booking"
 *     description="Khi có booking mới, booking sẽ xuất hiện ở đây."
 *   />
 */
interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Colspan for table usage */
  colSpan?: number;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 text-center",
      className,
    )}>
      <div className="rounded-full bg-muted/60 p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground/60" />
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * TableEmptyRow – For use inside <TableBody> when there are no rows.
 */
interface TableEmptyRowProps {
  colSpan: number;
  icon?: LucideIcon;
  title?: string;
  description?: string;
}

export function TableEmptyRow({
  colSpan,
  icon,
  title = "Không có dữ liệu",
  description,
}: TableEmptyRowProps) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState icon={icon} title={title} description={description} />
      </td>
    </tr>
  );
}
