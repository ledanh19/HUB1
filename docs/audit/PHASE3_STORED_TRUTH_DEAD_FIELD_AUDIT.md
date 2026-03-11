# PHASE 3 — STORED TRUTH / DEAD FIELD BLAST RADIUS AUDIT

## Date: 2026-03-08
## Auditor: Principal Engineer + Finance Systems Auditor

---

## A. EXECUTIVE SUMMARY

### Verdict: **3 DEAD FIELDS CONFIRMED, 2 PARTIALLY DEAD, 1 CRITICAL BLAST RADIUS**

The system contains stored finance fields that are NEVER updated by any write path. The UI has evolved to recompute around them, but several UI components STILL READ dead values. This creates inconsistency between pages that recompute and pages that read stored values directly.

---

## B. COMPLETE STORED FINANCE FIELD INVENTORY

### B1. `host_settlements` Table

| Field | Type | Intended Meaning | Written By | Updated on Payment? | Current Value | Verdict |
|-------|------|-----------------|-----------|-------------------|---------------|---------|
| `total_payable_amount` | numeric | Sum of segments + extras + surcharges | `HostSettlementPage.tsx` on DRAFT create | N/A (set once) | ✅ Correct at creation | **LIVE — Snapshot authority** |
| `total_host_collected` | numeric | Amount host collected on behalf | `HostSettlementPage.tsx` on DRAFT create | N/A (set once) | ✅ Correct at creation | **LIVE — Snapshot authority** |
| `total_deposits_applied` | numeric | Deposits offset at settlement | `HostSettlementPage.tsx` on DRAFT create | N/A (set once) | ✅ Correct at creation | **LIVE — Snapshot authority** |
| `total_prepaids_applied` | numeric | Prepaids offset at settlement | `HostSettlementPage.tsx` on DRAFT create | N/A (set once) | ✅ Correct at creation | **LIVE — Snapshot authority** |
| `total_booking_revenue` | numeric | Informational: booking revenue | `HostSettlementPage.tsx` on DRAFT create | N/A (set once) | ✅ Correct at creation | **LIVE — Display only** |
| `remaining_amount` | numeric | NET after offsets (snapshot) | `HostSettlementPage.tsx` + `recompute_host_settlement_remaining_snapshot` RPC | Via RPC only (legacy fix) | ✅ Correct (verified Phase 2) | **LIVE — Snapshot authority** |
| `total_paid_amount` | numeric | Sum of payments made | **NOBODY** | **NEVER** | **ALWAYS 0** (91/91) | **☠️ DEAD** |
| `status` | text | Settlement lifecycle | `finalize_settlement_secure` / `close_settlement_secure` / `void_settlement_secure` | Yes (lifecycle only) | ✅ Correct | **LIVE — Status machine** |

### B2. `service_settlements` Table

| Field | Type | Intended Meaning | Written By | Updated on Payment? | Current Value | Verdict |
|-------|------|-----------------|-----------|-------------------|---------------|---------|
| `net_amount` | numeric | NET to pay/receive | Settlement creation | N/A (set once) | ✅ Correct | **LIVE — SOT** |
| `net_direction` | text | PAY or RECEIVE | Settlement creation | N/A | ✅ Correct | **LIVE** |
| `total_sale_price` | numeric | Sum of service sale prices | Settlement creation | N/A | ✅ Correct | **LIVE** |
| `total_cost_price` | numeric | Sum of service cost prices | Settlement creation | N/A | ✅ Correct | **LIVE** |
| `partner_collected_amount` | numeric | Amount partner collected | Settlement creation | N/A | ✅ Correct | **LIVE** |
| `roomrise_collected_amount` | numeric | Amount Roomrise collected | Settlement creation | N/A | ✅ Correct | **LIVE** |
| `payment_status` | text | UNPAID/PARTIAL/PAID | **NOBODY** | **NEVER** | **ALWAYS 'UNPAID'** | **☠️ DEAD** |
| `total_paid` | numeric | Sum of payments made | **NOBODY** | **NEVER** | **ALWAYS 0** | **☠️ DEAD** |
| `paid_at` | timestamptz | When fully paid | **NOBODY** | **NEVER** | **ALWAYS NULL** | **☠️ DEAD** |
| `paid_by` | uuid | Who marked paid | **NOBODY** | **NEVER** | **ALWAYS NULL** | **☠️ DEAD** |

### B3. `host_payables` Table

