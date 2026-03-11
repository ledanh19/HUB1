# AUDIT: SOT P&L vs Dashboard "Lợi nhuận vs Dòng tiền"

> **Version:** 1.0  
> **Date:** 2026-02-16  
> **Auditor:** System Architecture Audit  
> **Status:** CONTEXT LOCK COMPLETE

---

## EXECUTIVE SUMMARY

Phát hiện **3 điểm lệch chính** giữa Report P&L và Dashboard card "Lợi nhuận vs Dòng tiền":

| # | Vấn đề | Mức độ | Tác động |
|---|--------|--------|----------|
| 1 | **Time Key khác nhau** | 🔴 HIGH | Dashboard dùng `stays.actual_check_out_at`, Report dùng `unified_bookings.check_out_date` |
| 2 | **Data source khác nhau** | 🟡 MEDIUM | Dashboard query `bookings_mirror` trực tiếp, Report dùng `unified_bookings` view qua `useBookings()` hook |
| 3 | **Query logic không shared** | 🟡 MEDIUM | Duplicate calculation logic, maintenance burden, drift risk |

**Đề xuất:** Tạo shared calculator hook `usePLCalculator.ts` làm SOT, cả Dashboard và Report đều gọi.

---

## A. CODE ENTRYPOINTS

### A1. Report P&L Page

