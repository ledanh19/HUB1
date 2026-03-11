# UI SYSTEM: Decision Tree & Completion Plan

**Date:** 2026-02-21  
**Role:** Principal Product UI Architect (SaaS Enterprise)  
**Project:** Roomrise Control Hub

---

## Phase 2: Decision Tree Classification

### The Three Cases

| Case | Definition | Action |
|------|-----------|--------|
| **Case A** — System Exists (≥80%) | Token system + component library + layout architecture all present and adopted | Standardize only — enforce adoption, fill minor gaps |
| **Case B** — Partial System (40–79%) | Infrastructure exists but adoption is incomplete, significant drift | Complete the system — build missing pieces, drive adoption |
| **Case C** — No System (<40%) | Little to no token system, no shared components, page-by-page styling | Build from scratch — design tokens, component library, layout system |

---

### Audit Results Summary

| Domain | Infrastructure | Adoption | Score |
|--------|:-------------:|:--------:|------:|
| **Color / Token System** | ✅ 100+ CSS vars, semantic domains, dark mode | ⚠ 40% page compliance (1,553 raw usages) | 65% |
| **Typography** | ❌ No tokens, no scale extension, no shared classes | ❌ 267 arbitrary sizes, 9+ KPI patterns, 8 h1 patterns | 15% |
| **Spacing** | ⚠ Implicit conventions (no explicit tokens) | ✅ De-facto conventions mostly followed, ~5 off-grid | 60% |
| **Layout Architecture** | ✅ MainLayout + Sidebar + PageContainer + SectionCard | ✅ 89-92% adoption | 90% |
| **Component Reuse** | ⚠ Solid primitives (72 components), but key shared components missing | ⚠ MetricCard 34%, no FilterBar, no DataTable | 55% |
| **Shadow / Elevation** | ✅ 4-tier system, properly layered | ✅ Good adoption | 85% |
| **Motion / Animation** | ✅ 5-tier speed system, easing functions, keyframes | ✅ Applied via Tailwind config | 80% |

### Weighted Score

```
Color Infrastructure    × 0.15  →  1.00 × 0.15 = 0.150
Color Adoption          × 0.15  →  0.40 × 0.15 = 0.060
Typography              × 0.15  →  0.15 × 0.15 = 0.023
Spacing                 × 0.10  →  0.60 × 0.10 = 0.060
Layout Architecture     × 0.15  →  0.90 × 0.15 = 0.135
Component Reuse         × 0.15  →  0.55 × 0.15 = 0.083
Shadow + Motion         × 0.15  →  0.83 × 0.15 = 0.124
────────────────────────────────────────────────────────
TOTAL                                       = 0.634 → 63%
```

---

## ✅ CLASSIFICATION: **CASE B — Partial System (63%)**

**"Strong infrastructure, weak adoption, one critical gap (typography)."**

