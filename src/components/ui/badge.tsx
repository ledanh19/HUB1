import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * ROOMRISE BADGE SYSTEM - Premium Design
 * ========================================
 * - Refined with subtle shadows
 * - Smooth hover transitions
 * - Professional color variants
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 border font-semibold transition-all duration-150 ease-out",
  {
    variants: {
      variant: {
        default: "bg-muted/80 text-muted-foreground border-muted-foreground/10 hover:-translate-y-px hover:shadow",
        secondary: "bg-secondary text-secondary-foreground border-secondary-foreground/10 hover:-translate-y-px hover:shadow",
        outline: "border-border/80 text-foreground bg-transparent hover:bg-muted/50 hover:-translate-y-px",
        primary: "bg-primary/10 text-primary border-primary/20 hover:-translate-y-px hover:shadow",
        destructive: "bg-destructive/10 text-destructive border-destructive/20 hover:-translate-y-px hover:shadow",
        success: "bg-success/10 text-success border-success/20 hover:-translate-y-px hover:shadow",
        warning: "bg-warning/10 text-warning border-warning/20 hover:-translate-y-px hover:shadow",
        info: "bg-info/10 text-info border-info/20 hover:-translate-y-px hover:shadow",
        neutral: "bg-muted/80 text-muted-foreground border-muted-foreground/10 hover:-translate-y-px hover:shadow",
        // Solid variants for emphasis
        pending: "bg-warning text-white border-warning/80 shadow-sm hover:-translate-y-px hover:shadow-md hover:bg-warning/90",
        approved: "bg-success text-white border-success/80 shadow-sm hover:-translate-y-px hover:shadow-md hover:bg-success/90",
        voucher: "bg-primary text-primary-foreground border-primary/30 shadow-sm hover:-translate-y-px hover:shadow-md hover:bg-primary/90",
      },
      size: {
        xs: "px-1.5 py-px text-micro",
        sm: "px-2 py-0.5 text-caption",
        md: "px-2.5 py-0.5 text-body",
      },
      shape: {
        pill: "rounded-lg",
        circle: "rounded-full",
      },
      mono: {
        true: "font-mono",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "xs",
      shape: "pill",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, shape, mono, dot, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(badgeVariants({ variant, size, shape, mono }), className)} {...props}>
        {dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse shrink-0" />}
        {children}
      </div>
    );
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
