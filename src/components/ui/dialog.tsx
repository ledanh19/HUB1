import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, X, Loader2 } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
  ROOMRISE MODAL/DIALOG SYSTEM - Premium Design
  ==============================================
  - Glassmorphism overlay with blur
  - Smooth entrance animations
  - Refined shadows and borders
  - Professional spacing
  - Mobile full-screen support
*/

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "duration-200",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const dialogVariants = cva(
  "fixed left-[50%] top-[50%] z-[60] grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border border-border/60 bg-card p-6 shadow-2xl shadow-black/10 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[46%] sm:rounded-xl",
  {
    variants: {
      size: {
        sm: "max-w-sm",
        default: "max-w-lg",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-xl",
        "2xl": "max-w-2xl",
        "3xl": "max-w-3xl",
        "4xl": "max-w-4xl",
        "5xl": "max-w-5xl",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  VariantProps<typeof dialogVariants> {
  /**
   * On mobile viewports (<640px), render as a full-screen page
   * instead of a centered modal popup. Gives native app feeling.
   */
  mobileFullScreen?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, size, mobileFullScreen, children, onPointerDownOutside, onInteractOutside, ...props }, ref) => {
  /**
   * FIX: Radix Dialog modal focus-trap blocks nested portaled components
   * (Popover, Select, DatePicker, Calendar, Combobox).
   * When user clicks on a portaled element outside the Dialog DOM tree,
   * the Dialog tries to close or refocus. We prevent that by checking
   * if the click target lives inside a known Radix portal.
   */
  const handlePointerDownOutside = React.useCallback(
    (e: CustomEvent<{ originalEvent: PointerEvent }>) => {
      const target = e.detail.originalEvent.target as HTMLElement;
      // Check if click target is inside a Radix portal (popover, select, etc.)
      const isInsidePortaledContent =
        target?.closest?.(
          "[data-radix-popper-content-wrapper], [data-radix-select-viewport], [role='listbox'], [data-radix-collection-item]"
        ) != null;
      if (isInsidePortaledContent) {
        e.preventDefault();
      }
      onPointerDownOutside?.(e);
    },
    [onPointerDownOutside]
  );

  const handleInteractOutside = React.useCallback(
    (e: CustomEvent<{ originalEvent: PointerEvent }> | CustomEvent<{ originalEvent: FocusEvent }>) => {
      const target = (e.detail.originalEvent as any).target as HTMLElement;
      const isInsidePortaledContent =
        target?.closest?.(
          "[data-radix-popper-content-wrapper], [data-radix-select-viewport], [role='listbox'], [data-radix-collection-item]"
        ) != null;
      if (isInsidePortaledContent) {
        e.preventDefault();
      }
      onInteractOutside?.(e as any);
    },
    [onInteractOutside]
  );

  return (
    <DialogPortal>
      <DialogOverlay className={mobileFullScreen
        ? "max-sm:bg-background max-sm:z-40 max-sm:top-[calc(3.5rem+env(safe-area-inset-top))] max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]"
        : undefined
      } />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          dialogVariants({ size }),
          mobileFullScreen && [
            // On mobile: fill content area between header and bottom nav
            // z-[45] stays below header (z-50) and bottom nav (z-50)
            "max-sm:fixed max-sm:left-0 max-sm:right-0",
            "max-sm:top-[calc(3.5rem+env(safe-area-inset-top))]",
            "max-sm:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
            "max-sm:translate-x-0 max-sm:translate-y-0",
            "max-sm:max-w-none max-sm:w-full max-sm:h-full max-sm:max-h-none",
            "max-sm:rounded-none max-sm:border-0 max-sm:p-0 max-sm:gap-0",
            "max-sm:flex max-sm:flex-col max-sm:overflow-hidden",
            "max-sm:z-[45]",
            "max-sm:data-[state=open]:slide-in-from-right-full max-sm:data-[state=closed]:slide-out-to-right-full",
            "max-sm:data-[state=open]:slide-in-from-top-0 max-sm:data-[state=closed]:slide-out-to-top-0",
            "max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100",
          ],
          className
        )}
        onPointerDownOutside={handlePointerDownOutside}
        onInteractOutside={handleInteractOutside}
        {...props}
      >
        {children}
        {/* Hide default X close button on mobile when fullscreen */}
        <DialogPrimitive.Close className={cn(
          "absolute right-4 top-4 rounded-lg p-2 text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:pointer-events-none group",
          mobileFullScreen && "max-sm:hidden"
        )}>
          <X className="h-4 w-4 transition-transform group-hover:scale-110" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * Mobile-native header for full-screen dialogs.
 * Shows a gradient header with back button, title, and optional submit action.
 * Hidden on desktop (>= sm breakpoint) where DialogHeader is used instead.
 */
interface MobileDialogHeaderProps {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  isSubmitting?: boolean;
}

function MobileDialogHeader({
  title,
  onClose,
  onSubmit,
  submitLabel = "Lưu",
  submitDisabled = false,
  isSubmitting = false,
}: MobileDialogHeaderProps) {
  return (
    <div className="sm:hidden sticky top-0 z-30 relative overflow-hidden bg-gradient-to-r from-[#0B3C5D] via-[#0E4A73] to-[#1565A0] text-white shadow-sm will-change-transform px-5 py-3">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
      </div>
      <div className="relative flex items-center min-h-[40px] gap-0.5">
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center text-white shrink-0 rounded-full hover:bg-white/15 transition-colors"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <h1 className="flex-1 text-base font-bold tracking-tight truncate ml-0.5 text-white">{title}</h1>
        {onSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled || isSubmitting}
            className="shrink-0 h-6 px-2 text-[11px] bg-white/15 hover:bg-white/25 text-white border border-white/20 shadow-none font-semibold rounded-md disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1 transition-colors"
          >
            {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 pt-5 border-t border-border/40", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-bold leading-tight tracking-tight text-foreground", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground/90 leading-relaxed", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  MobileDialogHeader,
};