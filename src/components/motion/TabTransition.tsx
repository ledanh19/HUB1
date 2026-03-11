import { motion, AnimatePresence } from "framer-motion";
import { getReducedMotionVariants } from "@/lib/motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { ReactNode } from "react";

/** Lightweight fade-only for tab switches — no horizontal translate, no blocking wait */
const tabFadeFast = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.12 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.08 },
  },
};

interface TabTransitionProps {
  tabKey: string;
  children: ReactNode;
  className?: string;
}

export function TabTransition({ tabKey, children, className }: TabTransitionProps) {
  const reduced = useReducedMotion();
  const v = reduced ? getReducedMotionVariants(tabFadeFast) : tabFadeFast;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tabKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={v}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
