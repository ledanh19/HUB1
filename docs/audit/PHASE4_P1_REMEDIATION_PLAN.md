# PHASE 4 — P1 REMEDIATION PLAN FOR DEAD FINANCE FIELDS

**Date:** 2026-03-08  
**Status:** PLAN ONLY — NOT IMPLEMENTED  
**Scope:** host_payables dead fields, SettlementListDialog stale reads, service settlement stats gap

---

## 1. HOST PAYABLES REMEDIATION

### 1.1 Current State — Dead Fields

| Field | Table | DB Value (all 424 rows) | Active Write Path? | Used by UI? |
|-------|-------|------------------------|-------------------|-------------|
| `paid_amount` | host_payables | **Always 0** | ❌ `useCreateBatchPayment` writes it but batch payment flow is rarely used; main settlement flow never touches it | Yes — `useHostPayablesEnhanced` reads it directly |
| `applied_deposit_amount` | host_payables | **Always 0** | ❌ `useHostDeposits` has code to write it but deposit-apply flow writes to `host_settlement_apply_events`, not here | Yes — `useHostPayablesEnhanced` reads it directly |
| `applied_prepaid_amount` | host_payables | **Always 0** | ❌ No active write path | Yes — `useHostPayablesEnhanced` reads it directly |
| `status` | host_payables | **Always PENDING** | ❌ `recomputePayableStatus` exists in `useHostPayableSync.ts` but is never called from main flows | Yes — filter, badge, aging |

### 1.2 Current Read Paths (Broken)

| File | What it reads | How it uses dead fields | Impact |
|------|--------------|------------------------|--------|
| `src/hooks/useHostPayablesEnhanced.ts:188-192` | `p.paid_amount`, `p.applied_deposit_amount`, `p.applied_prepaid_amount` | Computes `remaining_amount = amount - paid - deposit - prepaid` → always equals `amount` because all deductions are 0 | **CRITICAL** — All remaining amounts wrong, all statuses wrong |
| `src/pages/HostPayablesPage.tsx:214` | `.select("..., paid_amount, applied_deposit_amount, applied_prepaid_amount")` | Used to compute remaining in aging/summary | **CRITICAL** — Same as above |
| `src/pages/HostPayableDetailPage.tsx:59` | `.select("*, partners(partner_name)")` → reads all fields including dead ones | Displays paid_amount, remaining on detail page | **HIGH** — Shows 0 paid for everything |
| `src/hooks/useHostPayableSync.ts:88` | Reads `paid_amount, applied_deposit_amount, applied_prepaid_amount, status` | Guards against deleting payables that have payments. Since fields are always 0, guard is ineffective | **MEDIUM** — Could delete payable with actual payments |
| `src/hooks/useHostPayableSync.ts:203` | Checks `paidAmount === 0 && appliedDeposit === 0 && appliedPrepaid === 0` | Deletion guard — always true because fields are dead | **MEDIUM** |

### 1.3 Decision: Option B — Read-Time Derivation

**Recommendation: Option B** — Keep `host_payables` as a base row (booking→partner→amount mapping). Derive all payment truth at read time.

**Rationale:**
- The system already successfully uses read-time derivation for settlements (via `useSettlementPaymentStats`)
- Fixing write paths across batch payments, deposits, prepaids, and settlement flows is fragile and creates N write paths to maintain
- Read-time derivation is already the architectural pattern established in Phase 3 audit
- The base `amount` field in `host_payables` (total payable per partner per booking) IS valid and maintained by `useHostPayableSync`

### 1.4 Canonical Formulas for Host Payables

#### Source of Truth Inputs

| Metric | SOT Table | Query |
|--------|-----------|-------|
| Total payable amount | `host_payables.amount` | Direct read — this IS maintained |
| Paid amount (direct) | `host_payments` | `SUM(amount) WHERE payable_id = X` |
| Paid amount (batch) | `host_payment_batch_items` | `SUM(amount) WHERE payable_id = X` |
| Applied deposits | `host_deposit_applications` | `SUM(applied_amount) WHERE applied_to_payable_id = X` |
| Applied prepaids | `host_prepaid_applications` | `SUM(applied_amount) WHERE applied_to_payable_id = X` |

#### Canonical Formulas

```
paid_amount = SUM(host_payments.amount WHERE payable_id = X)
            + SUM(host_payment_batch_items.amount WHERE payable_id = X)

applied_deposit = SUM(host_deposit_applications.applied_amount WHERE applied_to_payable_id = X)

applied_prepaid = SUM(host_prepaid_applications.applied_amount WHERE applied_to_payable_id = X)

remaining_amount = host_payables.amount - paid_amount - applied_deposit - applied_prepaid

status = CASE
  WHEN remaining_amount <= 0 THEN 'PAID'
  WHEN paid_amount + applied_deposit + applied_prepaid > 0 THEN 'PARTIAL'
  ELSE 'PENDING'
END
```

