/**
 * OTA Operations UI Tokens
 * Design system constants for clean, premium UI
 * 
 * POLICY:
 * - NO emoji in UI
 * - Lucide icons only when meaningful (calendar, paperclip, comment, more)
 * - Max 3 accent colors visible at once
 * - Typography hierarchy: title > hint > meta
 */

// ============================================================
// SPACING
// ============================================================

export const SPACING = {
  cardPadding: 'p-3',           // 12px
  cardPaddingX: 'px-3',
  cardPaddingY: 'py-2',
  cardGap: 'gap-2',             // 8px
  sectionGap: 'gap-4',          // 16px
  columnGap: 'gap-3',           // 12px
  inlineGap: 'gap-1.5',         // 6px
} as const;

// ============================================================
// BORDER RADIUS
// ============================================================

export const RADIUS = {
  card: 'rounded-xl',           // 12px
  badge: 'rounded-md',          // 6px
  button: 'rounded-lg',         // 8px
  chip: 'rounded',              // 4px
} as const;

// ============================================================
// SHADOWS
// ============================================================

export const SHADOW = {
  card: 'shadow-sm',
  cardHover: 'shadow-md',
  cardDragging: 'shadow-lg ring-2 ring-primary/20',
} as const;

// ============================================================
// TYPOGRAPHY
// ============================================================

export const TYPOGRAPHY = {
  cardTitle: 'text-sm font-semibold leading-snug',
  cardHint: 'text-xs text-muted-foreground leading-tight',
  cardMeta: 'text-xs text-muted-foreground',
  badgeText: 'text-micro font-medium',
  chipText: 'text-micro font-medium',
  columnHeader: 'text-sm font-medium text-foreground',
  columnCount: 'text-xs text-muted-foreground',
  sectionTitle: 'text-sm font-medium',
  bodyText: 'text-sm text-foreground',
  mutedText: 'text-sm text-muted-foreground',
} as const;

// ============================================================
// URGENCY COLORS (Border-left style)
// ============================================================

export const URGENCY = {
  overdue: {
    border: 'border-l-4 border-l-destructive',
    chip: 'bg-destructive/10 text-destructive border border-destructive/20',
    chipLabel: 'Overdue',
  },
  today: {
    border: 'border-l-4 border-l-warning',
    chip: 'bg-warning/10 text-warning border border-warning/20',
    chipLabel: 'Today',
  },
  soon: {
    border: 'border-l-4 border-l-warning/60',
    chip: 'bg-warning/10 text-warning border border-warning/20',
    chipLabel: 'Soon',
  },
  normal: {
    border: '',
    chip: '',
    chipLabel: '',
  },
} as const;

export type UrgencyLevel = keyof typeof URGENCY;

// ============================================================
// STATUS COLORS (Muted, professional)
// ============================================================

export const STATUS_STYLES = {
  TODO: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
    label: 'Chờ xử lý',
  },
  IN_PROGRESS: {
    bg: 'bg-info/10',
    text: 'text-info',
    badge: 'bg-info/10 text-info',
    dot: 'bg-info',
    label: 'Đang làm',
  },
  REVIEW: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    badge: 'bg-warning/10 text-warning',
    dot: 'bg-warning',
    label: 'Chờ duyệt',
  },
  DONE: {
    bg: 'bg-success/10',
    text: 'text-success',
    badge: 'bg-success/10 text-success',
    dot: 'bg-success',
    label: 'Hoàn thành',
  },
  BLOCKED: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    badge: 'bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
    label: 'Bị chặn',
  },
  CANCELLED: {
    bg: 'bg-muted/60',
    text: 'text-muted-foreground',
    badge: 'bg-muted/60 text-muted-foreground',
    dot: 'bg-muted-foreground',
    label: 'Đã hủy',
  },
} as const;

// ============================================================
// WORK TYPE STYLES (Muted pills, NO emoji)
// ============================================================

export const WORK_TYPE_STYLES = {
  ONBOARDING: {
    bg: 'bg-primary/10',
    text: 'text-primary',
    border: 'border-primary/20',
    label: 'Onboarding',
  },
  CONTENT_UPDATE: {
    bg: 'bg-info/10',
    text: 'text-info',
    border: 'border-info/20',
    label: 'Content',
  },
  PROMOTION: {
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/20',
    label: 'Promotion',
  },
  ISSUE_RESOLUTION: {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    border: 'border-destructive/20',
    label: 'Issue',
  },
  OPTIMIZATION: {
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/20',
    label: 'Optimize',
  },
  MAINTENANCE: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
    label: 'Maintenance',
  },
  OTHER: {
    bg: 'bg-muted/60',
    text: 'text-muted-foreground',
    border: 'border-border',
    label: 'Other',
  },
} as const;

// ============================================================
// ICON SIZES
// ============================================================

export const ICON_SIZE = {
  xs: 'h-3 w-3',              // 12px - meta icons
  sm: 'h-3.5 w-3.5',          // 14px - card icons
  md: 'h-4 w-4',              // 16px - action icons
  lg: 'h-5 w-5',              // 20px - prominent icons
} as const;

// ============================================================
// BUTTON VARIANTS (Clean, minimal)
// ============================================================

export const BUTTON_STYLES = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  outline: 'border border-input bg-background hover:bg-accent',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
} as const;

// ============================================================
// EMPTY STATE
// ============================================================

export const EMPTY_STATE = {
  container: 'flex flex-col items-center justify-center py-8 px-4 text-center',
  icon: 'h-10 w-10 text-muted-foreground/40 mb-3',
  title: 'text-sm font-medium text-muted-foreground mb-1',
  description: 'text-xs text-muted-foreground/70 mb-4 max-w-[240px]',
  cta: 'text-xs',
} as const;

// ============================================================
// COMPLEXITY INDICATOR
// ============================================================

export const COMPLEXITY = {
  light: { filled: 1, label: 'Nhẹ' },
  medium: { filled: 2, label: 'Vừa' },
  heavy: { filled: 3, label: 'Nặng' },
} as const;

export type ComplexityLevel = keyof typeof COMPLEXITY;