| Thuộc tính | Giá trị |
|------------|---------|
| **URL Route** | `/reports/pnl` |
| **Component** | [src/pages/ReportsPnlPage.tsx](src/pages/ReportsPnlPage.tsx) |
| **API Endpoints** | Direct Supabase queries (no backend API) |
| **Router Entry** | [src/App.tsx#L140](src/App.tsx#L140) |

**Hooks/Services sử dụng:**
- `useBookings()` - [src/hooks/useBookings.ts](src/hooks/useBookings.ts) - Lấy bookings từ `unified_bookings` view
- `useBookingAmountOverrides()` - [src/hooks/useBookingAmountOverrides.ts](src/hooks/useBookingAmountOverrides.ts)
- Direct Supabase queries for: `hotel_collects`, `service_orders`, `host_supply_segments`, `bookings_mirror`, `booking_amount_overrides`, `payment_requests`

### A2. Dashboard "Lợi nhuận vs Dòng tiền" Card

| Thuộc tính | Giá trị |
|------------|---------|
| **URL Route** | `/` (Dashboard) |
| **Component** | [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) |
| **Card Location** | Lines 2101-2171 (Profit vs Cash Gap Card) |
| **P&L Calculation** | Lines 456-857 (P&L METRICS section) |
| **UI Copy/Tooltip** | [src/components/dashboard/financeUICopy.ts](src/components/dashboard/financeUICopy.ts) |

**Data Queries:**
- `roomRevenue`: Lines 462-570
- `serviceRevenue`: Lines 573-595  
- `hostCost`: Lines 598-665
- `serviceCost`: Lines 668-688
- `otaCommission`: Lines 693-782
- `opexFromPayments`: Lines 785-845
- `cashInData`: Lines 396-428
- `cashOutData`: Lines 431-452

---

## B. DATA FLOW TRACES

### B1. Report P&L Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ReportsPnlPage.tsx                            │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  useBookings() hook                                                  │
│  - Queries: unified_bookings view                                    │
│  - Filter: channex_property_groups (An Gia group)                    │
│  - Returns: UnifiedBooking[]                                          │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Client-side filtering (useMemo)                                     │
│  - Filter by: stay_status = 'CHECKED_OUT'                            │
│  - Filter by: check_out_date in [startDate, endDate]                 │
│  - Filter by: check_out_date <= today                                │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Additional queries (React Query)                                    │
├──────────────────────────────────────────────────────────────────────┤
│  1. hotel_collects (HOTEL_COLLECT guardrail)                         │
│  2. service_orders (service revenue/cost by service_date_time)       │
│  3. host_supply_segments (host cost by booking checkout)             │
│  4. bookings_mirror + booking_amount_overrides (OTA commission)      │
│  5. payment_requests (OPEX by expense_period or created_at)          │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Calculations                                                        │
│  totalRevenue = roomRevenue + serviceRevenue                         │
│  totalCOGS = hostCost + serviceCost                                  │
│  grossProfit = totalRevenue - totalCOGS                              │
│  opex = OPEX categories + OTA Commission                             │
│  netProfit = grossProfit - opex                                      │
│  grossMargin = (grossProfit / totalRevenue) * 100                    │
│  netMargin = (netProfit / totalRevenue) * 100                        │
└──────────────────────────────────────────────────────────────────────┘
```

### B2. Dashboard P&L Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Dashboard.tsx                               │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Direct Supabase queries (React Query)                               │
│  - Queries: bookings_mirror table (NOT unified_bookings view)        │
│  - Filter: channex_groups + channex_property_groups (An Gia)         │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STAYS table join for CHECKED_OUT status                             │
│  ⚠️ KEY DIFFERENCE: Uses stays.actual_check_out_at for date filter   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Additional queries (React Query)                                    │
├──────────────────────────────────────────────────────────────────────┤
│  1. stays (filter by actual_check_out_at in date range)              │
│  2. hotel_collects (HOTEL_COLLECT guardrail - status != VOIDED)      │
│  3. booking_amount_overrides (override amounts)                      │
│  4. service_orders (service revenue/cost by service_date_time)       │
│  5. host_supply_segments (host cost)                                 │
│  6. payment_requests (OPEX)                                          │
│  7. cash_ins (for Cash component)                                    │
│  8. cash_outs (for Cash component)                                   │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Calculations                                                        │
│  totalRevenue = roomRevenue + serviceRevenue                         │
│  totalCOGS = hostCost + serviceCost                                  │
│  grossProfit = totalRevenue - totalCOGS                              │
│  opex = opexFromPayments + otaCommission                             │
│  netProfit = grossProfit - opex                                      │
│  netCashflow = cashInData - cashOutData                              │
│  profitCashGap = netProfit - netCashflow                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## C. TABLES/VIEWS INVENTORY

### C1. Tables Đang Đọc

| Table/View | Report P&L | Dashboard | Purpose |
|------------|:----------:|:---------:|---------|
| `unified_bookings` | ✅ | ❌ | View tổng hợp booking (qua useBookings hook) |
| `bookings_mirror` | ✅ (commission) | ✅ | Booking data gốc từ Channex |
| `stays` | ❌ | ✅ | Actual checkout tracking |
| `hotel_collects` | ✅ | ✅ | Cash collection records |
| `booking_amount_overrides` | ✅ | ✅ | Override booking amounts |
| `service_orders` | ✅ | ✅ | Service revenue/cost |
| `host_supply_segments` | ✅ | ✅ | Host cost (COGS) |
| `payment_requests` | ✅ | ✅ | OPEX categories |
| `cash_outs` | ❌ | ✅ | Cash out records |
| `channex_groups` | ❌ | ✅ | Property grouping |
| `channex_property_groups` | ❌ | ✅ | Property→Group mapping |

### C2. Views Structure

**`unified_bookings` view** (used by Report P&L):
- Includes `stay_status` từ `stays` table
- Dùng `check_out_date` (scheduled) không phải `actual_check_out_at`
- Pre-filtered bởi An Gia group trong `useBookings()` hook

---

## D. SOT IDENTIFICATION

### D1. SOT cho P&L (Accrual)

| Metric | Report P&L SOT | Dashboard SOT | RECOMMENDATION |
|--------|----------------|---------------|----------------|
| **Revenue (Room)** | `unified_bookings.total_amount_net` + overrides, filtered by `check_out_date` | `bookings_mirror.total_amount_net` + overrides, filtered by `stays.actual_check_out_at` | 🔴 USE `actual_check_out_at` (more accurate) |
| **Revenue (Service)** | `service_orders.sale_price` by `service_date_time` | Same | ✅ ALIGNED |
| **Host Cost (COGS)** | `host_supply_segments.total_amount` by booking checkout | Same | ✅ ALIGNED (nhưng time key khác) |
| **Service Cost** | `service_orders.cost_price` by `service_date_time` | Same | ✅ ALIGNED |
| **OTA Commission** | `bookings_mirror.commission_amount` + `booking_amount_overrides` | Same | ✅ ALIGNED |
| **OPEX** | `payment_requests` by `expense_period` or `created_at` | Same | ✅ ALIGNED |

### D2. SOT cho Cashflow (Cash)

| Metric | SOT | Source |
|--------|-----|--------|
| **Cash In** | `hotel_collects` | `collected_at` in range, `payee_type='ROOMRISE'`, `collection_type='COLLECT'`, `status!='VOIDED'` |
| **Cash Out** | `cash_outs` | `paid_at` in range |

### D3. Time Key Convention (Proposed SOT)

| Metric Type | Time Key | Rationale |
|-------------|----------|-----------|
| **Room Revenue (Accrual)** | `stays.actual_check_out_at` | ✅ Actual checkout date is more accurate than scheduled |
| **Service Revenue** | `service_orders.service_date_time` | When service was actually performed |
| **Host Cost** | `stays.actual_check_out_at` (của booking) | Matching Principle: cost recognized when revenue is |
| **OTA Commission** | `stays.actual_check_out_at` | Same as revenue |
| **OPEX** | `expense_period` or `created_at` | Period-based expenses |
| **Cash In** | `hotel_collects.collected_at` | When cash was actually received |
| **Cash Out** | `cash_outs.paid_at` | When cash was actually paid |

### D4. Exclusion Rules (Proposed SOT)

| Scenario | Rule | Applied In |
|----------|------|------------|
| CANCELLED bookings | Exclude from revenue/cost | ✅ Both (via `booking_status != 'CANCELLED'`) |
| NO_SHOW | Exclude from revenue | ⚠️ Mixed - need to verify |
| VOIDED hotel_collects | Exclude from cash | ✅ Both (via `status != 'VOIDED'`) |
| Refund/Chargeback | Handle via negative entries or separate | ⚠️ Not clearly defined |
| IMPORTED bookings | Use `booking_amount_overrides.amount` | ✅ Both |
| HOTEL_COLLECT (room revenue) | Require `hotel_collects` exists & not VOIDED | ✅ Both |
| OTA_COLLECT (room revenue) | Require `stays.stay_status = 'CHECKED_OUT'` | ✅ Both |

---

## E. DIFF TABLE: A vs B

| Metric | Report P&L (A) | Dashboard (B) | Difference | Impact |
|--------|----------------|---------------|------------|--------|
| **Data Source (Bookings)** | `unified_bookings` view via `useBookings()` | `bookings_mirror` table direct query | Different join logic | LOW |
| **Time Key (Room Revenue)** | `check_out_date` (scheduled) | `stays.actual_check_out_at` | 🔴 **CRITICAL** Can cause timing mismatch | HIGH |
| **Time Key (Host Cost)** | `check_out_date` (scheduled) | `stays.actual_check_out_at` | 🔴 **CRITICAL** Same impact | HIGH |
| **Property Scope** | `AN_GIA_GROUP_ID` hardcoded in `useBookings()` | Query `channex_groups` by title "An Gia Residences" | Equivalent but different code path | LOW |
| **Sample Data Filter** | Via `useBookings()` which checks `is_sample_data` | Explicit `includeSampleData` toggle | Equivalent | LOW |
| **Margin Calculation** | `(profit / revenue) * 100`, show 0 if revenue=0 | Not displayed in "Profit vs Cash" card | N/A | NONE |
| **Rounding** | `maximumFractionDigits: 0` for VND | Same | ✅ ALIGNED | NONE |
| **Sign Convention** | Positive = profit, costs shown as positive deduction | Same | ✅ ALIGNED | NONE |

---

## F. RECOMMENDED SOT & REFACTORING PLAN

### F1. Single Source of Truth Selection

**Recommended SOT: Dashboard calculation pattern** with improvements:
- ✅ Uses `stays.actual_check_out_at` (more accurate)
- ✅ Already handles all guardrails (HOTEL_COLLECT, CHECKED_OUT)
- ⚠️ Need to extract into shared hook

**Reasoning:**
1. `actual_check_out_at` is the TRUE business event (guest actually left)
2. `check_out_date` is just the EXPECTED date, may not reflect reality
3. Dashboard is already more robust with stays table integration

### F2. Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     usePLCalculator.ts (NEW)                        │
│  ═══════════════════════════════════════════════════════════════════│
│  Single Source calculation hook                                      │
│                                                                      │
│  Input: { startDate, endDate, includeSampleData }                    │
│  Output: PLContract (see section G)                                  │
│                                                                      │
│  Internal:                                                           │
│  - Uses stays.actual_check_out_at as time key                        │
│  - Queries bookings_mirror + stays + overrides                       │
│  - Applies all guardrails                                            │
│  - Returns both accrual and cash metrics                             │
└─────────────────────────────────────────────────────────────────────┘
           │                                    │
           ▼                                    ▼
┌─────────────────────────┐        ┌─────────────────────────┐
│   ReportsPnlPage.tsx    │        │     Dashboard.tsx       │
│                         │        │                         │
│  const { data } =       │        │  const { data } =       │
│    usePLCalculator({    │        │    usePLCalculator({    │
│      startDate,         │        │      startDate,         │
│      endDate            │        │      endDate            │
│    });                  │        │    });                  │
│                         │        │                         │
│  // Render using        │        │  // Render using        │
│  // data.accrual.*      │        │  // data.accrual.*      │
│  // data.cash.*         │        │  // data.cash.*         │
│  // data.difference.*   │        │  // data.difference.*   │
└─────────────────────────┘        └─────────────────────────┘
```

### F3. Migration Steps (Non-Breaking, Additive)

| Step | Action | Breaking? | Effort |
|------|--------|-----------|--------|
| 1 | Create `usePLCalculator.ts` with extracted logic | NO | Medium |
| 2 | Add `PLContract` interface to `src/types/finance.ts` | NO | Small |
| 3 | Create `formatFinanceCurrency()` shared formatter | NO | Small |
| 4 | Update Dashboard to use `usePLCalculator` | NO | Medium |
| 5 | Update ReportsPnlPage to use `usePLCalculator` | NO | Medium |
| 6 | Add golden test scenarios | NO | Medium |
| 7 | Remove duplicate calculation code | NO | Low |

---

## G. CONTRACT OBJECT SPECIFICATION

### G1. PLContract Interface

```typescript
interface PLContract {
  period: {
    from: string;          // "YYYY-MM-DD"
    to: string;            // "YYYY-MM-DD"
    timezone: string;      // "+07:00"
  };
  currency: "VND";
  
  accrual: {
    revenue: number;           // Room + Service
    revenue_room: number;      // Room only
    revenue_service: number;   // Service only
    cogs: number;              // Host cost + Service cost
    cogs_host: number;         // Host cost only
    cogs_service: number;      // Service cost only
    opex: number;              // Total OPEX
    opex_ota_commission: number;   // OTA Commission component
    opex_categories: Record<string, number>;  // By category
    gross_profit: number;      // revenue - cogs
    net_profit: number;        // gross_profit - opex
    gross_margin: number | null;   // null if revenue = 0
    net_margin: number | null;     // null if revenue = 0
  };
  
  cash: {
    cash_in: number;
    cash_out: number;
    net_cash: number;          // cash_in - cash_out
  };
  
  difference: {
    profit_minus_cash: number;  // net_profit - net_cash
  };
  
  meta: {
    sources: {
      revenue_room: "bookings_mirror + stays + booking_amount_overrides";
      revenue_service: "service_orders (status=DONE)";
      cogs_host: "host_supply_segments";
      cogs_service: "service_orders (cost_price)";
      opex: "payment_requests (expense_category)";
      cash_in: "hotel_collects (payee_type=ROOMRISE, collection_type=COLLECT)";
      cash_out: "cash_outs";
    };
    time_keys: {
      accrual_room: "stays.actual_check_out_at";
      accrual_service: "service_orders.service_date_time";
      cash_in: "hotel_collects.collected_at";
      cash_out: "cash_outs.paid_at";
    };
    rounding: 0;                    // VND has no decimals
    sign_convention: "positive_is_benefit";  // Revenue/Profit positive, Costs shown as positive amounts (deducted in formulas)
    null_margin_rule: "revenue_zero_returns_null";
  };
  
  debug?: {
    booking_count: number;
    checked_out_count: number;
    hotel_collect_count: number;
    service_order_count: number;
  };
}
```

### G2. Null/Zero Handling Rules

| Scenario | Value | Display |
|----------|-------|---------|
| Revenue = 0 | margin = `null` | Show "—" or "N/A" |
| Revenue > 0, Profit = 0 | margin = `0.00` | Show "0%" |
| Profit < 0 | margin = negative | Show "-X.X%" |
| No bookings in period | All accrual = `0` | Show "0 đ" |
| No cash transactions | cash_in/cash_out = `0` | Show "0 đ" |

### G3. Sign Convention

| Metric | Positive means | Negative means |
|--------|----------------|----------------|
| `revenue` | Income received | Should not happen |
| `cogs` | Cost incurred (stored positive) | Should not happen |
| `opex` | Expense incurred (stored positive) | Should not happen |
| `gross_profit` | Profit | Loss |
| `net_profit` | Profit | Loss |
| `cash_in` | Cash received | Should not happen |
| `cash_out` | Cash paid (stored positive) | Should not happen |
| `net_cash` | Cash surplus | Cash deficit |
| `profit_minus_cash` | Uncollected profit | Overcollected vs profit |

---

## H. VERIFICATION QUERIES

### H1. Compare Room Revenue (Dashboard vs Report)

```sql
-- Dashboard logic (uses actual_check_out_at)
WITH dashboard_revenue AS (
  SELECT 
    bm.unified_booking_id,
    COALESCE(bao.amount, 
      CASE WHEN bm.booking_type = 'IMPORTED' THEN 0 ELSE bm.total_amount_net END
    ) as amount
  FROM bookings_mirror bm
  INNER JOIN stays s ON s.unified_booking_id = bm.unified_booking_id
  LEFT JOIN booking_amount_overrides bao ON bao.unified_booking_id = bm.unified_booking_id
  WHERE s.stay_status = 'CHECKED_OUT'
    AND s.actual_check_out_at >= '2026-02-01'
    AND s.actual_check_out_at < '2026-03-01'
    AND bm.booking_status = 'CONFIRMED'
    -- Add HOTEL_COLLECT guardrail if needed
)
SELECT SUM(amount) as dashboard_room_revenue FROM dashboard_revenue;

-- Report logic (uses check_out_date from unified_bookings view)
-- Compare the results to identify discrepancies
```

---

## I. ACTION ITEMS

### Phase 1: Context Lock (COMPLETE)
- [x] Locate code entrypoints
- [x] Trace data flow
- [x] Identify tables/views
- [x] Document differences
- [x] Create this audit document

### Phase 2: Implementation (TODO)
- [ ] Create `src/types/finance.ts` with `PLContract` interface
- [ ] Create `src/hooks/usePLCalculator.ts` shared hook
- [ ] Create `src/lib/formatters/finance.ts` shared formatters
- [ ] Update Dashboard.tsx to use shared hook
- [ ] Update ReportsPnlPage.tsx to use shared hook
- [ ] Create test scenarios file

### Phase 3: Validation (TODO)
- [ ] Create golden test scenarios
- [ ] Run comparison Dashboard vs Report P&L
- [ ] Verify tooltips match contract fields
- [ ] Document in TEST_CASES_PL_CASH.md

---

## J. APPENDIX: FILE REFERENCES

| File | Lines | Purpose |
|------|-------|---------|
| [src/pages/ReportsPnlPage.tsx](src/pages/ReportsPnlPage.tsx) | 1-853 | P&L Report page |
| [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) | 456-860 | P&L calculation queries |
| [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) | 2101-2171 | Profit vs Cash card render |
| [src/hooks/useBookings.ts](src/hooks/useBookings.ts) | 1-735 | Booking data hook |
| [src/hooks/useDashboardData.ts](src/hooks/useDashboardData.ts) | 1-215 | Dashboard helpers |
| [src/components/dashboard/financeUICopy.ts](src/components/dashboard/financeUICopy.ts) | 1-193 | UI copy strings |
| [docs/FINANCE_DASHBOARD_DEFINITIONS.md](docs/FINANCE_DASHBOARD_DEFINITIONS.md) | 1-277 | KPI definitions |
| [docs/FINANCE_REPORTING_AUDIT_REPORT.md](docs/FINANCE_REPORTING_AUDIT_REPORT.md) | 1-415 | Previous audit |