| Field | Type | Intended Meaning | Written By | Updated? | Current Value | Verdict |
|-------|------|-----------------|-----------|----------|---------------|---------|
| `amount` | numeric | Total payable to host | `syncHostPayables()` | Yes, on segment change | ✅ Correct | **LIVE** |
| `paid_amount` | numeric | Amount actually paid | **Intended: cash_out creation** | **NEVER updated** | **ALWAYS 0** (0/424) | **☠️ DEAD** |
| `applied_deposit_amount` | numeric | Deposit offset | **Intended: deposit apply** | **NEVER updated** | **ALWAYS 0** (0/424) | **☠️ DEAD** |
| `applied_prepaid_amount` | numeric | Prepaid offset | **Intended: prepaid apply** | **NEVER updated** | **ALWAYS 0** (0/424) | **☠️ DEAD** |
| `status` | enum | PENDING/PARTIAL/PAID | `syncHostPayables()` / `recomputePayableStatus()` | Recomputed from dead fields above | **ALWAYS 'PENDING'** (424/424) | **☠️ EFFECTIVELY DEAD** |
| `due_date` | date | When payment is due | `syncHostPayables()` | Yes | ✅ Correct | **LIVE** |
| `collection_responsibility` | text | Who collects | `syncHostPayables()` | Yes | ✅ Correct | **LIVE** |

### B4. `ota_payouts` Table

| Field | Type | Intended Meaning | Written By | Updated? | Current Value | Verdict |
|-------|------|-----------------|-----------|----------|---------------|---------|
| `gross_amount` | numeric | Total booking amounts | `add_booking_to_payout_atomic` RPC | Yes, atomically | ✅ Correct | **LIVE — SOT** |
| `net_payout_amount` | numeric | Expected bank receipt | `create_ota_payout_deduction_atomic` | Yes, on deduction | ✅ Correct | **LIVE — SOT** |
| `deduction_total` | numeric | Sum of formal deductions | `create_ota_payout_deduction_atomic` | Yes, atomically | ✅ Correct | **LIVE — SOT** |
| `total_amount` | numeric | Received amount / legacy | Cash-in RPC | Yes | ✅ Correct | **LIVE** |
| `bank_fee_total` | numeric | Bank fees sum | Cash-in RPC | Yes | ✅ Correct | **LIVE** |
| `adjustment_total` | numeric | Adjustment sum | Cash-in RPC | Yes | ✅ Correct | **LIVE** |
| `status` | enum | PENDING/PARTIAL/RECEIVED/VOID | Cash-in RPC / void RPC | Yes | ✅ Correct | **LIVE** |
| `is_reconciled` | boolean | Reconciliation complete | Manual update | Yes | ✅ Correct | **LIVE** |

### B5. `payment_requests` Table

| Field | Type | Intended Meaning | Written By | Updated? | Verdict |
|-------|------|-----------------|-----------|----------|---------|
| `proposed_amount` | numeric | Requested amount | User input | N/A | **LIVE** |
| `source_amount` | numeric | Reference amount | User input | N/A | **LIVE** |
| `status` | text | PENDING/APPROVED/PAID/etc | Approval flow + immutability trigger | Yes | **LIVE** |

---

## C. BLAST RADIUS TABLE — DEAD FIELDS

### C1. `host_settlements.total_paid_amount` ☠️

| Aspect | Detail |
|--------|--------|
| **DB Value** | Always 0 (91/91 settlements) |
| **Who should write it** | Payment creation (cash_out or cashflow) |
| **Who actually writes it** | NOBODY — no trigger, no RPC, no application code |
| **No. triggers on table** | 0 custom triggers (only FK constraint triggers) |

**Code locations reading this field DIRECTLY:**

