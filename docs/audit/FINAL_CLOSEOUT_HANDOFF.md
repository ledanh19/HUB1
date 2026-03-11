# FINAL CLOSE-OUT PACK — FINANCE OPS HANDOFF + ENGINEERING PHASE B

## Date: 2026-03-08

---

# 1. FINANCE OPS ACTION LIST

| Priority | Item | Exact Record(s) | Why It Matters | Recommended Action |
|---|---|---|---|---|
| P1 | Orphan cashflow entry pointing to VOID settlement | `cashflow_entries.id = bf30f835`, `source_id = 8348f31d` (VOID settlement ST1772628825899NL9B) | 3,700,000₫ OUT entry inflates computed paid stats if VOID settlement is ever queried. Zero current UI impact (VOID filtered), but pollutes reconciliation data. | Nullify `source_id` to NULL or create a correction entry. **Do not hard-delete.** |
| P2 | Execute or defer 3 APPROVED payment requests | `PR26030040` (HOST_DEPOSIT 500K), `PR26030041` (INTERNAL_EXPENSE 8M), `PR26030042` (INTERNAL_EXPENSE 835K) | All approved 2026-03-07, no cash_outs created yet. Operationally normal but aging without action. | Execute payment or explicitly defer with note. No engineering action needed. |
| P3 | Confirm cash_out 5410c37d is correctly unlinked | `cash_outs.id = 5410c37d` (3.7M, `settlement_id = NULL`, linked to PAID PR26030027) | Was originally for VOID settlement. Now unlinked from settlement but still linked to its payment request (which is PAID). | **No action needed** unless reconciliation report flags it. Document as known historical correction. |

---

# 2. ENGINEERING PHASE B LIST

| Priority | Item | Why Deferred | Risk If Deferred | Suggested Fix Direction |
|---|---|---|---|---|
| P1 | Dead field deprecation (`total_paid_amount`, `paid_amount`, `applied_deposit_amount`, `remaining_amount` on settlements/payables) | Read-path bypasses them completely. Removing requires write-path audit + migration. | Zero functional risk. Developer confusion only. | Add `@deprecated` column comments via migration. Plan column removal after write-path cleanup. |
| P2 | Write-path cleanup: stop writing dead fields | `useCreateBatchPayment` and other mutation hooks still write `paid_amount` on payables. | Zero — read-path ignores written values. Wasted writes only. | Remove dead-field writes from batch/payment mutation hooks. |
| P3 | Host payables pagination / 1000-row limit | `fetchPayablePaymentTruth` uses `.in()` with all payable IDs in single query. | Low now (tens of payables). Breaks at ~1000+. | Implement chunked `.in()` queries or server-side pagination. |
| P4 | `fetchPayablePaymentTruth` silent error handling | Doesn't throw on query errors; defaults to 0. Pre-existing pattern. | Low — safe fallback but hides transient DB errors. | Add `console.error` logging on query failures. |
| P5 | Remove unused `useEnhancedHostPayables` hook | Defined but zero consumers. | Zero. Dead code. | Delete the hook or document intended future use. |
| P6 | First-use verification playbook | Deposit, prepaid, and batch payment flows verified in code but lack production data proof. | Medium — logic verified but untested with real rows. | Create runbook checklist; execute on first real usage of each flow. |
| P7 | Document dashboard vs analytics time-key difference | Different modules use `cash_date` vs `paid_at` vs `check_out_date`. | Low — cosmetic inconsistency in reporting periods. | Add internal doc mapping canonical time-key per module. |

---

# 3. WATCH LIST

| Watch Item | Trigger | What To Verify | Owner |
|---|---|---|---|
| First deposit application | First real `host_deposits` row created | `fetchPayablePaymentTruth` returns correct `depositMap` value; payable remaining decreases; status updates to PARTIAL/PAID | Engineering + Finance Ops |
| First prepaid application | First real `host_prepaids` row created | `prepaidMap` value correct; payable remaining decreases accordingly | Engineering + Finance Ops |
| First batch payment | First real batch payment execution | `host_payments` AND `host_payment_batch_items` both inserted; computed paid uses `host_payments` only; no 2x display in UI | Engineering |
| Negative remaining amount | Any page showing remaining < 0 | `Math.max(0, ...)` guard should prevent. Report immediately if seen. | Engineering |
| Settlement void via RPC | First void attempt after hardening | `void_settlement_secure` RPC executes correctly; success/error toasts work; linked rows unlocked atomically; audit log written | Engineering |
| VOID settlement paid flash | SettlementListDialog showing brief UNPAID→PAID flash | Acceptable if < 2 seconds. Escalate if persists. | Engineering |

---

# 4. RESOLVED ITEMS

| Area | Final Status |
|---|---|
| Host Payables List read-path (remaining/status) | ✅ Fixed — uses `fetchPayablePaymentTruth()` |
| Host Payable Detail read-path | ✅ Fixed — derives paid/deposit/prepaid from source tables |
| SettlementListDialog paid display | ✅ Fixed — `useHostSettlementsPaymentStats` queries both `cash_outs` + `cashflow_entries` |
| SettlementListDialog voidability | ✅ Fixed — `canVoid()` uses computed paid, not dead field |
| Settlement void action path | ✅ Hardened — now calls `void_settlement_secure` RPC |
| Service settlement payment stats | ✅ Fixed — dual-source `MAX(co, cf)` logic |
| Host payable sync deletion guard | ✅ Fixed — checks 4 real source tables |
| Batch payment double-count | ✅ Fixed (preventive) — `host_payments` is sole canonical source |
| P&L cash_out `is_sample_data` guard | ✅ Fixed — `.eq("is_sample_data", false)` added |
| Regression / UAT | ✅ Passed — no blockers found |
| Track B settlement ST1772878511908TNJO normalization | ✅ Completed — segments unlinked, extra charges reassigned |
| PR26030027 status | ✅ Verified — correctly PAID, not an anomaly |
| cash_out 5410c37d status | ✅ Verified — correctly unlinked from VOID settlement |

---

# 5. FINAL OWNER SPLIT

### Finance Ops owns now:
- Orphan cashflow `bf30f835` resolution (P1)
- 3 APPROVED payment request execution/deferral (P2)
- Ongoing reconciliation monitoring

### Engineering owns now:
- Phase B cleanup items (P1–P7 above)
- Watch list monitoring on first-use triggers
- Any bug that surfaces from watch items

### Can safely wait:
- Dead field column removal (after write-path cleanup)
- Dashboard time-key documentation
- Unused hook cleanup
- Pagination hardening (current volume is safe)

---

# 6. FINAL STATUS

**CLOSE-OUT READY**