The system is NOT Case C (there's real infrastructure). It's NOT Case A (too many pages bypass the system). It's a textbook Case B: the foundation is built, but ~37% of the surface area is unfinished or un-adopted.

---

## Phase 3: UI System Completion Plan

### Priority Matrix

| Priority | Domain | Current | Target | Effort | Impact |
|----------|--------|---------|--------|--------|--------|
| **P0** | Typography Token System | 15% | 80% | Medium | 🔴 Blocks all heading/text consistency |
| **P1** | Raw Color → Token Migration | 40% | 85% | High | 🔴 Blocks dark mode, blocks rebranding |
| **P2** | MetricCard Adoption | 34% | 90% | Low | 🟠 79 ad-hoc KPIs → standardized |
| **P3** | FilterBar Shared Component | 0% | 80% | Medium | 🟠 ~20 pages duplicate filter logic |
| **P4** | Content Max-Width | 0% | 100% | Low | 🟡 Readability on wide screens |
| **P5** | Card vs SectionCard Boundary | Ambiguous | Clear | Low | 🟡 Developer confusion |
| **P6** | DataTable Wrapper | 0% | 70% | Medium | 🟡 13 pages with redundant wrapping |
| **P7** | EmptyState Component | 0% | 80% | Low | 🟢 Consistency, not critical |
| **P8** | Table Row Padding Standard | 5 patterns | 1 pattern | Low | 🟢 Minor visual inconsistency |

---

### Sprint Plan

#### Sprint 1: Typography Foundation (P0) — Est. 2-3 days

**What to build:**

1. **Typography scale in `tailwind.config.ts`**:
   - Map the de-facto sizes into named tokens
   - Create semantic size tokens: `xs-micro` (10px), `xs` (12px), `sm` (14px), `base` (16px), `lg` (18px), `xl` (20px), `2xl` (24px), `3xl` (30px)
   - Retire all arbitrary `text-[Npx]` usages (267 instances)

2. **Heading convention** (applied system-wide):
   - `h1` → `text-lg md:text-xl font-bold tracking-tight` (Page title in Header — already standard)
   - `h2` → `text-lg font-semibold` (Section title — de-facto standard)
   - `h3` → `text-base font-semibold` (Sub-section — SectionCard)
   - `h4` → `text-sm font-medium` (Label level)

3. **KPI number convention**:
   - Standard: `text-2xl font-semibold tracking-tight tabular-nums`
   - Large hero: `text-3xl font-bold tracking-tight tabular-nums`
   - Enforce `tabular-nums` on ALL numeric displays

4. **Table text convention**:
   - TableHead: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
   - TableCell: `text-sm` (inherited)
   - No per-page overrides

#### Sprint 2: Color Token Adoption (P1) — Est. 3-5 days

**What to build:**

1. **Expand semantic token palette** — add missing mappings:
   - `--success` / `--success-foreground` → replaces `green-*` (~430 usages)
   - `--warning` / `--warning-foreground` → replaces `amber-*` / `yellow-*` (~250 usages)
   - `--info` / `--info-foreground` → replaces `blue-*` (~200 usages)
   - `--danger` / `--danger-foreground` → replaces `red-*` for non-status uses (~150 usages)
   - `--neutral` / `--neutral-foreground` → replaces `gray-*` / `slate-*` (~180 usages)

2. **Migration strategy** (page-by-page):
   - Start with top-7 offending pages (~250 raw colors)
   - Replace `bg-green-50 text-green-700` → `bg-success/10 text-success`
   - Replace `bg-red-50 text-red-700` → `bg-destructive/10 text-destructive`
   - Replace `bg-amber-50 text-amber-700` → `bg-warning/10 text-warning`

3. **Lint rule** — ESLint plugin to flag raw palette colors in className

#### Sprint 3: Component Adoption (P2+P3) — Est. 2-3 days

**What to build:**

1. **MetricCard adoption drive**:
   - Refactor top-10 ad-hoc pages to use MetricCard
   - Extend MetricCard if needed (e.g., add `size="lg"` variant for hero stats)
   - Target: 28/32 KPI pages using MetricCard

2. **FilterBar component**:
   - Shared component: `SearchFilter`, `StatusFilter`, `DateRangeFilter`, `PropertyFilter`
   - Composable: `<FilterBar><SearchFilter /><StatusFilter options={...} /></FilterBar>`
   - Refactor top-10 pages

3. **DebouncedSearch adoption**: Expand from 7 → 20 searchable pages

#### Sprint 4: Layout & Polish (P4-P8) — Est. 1-2 days

**What to build:**

1. **Content max-width**: Add `max-w-screen-2xl mx-auto` to MainLayout content area
2. **Card/SectionCard documentation**: Clear guidelines on when to use each
3. **DataTable wrapper** with built-in overflow + loading skeleton
4. **EmptyState component**: Icon + title + description + optional action button
5. **Table row padding**: Standardize all pages to `TableCell py-3.5 px-3`

---

### Estimated Total Effort

| Sprint | Duration | Scope |
|--------|----------|-------|
| Sprint 1 — Typography | 2-3 days | Token creation + 267 replacements |
| Sprint 2 — Color Migration | 3-5 days | 5 new tokens + ~1,553 replacements |
| Sprint 3 — Component Adoption | 2-3 days | MetricCard + FilterBar + refactors |
| Sprint 4 — Layout & Polish | 1-2 days | Max-width + utility components |
| **Total** | **8-13 days** | |

---

### Success Metrics

| Metric | Before | After |
|--------|-------:|------:|
| Typography arbitrary sizes | 267 | 0 |
| Raw Tailwind palette colors | 1,553 | <50 (legitimate exceptions) |
| MetricCard adoption | 34% | 90% |
| Pages with shared FilterBar | 0% | 60% |
| Heading patterns | 8+ | 4 (h1-h4 standard) |
| KPI number patterns | 9+ | 2 (standard + hero) |
| Dark mode ready | Blocked | Unblocked |
| Design system score | 63% | >85% (Case A territory) |

---

### Non-Goals (Do Not Implement)

| Item | Reason |
|------|--------|
| CSS-in-JS migration | Tailwind + CSS vars is the correct stack |
| Component library package (npm) | Monorepo is premature — collocated is fine |
| Storybook | Low ROI at current team size |
| Design tokens JSON (Style Dictionary) | CSS vars + Tailwind config is sufficient |
| Full dark mode implementation | Unblock first (Sprint 2), implement later as separate project |