| File | Line | Context | Impact |
|------|------|---------|--------|
| `src/components/host-payables/SettlementListDialog.tsx` | 188 | `canVoid()` checks `total_paid_amount <= 0` | ⚠️ **ALWAYS TRUE** — allows voiding settlements that ARE paid via cashflow |
| `src/components/host-payables/SettlementListDialog.tsx` | 260, 316 | Displays "Đã thanh toán" = `formatCurrency(total_paid_amount)` | ❌ **ALWAYS SHOWS 0₫** |
| `src/components/host-payables/SettlementListDialog.tsx` | 324, 477 | `getPaymentStatusBadge(total_paid_amount, ...)` | ❌ **ALWAYS UNPAID** |
| `src/components/settlement/SettlementDetailDialog.tsx` | 234 | Displays "Đã thanh toán (snapshot)" | ❌ **ALWAYS 0₫** |
| `src/hooks/useSettlementFullDetail.ts` | 436 | Passes raw `total_paid_amount` in settlement object | ⚠️ But `computedStats` recomputes correctly |
| `src/pages/HostSettlementPage.tsx` | 303 | Writes `total_paid_amount: settlement.summary.totalPaidAmount` on DRAFT create | ✅ OK (0 at creation is correct) |
| `src/pages/HostSettlementPage.tsx` | 361-462 | Auto-void logic checks `total_paid_amount` AND cashflow | ✅ OK (defense-in-depth: also checks cashflow) |

**Risk Assessment: CRITICAL**
- `SettlementListDialog` shows **wrong payment amounts and status** for all settlements
- `canVoid()` logic allows voiding paid settlements IF the void_settlement_secure RPC also doesn't check — **BUT** the RPC has its own cashflow defense check, so actual void is blocked. The UI will show the void button though.

### C2. `service_settlements.payment_status` + `total_paid` + `paid_at` + `paid_by` ☠️

| Aspect | Detail |
|--------|--------|
| **DB Values** | payment_status = 'UNPAID', total_paid = 0, paid_at = NULL (always) |
| **Who should write** | Payment flow |
| **Who actually writes** | NOBODY |

**Code locations:**

| File | Line | Context | Impact |
|------|------|---------|--------|
| `src/hooks/useSettlementFullDetail.ts` | 564 | Passes raw `settlement.payment_status` in `settlement` object | ⚠️ Raw value exposed but `computedStats` overrides |
| `src/hooks/useSettlementFullDetail.ts` | 569 | Passes raw `settlement.total_paid` | ⚠️ Same pattern |
| `src/pages/ServicePayablesPage.tsx` | 253-288 | **RECOMPUTES** paid from cashflow_entries | ✅ Correctly overrides stored value |
| `src/hooks/useSettlementPaymentStats.ts` | 141-186 | **RECOMPUTES** for single service settlement | ⚠️ Only checks cash_outs, NOT cashflow — **MISSES** cashflow-only payments |

**Risk Assessment: MEDIUM**
- `ServicePayablesPage` correctly recomputes → UI is correct
- `useServiceSettlementPaymentStats` only checks `cash_outs` for service settlements → will show UNPAID for settlements paid via cashflow (like SV26037021)
- `useSettlementFullDetail` passes raw stored values in `settlement` object but provides correct `computedStats` — risk if consumer reads from `settlement` instead of `computedStats`

### C3. `host_payables.paid_amount` + `applied_deposit_amount` + `applied_prepaid_amount` + `status` ☠️

| Aspect | Detail |
|--------|--------|
| **DB Values** | ALL zeros, ALL status = PENDING (424/424 payables) |
| **Who should write** | Cash-out creation → `paid_amount`; Deposit/Prepaid application → `applied_*` |
| **Who actually writes** | NOBODY updates these fields after creation |
| **`syncHostPayables()`** | Reads existing `paid_amount`/`applied_*` to recompute status — but since they're always 0, status is always PENDING |
| **`recomputePayableStatus()`** | Same pattern — reads stored zeros, concludes PENDING |

**Code locations reading these DIRECTLY:**

| File | Line | Context | Impact |
|------|------|---------|--------|
| `src/hooks/useHostPayablesEnhanced.ts` | 188-192 | `paidAmount = Number(p.paid_amount)` → computes `remaining_amount` | ❌ **Remaining always = amount** |
| `src/hooks/useHostPayablesEnhanced.ts` | 207 | Returns `status: p.status` | ❌ **Always PENDING** |
| `src/hooks/useHostPayablesEnhanced.ts` | 314-320 | Batch payment: reads `paid_amount` to compute new status | ❌ **Starts from 0, not actual paid** |
| `src/pages/HostPayableDetailPage.tsx` | 174-178 | Reads `paid_amount`, `applied_deposit_amount`, `applied_prepaid_amount` | ❌ **All show 0** |
| `src/hooks/useHostPayableSync.ts` | 142-154 | Reads existing `paid_amount`/`applied_*` to recompute remaining/status | ❌ **Circular: reads 0, writes PENDING** |
| `src/hooks/useHostPayableSync.ts` | 236-248 | `recomputePayableStatus` — same zero-reading pattern | ❌ **Always stays PENDING** |

