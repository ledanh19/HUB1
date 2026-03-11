# AUDIT: Typography System — Roomrise Control Hub

**Date:** 2026-02-21  
**Auditor:** Principal Product UI Architect  
**Scope:** `src/pages/` + `src/components/` (76 pages, ~72 UI components)

---

## 1. Typography Token Infrastructure

| Item | Status |
|------|--------|
| `typography.ts` / `fonts.ts` / `textStyles.ts` | ❌ **Not found** |
| `tailwind.config.ts` `fontSize` extension | ❌ **None** — default Tailwind scale only |
| `tailwind.config.ts` `fontFamily` | ✅ `sans: ["Geist Sans", "system-ui", "sans-serif"]` |
| CSS custom properties for font sizes | ❌ **Not found** |
| Shared heading/body utility classes | ❌ **Not found** |
| KPI text token in CSS vars | ✅ `--kpi-value`, `--kpi-label` (color only, no size) |
| Text semantic tokens in CSS vars | ✅ `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled` (color only) |

**Verdict: Zero typography size/weight design system. All sizing decisions are inline.**

---

## 2. Font-Size Distribution

| Class | Count | Role |
|-------|------:|------|
| `text-xs` (12px) | 1,417 | Labels, badges, metadata |
| `text-sm` (14px) | 1,392 | Default body, form, table cells |
| `text-base` (16px) | 110 | Section headers, responsive steps |
| `text-lg` (18px) | 206 | CardTitle, dialog titles, h2 |
| `text-xl` (20px) | 77 | Page titles, KPI responsive |
| `text-2xl` (24px) | 138 | KPI hero numbers, page h1s |
| `text-3xl` (30px) | 23 | Large stat numbers |
| `text-4xl` (36px) | 4 | Settlement net, 404 |
| `text-5xl` (48px) | 1 | AuthPage hero only |

### Arbitrary (Non-Scale) Sizes — 267 Instances

| Value | Count | Key Locations |
|-------|------:|---------------|
| `text-[6px]` | 4 | AIPricingInsightsPage (calendar badges) |
| `text-[7px]` | 1 | AIPricingInsightsPage |
| `text-[8px]` | 9 | AIPricingInsightsPage, TaskBoardView |
| `text-[9px]` | 31 | Dashboard (~15), Sidebar, MobileSidebar, HostPayablesPage |
| **`text-[10px]`** | **185** | **Dashboard (~30), MobileBottomNav, 15+ pages** |
| `text-[11px]` | 19 | badge.tsx, status-badge.tsx, BookingsPage |
| `text-[13px]` | 15 | table.tsx TableHead, BookingsPage (15x inline duplication) |
| `text-[0.8rem]` | 2 | calendar.tsx |
| `text-[0.85em]` | 1 | DateAuthorityBadge |

**⚠ `text-[10px]` (185 occ) is more frequent than `text-base` (110).** This is the de-facto "micro text" but is not tokenized.

---

## 3. Font-Weight Usage

| Class | Count | % |
|-------|------:|--:|
| `font-medium` (500) | 1,160 | 62% |
| `font-bold` (700) | 336 | 18% |
| `font-semibold` (600) | 331 | 18% |
| `font-normal` (400) | 53 | 3% |
| `font-light` (300) | 0 | 0% |
| `font-extrabold` (800) | 0 | 0% |

Active range: 400–700 only. Clean.

---

## 4. Heading Hierarchy Audit

### `<h1>` — 17 occurrences, 8 distinct style combos

| Pattern | Files |
|---------|-------|
| `text-5xl font-bold leading-tight` | AuthPage |
| `text-4xl font-bold` | NotFound |
| `text-3xl font-bold` | DocumentationPage |
| `text-2xl font-bold` | ProjectDetailPage, TaskDetailPage, AccessDeniedPage, TestCenterLivePage, TestLabPage |
| `text-xl md:text-2xl font-semibold tracking-tight` | Dashboard |
| `text-xl font-semibold` | BookingDetailPage, DisputeDetailPage |
| `text-lg md:text-xl font-bold tracking-tight` | Header.tsx (standard) |
| `text-lg font-semibold` | OtaMessagesPage |
| `text-sm font-semibold tracking-tight` | Sidebar brand text |

