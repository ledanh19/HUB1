# SPLIT EXECUTION PLAN — Cash-Out dc74251b (Case #2)

**Date:** 2026-02-11  
**Status:** ✅ EXECUTED SUCCESSFULLY  
**Operator:** Lovable AI Agent

---

## Summary

| Item | Before | After |
|---|---|---|
| cash_out `dc74251b` (month 2) | 391,500,003 @ 2026-02-05 | **127,731,129** @ 2026-02-05 |
| cash_out `eec94175` (month 1) | — | **263,768,874** @ 2026-01-31 |
| cashflow `267b6830` (month 2) | 391,500,003 @ 2026-02-05 | **127,731,129** @ 2026-02-05 |
| cashflow `c13335c8` (month 1) | — | **263,768,874** @ 2026-01-31 |
| ledger `e70f1c55` (month 2) | 391,500,003 @ 2026-02-05 | **127,731,129** @ 2026-02-05 |
| ledger `39c76d5a` (month 1) | — | **263,768,874** @ 2026-01-31 |

## Invariants Verified Post-Split

| Check | Expected | Actual | Status |
|---|---|---|---|
| SUM(cash_outs) | 391,500,003 | 391,500,003 | ✅ |
| SUM(cashflow_entries) | 391,500,003 | 391,500,003 | ✅ |
| SUM(ledger_entries) | 391,500,003 | 391,500,003 | ✅ |
| PR proposed_amount | 391,500,003 | 391,500,003 | ✅ |
| PR status | PAID | PAID | ✅ |
| Month 1 cashflow OUT | 263,768,874 | 263,768,874 | ✅ |
| Month 2 cashflow OUT | 127,731,129 | 127,731,129 | ✅ |

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
SET amount = 391500003, note = NULL
WHERE id = 'dc74251b-cd1c-4094-bc67-0a7fd96d3cf4';

-- 2. Delete month-1 cash_out
DELETE FROM cash_outs WHERE id = 'eec94175-c6dd-40b2-bc09-38708cfabe14';

-- 3. Restore cashflow entry
UPDATE cashflow_entries SET amount = 391500003
WHERE id = '267b6830-b763-4ff5-b880-cf17311f032e';

-- 4. Delete month-1 cashflow
DELETE FROM cashflow_entries WHERE id = 'c13335c8-4589-48fa-8297-70cb2a88d48b';

-- 5. Restore ledger entry
UPDATE ledger_entries SET amount = 391500003
WHERE id = 'e70f1c55-bb47-4b3e-b5af-2955aa88bd56';

-- 6. Delete month-1 ledger
DELETE FROM ledger_entries WHERE id = '39c76d5a-c738-4ccd-a2a9-e8a4571692fb';

-- 7. Audit log for rollback
INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
VALUES ('ROLLBACK_SPLIT_CASHOUT', 'cash_outs', 'dc74251b-cd1c-4094-bc67-0a7fd96d3cf4', 
  '1f290531-af66-4b83-8500-7bb019ee399c',
  '{"restored_amount": 391500003, "reason": "rollback-split-case2"}'::jsonb);
```