**Risk Assessment: CRITICAL — ENTIRE HOST PAYABLES MODULE IS SHOWING WRONG DATA**
- Every host payable shows remaining = full amount (no payments recognized)
- Every host payable shows status = PENDING (even if actually paid)
- Aging report based on this data is completely wrong
- Batch payment dialog reads wrong base amounts

---

## D. HOOKS/PAGES RECOMPUTATION STATUS

### D1. Hooks That CORRECTLY Recompute (ignore stored values)

| Hook/Page | What it recomputes | Source | Verdict |
|-----------|-------------------|--------|---------|
| `useSettlementPaymentStats.ts` (host) | paid_amount, remaining, payment_status | cash_outs + cashflow_entries + apply_events | ✅ CORRECT |
| `useSettlementHistory.ts` | paid_amount, remaining, payment_status (host + service) | cash_outs + cashflow_entries + apply_events | ✅ CORRECT |
| `useSettlementFullDetail.ts` (host) | `computedStats` block | cash_outs + cashflow_entries | ✅ CORRECT |
| `useSettlementFullDetail.ts` (service) | `computedStats` block | cashflow_entries | ✅ CORRECT |
| `useHostSettlement.ts` | `total_paid_amount` (line 793) = recomputed | cash_outs + cashflow_entries | ✅ CORRECT |
| `useOutgoingPayments.ts` | `computed_remaining_amount` | cash_outs + cashflow_entries | ✅ CORRECT |
| `ServicePayablesPage.tsx` | `computed_paid_amount`, `computed_remaining_amount` | cashflow_entries | ✅ CORRECT |
| `v_settlement_net_integrity` (SQL view) | `total_paid_cash`, `remaining_effective` | cashflow_entries | ✅ CORRECT |

### D2. Hooks/Components That READ DEAD VALUES DIRECTLY

| Component | Dead Field Read | Impact | Severity |
|-----------|----------------|--------|----------|
| `SettlementListDialog.tsx` | `total_paid_amount` (display + canVoid) | Shows 0₫ paid, wrong status badges, wrong void eligibility | **CRITICAL** |
| `SettlementDetailDialog.tsx` | `total_paid_amount` (display "snapshot") | Shows 0₫ paid | **HIGH** |
| `useHostPayablesEnhanced.ts` | `paid_amount`, `applied_deposit/prepaid`, `status` | All payable cards show wrong remaining/status | **CRITICAL** |
| `HostPayableDetailPage.tsx` | `paid_amount`, `applied_deposit/prepaid` | Detail page shows 0 paid | **CRITICAL** |
| `useHostPayableSync.ts` | `paid_amount`, `applied_deposit/prepaid` | Sync recomputes from wrong base → stays PENDING | **HIGH** |
| `useSettlementPaymentStats.ts` (service) | Only checks cash_outs, not cashflow | Misses cashflow-only service payments | **MEDIUM** |
| `useSettlementFullDetail.ts` | Passes raw `settlement.total_paid_amount` alongside correct `computedStats` | Risk if consumer reads wrong object | **LOW** |

---

## E. FIELD CLASSIFICATION

### E1. DEAD — Must Never Be Used as SOT

| Field | Table | Action Required |
|-------|-------|----------------|
| `total_paid_amount` | `host_settlements` | Either: (a) Add write trigger, or (b) Remove from all UI reads, use computedStats only |
| `payment_status` | `service_settlements` | Same as above |
| `total_paid` | `service_settlements` | Same |
| `paid_at` | `service_settlements` | Same |
| `paid_by` | `service_settlements` | Same |
| `paid_amount` | `host_payables` | Either: (a) Add write path from cash-out creation, or (b) Compute at read time |
| `applied_deposit_amount` | `host_payables` | Either: (a) Add write path from deposit/prepaid application, or (b) Compute |
| `applied_prepaid_amount` | `host_payables` | Same |
| `status` | `host_payables` | Derived from above — will fix when above are fixed |

### E2. LIVE — Correct Snapshot Authority

