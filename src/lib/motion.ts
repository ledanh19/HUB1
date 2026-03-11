/**
 * ROOMRISE MOTION SYSTEM
 * ─────────────────────────
 * Native-feel transitions for mobile PMS UI.
 * All durations, easings, and variants live here.
 */

// ═══ TIMING ═══
export const DURATION = {
  instant: 0.08,
  fast: 0.12,
  normal: 0.22,
  medium: 0.28,
  slow: 0.36,
} as const;

// ═══ EASINGS (native-feel) ═══
export const EASE = {
  /** iOS-style deceleration */
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** Smooth in-out */
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
  /** Snappy spring-like */
  snap: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
} as const;

// ═══ SPRING CONFIGS ═══
export const SPRING = {
  /** Quick response, minimal bounce */
  snappy: { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.8 },
  /** Smooth deceleration */
  smooth: { type: "spring" as const, stiffness: 300, damping: 28, mass: 1 },
  /** Gentle settle */
  gentle: { type: "spring" as const, stiffness: 200, damping: 24, mass: 1 },
} as const;

// ═══ PAGE TRANSITION VARIANTS ═══

/** Push: slide in from right (navigating forward) */
export const pageSlideIn = {
  initial: { x: "30%", opacity: 0 },
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: DURATION.normal, ease: EASE.out },
  },
  exit: {
    x: "-10%",
    opacity: 0,
    transition: { duration: DURATION.fast, ease: EASE.inOut },
  },
};

/** Fade up — default page mount */
export const pageFadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.normal, ease: EASE.out },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: DURATION.fast, ease: EASE.inOut },
  },
};

// ═══ PRESS FEEDBACK ═══
export const pressScale = {
  rest: { scale: 1 },
  pressed: { scale: 0.98 },
  hover: { scale: 1.01 },
};

// ═══ BOTTOM SHEET ═══
export const bottomSheet = {
  initial: { y: "100%" },
  animate: {
    y: 0,
    transition: { duration: DURATION.normal, ease: EASE.out },
  },
  exit: {
    y: "100%",
    transition: { duration: 0.2, ease: EASE.inOut },
  },
};

export const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

// ═══ STICKY HEADER SHADOW ═══
export const stickyHeaderShadow = "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)";

// ═══ REDUCED MOTION ═══
export function getReducedMotionVariants(variants: Record<string, any>) {
  return {
    initial: { opacity: variants.initial?.opacity ?? 1 },
    animate: {
      opacity: variants.animate?.opacity ?? 1,
      transition: { duration: 0.01 },
    },
    exit: {
      opacity: variants.exit?.opacity ?? 0,
      transition: { duration: 0.01 },
    },
  };
}
