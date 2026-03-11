import { motion, AnimatePresence } from "framer-motion";
import { bottomSheet, backdrop, getReducedMotionVariants } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface ActionSheetItem {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface MobileActionSheetProps {
  open: boolean;
  onClose: () => void;
  items: ActionSheetItem[];
  title?: string;
}

export function MobileActionSheet({ open, onClose, items, title }: MobileActionSheetProps) {
  const reduced = useReducedMotion();
  const sheetVariants = reduced ? getReducedMotionVariants(bottomSheet) : bottomSheet;
  const backdropVariants = reduced ? getReducedMotionVariants(backdrop) : backdrop;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <motion.div
            key="action-sheet-backdrop"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={backdropVariants}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            key="action-sheet-content"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={sheetVariants}
            className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl pb-safe"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>

            {title && (
              <div className="px-5 py-2 border-b border-border">
                <p className="text-sm font-semibold text-foreground">{title}</p>
              </div>
            )}

            {/* Action items */}
            <div className="py-2">
              {items.map((item, i) => (
                <div key={i}>
                  {item.separator && <div className="h-px bg-border mx-4 my-1" />}
                  <button
                    onClick={() => {
                      if (!item.disabled) {
                        item.onClick();
                        onClose();
                      }
                    }}
                    disabled={item.disabled}
                    className={cn(
                      "w-full flex items-center gap-3 px-5 min-h-[48px] text-sm font-medium",
                      "active:bg-muted/60 transition-colors",
                      item.disabled && "opacity-40 pointer-events-none",
                      item.destructive
                        ? "text-destructive"
                        : "text-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {item.label}
                  </button>
                </div>
              ))}
            </div>

            {/* Cancel button */}
            <div className="px-4 pb-2">
              <button
                onClick={onClose}
                className="w-full min-h-[48px] rounded-xl bg-muted text-sm font-semibold text-foreground active:bg-muted/80 transition-colors"
              >
                Đóng
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