| Field | Table | Notes |
|-------|-------|-------|
| `remaining_amount` | `host_settlements` | Snapshot of NET at finalize. Correctly used by `resolveHostSettlementNet()`. Do NOT confuse with `total_paid_amount`. |
| `total_payable_amount` | `host_settlements` | Snapshot at creation. Correctly frozen. |
| `total_host_collected` | `host_settlements` | Snapshot at creation. Correctly frozen. |
| `total_deposits_applied` | `host_settlements` | Snapshot at creation. Correctly frozen. |
| `total_prepaids_applied` | `host_settlements` | Snapshot at creation. Correctly frozen. |
| `status` | `host_settlements` | Lifecycle machine — correctly managed by RPCs. |
| `net_amount` | `service_settlements` | SOT for service settlement net. |
| `gross_amount` | `ota_payouts` | Atomically updated. |
| `net_payout_amount` | `ota_payouts` | Atomically updated. |
| `deduction_total` | `ota_payouts` | Atomically updated. |
| `amount` | `host_payables` | Correctly synced by `syncHostPayables()`. |

### E3. Safe to Deprecate (if field is dead AND no read path needs it)

| Field | Table | Notes |
|-------|-------|-------|
| `paid_at` | `service_settlements` | Never written, never read in any critical path |
| `paid_by` | `service_settlements` | Never written, never read in any critical path |

---

## F. RPC/TRIGGER WRITE PATH AUDIT

### F1. `finalize_settlement_secure`
- **Writes**: `status = 'SETTLED'`, `finalized_at`, `finalized_by`
- **Does NOT write**: `total_paid_amount`, `remaining_amount` (remaining already set at DRAFT creation)
- **Verdict**: ✅ Correct — lifecycle only

### F2. `close_settlement_secure`
- **Writes**: `status = 'CLOSED'`
- **Does NOT write**: `total_paid_amount`
- **Verdict**: ✅ Correct — lifecycle only

### F3. `void_settlement_secure`
- **Writes**: `status = 'VOID'`, `voided_at`, `voided_by`; unlocks segments/extras/surcharges; cancels payment_requests
- **Defense check**: Verifies no actual cashflow_entries exist before allowing void
- **Verdict**: ✅ Correct — has independent cashflow guard regardless of `total_paid_amount`

### F4. `recompute_host_settlement_remaining_snapshot`
- **Writes**: `remaining_amount` (from `v_settlement_net_integrity.remaining_effective`)
- **Does NOT write**: `total_paid_amount`
- **Verdict**: ✅ Correct for remaining_amount only; does not address paid tracking

### F5. `create_financial_transaction_secure`
- **Writes**: `cashflow_entries`, `ledger_entries`, `audit_logs`
- **Does NOT write**: Any settlement table fields
- **Verdict**: ⚠️ This is where `total_paid_amount` SHOULD be updated but isn't

### F6. `syncHostPayables()` (client-side)
- **Writes**: `host_payables.amount`, `host_payables.status`, `host_payables.due_date`
- **Reads**: `host_payables.paid_amount` (always 0) to compute status
- **Does NOT write**: `paid_amount`, `applied_deposit_amount`, `applied_prepaid_amount`
- **Verdict**: ❌ Circular dependency on dead fields — status recomputation always returns PENDING

---

## G. DOCUMENTATION VS REALITY

The `DocumentationPage.tsx` (lines 852, 857) documents:
```
remaining_amount = total_payable_amount - total_host_collected - total_deposits_applied - total_prepaids_applied - total_paid_amount
```

This formula is **WRONG in documentation** — it includes `total_paid_amount` which is always 0. The actual authoritative formula (used by `resolveHostSettlementNet()`) is:
```
net = total_payable_amount - total_host_collected - total_deposits_applied - total_prepaids_applied
remaining_for_payment = net - SUM(apply_events) - MAX(SUM(cash_outs), SUM(cashflow_entries))
```

The documentation also states (line 928):
```
"Cập nhật host_payables.paid_amount sau khi chi"
```
This is **DOCUMENTED BUT NOT IMPLEMENTED** — no code path updates `host_payables.paid_amount`.

---

## H. SCORING

| Area | Score | Reason |
|------|-------|--------|
| host_settlements stored truth | 85/100 | `total_paid_amount` dead but UI compensates in most paths |
| service_settlements stored truth | 70/100 | 4 dead fields, `useServiceSettlementPaymentStats` misses cashflow |
| host_payables stored truth | **20/100** | **ALL payment-related fields dead, entire module shows wrong data** |
| ota_payouts stored truth | 100/100 | All fields correctly maintained by atomic RPCs |
| payment_requests stored truth | 95/100 | Status machine correct, immutability trigger enforced |
| UI compensation quality | 75/100 | Most settlement UIs recompute; host_payables does NOT |

