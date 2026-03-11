# SPLIT EXECUTION PLAN — Cash-Out 2cfbbae6

**Date:** 2026-02-11  
**Status:** ✅ EXECUTED SUCCESSFULLY  
**Operator:** Lovable AI Agent

---

## Summary

| Item | Before | After |
|---|---|---|
| cash_out `2cfbbae6` (month 2) | 239,400,001 @ 2026-02-10 | **129,300,000** @ 2026-02-10 |
| cash_out `d129ae44` (month 1) | — | **110,100,001** @ 2026-01-31 |
| cashflow `49862132` (month 2) | 239,400,001 @ 2026-02-10 | **129,300,000** @ 2026-02-10 |
| cashflow `caca4093` (month 1) | — | **110,100,001** @ 2026-01-31 |
| ledger `2e6bb965` (month 2) | 239,400,001 @ 2026-02-10 | **129,300,000** @ 2026-02-10 |
| ledger `8eb4fccf` (month 1) | — | **110,100,001** @ 2026-01-31 |

## Invariants Verified Post-Split

| Check | Expected | Actual | Status |
|---|---|---|---|
| SUM(cash_outs) | 239,400,001 | 239,400,001 | ✅ |
| SUM(cashflow_entries) | 239,400,001 | 239,400,001 | ✅ |
| SUM(ledger_entries) | 239,400,001 | 239,400,001 | ✅ |
| PR proposed_amount | 239,400,001 | 239,400,001 | ✅ |
| PR status | PAID | PAID | ✅ |
| Month 1 cashflow OUT | 110,100,001 | 110,100,001 | ✅ |
| Month 2 cashflow OUT | 129,300,000 | 129,300,000 | ✅ |

## Touched Tables
- `cash_outs` (1 update + 1 insert)
- `cashflow_entries` (1 update + 1 insert)
- `ledger_entries` (1 update + 1 insert)
- `audit_logs` (2 inserts)

---

## ROLLBACK PLAN

If rollback is needed, execute in order:

```sql
-- 1. Restore original cash_out amount
UPDATE cash_outs 
SET amount = 239400001, note = NULL
WHERE id = '2cfbbae6-9417-4450-8595-27810d9f15f9';

-- 2. Delete month-1 cash_out
DELETE FROM cash_outs WHERE id = 'd129ae44-04bf-4f8e-91ce-ba5cb12fa3c4';

-- 3. Restore cashflow entry
UPDATE cashflow_entries SET amount = 239400001
WHERE id = '49862132-043b-4464-9bf1-6473046a4af5';

-- 4. Delete month-1 cashflow
DELETE FROM cashflow_entries WHERE id = 'caca4093-3de9-45ab-91d9-27a5a800cc5a';

-- 5. Restore ledger entry
UPDATE ledger_entries SET amount = 239400001
WHERE id = '2e6bb965-5078-43eb-a0b3-71bb79750c40';

-- 6. Delete month-1 ledger
DELETE FROM ledger_entries WHERE id = '8eb4fccf-3e31-4c3c-82a4-eac8449e3eee';

-- 7. Audit log for rollback
INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
VALUES ('ROLLBACK_SPLIT_CASHOUT', 'cash_outs', '2cfbbae6-9417-4450-8595-27810d9f15f9', 
  '1f290531-af66-4b83-8500-7bb019ee399c',
  '{"restored_amount": 239400001, "reason": "rollback-split"}'::jsonb);
```
