# Comprehensive UI Audit — 7 Issues Across All Pages

**Date:** 2026-02-21  
**Scope:** All 76 files in `src/pages/` (73 functional, 3 excluded: deprecated stubs + error pages)  
**Excludes:** `AuthPage`, `AccessDeniedPage`, `NotFound`, `PendingReviewsPage` (deprecated), `MyTasksPageEnhanced` (deprecated)

---

## Summary

| Issue | Affected Pages | OK Pages |
|-------|---------------|----------|
| **A** Tables without pagination | **35** | 4 (BookingsPage, CollectionsPage, CustomersPage, HostPayablesAgingPage) |
| **B** Filters not in standardized container | **~30** | 1 (BookingsPage has best pattern) |
| **C** Content on gray bg without white container | **3** | ~65 |
| **D** Fixed heights causing 100% zoom issues | **6** | ~60 |
| **3** Tables missing `table-fixed` + explicit column widths | **ALL tables (39 pages)** | 0 |

---

## LIST A — Pages with Tables but NO Pagination

> Standard needed: "Hiển thị X / Y items" + "Số dòng: [dropdown 10/25/50/100]"

### ✅ Pages WITH pagination (4 — reference implementations)
| Page | Pattern |
|------|---------|
| `BookingsPage` | "Hiển thị X / Y booking" + "Số dòng" dropdown |
| `CollectionsPage` | "Hiển thị X–Y / Z" + page nav buttons |
| `CustomersPage` | "Hiển thị X / Y khách" + "Số dòng" dropdown |
| `HostPayablesAgingPage` | "Hiển thị X - Y / Z khoản" + page nav |

### ❌ Pages with tables but NO pagination (35)

#### HIGH PRIORITY — Data listing pages (likely many rows)
| # | Page | Table Type | Likely Row Count |
|---|------|-----------|-----------------|
| 1 | `AuditLogsPage` | `<table>` | High — audit events grow unbounded |
| 2 | `ApprovalsPage` | `<table>` | Medium |
| 3 | `CashOutPage` | `<Table>` | Medium-High |
| 4 | `CashTransfersPage` | `<Table>` | Medium |
| 5 | `DataHealthPage` | `<table>` | Medium-High |
| 6 | `DeclarationListPage` | `<Table>` | High — all check-in declarations |
| 7 | `DisputesPage` | `<table>` | Medium |
| 8 | `HostPayablesPage` | `<table>` | High — all host payables |
| 9 | `LedgerEntriesPage` | `<Table>` | Very High — all ledger entries |
| 10 | `OtaPayoutsPage` | `<table>` | Medium-High |
| 11 | `OutgoingPaymentsPage` | `<Table>` | Medium |
| 12 | `PaymentRequestsPage` | `<Table>` | Medium |
| 13 | `PropertyCatalogPage` | `<Table>` | Low-Medium |
| 14 | `ServiceOrdersPage` | `<table>` | Medium-High |
| 15 | `ServicePayablesPage` | `<Table>` ×3 | Medium |
| 16 | `SettlementHistoryPage` | `<Table>` | Medium-High |
| 17 | `NoShowReportPage` | `<table>` | Medium |
| 18 | `HostDepositsPage` | `<Table>` ×2 | Medium |
| 19 | `CollectionReportsPage` | `<table>` ×2 | Medium |
| 20 | `ota-operations/TasksPage` | `<Table>` | Medium |
| 21 | `ota-operations/ProjectsPage` | `<Table>` | Low-Medium |
| 22 | `ota-operations/KpiPage` | `<Table>` | Low-Medium |

