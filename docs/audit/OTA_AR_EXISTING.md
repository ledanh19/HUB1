# OTA AR Existing Implementation — Audit Report

## A1: Dashboard "Công nợ OTA" Card

### File Paths & Components

| Item | Path |
|---|---|
| Dashboard page | `src/pages/Dashboard.tsx` |
| OTA AR query | `Dashboard.tsx:353-511` (inline `useQuery`) |
| OTA Payout snapshot | `Dashboard.tsx:517-549` (inline `useQuery`) |
| Card rendering | `Dashboard.tsx:1810-1893` |
| Metric definitions | `src/components/dashboard/financeUICopy.ts:76-99` |
| "Chi tiết" link | `Dashboard.tsx:1836` → `/ota-payouts` |

---

### React Query Keys

| Key | Purpose | Stale Time |
|---|---|---|
| `["dashboard-ota-receivables", today]` | Eligible bookings (Chờ tạo payout) | 5 min |
| `["dashboard-ota-payout-pending"]` | Pending/Partial payouts (Đang chuyển về) | 5 min |

---

### Metric Definitions

#### 1. "Chờ tạo payout" (Eligible AR)
- **Amount**: `otaReceivablesData.total` — sum of `total_amount_net`
- **Count**: `otaReceivablesData.count` — number of eligible bookings
- **Criteria**: Booking is eligible when ALL of:
  1. `bookings_mirror.payment_type = 'OTA_COLLECT'`
  2. `bookings_mirror.booking_status != 'CANCELLED'`
  3. `bookings_mirror.channex_property_id` in An Gia group
  4. Has a `stays` record with `stay_status = 'CHECKED_OUT'` (**GUARDRAIL**)
  5. NO record in `ota_payout_details` for this `unified_booking_id`
  6. NO active dispute in `ota_disputes` (`status IN ('OPEN', 'IN_REVIEW')`)

#### 2. "Đang chuyển về" (Pending Payouts)
- **Amount**: `otaPayoutData.pending` — sum of `total_amount` for PENDING+PARTIAL payouts
- **Count**: `otaPayoutData.pendingCount`
- **Criteria**: `ota_payouts.status IN ('PENDING', 'PARTIAL')`
- **Overdue**: `payout_date < today` AND status still PENDING/PARTIAL
- **Scope**: ALL payouts (no property filter, no date filter)

#### 3. Aging Buckets (from checkout date)
- Basis: `stays.actual_check_out_at` → fallback to `bookings_mirror.check_out_date`
- `daysDiff = floor((today - checkoutDate) / 86400000)`

| Bucket | Days | Color |
|---|---|---|
| 0-7 | `daysDiff <= 7` | success (green) |
| 8-14 | `8 <= daysDiff <= 14` | warning (yellow) |
| 15-30 | `15 <= daysDiff <= 30` | warning |
| >30 | `daysDiff > 31` | destructive (red) |

---

### Data Flow (Step by Step)

```
bookings_mirror (OTA_COLLECT, !CANCELLED, property scoped)
    ↓
stays (stay_status = CHECKED_OUT) → checkedOutBookings Set
    ↓
ota_payout_details → bookingsWithPayout Set (EXCLUDE)
    ↓
ota_disputes (OPEN/IN_REVIEW) → bookingsWithDispute Set (EXCLUDE)
    ↓
eligibleBookings = checkedOut ∩ ¬payout ∩ ¬dispute
    ↓
Aggregate: total, count, bySource, aging
```

### bySource Breakdown
Already computed: `Record<string, { amount: number; count: number }>` at line 452.
Available but **NOT rendered** in the dashboard card.

---

### Filter Parameters & RBAC

- **Property scope**: Hardcoded to `AN_GIA_GROUP_ID` → `channex_property_groups` → `channex_property_id[]`
- **Date scope**: OTA AR is **timeless** (no date filter). Shows ALL eligible bookings regardless of period selector.
- **Payout snapshot**: Also timeless (all PENDING/PARTIAL payouts)
- **RBAC**: Supabase RLS applies on all table reads. No explicit role check in query.

### Debug Data
Returns `debug: { totalBookings, withStayCheckout, withPayout, withDispute }` for Data Quality panel.

---

### Known Caveats
1. **Timezone**: Aging uses `new Date(checkoutStr)` — browser timezone interpretation
2. **Currency**: All amounts in VND, `maximumFractionDigits: 0`
3. **Pagination**: Uses `fetchAllRows` with batched IN queries (1000-row pages, 200-batch IN) to avoid Supabase row limits
4. **Property scope hardcoded**: `AN_GIA_GROUP_ID` constant — not dynamic per tenant
5. **OTA Payout snapshot has no property filter**: Counts ALL pending payouts regardless of property
