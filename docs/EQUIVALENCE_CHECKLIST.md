# EQUIVALENCE_CHECKLIST.md
## PMS SOT ↔ Control Hub — Behavior Equivalence Audit
### Date: 2026-02-18

---

## Legend
- **MATCH** — Control Hub behavior matches PMS SOT
- **MISMATCH** — Behavior exists but differs from PMS SOT
- **MISSING** — Behavior not implemented in Control Hub
- **PARTIAL** — Partially implemented

---

## 1. Inventory (Availability) Fetch

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence (file + function) | Fix Needed |
|---|------------------------|---------------------|--------|--------------------------|------------|
| 1.1 | Availability stored per `(date, property_id, room_type_id)` with `rate_plan_id=NULL` | `inventory_cells` stores availability alongside rate per `(property_id, room_type_id, rate_plan_id, channel_id, cell_date)` — availability is on every cell, not a separate row type | **MISMATCH** | [useInventory.ts](src/hooks/useInventory.ts) `InventoryCell.availability`; PMS §2.8 row types | Control Hub uses single-cell model (acceptable simplification). Grid must aggregate availability at room-type level (not per rate plan). Currently does this via `getRoomTypeAvailability()` in InventoryGrid — **OK but fragile** (picks first rate plan with data, not a dedicated AVL row). |
| 1.2 | Default availability = `room.roomUnits.count()` when no inventory override | No default availability fallback — shows `0` when cell doesn't exist | **MISSING** | [InventoryGrid.tsx](src/components/inventory/InventoryGrid.tsx) `getRoomTypeAvailability` returns 0 if no cell | Need `room_types_mirror.occupancy` as fallback (already has column but unused) |
| 1.3 | Availability read from Channex `GET /availability` endpoint | Reads from Channex `GET /restrictions` (includes availability as one of the restriction fields) | **MISMATCH** | [channex-inventory-sync/index.ts](supabase/functions/channex-inventory-sync/index.ts) line ~120 | Actually acceptable — Channex `/restrictions` includes `availability`. However PMS uses separate `/availability` endpoint for reads. Minor difference, same data. |
| 1.4 | Availability is integer ≥ 0 | `inventory_cells.availability` is `number | null`, nullable | **MISMATCH** | Supabase types.ts line 3863 | Should default to 0, not null. Add `COALESCE` or default. |
| 1.5 | Range: today → today + 499 days (full sync) | Default sync range: today → today + 90 days | **MISMATCH** | [channex-inventory-sync/index.ts](supabase/functions/channex-inventory-sync/index.ts) `generateDateRange` | Increase to 500 days for parity, or document as intentional subset. |
| 1.6 | UI grid displays 14 days at a time | UI displays 14 days — `getWeekDates(startDate, 14)` | **MATCH** | [InventoryPage.tsx](src/pages/InventoryPage.tsx) line 198 | — |

## 2. Inventory (Availability) Write

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 2.1 | Availability write → `POST /availability` to Channex with `property_id`, `room_type_id`, `date`, `availability` | No outbound push to Channex. Creates `inventory_sync_jobs` with `PENDING` status but **no consumer function** exists | **MISSING** | [inventory-batch-update/index.ts](supabase/functions/inventory-batch-update/index.ts) — creates job; no push function | Must implement outbound Channex push processor OR document gap |
| 2.2 | Channex availability uses `rooms.external_id` (Channex room_type UUID) | Writes use internal `room_type_id` (mirror table UUID). No translation to `provider_room_type_id` for outbound push | **MISSING** | `inventory-batch-update` uses internal IDs only | Outbound push must resolve `room_types_mirror.provider_room_type_id` |
| 2.3 | Two-phase: sync to Channex first, then apply locally | Single-phase: writes to local DB immediately, creates async sync job | **MISMATCH** | [useInventory.ts](src/hooks/useInventory.ts) `useBulkUpdateInventory` — writes to DB then creates sync job | PMS guarantees Channex-first. CH writes local-first. This is a design choice (eventual consistency vs strong consistency). Document as known deviation. |
| 2.4 | Payload optimization: consecutive dates merged into `date_from`/`date_to` ranges | No payload optimization — individual cells written one at a time | **MISSING** | `useBulkUpdateInventory` loops per draft; `useLegacyBulkUpdateInventory` does cartesian upsert | Implement date-range merging in outbound push function |
| 2.5 | Hard limit 20,000 records per bulk operation | No hard limit enforced | **MISSING** | `useLegacyBulkUpdateInventory` has no count guard | Add guard: if affected cells > 20_000 → reject with error |

