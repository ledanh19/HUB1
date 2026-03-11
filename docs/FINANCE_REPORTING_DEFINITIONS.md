# Finance Reporting Definitions (SSOT)

> **Single Source of Truth** cho logic tính toán 3 màn hình: Dashboard, P&L, Cashflow
> Last updated: 2026-01-03

---

## 📋 BÁO CÁO CẬP NHẬT – Finance Reporting Consistency

### 1. ROOT CAUSE CHÍNH

**Vấn đề:** Dashboard hiểu "Tháng này" là **Full Month** (01/01 → 31/01), trong khi P&L và Cashflow hiểu là **MTD** (01/01 → hôm nay).

| Trang | Trước fix | Sau fix |
|-------|-----------|---------|
| Dashboard | 01/01 → 31/01 (Full Month) | 01/01 → 03/01 (MTD) ✅ |
| P&L | 01/01 → 03/01 (MTD) | Giữ nguyên ✅ |
| Cashflow | 01/01 → 03/01 (MTD) | Giữ nguyên ✅ |

→ Kết quả: Cùng preset "Tháng này" → Cùng date range → Cùng số liệu.

---

### 2. CÁC FIX ĐÃ THỰC HIỆN

| File | Thay đổi | Chi tiết |
|------|----------|----------|
| **Dashboard.tsx** | `month` → MTD | Đổi `endOfMonth(now)` thành `endOfDay(now)` |
| **Dashboard.tsx** | Debug Panel | Thêm `FinanceDebugPanel` cho Finance/Admin |
| **Dashboard.tsx** | Tooltip | Thêm tooltip giải thích Cash vs P&L |
| **ReportsPnlPage.tsx** | Timezone fix | `toISOString().split("T")[0]` → `format(date, "yyyy-MM-dd")` |
| **ReportsPnlPage.tsx** | Room Revenue query | Đổi từ `unified_bookings` → `unified_bookings_with_final_amount`, dùng `final_amount` |
| **Dashboard.tsx** | Room Revenue query | Tương tự, dùng `final_amount` thay `total_amount_net` |
| **BookingSetCompare.tsx** | Test date | Cập nhật từ 2025 → 2026 |
| **FinanceDebugPanel.tsx** | NEW | Debug tool hiện raw counts + sample rows |
| **financeUICopy.ts** | NEW | UI copy definitions tiếng Việt |
| **FINANCE_REPORTING_DEFINITIONS.md** | Checklist | Thêm acceptance test cases |
| **20260103_unified_bookings_final_amount.sql** | NEW | View SSOT cho P&L với final_amount |

---

### 2.1 BẢNG ĐIỀU KIỆN ĐỂ CÓ SỐ (Conditions Table)

| Card | Table | Amount Field | Date Filter | Status Filter |
|------|-------|--------------|-------------|---------------|
| **Room Revenue (P&L)** | `unified_bookings_with_final_amount` | `final_amount` | check_out_date trong kỳ | CONFIRMED + (CHECKED_OUT OR quá ngày) |
| **Cash In** | hotel_collects | amount_collected | collected_at trong kỳ | payee_type=ROOMRISE, collection_type=COLLECT, status!=VOIDED |
| **Cash Out** | cash_outs | amount | paid_at trong kỳ | Không có |
| **Committed (Forecast)** | ota_payouts | total_amount | payout_date trong 30 ngày tới | status=PARTIAL |
| **Likely (Forecast)** | ota_payouts | total_amount | payout_date trong 30 ngày tới | status=PENDING |
| **Expected In (OTA AR)** | bookings_mirror + stays | total_amount_net | Không có (tất cả) | OTA_COLLECT, CHECKED_OUT, chưa có payout |
| **Expected Out (Host AP)** | host_settlements | remaining_amount | Không có (tất cả) | remaining_amount > 0 |

### 2.2 VIEW unified_bookings_with_final_amount (SSOT cho P&L)

