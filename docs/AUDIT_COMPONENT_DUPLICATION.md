# AUDIT: Component Reuse & Duplication — Roomrise Control Hub

**Date:** 2026-02-21  
**Auditor:** Principal Product UI Architect  
**Scope:** `src/components/ui/`, `src/components/layout/`, `src/pages/` (76 pages)

---

## 1. Component Inventory

### Layout Components (`src/components/layout/`)

| Component | Adoption | Notes |
|-----------|----------|-------|
| `MainLayout` | 70/76 (92%) | 6 non-adopters are special pages (auth, 404, docs, deprecated) |
| `Header` | 70/76 (92%) | Same 6 non-adopters |
| `PageContainer` | 68/76 (89%) | 2 additional pages use own container |
| `SectionCard` | 68/76 (89%) | Canonical card wrapper |
| `Sidebar` | 1 (layout-level) | Single instance in MainLayout ✅ |
| `MobileSidebar` | 1 (layout-level) | Single instance in MainLayout ✅ |
| `MobileBottomNav` | 1 (layout-level) | Single instance in MainLayout ✅ |
| `MobileHeader` | 1 (layout-level) | Single instance in MainLayout ✅ |

**Layout adoption is excellent (89-92%).** Non-adopters are legitimate exceptions.

### Shared UI Components (`src/components/ui/`)

72 files total. Key components and adoption:

| Component | Adoption Level | Notes |
|-----------|---------------|-------|
| `Button` | Universal | Every page |
| `Card` / `CardHeader` / `CardContent` | ~45 pages | Also used inside SectionCard sometimes |
| `Badge` | ~30 pages | Base badge styling |
| `StatusBadge` | ~25 pages | CVA-based status variant system |
| `MetricCard` | 11 pages | Standardized KPI card |
| `Table` component set | ~20 pages | |
| `Dialog` / `Sheet` | ~18 pages | |
| `Select` | ~25 pages | |
| `Input` | ~35 pages | |
| `Tabs` / `TabsList` | ~15 pages | |
| `Tooltip` | ~12 pages | |
| `Skeleton` | ~8 pages | Loading states |

---

## 2. Duplication Analysis

### 2.1 KPI Cards — HIGHEST DUPLICATION 🔴

**Standard:** `MetricCard` component — accepts `title`, `value`, `subtitle`, `icon`, `trend`, `className`

**Adoption:** Only **11 / 32 pages** that display KPI numbers use MetricCard.

**Remaining 21 pages with ad-hoc KPI cards (~79 instances):**

| Pattern | Pages | Instance Count |
|---------|-------|---------------:|
| Raw Card + CardHeader + div with manual number styling | 8 | ~30 |
| Inline div with number styling (no Card wrapper) | 6 | ~20 |
| Custom stat card component (per-page) | 4 | ~15 |
| Grid of inline metric boxes | 3 | ~14 |

**Top ad-hoc KPI pages:**

| Page | Ad-Hoc KPIs | Custom Pattern |
|------|------------:|----------------|
| ControlHubPage | 8 | Grid of raw Card wrappers |
| Dashboard | 6 | Custom responsive stat boxes |
| StaysPage | 5 | Inline stats in page header |
| ReportsPnlPage | 5 | Raw Card + CardContent |
| ReportsCashflowPage | 4 | Raw Card + CardContent |
| TasksPage | 4 | Inline counters in filters |
| ProjectsPage | 4 | Card grid |
| MyTasksPage | 3 | Summary cards |
| HostCostAnalyticsPage | 4 | Custom analytics cards |
| PriceSpreadAnalyticsPage | 4 | Chart-integrated cards |

**⚠ MetricCard has the features to replace most of these instances. The barrier is not capability — it's adoption.**

---

### 2.2 Filter Bars — NO SHARED COMPONENT 🔴

**No `FilterBar` component exists.** Each page composes filters inline.

**Patterns observed:**

| Pattern | Pages | Description |
|---------|------:|-------------|
| Search + Select dropdowns in `flex gap-2` | ~20 | Most common |
| `DebouncedSearch` + Selects | 7 | Uses shared search component |
| DateRangePicker + Selects | ~10 | Date-filtered pages |
| Inline tabs as filters | ~5 | Tab-based filtering |
| Complex multi-row filters | ~3 | Dashboard, Analytics |

**Elements that repeat but aren't composable:**

- Status filter dropdown: reimplemented ~15 times with same status options
- Date range filter: reimplemented ~10 times
- Search input: `DebouncedSearch` exists but only used in 7/20+ searchable pages
- Property filter: reimplemented ~8 times

---