## 3. Rate Fetch

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 3.1 | Effective rate = `inventory.rate` ?? `history.rate` ?? `rate_plans.price` | Rate = `inventory_cells.rate` (single source, no fallback chain) | **MISMATCH** | [InventoryGrid.tsx](src/components/inventory/InventoryGrid.tsx) `renderCellValue` reads `cell.rate` | No rate history table exists in CH. Acceptable if full sync populates all cells. For cells without data, should fall back to `rate_plans_mirror.base_rate`. |
| 3.2 | OTA rate = `basePrice × (1 + booking_source.price_percentage / 100)` | No OTA markup calculation. Rate displayed as-is from `inventory_cells.rate` | **MISSING** | Grid shows raw `cell.rate` | For sync'd data from Channex, rates already include OTA markup. For manual edits, no markup applied. Document as acceptable (rates entered are final rates). |
| 3.3 | Rates read from Channex `GET /restrictions` | Same endpoint used: `GET /restrictions` | **MATCH** | [channex-inventory-sync/index.ts](supabase/functions/channex-inventory-sync/index.ts) | — |
| 3.4 | Rate display: VND formatted as integer; USD 2 decimal | VND displayed as millions (e.g., `5,68 Tr`). No currency-aware formatting logic matching PMS `MoneyHelper` | **MISMATCH** | [InventoryGrid.tsx](src/components/inventory/InventoryGrid.tsx) `formatRate` | `formatRate()` uses divide-by-million display format. Not a SOT violation (display-only concern), but Channex payloads must use `(int) round(amount)` for VND. |
| 3.5 | Rate plan join: rate data joined by `rate_plan_booking_source.external_id` (Channex rate_plan_id) | Join by `rate_plans_mirror.provider_rate_plan_id` matching Channex rate_plan_id | **MATCH** | [channex-inventory-sync/index.ts](supabase/functions/channex-inventory-sync/index.ts) maps `provider_rate_plan_id` | — |

## 4. Rate Write

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 4.1 | Grid commit: `POST /inventory/store-multiple` with `{request_id, property_id, changes[]}` | Draft system → `useBulkUpdateInventory` writes directly to Supabase `inventory_cells` | **MISMATCH** | [useInventory.ts](src/hooks/useInventory.ts) lines 379-510 | Different architecture (Supabase direct vs API endpoint). Functionally similar for single-cell edits. |
| 4.2 | Bulk update rate types: `exact`, `increase_amount`, `decrease_amount`, `increase_percent`, `decrease_percent` | Only 3 types: `set` (exact), `increase` (% only), `decrease` (% only). No absolute increase/decrease | **MISMATCH** | [BulkUpdateDialog.tsx](src/components/inventory/BulkUpdateDialog.tsx) `rateChangeType`: `set`, `increase`, `decrease` | Add `increase_amount` and `decrease_amount` options |
| 4.3 | Percent mode: `round(baseRate × (1 ± value/100))`. Skip if baseRate is null/0 | No base rate resolution for percent calc. `rate_change_type` / `rate_change_value` passed as metadata to `useLegacyBulkUpdateInventory` but **never applied** — the upsert doesn't compute the new rate | **MISSING** | [BulkUpdateDialog.tsx](src/components/inventory/BulkUpdateDialog.tsx) `handleSave` line ~430; `useLegacyBulkUpdateInventory` doesn't handle `rate_change_type` | Must implement rate calculation: fetch current rates, apply formula, write computed values |
| 4.4 | Base rate resolution: `inventory.rate` → `history.rate` → `ratePlan.price` | No base rate resolution chain | **MISSING** | — | Must query existing `inventory_cells.rate` and fall back to `rate_plans_mirror.base_rate` |
| 4.5 | Percent mode guard: skip if base rate is null/0/non-numeric | Not implemented — would silently write NaN or 0 | **MISSING** | — | Add guard to skip date+ratePlan combos with no base rate |
| 4.6 | Two-phase: Channex sync first, then local write | Single-phase: local write first, async sync | **MISMATCH** | See 2.3 | Same architectural difference. Document. |
| 4.7 | `POST /restrictions` to Channex with rate + all restrictions | No outbound push to Channex for rates | **MISSING** | See 2.1 | Same gap as availability push |
| 4.8 | Currency formatting at write: VND → `(int) round(amount)` | No currency formatting at write. Raw number stored/sent | **MISMATCH** | — | Add `formatCurrencyForChannex(amount, currency)` helper |

