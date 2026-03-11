import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import type { ReactNode, ComponentProps } from "react";

interface PressableCardProps extends Omit<ComponentProps<typeof motion.div>, "children"> {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Pure interaction wrapper with native-feel press feedback.
 * Scale to 0.98 on press. Does NOT apply any styling — className passes through.
 */
export function PressableCard({ children, onClick, className, disabled, ...rest }: PressableCardProps) {
  const reduced = useReducedMotion();

  if (reduced || disabled) {
    return (
      <div onClick={disabled ? undefined : onClick} className={cn(className)} {...rest as any}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      whileHover={{ scale: 1.005 }}
      transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.8 }}
      style={{ cursor: onClick ? "pointer" : undefined }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