---

## I. FINAL VERDICT

### **NOT SAFE — HOST PAYABLES MODULE IS SHOWING ENTIRELY WRONG DATA**

| Severity | Area | Issue |
|----------|------|-------|
| **CRITICAL** | `host_payables` | ALL 424 payables show `paid_amount = 0`, `status = PENDING`, wrong remaining |
| **CRITICAL** | `SettlementListDialog` | Shows 0₫ paid and wrong payment status for all settlements |
| **HIGH** | `SettlementDetailDialog` | Shows 0₫ paid snapshot |
| **MEDIUM** | `useServiceSettlementPaymentStats` | Doesn't check cashflow for service settlements |
| **LOW** | Documentation | Formula includes dead field |

---

## J. FIX DIRECTION (No Implementation)

### Priority 1 — HOST PAYABLES (CRITICAL)

**Option A (Preferred — Minimal risk):** Change `useHostPayablesEnhanced.ts` to compute paid/deposit/prepaid amounts at read time from `cash_outs`, `cashflow_entries`, and `payment_requests` — same pattern as settlement hooks. Don't trust stored `paid_amount`/`applied_*`.

**Option B (Longer term):** Add DB trigger on `cash_outs` INSERT to update `host_payables.paid_amount`. Add trigger on deposit/prepaid payment_requests going PAID to update `applied_deposit_amount`/`applied_prepaid_amount`. Then backfill.

### Priority 2 — SETTLEMENT LIST DIALOG

Change `SettlementListDialog.tsx` to use recomputed paid amounts (from hook data or separate query), not raw `total_paid_amount`. The `canVoid()` function should check cashflow like `void_settlement_secure` RPC does.

### Priority 3 — SERVICE SETTLEMENT PAYMENT STATS

Fix `useServiceSettlementPaymentStats` to also check `cashflow_entries` (not just `cash_outs`), matching the pattern already used by `ServicePayablesPage.tsx`.

### Priority 4 — DOCUMENTATION

Update `DocumentationPage.tsx` formula to remove `total_paid_amount` from `remaining_amount` calculation. Add note that `total_paid_amount` is not maintained.

---

## K. APPENDIX

### Files Audited
- `src/hooks/useHostPayablesEnhanced.ts` — reads dead `paid_amount`, `applied_*`, `status`
- `src/hooks/useHostPayableSync.ts` — reads/writes dead fields circularly
- `src/hooks/useSettlementPaymentStats.ts` — correctly recomputes for host; misses cashflow for service
- `src/hooks/useSettlementHistory.ts` — correctly recomputes
- `src/hooks/useSettlementFullDetail.ts` — exposes both raw (dead) and computed (correct)
- `src/hooks/useHostSettlement.ts` — correctly recomputes at line 793
- `src/hooks/useOutgoingPayments.ts` — correctly recomputes `computed_remaining_amount`
- `src/components/host-payables/SettlementListDialog.tsx` — reads dead `total_paid_amount`
- `src/components/settlement/SettlementDetailDialog.tsx` — reads dead `total_paid_amount`
- `src/pages/HostPayableDetailPage.tsx` — reads dead `paid_amount`
- `src/pages/ServicePayablesPage.tsx` — correctly recomputes from cashflow
- `src/pages/OutgoingPaymentsPage.tsx` — uses `computed_remaining_amount`
- `src/pages/PaymentRequestsPage.tsx` — uses `computed_remaining_amount`
- `src/pages/DocumentationPage.tsx` — documents wrong formula

### RPCs Audited
- `finalize_settlement_secure` — does not touch `total_paid_amount` ✅
- `close_settlement_secure` — does not touch `total_paid_amount` ✅
- `void_settlement_secure` — independent cashflow defense ✅
- `recompute_host_settlement_remaining_snapshot` — fixes `remaining_amount` only ✅
- `create_financial_transaction_secure` — no settlement field updates ⚠️

### Views Audited
- `v_settlement_net_integrity` — correctly recomputes from cashflow ✅

### DB Evidence
- `host_settlements`: 91 rows, 0 with `total_paid_amount > 0`
- `service_settlements`: 1 row, `payment_status = UNPAID`, `total_paid = 0` despite 747,500 cashflow
- `host_payables`: 424 rows, 0 with `paid_amount > 0`, 0 with deposits/prepaids applied, ALL status = PENDING