## 5. Date Normalization

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 5.1 | Timezone: `Asia/Ho_Chi_Minh` (UTC+7) for all `now()` / `today()` | Uses `new Date()` (browser local time in UI; UTC in edge functions) | **MISMATCH** | [channex-inventory-sync/index.ts](supabase/functions/channex-inventory-sync/index.ts) `new Date().toISOString().split('T')[0]`; [BulkUpdateDialog.tsx](src/components/inventory/BulkUpdateDialog.tsx) `startOfDay(new Date())` | Edge functions: use `Asia/Ho_Chi_Minh` TZ for "today". UI: add `normalizeDateRange()` helper using `date-fns-tz`. |
| 5.2 | Date format: `YYYY-MM-DD` everywhere | Uses `format(date, 'yyyy-MM-dd')` via date-fns | **MATCH** | Multiple files | — |
| 5.3 | Start date: INCLUSIVE; End date: INCLUSIVE | `eachDayOfInterval` is inclusive on both ends; Supabase queries use `gte` / `lte` (inclusive) | **MATCH** | [useInventory.ts](src/hooks/useInventory.ts) `useInventoryCells`; [BulkUpdateDialog.tsx](src/components/inventory/BulkUpdateDialog.tsx) | — |
| 5.4 | Weekday mapping: `[Mon=0..Sun=6]` in PMS (UI sends `dayOfWeek - 1` shifted) | Uses `day.getDay()` (JS: `0=Sun, 1=Mon..6=Sat`); `DAYS_OF_WEEK` constant uses `{value: 1=Mo, 2=Tu, ..., 0=Su}` | **MISMATCH** | [BulkUpdateDialog.tsx](src/components/inventory/BulkUpdateDialog.tsx) `DAYS_OF_WEEK` + `selectedDays.includes(getDay(day))` | JS `getDay()` returns `0=Sun`, PMS uses `[Mon=0..Sun=6]`. The BulkUpdate uses JS native mapping which is `{0=Sun, 1=Mon..6=Sat}`. Days-of-week checkboxes: `{T2=1, T3=2.. CN=0}` — matches JS `getDay()` convention. **Internally consistent but different from PMS.** In CH context this is OK since it's self-contained; only matters if sending weekday data to PMS. |
| 5.5 | Max end date: today + 499 days | No max end date enforced in UI or bulk update | **MISSING** | — | Add validation: `endDate ≤ today + 499 days` |