```sql
-- Logic tính final_amount (CHÍNH XÁC theo computeBookingAmount())
CASE
  WHEN booking_status IN ('CANCELLED','NO_SHOW') → 0 (kể cả có override)
  WHEN override_amount IS NOT NULL → override_amount (kể cả IMPORTED đã confirm)
  WHEN booking_type = 'IMPORTED' (chưa có override) → 0
  ELSE total_amount_net
END AS final_amount
```

**Ý nghĩa:**
- `final_amount`: Giá cuối cùng để tính P&L (đã apply logic Booking Center)
- `amount_source`: Debug field cho biết nguồn gốc giá:
  - `CANCELLED`: Booking bị hủy → 0
  - `IMPORT_CONFIRMED`: Booking IMPORTED đã có override → override_amount
  - `OVERRIDE`: Booking thường có override → override_amount
  - `UNCONFIRMED`: Booking IMPORTED chưa confirm → 0
  - `OTA`: Booking thường không override → total_amount_net

**Lưu ý quan trọng:**
- Forecast 30 ngày **KHÔNG** phụ thuộc kỳ đang xem (today, month, etc.)
- OTA AR cũng **KHÔNG** phụ thuộc kỳ - tính tất cả công nợ chưa thu
- **Host AP cũng KHÔNG phụ thuộc kỳ** - tính tổng nợ host hiện tại (as-of today)
- Chỉ Cash In/Out và P&L mới phụ thuộc kỳ đang xem

---

### 3. GIẢI THÍCH CHO NGƯỜI KHÔNG KỸ THUẬT

#### P&L (Báo cáo Lãi/Lỗ) – Accrual Basis
- **Tính theo ngày check-out**: Booking được ghi nhận doanh thu khi khách trả phòng
- **Ví dụ**: Khách đặt 01/01, ở 02/01–05/01 → Doanh thu ghi nhận vào ngày 05/01
- **Ý nghĩa**: Phản ánh giá trị kinh doanh thực sự đã hoàn thành

#### Cashflow (Báo cáo Dòng tiền) – Cash Basis  
- **Tính theo ngày thu/chi tiền thực tế**: Ghi nhận khi tiền vào/ra tài khoản
- **Ví dụ**: Khách thanh toán 01/01 cho booking 05/01 → Tiền ghi nhận ngày 01/01
- **Ý nghĩa**: Phản ánh tiền mặt thực có trong tay

#### Tại sao 2 số này khác nhau?
- **Lợi nhuận > Dòng tiền**: Có công nợ chưa thu (AR)
- **Lợi nhuận < Dòng tiền**: Khách trả trước hoặc đã thu nhưng chưa checkout

---

### 4. CHECKLIST TEST (5 BƯỚC)

| # | Bước | Kết quả mong đợi |
|---|------|------------------|
| 1 | Mở Dashboard, chọn "Tháng này" | Hiện "Kỳ: Tháng này \| 01/01 → 03/01/2026" |
| 2 | Mở P&L (tab mới), chọn "Tháng này" | Date range = 01/01 → 03/01/2026 |
| 3 | So sánh Dashboard[Lợi nhuận] với P&L[Net Profit] | **KHỚP** |
| 4 | Mở Cashflow, chọn "Tháng này" | Date range = 01/01 → 03/01/2026 |
| 5 | So sánh Dashboard[Thu/Chi] với Cashflow totals | **KHỚP** |

---

### 5. VỀ BOOKING CENTER

**Lưu ý quan trọng:** Booking Center có thể vẫn lệch số với P&L vì:

| Khác biệt | Booking Center | P&L |
|-----------|----------------|-----|
| Date field mặc định | Ngày đặt (booking_date) | Ngày checkout |
| Status filter | Tất cả (mặc định) | Chỉ CONFIRMED |
| Stay status | Không filter | Chỉ CHECKED_OUT hoặc quá hạn |

