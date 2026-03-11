/**
 * buildPayoutSummary — Single Source of Truth for OTA Payout totals
 *
 * RULE: ExpectedNet MUST come from DB payout.net_payout_amount
 *       (fallback total_amount). NEVER recomputed from FE deductions array.
 *
 * This pure function is consumed by:
 *   - Header KPI cards
 *   - "Ghi nhận tiền về" (Cash-in) section
 *   - Reconciliation Breakdown Card
 *   - Any future KPI / list totals on the payout detail page
 */

export const TOLERANCE_VND = 1;

export interface PayoutSummary {
    /** SUM of booking lines (payout.gross_amount) */
    gross: number;
    /** Signed sum of deductions (payout.deduction_total). Negative = deduction, positive = increase */
    adjustments: number;
    /** DB-stored net amount: gross + adjustments. SOT field. */
    expectedNet: number;
    /** Bank transfer fees from reconciliation items (positive) */
    bankFees: number;
    /** Non-bank-fee reconciliation adjustments (positive) */
    otherAdjust: number;
    /** bankFees + otherAdjust */
    reconciledTotal: number;
    /** Actual cash received from allocations (excluding voided) */
    received: number;
    /** expectedNet - received - reconciledTotal */
    difference: number;
    /** |difference| <= TOLERANCE_VND */
    isSettled: boolean;
    /** Number of booking lines in payout */
    bookingCount: number;
}

export interface BuildPayoutSummaryInputs {
    payout: {
        gross_amount: number;
        deduction_total: number;
        net_payout_amount: number;
        total_amount: number;
        bank_fee_total: number;
        adjustment_total: number;
    };
    totalReceived: number;
    bookingCount: number;
}

/**
 * Single computation for all payout financial totals.
 * Pure function — no side effects, no queries.
 * Matches DB recalculate_ota_payout_status_v2 logic exactly.
 */
export function buildPayoutSummary(inputs: BuildPayoutSummaryInputs): PayoutSummary {
    const gross = Number(inputs.payout.gross_amount || 0);
    const adjustments = Number(inputs.payout.deduction_total || 0);
    const expectedNet = Number(
        inputs.payout.net_payout_amount || inputs.payout.total_amount || 0
    );
    const bankFees = Number(inputs.payout.bank_fee_total || 0);
    const otherAdjust = Number(inputs.payout.adjustment_total || 0);
    const reconciledTotal = bankFees + otherAdjust;
    const received = Number(inputs.totalReceived || 0);
    const difference = expectedNet - received - reconciledTotal;
    const isSettled = Math.abs(difference) <= TOLERANCE_VND;

    return {
        gross,
        adjustments,
        expectedNet,
        bankFees,
        otherAdjust,
        reconciledTotal,
        received,
        difference,
        isSettled,
        bookingCount: inputs.bookingCount,
    };
}
