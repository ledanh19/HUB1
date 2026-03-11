import { supabase } from "@/integrations/supabase/client";
import { createAuditLog } from "@/hooks/useAuditLog";
import { toast } from "sonner";

// ============================================
// AUTO-LINK CASES TO OTA PAYOUT RECORDS
// NON-BREAKING + ADDITIVE
// Links ota_disputes to payout/finance records automatically
// Safety: only links when exactly 1 case matches
// ============================================

type RecordType = "ADJUSTMENT" | "DEBIT_NOTE" | "PAYOUT_RECORD";

const RECORD_TYPE_FIELD: Record<RecordType, string> = {
    ADJUSTMENT: "ota_adjustment_record_id",
    DEBIT_NOTE: "ota_debit_note_record_id",
    PAYOUT_RECORD: "ota_payout_record_id",
};

interface AutoLinkResult {
    linked: number;
    needsManual: number;
    linkedCaseIds: string[];
}

/**
 * Auto-link open cases to a payout when a booking is assigned to it.
 * - Finds cases matching the booking with no payout_id yet
 * - Links exactly 1 match; flags >1 as needs-manual
 * - NEVER overwrites existing payout_id
 */
export async function autoLinkCasesOnPayoutAssignment(
    payoutId: string,
    bookingId: string
): Promise<AutoLinkResult> {
    const result: AutoLinkResult = { linked: 0, needsManual: 0, linkedCaseIds: [] };

    try {
        // Find open cases for this booking that have no payout linked yet
        const { data: cases, error } = await (supabase as any)
            .from("ota_disputes")
            .select("id, case_status, payout_id, dispute_type")
            .eq("unified_booking_id", bookingId)
            .is("payout_id", null)
            .not("case_status", "in", "(CLOSED,REJECTED)");

        if (error || !cases) return result;

        if (cases.length === 0) {
            return result;
        }

        if (cases.length > 1) {
            result.needsManual = cases.length;
            return result;
        }

        // Exactly 1 case — safe to auto-link
        const caseRecord = cases[0];

        const { error: updateError } = await (supabase as any)
            .from("ota_disputes")
            .update({
                payout_id: payoutId,
                last_activity_at: new Date().toISOString(),
            })
            .eq("id", caseRecord.id)
            .is("payout_id", null); // Double-check: only if still null

        if (!updateError) {
            result.linked = 1;
            result.linkedCaseIds.push(caseRecord.id);

            // Audit log
            await createAuditLog({
                action: "LINK_FINANCIAL_RECORD",
                entity: "ota_disputes",
                entityId: caseRecord.id,
                afterData: {
                    payout_id: payoutId,
                    unified_booking_id: bookingId,
                    record_type: "PAYOUT",
                    auto_linked: true,
                },
            }).catch(() => { }); // Non-blocking
        }
    } catch (err) {
        console.error("[autoLinkCases] Error:", err);
    }

    return result;
}

/**
 * Auto-link an open case to a specific payout record (adjustment/debit note/payout record).
 * - Matches case by booking + payout (or no payout yet)
 * - Only links if the target field is NULL (never overwrites)
 * - Links payout_id too if not yet set
 */
export async function autoLinkCaseOnPayoutRecord(
    recordType: RecordType,
    recordId: string,
    payoutId: string,
    bookingId: string
): Promise<AutoLinkResult> {
    const result: AutoLinkResult = { linked: 0, needsManual: 0, linkedCaseIds: [] };
    const fieldName = RECORD_TYPE_FIELD[recordType];
    if (!fieldName) return result;

    try {
        // Find matching cases: same booking, same payout (or no payout), open status
        const { data: cases, error } = await (supabase as any)
            .from("ota_disputes")
            .select(`id, case_status, payout_id, ${fieldName}`)
            .eq("unified_booking_id", bookingId)
            .or(`payout_id.eq.${payoutId},payout_id.is.null`)
            .not("case_status", "in", "(CLOSED,REJECTED)");

        if (error || !cases) return result;

        // Filter out cases that already have this field linked
        const eligibleCases = cases.filter((c: any) => !c[fieldName]);

        if (eligibleCases.length === 0) {
            return result;
        }

        if (eligibleCases.length > 1) {
            result.needsManual = eligibleCases.length;
            return result;
        }

        // Exactly 1 eligible case — safe to auto-link
        const caseRecord = eligibleCases[0];

        const updateData: Record<string, any> = {
            [fieldName]: recordId,
            last_activity_at: new Date().toISOString(),
        };

        // Also set payout_id if not yet linked
        if (!caseRecord.payout_id) {
            updateData.payout_id = payoutId;
        }

        const { error: updateError } = await (supabase as any)
            .from("ota_disputes")
            .update(updateData)
            .eq("id", caseRecord.id);

        if (!updateError) {
            result.linked = 1;
            result.linkedCaseIds.push(caseRecord.id);

            // Audit log
            await createAuditLog({
                action: "LINK_FINANCIAL_RECORD",
                entity: "ota_disputes",
                entityId: caseRecord.id,
                afterData: {
                    payout_id: payoutId,
                    unified_booking_id: bookingId,
                    record_type: recordType,
                    record_id: recordId,
                    field: fieldName,
                    auto_linked: true,
                },
            }).catch(() => { }); // Non-blocking
        }
    } catch (err) {
        console.error("[autoLinkCaseRecord] Error:", err);
    }

    return result;
}

/**
 * Show toast feedback for auto-link results.
 * Silent if nothing happened (0 cases).
 */
export function showAutoLinkToast(result: AutoLinkResult) {
    if (result.linked > 0) {
        toast.success(`Đã tự động liên kết ${result.linked} case tranh chấp`);
    }
    if (result.needsManual > 0) {
        toast.warning(`Có ${result.needsManual} case cùng booking — vui lòng liên kết thủ công`);
    }
}
