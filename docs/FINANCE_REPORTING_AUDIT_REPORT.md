# BÁO CÁO AUDIT HỆ THỐNG BÁO CÁO TÀI CHÍNH
## Roomrise Control Hub - Financial Reporting Systems Audit

**Phiên bản:** 1.0  
**Ngày:** 2026-01-03  
**Auditor:** Principal Finance Systems Architect

---

## EXECUTIVE SUMMARY (10 Dòng)

| Trang | Trạng thái | Ghi chú |
|-------|-----------|---------|
| P&L (`/reports/pnl`) | ✅ PASS | Accrual-based đúng logic, tách COGS vs OPEX rõ ràng |
| Cashflow (`/reports/cashflow`) | ✅ PASS | Cash-basis chính xác, chỉ từ hotel_collects + cash_outs |
| Host AP Aging (`/host-payables/aging`) | ✅ PASS | Aging buckets chuẩn, computed từ cashflow_entries |
| Dashboard (`/`) | ⚠️ PARTIAL | KPIs tốt nhưng thiếu Profit vs Cash gap rõ ràng |

**3 RỦI RO LỚN NHẤT:**
1. **HIGH** - Dashboard thiếu metric "Profit vs Cash Gap" để phân biệt rõ P&L vs Cashflow
2. **MEDIUM** - Chưa có CEO-dedicated dashboard với drilldown control (hiện Dashboard chung cho all roles)
3. **MEDIUM** - OTA AR aging chưa có trang riêng (embedded trong Dashboard + OtaPayoutsPage)

**3 VIỆC ƯU TIÊN LÀM NGAY:**
1. Thêm "Profit vs Cash Gap" card vào Dashboard (minimal change)
2. Implement aging buckets cho OTA receivables trong Dashboard
3. Thêm 30-day forecast block đơn giản vào Dashboard

---

## A. INVENTORY & ENTRY POINTS

### A1. Các trang báo cáo tài chính

| Trang | File Path | Component | Mục đích |
|-------|-----------|-----------|----------|
| P&L Report | [src/pages/ReportsPnlPage.tsx](src/pages/ReportsPnlPage.tsx) | `ReportsPnlPage` | Báo cáo Lãi/Lỗ theo kỳ (accrual) |
| Cashflow Report | [src/pages/ReportsCashflowPage.tsx](src/pages/ReportsCashflowPage.tsx) | `ReportsCashflowPage` | Dòng tiền thực (cash-basis) |
| Dashboard | [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) | `Dashboard` | Overview cho tất cả roles |
| Host AP Aging | [src/pages/HostPayablesAgingPage.tsx](src/pages/HostPayablesAgingPage.tsx) | `HostPayablesAgingPage` | Báo cáo tuổi nợ Host |
| OTA Payout | [src/pages/OtaPayoutsPage.tsx](src/pages/OtaPayoutsPage.tsx) | `OtaPayoutsPage` | Quản lý OTA receivables |
| Ledger Entries | [src/pages/LedgerEntriesPage.tsx](src/pages/LedgerEntriesPage.tsx) | `LedgerEntriesPage` | Sổ cái (source of truth) |
| Accounting Periods | [src/pages/AccountingPeriodsPage.tsx](src/pages/AccountingPeriodsPage.tsx) | `AccountingPeriodsPage` | Khóa kỳ kế toán |

### A2. Service/Query Files Liên Quan

| Query Type | Table/View | Files sử dụng |
|------------|------------|---------------|
| Revenue (Room) | `unified_bookings` | ReportsPnlPage.tsx L68-87 |
| Revenue (Service) | `service_orders` | ReportsPnlPage.tsx L89-103 |
| Host Cost | `host_supply_segments` → `unified_bookings` | ReportsPnlPage.tsx L105-126 |
| Service Cost | `service_orders` | ReportsPnlPage.tsx L128-142 |
| OPEX | `payment_requests` (expense_category) | ReportsPnlPage.tsx L144-198 |
| Cash In | `hotel_collects` | ReportsCashflowPage.tsx L94-109, Dashboard.tsx L265-282 |
| Cash Out | `cash_outs` | ReportsCashflowPage.tsx L111-142, Dashboard.tsx L284-300 |
| Host AP | `host_settlements` → `cashflow_entries` | HostPayablesAgingPage.tsx L146-190 |
| OTA AR | `bookings_mirror` + `ota_payout_details` | Dashboard.tsx L307-370 |
| Ledger | `ledger_entries` | LedgerEntriesPage.tsx L147-168 |

