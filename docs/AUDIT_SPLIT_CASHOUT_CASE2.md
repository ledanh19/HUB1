# AUDIT: Split Cash-Out dc74251b (Case #2)

**Date:** 2026-02-11
**Target:** cash_out_id = `dc74251b-cd1c-4094-bc67-0a7fd96d3cf4`
**Reason:** Phiếu chi gộp 2 tháng → tách để cashflow đúng kỳ

---

## Object Graph

### cash_outs
| Field | Value |
|---|---|
| id | dc74251b-cd1c-4094-bc67-0a7fd96d3cf4 |
| amount | 391,500,003 |
| paid_at | 2026-02-05T00:00:00+00 |
| payment_method | BANK_TRANSFER |
| payment_request_id | f761dc6f-f730-4d96-9929-ae13ba5e6187 |
| paid_by | 9b33c525-86b8-43e9-bfaa-88242cf06dab |
| created_at | 2026-02-11T00:53:29+00 |

### payment_requests
| Field | Value |
|---|---|
| id | f761dc6f-f730-4d96-9929-ae13ba5e6187 |
| request_code | PR26020021 |
| payment_type | HOST_PAYMENT |
| proposed_amount | 391,500,003 |
| source_amount | 391,500,003 |
| status | PAID |
| partner_id | dbccb0ca-e4b9-445b-865e-029e7b307996 (MRS TRANG) |
| settlement_id | 8423cf96-0466-4963-a0a6-52c30b882d7d |

### host_settlements
| Field | Value |
|---|---|
| id | 8423cf96-0466-4963-a0a6-52c30b882d7d |
| settlement_code | ST1770771179804L1N4 |
| period_from | 2025-10-01 |
| period_to | 2026-01-28 |
| total_payable_amount | 391,500,003 |
| status | SETTLED |
| partner_id | dbccb0ca-e4b9-445b-865e-029e7b307996 |

### cashflow_entries
| Field | Value |
|---|---|
| id | 267b6830-b763-4ff5-b880-cf17311f032e |
| amount | 391,500,003 |
| cash_date | 2026-02-05 |
| source_type | HOST_SETTLEMENT_PAYMENT |
| source_id | 8423cf96-0466-4963-a0a6-52c30b882d7d |
| direction | OUT |
| counterparty_type | HOST |
| counterparty_id | dbccb0ca-e4b9-445b-865e-029e7b307996 |

### ledger_entries
| Field | Value |
|---|---|
| id | e70f1c55-bb47-4b3e-b5af-2955aa88bd56 |
| amount | 391,500,003 |
| entry_date | 2026-02-05 |
| source_type | CASH_OUT |
| source_id | dc74251b-cd1c-4094-bc67-0a7fd96d3cf4 |
| direction | CREDIT |
| cash_account_id | 643f5d32-10dd-40ee-ba3f-53c85fbdd5fd |

### audit_logs
- 3 entries found: create PR, approve PR, create cash_out (atomic)

---

## Invariants Before Split

| Check | Result |
|---|---|
| Sum(cash_outs for PR) = proposed_amount | ✅ 391,500,003 = 391,500,003 |
| cashflow_entries amount = cash_out amount | ✅ 391,500,003 |
| ledger_entries amount = cash_out amount | ✅ 391,500,003 |
| PR status = PAID | ✅ |
| Settlement status = SETTLED | ✅ |

## Fields Driving Reports
- **Cashflow reports**: `cashflow_entries.cash_date` + `cashflow_entries.amount`
- **Settlement paid**: computed from `SUM(cash_outs.amount) WHERE payment_request.settlement_id`
- **Ledger**: `ledger_entries.entry_date` + `ledger_entries.amount`
