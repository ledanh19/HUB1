# Infrastructure Gaps — Inventory + Rate Setup SOT Alignment

> Document generated as part of PMS ↔ Control Hub SOT alignment.
> These gaps **cannot** be resolved with frontend-only patches and require backend / infrastructure changes.

---

## Summary

| # | Gap | Severity | PMS Ref | Effort |
|---|-----|----------|---------|--------|
| G1 | No outbound Channex push processor | **CRITICAL** | §5.6 | L |
| G2 | No `rateplan_history` table | HIGH | §6.9 | M |
| G3 | No per-person / occupancy-based pricing | HIGH | §6.3 | L |
| G4 | Edge function uses UTC instead of Asia/Ho_Chi_Minh | MEDIUM | §4.1 | S |
| G5 | No Channex API rate limiting / 429 retry | MEDIUM | §8.7 | M |
| G6 | Webhook returns 200 on unmapped property | LOW | §5.5 | S |
| G7 | No availability rule engine (BASE layer) | HIGH | §4.5 | L |
| G8 | No derived rate plan support | MEDIUM | §6.4 | M |
| G9 | No stop-sell ↔ availability cross-validation | LOW | §5.2 | S |
| G10 | Missing outbound sync retry with exponential backoff | MEDIUM | §8.8 | M |

**Severity legend:** CRITICAL = breaks core workflow, HIGH = missing PMS-equivalent feature, MEDIUM = degraded behavior, LOW = cosmetic / edge case

**Effort legend:** S = < 1 day, M = 1-3 days, L = 3+ days

---

## G1 — No Outbound Channex Push Processor

### Current State
`inventory_sync_jobs` rows are **created** by the UI (status=PENDING) but **no processor exists** to consume them and push changes to Channex via `POST /restrictions` or `POST /availability`.

### PMS Behavior (§5.6)
After any rate/restriction update, PMS queues a sync job and a background worker pushes the delta payload to Channex within seconds. It handles:
- Batching (max 500 date × room_type × rate_plan combos)
- Retry on 429/5xx with exponential backoff
- Status update (PENDING → SYNCED | FAILED)
- `sync_error` capture on failure

### Impact
**All** UI-initiated changes stay local — channels never receive updated rates/restrictions. The "Syncing to channels..." toast is misleading.

### Recommended Fix
Create a Supabase Edge Function or cron-triggered function:
1. Poll `inventory_sync_jobs WHERE status = 'PENDING'` ordered by `created_at`
2. For each job, group `cell_ids` by room_type + rate_plan
3. Build Channex `/restrictions` payload per PMS §5.6 format
4. POST to Channex with proper auth headers
5. Update job status + cells' `sync_status`
6. Handle 429 with retry-after header respect

---

## G2 — No `rateplan_history` Table

### Current State
Rate plan changes are only captured in `inventory_logs.after_data` as a JSON blob. No structured history table exists for rate plans.

### PMS Behavior (§6.9)
PMS maintains `rateplan_history` with columns: `rate_plan_id`, `changed_field`, `old_value`, `new_value`, `changed_by`, `changed_at`, enabling per-field audit trail and rollback.

### Impact
Cannot reconstruct the timeline of rate changes for a specific rate plan. Audit trail is limited to batch-level JSON blobs.

### Recommended Fix
Create migration:
```sql
CREATE TABLE rateplan_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id UUID REFERENCES rate_plans_mirror(id),
  property_id UUID NOT NULL,
  changed_field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ DEFAULT now(),
  batch_id TEXT
);
CREATE INDEX idx_rph_rateplan ON rateplan_history(rate_plan_id, changed_at DESC);
```

---

## G3 — No Per-Person / Occupancy-Based Pricing

### Current State
`inventory_cells.rate` stores a single numeric value. The UI treats this as the room rate. No `per_person` flag, no `occupancy_options`, no `max_persons` field.

### PMS Behavior (§6.3)
PMS supports:
- `rate_mode: 'per_room' | 'per_person'`
- `occupancy_options: { adults: number; children: number; rate: number }[]`
- Channex `/restrictions` accepts `rate` as either a flat number or a nested occupancy array

### Impact
Properties using per-person pricing cannot set correct rates via the Control Hub. All rates default to per-room flat amount.

### Recommended Fix
1. Add `rate_mode` and `occupancy_rates` JSONB column to `inventory_cells` (or a separate `occupancy_rates` table)
2. Update BulkUpdateDialog to render occupancy rate inputs when `rate_mode = 'per_person'`
3. Update Channex push payload to use occupancy array format

---

## G4 — Edge Function Uses UTC Instead of Asia/Ho_Chi_Minh

### Current State
`channex-inventory-sync/index.ts` computes "today" as:
```typescript
const today = new Date().toISOString().split('T')[0]; // UTC
```
This means at 00:00–06:59 UTC (07:00–13:59 VN), the sync range starts one day behind VN local time.

### PMS Behavior (§4.1)
PMS normalizes all dates to `Asia/Ho_Chi_Minh` (UTC+7). "Today" = VN local date.

### Impact
Early-morning syncs may include stale yesterday data or miss today's data for the first 7 hours of each VN day.

### Recommended Fix
In edge functions, replace UTC date computation with:
```typescript
import { formatInTimeZone } from 'date-fns-tz';
const today = formatInTimeZone(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
```
The `dateHelpers.ts` module created in this sprint already provides `getTodayVN()`.

---

## G5 — No Channex API Rate Limiting / 429 Retry

### Current State
Edge functions make Channex API calls with no rate limit awareness. If Channex returns HTTP 429, the call fails immediately.

