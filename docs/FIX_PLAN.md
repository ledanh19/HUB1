# FIX_PLAN.md
## Phase 3 — Minimal Patches for SOT Alignment
### Date: 2026-02-18

---

## Scope

Only Inventory (availability) + Rate read/write.
Patches are **additive** and **non-breaking**.
Changes must not rewrite existing modules.

---

## Patch A — Date & Timezone Normalization

### A1. Create `src/lib/dateHelpers.ts`

New helper module for PMS-aligned date handling:

```typescript
// Canonical date helpers aligned to PMS SOT (Asia/Ho_Chi_Minh, inclusive ranges)
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const PMS_TIMEZONE = 'Asia/Ho_Chi_Minh';
const MAX_FUTURE_DAYS = 499;

export function getTodayVN(): Date {
  return toZonedTime(new Date(), PMS_TIMEZONE);
}

export function formatDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function normalizeDateRange(start: Date, end: Date): { start: string; end: string } {
  const today = getTodayVN();
  const maxEnd = new Date(today);
  maxEnd.setDate(maxEnd.getDate() + MAX_FUTURE_DAYS);
  
  const clampedStart = start < today ? today : start;
  const clampedEnd = end > maxEnd ? maxEnd : end;
  
  return {
    start: formatDateISO(clampedStart),
    end: formatDateISO(clampedEnd),
  };
}

export function generateIdempotencyKey(
  propertyId: string,
  dateRange: string,
  payloadHash: string
): string {
  return `${propertyId}:${dateRange}:${payloadHash}`;
}

export async function hashPayload(payload: unknown): Promise<string> {
  const text = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
```

**Impact:** New file. No existing code changes. Consumers opt-in.

### A2. Install `date-fns-tz` dependency

```bash
bun add date-fns-tz
```

---

## Patch B — Currency Formatting Helper

### B1. Create `src/lib/currencyHelpers.ts`

```typescript
// PMS-aligned currency formatting for Channex payloads
const ZERO_DECIMAL_CURRENCIES = ['VND', 'JPY', 'KRW'];

export function formatCurrencyForChannex(amount: number, currency: string = 'VND'): number {
  if (ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
    return Math.round(amount);
  }
  return Math.round(amount * 100) / 100;
}

export function formatRateDisplay(rate: number | null | undefined, currency: string = 'VND'): string {
  if (rate === null || rate === undefined) return '—';
  
  if (ZERO_DECIMAL_CURRENCIES.includes(currency.toUpperCase())) {
    if (rate >= 1_000_000) {
      const millions = rate / 1_000_000;
      return new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(millions) + ' Tr';
    }
    return new Intl.NumberFormat('vi-VN').format(Math.round(rate));
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(rate);
}
```

**Impact:** New file. Replaces inline `formatRate()` in InventoryGrid.

---

## Patch C — Rate Calculation Engine

### C1. Create `src/lib/rateCalculator.ts`

Implements PMS-identical rate type calculations:

```typescript
export type RateChangeType = 'exact' | 'increase_amount' | 'decrease_amount' | 'increase_percent' | 'decrease_percent';

export interface RateCalculationResult {
  afterValue: number | null;
  skipped: boolean;
  skipReason?: string;
}

export function calculateRate(
  baseRate: number | null | undefined,
  changeType: RateChangeType,
  value: number
): RateCalculationResult {
  // Percent mode guard: skip if base rate is null/0/non-numeric (PMS §8.1)
  if (
    (changeType === 'increase_percent' || changeType === 'decrease_percent') &&
    (baseRate === null || baseRate === undefined || baseRate === 0 || isNaN(baseRate))
  ) {
    return { afterValue: null, skipped: true, skipReason: 'BULK_PERCENT_SKIP_NO_BASE' };
  }

  const base = baseRate ?? 0;

  switch (changeType) {
    case 'exact':
      return { afterValue: value, skipped: false };
    case 'increase_amount':
      return { afterValue: base + value, skipped: false };
    case 'decrease_amount':
      return { afterValue: Math.max(0, base - value), skipped: false };
    case 'increase_percent':
      return { afterValue: Math.round(base * (1 + value / 100)), skipped: false };
    case 'decrease_percent':
      return { afterValue: Math.round(base * (1 - value / 100)), skipped: false };
    default:
      return { afterValue: value, skipped: false };
  }
}

export function resolveBaseRate(
  cellRate: number | null | undefined,
  mirrorBaseRate: number | null | undefined
): number | null {
  // Priority: inventory cell rate → rate plan base rate (from mirror)
  // Note: PMS also has history table (rateplan_history) which CH doesn't have
  if (cellRate !== null && cellRate !== undefined && cellRate > 0) return cellRate;
  if (mirrorBaseRate !== null && mirrorBaseRate !== undefined && mirrorBaseRate > 0) return mirrorBaseRate;
  return null;
}
```

**Impact:** New file. Used by Patch D and Patch E.

---

## Patch D — Fix BulkUpdateDialog Rate Calculation

### D1. Add `increase_amount` and `decrease_amount` to rate change types

**File:** `src/components/inventory/BulkUpdateDialog.tsx`

**Change:** Extend `rateChangeType` union from `'set' | 'increase' | 'decrease'` to `'set' | 'increase_amount' | 'decrease_amount' | 'increase_percent' | 'decrease_percent'`

**Change:** Add corresponding SelectItem entries in the UI

### D2. Implement actual rate computation in `handleSave()`

