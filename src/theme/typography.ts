/**
 * Typography System — Roomrise Control Hub
 * ═══════════════════════════════════════════
 * Canonical class strings for every text level.
 * Use these instead of inline text-[Npx] or ad-hoc combos.
 *
 * Tailwind fontSize tokens (defined in tailwind.config.ts):
 *   micro   = 10px/14px    caption = 12px/16px
 *   body    = 14px/20px    section = 16px/22px
 *   page    = 18px/24px    kpi     = 24px/30px
 *   heroKpi = 30px/36px
 *
 * Usage:
 *   import { t } from "@/theme/typography";
 *   <p className={t.micro}>tiny label</p>
 *   <h2 className={t.sectionTitle}>Section</h2>
 *   <span className={t.kpiValue}>1,234</span>
 */

/** Atomic text-level classes */
export const t = {
  // ── Tiny labels, badge text, sub-metadata ──
  micro: "text-micro font-medium text-muted-foreground",

  // ── Metadata, secondary labels (= text-xs) ──
  caption: "text-caption text-muted-foreground",
  captionStrong: "text-caption font-medium text-muted-foreground",

  // ── Default body, table cells, form values (= text-sm) ──
  body: "text-body text-foreground",
  bodyMuted: "text-body text-muted-foreground",

  // ── Section headers (SectionCard h2) ──
  sectionTitle: "text-section font-semibold text-foreground",

  // ── Page title (inside Header banner) ──
  pageTitle: "text-page font-bold tracking-tight text-foreground",

  // ── KPI / metric value  ──
  kpiValue: "text-kpi font-semibold tracking-tight tabular-nums text-foreground",
  kpiLabel: "text-caption font-medium text-muted-foreground uppercase tracking-wider",

  // ── Hero KPI (dashboard hero numbers) ──
  heroKpiValue: "text-heroKpi font-bold tracking-tight tabular-nums text-foreground",

  // ── Table header cell ──
  tableHead: "text-caption font-semibold text-muted-foreground/90 uppercase tracking-wider",
} as const;

/** Heading convention quick-reference (use raw classes or t.* helpers):
 * <h1> — ONE per page, rendered by Header component
 * <h2> — t.sectionTitle  (SectionCard auto-renders this)
 * <h3> — text-body font-semibold text-foreground
 * <h4> — text-caption font-medium text-foreground
 */
