/**
 * Settlement Payment Source Type Map
 * ===================================
 * Single source of truth for source_type strings used when querying
 * cashflow_entries to compute settlement paid amounts.
 *
 * Write path: create_financial_transaction_secure RPC uses these same strings.
 * Read path: all hooks MUST import from here instead of hardcoding.
 */

/** cashflow_entries.source_type values for HOST settlement payments */
export const HOST_SETTLEMENT_SOURCE_TYPES = ["HOST_SETTLEMENT_PAYMENT"] as const;

/** cashflow_entries.source_type values for SERVICE settlement payments */
export const SERVICE_SETTLEMENT_SOURCE_TYPES = ["SERVICE_SETTLEMENT_PAYMENT"] as const;

/** cash_outs.settlement_type values */
export const HOST_CASHOUT_SETTLEMENT_TYPE = "HOST" as const;
export const SERVICE_CASHOUT_SETTLEMENT_TYPE = "SERVICE" as const;

/**
 * Get cashflow source_type(s) for a settlement kind.
 * Used by hooks that query cashflow_entries to compute paid amounts.
 */
export function getCashflowSourceTypes(kind: "HOST" | "SERVICE"): readonly string[] {
  return kind === "HOST" ? HOST_SETTLEMENT_SOURCE_TYPES : SERVICE_SETTLEMENT_SOURCE_TYPES;
}

/**
 * Get cash_outs.settlement_type for a settlement kind.
 */
export function getCashoutSettlementType(kind: "HOST" | "SERVICE"): string {
  return kind === "HOST" ? HOST_CASHOUT_SETTLEMENT_TYPE : SERVICE_CASHOUT_SETTLEMENT_TYPE;
}

/** Tolerance for VND rounding in payment status comparison */
export { PAYMENT_TOLERANCE_VND } from "./payment-tolerance";
