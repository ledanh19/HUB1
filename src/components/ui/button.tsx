import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
  ROOMRISE CONTROL HUB - Button System
  =====================================
  
  Theo Figma Brief:
  - Primary (navy #0B3C5D): CTA chính, 1 per screen
  - Secondary (white + border): View/navigate/cancel
  - Destructive (red #991B1B): Danger actions
  - Button press: tụt 1px (active:translate-y-px)
  
  Rules:
  - Only 1 primary button per screen
  - Hover: nhẹ nhàng, không phô trương
  - Press feedback: scale(0.98) + translate-y-px
*/

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] active:translate-y-[1px]",
  {
    variants: {
      variant: {
        // Primary = Navy #0B3C5D - Premium shadow + glow on hover
        default: "bg-primary text-primary-foreground shadow-sm hover:shadow-md hover:shadow-primary/25 hover:bg-primary-hover active:bg-primary-active active:shadow-none",

        // Destructive = Red #991B1B - Danger glow
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:shadow-md hover:shadow-destructive/25 hover:bg-destructive-hover active:shadow-none",

        // Outline/Secondary = Refined border with subtle lift
        outline: "border border-border/80 bg-transparent text-foreground shadow-sm hover:bg-muted/50 hover:border-border hover:shadow-md active:shadow-none",

        // Secondary - Soft background
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-muted hover:shadow-md active:shadow-none",

        // Ghost - Minimal, appears on hover
        ghost: "hover:bg-muted/80 hover:text-foreground",

        // Link - Smooth underline
        link: "text-primary underline-offset-4 hover:underline hover:text-primary-hover",

        // Success = Green #15803D - Success glow
        success: "bg-success text-success-foreground shadow-sm hover:shadow-md hover:shadow-success/25 hover:bg-success/90 active:shadow-none",
      },
      size: {
        default: "h-8 px-3 py-1.5 text-xs",
        sm: "h-7 rounded-md px-2.5 text-micro",
        lg: "h-9 rounded-lg px-4 text-sm font-semibold",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp data-variant={variant || "default"} className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