**Cách giải quyết:**
1. **Filter thủ công**: Trong Booking Center, chọn "Ngày check-out" + filter "Đã xác nhận"
2. **Dùng debug tool**: Truy cập `/debug/booking-set-compare` để xem chi tiết lệch
3. **Chấp nhận gap**: Gap = bookings CONFIRMED nhưng chưa checkout → sẽ khớp khi khách trả phòng

---

*Báo cáo này là tài liệu chính thức. Mọi thay đổi code phải cập nhật tài liệu này trước.*

---

## 1. DEFINITIONS TABLE

### 1.1 P&L Metrics

| Metric | Source Table | Amount Field | Date Field | Date Filter Logic | Status Filter | Notes |
|--------|--------------|--------------|------------|-------------------|---------------|-------|
| **Room Revenue** | `unified_bookings_with_final_amount` | `final_amount` | `check_out_date` | `check_out_date BETWEEN start AND end` | `booking_status = 'CONFIRMED'` AND (`stay_status = 'CHECKED_OUT'` OR `check_out_date <= today`) | SSOT từ Booking Center |
| **Service Revenue** | `service_orders` | `sale_price` | `service_date_time` | `service_date_time BETWEEN start AND end` | `status = 'DONE'` | — |
| **Host Cost (COGS)** | `host_supply_segments` JOIN `unified_bookings` | `total_amount` | `unified_bookings.check_out_date` | Same as Room Revenue | Same as Room Revenue | — |
| **Service Cost (COGS)** | `service_orders` | `cost_price` | `service_date_time` | Same as Service Revenue | `status = 'DONE'` | — |
| **OPEX** | `payment_requests` | `proposed_amount` | `expense_period` (parse) OR `created_at` (fallback) | expense_period month/year trong kỳ | `status = 'PAID'` AND `expense_category IS NOT NULL` | Complex parsing |

**⚠️ QUAN TRỌNG: Room Revenue dùng `final_amount` từ view `unified_bookings_with_final_amount`**

View này đã apply logic `computeBookingAmount()` từ Booking Center:
- CANCELLED/NO_SHOW → 0
- Override amount → dùng override
- IMPORTED chưa confirm → 0
- Otherwise → total_amount_net

**Formulas:**
```
Total Revenue = Room Revenue + Service Revenue
Total COGS = Host Cost + Service Cost
Gross Profit = Total Revenue - Total COGS
Net Profit = Gross Profit - OPEX
```

### 1.2 Cashflow Metrics

| Metric | Source Table | Amount Field | Date Field | Date Filter Logic | Status Filter | Notes |
|--------|--------------|--------------|------------|-------------------|---------------|-------|
| **Cash In** | `hotel_collects` | `amount_collected` | `collected_at` | `collected_at BETWEEN start AND end` | `payee_type = 'ROOMRISE'` AND `collection_type = 'COLLECT'` AND `status != 'VOIDED'` | Cash basis |
| **Cash Out** | `cash_outs` | `amount` | `paid_at` | `paid_at BETWEEN start AND end` | None | — |

**Formulas:**
```
Net Cashflow = Cash In - Cash Out
```

### 1.3 Dashboard Cards

| Card | Metric Used | Source | Date Filter | Notes |
|------|-------------|--------|-------------|-------|
| **Thu (Cash In)** | Cashflow | `hotel_collects` | `dateRange.from` to `dateRange.to` (Date objects → toISOString) | Same logic as Cashflow |
| **Chi (Cash Out)** | Cashflow | `cash_outs` | Same | Same logic as Cashflow |
| **Net** | Cashflow | Calculated | Same | Cash In - Cash Out |
| **Lợi nhuận (P&L)** | P&L Net Profit | Multiple | `pnlDateRange.start/end` (formatted yyyy-MM-dd) | Same logic as P&L |
| **Dòng tiền (Cash)** | Cashflow Net | Calculated | Same as Cash In/Out | — |
| **Chênh lệch (Gap)** | Calculated | — | — | P&L Net Profit - Net Cashflow |

---

## 2. DATE RANGE LOGIC COMPARISON

