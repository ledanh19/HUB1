# Finance Reporting Verification Plan

> Test plan để verify Dashboard ↔ P&L ↔ Cashflow consistency
> Last updated: 2026-01-03

---

## 1. VERIFICATION CASES

### Case 1: Fixed Range (01/01 → 03/01/2026)

**Setup:**
- Dashboard: period = "custom" hoặc điều chỉnh "month" 
- P&L: period = "custom" from 01/01 to 03/01
- Cashflow: period = "custom" from 01/01 to 03/01

**Expected Numbers Table:**

| Metric | Dashboard | P&L Page | Cashflow Page | Match? |
|--------|-----------|----------|---------------|--------|
| Room Revenue | `___` | `___` | N/A | ⬜ |
| Service Revenue | `___` | `___` | N/A | ⬜ |
| Host Cost | `___` | `___` | N/A | ⬜ |
| Service Cost | `___` | `___` | N/A | ⬜ |
| OPEX | `___` | `___` | N/A | ⬜ |
| **Net Profit** | `___` | `___` | N/A | ⬜ |
| Cash In | `___` | N/A | `___` | ⬜ |
| Cash Out | `___` | N/A | `___` | ⬜ |
| **Net Cashflow** | `___` | N/A | `___` | ⬜ |
| Gap (Profit - Cash) | `___` | N/A | N/A | Calculated |

### Case 2: Today Boundary (03/01/2026)

**Setup:**
- All pages: period = "today"

**Expected:** Same numbers across all 3 pages for matching metrics.

| Metric | Dashboard | P&L Page | Cashflow Page | Match? |
|--------|-----------|----------|---------------|--------|
| Room Revenue | `___` | `___` | N/A | ⬜ |
| Cash In | `___` | N/A | `___` | ⬜ |
| Cash Out | `___` | N/A | `___` | ⬜ |
| Net Cashflow | `___` | N/A | `___` | ⬜ |

---

## 2. BOOKING SET COMPARISON

### 2.1 Sample Booking Analysis

Run this query to get 5 sample bookings for verification:

```sql
SELECT 
  unified_booking_id,
  ota_source,
  booking_status,
  check_out_date,
  total_amount_net,
  total_amount_gross
FROM unified_bookings
WHERE check_out_date BETWEEN '2026-01-01' AND '2026-01-03'
ORDER BY check_out_date DESC
LIMIT 5;
```

**Results:**

| booking_id | source | status | checkout | amount_net | In P&L? | In Cash? |
|------------|--------|--------|----------|------------|---------|----------|
| | | | | | ⬜ | ⬜ |
| | | | | | ⬜ | ⬜ |
| | | | | | ⬜ | ⬜ |
| | | | | | ⬜ | ⬜ |
| | | | | | ⬜ | ⬜ |

### 2.2 Mismatch Detection

```sql
-- Bookings in P&L but missing from Cash (AR)
SELECT 
  ub.unified_booking_id,
  ub.check_out_date,
  ub.total_amount_net,
  'P&L only (AR)' as status
FROM unified_bookings ub
LEFT JOIN hotel_collects hc 
  ON ub.unified_booking_id = hc.unified_booking_id
  AND hc.payee_type = 'ROOMRISE'
  AND hc.status != 'VOIDED'
WHERE ub.check_out_date BETWEEN '2026-01-01' AND '2026-01-03'
  AND ub.booking_status = 'CONFIRMED'
  AND hc.id IS NULL;
```

**Mismatch Table:**

| booking_id | checkout | amount | reason |
|------------|----------|--------|--------|
| | | | |

---

## 3. TIMEZONE VERIFICATION

### Test: Midnight Boundary

**Scenario:** Booking với check_out_date = '2026-01-03' (local)

**Query at 23:30 GMT+7 (= 16:30 UTC):**

| Method | Result Date | Correct? |
|--------|-------------|----------|
| `toISOString().split("T")[0]` | `2026-01-03` (if before midnight UTC) | ⚠️ Edge case |
| `format(date, "yyyy-MM-dd")` | `2026-01-03` (local) | ✅ |

**Expected behavior:** Both methods should return same date for Vietnam timezone (GMT+7).

---

## 4. UI VERIFICATION CHECKLIST

### Dashboard

- [ ] Period selector shows: "Hôm nay", "7 ngày qua", "30 ngày qua", "Tháng này"
- [ ] Explicit date range displayed: "03/01/2026" or "01/01 → 03/01/2026"
- [ ] Last updated timestamp shown
- [ ] Forecast card notes "30 ngày tới" with actual dates

### P&L Page

- [ ] Period selector includes: "Hôm nay", "Tuần", "Tháng", "Quý", "Năm"
- [ ] Date range displayed in header
- [ ] Shows: "Đang tính theo: Check-out date"
- [ ] All KPIs have drill-down capability

### Cashflow Page

- [ ] Period selector matches P&L
- [ ] Date range displayed in header
- [ ] Shows: "Đang tính theo: collected_at / paid_at"
- [ ] Direction filter works (IN/OUT/ALL)

---

## 5. REGRESSION TEST SCENARIOS

### Scenario A: Normal User Flow