### A3. Bảng/View chính

| Table/View | Vai trò | Source of Truth cho |
|------------|---------|---------------------|
| `unified_bookings` | View tổng hợp booking | Doanh thu phòng |
| `bookings_mirror` | Snapshot từ Channex | Dữ liệu OTA gốc |
| `host_supply_segments` | Chi tiết gán phòng/host | Giá vốn phòng (COGS) |
| `service_orders` | Đơn dịch vụ | Doanh thu + giá vốn dịch vụ |
| `hotel_collects` | Thu tiền | Cashflow IN |
| `cash_outs` | Chi tiền | Cashflow OUT |
| `host_settlements` | Quyết toán Host | Host AP liability |
| `cashflow_entries` | Legacy cashflow entries | Backward compat |
| `ledger_entries` | **NEW** Bút toán kế toán | ✅ **Single Source of Truth** |
| `accounting_periods` | Kỳ kế toán | Period lock control |

---

## B. LOGIC MAP (TRUTH TABLE)

### B1. Revenue Metrics

| Metric | Định nghĩa | Source Table/View | Code Reference | Filter/Window | Risk |
|--------|-----------|-------------------|----------------|---------------|------|
| **Room Revenue** | Tổng doanh thu phòng đã checkout trong kỳ | `unified_bookings` | [ReportsPnlPage.tsx#L68-87](src/pages/ReportsPnlPage.tsx#L68-87) | `check_out_date ∈ [start, end]` + `(stay_status = CHECKED_OUT OR check_out_date <= today)` | LOW - Logic đúng |
| **Service Revenue** | Tổng doanh thu dịch vụ DONE trong kỳ | `service_orders` | [ReportsPnlPage.tsx#L89-103](src/pages/ReportsPnlPage.tsx#L89-103) | `service_date_time ∈ [start, end]` + `status = DONE` | LOW |
| **Total Revenue** | Room + Service | Computed | [ReportsPnlPage.tsx#L259](src/pages/ReportsPnlPage.tsx#L259) | Sum | LOW |

### B2. Cost Metrics

| Metric | Định nghĩa | Source Table/View | Code Reference | Filter/Window | Risk |
|--------|-----------|-------------------|----------------|---------------|------|
| **Host Cost (COGS)** | Giá vốn phòng trả Host | `host_supply_segments` → `unified_bookings` | [ReportsPnlPage.tsx#L105-126](src/pages/ReportsPnlPage.tsx#L105-126) | JOIN với booking có checkout trong kỳ | LOW |
| **Service Cost (COGS)** | Giá vốn dịch vụ | `service_orders.cost_price` | [ReportsPnlPage.tsx#L128-142](src/pages/ReportsPnlPage.tsx#L128-142) | Same as service revenue | LOW |
| **OPEX** | Chi phí hoạt động (lương, BHXH, marketing...) | `payment_requests` | [ReportsPnlPage.tsx#L144-198](src/pages/ReportsPnlPage.tsx#L144-198) | `expense_category != NULL` + `status = PAID` | LOW |
| **Gross Profit** | Revenue - COGS | Computed | [ReportsPnlPage.tsx#L262](src/pages/ReportsPnlPage.tsx#L262) | | LOW |
| **Net Profit** | Gross Profit - OPEX | Computed | [ReportsPnlPage.tsx#L265](src/pages/ReportsPnlPage.tsx#L265) | | LOW |

### B3. Cashflow Metrics

| Metric | Định nghĩa | Source Table/View | Code Reference | Filter/Window | Risk |
|--------|-----------|-------------------|----------------|---------------|------|
| **Cash In** | Tiền thực thu (Roomrise nhận) | `hotel_collects` | [ReportsCashflowPage.tsx#L94-109](src/pages/ReportsCashflowPage.tsx#L94-109) | `payee_type = ROOMRISE` + `collection_type = COLLECT` + `status != VOIDED` | LOW |
| **Cash Out** | Tiền thực chi | `cash_outs` | [ReportsCashflowPage.tsx#L111-142](src/pages/ReportsCashflowPage.tsx#L111-142) | `paid_at ∈ [start, end]` | LOW |
| **Net Cashflow** | Cash In - Cash Out | Computed | [ReportsCashflowPage.tsx#L149](src/pages/ReportsCashflowPage.tsx#L149) | | LOW |

### B4. AR/AP Metrics

| Metric | Định nghĩa | Source Table/View | Code Reference | Filter/Window | Risk |
|--------|-----------|-------------------|----------------|---------------|------|
| **OTA AR (Chờ payout)** | OTA booking đủ điều kiện payout nhưng chưa tạo | `bookings_mirror` - `ota_payout_details` | [Dashboard.tsx#L307-370](src/pages/Dashboard.tsx#L307-370) | `payment_type = OTA_COLLECT` + checked out + no payout | MEDIUM - Chưa có aging |
| **OTA AR (Chờ nhận)** | Payout đã tạo nhưng chưa RECEIVED | `ota_payouts` | [Dashboard.tsx#L372-394](src/pages/Dashboard.tsx#L372-394) | `status != RECEIVED` | LOW |
| **Host AP Remaining** | Số còn phải trả Host | `host_settlements` → `cashflow_entries` | [HostPayablesAgingPage.tsx#L146-190](src/pages/HostPayablesAgingPage.tsx#L146-190) | COMPUTED: `total_payable - SUM(cashflow_entries)` | LOW |
| **Host AP Aging** | Tuổi nợ từ ngày finalized_at | Computed | [HostPayablesAgingPage.tsx#L230-245](src/pages/HostPayablesAgingPage.tsx#L230-245) | Buckets: 0-7, 8-14, 15-30, >30 | LOW |

### B5. CEO Dashboard Metrics (Gap Analysis)

| Metric | Hiện trạng | Nguồn | Risk Level |
|--------|-----------|-------|------------|
| Bookings count | ✅ Có | `bookings_mirror` | LOW |
| In-house guests | ✅ Có | `stays` + `bookings_mirror` | LOW |
| Cash In/Out/Net | ✅ Có | `hotel_collects` + `cash_outs` | LOW |
| OTA AR summary | ✅ Có | `bookings_mirror` | MEDIUM - Chưa có aging buckets |
| Host AP summary | ✅ Có | `host_settlements` | LOW |
| Service AP summary | ✅ Có | `service_settlements` | LOW |
| **Profit vs Cash Gap** | ❌ THIẾU | Need: Net Profit - Net Cashflow | HIGH |
| **30-day Forecast** | ❌ THIẾU | Need: Expected collections + payables | MEDIUM |
| **Decision Triggers** | ❌ THIẾU | Need: Threshold alerts | MEDIUM |

---

## C. CONSISTENCY & LEAKAGE TESTS

### C1. 8 Lỗi Phổ Biến - Checklist

| # | Test Case | Expected | Actual | Status |
|---|-----------|----------|--------|--------|
| 1 | P&L có cộng payout/cash in không? | KHÔNG | ✅ KHÔNG - P&L dùng `unified_bookings.total_amount_net` (accrual) | ✅ PASS |
| 2 | Cashflow có cộng revenue "chưa thu" không? | KHÔNG | ✅ KHÔNG - Cashflow chỉ dùng `hotel_collects` (actual cash) | ✅ PASS |
| 3 | AR OTA có tính trước check-out không? | KHÔNG | ✅ KHÔNG - Filter `stay_status = CHECKED_OUT` hoặc `actual_check_out_at` | ✅ PASS |
| 4 | UPC "issued" có bị coi như "cash" không? | N/A | N/A - Hệ thống không có UPC module riêng | N/A |
| 5 | Host payment trước có bị ghi vào COGS sớm không? | KHÔNG | ✅ KHÔNG - COGS chỉ tính từ `host_supply_segments` của booking đã checkout | ✅ PASS |
| 6 | Timezone/date boundary có lệch không? | KHÔNG | ⚠️ CHECK - Sử dụng `toISOString().split("T")[0]` cho date comparison | ⚠️ LOW RISK |
| 7 | Double counting booking trong payout + cashflow + revenue? | KHÔNG | ✅ KHÔNG - 3 nguồn độc lập, không overlap | ✅ PASS |
| 8 | Filters/joins có làm mất booking (inner join sai)? | KHÔNG | ✅ KHÔNG - Đa số dùng LEFT JOIN hoặc separate queries | ✅ PASS |

### C2. P&L vs Cashflow Separation Evidence

```
P&L (Accrual):
- Revenue = unified_bookings.total_amount_net WHERE checkout in period
- COGS = host_supply_segments.total_amount WHERE booking checkout in period
- NOT from hotel_collects (cash)

Cashflow (Cash basis):
- Cash In = hotel_collects.amount_collected WHERE payee_type=ROOMRISE
- Cash Out = cash_outs.amount
- NOT from unified_bookings (accrual)

✅ TÁCH BIỆT RÕ RÀNG - KHÔNG CÓ LEAKAGE
```

### C3. Payout không lọt vào Revenue

```typescript
// ReportsPnlPage.tsx - Room Revenue Query
const { data: roomRevenue } = await supabase
  .from("unified_bookings")                    // ← Booking data, NOT payout
  .select("total_amount_net, stay_status, check_out_date")
  .gte("check_out_date", dateRange.start)
  .lte("check_out_date", dateRange.end)
  .eq("booking_status", "CONFIRMED");

// OTA Payout không xuất hiện trong query này
// ✅ PASS - Payout KHÔNG lọt vào Revenue
```

### C4. Host AP Computed Correctly

```typescript
// HostPayablesAgingPage.tsx L176-187
// COMPUTED từ cashflow_entries, không dùng stored total_paid_amount
const { data: cashflows } = await supabase
  .from("cashflow_entries")
  .select("source_id, amount")
  .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
  .eq("direction", "OUT")
  .in("source_id", settlementIds);

// remaining = total_payable - SUM(cashflows)
// ✅ PASS - Single source of truth từ cashflow_entries
```

---

## D. RBAC / PAGE PERMISSION AUDIT

### D1. Role Permission Matrix (Default)

| Role | Dashboard | P&L | Cashflow | Host Aging | OTA Payout | Ledger | Accounting Periods |
|------|-----------|-----|----------|------------|------------|--------|-------------------|
| `super_admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ke_toan` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (không có trong default) |
| `cskh` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `sale` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Source:** [src/hooks/useUserPagePermissions.ts#L135-195](src/hooks/useUserPagePermissions.ts#L135-195)

### D2. CEO-only Check

| Câu hỏi | Kết quả |
|---------|---------|
| Có CEO role riêng không? | ❌ KHÔNG - Hiện chỉ có: admin, ke_toan, cskh, sale, super_admin |
| Dashboard có giới hạn cho CEO không? | ❌ KHÔNG - Dashboard (`/`) accessible cho tất cả authenticated users |
| CEO có bị lọt vào P&L/Cashflow detail? | ⚠️ N/A - Không có CEO role, admin có full access |

### D3. Data Depth Lock (Drilldown Control)

| Trang | Có drilldown không? | Risk |
|-------|---------------------|------|
| Dashboard | ✅ Navigate to `/collections`, `/ota-payouts`, etc. | LOW - Links, không inline data |
| P&L | ✅ Link to Ledger (`/settings/ledger-entries`) | LOW |
| Cashflow | ✅ Link to Ledger | LOW |
| Host Aging | ❌ Không có drilldown to individual transactions | LOW |

### D4. RBAC Findings

| Finding | Severity | Recommendation |
|---------|----------|----------------|
| Không có CEO role riêng | LOW | Có thể tạo role `ceo` với subset của admin nếu cần |
| Dashboard accessible cho tất cả | LOW | Đây là intentional - chỉ KPIs, không detail |
| `ke_toan` thiếu `/settings/accounting-periods` | MEDIUM | Thêm vào default pages cho ke_toan |
| Không có row-level filtering by org | LOW | Hiện tại single-tenant (org_id hardcode) |

---

## E. MISSING GUARDRAILS

### E1. Đã có (✅)

| Guardrail | Implementation | Evidence |
|-----------|----------------|----------|
| **Accounting Period Lock** | ✅ `accounting_periods` table + `is_period_locked()` RPC | [20260103_phase3_finance_hardening.sql#L52-75](supabase/migrations/20260103_phase3_finance_hardening.sql#L52-75) |
| **Ledger as SSOT** | ✅ `ledger_entries` table với idempotency | [20260102_finance_ledger_system.sql#L74-120](supabase/migrations/20260102_finance_ledger_system.sql#L74-120) |
| **Host Aging Buckets** | ✅ 0-7, 8-14, 15-30, >30 days | [HostPayablesAgingPage.tsx#L96-104](src/pages/HostPayablesAgingPage.tsx#L96-104) |
| **Cash separation** | ✅ P&L vs Cashflow tách biệt | Multiple files |
| **Reversal support** | ✅ `reverse_ledger_entry` RPC | [20260103_phase31_refund_void_ledger.sql](supabase/migrations/20260103_phase31_refund_void_ledger.sql) |
| **Reconciliation** | ✅ `ledger_reconciliations` table | [20260103_phase3_finance_hardening.sql](supabase/migrations/20260103_phase3_finance_hardening.sql) |

### E2. Thiếu - Cần bổ sung (Minimal Additions)

| Missing Feature | Priority | Effort | Recommendation |
|-----------------|----------|--------|----------------|
| **OTA AR Aging buckets** | HIGH | Low | Thêm aging calculation vào Dashboard OTA section |
| **Profit vs Cash Gap metric** | HIGH | Low | Thêm card `Net Profit - Net Cashflow` vào Dashboard |
| **30-day Forecast** | MEDIUM | Medium | Simple: `expected OTA payouts + expected host payables` |
| **Decision Triggers (thresholds)** | MEDIUM | Low | Add warning when gap > threshold (e.g., 50M) |
| **Risk Exposure Blocks** | LOW | Medium | Aggregate high-risk items (>30 days aging) |
| **CEO Dashboard separation** | LOW | Medium | Create `/ceo-dashboard` with limited drilldown |

---

## F. EVIDENCE TABLE

| Metric | Definition | Source table/view | Code reference | Risk | Fix Required |
|--------|------------|-------------------|----------------|------|--------------|
| Room Revenue | Sum of booking net amount for checkouts in period | `unified_bookings` | ReportsPnlPage.tsx:68-87 | LOW | None |
| Service Revenue | Sum of service sale_price for DONE orders | `service_orders` | ReportsPnlPage.tsx:89-103 | LOW | None |
| Host COGS | Sum of host_supply_segments for checkout bookings | `host_supply_segments` | ReportsPnlPage.tsx:105-126 | LOW | None |
| Service COGS | Sum of service cost_price for DONE orders | `service_orders` | ReportsPnlPage.tsx:128-142 | LOW | None |
| OPEX | Sum of payment_requests with expense_category | `payment_requests` | ReportsPnlPage.tsx:144-198 | LOW | None |
| Cash In | Sum of hotel_collects (ROOMRISE, COLLECT, not VOIDED) | `hotel_collects` | ReportsCashflowPage.tsx:94-109 | LOW | None |
| Cash Out | Sum of cash_outs | `cash_outs` | ReportsCashflowPage.tsx:111-142 | LOW | None |
| OTA AR Total | Bookings eligible for payout but not created | `bookings_mirror` - `ota_payout_details` | Dashboard.tsx:307-370 | MEDIUM | Add aging |
| Host AP Remaining | Computed: total_payable - SUM(payments) | `host_settlements` → `cashflow_entries` | HostPayablesAgingPage.tsx:146-190 | LOW | None |
| Profit vs Cash Gap | Net Profit - Net Cashflow | N/A | N/A | HIGH | **ADD** |
| 30-day Forecast | Expected collections - expected payables | N/A | N/A | MEDIUM | **ADD** |

---

## G. MINIMAL CHANGE PLAN

### Task 1: Add Profit vs Cash Gap to Dashboard

| Item | Detail |
|------|--------|
| **Phạm vi file** | `src/pages/Dashboard.tsx` |
| **Thay đổi** | Thêm query P&L summary (net profit) + display card `Profit vs Cash = Net Profit - Net Cashflow` |
| **Acceptance Criteria** | Card hiển thị số dương/âm với label "Lợi nhuận chưa thu tiền" / "Đã thu hơn lợi nhuận" |
| **Risk ảnh hưởng** | LOW - Chỉ thêm display, không sửa logic |

### Task 2: Add OTA AR Aging Display

| Item | Detail |
|------|--------|
| **Phạm vi file** | `src/pages/Dashboard.tsx` |
| **Thay đổi** | Extend OTA AR query với aging buckets (0-7, 8-14, 15-30, >30 days từ checkout date) |
| **Acceptance Criteria** | OTA AR section hiển thị breakdown by aging bucket |
| **Risk ảnh hưởng** | LOW |

### Task 3: Add ke_toan access to Accounting Periods

| Item | Detail |
|------|--------|
| **Phạm vi file** | `src/hooks/useUserPagePermissions.ts` |
| **Thay đổi** | Thêm `/settings/accounting-periods` vào default pages cho `ke_toan` role |
| **Acceptance Criteria** | ke_toan user có thể access `/settings/accounting-periods` |
| **Risk ảnh hưởng** | LOW |

### Task 4: Add 30-day Simple Forecast

| Item | Detail |
|------|--------|
| **Phạm vi file** | `src/pages/Dashboard.tsx` |
| **Thay đổi** | Query: (1) OTA payouts pending với payout_date trong 30 ngày tới, (2) Host settlements chưa paid. Display: Expected Cash In - Expected Cash Out |
| **Acceptance Criteria** | Card "Dự báo 30 ngày" với 2 số: Thu dự kiến, Chi dự kiến |
| **Risk ảnh hưởng** | LOW |

### Task 5: Add Decision Trigger Threshold

| Item | Detail |
|------|--------|
| **Phạm vi file** | `src/pages/Dashboard.tsx` |
| **Thay đổi** | If Profit vs Cash Gap > 100M VND, show warning alert. If OTA AR >30 days > 50M, show alert. |
| **Acceptance Criteria** | Alerts hiển thị trong alerts section của Dashboard |
| **Risk ảnh hưởng** | LOW |

### Task 6: Fix AccountingPeriodsPage Layout

| Item | Detail |
|------|--------|
| **Phạm vi file** | `src/pages/AccountingPeriodsPage.tsx` |
| **Thay đổi** | Migrate từ `<Sidebar />` sang `<MainLayout>` wrapper (giống các trang Finance khác đã fix) |
| **Acceptance Criteria** | Sidebar collapse/expand hoạt động đúng |
| **Risk ảnh hưởng** | LOW |

---

## H. TEST CHECKLIST

### H1. P&L Accuracy Tests

| # | Test Case | Input | Expected | Pass |
|---|-----------|-------|----------|------|
| 1 | Room revenue không tính booking cancelled | Có 1 booking CANCELLED | Revenue = 0 | ☐ |
| 2 | Room revenue chỉ tính đã checkout | Có 1 booking CONFIRMED, chưa checkout | Revenue = 0 | ☐ |
| 3 | Room revenue = sum của checkout trong kỳ | 3 bookings checkout trong kỳ, total 10M | Revenue = 10M | ☐ |
| 4 | Service revenue chỉ tính DONE | Có 2 orders: 1 DONE (1M), 1 PENDING (2M) | Revenue = 1M | ☐ |
| 5 | COGS = host_supply của booking đã checkout | Booking checkout với segment 5M | COGS Host = 5M | ☐ |

### H2. Cashflow Accuracy Tests

| # | Test Case | Input | Expected | Pass |
|---|-----------|-------|----------|------|
| 6 | Cash In chỉ từ ROOMRISE collect | Thu 10M payee=ROOMRISE, 5M payee=HOST | Cash In = 10M | ☐ |
| 7 | Cash In không tính VOIDED | Thu 10M, void 3M | Cash In = 7M | ☐ |
| 8 | Cash Out từ cash_outs | Chi 5M cho Host, 2M cho Service | Cash Out = 7M | ☐ |
| 9 | Net = In - Out | Cash In 10M, Out 7M | Net = 3M | ☐ |

### H3. AR/AP Tests

| # | Test Case | Input | Expected | Pass |
|---|-----------|-------|----------|------|
| 10 | OTA AR chỉ tính đã checkout | OTA booking chưa checkout | OTA AR = 0 | ☐ |
| 11 | OTA AR trừ đi đã tạo payout | 2 bookings 10M each, 1 đã có payout | OTA AR = 10M | ☐ |
| 12 | Host AP = total_payable - paid | Settlement 10M, đã chi 4M | AP = 6M | ☐ |
| 13 | Host AP aging tính từ finalized_at | Finalized 10 ngày trước | Bucket = 8-14 | ☐ |

### H4. Consistency Tests

| # | Test Case | Input | Expected | Pass |
|---|-----------|-------|----------|------|
| 14 | P&L không có Cash In | Query P&L | Không join hotel_collects | ☐ |
| 15 | Cashflow không có Revenue accrual | Query Cashflow | Không join unified_bookings | ☐ |
| 16 | Payout không lọt Revenue | Tạo OTA payout | P&L Revenue không đổi | ☐ |
| 17 | Period lock chặn giao dịch | Khóa tháng 12, tạo collect ngày 15/12 | Lỗi: "Kỳ đã khóa" | ☐ |
| 18 | Ledger idempotent | Tạo collect 2 lần cùng ID | Chỉ 1 ledger entry | ☐ |

---

## I. CONCLUSION

### Summary

Hệ thống báo cáo tài chính của Roomrise Control Hub đã được xây dựng với nền tảng vững chắc:

1. **✅ P&L và Cashflow tách biệt rõ ràng** - Không có leakage giữa accrual và cash basis
2. **✅ Ledger as Single Source of Truth** - `ledger_entries` table với idempotency
3. **✅ Period Lock mechanism** - Ngăn chặn sửa đổi dữ liệu quá khứ
4. **✅ Host AP Aging** - Đầy đủ với buckets chuẩn

### Gaps cần bổ sung (Minimal)

1. **Profit vs Cash Gap** - Dashboard cần metric này để phân biệt lợi nhuận vs tiền mặt
2. **OTA AR Aging** - Cần aging buckets như Host AP
3. **Simple Forecast** - 30-day outlook cơ bản
4. **ke_toan permission** - Cần access Accounting Periods

### Risk Assessment

| Risk Level | Count | Items |
|------------|-------|-------|
| HIGH | 1 | Missing Profit vs Cash Gap |
| MEDIUM | 3 | OTA AR aging, 30-day forecast, ke_toan permission |
| LOW | Multiple | Minor UI/UX improvements |

### Recommendation

Thực hiện 6 tasks trong Minimal Change Plan theo thứ tự ưu tiên. Tổng effort: **2-3 developer days**.

---

**Prepared by:** Finance Systems Architect  
**Review status:** Ready for stakeholder review  
**Next action:** Implement Task 1-6 in priority order