### 2.1 Dashboard (Dashboard.tsx)

```typescript
// Line 105: period state
const [period, setPeriod] = useState<PeriodFilter>("today");

// Line 130-143: dateRange calculation
const dateRange = useMemo(() => {
  const now = new Date();
  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };  // Date objects
    case "7days":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30days":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };  // Full month
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}, [period]);

// Line 325-327: pnlDateRange conversion
const pnlDateRange = useMemo(() => ({
  start: format(dateRange.from, "yyyy-MM-dd"),  // Local timezone
  end: format(dateRange.to, "yyyy-MM-dd"),
}), [dateRange]);
```

**⚠️ Issue #1:** Cash queries use `toISOString()` (UTC) but P&L uses `format()` (local timezone).

### 2.2 P&L Page (ReportsPnlPage.tsx)

```typescript
// Line 45-67: dateRange calculation
const dateRange = useMemo(() => {
  const now = new Date();
  let startDate: Date;
  // ... switch cases ...
  return {
    start: startDate.toISOString().split("T")[0],  // ⚠️ UTC timezone
    end: now.toISOString().split("T")[0],           // ⚠️ UTC timezone
  };
}, [period]);
```

**⚠️ Issue #2:** Using `toISOString().split("T")[0]` can cause off-by-one day errors near midnight.

### 2.3 Cashflow Page (ReportsCashflowPage.tsx)

```typescript
// Line 58-81: Same pattern as P&L
const dateRange = useMemo(() => {
  // ... same logic ...
  return {
    start: startDate.toISOString().split("T")[0],  // ⚠️ UTC timezone
    end: now.toISOString().split("T")[0],           // ⚠️ UTC timezone
  };
}, [period]);
```

---

## 3. MISMATCH ANALYSIS

### 3.1 Timezone Issues

| File | Location | Current Code | Issue |
|------|----------|--------------|-------|
| ReportsPnlPage.tsx | Line 65-66 | `toISOString().split("T")[0]` | UTC, can be wrong at midnight |
| ReportsCashflowPage.tsx | Line 79-80 | `toISOString().split("T")[0]` | Same |
| Dashboard.tsx | Line 291-292 | `dateRange.from.toISOString()` | Cash uses UTC |
| Dashboard.tsx | Line 326 | `format(dateRange.from, "yyyy-MM-dd")` | P&L uses local |

**Root Cause:** Mixed timezone handling causes Cash and P&L to potentially use different dates.

### 3.2 Date Range Boundary Issues

| Scenario | Dashboard | P&L Page | Cashflow Page | Match? |
|----------|-----------|----------|---------------|--------|
| "month" (Jan 2026) | Jan 1 00:00 → Jan 31 23:59 (local) | Jan 1 → Jan 3 (UTC) | Jan 1 → Jan 3 (UTC) | ❌ Different end date |
| "today" at 23:30 GMT+7 | Jan 3 00:00 → Jan 3 23:59 (local) | Jan 3 (UTC = Jan 3 16:30) | Same | ⚠️ Potential edge case |

### 3.3 Field Differences

| Report | Room Revenue Field | Note |
|--------|-------------------|------|
| Dashboard P&L | `unified_bookings.total_amount_net` | ✅ Correct |
| P&L Page | `unified_bookings.total_amount_net` | ✅ Correct |

---

## 4. REQUIRED FIXES

### Fix #1: Standardize Timezone (All Pages)

**Before:**
```typescript
start: startDate.toISOString().split("T")[0]
```

**After:**
```typescript
import { format } from "date-fns";
start: format(startDate, "yyyy-MM-dd")  // Local timezone
```

### Fix #2: Dashboard Range Display

Add explicit range display in UI:
```
Kỳ: {periodLabel} | {format(dateRange.from, "dd/MM/yyyy")} → {format(dateRange.to, "dd/MM/yyyy")}
```

### Fix #3: Sync Presets Between Pages