**Current problem:** `handleSave()` passes `rate_change_type` and `rate_change_value` as metadata, but `useLegacyBulkUpdateInventory` never computes the actual new rate — it passes the metadata through to the upsert, which doesn't understand those fields.

**Fix:** Before calling `bulkUpdate.mutateAsync()`, resolve base rates and compute after-values:

1. For `'set'` (exact): `updates.rate = value` (current behavior, OK)
2. For percent/amount types:
   - Query existing `inventory_cells` for affected rows to get current rates
   - Fall back to `rate_plans_mirror.base_rate`
   - Apply `calculateRate()` per cell
   - Convert to individual cell updates with computed rates

### D3. Add hard limit guard (20,000 cells)

Before preview step, check: `affectedCells > 20_000 → show error, block submit`

---

## Patch E — Fix Grid Join Logic

### E1. Remove incorrect fallback join in InventoryGrid

**File:** `src/components/inventory/InventoryGrid.tsx`

**Current code:**
```typescript
const roomRatePlans = ratePlans.filter(rp =>
  rp.provider_room_type_id === roomType.provider_room_type_id || rp.provider_room_type_id === roomType.id
);
```

**Fix:** Remove `|| rp.provider_room_type_id === roomType.id`

### E2. Add "Unmapped" badge for missing cells

When `getCell()` returns `undefined` and the rate plan has a valid `provider_rate_plan_id`, show the base rate from mirror. When mapping is missing, show "Unmapped" badge.

### E3. Use `rate_plans_mirror.channels` for channel detection

Replace regex-based channel extraction with proper `channels` array lookup.

### E4. Display base rate fallback

When cell rate is null, display `rate_plans_mirror.base_rate` in muted style with "(base)" label.

---

## Patch F — Audit Log Enhancement

### F1. Capture before/after values in bulk update

**File:** `src/hooks/useInventory.ts` — `useBulkUpdateInventory`

Before updating each cell, record the before-state. After update, log both to `inventory_logs`:

```typescript
await supabase.from('inventory_logs').insert({
  property_id: propertyId,
  action: 'bulk_update',
  before_data: { /* per-cell before values */ },
  after_data: { /* per-cell after values */ },
  batch_id: idempotencyKey,
  actor_id: user?.id,
  change_summary: {
    rate_changes: number,
    avl_changes: number,
    restriction_changes: number,
    skipped_cells: number,
  }
});
```

### F2. Add actor tracking

Pass `user.id` through from `useAuth()` and set `updated_by` on all cell writes.

---

## Patch G — Idempotency Key Improvement

### G1. Generate deterministic idempotency key

**File:** `src/hooks/useInventory.ts`

Replace `bulk_${Date.now()}` with:
```typescript
const key = await generateIdempotencyKey(
  propertyId,
  `${formatDateISO(startDate)}_${formatDateISO(endDate)}`,
  await hashPayload(drafts)
);
```

### G2. Add client-side dedup guard

Before executing bulk update, check if the same idempotency key was recently used (store last 10 keys in session storage). If duplicate → warn user.

---

## Patch H — Sync Guard Checks

### H1. Create `src/lib/syncGuards.ts`

```typescript
export interface SyncEligibility {
  canSync: boolean;
  reason?: string;
}

export function checkPropertySyncEligibility(
  channexPropertyId: string | null | undefined,
  mappingStatus: string | null
): SyncEligibility {
  if (!channexPropertyId) return { canSync: false, reason: 'No Channex property ID' };
  if (mappingStatus !== 'ACTIVE') return { canSync: false, reason: `Mapping status: ${mappingStatus}` };
  return { canSync: true };
}

export function checkRatePlanSyncEligibility(
  providerRatePlanId: string | null | undefined
): SyncEligibility {
  if (!providerRatePlanId) return { canSync: false, reason: 'No Channex rate plan ID' };
  return { canSync: true };
}
```

---

## Implementation Priority

| Priority | Patch | Effort | Impact |
|----------|-------|--------|--------|
| P0 — Critical | C (Rate Calculator) | S | Fixes broken percent rate calculation |
| P0 — Critical | D (BulkUpdate Fix) | M | Makes bulk update actually work for % changes |
| P0 — Critical | E1 (Grid Join Fix) | XS | Prevents wrong room-type→rate-plan association |
| P1 — High | A (Date Helpers) | S | Timezone correctness |
| P1 — High | B (Currency) | S | Correct Channex payload formatting |
| P1 — High | E2-E4 (Grid Display) | M | Unmapped badge + base rate fallback |
| P2 — Medium | F (Audit Log) | M | Before/after tracking |
| P2 — Medium | G (Idempotency) | S | Prevent double-apply |
| P3 — Low | H (Sync Guards) | S | Pre-check before sync attempt |

**Estimated total effort:** 2-3 days for P0+P1, 1 additional day for P2+P3.

---

## Patch Dependency Graph

```
A (Date Helpers) ──────────┐
                           │
B (Currency) ──────────────┤
                           ├─→ D (BulkUpdate Fix)
C (Rate Calculator) ───────┘
                           
E (Grid Fixes) ─── standalone
F (Audit Log) ─── standalone
G (Idempotency) ─── depends on A
H (Sync Guards) ─── standalone
```

---

*All patches are additive. No existing function signatures change. New files only, plus minimal edits to BulkUpdateDialog.tsx, InventoryGrid.tsx, and useInventory.ts.*
