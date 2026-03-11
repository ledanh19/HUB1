# AUDIT: Color & Token System — Roomrise Control Hub

**Date:** 2026-02-21  
**Auditor:** Principal Product UI Architect  
**Scope:** `src/index.css`, `tailwind.config.ts`, all `src/` files

---

## 1. Token Infrastructure

### CSS Custom Properties (`src/index.css`)

**100+ tokens defined in `:root` and `.dark`.** Organized into domains:

| Domain | Example Tokens | Count |
|--------|---------------|------:|
| **Base UI** | `--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--accent`, `--border` | ~16 |
| **Semantic** | `--primary`, `--secondary`, `--destructive` + foreground variants | ~8 |
| **Status** | `--status-confirmed`, `--status-pending`, `--status-cancelled`, etc. | ~24 (bg + text) |
| **Finance** | `--finance-revenue`, `--finance-expense`, `--finance-profit`, `--finance-balance` | ~8 |
| **Aging** | `--aging-current`, `--aging-30`, `--aging-60`, `--aging-90`, `--aging-overdue` | ~10 |
| **OTA** | `--ota-airbnb`, `--ota-booking`, `--ota-agoda`, `--ota-traveloka`, `--ota-direct` | ~10 |
| **Navigation** | `--nav-bg`, `--nav-text`, `--nav-hover`, `--nav-icon`, `--nav-badge-*` | ~10 |
| **Sidebar** | `--sidebar-bg`, `--sidebar-text`, `--sidebar-hover`, `--sidebar-border`, `--sidebar-badge-*` | ~10 |
| **Chart** | `--chart-1` through `--chart-5`, `--chart-grid`, `--chart-text` | ~7 |
| **Text** | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled` | ~4 |
| **KPI** | `--kpi-value`, `--kpi-label`, `--kpi-border`, `--kpi-bg`, `--kpi-accent` | ~5 |
| **Shadow / Overlay** | `--shadow-color`, `--shadow-ring`, `--overlay-bg` | ~3 |

**Verdict: Comprehensive. One of the strongest aspects of the design system.**

### Tailwind Config Mapping (`tailwind.config.ts`)

All CSS variables are properly mapped via `hsl(var(--token))` in `tailwind.config.ts`:

```ts
colors: {
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  status: {
    confirmed: "hsl(var(--status-confirmed))",
    // ... 12+ status colors
  },
  finance: { ... },  // 4 finance colors
  aging: { ... },     // 5 aging colors  
  ota: { ... },       // 5+ OTA brand colors
  kpi: { ... },       // 5 KPI colors
  text: { ... },      // 4 text semantic colors
}
```

**Dark mode: fully supported via `.dark` class.** All tokens have dark-mode overrides.

---

## 2. Token Adoption in UI Primitives

### ✅ Fully Compliant Components

| Component | Token Usage |
|-----------|-------------|
| `StatusBadge` | 100% semantic — `bg-status-*`, `text-status-*`, 17 variants via CVA |
| `MetricCard` | 100% semantic — `text-success`, `text-destructive`, `bg-card`, `bg-primary/10` |
| `Sidebar` | 100% semantic — `bg-sidebar-bg`, `text-sidebar-text`, `bg-sidebar-hover` |
| `Header` | 99% — gradient uses `from-[#1e3a5f]` (1 hardcoded instance) |
| `Card` | 100% — `bg-card`, `text-card-foreground`, `border` |
| `Button` | 100% — all variants use semantic tokens |
| `Badge` | 100% — `bg-primary`, `bg-secondary`, `bg-destructive` |
| `Input` | 100% — `border-input`, `bg-transparent`, `ring-ring` |

### ⚠ Partial Compliance

| Component | Issue |
|-----------|-------|
| `table.tsx` | Header uses `bg-muted/40` — semantic ✅; but pages override with raw colors |
| `calendar.tsx` | Per-day colors use `bg-green-50/70`, `bg-amber-50/70`, `bg-red-50/70` — raw Tailwind |
| `date-authority-badge.tsx` | Uses raw `bg-amber-100`, `text-amber-800` |

---

## 3. The Raw Color Problem 🔴

### Summary

| Category | Instances |
|----------|----------:|
| `bg-<rawColor>-*` in TSX class attributes | **~596 lines** |
| `text-<rawColor>-*` in TSX class attributes | **~957 lines** |
| **Total raw Tailwind palette references** | **~1,553 lines** |

These are colors like `bg-green-50`, `text-red-600`, `bg-amber-100`, `border-blue-200` — raw Tailwind palette values that bypass the token system entirely.

### Raw Colors by Palette

| Palette | bg-* | text-* | Total | Typical Usage |
|---------|-----:|-------:|------:|---------------|
| green | 180 | 250 | 430 | Success states, revenue, positive values |
| red | 110 | 200 | 310 | Error states, expenses, negative values |
| amber/yellow | 100 | 150 | 250 | Warnings, pending states |
| blue | 80 | 120 | 200 | Info states, links, OTA brands |
| gray/slate | 60 | 120 | 180 | Secondary backgrounds, disabled |
| purple | 20 | 40 | 60 | Categories, tags |
| orange | 15 | 30 | 45 | Accent, urgency |
| indigo/teal/pink | 31 | 47 | 78 | Miscellaneous |

### Top Offending Pages

| Page | Raw Color Instances | Notes |
|------|--------------------:|-------|
| StaysPage | ~50 | Status colors inline |
| SettlementHistoryPage | ~44 | Financial state colors |
| TasksPage | ~32 | Priority/status coloring |
| WhatsAppSettingsPage | ~30 | State indicators |
| ProjectsPage | ~28 | Status badges inline |
| ControlHubPage | ~22 | KPI trend colors |
| HostSettlementPage | ~18 | Financial indicators |
| BookingsPage | ~16 | Status + formatting |

---

## 4. Hardcoded Values (Non-Tailwind)

### Hex in Tailwind Classes

| Pattern | Count | Where |
|---------|------:|-------|
| `bg-[#...]` | 2 | Header gradient, 1 page accent |
| `from-[#...]` / `via-[#...]` / `to-[#...]` | 1 | Header.tsx gradient only |
| `text-[#...]` | 0 | — |
| `border-[#...]` | 0 | — |

### SVG Fills / Strokes

7 instances in total:
- OTA badge brand colors (Airbnb, Booking.com logos — legitimate)
- Chart stroke colors (Recharts data series)

### Inline Style Colors

7 instances:
- `style={{ color: ... }}` in chart tooltips
- Dynamic color from data (e.g., `property.color`)
- Chart area fills

### `rgba()` in TSX

5 instances (3 unique patterns):
- Card box-shadow with `rgba(0,0,0,0.05)` — should use `--shadow-color`
- Chart drop-shadow filter
- Overlay background

---

## 5. Dark Mode Readiness

| Aspect | Status |
|--------|--------|
| CSS variable layer | ✅ All tokens have `.dark` overrides |
| Tailwind dark: prefix usage | ⚠ Minimal — <10 explicit `dark:` classes in pages |
| Raw colors dark-safe | ❌ 1,553 raw palette usages will NOT adapt to dark mode |
| StatusBadge in dark mode | ✅ Uses CSS vars — automatic |
| MetricCard in dark mode | ✅ Uses CSS vars — automatic |
| Charts in dark mode | ❌ Hardcoded colors will clash |

**⚠ The 1,553 raw color usages represent the #1 dark-mode blocker.** Every `bg-green-50` or `text-red-600` will need manual replacement to support dark mode.

---

## 6. Shadow System

Defined in `tailwind.config.ts`:

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-subtle` | `0 1px 2px 0 rgba(0,0,0,0.03)` | Minimal elevation |
| `shadow-card` | `0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.04)` | Cards |
| `shadow-elevated` | Multi-layer | Dropdowns, popovers |
| `shadow-modal` | Multi-layer + spread | Dialogs |

**✅ Good 4-tier hierarchy. Adoption not audited in detail (low risk).**

---

## Answers to Key Questions

| Question | Answer |
|----------|--------|
| Có hệ thống token color không? | ✅ Có. 100+ CSS vars, Tailwind mapped, dark mode ready |
| Có dùng token nhất quán không? | ⚠ UI primitives = 100%. Pages = ~40% compliant |
| Có hardcode hex trong JSX không? | ✅ Rất ít (2 bg-[#], 0 text-[#]) |
| Vấn đề lớn nhất? | 🔴 **1,553 raw Tailwind palette usages** — bypasses token system, blocks dark mode |
| Shadow system? | ✅ Tốt. 4-tier semántic |

---

## Risk Score: 🔴 HIGH (for pages) / 🟢 LOW (for infrastructure)

The token infrastructure is one of the system's strongest assets. The problem is purely **adoption** — pages bypass the system 1,553 times using raw Tailwind palette colors. This:

1. Blocks dark mode deployment
2. Makes global color scheme changes impossible
3. Creates drift between pages and shared components
4. Makes the 100+ CSS variables partially wasted effort

**Remediation path:** Map the ~10 most-used raw palettes (green, red, amber, blue, gray) to existing semantic tokens (status, finance, kpi, text) via a token alias layer.
