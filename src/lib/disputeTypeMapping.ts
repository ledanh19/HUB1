/**
 * Dispute Type ↔ OTA Payout Adjustment Reason Mapping
 *
 * SINGLE SOURCE OF TRUTH — all UI dropdowns and validation must use this mapping.
 * Disputes track the case; OTA Payout Detail handles finance.
 * This mapping bridges the two by defining which payout adjustment reasons
 * correspond to each dispute type.
 */

export const DISPUTE_TYPE_TO_PAYOUT_REASON_MAP = {
    OTA_WITHHOLD: ["WITHHOLD", "HOLD"],
    OTA_DEDUCTION: ["DEDUCTION"],
    NO_SHOW: ["DEDUCTION", "DEBIT_NOTE"],
    OTA_COMPLAINT: ["DEBIT_NOTE", "DEDUCTION"],
    OTA_REFUND_REQUEST: ["REFUND_RECORD", "DEDUCTION"],
    GUEST_REFUND: ["REFUND_RECORD"],
    DIRECT_REFUND: ["REFUND_RECORD"],
    CHARGEBACK: ["DEBIT_NOTE"],
} as const;

/** All dispute types available for case creation */
export type DisputeTypeMapped = keyof typeof DISPUTE_TYPE_TO_PAYOUT_REASON_MAP;

/** Human-readable labels for each dispute type */
export const DISPUTE_TYPE_LABELS: Record<DisputeTypeMapped, string> = {
    OTA_WITHHOLD: "OTA giữ tiền",
    OTA_DEDUCTION: "OTA trừ tiền",
    NO_SHOW: "No-show",
    OTA_COMPLAINT: "Khiếu nại OTA",
    OTA_REFUND_REQUEST: "Yêu cầu OTA hoàn tiền",
    GUEST_REFUND: "Hoàn tiền khách",
    DIRECT_REFUND: "Hoàn trực tiếp",
    CHARGEBACK: "Chargeback",
};

/** Get all dispute types as array (for dropdown generation) */
export function getDisputeTypeOptions(): { value: DisputeTypeMapped; label: string }[] {
    return Object.entries(DISPUTE_TYPE_LABELS).map(([value, label]) => ({
        value: value as DisputeTypeMapped,
        label,
    }));
}

/** Get payout reasons for a dispute type */
export function getPayoutReasonsForDisputeType(
    disputeType: DisputeTypeMapped
): readonly string[] {
    return DISPUTE_TYPE_TO_PAYOUT_REASON_MAP[disputeType] || [];
}

/** Validate that a dispute type exists in the mapping */
export function isValidDisputeType(type: string): type is DisputeTypeMapped {
    return type in DISPUTE_TYPE_TO_PAYOUT_REASON_MAP;
}