#### MEDIUM PRIORITY — Config/reference tables
| # | Page | Table Type | Notes |
|---|------|-----------|-------|
| 23 | `AccountingPeriodsPage` | `<Table>` | Config data |
| 24 | `CashAccountsPage` | `<Table>` | Config data |
| 25 | `ChannexIntegrationPage` | `<Table>` ×3 | Integration sync logs |
| 26 | `MappingRulesPage` | `<Table>` | Config rules |
| 27 | `MappingsPage` | `<Table>` ×3 | Mapping configs |
| 28 | `ServiceReportsPage` | `<table>` | Reports |
| 29 | `SettingsPage` | `<Table>` ×2 | Config tables |
| 30 | `SyncJobsPage` | `<Table>` ×3 | Job history |
| 31 | `TestCenterLivePage` | `<Table>` | Test results |
| 32 | `TestLabPage` | `<Table>` | Test data |
| 33 | `analytics/HostCostAnalyticsPage` | `<Table>` | Analytics breakdown |

#### LOW PRIORITY — Detail page sub-tables
| # | Page | Table Type | Notes |
|---|------|-----------|-------|
| 34 | `OtaPayoutDetailPage` | `<Table>` ×4 | Detail sub-tables |
| 35 | `HostSettlementPage` | `<table>` ×4 | Settlement breakdown |

> **Note:** `Dashboard` has a `<table>` but it's a summary embedded in dashboard view. `BookingDetailPage` and `HostPayableDetailPage` have `<table>` for detail display — pagination not needed there.

---

## LIST B — Pages with Filters but NOT in Standardized Filter Container

> **Reference standard (BookingsPage):** Filters inside a `rounded-xl border border-border/60 bg-card p-3 md:p-5 shadow-sm` container with card-like appearance, search input full-width, then filter dropdowns in a flex row.

### Filter Pattern Inventory

| Pattern | Description | Pages Using |
|---------|-------------|-------------|
| **A — Card container** | Filters in bordered bg-card container | `BookingsPage` only |
| **B — Bare flex row** | Filters in `flex flex-wrap gap-*` directly in SectionCard | ~20 pages |
| **C — KPI stats + bare filters** | KPI stat cards at top, then bare filter dropdowns | 5 pages |
| **D — Date pickers in header** | Date range pickers in page header area | ~3 pages |
| **E — No explicit filter container** | Filters mixed into page content | ~5 pages |

### Pages with filters — ALL need standardization except BookingsPage

#### Pattern B — Bare flex row (need wrapper card)
| # | Page | Filter Elements |
|---|------|----------------|
| 1 | `AuditLogsPage` | Search + Select(action) + Select(entity) |
| 2 | `ApprovalsPage` | Select(status) |
| 3 | `CashOutPage` | Search + Select + date pickers |
| 4 | `CustomersPage` | Search + "Số dòng" dropdown |
| 5 | `DataHealthPage` | Search + Select(type) + Select(status) |
| 6 | `DeclarationListPage` | Search + Select(host) + Select(property) + Select(status) + Date pickers |
| 7 | `HostDepositsPage` | Select(host) |
| 8 | `HostSettlementPage` | Search combobox for host |
| 9 | `LedgerEntriesPage` | Search + Select(account) + Select(type) + Select(direction) + Select(reconciled) |
| 10 | `MappingsPage` | Select(property filter) |
| 11 | `NoShowReportPage` | Date from/to + Select(source) + Select(property) |
| 12 | `OutgoingPaymentsPage` | Search + Select(status) |
| 13 | `PaymentRequestsPage` | Filters |
| 14 | `PropertyCatalogPage` | Select(filter) |
| 15 | `ServiceOrdersPage` | Search + Select(status) + Select(property) + Select(type) + Select(period) + Date pickers |
| 16 | `SettlementHistoryPage` | Search |
| 17 | `SyncJobsPage` | Select(property) |
| 18 | `HostPayablesAgingPage` | Search + Select(host) + Select(status) + Select(sort) |
| 19 | `ota-operations/TasksPage` | Select(status) + Select(assignee) + Select(priority) |
| 20 | `ota-operations/ProjectsPage` | Select(status) |
| 21 | `ota-operations/KpiPage` | Select(property) + Select(period) |

#### Pattern C — KPI stats then bare filter row
| # | Page | KPI + Filter Elements |
|---|------|----------------------|
| 22 | `CollectionsPage` | 7 KPI stat cards + Select(host) + Select(property) + Select(month) + Select(OTA) + Select(type) + Date range |
| 23 | `DisputesPage` | 6 KPI stat cards + Select(OTA) + Select(property) + Select(type) |
| 24 | `HostPayablesPage` | 5 KPI stat cards + Select(host) + Select(status) |
| 25 | `OtaPayoutsPage` | 4 KPI stat cards + Select(OTA) + Select(status) |