### 1.5 Files to Patch

| File | Change Required | Risk |
|------|----------------|------|
| `src/hooks/useHostPayablesEnhanced.ts` | Replace lines 188-192: instead of reading `p.paid_amount` etc., run parallel queries against `host_payments`, `host_payment_batch_items`, `host_deposit_applications`, `host_prepaid_applications` grouped by payable_id, then compute at map time | **HIGH** — Core data hook, must not break existing consumers |
| `src/pages/HostPayablesPage.tsx` | Remove direct reads of `paid_amount, applied_deposit_amount, applied_prepaid_amount` from the select; use enhanced hook's computed values instead | **MEDIUM** |
| `src/pages/HostPayableDetailPage.tsx` | Add read-time computation for the detail view — fetch from payment/application tables for the single payable | **MEDIUM** |
| `src/hooks/useHostPayableSync.ts:203` | Fix deletion guard: query `host_payments` + `host_payment_batch_items` for actual payments before allowing delete | **HIGH** — Safety critical |

### 1.6 SQL/View Changes

**No SQL migration required.** All fixes are FE read-time computation changes.

**Optional future optimization:** Create a Postgres VIEW `v_host_payable_computed` that joins the application/payment tables and returns computed fields. This would simplify FE queries but is NOT required for the fix.

### 1.7 Risk Analysis

| Risk | Mitigation |
|------|-----------|
| Performance: 4 additional queries in useHostPayablesEnhanced | Use `.in("payable_id", payableIds)` bulk queries (already the pattern used for segments/charges). Single round-trip per table, not per payable |
| 1000-row limit on bulk queries | Already flagged in Phase 1. Paginate or use RPC for large datasets. Not a new risk |
| Breaking existing consumers of EnhancedPayable interface | Keep the same interface shape — consumers see correct numbers instead of zeros. Non-breaking |
| Race condition during batch payment | Read-time derivation eliminates this — no stale snapshot to race against |

---

## 2. SETTLEMENT LIST DIALOG REMEDIATION

### 2.1 Current Broken Reads

**File:** `src/components/host-payables/SettlementListDialog.tsx`

| Line | What it reads | Problem |
|------|--------------|---------|
| L21 | `total_paid_amount: number` in Settlement interface | Stores the dead DB field value (always 0) |
| L188 | `canVoid`: checks `s.total_paid_amount || 0) <= 0` | **Always true** because field is always 0 → allows voiding PAID settlements |
| L260 | Displays `formatCurrency(s.total_paid_amount)` as "Đã thanh toán" | **Always shows 0₫** |
| L316 | Displays `formatCurrency(selectedSettlement.total_paid_amount)` as "Đã chi trả" | **Always shows 0₫** |
| L324 | `getPaymentStatusBadge(selectedSettlement.total_paid_amount, ...)` | **Always shows "Chưa TT"** |

### 2.2 Canonical Paid-Source Resolver

The correct pattern already exists in `useSettlementPaymentStats.ts:useHostSettlementPaymentStats`. The SettlementListDialog must use computed stats instead of stored fields.

**Proposed approach:**

```
For each settlement in the list:
  1. Fetch cash_outs WHERE settlement_type = 'HOST' AND settlement_id = X → SUM(amount)
  2. Fetch cashflow_entries WHERE source_type IN HOST_SETTLEMENT_SOURCE_TYPES AND direction = 'OUT' AND source_id = X → SUM(amount)  
  3. paid_amount = MAX(cash_outs_sum, cashflow_sum)  // dual-write safety
  4. remaining = MAX(0, |NET| - paid_amount)
  5. status = computePaymentStatus(paid_amount, NET)
```

**Implementation option:** Use `useHostSettlementsPaymentStats(settlementIds)` batch hook (already exists at L107-136 in `useSettlementPaymentStats.ts`) — BUT this hook currently only queries `cash_outs`, not `cashflow_entries`. Must be upgraded.

### 2.3 Corrected canVoid() Rule

**Current (BROKEN):**
```ts
const canVoid = (s: Settlement) => {
  if (s.status === "DRAFT") return true;
  if (s.status === "SETTLED" && (s.total_paid_amount || 0) <= 0) return true;  // ← reads dead field
  return false;
};
```

**Proposed (CORRECT):**
```ts
const canVoid = (s: Settlement, computedPaidAmount: number) => {
  if (s.status === "DRAFT") return true;
  if (s.status === "SETTLED" && computedPaidAmount <= 0) return true;
  return false;
};
```

Where `computedPaidAmount` comes from the batch payment stats hook, NOT from the settlement row.

