# UI Governance Rules — Roomrise Control Hub

**Date:** 2026-02-21  
**Authority:** Principal Product UI Architect  
**Enforcement:** PR Review Checklist + Future ESLint Rules

---

## 1. Token-First Rule

> **Every visual property MUST reference a design token. Raw values are prohibited unless explicitly exempted.**

### Color

| ✅ Allowed | ❌ Prohibited |
|-----------|-------------|
| `bg-card`, `text-foreground` | `bg-white`, `text-black` |
| `bg-status-confirmed` | `bg-green-100` |
| `text-destructive` | `text-red-600` |
| `bg-success/10` | `bg-green-50` |
| `border-border` | `border-gray-200` |
| `text-muted-foreground` | `text-gray-500` |

**Exemptions:** SVG brand logos, chart data series (dynamic), 3rd-party library overrides.

### Typography

| ✅ Allowed | ❌ Prohibited |
|-----------|-------------|
| `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl` | `text-[10px]`, `text-[13px]`, any `text-[Npx]` |
| `font-medium`, `font-semibold`, `font-bold` | `font-[500]`, style attribute font-weight |
| Tailwind heading convention classes | Inline heading styles |

**Once typography tokens are defined (Sprint 1), use only the named tokens.**

### Spacing

| ✅ Allowed | ❌ Prohibited |
|-----------|-------------|
| Tailwind spacing scale (`p-2`, `gap-4`, `mb-6`) | `p-[7px]`, `mb-[13px]`, any arbitrary spacing |
| SectionCard for card padding | Manual `p-5 md:p-6` on divs |
| PageContainer for section gaps | Manual `space-y-6` at page level |

**Exemptions:** Pixel-perfect icon alignment nudges, documented in comments.

---

## 2. Component Hierarchy Rule

> **Use the highest-level shared component available. Do not rebuild what exists.**

### Required Component Usage

| Need | Required Component | ❌ Do Not |
|------|-------------------|----------|
| Page wrapper | `PageContainer` | Raw `div` with manual gap |
| Content section | `SectionCard` | Raw `Card` at page level |
| Sub-card within section | `Card` / `CardHeader` / `CardContent` | Raw `div` with bg-card |
| KPI number display | `MetricCard` | Raw Card with manual number styling |
| Status indicator | `StatusBadge` | Inline colored spans |
| Data table | `Table` + `TableHead` + `TableBody` + `TableRow` + `TableCell` | Raw `<table>` / `<thead>` / `<td>` |
| Search input | `DebouncedSearch` (when available) | Raw Input with manual debounce |
| Page banner | `Header` component | Custom gradient div |

### Card Boundary Rule

| Level | Component | When to Use |
|-------|-----------|-------------|
| Page section | `SectionCard` | Top-level content blocks |
| Sub-card | `Card` + `CardHeader` + `CardContent` | Nested cards within SectionCard (e.g., KPI grids) |
| Raw div | Never at card level | Only for layout wrappers (flex, grid) |

**Rule: If it has `bg-card`, `rounded-*`, or `shadow-*`, it MUST use SectionCard or Card.**

---

## 3. Heading Convention

| Level | HTML | Tailwind Classes | Usage |
|-------|------|-----------------|-------|
| Page title | `<h1>` | Via `Header` component | One per page, in Header banner |
| Section title | `<h2>` | `text-lg font-semibold` | SectionCard headings |
| Sub-section | `<h3>` | `text-base font-semibold` | Within SectionCard |
| Label/group | `<h4>` | `text-sm font-medium` | Field groups, categories |

**Rules:**
- Maximum one `<h1>` per page (inside Header)
- Never skip heading levels (h1 → h3)
- Never use `<h1>` outside of Header component
- Never apply arbitrary text sizes to headings

---

## 4. KPI Number Convention

| Variant | Classes | When |
|---------|---------|------|
| Standard | `text-2xl font-semibold tracking-tight tabular-nums` | Default KPI cards |
| Hero | `text-3xl font-bold tracking-tight tabular-nums` | Dashboard hero stats |

**Rules:**
- ALL numeric KPI values MUST include `tabular-nums`
- ALL KPI cards SHOULD use `MetricCard` component
- Trend indicators: `text-success` (positive), `text-destructive` (negative), `text-muted-foreground` (neutral)
- Never use more than 2 KPI size variants on a single page

---

## 5. Table Convention

