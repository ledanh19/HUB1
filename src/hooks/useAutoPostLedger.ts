/**
 * useAutoPostLedger — Auto-hạch toán on cash-in (production-safe)
 *
 * Called after cash-in succeeds. Posts bank fees + adjustments to ledger
 * via a SINGLE atomic RPC: post_payout_ledger_entries_atomic.
 *
 * Sprint 3 upgrade: all posting happens server-side in one transaction.
 * If any posting fails, the entire operation rolls back (no partial state).
 *
 * Hardening:
 * - Tie-out delta check is now server-side (inside the RPC)
 * - Concurrency guard (in-memory Set per payoutId)
 * - Idempotent (safe to retry)
 * - Audit logging (server-side)
 */

import { supabase } from "@/integrations/supabase";
import { toast } from "sonner";

const _inFlight = new Set<string>();

export interface AutoPostResult {
    payoutId: string;
    bankFeePosted: boolean;
    bankFeeSkipped: boolean;
    adjustmentsPosted: number;
    adjustmentsSkipped: number;
    adjustmentsFailed: number;
    failedIds: string[];
    deltaSkipped: boolean;
    delta?: number;
}

/**
 * Auto-post ledger entries for multiple payouts after cash-in.
 * Uses atomic server-side RPC. Never throws, never breaks cash-in flow.
 */
export async function autoPostLedgerForPayouts(
    payoutIds: string[]
): Promise<AutoPostResult[]> {
    const results: AutoPostResult[] = [];

    for (const payoutId of payoutIds) {
        if (_inFlight.has(payoutId)) {
            continue;
        }
        _inFlight.add(payoutId);

        try {
            const result = await postViaAtomicRpc(payoutId);
            results.push(result);
        } catch (err: any) {
            console.error("[AutoPostLedger] Atomic RPC failed for", payoutId, err?.message || err);
            results.push({
                payoutId,
                bankFeePosted: false,
                bankFeeSkipped: false,
                adjustmentsPosted: 0,
                adjustmentsSkipped: 0,
                adjustmentsFailed: 1,
                failedIds: [`rpc:${payoutId}`],
                deltaSkipped: false,
            });
        } finally {
            _inFlight.delete(payoutId);
        }
    }

    showAutoPostToast(results);
    return results;
}

/**
 * Retry auto-post for a single payout (called from retry button).
 */
export async function retryAutoPost(payoutId: string): Promise<AutoPostResult> {
    if (_inFlight.has(payoutId)) {
        toast.info("Đang xử lý, vui lòng chờ...");
        return {
            payoutId,
            bankFeePosted: false,
            bankFeeSkipped: true,
            adjustmentsPosted: 0,
            adjustmentsSkipped: 0,
            adjustmentsFailed: 0,
            failedIds: [],
            deltaSkipped: false,
        };
    }

    _inFlight.add(payoutId);
    try {
        const result = await postViaAtomicRpc(payoutId);
        showAutoPostToast([result]);
        return result;
    } catch (err: any) {
        const failResult: AutoPostResult = {
            payoutId,
            bankFeePosted: false,
            bankFeeSkipped: false,
            adjustmentsPosted: 0,
            adjustmentsSkipped: 0,
            adjustmentsFailed: 1,
            failedIds: [`rpc:${payoutId}`],
            deltaSkipped: false,
        };
        toast.error(`Hạch toán thất bại: ${err?.message || "Lỗi không xác định"}`, { duration: 8000 });
        return failResult;
    } finally {
        _inFlight.delete(payoutId);
    }
}

// ── Atomic RPC call ─────────────────────────────────────────────

async function postViaAtomicRpc(payoutId: string): Promise<AutoPostResult> {
    const { data, error } = await supabase.rpc("post_payout_ledger_entries_atomic" as any, {
        p_payout_id: payoutId,
        p_force: false,
    });

    if (error) {
        console.error("[AutoPostLedger] RPC error:", error.message);
        const msg = error.message || "";
        if (msg.includes("STATUS_INVALID")) {
            return {
                payoutId,
                bankFeePosted: false,
                bankFeeSkipped: true,
                adjustmentsPosted: 0,
                adjustmentsSkipped: 0,
                adjustmentsFailed: 0,
                failedIds: [],
                deltaSkipped: false,
            };
        }
        throw error;
    }

    const result = data as unknown as Record<string, any> | null;
    if (!result) {
        return {
            payoutId,
            bankFeePosted: false,
            bankFeeSkipped: false,
            adjustmentsPosted: 0,
            adjustmentsSkipped: 0,
            adjustmentsFailed: 0,
            failedIds: [],
            deltaSkipped: false,
        };
    }

    if (result.status === "skipped") {
        return {
            payoutId,
            bankFeePosted: false,
            bankFeeSkipped: false,
            adjustmentsPosted: 0,
            adjustmentsSkipped: 0,
            adjustmentsFailed: 0,
            failedIds: [],
            deltaSkipped: true,
            delta: Number(result.delta || 0),
        };
    }

    return {
        payoutId,
        bankFeePosted: !!result.bank_fee_posted,
        bankFeeSkipped: !!result.bank_fee_skipped,
        adjustmentsPosted: Number(result.adjustments_posted || 0),
        adjustmentsSkipped: Number(result.adjustments_skipped || 0),
        adjustmentsFailed: 0,
        failedIds: [],
        deltaSkipped: false,
        delta: Number(result.delta || 0),
    };
}

// ── Toast helper ───────────────────────────────────────────────

function showAutoPostToast(results: AutoPostResult[]) {
    const totalPosted = results.reduce(
        (sum, r) => sum + (r.bankFeePosted ? 1 : 0) + r.adjustmentsPosted,
        0
    );
    const totalFailed = results.reduce(
        (sum, r) => sum + r.adjustmentsFailed,
        0
    );
    const totalSkippedDelta = results.filter((r) => r.deltaSkipped).length;
    const allFailedIds = results.flatMap((r) => r.failedIds);

    if (totalSkippedDelta > 0) {
        toast.warning(
            `${totalSkippedDelta} payout chưa đối soát khớp — không tự động hạch toán.`,
            { duration: 5000 }
        );
    }

    if (totalPosted > 0 && totalFailed === 0) {
        toast.success(`Đã tự động hạch toán ${totalPosted} mục vào sổ cái`, {
            duration: 4000,
        });
    } else if (totalFailed > 0 && totalPosted > 0) {
        toast.error(
            `Hạch toán: ${totalPosted} thành công, ${totalFailed} lỗi. Vào chi tiết payout để thử lại.`,
            { duration: 8000, description: `Mục lỗi: ${allFailedIds.slice(0, 3).join(", ")}${allFailedIds.length > 3 ? "..." : ""}` }
        );
    } else if (totalFailed > 0 && totalPosted === 0) {
        toast.error(
            `Hạch toán thất bại: ${totalFailed} mục không thể ghi sổ cái. Vào chi tiết payout để thử lại.`,
            { duration: 8000, description: `Mục lỗi: ${allFailedIds.slice(0, 3).join(", ")}${allFailedIds.length > 3 ? "..." : ""}` }
        );
    }
}