**Defense-in-depth note:** The RPC `void_settlement_secure` already has server-side guards checking actual `cashflow_entries` before allowing void. So even if the UI check fails, the RPC blocks it. But the UI should still show the correct state.

### 2.4 Files to Patch

| File | Change |
|------|--------|
| `src/components/host-payables/SettlementListDialog.tsx` | Import `useHostSettlementsPaymentStats`; pass settlement IDs; replace `s.total_paid_amount` with computed value from stats map; update `canVoid` to use computed paid |
| `src/hooks/useSettlementPaymentStats.ts:107-136` | Upgrade `useHostSettlementsPaymentStats` to also query `cashflow_entries` (currently only queries `cash_outs`). Apply `computePaidSourceInfo(coPaid, cfPaid)` per settlement |

### 2.5 Void Mutation Safety

**Current void mutation (L124-183)** bypasses the RPC `void_settlement_secure` and does manual table updates. This is a **separate risk** from the dead field issue but should be noted:

- It does NOT check `cashflow_entries` before voiding
- It does NOT check accounting period lock
- It does NOT use the secure RPC

**Fix direction (separate ticket):** Replace the manual void mutation with a call to `void_settlement_secure` RPC. Out of scope for this dead-field remediation.

---

## 3. SERVICE SETTLEMENT PAYMENT STATS REMEDIATION

### 3.1 Current Broken Logic

**File:** `src/hooks/useSettlementPaymentStats.ts:141-187`

**Problem:** `useServiceSettlementPaymentStats` only queries `cash_outs` for paid amount. It does NOT query `cashflow_entries`. This means:
- Payments recorded via `create_financial_transaction_secure` (which writes to `cashflow_entries`) are invisible
- `paid_source` is hardcoded to `"CASH_OUTS"` — no dual-write detection
- Service settlement `SV26037021` has 747,500 VND in cashflow but shows UNPAID

### 3.2 Canonical Formula

Must match host settlement pattern (L38-101):

```
cash_outs_paid = SUM(cash_outs.amount WHERE settlement_type = 'SERVICE' AND settlement_id = X)
cashflow_paid = SUM(cashflow_entries.amount WHERE source_type IN SERVICE_SETTLEMENT_SOURCE_TYPES AND direction = 'OUT' AND source_id = X)
paid_amount = MAX(cash_outs_paid, cashflow_paid)  // dual-write safety
remaining = MAX(0, |net_amount| - paid_amount)
status = computePaymentStatus(paid_amount, net_amount)
paid_source = computePaidSourceInfo(cash_outs_paid, cashflow_paid)
```

### 3.3 Affected Pages/Hooks

| File | How it uses service stats | Impact of fix |
|------|--------------------------|---------------|
| `src/hooks/useSettlementPaymentStats.ts` | Defines the hook | **Primary patch target** |
| `src/components/settlement/SettlementDetailDialog.tsx:128` | Uses `useServiceSettlementFullDetail` (separate hook, but may share stats) | Verify after fix |
| `src/hooks/useOutgoingPayments.ts:297` | `useServiceSettlementsForPayment` — fetches settlements for dropdown, may compute remaining | Verify after fix |
| `src/pages/ServicePayablesPage.tsx` | Uses `useServiceSettlements` for list view | Verify after fix |
| `src/pages/OutgoingPaymentsPage.tsx:165` | Uses service settlements for payment form | Verify after fix |
| `src/pages/PaymentRequestsPage.tsx:251` | Uses service settlements for form pre-fill | Verify after fix |

### 3.4 Files to Patch

| File | Change |
|------|--------|
| `src/hooks/useSettlementPaymentStats.ts:141-187` | Add parallel `cashflow_entries` query with `SERVICE_SETTLEMENT_SOURCE_TYPES`; use `computePaidSourceInfo()` for dual-write detection; remove hardcoded `paid_source: "CASH_OUTS"` |

### 3.5 Constants Already Available

From `src/constants/settlementPaymentSourceTypes.ts`:
- `SERVICE_SETTLEMENT_SOURCE_TYPES` — already defined
- `SERVICE_CASHOUT_SETTLEMENT_TYPE` — already imported in the hook

No new constants needed.

---

## 4. BATCH SETTLEMENT STATS HOOK GAP

### 4.1 Current State

`useHostSettlementsPaymentStats` (L107-136) is a batch version but it:
- Only queries `cash_outs` (no `cashflow_entries`)
- Returns a raw `Map<string, number>` cast as `any` — not proper `SettlementPaymentStats`
- Does NOT apply `computePaidSourceInfo`

### 4.2 Fix Direction