| Element | Standard |
|---------|----------|
| Wrapper | `Table` component (includes overflow handling) |
| Header row | `TableHead` component |
| Header cell | `text-xs font-semibold uppercase tracking-wider text-muted-foreground` |
| Body row | `TableRow` component |
| Body cell | `TableCell` component (`py-3.5 px-3`, inherits `text-sm`) |
| Empty state | `TableRow` with centered `TableCell colSpan={n}` |

**Rules:**
- NEVER use raw `<table>`, `<thead>`, `<th>`, `<td>`
- NEVER wrap `Table` in additional `overflow-x-auto` div (Table handles this)
- NEVER override `TableCell` padding per-page
- Mobile breakout: use `-mx-4 px-4 md:mx-0 md:px-0` pattern when needed

---

## 6. Layout Rules

### MainLayout
- Every authenticated page MUST use `MainLayout`
- Only exceptions: auth pages, standalone error pages, documentation

### PageContainer
- Every page within MainLayout MUST use `PageContainer` as content wrapper
- No manual `space-y-*` or `gap-*` at page level — PageContainer handles this

### Content Width
- No page should set its own `max-w-*` unless it's a centered form/wizard
- Global max-width will be added to MainLayout (Sprint 4)

### Mobile
- Tables MUST use the breakout pattern when wider than viewport
- Never use `hidden` to hide critical data on mobile — use responsive layout instead
- Always test with sidebar collapsed and expanded

---

## 7. PR Review Checklist

Before approving any PR that touches UI:

### ✅ Tokens
- [ ] No raw Tailwind palette colors (`bg-green-*`, `text-red-*`, etc.)
- [ ] No arbitrary font sizes (`text-[Npx]`)
- [ ] No arbitrary spacing (`p-[Npx]`, `m-[Npx]`)
- [ ] No inline `style={{ color: ... }}` unless chart/dynamic data
- [ ] No hex colors in className

### ✅ Components
- [ ] Uses `PageContainer` + `SectionCard` (not raw divs)
- [ ] Uses `MetricCard` for KPI numbers (not raw Card + manual styling)
- [ ] Uses `StatusBadge` for status indicators
- [ ] Uses `Table` component set (not raw HTML tables)
- [ ] Uses `Header` component (not custom banner)

### ✅ Typography
- [ ] Headings follow h1-h4 convention
- [ ] Only one `<h1>` per page
- [ ] Numeric values include `tabular-nums`
- [ ] No more than 3 font-size classes per component

### ✅ Layout
- [ ] Responsive behavior tested at 375px, 768px, 1280px, 1920px
- [ ] No horizontal scroll on mobile (except table breakout pattern)
- [ ] Proper heading hierarchy

### ✅ Accessibility
- [ ] Color is not the only indicator (icon/text accompanies color)
- [ ] Interactive elements have visible focus states
- [ ] Sufficient color contrast (4.5:1 for text, 3:1 for large text)

---

## 8. Future Lint Rules (Post-Sprint 2)

### ESLint Rules to Implement

```
// Custom ESLint plugin rules (planned)
"roomrise/no-raw-palette-colors"    // Flag bg-green-*, text-red-*, etc.
"roomrise/no-arbitrary-font-size"   // Flag text-[Npx]
"roomrise/no-arbitrary-spacing"     // Flag p-[Npx], m-[Npx]
"roomrise/no-raw-html-table"        // Flag <table>, <thead>, <td>
"roomrise/require-page-container"   // Flag pages without PageContainer
"roomrise/require-section-card"     // Flag bg-card divs without SectionCard
```

### Tailwind Config Safelist (Optional)

When ready, restrict the Tailwind palette to only semantic colors by removing default palette from `safelist`. This is a breaking change and should only be done after Sprint 2 color migration is complete.

---

## 9. Exception Process

When a rule must be violated:

1. **Document the exception** in a code comment: `// UI-EXCEPTION: [reason]`
2. **Get PR approval** from design system owner
3. **Log the exception** — track total exceptions per quarter
4. **Review quarterly** — if >5 exceptions for the same rule, the rule or token system needs updating

### Pre-Approved Exceptions

| Exception | Reason |
|-----------|--------|
| SVG brand logos with hardcoded colors | Brand compliance |
| Chart data series colors | Dynamic from data, Recharts limitation |
| 3rd-party component style overrides | Can't control internal rendering |
| Auth page custom layout | Standalone marketing-style page |
| 404 page custom layout | Standalone error page |

---

## Document Authority

This document is the single source of truth for UI decisions in Roomrise Control Hub. Any deviation requires the exception process above. Updated quarterly by the design system owner.
