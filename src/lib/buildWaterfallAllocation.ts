/**
 * buildWaterfallAllocation — Pure function for deterministic OTA payout cash-in allocation
 *
 * Business rule: Oldest payout_date first (ASC), tie-break by id ASC.
 * If finance later defines a different settlement priority field,
 * update only the sort in this function.
 *
 * Guarantees:
 *  1. Every input payout appears in the output (even with amount=0)
 *  2. sum(allocations) <= totalAmount
 *  3. No payout is allocated more than its remaining_amount
 *  4. Allocation is deterministic given any input order
 */

export interface AllocationInput {
    id: string;
    payout_date: string | null;
    remaining_amount: number;
}

export interface AllocationOutput {
    payoutId: string;
    amount: number;
}

export function buildWaterfallAllocation(
    payouts: AllocationInput[],
    totalAmount: number
): AllocationOutput[] {
    // Sort: oldest payout_date first, tie-break by id
    const sorted = [...payouts].sort((a, b) => {
        const dateA = a.payout_date || "";
        const dateB = b.payout_date || "";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return a.id.localeCompare(b.id);
    });

    let remaining = Math.max(0, Number(totalAmount) || 0);

    return sorted.map((payout) => {
        const payoutRemaining = Math.max(0, Number(payout.remaining_amount) || 0);
        const allocate = Math.min(remaining, payoutRemaining);
        remaining -= allocate;
        return {
            payoutId: payout.id,
            amount: allocate,
        };
    });
}
