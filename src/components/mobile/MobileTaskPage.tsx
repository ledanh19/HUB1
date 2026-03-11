import { motion } from "framer-motion";
import { pageSlideIn, pageFadeUp, getReducedMotionVariants } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MobileTaskPageProps {
    children: ReactNode;
    /** "list" = fade-up mount | "detail" = slide-from-right push */
    variant?: "list" | "detail";
    className?: string;
}

/**
 * Shared mobile task page shell.
 *
 * Wraps children in a full-height flex column with motion animation.
 * Height is inherited from the shell's content area — NO viewport calc.
 *
 * Compose with:
 *  - MobileTaskHeader (top)
 *  - MobileTaskBody   (scrollable content, flex-1)
 *  - MobileTaskFooter (sticky bottom, optional)
 *
 * Example:
 * ```tsx
 * <MobileTaskPage variant="detail">
 *   <MobileTaskHeader title="Detail" onBack={goBack} />
 *   <MobileTaskBody>
 *     ...content...
 *   </MobileTaskBody>
 *   <MobileTaskFooter>
 *     <Button>Primary Action</Button>
 *   </MobileTaskFooter>
 * </MobileTaskPage>
 * ```
 */
export function MobileTaskPage({
    children,
    variant = "list",
    className,
}: MobileTaskPageProps) {
    const reduced = useReducedMotion();
    const baseVariants = variant === "detail" ? pageSlideIn : pageFadeUp;
    const v = reduced ? getReducedMotionVariants(baseVariants) : baseVariants;

    const content = (
        <div className={cn("h-full flex flex-col bg-background overflow-hidden", className)}>
            {children}
        </div>
    );

    if (reduced) {
        return content;
    }

    return (
        <motion.div
            initial={v.initial}
            animate={v.animate}
            className="h-full"
        >
            {content}
        </motion.div>
    );
}