| Preset | Dashboard | P&L | Cashflow | Standard |
|--------|-----------|-----|----------|----------|
| today | ✅ | ✅ | ✅ | — |
| 7days/week | 7days | week | week | → "7 ngày qua" |
| 30days | ✅ | ❌ | ❌ | → Add to P&L/Cashflow |
| month | ✅ | ✅ | ✅ | "Tháng này" |
| quarter | ❌ | ✅ | ✅ | → Add to Dashboard |
| year | ❌ | ✅ | ✅ | → Add to Dashboard |

---

## 5. PARITY RULES

### Rule 1: Same Period = Same Numbers

```
Dashboard[Cash In] @ period=today 
  === ReportsCashflowPage[Total Cash In] @ period=today
```

### Rule 2: Same Filters = Same Bookings

```
Dashboard[P&L Room Revenue] booking_ids 
  === ReportsPnlPage[Room Revenue] booking_ids
  (given same dateRange)
```

### Rule 3: Explicit Range Always

- Dashboard MUST show: `"Kỳ: Hôm nay | 03/01/2026"`
- P&L MUST show: `"Đang tính theo: Check-out date | 01/01 → 03/01/2026"`
- Cashflow MUST show: `"Đang tính theo: collected_at/paid_at | 01/01 → 03/01/2026"`

### Rule 4: Forecast Uses Different Window

- Committed/Likely: `payout_date` BETWEEN today AND today+30
- Expected In: All outstanding AR (**no date filter**)
- Expected Out: All outstanding AP (**no date filter**)

---

## 6. BOOKING CENTER vs P&L MISMATCH ANALYSIS

### 6.1 Root Cause Table

| Tiêu chí | Booking Center | P&L Page | Mismatch? |
|----------|----------------|----------|-----------|
| **Date Field Default** | `booking_date` | `check_out_date` | ❌ YES |
| **Date Field Selectable** | check_in / check_out / booking_date | check_out only | ✅ BC can match |
| **Status Filter** | Client-side filter (all by default) | `booking_status = 'CONFIRMED'` | ❌ YES |
| **Stay Status Filter** | None | `stay_status = 'CHECKED_OUT' OR check_out_date <= today` | ❌ YES |
| **Amount Field** | `computeBookingAmount()` (respects overrides, cancellations) | `total_amount_net` direct | ⚠️ Slight difference |
| **Sample Data** | Toggle `includeSampleData` | No filter | ⚠️ Only affects MANUAL bookings |

### 6.2 Why Numbers Don't Match

1. **Booking Center default là `booking_date`**, P&L luôn dùng `check_out_date`
   - Fix: User phải chọn "Ngày check-out" trong Booking Center để match

2. **Booking Center hiện TẤT CẢ status** (CONFIRMED, CANCELLED, PENDING), P&L chỉ lấy CONFIRMED
   - Fix: User phải filter status = CONFIRMED

3. **P&L chỉ tính booking đã CHECKED_OUT** hoặc quá ngày checkout
   - Không có cách filter này trong Booking Center

4. **Amount calculation khác nhau**
   - Booking Center: `computeBookingAmount()` - có thể override, CANCELLED = 0
   - P&L: `total_amount_net` trực tiếp

### 6.3 Debug Tool: Booking Set Compare

URL: `/debug/booking-set-compare`

Component: `src/components/test-runner/BookingSetCompare.tsx`

Features:
- So sánh booking_id sets giữa 2 queries (P&L logic vs BC logic)
- Hiện breakdown: chỉ trong P&L / chỉ trong BC / chung
- Phân loại lý do không có trong P&L: CANCELLED / PENDING / chưa checkout
- Test với date range 01/01 - 03/01

### 6.4 Acceptance Test

Để P&L và Booking Center khớp số:
1. Chọn cùng date range
2. Booking Center filter: `dateFilterType = check_out`
3. Booking Center filter: `statusFilter = CONFIRMED`
4. Booking Center KHÔNG có cách filter `stay_status` → số sẽ cao hơn P&L nếu có booking chưa checkout

