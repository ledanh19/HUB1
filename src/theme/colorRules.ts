/**
 * Color Rules — Semantic mapping for common UI patterns.
 * ═══════════════════════════════════════════════════════
 * Use these helpers instead of raw Tailwind palette colors.
 *
 * These return className strings that use ONLY design-system tokens.
 * All values adapt automatically to dark mode.
 */

/** Status-aware text colors for financial values */
export function financeColor(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-muted-foreground";
}

/** Background + text combos for status-like badges (soft style) */
export const statusSoft = {
  success:   "bg-success/10 text-success border-success/20",
  warning:   "bg-warning/10 text-warning border-warning/20",
  danger:    "bg-destructive/10 text-destructive border-destructive/20",
  info:      "bg-info/10 text-info border-info/20",
  neutral:   "bg-muted text-muted-foreground border-border",
  primary:   "bg-primary/10 text-primary border-primary/20",
  purple:    "bg-primary/10 text-primary border-primary/20", // alias
} as const;

/** Background + text for highlight boxes */
export const highlightBox = {
  success:   "bg-success/5 border border-success/20",
  warning:   "bg-warning/5 border border-warning/20",
  danger:    "bg-destructive/5 border border-destructive/20",
  info:      "bg-info/5 border border-info/20",
  neutral:   "bg-muted/40 border border-border",
  purple:    "bg-primary/5 border border-primary/20",
} as const;

/**
 * Migration cheatsheet (raw Tailwind → semantic token):
 *
 * bg-green-50 / bg-emerald-50       →  bg-success/10
 * text-green-700 / text-emerald-700 →  text-success
 * border-green-200                  →  border-success/20
 *
 * bg-red-50 / bg-rose-50            →  bg-destructive/10
 * text-red-700 / text-rose-700      →  text-destructive
 * border-red-200                    →  border-destructive/20
 *
 * bg-amber-50 / bg-yellow-50        →  bg-warning/10
 * text-amber-700 / text-yellow-700  →  text-warning
 * border-amber-200                  →  border-warning/20
 *
 * bg-blue-50 / bg-sky-50            →  bg-info/10  OR  bg-primary/10
 * text-blue-700 / text-sky-700      →  text-info   OR  text-primary
 * border-blue-200                   →  border-info/20
 *
 * bg-gray-50 / bg-slate-50          →  bg-muted  OR  bg-muted/40
 * text-gray-500 / text-slate-500    →  text-muted-foreground
 * border-gray-200 / border-slate-200→  border-border
 *
 * bg-purple-50                      →  bg-primary/10
 * text-purple-700                   →  text-primary
 * border-purple-200                 →  border-primary/20
 *
 * bg-orange-50                      →  bg-warning/10
 * text-orange-700                   →  text-warning  OR  text-status-pending
 */
