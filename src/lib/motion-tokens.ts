/**
 * ═══════════════════════════════════════════════════════════
 * ROOMRISE CONTROL HUB — MOTION DESIGN SYSTEM
 * Enterprise PMS 2026 Standard
 * ═══════════════════════════════════════════════════════════
 *
 * RULES:
 * 1. Only animate `transform` and `opacity` — never `height`, `width`, `top`, `left`
 * 2. Max duration: 300ms for interactive, 1500ms for loading indicators
 * 3. Use `will-change` sparingly and remove after animation completes
 * 4. No `backdrop-blur` on scrollable regions
 * 5. Prefer CSS transitions over JS animations
 *
 * All durations in ms. All easings as CSS cubic-bezier values.
 */

// ────────────────────────────────────────────────────────────
// Duration Tokens
// ────────────────────────────────────────────────────────────
export const DURATION = {
  /** Hover, focus ring, micro-interactions */
  micro: 80,
  /** Light state toggle (checkbox, switch) */
  fast: 120,
  /** Standard state change (tab switch, filter) */
  standard: 180,
  /** Large element transitions (modal, drawer) */
  large: 240,
  /** Maximum interactive duration */
  max: 300,
} as const;

// ────────────────────────────────────────────────────────────
// Easing Tokens
// ────────────────────────────────────────────────────────────
export const EASING = {
  /** Default motion — decelerate at end */
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Enter motion — starts fast, decelerates */
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Exit motion — starts slow, accelerates */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
  /** Spring-like — overshoot slightly */
  spring: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

// ────────────────────────────────────────────────────────────
// Transition Presets (ready-to-use CSS transition values)
// ────────────────────────────────────────────────────────────
export const TRANSITION = {
  /** Micro hover/focus feedback */
  micro: `all ${DURATION.micro}ms ${EASING.standard}`,
  /** Standard interactive transition */
  standard: `all ${DURATION.standard}ms ${EASING.standard}`,
  /** Modal/dialog enter */
  modalEnter: `transform ${DURATION.large}ms ${EASING.enter}, opacity ${DURATION.standard}ms ${EASING.enter}`,
  /** Modal/dialog exit */
  modalExit: `transform ${DURATION.standard}ms ${EASING.exit}, opacity ${DURATION.fast}ms ${EASING.exit}`,
  /** Sidebar collapse/expand */
  layout: `all 300ms ${EASING.standard}`,
  /** Tab content switch */
  tabSwitch: `opacity ${DURATION.fast}ms ${EASING.standard}`,
  /** Page content enter */
  pageEnter: `opacity ${DURATION.standard}ms ${EASING.enter}, transform ${DURATION.large}ms ${EASING.enter}`,
} as const;

// ────────────────────────────────────────────────────────────
// Animation Keyframe Presets (for CSS-in-JS or Tailwind)
// ────────────────────────────────────────────────────────────
export const ANIMATION = {
  /** Fade in with slight upward movement */
  fadeInUp: `fade-in-up ${DURATION.standard}ms ${EASING.spring}`,
  /** Modal enter: scale + fade */
  modalEnter: `scale-in ${DURATION.standard}ms ${EASING.spring}`,
  /** Modal exit: scale + fade */
  modalExit: `scale-out ${DURATION.fast}ms ${EASING.exit}`,
  /** Slide in from right (drawer) */
  slideInRight: `slide-in-right ${DURATION.large}ms ${EASING.spring}`,
  /** Slide out to right (drawer) */
  slideOutRight: `slide-out-right ${DURATION.standard}ms ${EASING.exit}`,
} as const;

// ────────────────────────────────────────────────────────────
// Spacing & Layout Tokens (4px / 8px grid)
// ────────────────────────────────────────────────────────────
export const SPACING = {
  /** 4px — micro gap, icon-to-text */
  xs: 4,
  /** 8px — compact gap, chip padding */
  sm: 8,
  /** 12px — default gap */
  md: 12,
  /** 16px — section gap */
  lg: 16,
  /** 20px — card padding (mobile) */
  xl: 20,
  /** 24px — card padding (desktop), section gap */
  '2xl': 24,
  /** 32px — page section separator */
  '3xl': 32,
} as const;

// ────────────────────────────────────────────────────────────
// Typography Scale
// ────────────────────────────────────────────────────────────
export const FONT_SIZE = {
  /** 11px — helper text, footnotes */
  xs: '0.6875rem',
  /** 12px — captions, badges */
  sm: '0.75rem',
  /** 13px — secondary text, table cells */
  base: '0.8125rem',
  /** 14px — body text */
  md: '0.875rem',
  /** 16px — subheadings */
  lg: '1rem',
  /** 18px — section headings */
  xl: '1.125rem',
  /** 20px — page heading */
  '2xl': '1.25rem',
  /** 24px — dashboard KPI */
  '3xl': '1.5rem',
  /** 30px — large KPI numbers */
  '4xl': '1.875rem',
} as const;

export const FONT_WEIGHT = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

// ────────────────────────────────────────────────────────────
// Background Hierarchy
// ────────────────────────────────────────────────────────────
export const BG_HIERARCHY = {
  /** Page background — subtle gray */
  page: 'bg-background',
  /** Card/panel background — white */
  card: 'bg-card',
  /** Section within card — very subtle gray */
  section: 'bg-muted/30',
  /** Elevated overlay — dialogs, popovers */
  elevated: 'bg-card',
} as const;

// ────────────────────────────────────────────────────────────
// Shadow Hierarchy
// ────────────────────────────────────────────────────────────
export const SHADOW = {
  /** Flat — no shadow */
  none: 'shadow-none',
  /** Subtle card elevation */
  subtle: 'shadow-subtle',
  /** Standard card shadow */
  card: 'shadow-card',
  /** Elevated dropdowns/popovers */
  elevated: 'shadow-elevated',
  /** Modal/dialog overlay */
  modal: 'shadow-modal',
} as const;

// ────────────────────────────────────────────────────────────
// Border Radius
// ────────────────────────────────────────────────────────────
export const RADIUS = {
  /** 4px — badges, chips */
  sm: 'rounded',
  /** 8px — buttons, inputs */
  md: 'rounded-lg',
  /** 12px — cards */
  lg: 'rounded-xl',
  /** 16px — large panels, modals */
  xl: 'rounded-2xl',
  /** Full — avatars, toggles */
  full: 'rounded-full',
} as const;

// ────────────────────────────────────────────────────────────
// Performance Rules (reference only)
// ────────────────────────────────────────────────────────────
export const PERF_RULES = {
  /** Max rows before pagination is required */
  MAX_CLIENT_ROWS: 100,
  /** Debounce delay for search/filter inputs */
  DEBOUNCE_MS: 300,
  /** Max stale time for operational data */
  STALE_TIME_OPS: 30_000,
  /** Max stale time for reference/config data */
  STALE_TIME_REF: 5 * 60_000,
  /** Virtualization threshold (enable above this row count) */
  VIRTUAL_THRESHOLD: 50,
  /** No `backdrop-blur` on elements wider than this (px) */
  MAX_BLUR_WIDTH: 400,
} as const;