**Expected Gap**: Booking Center Total > P&L Room Revenue
- Gap = Bookings CONFIRMED nhưng chưa CHECKED_OUT và check_out_date > today

---

## 7. IMPLEMENTATION CHECKLIST

- [x] Fix timezone in ReportsPnlPage.tsx (Line 65-66) ✅ DONE
- [x] Fix timezone in ReportsCashflowPage.tsx (Line 79-80) ✅ DONE
- [x] Fix timezone in Dashboard.tsx Cash queries (Line 291-292, 308-309) ✅ DONE
- [x] **Fix "month" period mismatch** ✅ DONE - Dashboard now uses MTD (not Full Month)
- [x] Fix timezone in ReportsPnlPage.tsx hostCost query (Line 128) ✅ DONE
- [x] Add date range display in Dashboard header ✅ DONE
- [x] Add date basis label in P&L page ✅ DONE
- [x] Add date basis label in Cashflow page ✅ DONE
- [x] Create Booking Set Compare debug tool ✅ DONE (URL: /debug/booking-set-compare)
- [ ] Sync period presets across all 3 pages (TODO: add 30days to P&L/Cashflow)
- [ ] Add stay_status filter to Booking Center (optional enhancement)

---

## 8. ACCEPTANCE TEST CHECKLIST

### Test Case 1: "Tháng này" (MTD) - All 3 Pages Match

**Setup:**
1. Mở Dashboard, chọn "Tháng này"
2. Mở ReportsPnlPage trong tab mới, chọn "Tháng này"
3. Mở ReportsCashflowPage trong tab mới, chọn "Tháng này"

**Expected Results:**
| Metric | Dashboard | P&L Page | Cashflow Page | Match? |
|--------|-----------|----------|---------------|--------|
| Date Range | 01/01 → 03/01/2026 | 01/01 → 03/01/2026 | 01/01 → 03/01/2026 | ✅ |
| Cash In | X VND | — | X VND | ✅ |
| Cash Out | Y VND | — | Y VND | ✅ |
| Room Revenue | Z VND | Z VND | — | ✅ |
| Net Profit | N VND | N VND | — | ✅ |

### Test Case 2: "Hôm nay" - Cash Match

**Setup:**
1. Dashboard: Chọn "Hôm nay"
2. Cashflow: Chọn "Hôm nay"

**Expected:** Dashboard[Cash In] === Cashflow[Total Cash In]

### Test Case 3: Custom Range (01/01/2026 - 03/01/2026)

**Using Debug Tool:**
1. Navigate to `/debug/booking-set-compare`
2. Select "Test: 01/01 - 03/01"
3. Select "Check-out (P&L mặc định)"
4. Click "Làm mới"

**Expected Results:**
- P&L Set count <= BC Set count
- Any gap explained by: CANCELLED, PENDING, or not CHECKED_OUT

### Test Case 4: Basis Label Visibility

| Page | Expected Label |
|------|----------------|
| Dashboard | "Kỳ: Tháng này \| 01/01 → 03/01/2026" |
| P&L | "Kỳ: Tháng này \| 01/01/2026 → 03/01/2026 \| Đang tính theo: Check-out date" |
| Cashflow | "Kỳ: Tháng này \| 01/01/2026 → 03/01/2026 \| Đang tính theo: collected_at / paid_at" |

### Test Case 5: Timezone Edge Case (Optional)

**Test at 23:30 local time:**
1. Create a booking with check_out_date = today
2. Check if booking appears in P&L for "Hôm nay"
3. Should appear (local timezone, not UTC)

---

## Appendix: SQL Verification Queries

### A. Room Revenue Booking Set (P&L) - DÙNG VIEW MỚI

