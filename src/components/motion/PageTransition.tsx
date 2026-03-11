import { motion } from "framer-motion";
import { pageSlideIn, pageFadeUp, getReducedMotionVariants } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  variant?: "slide" | "fade";
  className?: string;
}

/**
 * Wraps page content with a mount animation.
 * - "slide": slide in from right (push navigation)
 * - "fade": fade up (default, lighter)
 */
export function PageTransition({ children, variant = "fade", className }: PageTransitionProps) {
  const reduced = useReducedMotion();
  const base = variant === "slide" ? pageSlideIn : pageFadeUp;
  const v = reduced ? getReducedMotionVariants(base) : base;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={v}
      className={className}
    >
      {children}
    </motion.div>
  );
}
