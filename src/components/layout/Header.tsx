import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Leading element (e.g. BackButton) displayed at the left edge before title */
  leadingAction?: React.ReactNode;
  /** Optional icon displayed next to the title */
  icon?: LucideIcon;
  /** Compact mode — reduces vertical padding and margin */
  compact?: boolean;
}

export function Header({ title, subtitle, actions, leadingAction, icon: Icon, compact }: HeaderProps) {
  return (
    <header
      className={cn(
        "relative rounded-none sm:rounded-2xl -mx-3 sm:mx-0",
        compact ? "px-4 py-2 mb-2" : "px-5 py-3 md:px-6 mb-0 sm:mb-4",
        // Navy gradient — Roomrise branding
        "bg-gradient-to-r from-[#0B3C5D] via-[#0E4A73] to-[#1565A0]",
        "text-white",
        "animate-fade-in",
        "shadow-sm",
        // Sticky on mobile
        "sticky top-0 z-40 sm:relative sm:z-auto",
        "overflow-hidden will-change-transform"
      )}
    >
      {/* Decorative background blobs — keep consistency, do NOT remove */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
        <div className="absolute right-1/4 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-white/[0.03]" />
      </div>

      {/* Inner content — min-h ensures consistent baseline height across all pages */}
      <div className={cn(
        "relative flex items-center justify-between gap-4",
        compact ? "min-h-[28px]" : "min-h-[40px]"
      )}>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {leadingAction}
          {Icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 shrink-0">
              <Icon className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className={cn(
              "font-bold tracking-tight truncate text-white",
              compact ? "text-sm" : "text-base md:text-lg"
            )}>
              {title}
            </h1>
            {subtitle && (
              <p className={cn(
                "text-white/70 truncate mt-0.5 font-medium",
                compact ? "text-xs" : "text-xs md:text-sm"
              )}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {actions && (
          <div
            data-slot="header-actions"
            className={cn(
              "flex items-center gap-2 shrink min-w-0 flex-wrap justify-end",

              // ── Badge-like span overrides for dark bg (scoped to .border spans) ──
              "[&_span.border]:bg-white/15 [&_span.border]:!text-white [&_span.border]:border-white/20",
              "[&_span]:!text-white",

              // ── Global button overrides (all variants) ──
              "[&_button]:!text-white",
              "[&_button]:!shadow-none",
              // Enforce consistent sizing inside header-actions (overrides page-level size prop)
              "[&_button]:!h-8 [&_button]:!px-3 [&_button]:!text-sm",
              // Focus ring: tight ring on dark bg (reset offset, white ring)
              "[&_button]:focus-visible:!ring-2 [&_button]:focus-visible:!ring-white/50 [&_button]:focus-visible:!ring-offset-0",

              // ── All buttons: transparent base, white border, isolated hover ──
              "[&_button]:!bg-transparent [&_button]:!border [&_button]:!border-white/30",
              "[&>*_button:hover]:!bg-white/20 [&>*_button:hover]:!shadow-none",
              // Ghost: no border
              "[&_button[data-variant=ghost]]:!border-transparent",

              // ── Image overrides ──
              "[&_img]:brightness-200 [&_img]:contrast-200",
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