#### Pattern D — Filters in header/page area
| # | Page | Filter Elements |
|---|------|----------------|
| 26 | `AIPricingRecommendationsPage` | Select(property) in SectionCard header |
| 27 | `AIPricingValidationPage` | Select(property) + Select(dateRange) in SectionCard header |
| 28 | `AIPricingInsightsPage` | Filters in page |
| 29 | `InventoryPage` | Complex filter set: Select(property) + multi DropdownMenus |
| 30 | `ServicePayablesPage` | "Bộ lọc kỳ quyết toán" section |

#### Pages with NO filters (no action needed)
`AccountingPeriodsPage`, `CashAccountsPage`, `CashTransfersPage`, `ChannexIntegrationPage`, `CollectionReportsPage`, `MappingRulesPage`, `ServiceReportsPage`, `SettingsPage`, `TestCenterLivePage`, `TestLabPage`

---

## LIST C — Pages with Content on Gray Background Without White Container

> Standard: All page content should be inside `<PageContainer><SectionCard>...</SectionCard></PageContainer>`

### ❌ Pages NOT wrapped in SectionCard

| # | Page | Current Pattern | Issue |
|---|------|----------------|-------|
| 1 | **`Dashboard`** | `<PageContainer>` → direct `bg-card` divs | No SectionCard wrapper; content floats with individual cards on gray bg |
| 2 | **`ChannexEmbedPage`** | `<PageContainer>` → `<Card>` | No SectionCard; uses Card directly, also has `h-[calc(100vh-8rem)]` |
| 3 | **`DocumentationPage`** | Standalone `min-h-screen bg-background` | Full-screen custom layout, no PageContainer or SectionCard |

### ⚠️ Pages using SectionCard but with potential gaps

Most pages (65+) properly use `<PageContainer><SectionCard>...</SectionCard></PageContainer>`. Some noteworthy patterns:

| Page | Pattern | Note |
|------|---------|------|
| `OtaMessagesPage` | `<PageContainer><SectionCard>` wraps `h-[calc(100vh-4rem)]` | SectionCard present but fixed height breaks it |
| `email/EmailAccountsPage` | `<PageContainer><SectionCard>` wraps `h-[calc(100vh-64px)]` | Same issue |
| `email/EmailInboxPage` | `<PageContainer><SectionCard>` wraps `h-[calc(100vh-64px)]` | Same issue |
| `email/EmailThreadDetailPage` | `<PageContainer><SectionCard>` wraps `h-[calc(100vh-64px)]` | Same issue |

---

## LIST D — Pages with Fixed Heights Causing 100% Zoom / Viewport Issues

### ❌ CRITICAL — Full-page fixed height containers

| # | Page | Class | Line | Risk |
|---|------|-------|------|------|
| 1 | **`OtaMessagesPage`** | `h-[calc(100vh-4rem)]` | L605 | Chat layout locks to viewport, content may clip at 100% zoom |
| 2 | **`ChannexEmbedPage`** | `h-[calc(100vh-8rem)]` on PageContainer | L98 | Embed fills viewport, no scroll escape |
| 3 | **`DocumentationPage`** | `h-[calc(100vh-57px)]` on sidebar | L1560 | Sidebar locked to viewport |
| 4 | **`email/EmailAccountsPage`** | `h-[calc(100vh-64px)]` | L44 | Full-page fixed height |
| 5 | **`email/EmailInboxPage`** | `h-[calc(100vh-64px)]` | L66 | Full-page fixed height |
| 6 | **`email/EmailThreadDetailPage`** | `h-[calc(100vh-64px)]` | L60 | Full-page fixed height |

### ⚠️ MINOR — Fixed heights on loading/empty states only