**⚠ No single h1 convention.** Sizes range from `text-sm` to `text-5xl`.

### `<h2>` — 6 distinct patterns

| Pattern | Frequency |
|---------|-----------|
| `text-lg font-semibold` | ~15 (de-facto standard) |
| `text-2xl font-bold` | ~4 |
| `text-2xl font-semibold tracking-tight` | 1 |
| `text-xl font-bold` | 2 |
| `text-xl font-semibold leading-tight` | 1 |
| `text-base font-semibold` | 2 (SectionCard) |

### `<h3>` — Inconsistent

- Frequently **omits explicit text size** (inherits from parent)
- Mix of `font-semibold` vs `font-medium` at same semantic level
- Ranges from `text-xs` to `text-lg`

---

## 5. KPI Number Styling

### Standardized (MetricCard) — 11 pages

| Element | Style |
|---------|-------|
| Title | `text-xs font-medium text-muted-foreground uppercase tracking-wider` |
| Value | `text-2xl font-semibold tracking-tight tabular-nums` |
| Subtitle | `text-xs text-muted-foreground` |
| Change % | `text-xs font-medium` + semantic color |

### Ad-Hoc — 21 pages, ~79 instances

| Pattern | Pages |
|---------|-------|
| `text-2xl font-bold` | ControlHubPage, KpiPage, ProjectsPage, TasksPage, AIPricingValidation, WhatsApp |
| `text-2xl font-bold tabular-nums tracking-tight` | HostCostAnalytics, PriceSpreadAnalytics |
| `text-2xl font-semibold` | ApprovalsPage |
| `text-3xl font-bold` | MyTasksPage, DebugBookingsPage, ReportsPnlPage, ReportsCashflowPage |
| `text-3xl font-bold tracking-tight` | StaysPage |
| `text-3xl font-semibold tracking-tight` | CollectionReportsPage |
| `text-4xl font-bold` | HostSettlementPage |
| `text-lg md:text-xl font-bold` | DisputesPage |
| `text-xl md:text-2xl font-bold` | Dashboard |
| custom `.kpi-value` CSS class | HostPayablesPage |

**⚠ 9+ distinct KPI size/weight combos. `tabular-nums` used inconsistently (only MetricCard + 2 pages).**

---

## 6. Table Text

### Base Component `table.tsx`

| Element | Style |
|---------|-------|
| `<table>` | `text-sm` |
| `TableHead` | `text-[13px] font-semibold text-muted-foreground/90 tracking-wide` |
| `TableCell` | inherits `text-sm` from table |

### Per-Page Problems

- **BookingsPage**: duplicates `TableHead` styling inline 15 times via raw `<th>`
- **6+ pages**: override cell sizes to `text-[10px]`, `text-[11px]`, `text-[9px]` within same table
- **16 pages**: use raw `<td>` with custom padding instead of `TableCell`

---

## 7. Line-Height & Letter-Spacing

- **`leading-*`**: Only 21 explicit usages out of ~3,700 text declarations. 99.4% rely on Tailwind defaults.
- **`tracking-tight`**: 25 occ (KPI values, titles)
- **`tracking-wide`**: 68 occ (inflated by BookingsPage 15x duplication)
- **`tracking-wider`**: 4 occ (MetricCard only)
- **`tracking-widest`**: 6 occ (keyboard shortcuts, brand subtitle)

---

## Answers to Key Questions

| Question | Answer |
|----------|--------|
| Có typography scale cố định không? | ❌ Không. Default Tailwind scale + 267 arbitrary values |
| Có file typography.ts / token không? | ❌ Không |
| Có dùng Tailwind config map typography không? | ❌ Không. Không có fontSize extension |
| Có hardcode font-size lẻ không? | ✅ Có. 267 instances, `text-[10px]` = 185 |

---

## Risk Score: 🔴 HIGH

- **No typography system exists**
- **267 off-scale font sizes** in production
- **9+ KPI number patterns** across 32 pages
- **8 distinct h1 patterns**
- **`text-[10px]` is effectively an undocumented design token used 185 times**
