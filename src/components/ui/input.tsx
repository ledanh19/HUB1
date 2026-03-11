import * as React from "react";

import { cn } from "@/lib/utils";

/*
  ROOMRISE INPUT - Premium Design
  ================================
  - Refined focus states with primary ring
  - Smooth transitions
  - Subtle shadow for depth
*/

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs",
          "shadow-sm transition-all duration-150 ease-out",
          "placeholder:text-muted-foreground/60",
          "hover:border-border",
          "focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