## 6. Mapping Usage (Channex ID Joins)

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 6.1 | Property: `properties.external_id` = Channex property UUID | `channex_mappings.channex_property_id` = Channex property UUID. `channex_mappings.id` used as `inventory_cells.property_id` | **MATCH** | [InventoryPage.tsx](src/pages/InventoryPage.tsx) mapping lookup lines 168-185 | — (different column name but correct mapping) |
| 6.2 | Room type: `rooms.external_id` = Channex room_type UUID | `room_types_mirror.provider_room_type_id` = Channex room_type UUID | **MATCH** | [channex-inventory-sync/index.ts](supabase/functions/channex-inventory-sync/index.ts) | — |
| 6.3 | Rate plan: `rate_plan_booking_source.external_id` = Channex rate_plan UUID (CRITICAL: NOT `rate_plans.external_id`) | `rate_plans_mirror.provider_rate_plan_id` = Channex rate_plan UUID | **MATCH** | [channex-inventory-sync/index.ts](supabase/functions/channex-inventory-sync/index.ts) | — |
| 6.4 | Grid join: by `room_type_channex_id` + `rate_plan_channex_id` | Grid join: by `provider_room_type_id` match between `room_types_mirror` and `rate_plans_mirror` | **MATCH** | [InventoryGrid.tsx](src/components/inventory/InventoryGrid.tsx) `roomRatePlans` filter | — |
| 6.5 | Channel matching: via `RatePlanOTA` → `BookingSource` relationship | Channel matching: **by name regex match** `ratePlan.rate_plan_name.match(/\(([^)]+)\)\s*$/)` | **MISMATCH** | [InventoryGrid.tsx](src/components/inventory/InventoryGrid.tsx) lines 313-320 | Fragile — relies on rate plan naming convention `"Standard (Agoda)"`. Should use `rate_plans_mirror.channels` array or a dedicated mapping. |
| 6.6 | Sync guard: `property.external_id` + `is_sync_enabled` + `ratePlan.shouldSyncToChannex()` | No sync guard checks. All cells marked `PENDING` are candidates for sync | **MISSING** | — | Add sync guard logic: check `channex_mappings` status, rate plan sync eligibility |

## 7. Canonical Data Shape

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 7.1 | `inventoryGrid[date][roomTypeId][ratePlanId] = { local, otas }` — nested by date → room → rate | Flat `InventoryCell[]` array, joined at render time via composite key `${room_type_id}_${rate_plan_id}_${channel_id}_${date}` | **MISMATCH** | [InventoryGrid.tsx](src/components/inventory/InventoryGrid.tsx) `cellMap` | Different data shape but functionally equivalent. The flat model is acceptable for Control Hub. |
| 7.2 | Availability rows separate from rate rows | Single cell model: availability + rate + restrictions in one row | **MISMATCH** | `inventory_cells` schema | Acceptable simplification. No fix needed. |
| 7.3 | `per_person` mode with occupancy options | Not implemented — no occupancy options concept | **MISSING** | No `occupancy_options` table or logic in CH | Out of scope for Phase 1. Document as gap. |

## 8. Error Handling

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 8.1 | Channex 429 → retry up to 3 times with `Retry-After` | No retry logic in any edge function | **MISSING** | All edge functions fail-fast | Add retry with exponential backoff for 429/5xx |
| 8.2 | Two-phase: Channex failure → inventory unchanged | Local write happens first; Channex sync is async | **MISMATCH** | See 2.3 | Document as design decision |
| 8.3 | Rate limit: 20 req/min global, 10 req/min per property | No rate limiting | **MISSING** | — | Add rate limiter for outbound Channex calls |
| 8.4 | Payload chunking: 50 items per chunk, 2s delay | No chunking — all cells in single upsert (batched 500 for DB) | **PARTIAL** | [channex-inventory-sync/index.ts](supabase/functions/channex-inventory-sync/index.ts) batches DB writes at 500 | DB batching exists but no Channex API chunking for outbound |
| 8.5 | Retry mechanism: `POST /inventory/history/{id}/retry-sync` | `useRetryFailedSyncs` resets `FAILED` cells to `PENDING` | **PARTIAL** | [useInventory.ts](src/hooks/useInventory.ts) lines 825-857 | Resets status but no actual re-push to Channex (same gap as 2.1) |

