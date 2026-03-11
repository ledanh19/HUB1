# OTA AR Tab v1 — Performance Audit

**Date**: 2026-02-27

## Queries on Dashboard Tab Mount

| # | Query Key | Table(s) | What | Heavy? |
|---|---|---|---|---|
| 1 | `dashboard-ota-receivables` | `channex_property_groups` | Get tenant property IDs | No (14 rows) |
| 2 | (inside #1 queryFn) | `bookings_mirror` | OTA_COLLECT, not CANCELLED, paginated 1000/batch | **YES** (200+ rows) |
| 3 | (inside #1 queryFn) | `stays` | CHECKED_OUT, batched IN 200 | **YES** |
| 4 | (inside #1 queryFn) | `ota_payout_details` | Exclude mapped, batched IN 200 | Moderate |
| 5 | (inside #1 queryFn) | `ota_disputes` | Exclude active, batched IN 200 | Low |
| 6 | `dashboard-ota-payout-pending` | `ota_payouts` | PENDING/PARTIAL payouts | Low (~37 rows) |
| 7 | `property-names-channex` | `channex_user_properties` | Property name lookup | Low (14 IDs) |

**Total: 7 Supabase calls** inside single React Query `queryFn` + 2 separate queries.

## Lazy-Mount Confirmation
- Radix `TabsContent` without `forceMount` = inactive tab NOT rendered
- Default tab = "list" → `OtaArDashboardTab` unmounted → zero queries
- ✅ Confirmed

## Breakdown Implementation
- `bySource` / `byProperty`: **Frontend O(n) loop** (lines 226-264 in `useOtaArSummary.ts`)
- No DB GROUP BY — iterates over already-fetched eligible bookings array
- Acceptable for ~200 bookings but won't scale

## Property Name Resolution
- Separate query to `channex_user_properties` WHERE `channex_property_id IN (...)`
- Maps `channex_property_id → property_name`
- User also wants `ota_property_id` displayed (different from `channex_property_id`)

## Root Causes of Slowness
1. **5 sequential Supabase calls** inside one queryFn (can't parallelize due to dependencies)
2. **Batched IN queries** with 200/batch for stays, payout_details, disputes
3. **No server-side aggregation** — full row fetch + client grouping
4. **No filter support** — always loads ALL eligible bookings

## Recommendation
Replace with single `rpc_get_ota_ar_dashboard_v2` that does everything in one DB round-trip with SQL GROUP BY, JOINs, and WHERE filters. Target: 1 RPC call < 500ms.
