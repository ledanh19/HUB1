/**
 * Dual-write detection helpers for settlement payment sources.
 *
 * After the SOT fix (paid = MAX(cash_outs, cashflow)), we expose
 * metadata so the UI can flag settlements that have data in BOTH
 * tables — which indicates legacy dual-write or migration residue.
 */

import { PAYMENT_TOLERANCE_VND } from "@/constants/payment-tolerance";

export type PaidSource = "CASH_OUTS" | "CASHFLOW" | "BOTH" | "NONE";

export interface PaidSourceInfo {
  paid_cashouts: number;
  paid_cashflow: number;
  paid_amount: number;
  paid_source: PaidSource;
  /** true when BOTH sources have data AND their totals diverge beyond tolerance */
  dual_paid_warning: boolean;
}

/**
 * Compute paid source metadata from two aggregated totals.
 */
export function computePaidSourceInfo(
  paidCashouts: number,
  paidCashflow: number,
): PaidSourceInfo {
  const paid_amount = Math.max(paidCashouts, paidCashflow);

  let paid_source: PaidSource = "NONE";
  if (paidCashouts > 0 && paidCashflow > 0) paid_source = "BOTH";
  else if (paidCashouts > 0) paid_source = "CASH_OUTS";
  else if (paidCashflow > 0) paid_source = "CASHFLOW";

  const dual_paid_warning =
    paid_source === "BOTH" &&
    Math.abs(paidCashouts - paidCashflow) > PAYMENT_TOLERANCE_VND;

  return {
    paid_cashouts: paidCashouts,
    paid_cashflow: paidCashflow,
    paid_amount,
    paid_source,
    dual_paid_warning,
  };
}
