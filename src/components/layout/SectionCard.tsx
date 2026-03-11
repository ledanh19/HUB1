import { cn } from "@/lib/utils";

interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
  /** Optional card title rendered as h2 or a custom element */
  title?: React.ReactNode;
  /** Optional subtitle below the title */
  subtitle?: React.ReactNode;
  /** Optional actions rendered on the right of the title row */
  actions?: React.ReactNode;
  /** Remove default padding (e.g. for full-bleed tables) */
  noPadding?: boolean;
  /** Optional inline style (e.g. animation delay) */
  style?: React.CSSProperties;
}

/**
 * SectionCard – the standard content container for all page sections.
 * White background, 16px border-radius, subtle shadow, 1px border.
 *
 * Use `noPadding` when the card contains a table or other full-bleed element,
 * then add your own padding to the title area only.
 */
export function SectionCard({
  children,
  className,
  title,
  subtitle,
  actions,
  noPadding = false,
  style,
}: SectionCardProps) {
  return (
    <div
      style={style}
      className={cn(
        "rounded-none sm:rounded-2xl bg-card border-y border-x-0 sm:border border-border shadow-subtle space-y-4 overflow-x-auto -mx-3 sm:mx-0",
        !noPadding && "p-4 md:p-5",
        className
      )}
    >
      {(title || actions) && (
        <div className={cn(
          "flex items-center justify-between gap-4",
          noPadding && "px-4 pt-4 md:px-5 md:pt-5"
        )}>
          <div className="min-w-0">
            {title && (
              <h2 className="text-base font-semibold text-foreground truncate uppercase">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