### PMS Behavior (§8.7)
PMS implements:
- Token bucket rate limiter (max 60 req/min per property)
- On 429: read `Retry-After` header, wait, retry up to 3 times
- On 5xx: exponential backoff (1s, 2s, 4s)

### Impact
Bulk operations on large properties risk hitting Channex rate limits with no recovery, causing partial sync failures.

### Recommended Fix
Create a shared `channexClient.ts` utility for edge functions with built-in retry:
```typescript
async function channexFetch(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (res.status >= 500 && attempt < maxRetries) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      continue;
    }
    return res;
  }
  throw new Error('Channex API: max retries exceeded');
}
```

---

## G6 — Webhook Returns 200 on Unmapped Property

### Current State
`channex-ari-webhook/index.ts` returns `200 OK` when:
- HMAC verification passes
- But the property ID from the payload has no matching `channex_mappings` row

This means Channex considers the webhook delivered, but no data is ingested.

### PMS Behavior (§5.5)
PMS returns 422 with body `{ error: 'unmapped_property' }` so operators can detect the misconfiguration.

### Impact
Silent data loss for properties not yet mapped. Channex won't retry, and there's no alert.

### Recommended Fix
Return `422` instead of `200` when property lookup fails, and log the event:
```typescript
if (!mapping) {
  console.error(`Unmapped property: ${webhookPropertyId}`);
  return new Response(
    JSON.stringify({ error: 'unmapped_property', property_id: webhookPropertyId }),
    { status: 422, headers: { 'Content-Type': 'application/json' } }
  );
}
```

---

## G7 — No Availability Rule Engine (BASE Layer)

### Current State
`availability_rules` table exists and the UI can create rules, but there is **no engine** that applies these rules to generate BASE-layer `inventory_cells` rows. Rules are stored but never executed.

### PMS Behavior (§4.5)
PMS rule engine runs on a schedule (every 15 minutes) and:
1. Reads all active rules ordered by priority
2. For each rule, expands the date range × room type × rate plan
3. Generates/updates BASE-layer cells with computed availability
4. Marks `applied_rule_id` on each affected cell
5. OVERRIDE-layer cells take precedence during read

### Impact
"Set default availability" workflows don't actually affect inventory. Operators must manually set each date.

### Recommended Fix
Create a Supabase pg_cron job or edge function that evaluates `availability_rules` and populates BASE-layer inventory_cells rows.

---

## G8 — No Derived Rate Plan Support

### Current State
Each rate plan is treated independently. There is no concept of "this rate plan = base rate plan ± X%".

### PMS Behavior (§6.4)
PMS supports derived rate plans:
- `parent_rate_plan_id` references the base rate plan
- `derivation_type: 'percent' | 'amount'`
- `derivation_value: number`
- When parent rate changes, derived plans auto-recalculate

### Impact
Properties with related rate plans (e.g., non-refundable = standard - 10%) must update each plan independently, risking inconsistency.

### Recommended Fix
1. Add `parent_rate_plan_id`, `derivation_type`, `derivation_value` to `rate_plans_mirror`
2. Create a trigger/function that cascades rate changes from parent to derived plans
3. Update the UI to display derivation relationship

---

## G9 — No Stop-Sell ↔ Availability Cross-Validation

### Current State
`stop_sell` and `availability` are independent fields. Setting `stop_sell = true` does not validate or warn about availability state.

### PMS Behavior (§5.2)
PMS enforces:
- If `stop_sell = true` and `availability > 0`, show warning "Room available but stopped from sale"
- If `availability = 0`, auto-suggest `stop_sell = true`

### Impact
Operators may have inconsistent state (stopped but available, or sold out but not stopped) without visual feedback.

### Recommended Fix
Add client-side validation in InventoryGrid cell rendering:
- Yellow warning icon when `stop_sell = true && availability > 0`
- Suggest stop_sell toggle when availability drops to 0

---

## G10 — Missing Outbound Sync Retry with Exponential Backoff

### Current State
If an outbound sync attempt fails (once G1 is implemented), there's no retry mechanism. `inventory_sync_jobs` would stay in FAILED state.

### PMS Behavior (§8.8)
PMS implements:
- Max 5 retry attempts
- Exponential backoff: 30s, 60s, 120s, 240s, 480s
- After 5 failures: mark as DEAD_LETTER, alert ops team
- Manual retry available from admin UI

### Impact
Transient Channex API failures would permanently block sync.

### Recommended Fix
1. Add `retry_count`, `next_retry_at`, `max_retries` columns to `inventory_sync_jobs`
2. Processor checks `retry_count < max_retries` and computes `next_retry_at`
3. Failed jobs with retries exhausted → status = 'DEAD_LETTER'
4. Admin UI already has "Retry Failed" button via `useRetryFailedSyncs` hook

---

## Priority Recommendation

### Phase 1 (Must-have for production)
1. **G1** — Outbound push processor (without this, no changes reach channels)
2. **G4** — Timezone fix (quick win, prevents date drift)
3. **G5** — Rate limiting (prevents sync failures at scale)

### Phase 2 (Operational quality)
4. **G6** — Webhook 422 on unmapped (prevents silent data loss)
5. **G10** — Retry with backoff (resilience)
6. **G7** — Rule engine (enables automated availability management)

### Phase 3 (Feature parity)
7. **G2** — Rate plan history (audit compliance)
8. **G3** — Per-person pricing (feature gap)
9. **G8** — Derived rate plans (operational efficiency)
10. **G9** — Cross-validation warnings (UX improvement)
