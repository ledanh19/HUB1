# AUDIT: Split Cash-Out 2cfbbae6

**Date:** 2026-02-11
**Target:** cash_out_id = `2cfbbae6-9417-4450-8595-27810d9f15f9`
**Reason:** Phiếu chi gộp 2 tháng → tách để cashflow đúng kỳ

---

## Object Graph

### cash_outs
| Field | Value |
|---|---|
| id | 2cfbbae6-9417-4450-8595-27810d9f15f9 |
| amount | 239,400,001 |
| paid_at | 2026-02-10T00:00:00+00 |
| payment_method | BANK_TRANSFER |
| payment_request_id | 0ec82334-6a48-42e7-bde1-425bffc5b49c |
| paid_by | 9b33c525-86b8-43e9-bfaa-88242cf06dab |
| created_at | 2026-02-11T00:51:48+00 |

### payment_requests
| Field | Value |
|---|---|
| id | 0ec82334-6a48-42e7-bde1-425bffc5b49c |
| request_code | PR26020020 |
| payment_type | HOST_PAYMENT |
| proposed_amount | 239,400,001 |
| source_amount | 239,400,001 |
| status | PAID |
| partner_id | 7f0bfac1-a740-4817-96af-cc98db1adf50 (Mrs Jenny) |
| settlement_id | 1a10e920-13ac-455d-8793-ade447683fa3 |

### host_settlements
| Field | Value |
|---|---|
| id | 1a10e920-13ac-455d-8793-ade447683fa3 |
| settlement_code | ST1770771064534VQVY |
| period_from | 2025-11-01 |
| period_to | 2026-01-29 |
| total_payable_amount | 239,400,001 |
| total_paid_amount | 0 (computed at query time) |
| remaining_amount | 239,400,001 |
| status | CLOSED |
| partner_id | 7f0bfac1-a740-4817-96af-cc98db1adf50 |

### cashflow_entries
| Field | Value |
|---|---|
| id | 49862132-043b-4464-9bf1-6473046a4af5 |
| amount | 239,400,001 |
| cash_date | 2026-02-10 |
| source_type | HOST_SETTLEMENT_PAYMENT |
| source_id | 1a10e920-13ac-455d-8793-ade447683fa3 |
| direction | OUT |
| counterparty_type | HOST |
| counterparty_id | 7f0bfac1-a740-4817-96af-cc98db1adf50 |

### ledger_entries
| Field | Value |
|---|---|
| id | 2e6bb965-5078-43eb-a0b3-71bb79750c40 |
| amount | 239,400,001 |
| entry_date | 2026-02-10 |
| source_type | CASH_OUT |
| source_id | 2cfbbae6-9417-4450-8595-27810d9f15f9 |
| direction | CREDIT |
| cash_account_id | 643f5d32-10dd-40ee-ba3f-53c85fbdd5fd |

### audit_logs
- 3 entries found: create PR, approve PR, create cash_out (atomic)

---

## Invariants Before Split

| Check | Result |
|---|---|
| Sum(cash_outs for PR) = proposed_amount | ✅ 239,400,001 = 239,400,001 |
| cashflow_entries amount = cash_out amount | ✅ 239,400,001 |
| ledger_entries amount = cash_out amount | ✅ 239,400,001 |
| PR status = PAID | ✅ |
| Settlement status = CLOSED | ✅ |

## Fields Driving Reports
- **Cashflow reports**: `cashflow_entries.cash_date` + `cashflow_entries.amount`
- **Settlement paid**: computed from `SUM(cash_outs.amount) WHERE payment_request.settlement_id`
- **Ledger**: `ledger_entries.entry_date` + `ledger_entries.amount`

---

## Split Plan

### Month 2 (keep existing, update amount)
- cash_out `2cfbbae6...`: amount → 129,300,000, paid_at stays 2026-02-10
- cashflow `49862132...`: amount → 129,300,000, cash_date stays 2026-02-10
- ledger `2e6bb965...`: amount → 129,300,000

### Month 1 (new records)
- New cash_out: amount = 110,100,001, paid_at = 2026-01-31
- New cashflow: amount = 110,100,001, cash_date = 2026-01-31
- New ledger: amount = 110,100,001, entry_date = 2026-01-31

### Post-split invariants
- Sum(cash_outs) = 129,300,000 + 110,100,001 = 239,400,001 ✅
- PR proposed_amount = 239,400,001 ✅ (no change needed)
- PR status = PAID ✅ (no change needed)
