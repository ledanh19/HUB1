# UAT: Settlement Payment Defense-in-Depth

## Date: 2026-03-04

## Test Matrix

| # | Scenario | Expected Status | paid_source | dual_paid_warning | Result |
|---|----------|----------------|-------------|-------------------|--------|
| T1 | HOST paid only via cashflow_entries (e.g. ST1772499436508Y6A0) | PAID | CASHFLOW | false | ✅ |
| T2 | HOST paid only via cash_outs | PAID | CASH_OUTS | false | ✅ |
| T3 | HOST partial via cashflow_entries | PARTIAL | CASHFLOW | false | ✅ |
| T4 | SERVICE paid via cashflow_entries (SERVICE_SETTLEMENT_PAYMENT) | PAID | CASHFLOW | false | ✅ |
| T5 | BOTH sources, equal totals (within 1,000 VND) | PAID | BOTH | false | ✅ |
| T6 | BOTH sources, mismatch > 1,000 VND | Uses MAX → correct status | BOTH | true (⚠️ icon) | ✅ |

## Regression Checks

| # | Check | Result |
|---|-------|--------|
| R1 | Stats cards match list totals under same filters | ✅ |
| R2 | Pagination doesn't change status | ✅ |
| R3 | No TypeScript errors | ✅ |
| R4 | Filter by UNPAID/PARTIAL/PAID works correctly | ✅ |
| R5 | Source type constants used (no hardcoded strings in hooks) | ✅ |

## Defense-in-Depth Layers

1. **Source Type Constants** — `src/constants/settlementPaymentSourceTypes.ts` prevents typo/mismatch
2. **Paid Source Info** — `src/lib/settlementPaidSource.ts` exposes diagnostic metadata
3. **UI Warning** — ⚠️ tooltip on settlements with dual-write divergence
4. **Tolerance** — 1,000 VND from `src/constants/payment-tolerance.ts`
