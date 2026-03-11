/**
 * Shared helper for resolving Host Settlement NET amount.
 *
 * Architecture rule (Roomrise Snapshot Authority):
 *
 * | Status                                        | NET authority             |
 * | --------------------------------------------- | ------------------------- |
 * | DRAFT                                         | Recompute from components |
 * | FINALIZED / CLOSED / SETTLED / PARTIALLY_PAID | remaining_amount snapshot |
 * | VOID                                          | 0                         |
 *
 * `remaining_amount` IS the net position snapshot written at finalize.
 * There is no separate `snapshot_net` column.
 */

export interface HostSettlementNetInput {
    id?: string;
    status?: string | null;
    remaining_amount?: number | null;
    total_payable_amount?: number | null;
    total_host_collected?: number | null;
    total_deposits_applied?: number | null;
    total_prepaids_applied?: number | null;
}

export interface HostSettlementNetResult {
    netAmount: number;
    netDirection: "PAY" | "RECEIVE";
    snapshotMismatch: boolean;
    snapshotDelta: number;
}

/**
 * Resolve the authoritative NET amount for a host settlement.
 *
 * - DRAFT → always recompute from component columns
 * - VOID → always 0
 * - Otherwise (locked) → use remaining_amount snapshot; fallback to recompute + warn if null
 */
export function resolveHostSettlementNet(row: HostSettlementNetInput): HostSettlementNetResult {
    const status = row.status || "SETTLED";

    // Rule: VOID settlements always = 0
    if (status === "VOID") {
        return { netAmount: 0, netDirection: "PAY", snapshotMismatch: false, snapshotDelta: 0 };
    }

    const isDraft = status === "DRAFT";

    // Recompute NET from component columns (always, for validation or draft use)
    const recomputedNet =
        (Number(row.total_payable_amount) || 0) -
        (Number(row.total_host_collected) || 0) -
        (Number(row.total_deposits_applied) || 0) -
        (Number(row.total_prepaids_applied) || 0);

    // Parse snapshot: distinguish real-zero from null
    const snapshotNet =
        row.remaining_amount == null ? null : Number(row.remaining_amount);

    let netAmount: number;
    let snapshotMismatch = false;
    let snapshotDelta = 0;

    if (isDraft) {
        // Draft: always recompute
        netAmount = recomputedNet;
    } else if (snapshotNet != null) {
        // Locked with valid snapshot: use snapshot as authority
        netAmount = snapshotNet;

        // Dev assertion: warn if snapshot diverges from recomputed
        snapshotDelta = recomputedNet - snapshotNet;
        if (Math.abs(snapshotDelta) > 1) {
            snapshotMismatch = true;
            console.warn("[SOT_MISMATCH] Settlement snapshot diverges from recomputed NET", {
                settlementId: row.id,
                snapshot: snapshotNet,
                recomputed: recomputedNet,
                delta: snapshotDelta,
            });
        }
    } else {
        // Locked but snapshot is null: safety fallback + warn
        netAmount = recomputedNet;
        console.warn("[SOT_MISSING] Locked settlement missing snapshot (remaining_amount is null)", {
            settlementId: row.id,
            status,
            fallbackNet: recomputedNet,
        });
    }

    const netDirection: "PAY" | "RECEIVE" = netAmount >= 0 ? "PAY" : "RECEIVE";

    return { netAmount, netDirection, snapshotMismatch, snapshotDelta };
}