```sql
-- Get booking_ids contributing to Room Revenue for period
-- SSOT: Dùng unified_bookings_with_final_amount với final_amount
SELECT 
  unified_booking_id,
  final_amount,      -- ĐÃ APPLY LOGIC: Override > Cancelled=0 > OTA
  amount_source,     -- DEBUG: 'CANCELLED' | 'OVERRIDE' | 'UNCONFIRMED' | 'OTA'
  check_out_date,
  stay_status,
  booking_status
FROM unified_bookings_with_final_amount
WHERE check_out_date BETWEEN '2026-01-01' AND '2026-01-03'
  AND booking_status = 'CONFIRMED'
  AND (stay_status = 'CHECKED_OUT' OR check_out_date <= CURRENT_DATE);
```

### B. Cash In Transaction Set (Cashflow)

```sql
-- Get transactions contributing to Cash In for period
SELECT 
  id,
  amount_collected,
  collected_at,
  unified_booking_id,
  payee_type,
  status
FROM hotel_collects
WHERE collected_at BETWEEN '2026-01-01T00:00:00' AND '2026-01-03T23:59:59'
  AND payee_type = 'ROOMRISE'
  AND collection_type = 'COLLECT'
  AND status != 'VOIDED';
```

### C. Compare Sets

```sql
-- Bookings in P&L but not in Cashflow (expected: P&L includes AR)
SELECT ub.unified_booking_id
FROM unified_bookings ub
LEFT JOIN hotel_collects hc ON ub.unified_booking_id = hc.unified_booking_id
WHERE ub.check_out_date BETWEEN '2026-01-01' AND '2026-01-03'
  AND hc.id IS NULL;
```

---

## 9. DATA CONSISTENCY MATRIX (An Gia Filter)

### 9.1 Filter Consistency Across Pages

| Page | Hook | Source | An Gia Filter | Notes |
|------|------|--------|---------------|-------|
| **BookingsPage** | `useBookings()` | `unified_bookings` | ✅ Filter by `channex_property_groups` | Double-check at query time |
| **Dashboard** | direct query | `unified_bookings_with_final_amount` | ✅ Filter by An Gia Residences | Redundant but safe |
| **P&L** | direct query | `unified_bookings_with_final_amount` | ✅ Relies on source | `bookings_mirror` pre-filtered |
| **Cashflow** | direct query | `hotel_collects` + `cash_outs` | ✅ Entry-point controlled | See 9.3 |
| **Collection Reports** | direct query | `hotel_collects` | ✅ Entry-point controlled | See 9.3 |
| **OTA Payouts** | `useOtaPayouts()` | `ota_payouts` | ⚠️ No filter (by design) | See 9.2 |
| **OTA Eligible** | `useEligibleBookingsForPayout()` | `unified_bookings` + `bookings_mirror` | ✅ Filter by `channex_property_groups` | Fixed 2026-01-04 |
| **Messages** | `useConversations()` | `conversations` | ✅ Filter by `channex_property_groups` | Same pattern as Bookings |

### 9.2 OTA Payouts - Why No An Gia Filter?

`ota_payouts` table không cần filter An Gia vì:

1. **Aggregated Records**: Mỗi payout là báo cáo tổng hợp từ OTA (Booking.com, Agoda...)
2. **Manual Entry**: Operator nhập tay → chỉ nhập cho An Gia
3. **Controlled Details**: `ota_payout_details` link đến `unified_booking_id`
4. **Eligible Filter**: `useEligibleBookingsForPayout()` đã filter An Gia → chỉ booking An Gia có thể được add vào payout

**Data Flow:**
```
OTA gửi payment report
    → Operator tạo ota_payouts record
    → Operator chọn bookings từ useEligibleBookingsForPayout (✅ An Gia filter)
    → ota_payout_details được tạo với unified_booking_id (An Gia only)
```

### 9.3 Cashflow Tables - Why No An Gia Filter?

`hotel_collects` và `cash_outs` tables không query với An Gia filter vì **data integrity được kiểm soát tại entry point**:

#### hotel_collects (Cash In)