## 9. Retry / Idempotency

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 9.1 | `request_id` UUID as idempotency key. Same ID → 409 "already processed" | `idempotencyKey` stored in `inventory_cells.idempotency_key` and `inventory_sync_jobs.idempotency_key`. `inventory-batch-update` checks `inventory_batches` for duplicate `batch_id` | **PARTIAL** | [inventory-batch-update/index.ts](supabase/functions/inventory-batch-update/index.ts); [useInventory.ts](src/hooks/useInventory.ts) | Edge function has idempotency check via `inventory_batches`. But `useBulkUpdateInventory` (browser-side) uses `bulk_${Date.now()}` which is NOT true idempotency (timestamp-based) |
| 9.2 | Idempotency key: tenant_id + property_id + payload content hash | Key is `crypto.randomUUID()` or `Date.now()` — not content-based | **MISMATCH** | [BulkUpdateDialog.tsx](src/components/inventory/BulkUpdateDialog.tsx) `useLegacyBulkUpdateInventory` uses `crypto.randomUUID()` | Implement deterministic key: `hash(propertyId + dateRange + payloadHash)` |
| 9.3 | Optimistic locking: version check before write | `useBulkUpdateInventory` checks `cell.version` before update. Conflicts reported as `failedCells` | **MATCH** | [useInventory.ts](src/hooks/useInventory.ts) lines 410-420 | — |
| 9.4 | Crash recovery: `PENDING` status → mark `FAILED`, proceed | No crash recovery for in-flight operations | **MISSING** | — | Add periodic check for stale `PENDING` cells (> 5 min old) |

## 10. Audit Logging

| # | Spec Behavior (PMS SOT) | Control Hub Behavior | Status | Evidence | Fix Needed |
|---|------------------------|---------------------|--------|----------|------------|
| 10.1 | Full audit trail: `rate_change_logs` + `rate_change_staged_items` with before/after values, delta, actor | `inventory_logs` table with `action`, `after_data` JSON. No before/after diff, no delta calculation | **MISMATCH** | [useInventory.ts](src/hooks/useInventory.ts) `inventory_logs` insert | Add `before_data` capture. Compute delta for rate changes. Include actor (`updated_by` from auth). |
| 10.2 | Per-field staged items with `before_value`, `after_value`, `delta_value`, `delta_percent` | Only aggregate log entry: `{ updated_count, failed_count }` | **MISSING** | — | Add per-field change tracking in audit log |
| 10.3 | Request-level log with status transitions: PENDING → COMMITTED / FAILED | `inventory_batches` in edge function tracks status | **PARTIAL** | [inventory-batch-update/index.ts](supabase/functions/inventory-batch-update/index.ts) | Exists in edge function but not in browser-side `useBulkUpdateInventory` |

---

## Summary

| Category | MATCH | MISMATCH | MISSING | PARTIAL | Total |
|----------|-------|----------|---------|---------|-------|
| Inventory Fetch | 2 | 3 | 1 | 0 | 6 |
| Inventory Write | 0 | 2 | 3 | 0 | 5 |
| Rate Fetch | 2 | 2 | 1 | 0 | 5 |
| Rate Write | 0 | 3 | 5 | 0 | 8 |
| Date Normalization | 2 | 2 | 1 | 0 | 5 |
| Mapping Usage | 4 | 1 | 1 | 0 | 6 |
| Canonical Shape | 0 | 2 | 1 | 0 | 3 |
| Error Handling | 0 | 1 | 3 | 1 | 5 |
| Retry / Idempotency | 1 | 1 | 1 | 1 | 4 |
| Audit Logging | 0 | 1 | 1 | 1 | 3 |
| **TOTAL** | **11** | **18** | **18** | **3** | **50** |

**Critical gaps requiring immediate fix:**
1. No outbound Channex push (rates + availability) — §2.1, §4.7
2. Bulk percent rate calculation not implemented — §4.3
3. Missing base rate resolution fallback — §4.4
4. UTC timezone instead of Asia/Ho_Chi_Minh — §5.1
5. No retry / rate limiting for Channex API — §8.1, §8.3
