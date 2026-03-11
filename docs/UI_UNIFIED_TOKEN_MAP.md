# UI UNIFIED — Token Map

## Typography Tokens (tailwind.config.ts → fontSize)

| Token     | Size       | Line-height | Usage                          |
|-----------|-----------|-------------|--------------------------------|
| `micro`   | 0.625rem  | 0.875rem    | Badges, tiny labels, counts    |
| `caption` | 0.75rem   | 1rem        | Table heads, captions, hints   |
| `body`    | 0.875rem  | 1.25rem     | Default body text, form labels |
| `section` | 1rem      | 1.375rem    | Section titles, card headers   |
| `page`    | 1.125rem  | 1.5rem      | Page titles (h1)               |
| `kpi`     | 1.5rem    | 1.875rem    | KPI metric values              |
| `heroKpi` | 1.875rem  | 2.25rem     | Hero dashboard KPI             |

## Color Token Mapping

| Raw Palette         | Semantic Token         | Usage Domain         |
|--------------------|------------------------|----------------------|
| green-50/100       | `success/10`           | Success backgrounds  |
| green-500–800      | `success`              | Success text/border  |
| red-50/100         | `destructive/10`       | Error backgrounds    |
| red-500–800        | `destructive`          | Error text/border    |
| amber/yellow-50/100| `warning/10`           | Warning backgrounds  |
| amber/yellow-500–800| `warning`             | Warning text/border  |
| blue-50/100        | `info/10`              | Info backgrounds     |
| blue-500–800       | `info`                 | Info text/border     |
| purple-50/100      | `primary/10`           | Primary backgrounds  |
| purple-500–800     | `primary`              | Primary text/border  |
| gray/slate-50/100  | `muted`                | Neutral backgrounds  |
| gray/slate-500–800 | `muted-foreground`     | Neutral text         |
| gray-200/300       | `border`               | Neutral borders      |

## Status Token Families

| Status Domain | BG Token       | Text Token      | Border Token       |
|--------------|----------------|-----------------|-------------------|
| Success      | `bg-success/10`| `text-success`  | `border-success/20`|
| Warning      | `bg-warning/10`| `text-warning`  | `border-warning/20`|
| Danger       | `bg-destructive/10`| `text-destructive`| `border-destructive/20`|
| Info         | `bg-info/10`   | `text-info`     | `border-info/20`  |
| Neutral      | `bg-muted`     | `text-muted-foreground`| `border-border`|
| Primary      | `bg-primary/10`| `text-primary`  | `border-primary/20`|

## Helper Exports

- `src/theme/typography.ts` — `t.micro`, `t.caption`, `t.body`, `t.sectionTitle`, `t.pageTitle`, `t.kpiValue`, `t.heroKpiValue`, `t.tableHead`, etc.
- `src/theme/colorRules.ts` — `financeColor()`, `statusSoft`, `highlightBox` + migration cheatsheet in comments
