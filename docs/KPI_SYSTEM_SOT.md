# KPI System — Source of Truth (SOT)

> **Version**: 1.0 • **Date**: 2026-02-23
> Canonical specification for KPI display across Roomrise Control Hub.

---

## A. KPI TILE (MetricCard) — Canon

| Property | Canon Value | Override Allowed? |
|----------|------------|-------------------|
| min-height | `min-h-[104px]` | No |
| padding | `p-4` | No |
| internal gap | `gap-1` (label→value), `gap-3` (icon→content) | No |
| icon container | `rounded-md bg-{tone}/10 p-2` | No (color via tone) |
| icon size | `h-4 w-4` | No |
| label | `text-xs font-medium text-muted-foreground uppercase tracking-wider` | No |
| value | `text-2xl font-semibold tracking-tight tabular-nums` | No |
| subtitle | `text-xs text-muted-foreground truncate` | No |
| delta | `text-xs font-medium` + trend color | No |
| border | `border border-border/60 rounded-lg` | Only via `className` |
| hover | `hover:shadow-md` | No |

### Tone Palette (MetricCard `tone` prop)
| Tone | Value Color | Card Border/BG |
|------|------------|----------------|
| `neutral` | `text-foreground` (default) | default border |
| `success` | `text-success` | `border-success/20 bg-success/5` |
| `warning` | `text-warning` | `border-warning/20 bg-warning/5` |
| `danger` | `text-destructive` | `border-destructive/20 bg-destructive/5` |
| `info` | `text-info` | `border-info/20 bg-info/5` |
| `primary` | `text-primary` | `border-primary/20 bg-primary/5` |

### Forbidden
- ❌ `text-hero-kpi` on MetricCard (use only in Dashboard hero or KpiRow)
- ❌ Per-page `text-success`/`text-destructive` on value — use `tone` prop
- ❌ Custom padding (`p-3`, `p-5`, `pt-4`)
- ❌ Custom icon sizes (`h-5 w-5`, `h-6 w-6`)

---

## B. KPI GRID (KPIGrid) — Canon

| Breakpoint | Default Columns |
|------------|----------------|
| 390px (mobile) | 1 col |
| 768px (sm) | 2 cols |
| 1024px+ (lg) | N cols (2, 3, or 4) |

| Property | Canon Value |
|----------|------------|
| gap | `gap-4` |
| alignment | `items-stretch` (prevents uneven row heights) |
| grid class | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-{N} gap-4 items-stretch` |

### Forbidden
- ❌ Per-page `grid-cols-*` for KPI areas
- ❌ `md:grid-cols-4` (use `lg:` breakpoint)
- ❌ `flex` or `flex-wrap` for KPI tile layouts

---

## C. INLINE KPI (InlineKpiValue) — Canon

| Context | Typography | Alignment |
|---------|-----------|-----------|
| Summary row (primary) | `text-kpi font-semibold tabular-nums tracking-tight` | left (default) |
| Table cell (numeric) | `text-sm tabular-nums` | right |
| Dialog summary | `text-kpi font-semibold tabular-nums tracking-tight` | left |

| Property | Canon Value |
|----------|------------|
| number wrap | `whitespace-nowrap` (prevent line break mid-number) |
| 390px overflow | Responsive: if >10 chars, fall back to `text-sm` at mobile |
| tabular-nums | Always required |

### Tone on InlineKpiValue
Same palette as MetricCard. Use `tone` prop, never raw `text-success` classes.

---

## D. Canonical Display Types

| Type | When | Component |
|------|------|-----------|
| Type 1: KPI Tile (standard) | Top-of-page stat grids | `<MetricCard>` in `<KPIGrid>` |
| Type 2: KPI Tile (compact) | Rare, toolbar context | `<MetricCard density="compact">` |
| Type 3: KPI Hero | Dashboard hero only | `KpiRow` (existing analytics component) |
| Type 4: Inline KPI (summary) | Settlement/report summaries | `<InlineKpiValue size="kpi">` |
| Type 5: Inline Numeric (table) | Table cells with currency | `<InlineKpiValue size="body" align="right">` |
