import { motion, AnimatePresence } from "framer-motion";
import { bottomSheet, backdrop, getReducedMotionVariants } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MobileSheetProps {
    /** Whether the sheet is open */
    open: boolean;
    /** Callback when sheet should close */
    onClose: () => void;
    /** Sheet content */
    children: ReactNode;
    /** Optional title */
    title?: string;
    className?: string;
}

/**
 * Shared mobile bottom sheet — content-agnostic.
 * Uses framer-motion for slide-up animation with backdrop.
 *
 * Based on MobileActionSheet pattern from BookingDetail,
 * but generalized for any content (forms, details, confirmations).
 */
export function MobileSheet({
    open,
    onClose,
    children,
    title,
    className,
}: MobileSheetProps) {
    const reduced = useReducedMotion();
    const sheetVariants = reduced
        ? getReducedMotionVariants(bottomSheet)
        : bottomSheet;
    const backdropVariants = reduced
        ? getReducedMotionVariants(backdrop)
        : backdrop;

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50">
                    {/* Backdrop */}
                    <motion.div
                        key="sheet-backdrop"
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        variants={backdropVariants}
                        className="absolute inset-0 bg-black/40"
                        onClick={onClose}
                    />

                    {/* Sheet */}
                    <motion.div
                        key="sheet-content"
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        variants={sheetVariants}
                        className={cn(
                            "absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl max-h-[85vh] flex flex-col",
                            className
                        )}
                        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
                    >
                        {/* Handle */}
                        <div className="flex justify-center pt-3 pb-1 shrink-0">
                            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
                        </div>

                        {/* Optional title */}
                        {title && (
                            <div className="px-5 py-2 border-b border-border shrink-0">
                                <p className="text-sm font-semibold text-foreground">{title}</p>
                            </div>
                        )}

                        {/* Content — scrollable */}
                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
                            {children}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
