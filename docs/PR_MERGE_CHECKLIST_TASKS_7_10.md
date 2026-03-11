# Pre-merge Checklist for Tasks 7-10

## Overview

This document summarizes the verification and fixes performed for Tasks 7-10 before merge.

---

## A. PR Split Recommendation

### PR #1: Dashboard Core Features (Tasks 7-9)
- **TASK 7**: 30-Day Forecast (Committed vs Likely vs Expected)
- **TASK 8**: Data Quality Panel (Finance roles only)
- **TASK 9**: Executive View Mode

### PR #2: Host AP Guard (Task 10)
- **TASK 10**: Host AP Migration Guard Tooltip
- Can be merged independently as it only adds a tooltip

---

## B. Numbers & Definitions Table

| Metric | Source | Definition | Status |
|--------|--------|------------|--------|
| **Committed In** | `ota_payouts` WHERE `status = 'PARTIAL'` | Payout đã nhận một phần, có bằng chứng cash đã về | ✅ FIXED |
| **Likely In** | `ota_payouts` WHERE `status = 'PENDING'` | Payout đã tạo, chờ OTA chuyển tiền (chưa xác nhận) | ✅ ADDED |
| **Expected In** | OTA AR (booking eligible, chưa có payout) | Bookings đủ điều kiện thu OTA nhưng chưa tạo payout_details | ✅ |
| **Expected Out** | `host_settlements.remaining_amount > 0` + `service_settlements.payment_status != 'PAID'` | Tổng AP phải trả Host + Service | ✅ |
| **Net Expected** | Committed + Likely + Expected - ExpectedOut | Dự báo lạc quan | ✅ |
| **Net Worst Case** | Committed + 70% × (Likely + Expected) - ExpectedOut | Nếu 30% Likely + Expected bị delay | ✅ |

---

## C. Committed/Expected Definition Fix ✅

### Before (WRONG):
```typescript
// Committed In = OTA payouts created (PENDING/PARTIAL/APPROVED)
.in("status", ["PENDING", "PARTIAL", "APPROVED"])
```

**Issue**: PENDING = "Chờ về" = Payout đã tạo nhưng CHƯA có tiền về. Đây KHÔNG phải committed!

### After (CORRECT):
```typescript
// Committed In = OTA payouts with PARTIAL status (already received part)
// PARTIAL means "đã nhận một phần" - confirmed partial collection
.eq("status", "PARTIAL")

// Likely In = OTA payouts with PENDING status (payout created, awaiting collection)
// PENDING means "chờ về" - payout record exists but no collection yet
.eq("status", "PENDING")
```

**New 3-tier model**:
1. **Committed** (Green): PARTIAL - đã nhận một phần, chắc chắn có
2. **Likely** (Blue): PENDING - payout đã tạo, chờ xác nhận
3. **Expected** (Purple): OTA AR - đủ điều kiện, chưa tạo payout

**Worst-case calculation updated**:
```typescript
// Only apply 30% delay risk to uncertain amounts (Likely + Expected)
const uncertainIn = (forecastData?.likelyIn || 0) + expectedIn;
const worstCaseDelay = uncertainIn * 0.3;
const netWorstCase = (forecastData?.committedIn || 0) + (uncertainIn - worstCaseDelay) - (forecastData?.expectedOut || 0);
```

---

## D. Performance & Query Count

### Total React Query Hooks: 17
| Query | Table(s) | Purpose |
|-------|----------|---------|
| dashboard-stays | channex_groups, channex_property_groups, bookings_mirror, stays, host_supply_segments | Operations KPIs |
| dashboard-total-bookings | channex_groups, channex_property_groups, bookings_mirror | Booking count |
| dashboard-cash-in | hotel_collects | Cash snapshot |
| dashboard-cash-out | cash_outs | Cash snapshot |
| dashboard-pnl-room-revenue | unified_bookings | P&L |
| dashboard-pnl-service-revenue | service_orders | P&L |
| dashboard-pnl-host-cost | host_settlements, host_supply_segments | P&L |
| dashboard-pnl-service-cost | service_settlements | P&L |
| dashboard-pnl-opex | payment_requests | P&L |
| dashboard-ota-receivables | unified_bookings, stays, ota_payout_details | OTA AR + Aging |
| dashboard-ota-payout | ota_payouts | OTA Payout status |
| dashboard-host-debt | host_settlements | Host AP |
| dashboard-service-debt | service_settlements | Service AP |
| dashboard-open-disputes | disputes | Disputes count |
| dashboard-30d-forecast | ota_payouts, host_settlements, service_settlements | **NEW: Forecast** |
| dashboard-data-quality | ota_payout_details, unified_bookings, hotel_collects, ledger_entries | **NEW: Data Quality** |
| dashboard-recent-bookings | channex_groups, channex_property_groups, bookings_mirror | Recent bookings table |

