# OTA AR Source of Truth Mapping

## SOT Tables

| Table | Role in OTA AR |
|---|---|
| `bookings_mirror` | Master booking list (OTA_COLLECT filter, total_amount_net, ota_source, channex_property_id) |
| `stays` | Checkout confirmation (`stay_status = CHECKED_OUT`, `actual_check_out_at`) |
| `ota_payout_details` | Junction: booking → payout mapping (presence = "has payout") |
| `ota_payouts` | Payout records (status, total_amount, payout_date, ota_source, ota_property_id) |
| `ota_disputes` | Active disputes (OPEN/IN_REVIEW exclusion) |
| `channex_property_groups` | Property scoping (tenant isolation) |

---

## Reconciliation: Dashboard ↔ Payout List

### Eligible Bookings (Dashboard "Chờ tạo payout")
```
eligible = bookings_mirror
  WHERE payment_type = 'OTA_COLLECT'
    AND booking_status != 'CANCELLED'
    AND channex_property_id IN (tenant_properties)
    AND unified_booking_id IN (stays WHERE stay_status = 'CHECKED_OUT')
    AND unified_booking_id NOT IN (ota_payout_details)
    AND unified_booking_id NOT IN (ota_disputes WHERE status IN ('OPEN','IN_REVIEW'))
```

### Pending Payouts (Dashboard "Đang chuyển về")
```
pending = ota_payouts WHERE status IN ('PENDING', 'PARTIAL')
```

### Verification Identity
```
Outstanding OTA AR = Eligible Amount + Pending Payout Amount
                   = (bookings without payout) + (payouts without full collection)
```

---

## Existing RPC/View for OTA AR

**NONE exists.** The Dashboard computes OTA AR inline using 4 separate table queries:
1. `bookings_mirror` (paginated fetchAllRows)
2. `stays` (batched IN by unified_booking_id)
3. `ota_payout_details` (batched IN)
4. `ota_disputes` (batched IN)

This is a **client-side join** pattern — no server-side RPC/view aggregates OTA AR.

---

## Reuse Strategy

### For Dashboard Tab in OTA Payout Page:

1. **Extract** the inline OTA AR query from `Dashboard.tsx:358-510` into a **shared hook** `useOtaArSummary()`
2. **Both** Dashboard and OTA Payout Dashboard tab consume the **same hook** and **same query key**
3. Dashboard's OTA AR card uses the hook via destructuring (zero logic change)
4. The `bySource` breakdown is **already computed** but not rendered — just render it in the new tab

### For Breakdown by Property:
The current query fetches `channex_property_id` from `bookings_mirror` (line 379). We need to:
- Group eligible bookings by `channex_property_id`
- Map to property name via `channex_properties` table (additional join)
- This is a **render-only change** — no new data fetch needed

### For Drill-down Detail List:
- Reuse `useOtaPayoutTracking` hook (already provides per-booking detail with payout status, dispute info)
- Add server-side pagination parameters

---

## Data Contract: `useOtaArSummary()` return type

```typescript
interface OtaArSummary {
  total: number;          // Eligible AR amount
  count: number;          // Eligible booking count
  bySource: Record<string, { amount: number; count: number }>;
  byProperty: Record<string, { amount: number; count: number; propertyName?: string }>;
  aging: {
    bucket0_7: { amount: number; count: number };
    bucket8_14: { amount: number; count: number };
    bucket15_30: { amount: number; count: number };
    bucket30Plus: { amount: number; count: number };
  };
  pendingPayouts: {
    total: number;
    count: number;
    overdueCount: number;
    overdueAmount: number;
  };
}
```

---

## RBAC: No Change Needed
- All queries go through Supabase RLS on every table
- Property scoping via `channex_property_groups` (tenant isolation)
- No explicit role check needed — RLS handles it
