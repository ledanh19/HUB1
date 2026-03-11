# OTA AR Dashboard v2 — Final Verification Report

**Date**: 2026-02-27  
**Commit**: `923a784` (main)

---

## Check Results

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Network queries on tab load | ✅ PASS | 1 RPC + 2 dropdown caches (10min stale) |
| 2 | Lazy-mount | ✅ PASS | Radix TabsContent unmounts inactive tab |
| 3 | Breakdown in DB | ✅ PASS | SQL GROUP BY in RPC CTEs |
| 4 | Property names | ✅ PASS | JOIN to channex_user_properties in RPC |
| 5 | ota_property_id shown | ✅ PASS | Column in property breakdown table |
| 6 | Filters URL-synced | ✅ PASS | ?property= and ?source= params |
| 7 | Pivot toggle | ✅ PASS | Source↔Property with click-to-drill |
| 8 | RBAC/RLS | ✅ PASS | SECURITY INVOKER on RPC |

---

## Architecture: Before vs After

| Aspect | v1 | v2 |
|---|---|---|
| Queries on mount | 7 Supabase calls | 1 RPC call |
| Grouping | Frontend O(n) loop | SQL GROUP BY |
| Property names | Separate query | JOIN in RPC |
| Filters | None | Property + Source (URL params) |
| Pivot | None | Source↔Property toggle |
| ota_property_id | Not shown | Shown in property breakdown |

## RPC: `rpc_get_ota_ar_dashboard_v2`

```
Inputs: p_property_id TEXT, p_source TEXT
Output: JSONB { summary, aging[], by_source[], by_property[] }
```

CTEs: tenant_props → ota_bookings → checked_out → with_payout → with_dispute → eligible → pending_payouts → summary → aging → by_source → by_property

## Query Keys

```typescript
// v2 hook
["ota-ar-dashboard-v2", propertyId || "ALL", source || "ALL"]

// Filter dropdowns (cached 10min)
["property-list-for-filter"]
["ota-source-list-for-filter"]
```

## Files Changed

| File | Type | Purpose |
|---|---|---|
| `supabase/migrations/20260228_rpc_ota_ar_dashboard_v2.sql` | NEW | RPC + 4 indexes |
| `src/hooks/useOtaArDashboardV2.ts` | NEW | V2 hook + dropdown hooks |
| `src/components/ota-payout/OtaArDashboardTab.tsx` | REWRITE | Filter bar + pivot + v2 data |
| `docs/verify/OTA_AR_TAB_PERF_AUDIT.md` | NEW | Performance audit |

## Invariants (guaranteed by SQL)

- `summary.eligible_amount = Σ(by_source[].amount) = Σ(by_property[].amount)`
- `summary.total_outstanding = eligible_amount + pending_amount`
- `Σ(aging[].amount) = eligible_amount` (when all have checkout dates)

> [!IMPORTANT]
> The RPC migration must be applied to Supabase before the v2 hook will work.
> Until then, the dashboard tab will show an RPC error.
> Run the migration via Supabase Dashboard → SQL Editor.