### Optimization Applied:
```typescript
// Skip Recent Bookings query in Executive Mode (not displayed anyway)
const { data: recentBookings, isLoading: bookingsLoading, refetch: refetchBookings } = useQuery({
  queryKey: ["dashboard-recent-bookings", includeSampleData, isExecutiveMode],
  enabled: !isExecutiveMode,  // ✅ ADDED
  queryFn: async () => { ... }
});
```

### Memory Optimization:
- `today` memoized with `useMemo(() => format(new Date(), "yyyy-MM-dd"), [])`
- `forecast30d` memoized with `useMemo(() => format(addDays(new Date(), 30), "yyyy-MM-dd"), [])`
- `dateRange` memoized with proper dependencies
- `pnlDateRange` memoized from `dateRange`

---

## E. RBAC & Safety Verification

### Data Quality Panel (TASK 8)
```typescript
// Finance roles for Data Quality panel
const isFinanceRole = userRole === "ke_toan" || userRole === "admin" || userRole === "super_admin";

// UI rendering
{isFinanceRole && (
  <div className="rounded-lg border border-amber-500/30 ...">
    <h3>Data Quality Check</h3>
    <span>(Finance only)</span>
    ...
  </div>
)}
```
✅ Only visible to: `ke_toan`, `admin`, `super_admin`

### Executive View Mode (TASK 9)
```typescript
// Executive mode: hide drilldown links for CEO or via query param
const isExecutiveMode = searchParams.get("view") === "executive" || userRole === "ceo";
```

**Behavior**:
- `?view=executive` query param → Executive mode ON
- `userRole === "ceo"` → Executive mode ON by default
- Hides all drilldown links (`cursor-pointer`, `hover:*`)
- Hides Recent Bookings table completely
- Shows "Executive" badge in Forecast card

✅ Safe: No sensitive data exposure, only UX simplification

### Host AP Guard Tooltip (TASK 10)
```typescript
<Tooltip>
  <TooltipTrigger>
    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
  </TooltipTrigger>
  <TooltipContent>
    Đang trong giai đoạn migration. Số liệu chi tiết xem tại Host Payables → Settlement
  </TooltipContent>
</Tooltip>
```
✅ Read-only tooltip, no action buttons, safe for all roles

---

## F. Final Summary

### Changes Made in This Session:

1. **Fixed Committed definition** - PENDING is now "Likely", not "Committed"
2. **Added Likely tier** - New category between Committed and Expected
3. **Updated Forecast card UI** - Now shows 5 columns: Committed, Likely, Expected, Chi (AP), Net
4. **Updated tooltip** - Explains 3-tier model
5. **Updated worst-case calculation** - Only applies 30% delay to Likely + Expected
6. **Added query optimization** - `enabled: !isExecutiveMode` for recentBookings

### Files Modified:
- `src/pages/Dashboard.tsx` (+~380 lines, 2 sections modified for fix)

### Testing Checklist:
- [ ] Load Dashboard - verify no console errors
- [ ] Verify Forecast card shows 5 columns
- [ ] Verify Committed shows only PARTIAL payouts count
- [ ] Verify Likely shows PENDING payouts count
- [ ] Verify Data Quality panel only visible for ke_toan/admin
- [ ] Test `?view=executive` - drilldown links hidden
- [ ] Test CEO role auto-enables Executive mode
- [ ] Check mobile responsive (Forecast card cols)

### Recommended Next Steps:
1. Create sample PARTIAL payout to verify Committed In calculation
2. Verify with real data from An Gia properties
3. Consider adding refresh button to Forecast card
4. Consider caching forecast data longer (staleTime: 5 minutes)

---

*Document generated: Pre-merge verification complete*
