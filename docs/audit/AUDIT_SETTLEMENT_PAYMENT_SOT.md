# Settlement Payment Status — Source of Truth Audit

## Date: 2026-03-04

## Entity Tables

| Entity | Table | NET field | Status |
|--------|-------|-----------|--------|
| Host Settlement | `host_settlements` | `remaining_amount` (snapshot at finalize) | `status` (SETTLED/CLOSED/VOID) |
| Service Settlement | `service_settlements` | `net_amount` (stored) | `payment_status` (stored, legacy) |

## NET Amount Computation

### Host Settlement
- **DRAFT**: Recompute = `total_payable_amount - total_host_collected - total_deposits_applied - total_prepaids_applied`
- **FINALIZED/SETTLED/CLOSED**: Use `remaining_amount` snapshot (set at finalize)
- **VOID**: 0
- **Apply Events**: `effective_net = remaining_amount - SUM(host_settlement_apply_events.amount)`

### Service Settlement
- Stored directly in `net_amount`

## Paid Amount — THE BUG

### Current Code (3 different sources!):

| Location | Reads From | Source Type Filter |
|----------|------------|-------------------|
| `useSettlementHistory` (SettlementHistoryPage) | `cash_outs` | `settlement_type = 'HOST'/'SERVICE'` |
| `useSettlementPaymentStats` | `cash_outs` | `settlement_type = 'HOST'/'SERVICE'` |
| `ServicePayablesPage` (inline) | `cashflow_entries` | `source_type = 'SERVICE_SETTLEMENT_PAYMENT', direction = 'OUT'` |
| `HostPayablesAgingPage` (via hooks) | `cash_outs` | `settlement_type = 'HOST'` |

### Root Cause

Payments created via `create_financial_transaction_secure` write to `cashflow_entries` with `source_type = 'HOST_SETTLEMENT_PAYMENT'` and `source_id = settlement_id`. These do NOT always have a corresponding `cash_outs` record with `settlement_id` set.

**Result**: 8+ host settlements show as UNPAID in SettlementHistoryPage while actually fully paid in cashflow_entries.

## Canonical Formula (Fix)

```
paid_amount = MAX(
  SUM(cash_outs.amount WHERE settlement_id = X),
  SUM(cashflow_entries.amount WHERE source_type = '{TYPE}_SETTLEMENT_PAYMENT' AND source_id = X AND direction = 'OUT')
)

remaining_amount = GREATEST(ABS(effective_net) - paid_amount, 0)

payment_status:
  - PAID     if remaining_amount <= 1000 (VND tolerance)
  - PARTIAL  if paid_amount > 0 AND remaining_amount > 1000
  - UNPAID   if paid_amount = 0
  - OVERPAID if paid_amount > ABS(effective_net) + 1000
```

## Affected Settlements (Bug Repro)

| Settlement Code | NET | cash_outs paid | cashflow paid | UI Shows | Should Show |
|----------------|-----|----------------|---------------|----------|-------------|
| ST1772499436508Y6A0 | 5,600,000 | 0 | 5,600,000 | UNPAID | PAID |
| ST1772498967938NR1J | 3,800,000 | 0 | 3,800,000 | UNPAID | PAID |
| ST1772498900364DSZJ | 10,900,000 | 0 | 10,900,000 | UNPAID | PAID |
| ST1772498679353WBOA | 4,600,000 | 0 | 4,600,000 | UNPAID | PAID |
| ST17724984518131UZT | 12,000,000 | 0 | 12,000,000 | UNPAID | PAID |
| ST1772459112551OQEG | 1,064,000 | 0 | 1,064,000 | UNPAID | PAID |
| ST1772420705252VMGL | 6,400,000 | 0 | 6,400,000 | UNPAID | PAID |
| ST1772418431991NLRU | 13,200,000 | 0 | 13,200,000 | UNPAID | PAID |
