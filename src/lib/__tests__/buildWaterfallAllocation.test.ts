/**
 * Unit tests for buildWaterfallAllocation
 *
 * Test matrix covers the 4 required cases plus edge cases.
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import { buildWaterfallAllocation } from "../buildWaterfallAllocation";

describe("buildWaterfallAllocation", () => {
    // ──────────────────────────────────────────────────────────
    // Case A: 2 payouts, total covers both → both full
    // ──────────────────────────────────────────────────────────
    it("Case A: total covers both payouts → both fully allocated", () => {
        const payouts = [
            { id: "aaa", payout_date: "2026-02-01", remaining_amount: 5_000_000 },
            { id: "bbb", payout_date: "2026-02-15", remaining_amount: 3_000_000 },
        ];
        const result = buildWaterfallAllocation(payouts, 8_000_000);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ payoutId: "aaa", amount: 5_000_000 });
        expect(result[1]).toEqual({ payoutId: "bbb", amount: 3_000_000 });
    });

    // ──────────────────────────────────────────────────────────
    // Case B: 2 payouts, total only covers oldest → newer gets 0
    // ──────────────────────────────────────────────────────────
    it("Case B: total only covers oldest payout → newer gets 0", () => {
        const payouts = [
            { id: "bbb", payout_date: "2026-02-15", remaining_amount: 3_000_000 },
            { id: "aaa", payout_date: "2026-02-01", remaining_amount: 5_000_000 },
        ];
        const result = buildWaterfallAllocation(payouts, 5_000_000);

        // Oldest (aaa) should be first and fully allocated
        expect(result[0]).toEqual({ payoutId: "aaa", amount: 5_000_000 });
        // Newer (bbb) should still appear but with 0
        expect(result[1]).toEqual({ payoutId: "bbb", amount: 0 });
    });

    // ──────────────────────────────────────────────────────────
    // Case C: 2 payouts, total covers oldest + partial newer
    // ──────────────────────────────────────────────────────────
    it("Case C: total covers oldest fully + partial newer", () => {
        const payouts = [
            { id: "aaa", payout_date: "2026-02-01", remaining_amount: 5_000_000 },
            { id: "bbb", payout_date: "2026-02-15", remaining_amount: 3_000_000 },
        ];
        const result = buildWaterfallAllocation(payouts, 6_000_000);

        expect(result[0]).toEqual({ payoutId: "aaa", amount: 5_000_000 });
        expect(result[1]).toEqual({ payoutId: "bbb", amount: 1_000_000 });
    });

    // ──────────────────────────────────────────────────────────
    // Case D: 3 payouts same date → tie-break by id ASC
    // ──────────────────────────────────────────────────────────
    it("Case D: 3 payouts same date → tie-break by id ASC", () => {
        const payouts = [
            { id: "ccc", payout_date: "2026-03-01", remaining_amount: 2_000_000 },
            { id: "aaa", payout_date: "2026-03-01", remaining_amount: 3_000_000 },
            { id: "bbb", payout_date: "2026-03-01", remaining_amount: 4_000_000 },
        ];
        // Only 5M for 9M total remaining
        const result = buildWaterfallAllocation(payouts, 5_000_000);

        // Order: aaa (3M), bbb (4M), ccc (2M)
        expect(result[0]).toEqual({ payoutId: "aaa", amount: 3_000_000 }); // full
        expect(result[1]).toEqual({ payoutId: "bbb", amount: 2_000_000 }); // partial
        expect(result[2]).toEqual({ payoutId: "ccc", amount: 0 });          // nothing left
    });

    // ──────────────────────────────────────────────────────────
    // Edge: totalAmount = 0 → all payouts get 0
    // ──────────────────────────────────────────────────────────
    it("Edge: totalAmount = 0 → all get 0", () => {
        const payouts = [
            { id: "aaa", payout_date: "2026-02-01", remaining_amount: 5_000_000 },
        ];
        const result = buildWaterfallAllocation(payouts, 0);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ payoutId: "aaa", amount: 0 });
    });

    // ──────────────────────────────────────────────────────────
    // Edge: empty payouts → empty result
    // ──────────────────────────────────────────────────────────
    it("Edge: empty payouts → empty array", () => {
        const result = buildWaterfallAllocation([], 10_000_000);
        expect(result).toEqual([]);
    });

    // ──────────────────────────────────────────────────────────
    // Invariant: sum(allocations) never exceeds totalAmount
    // ──────────────────────────────────────────────────────────
    it("Invariant: sum of allocations never exceeds totalAmount", () => {
        const payouts = [
            { id: "aaa", payout_date: "2026-01-01", remaining_amount: 10_000_000 },
            { id: "bbb", payout_date: "2026-02-01", remaining_amount: 10_000_000 },
        ];
        const total = 7_500_000;
        const result = buildWaterfallAllocation(payouts, total);
        const sumAllocated = result.reduce((s, a) => s + a.amount, 0);

        expect(sumAllocated).toBeLessThanOrEqual(total);
        expect(sumAllocated).toBe(total);
    });

    // ──────────────────────────────────────────────────────────
    // Invariant: no payout allocated more than remaining
    // ──────────────────────────────────────────────────────────
    it("Invariant: no payout allocated more than its remaining_amount", () => {
        const payouts = [
            { id: "aaa", payout_date: "2026-01-01", remaining_amount: 2_000_000 },
            { id: "bbb", payout_date: "2026-02-01", remaining_amount: 3_000_000 },
        ];
        const result = buildWaterfallAllocation(payouts, 100_000_000);

        expect(result[0].amount).toBeLessThanOrEqual(2_000_000);
        expect(result[1].amount).toBeLessThanOrEqual(3_000_000);
    });

    // ──────────────────────────────────────────────────────────
    // Input order does NOT affect output (deterministic)
    // ──────────────────────────────────────────────────────────
    it("Deterministic: input order does not affect output", () => {
        const p1 = { id: "aaa", payout_date: "2026-01-01", remaining_amount: 5_000_000 };
        const p2 = { id: "bbb", payout_date: "2026-02-01", remaining_amount: 3_000_000 };

        const result1 = buildWaterfallAllocation([p1, p2], 6_000_000);
        const result2 = buildWaterfallAllocation([p2, p1], 6_000_000);

        expect(result1).toEqual(result2);
    });

    // ──────────────────────────────────────────────────────────
    // Single payout full allocation
    // ──────────────────────────────────────────────────────────
    it("Single payout: exact amount → full allocation", () => {
        const payouts = [
            { id: "aaa", payout_date: "2026-01-01", remaining_amount: 5_000_000 },
        ];
        const result = buildWaterfallAllocation(payouts, 5_000_000);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ payoutId: "aaa", amount: 5_000_000 });
    });

    // ──────────────────────────────────────────────────────────
    // Single payout partial allocation
    // ──────────────────────────────────────────────────────────
    it("Single payout: partial amount → partial allocation", () => {
        const payouts = [
            { id: "aaa", payout_date: "2026-01-01", remaining_amount: 5_000_000 },
        ];
        const result = buildWaterfallAllocation(payouts, 2_000_000);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({ payoutId: "aaa", amount: 2_000_000 });
    });
});
