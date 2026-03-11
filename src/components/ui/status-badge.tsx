import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * ROOMRISE STATUS BADGE - Premium Design
 * =======================================
 * - Refined shadows and borders
 * - Smooth transitions
 * - Elegant dot animation
 * - Professional color palette
 */
const statusBadgeVariants = cva(
  "inline-flex items-center gap-1 rounded-lg font-semibold transition-all duration-200 ease-out border",
  {
    variants: {
      variant: {
        // ── Gray / Muted ──────────────────────────────
        default: "bg-muted/80 text-muted-foreground border-muted-foreground/10",
        neutral: "bg-muted/80 text-muted-foreground border-muted-foreground/10",
        secondary: "bg-muted/80 text-muted-foreground border-muted-foreground/10",
        checkedOut: "bg-muted/60 text-muted-foreground border-muted-foreground/10",

        // ── Blue / Info ──────────────────────────────────────
        info: "bg-status-info-bg text-status-info border-status-info/15",
        confirmed: "bg-status-info-bg text-status-info border-status-info/15",
        approved: "bg-status-info-bg text-status-info border-status-info/15",
        inProgress: "bg-status-info-bg text-status-info border-status-info/15",
        processing: "bg-status-info-bg text-status-info border-status-info/15",

        // ── Amber / Warning ──────────────────────────
        pending: "bg-status-warning-bg text-status-warning border-status-warning/15",
        warning: "bg-status-warning-bg text-status-warning border-status-warning/15",
        manual: "bg-status-warning-bg text-status-warning border-status-warning/15",
        onHold: "bg-status-warning-bg text-status-warning border-status-warning/15",
        review: "bg-status-warning-bg text-status-warning border-status-warning/15",

        // ── Green / Success ──────────────────────────
        success: "bg-status-success-bg text-status-success border-status-success/15",
        checkedIn: "bg-status-success-bg text-status-success border-status-success/15",
        paid: "bg-status-success-bg text-status-success border-status-success/15",
        completed: "bg-status-success-bg text-status-success border-status-success/15",

        // ── Red / Danger ─────────────────────────────
        danger: "bg-status-danger-bg text-status-danger border-status-danger/15",
        destructive: "bg-status-danger-bg text-status-danger border-status-danger/15",
        noShow: "bg-status-danger-bg text-status-danger border-status-danger/15",
        cancelled: "bg-status-danger-bg text-status-danger border-status-danger/15",
        blocked: "bg-status-danger-bg text-status-danger border-status-danger/15",

        // ── Special ──────────────────────────────────────────
        imported: "bg-orange-50 text-orange-600 border-orange-300/30",
        pms: "bg-primary/10 text-primary border-primary/20",
        voucher: "bg-primary text-primary-foreground border-primary/30 shadow-sm",
      },
      size: {
        sm: "text-micro px-1 py-px",
        default: "text-micro px-1.5 py-0.5",
        lg: "text-caption px-2 py-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
  VariantProps<typeof statusBadgeVariants> {
  dot?: boolean;
}

export function StatusBadge({
  className,
  variant,
  size,
  dot = false,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span className={cn(statusBadgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {children}
    </span>
  );
}
