import { cn } from "@/lib/utils";

interface MobileDetailRowProps {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Compact label-value row for mobile detail screens.
 * Left = muted label, Right = value or children.
 */
export function MobileDetailRow({ label, value, children, className }: MobileDetailRowProps) {
  return (
    <div className={cn("flex items-center justify-between py-[5px] min-h-[24px]", className)}>
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-foreground text-right truncate ml-3">
        {children || value || "—"}
      </span>
    </div>
  );
}

interface MobileSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

/**
 * Full-width section block for mobile tabs.
 * Renders as bg-card with border-y, no rounded corners, full-bleed.
 */
export function MobileSection({ title, children, className, actions }: MobileSectionProps) {
  return (
    <div className={cn("border-y border-border bg-card px-4 py-2", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-1">
          {title && (
            <span className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">{title}</span>
          )}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
