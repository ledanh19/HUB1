# TEST CASES: P&L vs Cashflow Golden Scenarios

> **Version:** 1.0  
> **Date:** 2026-02-16  
> **Purpose:** Verify consistency between Dashboard and Report P&L  
> **Related:** [AUDIT_SOT_PL_DASHBOARD.md](AUDIT_SOT_PL_DASHBOARD.md)

---

## OVERVIEW

This document defines golden test scenarios to verify:
1. Dashboard "Lợi nhuận vs Dòng tiền" card matches Report P&L for same period
2. Accrual vs Cash timing differences are correctly handled
3. Edge cases (CANCELLED, NO_SHOW, IMPORTED) are handled consistently

---

## TEST SCENARIOS

### Scenario 1: OTA Payout Delayed (30 Days)

**Setup:**
- Booking: OTA_COLLECT, check_in: 2026-01-15, check_out: 2026-01-17
- Stay: CHECKED_OUT at 2026-01-17 10:00
- OTA Payout: Not yet created (expected ~30 days after checkout)
- Period: January 2026

**Expected Contract:**

```json
{
  "period": { "from": "2026-01-01", "to": "2026-01-31", "timezone": "+07:00" },
  "currency": "VND",
  "accrual": {
    "revenue": 3000000,
    "revenue_room": 3000000,
    "revenue_service": 0,
    "cogs": 2000000,
    "cogs_host": 2000000,
    "cogs_service": 0,
    "opex": 0,
    "opex_ota_commission": 0,
    "gross_profit": 1000000,
    "net_profit": 1000000,
    "gross_margin": 33.33,
    "net_margin": 33.33
  },
  "cash": {
    "cash_in": 0,
    "cash_out": 0,
    "net_cash": 0
  },
  "difference": {
    "profit_minus_cash": 1000000
  }
}
```

**Verification:**
- [ ] Dashboard Net Profit = 1,000,000 đ
- [ ] Dashboard Cash = 0 đ
- [ ] Dashboard Gap = +1,000,000 đ (label: "Chưa thu hết")
- [ ] Report P&L Net Profit = 1,000,000 đ

---

### Scenario 2: Hotel Collect (Cash Before Revenue)

**Setup:**
- Booking: HOTEL_COLLECT, check_in: 2026-02-01, check_out: 2026-02-03
- Guest pays cash on 2026-02-01 (before checkout)
- hotel_collects: amount_collected = 2,500,000, collected_at = 2026-02-01
- Stay: Not yet CHECKED_OUT (currently CHECKED_IN)
- Period: February 1-15, 2026

**Expected Contract:**

```json
{
  "period": { "from": "2026-02-01", "to": "2026-02-15", "timezone": "+07:00" },
  "currency": "VND",
  "accrual": {
    "revenue": 0,
    "revenue_room": 0,
    "revenue_service": 0,
    "cogs": 0,
    "gross_profit": 0,
    "net_profit": 0,
    "gross_margin": null,
    "net_margin": null
  },
  "cash": {
    "cash_in": 2500000,
    "cash_out": 0,
    "net_cash": 2500000
  },
  "difference": {
    "profit_minus_cash": -2500000
  }
}
```

