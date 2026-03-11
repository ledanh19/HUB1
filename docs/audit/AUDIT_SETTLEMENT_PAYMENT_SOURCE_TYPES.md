# Settlement Payment Source Types — Audit

## Date: 2026-03-04

## Source Type Map

| Settlement Kind | cashflow_entries.source_type | cash_outs.settlement_type | Write Path RPC |
|----------------|----------------------------|--------------------------|----------------|
| HOST           | `HOST_SETTLEMENT_PAYMENT`  | `HOST`                   | `create_financial_transaction_secure` with `p_source_type='HOST_SETTLEMENT_PAYMENT'` |
| SERVICE        | `SERVICE_SETTLEMENT_PAYMENT` | `SERVICE`              | `create_financial_transaction_secure` with `p_source_type='SERVICE_SETTLEMENT_PAYMENT'` |

## Files Using These Source Types (Inventory)

| File | Table | Source Type | Purpose |
|------|-------|-------------|---------|
| `src/hooks/useSettlementHistory.ts` | cashflow_entries + cash_outs | HOST/SERVICE | List view paid aggregation |
| `src/hooks/useSettlementPaymentStats.ts` | cashflow_entries + cash_outs | HOST only (service uses cash_outs only → **fixed**) | Detail header stats |
| `src/hooks/useOutgoingPayments.ts` | cashflow_entries | HOST + SERVICE | Outgoing payments list + write |
| `src/hooks/useSettlementFullDetail.ts` | cashflow_entries | HOST + SERVICE | Full detail modal |
| `src/hooks/useHostSettlement.ts` | cashflow_entries | HOST | Host settlement dashboard |
| `src/pages/HostPayablesAgingPage.tsx` | cashflow_entries | HOST | Aging report |
| `src/pages/ServicePayablesPage.tsx` | cashflow_entries | SERVICE | Service payables |

## Canonical Constants File

All hooks SHOULD import from: `src/constants/settlementPaymentSourceTypes.ts`

## Paid Source Detection

New helper: `src/lib/settlementPaidSource.ts`
- Exposes `paid_source`: CASH_OUTS | CASHFLOW | BOTH | NONE
- Exposes `dual_paid_warning`: true if BOTH sources exist with divergent totals (> 1,000 VND)
- Informational only — does NOT change status formula