Upgrade to match the single-settlement pattern:
1. Query both `cash_outs` and `cashflow_entries` in parallel
2. Group by `settlement_id`
3. Apply `computePaidSourceInfo` per settlement
4. Return `Map<string, SettlementPaymentStats>`

This batch hook is used by `SettlementListDialog` (after the L21 fix) and `HostPayablesAgingPage`.

---

## 5. NON-BREAKING MIGRATION STRATEGY

### Phase A: Read-path fixes only (Zero DB changes)

| Step | Action | Risk | Rollback |
|------|--------|------|----------|
| A1 | Upgrade `useHostSettlementsPaymentStats` to query both sources | LOW — additive query | Revert hook file |
| A2 | Upgrade `useServiceSettlementPaymentStats` to query both sources | LOW — additive query | Revert hook file |
| A3 | Patch `SettlementListDialog` to use computed stats from A1 | MEDIUM — UI change | Revert component file |
| A4 | Patch `useHostPayablesEnhanced` to derive paid/deposit/prepaid at read time | HIGH — core data hook | Revert hook file |
| A5 | Patch `HostPayableDetailPage` to use derived values | MEDIUM | Revert page file |
| A6 | Fix `useHostPayableSync` deletion guard | HIGH — safety critical | Revert hook file |

### Phase B: Optional cleanup (Future)

| Step | Action | Risk |
|------|--------|------|
| B1 | Create `v_host_payable_computed` VIEW for performance | LOW |
| B2 | Add deprecation comments to dead stored fields | LOW |
| B3 | Backfill stored fields to match computed values (cosmetic only) | LOW — dead fields, no readers after Phase A |
| B4 | Replace void mutation with `void_settlement_secure` RPC call | MEDIUM — separate ticket |

---

## 6. TEST PLAN — GOLDEN SCENARIOS

### 6.1 Host Payables

| Scenario | Verification |
|----------|-------------|
| Payable with zero payments | `remaining = amount`, `status = PENDING` |
| Payable with 1 direct payment via `host_payments` | `paid_amount = payment.amount`, `remaining = amount - paid`, `status = PARTIAL or PAID` |
| Payable with batch payment via `host_payment_batch_items` | Same as above |
| Payable with deposit application | `applied_deposit > 0`, `remaining` reduced |
| Payable with prepaid application | `applied_prepaid > 0`, `remaining` reduced |
| Payable fully paid + fully applied | `remaining = 0`, `status = PAID` |
| Payable with no related records | `remaining = amount`, `status = PENDING` (same as current but now CORRECT) |

### 6.2 Settlement List Dialog

| Scenario | Verification |
|----------|-------------|
| SETTLED settlement with 0 payments | `canVoid = true`, paid shows 0₫ |
| SETTLED settlement with payments via cashflow | `canVoid = false`, paid shows correct amount |
| SETTLED settlement with payments via cash_outs only | `canVoid = false`, paid shows correct amount |
| SETTLED settlement with BOTH sources | Shows higher amount, `dual_paid_warning` if divergent |
| DRAFT settlement | `canVoid = true` regardless of payments |
| VOID settlement | Not voidable |

### 6.3 Service Settlement Stats

| Scenario | Verification |
|----------|-------------|
| Service settlement with cashflow payment only (SV26037021) | Shows PAID with 747,500 VND |
| Service settlement with cash_out only | Shows correct paid from cash_outs |
| Service settlement with both | Uses MAX, shows dual_paid_warning if needed |
| Service settlement UNPAID | Shows UNPAID correctly |

### 6.4 Regression Guard

| Check | Method |
|-------|--------|
| Dashboard revenue unchanged | Compare before/after — these fixes don't touch revenue |
| P&L unchanged | Same — these fixes only affect payable/settlement payment display |
| Settlement NET unchanged | NET formula is NOT affected — only paid/remaining display |
| Host settlement history unchanged | Uses `useSettlementPaymentStats` which is already correct for single-settlement view |

---

## 7. SUMMARY

| Component | Severity | Fix Type | Files | SQL? | Breaking? |
|-----------|----------|----------|-------|------|-----------|
| host_payables dead fields | **CRITICAL** | FE read-time derivation | 4 files | No | No |
| SettlementListDialog stale reads | **HIGH** | FE hook upgrade + component patch | 2 files | No | No |
| Service settlement stats gap | **HIGH** | FE hook upgrade | 1 file | No | No |
| Batch stats hook incomplete | **MEDIUM** | FE hook upgrade | 1 file | No | No |
| Void mutation bypass RPC | **MEDIUM** | Separate ticket | 1 file | No | No |

**Total files to patch:** 5 unique files  
**Total SQL migrations:** 0  
**Total new files:** 0  
**Breaking changes:** 0  
**Estimated risk:** LOW (all changes are read-path only, no write-path modifications)