**Verification:**
- [ ] Dashboard Net Profit = 0 đ (guest hasn't checked out)
- [ ] Dashboard Cash = +2,500,000 đ (cash received)
- [ ] Dashboard Gap = -2,500,000 đ (label: "Thu hơn LN")
- [ ] Report P&L Net Profit = 0 đ

**After Checkout (staying in same period):**
- Stay: CHECKED_OUT at 2026-02-03 12:00

```json
{
  "accrual": {
    "revenue": 2500000,
    "net_profit": 500000
  },
  "cash": {
    "net_cash": 2500000
  },
  "difference": {
    "profit_minus_cash": -2000000
  }
}
```

---

### Scenario 3: CANCELLED Booking

**Setup:**
- Booking: OTA_COLLECT, booked for 2026-02-10 - 2026-02-12
- booking_status: CANCELLED (cancelled before check-in)
- No hotel_collects record
- No stay record
- Period: February 2026

**Expected Contract:**

```json
{
  "accrual": {
    "revenue": 0,
    "revenue_room": 0,
    "cogs": 0,
    "net_profit": 0
  },
  "cash": {
    "cash_in": 0,
    "net_cash": 0
  }
}
```

**Verification:**
- [ ] CANCELLED booking NOT counted in revenue
- [ ] CANCELLED booking NOT counted in COGS
- [ ] Dashboard = Report P&L = 0

---

### Scenario 4: NO_SHOW Booking

**Setup:**
- Booking: HOTEL_COLLECT, check_in: 2026-02-05
- booking_status: CONFIRMED, but guest never arrived
- stay_status: NULL or NO_SHOW (not CHECKED_IN or CHECKED_OUT)
- Hotel collected: may or may not have collected
- Period: February 2026

**Expected Contract:**

```json
{
  "accrual": {
    "revenue": 0,
    "revenue_room": 0
  }
}
```

**Note:** Revenue is NOT recognized because stay_status != CHECKED_OUT.
If hotel collected penalty fee, it should be in cash_in but not accrual revenue.

**Verification:**
- [ ] NO_SHOW booking NOT in accrual revenue (no checkout)
- [ ] Any cash collected still counts in cash_in
- [ ] Gap may be negative (cash received, no revenue recognized)

---

### Scenario 5: Revenue = 0 (Margin Null)

**Setup:**
- No bookings with CHECKED_OUT in period
- Period: Future month or empty period

**Expected Contract:**

```json
{
  "accrual": {
    "revenue": 0,
    "gross_profit": 0,
    "net_profit": 0,
    "gross_margin": null,
    "net_margin": null
  }
}
```

**Verification:**
- [ ] Margin shows "—" or "N/A", NOT "0%" or error
- [ ] Both Dashboard and Report P&L handle null margin consistently

---

### Scenario 6: Mixed Sources (Room + Service)

**Setup:**
- Booking 1: OTA_COLLECT, checkout 2026-02-10, amount = 3,000,000
- Booking 2: HOTEL_COLLECT, checkout 2026-02-12, amount = 2,500,000
- Service Order 1: DONE, service_date_time = 2026-02-11, sale_price = 500,000, cost_price = 200,000
- Host segments: booking 1 = 2,000,000, booking 2 = 1,800,000
- OPEX: SALARY = 1,000,000, OTA Commission (from B2 HOTEL_COLLECT) = 375,000
- Period: February 2026

**Expected Contract:**

```json
{
  "accrual": {
    "revenue": 6000000,
    "revenue_room": 5500000,
    "revenue_service": 500000,
    "cogs": 4000000,
    "cogs_host": 3800000,
    "cogs_service": 200000,
    "opex": 1375000,
    "opex_ota_commission": 375000,
    "opex_categories": {
      "SALARY": 1000000,
      "OTA_COMMISSION": 375000
    },
    "gross_profit": 2000000,
    "net_profit": 625000,
    "gross_margin": 33.33,
    "net_margin": 10.42
  }
}
```

**Verification:**
- [ ] Room + Service revenue correctly summed
- [ ] COGS includes both host cost and service cost
- [ ] OTA Commission correctly calculated from HOTEL_COLLECT booking
- [ ] Dashboard gross_profit = Report P&L gross_profit
- [ ] Dashboard net_profit = Report P&L net_profit

---

### Scenario 7: IMPORTED Booking

**Setup:**
- Booking: IMPORTED, HOTEL_COLLECT
- booking_amount_overrides: amount = 2,000,000, commission_percent = 15
- hotel_collects: status = COLLECTED
- stay_status: CHECKED_OUT
- Period: February 2026

**Expected Contract:**

```json
{
  "accrual": {
    "revenue_room": 2000000,
    "opex_ota_commission": 300000
  }
}
```

**Verification:**
- [ ] IMPORTED uses override amount (not total_amount_net)
- [ ] Commission calculated from override: 2,000,000 * 15% = 300,000
- [ ] Without override, IMPORTED would be 0 revenue

---

### Scenario 8: Early Checkout

**Setup:**
- Booking: check_out_date = 2026-02-15 (scheduled)
- stays.actual_check_out_at = 2026-02-13 (early checkout)
- Period: February 1-14, 2026

**Expected:**
- Dashboard (uses actual_check_out_at): Revenue INCLUDED
- Old Report P&L (uses check_out_date): Revenue EXCLUDED

**After Fix:**
- Both should use actual_check_out_at
- Revenue INCLUDED in Feb 1-14 period

**Verification:**
- [ ] With shared hook, both see same revenue
- [ ] Early checkout recognized on actual date

---

### Scenario 9: Late Checkout

**Setup:**
- Booking: check_out_date = 2026-02-15 (scheduled)
- stays.actual_check_out_at = 2026-02-16 (late checkout)
- Period: February 1-15, 2026

**Expected:**
- Dashboard (uses actual_check_out_at): Revenue EXCLUDED (checkout on 16th)
- Old Report P&L (uses check_out_date): Revenue INCLUDED (check_out_date on 15th)

**After Fix:**
- Both should use actual_check_out_at
- Revenue EXCLUDED from Feb 1-15 period
- Revenue INCLUDED in Feb 16-28 period

**Verification:**
- [ ] With shared hook, both see same result
- [ ] Late checkout recognized on actual date

---

## ACCEPTANCE CRITERIA

### For Merge Approval

| # | Criteria | Status |
|---|----------|--------|
| 1 | Dashboard Net Profit = Report P&L Net Profit (same period) | ☐ |
| 2 | Dashboard Gross Profit = Report P&L Gross Profit | ☐ |
| 3 | Dashboard Margin = Report P&L Margin (same rounding) | ☐ |
| 4 | CANCELLED bookings excluded from both | ☐ |
| 5 | NO_SHOW handled consistently | ☐ |
| 6 | IMPORTED bookings use override amount | ☐ |
| 7 | OTA Commission auto-calculated from HOTEL_COLLECT | ☐ |
| 8 | Tooltip text matches displayed numbers | ☐ |
| 9 | Early/Late checkout uses actual_check_out_at | ☐ |
| 10 | No duplicate calculation logic (shared hook) | ☐ |

### Regression Checks

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Existing bookings show same revenue | Compare before/after screenshots |
| 2 | Cash In/Out unchanged | Check cash_ins/cash_outs queries |
| 3 | OPEX categories unchanged | Check payment_requests query |
| 4 | No new errors in console | Check browser console |
| 5 | Performance acceptable | Query time < 5 seconds |

---

## TEST EXECUTION GUIDE

### Manual Testing

1. **Prepare Test Period:**
   - Select a month with mixed booking types
   - Note down expected values from database

2. **Dashboard Test:**
   - Navigate to Dashboard `/`
   - Set period filter to test month
   - Record values from "Lợi nhuận vs Dòng tiền" card:
     - Lợi nhuận (Net Profit)
     - Dòng tiền (Net Cash)
     - Chênh lệch (Gap)

3. **Report P&L Test:**
   - Navigate to `/reports/pnl`
   - Set same date range
   - Record values:
     - Total Revenue
     - Gross Profit
     - Net Profit
     - Gross Margin
     - Net Margin

4. **Compare:**
   - Net Profit Dashboard = Net Profit Report P&L?
   - Gross Profit Dashboard's implied = Report P&L?
   - Margin rounding consistent?

### Automated Testing (Future)

```typescript
// Example test structure
describe('usePLCalculator', () => {
  it('should match Dashboard and Report P&L for same period', async () => {
    const startDate = new Date('2026-02-01');
    const endDate = new Date('2026-02-28');
    
    const { result } = renderHook(() => 
      usePLCalculator({ startDate, endDate })
    );
    
    await waitFor(() => !result.current.isLoading);
    
    expect(result.current.data.accrual.net_profit).toBe(expectedNetProfit);
    expect(result.current.data.cash.net_cash).toBe(expectedNetCash);
  });
});
```

---

## SNAPSHOT TEMPLATES

### Contract Snapshot (for regression testing)

Save after each test run:

```
docs/snapshots/
├── 2026-02/
│   ├── pl_contract_2026-02.json
│   ├── dashboard_screenshot.png
│   └── report_pnl_screenshot.png
```

### Comparison Report

```markdown
## P&L Comparison Report - February 2026

| Metric | Dashboard | Report P&L | Match? |
|--------|-----------|------------|--------|
| Net Profit | 625,000 đ | 625,000 đ | ✅ |
| Gross Profit | 2,000,000 đ | 2,000,000 đ | ✅ |
| Gross Margin | 33.3% | 33.3% | ✅ |
| Net Margin | 10.4% | 10.4% | ✅ |
| Cash In | 5,500,000 đ | N/A | — |
| Cash Out | 4,875,000 đ | N/A | — |
| Gap | +625,000 đ | N/A | — |

Status: ✅ PASS
```

---

## KNOWN EDGE CASES

### 1. Timezone Boundary

**Issue:** Booking checkout at 2026-02-01 00:30 Vietnam time
- Vietnam timezone: +07:00
- UTC time: 2026-01-31 17:30

**Resolution:** Always use Vietnam timezone for date comparison

### 2. Multiple Stays per Booking

**Issue:** Some bookings may have multiple stay records (e.g., room change)

**Resolution:** Take the stay with CHECKED_OUT status, use its actual_check_out_at

### 3. VOIDED hotel_collects

**Issue:** Hotel collected but later voided (refund)

**Resolution:** Exclude VOIDED from both revenue guardrail and cash_in

### 4. BHXH Split Categories

**Issue:** BHXH_EMPLOYER and BHXH_EMPLOYEE should be combined

**Resolution:** Map both to "BHXH" category in OPEX

---

## APPENDIX: SQL Verification Queries

### Room Revenue (Dashboard SOT)

```sql
SELECT 
  SUM(COALESCE(bao.amount, 
    CASE WHEN bm.booking_type = 'IMPORTED' THEN 0 ELSE bm.total_amount_net END
  )) as room_revenue
FROM bookings_mirror bm
INNER JOIN stays s 
  ON s.unified_booking_id = bm.unified_booking_id
LEFT JOIN booking_amount_overrides bao 
  ON bao.unified_booking_id = bm.unified_booking_id
LEFT JOIN hotel_collects hc 
  ON hc.unified_booking_id = bm.unified_booking_id 
  AND hc.status != 'VOIDED'
WHERE 
  bm.booking_status = 'CONFIRMED'
  AND s.stay_status = 'CHECKED_OUT'
  AND s.actual_check_out_at >= '2026-02-01T00:00:00'
  AND s.actual_check_out_at < '2026-03-01T00:00:00'
  AND (
    bm.payment_type = 'OTA_COLLECT'
    OR (bm.payment_type = 'HOTEL_COLLECT' AND hc.unified_booking_id IS NOT NULL)
  );
```

### Cash In (Cash SOT)

```sql
SELECT SUM(amount_collected) as cash_in
FROM hotel_collects
WHERE 
  payee_type = 'ROOMRISE'
  AND collection_type = 'COLLECT'
  AND status != 'VOIDED'
  AND collected_at >= '2026-02-01T00:00:00'
  AND collected_at < '2026-03-01T00:00:00';
```