### 2.3 Table Wrappers — REDUNDANT WRAPPING 🟡

**Base `Table` component** already includes:
- `overflow-x-auto` on wrapper
- `text-sm` base size
- Proper `TableHead`/`TableBody`/`TableCell`/`TableRow` sub-components

**Yet 13 pages add redundant wrapping:**

```tsx
// ❌ Redundant — Table already handles overflow
<div className="overflow-x-auto">
  <Table>...</Table>
</div>
```

**6 pages use raw HTML tables** (`<table>`, `<thead>`, `<th>`, `<td>`) instead of the shared component:
- BookingsPage (most egregious — full raw table + manual styling 15x)
- 2 analytics pages
- 3 settings pages

---

### 2.4 Card vs SectionCard Boundary — UNCLEAR 🟡

**42 pages import both `Card` (from shadcn) and `SectionCard`.**

Current usage pattern:

| Component | Intended Use | Actual Use |
|-----------|-------------|------------|
| `SectionCard` | Page-level content section | ✅ Consistent |
| `Card` / `CardHeader` / `CardContent` | Sub-cards within SectionCard, KPI cards | ⚠ Also used as top-level sections |

**The boundary is unclear:** In 12 pages, `Card` is used at the same nesting level as `SectionCard` — making it ambiguous which is the "correct" wrapper.

**SectionCard = `p-5 md:p-6 bg-card rounded-xl border shadow-card`**  
**Card = `rounded-xl border bg-card text-card-foreground shadow-card`** (+ CardHeader `p-6 pb-4`, CardContent `p-6 pt-0`)

They look nearly identical but have different padding models.

---

### 2.5 Potential Component Duplicates 🟡

| Suspected Pair | Files | Issue |
|---------------|-------|-------|
| `StayCardCompact` vs `StayCompactCard` | 2 files | Name collision — likely duplicates or abandoned refactor |
| `MetricCard` vs inline KPI cards | 11 + 21 pages | Feature overlap |
| `StatusBadge` vs inline status styling | 25 + ~10 pages | 10 pages style status without StatusBadge |
| `DateRangeFilter` instances | ~10 pages | Each builds own date filter UI |

---

### 2.6 Empty State Handling

**No shared `EmptyState` component.** Each page has its own empty state rendering:

| Pattern | Count |
|---------|------:|
| Inline "No data" text | ~15 pages |
| Custom illustration + text | ~5 pages |
| Shadcn placeholder in table | ~8 pages |
| No empty state handling | ~5 pages |

---

## 3. Adoption Scoreboard

| Component | Possible Uses | Actual Adoption | Rate |
|-----------|-------------:|----------------:|-----:|
| MainLayout | 76 | 70 | 92% |
| Header | 76 | 70 | 92% |
| PageContainer | 76 | 68 | 89% |
| SectionCard | ~70 | 68 | 97% |
| StatusBadge | ~35 | 25 | 71% |
| MetricCard | ~32 | 11 | **34%** |
| Table (shared) | ~26 | 20 | 77% |
| DebouncedSearch | ~22 | 7 | **32%** |

---

## 4. Missing Shared Components

| Component | Current State | Pages That Need It |
|-----------|--------------|-------------------:|
| **FilterBar** | Does not exist | ~20 |
| **EmptyState** | Does not exist | ~15 |
| **DataTable** (with sort, pagination) | Does not exist | ~13 |
| **PageHeader** (title + actions) | Does not exist (Header does banner, not page title) | ~30 |
| **StatGroup** (multiple KPIs in a row) | Does not exist | ~15 |
| **ConfirmDialog** | Reimplemented per-page | ~10 |

---

## Answers to Key Questions

| Question | Answer |
|----------|--------|
| Layout reuse tốt không? | ✅ 89-92% adoption — excellent |
| Có bao nhiêu duplicate KPI? | 🔴 79 ad-hoc KPIs, only 11 pages use MetricCard (34%) |
| Có shared FilterBar không? | ❌ Không. ~20 pages tự build filter riêng |
| Có component thừa / trùng không? | ⚠ 42 pages dùng cả Card + SectionCard; StayCardCompact bị duplicate |
| Missing shared components? | FilterBar, EmptyState, DataTable, PageHeader, StatGroup, ConfirmDialog |

---

## Risk Score: 🟠 MEDIUM-HIGH

- **MetricCard adoption at 34%** is the biggest waste — the component exists and works, it's just not used
- **No FilterBar** causes the most per-page code duplication
- **Layout adoption (89-92%)** is a strength
- **Card vs SectionCard boundary** creates visual inconsistency and developer confusion
