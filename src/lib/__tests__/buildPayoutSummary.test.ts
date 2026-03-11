/**
 * Golden Scenarios Replay Suite — buildPayoutSummary
 *
 * These tests guarantee that Header KPI ≡ Reconciliation ≡ Cash-In
 * for any given payout. If a future change breaks the formula,
 * these tests MUST fail.
 *
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { buildPayoutSummary, TOLERANCE_VND, type PayoutSummary } from "../buildPayoutSummary";

// Helper: create a payout-like object from shorthand
function makePayout(gross: number, adj: number, bankFee = 0, adjTotal = 0) {
    return {
        gross_amount: gross,
        deduction_total: adj,
        net_payout_amount: gross + adj, // matches DB migration formula
        total_amount: gross + adj,
        bank_fee_total: bankFee,
        adjustment_total: adjTotal,
    };
}

describe("buildPayoutSummary", () => {
    // ─────────────────────────────────────────────────────────────
    // Scenario 1: Normal payout with adjustments (screenshot match)
    //   gross=5,588,000; adj=+2,581,910; received=8,169,910
    //   expectedNet=8,169,910; diff=0; settled=true
    // ─────────────────────────────────────────────────────────────
    it("Scenario 1: payout with positive adjustment — diff 0, settled", () => {
        const summary = buildPayoutSummary({
            payout: makePayout(5_588_000, 2_581_910),
            totalReceived: 8_169_910,
            bookingCount: 12,
        });

        expect(summary.gross).toBe(5_588_000);
        expect(summary.adjustments).toBe(2_581_910);
        expect(summary.expectedNet).toBe(8_169_910);
        expect(summary.received).toBe(8_169_910);
        expect(summary.difference).toBe(0);
        expect(summary.isSettled).toBe(true);
        expect(summary.bookingCount).toBe(12);
    });

    // ─────────────────────────────────────────────────────────────
    // Scenario 2: Received=0 with negative adjustment
    //   gross=5,000,000; adj=-500,000; received=0
    //   expectedNet=4,500,000; diff=4,500,000; settled=false
    // ─────────────────────────────────────────────────────────────
    it("Scenario 2: received=0, adjustments exist — not settled", () => {
        const summary = buildPayoutSummary({
            payout: makePayout(5_000_000, -500_000),
            totalReceived: 0,
            bookingCount: 3,
        });

        expect(summary.gross).toBe(5_000_000);
        expect(summary.adjustments).toBe(-500_000);
        expect(summary.expectedNet).toBe(4_500_000);
        expect(summary.received).toBe(0);
        expect(summary.difference).toBe(4_500_000);
        expect(summary.isSettled).toBe(false);
    });

    // ─────────────────────────────────────────────────────────────
    // Scenario 3: Cancelled booking lines — all zeros
    //   gross=0; adj=0; received=0
    //   expectedNet=0; diff=0; settled=true
    // ─────────────────────────────────────────────────────────────
    it("Scenario 3: all zeros (cancelled) — settled", () => {
        const summary = buildPayoutSummary({
            payout: makePayout(0, 0),
            totalReceived: 0,
            bookingCount: 1,
        });

        expect(summary.gross).toBe(0);
        expect(summary.adjustments).toBe(0);
        expect(summary.expectedNet).toBe(0);
        expect(summary.difference).toBe(0);
        expect(summary.isSettled).toBe(true);
        expect(summary.bookingCount).toBe(1);
    });

    // ─────────────────────────────────────────────────────────────
    // Scenario 4: Partial received with bank fees
    //   gross=10,000,000; adj=-1,000,000; received=8,000,000; bankFee=500,000
    //   expectedNet=9,000,000; reconciledTotal=500,000
    //   difference = 9,000,000 - 8,000,000 - 500,000 = 500,000; not settled
    // ─────────────────────────────────────────────────────────────
    it("Scenario 4: partial receive + bank fees — not settled", () => {
        const summary = buildPayoutSummary({
            payout: makePayout(10_000_000, -1_000_000, 500_000, 0),
            totalReceived: 8_000_000,
            bookingCount: 5,
        });

        expect(summary.gross).toBe(10_000_000);
        expect(summary.adjustments).toBe(-1_000_000);
        expect(summary.expectedNet).toBe(9_000_000);
        expect(summary.bankFees).toBe(500_000);
        expect(summary.reconciledTotal).toBe(500_000);
        expect(summary.received).toBe(8_000_000);
        expect(summary.difference).toBe(500_000);
        expect(summary.isSettled).toBe(false);
    });

    // ─────────────────────────────────────────────────────────────
    // Single-source invariant:
    //   summary.expectedNet MUST equal net_payout_amount (not recomputed)
    // ─────────────────────────────────────────────────────────────
    it("Invariant: expectedNet comes from DB net_payout_amount, not recomputed", () => {
        // Simulate a case where DB net_payout_amount differs from gross+adj
        // (e.g., DB was manually corrected). The summary MUST follow DB.
        const payout = {
            gross_amount: 1_000_000,
            deduction_total: -100_000,
            net_payout_amount: 950_000,  // DB says 950k, not 900k
            total_amount: 950_000,
            bank_fee_total: 0,
            adjustment_total: 0,
        };

        const summary = buildPayoutSummary({
            payout,
            totalReceived: 950_000,
            bookingCount: 1,
        });

        // expectedNet follows DB, not gross + adjustments
        expect(summary.expectedNet).toBe(950_000);
        expect(summary.expectedNet).not.toBe(1_000_000 + (-100_000));
        expect(summary.isSettled).toBe(true);
    });

    // ─────────────────────────────────────────────────────────────
    // Tolerance boundary: ±1 VND is considered settled
    // ─────────────────────────────────────────────────────────────
    it("Tolerance: 1 VND difference is still settled", () => {
        const summary = buildPayoutSummary({
            payout: makePayout(1_000_000, 0),
            totalReceived: 999_999,
            bookingCount: 1,
        });

        expect(summary.difference).toBe(1);
        expect(summary.isSettled).toBe(true);
    });

    it("Tolerance: 2 VND difference is NOT settled", () => {
        const summary = buildPayoutSummary({
            payout: makePayout(1_000_000, 0),
            totalReceived: 999_998,
            bookingCount: 1,
        });

        expect(summary.difference).toBe(2);
        expect(summary.isSettled).toBe(false);
    });
});