1. Open Dashboard
2. Select "Tháng này"
3. Note Cash In value: `___`
4. Navigate to /reports/cashflow
5. Select "Tháng này"
6. Compare Cash In value: `___`
7. **Result:** Match? ⬜

### Scenario B: Cross-Page Navigation

1. Open P&L with "Quý này"
2. Note Net Profit: `___`
3. Navigate to Dashboard
4. Dashboard should retain period OR show default
5. Compare if same period: `___`
6. **Result:** Consistent? ⬜

### Scenario C: Edge Date

1. Set date = 2026-01-31 23:00 (local)
2. Select "Tháng này" on all pages
3. **Expected:** Range = 01/01 → 31/01
4. Dashboard range: `___`
5. P&L range: `___`
6. Cashflow range: `___`
7. **Result:** All same? ⬜

---

## 6. SQL VERIFICATION SCRIPTS

### Script 1: P&L vs Dashboard Room Revenue

```sql
-- Run both and compare totals
-- Dashboard P&L query (with sample data filter)
SELECT SUM(total_amount_net) as dashboard_room_revenue
FROM unified_bookings
WHERE check_out_date BETWEEN '2026-01-01' AND '2026-01-03'
  AND booking_status = 'CONFIRMED'
  AND (stay_status = 'CHECKED_OUT' OR check_out_date <= '2026-01-03')
  AND is_sample_data = false;

-- P&L Page query (without sample data filter)
SELECT SUM(total_amount_net) as pnl_room_revenue
FROM unified_bookings
WHERE check_out_date BETWEEN '2026-01-01' AND '2026-01-03'
  AND booking_status = 'CONFIRMED'
  AND (stay_status = 'CHECKED_OUT' OR check_out_date <= '2026-01-03');
```

**Difference Explanation:**
- Dashboard có `includeSampleData` toggle
- P&L page KHÔNG có toggle này → Potential mismatch

### Script 2: Cash In Comparison

```sql
-- Dashboard Cash In
SELECT SUM(amount_collected) as dashboard_cash_in
FROM hotel_collects
WHERE collected_at BETWEEN '2026-01-01T00:00:00' AND '2026-01-03T23:59:59'
  AND payee_type = 'ROOMRISE'
  AND collection_type = 'COLLECT'
  AND status != 'VOIDED'
  AND is_sample_data = false;

-- Cashflow Page Cash In
SELECT SUM(amount_collected) as cashflow_cash_in
FROM hotel_collects
WHERE collected_at BETWEEN '2026-01-01T00:00:00' AND '2026-01-03T23:59:59'
  AND payee_type = 'ROOMRISE'
  AND collection_type = 'COLLECT'
  AND status != 'VOIDED';
```

---

## 7. KNOWN ISSUES & FIXES

### Issue #1: Sample Data Toggle ⚠️ STILL OPEN

**Problem:** Dashboard has `includeSampleData` toggle but P&L/Cashflow pages don't.

**Impact:** Numbers won't match if sample data exists.

**Fix Required:** Add `is_sample_data` filter to P&L and Cashflow pages, or add toggle.

**Status:** TODO - Low priority if no sample data in production.

### Issue #2: Timezone Mismatch ✅ FIXED

**Problem:** 
- Dashboard P&L uses `format()` (local timezone)
- Dashboard Cash uses `toISOString()` (UTC)
- P&L/Cashflow pages use `toISOString()` (UTC)

**Impact:** Off-by-one day near midnight.

**Fix Applied:**
- ReportsPnlPage.tsx: Changed to `format(startDate, "yyyy-MM-dd")` with date-fns
- ReportsCashflowPage.tsx: Changed to `format(startDate, "yyyy-MM-dd")` with date-fns
- Dashboard.tsx: Changed Cash queries to use `cashDateRange` with formatted dates

**Status:** ✅ FIXED

### Issue #3: Period Preset Mismatch ⚠️ PARTIALLY FIXED

**Problem:**
- Dashboard: today, 7days, 30days, month
- P&L/Cashflow: today, week, month, quarter, year

**Impact:** User can't compare same period easily.

**Partial Fix:** Added date range display showing exact dates, so user can see actual range.

**TODO:** Add "30 ngày" option to P&L/Cashflow pages.

**Status:** Partially fixed - date range now visible.

---

## 8. ACCEPTANCE CRITERIA

### AC-1: Number Match

```
Dashboard[Cash In] @ period=today 
  === Cashflow[Cash In] @ period=today
  (tolerance: 0 VND)
```

**Status:** ⬜ Not tested

### AC-2: Date Range Display

```
All 3 pages must show explicit date range:
"Kỳ: {preset} | {start} → {end}"
```

**Status:** ⬜ Not implemented

### AC-3: Booking Set Consistency

```
For same period, P&L and Dashboard must include 
exactly the same set of booking_ids.
```

**Status:** ⬜ Not tested

### AC-4: Timezone Consistency

```
No booking should be included/excluded differently 
due to timezone conversion at midnight boundary.
```

**Status:** ⬜ Not tested

---

## 9. SIGN-OFF

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | | | ⬜ |
| QA | | | ⬜ |
| Finance | | | ⬜ |

---

*Complete all tests before declaring verification passed.*