| Entry Point | Filter Status | Notes |
|-------------|---------------|-------|
| **BookingDetail UI** | ✅ An Gia | User chỉ thấy An Gia bookings → chỉ tạo collection cho An Gia |
| **Sample Data Scripts** | ⚠️ Có flag | `is_sample_data=true` có thể exclude |
| **API/Manual Insert** | ⚠️ No filter | Nhưng cần `unified_booking_id` hợp lệ |

**Data Flow:**
```
User mở BookingsPage (✅ An Gia filter)
    → User click booking detail (An Gia booking)
    → User tạo collection (useCreateHotelCollect)
    → hotel_collects record được tạo với unified_booking_id (An Gia)
```

#### cash_outs (Cash Out)

| Entry Point | Filter Status | Notes |
|-------------|---------------|-------|
| **Payment Request UI** | ✅ Operator-controlled | Only authorized users |
| **Host Settlement UI** | ✅ Linked to booking | host_settlements link đến unified_booking_id |

**Lý do không thêm filter:**
1. **Performance**: Không cần JOIN thêm table
2. **Data integrity**: Đã kiểm soát ở entry point
3. **Simplicity**: Ít code phức tạp hơn
4. **RLS enabled**: Row Level Security đã active

### 9.4 An Gia Group ID

```typescript
// Sử dụng nhất quán trong tất cả hooks
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";
```

| File | Constant Defined | Notes |
|------|------------------|-------|
| `useBookings.ts` | ✅ Line 67 | Original |
| `useConversations.ts` | ✅ | Same pattern |
| `useOtaPayouts.ts` | ✅ Line 6 | Added 2026-01-04 |
| `ChannexIntegrationPage.tsx` | ✅ Hardcoded | Sync trigger |
| `sync-channex-bookings/index.ts` | ✅ Parameter | Edge function |

### 9.5 Verification Queries (Debug)

```sql
-- Kiểm tra hotel_collects có booking ngoài An Gia không
SELECT hc.id, hc.unified_booking_id, bm.channex_property_id
FROM hotel_collects hc
LEFT JOIN bookings_mirror bm ON hc.unified_booking_id = bm.unified_booking_id
LEFT JOIN channex_property_groups cpg ON bm.channex_property_id = cpg.channex_property_id
WHERE cpg.channex_group_id IS NULL 
   OR cpg.channex_group_id != '72e58e1b-1e34-4678-9100-71c778ecf6d0';
-- Expected: 0 rows (hoặc chỉ sample data)

-- Kiểm tra ota_payout_details có booking ngoài An Gia không
SELECT opd.id, opd.unified_booking_id, bm.channex_property_id
FROM ota_payout_details opd
LEFT JOIN bookings_mirror bm ON opd.unified_booking_id = bm.unified_booking_id
LEFT JOIN channex_property_groups cpg ON bm.channex_property_id = cpg.channex_property_id
WHERE cpg.channex_group_id IS NULL 
   OR cpg.channex_group_id != '72e58e1b-1e34-4678-9100-71c778ecf6d0';
-- Expected: 0 rows
```

### 9.6 Related Hooks - Entry-Point Controlled

Các hooks sau query `unified_bookings` nhưng không cần An Gia filter vì data đã được kiểm soát tại entry point:

| Hook | Query Pattern | Why Safe |
|------|---------------|----------|
| `useHostPayablesEnhanced` | Query by `unified_booking_id` từ `host_supply_segments` | Segments tạo từ BookingDetail UI (An Gia) |
| `useHostSettlement` | Query by `unified_booking_id` từ `host_settlements` | Settlements tạo từ Host Payables page |
| `useServiceOrders` | Query by `unified_booking_id` từ `service_orders` | Orders tạo từ ServiceOrdersPage với booking An Gia |
| `useCollections` | Query by `unified_booking_id` | Collections tạo từ BookingDetail UI |
| `useSettlementFullDetail` | Query by settlement context | Settlement đã link đến An Gia booking |

**Pattern:** "Query by ID that was already filtered" - không cần filter lại.

---

*This document is the authoritative reference for finance reporting logic. Any code changes must update this document first.*


