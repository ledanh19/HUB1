# Finance Dashboard KPI Definitions

> **Single Source of Truth** for all financial metrics displayed on the Dashboard.  
> Last updated: 2026-01-03

---

## Table of Contents

1. [Profit vs Cash Gap](#1-profit-vs-cash-gap)
2. [OTA AR Aging Buckets](#2-ota-ar-aging-buckets)
3. [30-Day Forecast (3-Tier Model)](#3-30-day-forecast-3-tier-model)
4. [Data Quality Metrics](#4-data-quality-metrics)
5. [Status Mappings Reference](#5-status-mappings-reference)

---

## 1. Profit vs Cash Gap

### Definition

| Metric | Formula | Basis | Source |
|--------|---------|-------|--------|
| **Lợi nhuận (P&L)** | Revenue − COGS − OPEX | Accrual | `unified_bookings`, `service_orders`, `host_settlements`, `service_settlements`, `payment_requests` |
| **Dòng tiền (Cash)** | Cash In − Cash Out | Cash | `hotel_collects`, `cash_outs` |
| **Chênh lệch (Gap)** | P&L − Cash | — | Calculated |

### Interpretation

| Gap | Meaning | Action |
|-----|---------|--------|
| **Gap > 0** | "Chưa thu hết" — Profit recognized but cash not yet collected | Follow up on OTA receivables |
| **Gap < 0** | "Thu hơn LN" — Cash collected ahead of revenue recognition (prepayments) | Normal for advance deposits |
| **Gap = 0** | "Cân bằng" — Profit and cash are aligned | Ideal state |

### P&L Components

```
Net Profit = Room Revenue + Service Revenue − Host Cost − Service Cost − OPEX

Where:
- Room Revenue = SUM(unified_bookings.total_amount_net) WHERE checkout in period
- Service Revenue = SUM(service_orders.total_amount) WHERE checkout in period  
- Host Cost = SUM(host_supply_segments.host_payout_amount) WHERE checkout in period
- Service Cost = SUM(service_settlements.net_amount) WHERE payment_status != 'PAID'
- OPEX = SUM(payment_requests.amount) WHERE status = 'APPROVED' AND type = 'EXPENSE'
```

### Cash Components

```
Net Cashflow = Cash In − Cash Out

Where:
- Cash In = SUM(hotel_collects.amount_collected) 
           WHERE payee_type = 'ROOMRISE' 
           AND collection_type = 'COLLECT' 
           AND status != 'VOIDED'
           
- Cash Out = SUM(cash_outs.amount) WHERE paid_at in period
```

---

## 2. OTA AR Aging Buckets

### Definition

OTA Accounts Receivable (AR) = Bookings eligible for OTA payout that haven't been collected yet.

### Eligibility Criteria

A booking is **eligible for OTA AR** when:
1. `collection_method = 'OTA_COLLECT'`
2. `booking_status = 'CONFIRMED'`
3. Has checked out (actual or expected)
4. No `ota_payout_details` record exists

### Aging Calculation

```
Age = Today − Checkout Date

Where Checkout Date = 
  stays.actual_check_out_at (if exists)
  OR unified_bookings.check_out_date (fallback)
```

### Buckets

| Bucket | Age Range | Risk Level | Color |
|--------|-----------|------------|-------|
| **0-7 days** | 0 ≤ age ≤ 7 | Low | Green |
| **8-14 days** | 8 ≤ age ≤ 14 | Medium | Blue |
| **15-30 days** | 15 ≤ age ≤ 30 | High | Yellow |
| **>30 days** | age > 30 | Critical | Red |

### Data Quality Note

If `stays.actual_check_out_at` is missing, the system uses `check_out_date` as fallback. The **Data Quality panel** shows the fallback ratio to track this.

---

## 3. 30-Day Forecast (3-Tier Model)

### Overview

The forecast predicts cash flow for the next 30 days using a 3-tier certainty model.

### Tiers

| Tier | Label | Source | Definition | Certainty |
|------|-------|--------|------------|-----------|
| 🟢 **Committed** | Thu (Committed) | `ota_payouts` WHERE `status = 'PARTIAL'` | Payout đã nhận một phần, có bằng chứng tiền đã về | ~95% |
| 🔵 **Likely** | Thu (Likely) | `ota_payouts` WHERE `status = 'PENDING'` | Payout đã tạo, chờ OTA chuyển tiền | ~70% |
| 🟣 **Expected** | Thu (Expected) | OTA AR eligible | Booking đủ điều kiện nhưng chưa tạo payout | ~50% |

### OTA Payout Status Reference

| Status | Vietnamese | Meaning | Forecast Tier |
|--------|------------|---------|---------------|
| `PENDING` | Chờ về | Payout record created, awaiting OTA transfer | Likely |
| `PARTIAL` | Về một phần | Partially received, confirmed collection | Committed |
| `RECEIVED` | Đã nhận | Fully received | N/A (completed) |
| `DISPUTED` | Tranh chấp | Under dispute | Excluded |

### Outflow Forecast

```
Expected Out = Host AP Remaining + Service AP Unpaid

Where:
- Host AP = SUM(host_settlements.remaining_amount) WHERE remaining_amount > 0
- Service AP = SUM(service_settlements.net_amount) WHERE payment_status != 'PAID'
```

### Net Calculations

```
Total Potential In = Committed + Likely + Expected

Net Expected = Total Potential In − Expected Out

Uncertain Amount = Likely + Expected  (not Committed)

Worst Case Delay = Uncertain Amount × 30%

Net Worst Case = Committed + (Uncertain Amount − Worst Case Delay) − Expected Out
```

### Why 30% Delay Factor?

Based on historical data:
- OTA payment delays: ~20-25% of PENDING payouts delayed >15 days
- AR conversion: ~15-20% of eligible bookings take >30 days to create payout
- Combined conservative estimate: **30%**

---

## 4. Data Quality Metrics

### Visibility

Only visible to Finance roles: `ke_toan`, `admin`, `super_admin`

### Metrics

| Metric | Definition | Threshold | Action |
|--------|------------|-----------|--------|
| **AR Aging Fallback %** | % of AR bookings missing `actual_check_out_at` | < 20% OK | Update stays with actual checkout |
| **OTA chờ payout** | Bookings eligible but no `ota_payout_details` | Informational | Create payouts in OTA Payouts page |
| **Voided chưa reversal** | `hotel_collects` with `voided = true` but no `ledger_entries.entry_type = 'REVERSAL'` | 0 = OK | Create reversal entries |

### Fallback Ratio Formula

```
Fallback Ratio = (Bookings using check_out_date instead of actual_check_out_at) 
                 / (Total OTA AR bookings) × 100%
```

---

## 5. Status Mappings Reference

### Booking Status

| Status | Vietnamese | Description |
|--------|------------|-------------|
| `CONFIRMED` | Đã xác nhận | Booking confirmed, awaiting check-in |
| `CHECKED_IN` | Đã nhận phòng | Guest has arrived |
| `CHECKED_OUT` | Đã trả phòng | Guest has departed |
| `CANCELLED` | Đã huỷ | Booking cancelled |
| `NO_SHOW` | No-show | Guest did not arrive |
| `PENDING` | Chờ xác nhận | Awaiting confirmation |

### OTA Payout Status

| Status | Vietnamese | Variant | Forecast Tier |
|--------|------------|---------|---------------|
| `PENDING` | Chờ về | warning (yellow) | Likely |
| `PARTIAL` | Về một phần | info (blue) | Committed |
| `RECEIVED` | Đã nhận | success (green) | N/A |
| `DISPUTED` | Tranh chấp | danger (red) | Excluded |

### Settlement Payment Status

| Status | Vietnamese | Description |
|--------|------------|-------------|
| `PAID` | Đã thanh toán | Fully paid |
| `PARTIAL` | Thanh toán một phần | Partially paid |
| `PENDING` | Chờ thanh toán | Awaiting payment |

### Collection Method

| Method | Description | AR Eligibility |
|--------|-------------|----------------|
| `OTA_COLLECT` | OTA collects from guest | ✅ Yes |
| `HOTEL_COLLECT` | Hotel collects directly | ❌ No |
| `DIRECT` | Direct booking | ❌ No |

---

## Appendix: SQL Query Examples

### OTA AR Aging Query

```sql
SELECT 
  ub.unified_booking_id,
  ub.total_amount_net,
  COALESCE(s.actual_check_out_at::date, ub.check_out_date) as checkout_date,
  CURRENT_DATE - COALESCE(s.actual_check_out_at::date, ub.check_out_date) as age_days,
  CASE 
    WHEN age_days <= 7 THEN '0-7'
    WHEN age_days <= 14 THEN '8-14'
    WHEN age_days <= 30 THEN '15-30'
    ELSE '>30'
  END as bucket
FROM unified_bookings ub
LEFT JOIN stays s ON ub.unified_booking_id = s.unified_booking_id
LEFT JOIN ota_payout_details opd ON ub.unified_booking_id = opd.unified_booking_id
WHERE ub.collection_method = 'OTA_COLLECT'
  AND ub.booking_status = 'CONFIRMED'
  AND COALESCE(s.actual_check_out_at::date, ub.check_out_date) <= CURRENT_DATE
  AND opd.id IS NULL;
```

### Forecast Committed In Query

```sql
SELECT SUM(total_amount) as committed_in, COUNT(*) as count
FROM ota_payouts
WHERE status = 'PARTIAL'
  AND payout_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';
```

### Forecast Likely In Query

```sql
SELECT SUM(total_amount) as likely_in, COUNT(*) as count
FROM ota_payouts
WHERE status = 'PENDING'
  AND payout_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';
```

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-03 | 1.0 | Initial version with 3-tier forecast model |

---

*This document is the authoritative reference for Dashboard KPI definitions. Any changes to calculations must update this document first.*