| Page | Class | Notes |
|------|-------|-------|
| `DisputeDetailPage` | `h-screen` | Only on loading/error states |
| `BookingDetailPage` | `h-screen` | Only on loading/error states |
| `ota-operations/ProjectsPage` | `h-[calc(100vh-4rem)]` | Loading state only |
| `ota-operations/TasksPage` | `h-[60vh]` | Loading state only |
| `ota-operations/TaskDetailPage` | `h-[60vh]`, `h-[40vh]` | Loading/error states |
| `ota-operations/MyTasksPage` | `h-[60vh]` | Loading state only |
| `ota-operations/KpiPage` | `h-[60vh]` | Loading state only |
| `WhatsAppSettingsPage` | `h-[60vh]` | Loading/error states |
| `TestCenterLivePage` | `min-h-[60vh]` | Loading state |
| `TestLabPage` | `min-h-[60vh]` | Loading/error states |

### ⚠️ MINOR — Fixed heights on dialog/modal content (acceptable)

| Page | Class | Notes |
|------|-------|-------|
| `AuditLogsPage` | `max-h-[80vh]` | Dialog |
| `OutgoingPaymentsPage` | `max-h-[90vh]` | Dialog |
| `PaymentRequestsPage` | `max-h-[90vh]` | Dialog |
| `ServicePayablesPage` | `max-h-[90vh]` | Dialog |
| `PartnersPage` | `max-h-[90vh]`, `max-h-[80vh]` | Dialogs |
| `CashOutPage` | `max-h-[90vh]` | Dialog |
| `CustomersPage` | `max-h-[90vh]` | Dialog |

---

## Issue 3 — Table Column Widths (ALL tables affected)

**Zero pages use `table-fixed`.** All tables use auto column widths, causing layout jumps.

### Tables that DO have some `w-[...]` on columns (partial fix)
| Page | Columns with widths |
|------|-------------------|
| `CashTransfersPage` | `w-[120px]`, `w-[100px]`, `w-[50px]`, `w-[80px]` |
| `DocumentationPage` | `w-[180px]`, `w-[120px]`, `w-[80px]`, `w-[150px]` |
| `LedgerEntriesPage` | `w-[100px]`, `w-[80px]` ×3, `w-[50px]` |
| `MappingsPage` | `w-[100px]` on Actions columns |
| `PropertyCatalogPage` | `w-[50px]` |
| `SettlementHistoryPage` | `w-[120px]`, `w-[100px]` |
| `DeclarationListPage` | `w-12`, `w-20` |

### Tables with NO column width hints at all
ALL other table pages — columns depend entirely on content width.

### Fix needed for ALL tables:
```tsx
// Add to every <Table> or <table>:
<Table className="table-fixed w-full">
// Then add w-[...] to each <TableHead>/<th>
```

---

## Issue 1 — Spacing Audit

### SectionCard `space-y-5` coverage
Most pages using SectionCard get automatic `space-y-5` between children. However:

| Issue | Pages |
|-------|-------|
| Dashboard has no SectionCard, spacing via manual gaps | Dashboard |
| Pages with dense filter rows could benefit from more structured spacing | AuditLogsPage, DataHealthPage, etc. |
| Pages with KPI cards + filters + table need clearer section breaks | CollectionsPage, DisputesPage, HostPayablesPage, OtaPayoutsPage |

---

## Recommended Fix Priority

### Phase 1 — Quick wins (standardize containers)
1. Add `table-fixed` + column widths to all tables
2. Add pagination to top-20 high-traffic data pages
3. Wrap Dashboard content in SectionCard

### Phase 2 — Filter standardization
4. Create reusable `<FilterBar>` component
5. Wrap all filter sections in standardized container matching BookingsPage pattern
6. Add "Bộ lọc" title to filter containers

### Phase 3 — Viewport fixes
7. Replace `h-[calc(100vh-*)]` with flex-based layouts or `min-h` alternatives
8. Fix email pages to use scrollable containers instead of viewport-locked heights

### Phase 4 — Pagination for remaining pages
9. Add pagination to config/reference table pages
10. Add pagination footer to detail page sub-tables where row count > 10
