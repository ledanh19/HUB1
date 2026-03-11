import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================
// CASE CENTER — Pure Case Tracking
// TRACKING ONLY: Do not add finance side-effects here.
// See docs/disputes/CaseTrackingOnly.md
// ============================================

// === TYPES ===

export type CaseType = "DISPUTE" | "REFUND";

export type CaseStatus =
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "SETTLED"
    | "CLOSED";

export type RefundChannel = "DIRECT_TO_GUEST" | "VIA_OTA";

/** @deprecated — kept for backward compat only. Disputes does not execute settlements. */
export type SettlementType = "DIRECT_CASH_OUT" | "OTA_DEDUCTION" | "OTA_DEBIT_NOTE";

export interface CaseRecord {
    id: string;
    unified_booking_id: string;
    payout_id: string | null;
    // Legacy fields (kept for backward compat)
    dispute_type: string;
    amount_in_dispute: number;
    status: string; // legacy enum
    // New standardized fields
    case_type: CaseType;
    case_status: CaseStatus;
    refund_channel: RefundChannel | null;
    /** @deprecated — kept for DB compat, not used in UI */
    settlement_type: SettlementType | null;
    amount_requested: number;
    amount_approved: number;
    currency: string;
    ota_reference: string | null;
    // Link fields (readonly pointers — set from OTA Payout Detail)
    /** @deprecated — kept for DB compat */
    payment_request_id: string | null;
    /** @deprecated — kept for DB compat */
    cash_out_id: string | null;
    ota_payout_record_id: string | null;
    ota_adjustment_record_id: string | null;
    ota_debit_note_record_id: string | null;
    // Timestamps
    opened_at: string;
    closed_at: string | null;
    last_activity_at: string | null;
    resolution_note: string | null;
    assigned_to: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    // Enriched (joined client-side)
    ota_source?: string;
    guest_name?: string;
    payment_type?: string;
}

// === DISPLAY HELPERS ===

export const CASE_TYPE_DISPLAY: Record<CaseType, { label: string; description: string }> = {
    DISPUTE: { label: "Tranh chấp", description: "Tranh chấp tiền với OTA hoặc khách" },
    REFUND: { label: "Hoàn tiền", description: "Yêu cầu hoàn tiền cho khách" },
};

export const CASE_STATUS_DISPLAY: Record<CaseStatus, { label: string; variant: string; description: string }> = {
    DRAFT: { label: "Nháp", variant: "default", description: "Chưa gửi" },
    SUBMITTED: { label: "Đã gửi", variant: "info", description: "Đã gửi yêu cầu" },
    UNDER_REVIEW: { label: "Đang xem xét", variant: "warning", description: "Đang được xem xét" },
    APPROVED: { label: "Đã duyệt", variant: "success", description: "Đã được duyệt" },
    REJECTED: { label: "Từ chối", variant: "danger", description: "Yêu cầu bị từ chối" },
    SETTLED: { label: "Đã quyết toán", variant: "success", description: "Đã có bằng chứng & quyết toán" },
    CLOSED: { label: "Đã đóng", variant: "default", description: "Case đã kết thúc" },
};

export const REFUND_CHANNEL_DISPLAY: Record<RefundChannel, { label: string; description: string }> = {
    DIRECT_TO_GUEST: { label: "Hoàn trực tiếp cho khách", description: "Chuyển khoản / tiền mặt cho khách" },
    VIA_OTA: { label: "Hoàn qua OTA", description: "OTA xử lý hoàn tiền" },
};

/** @deprecated — Disputes does not execute settlements. Display only for legacy records. */
export const SETTLEMENT_TYPE_DISPLAY: Record<SettlementType, { label: string; description: string }> = {
    DIRECT_CASH_OUT: { label: "Chi tiền trực tiếp", description: "Xuất tiền từ quỹ" },
    OTA_DEDUCTION: { label: "OTA trừ vào payout", description: "OTA trừ ở kỳ thanh toán sau" },
    OTA_DEBIT_NOTE: { label: "OTA gửi debit note", description: "OTA yêu cầu trả tiền riêng" },
};

// === STATE MACHINE ===

export const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
    DRAFT: ["SUBMITTED"],
    SUBMITTED: ["UNDER_REVIEW", "REJECTED", "CLOSED"],
    UNDER_REVIEW: ["APPROVED", "REJECTED", "CLOSED"],
    APPROVED: ["SETTLED", "CLOSED"],
    REJECTED: ["CLOSED"],
    SETTLED: ["CLOSED"],
    CLOSED: [], // terminal
};

export function isValidTransition(from: CaseStatus, to: CaseStatus): boolean {
    return CASE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// === SETTLEMENT LOGIC REMOVED ===
// Settlement/finance validation has been removed from Disputes.
// All finance actions happen in OTA Payout Detail or Payment Requests.
// See docs/disputes/CaseTrackingOnly.md

// === HOOKS ===

export function useCaseCenter(filters?: {
    caseType?: CaseType | "all";
    caseStatus?: CaseStatus | "all";
    bookingId?: string;
}) {
    return useQuery({
        queryKey: ["case_center", filters],
        staleTime: 30_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const { fetchAnGiaBookingIds } = await import("./useAnGiaProperties");
            const anGiaBookingIds = await fetchAnGiaBookingIds();

            let query = (supabase as any)
                .from("ota_disputes")
                .select("*")
                .order("opened_at", { ascending: false });

            if (filters?.bookingId) {
                query = query.eq("unified_booking_id", filters.bookingId);
            } else if (anGiaBookingIds.length > 0) {
                query = query.in("unified_booking_id", anGiaBookingIds);
            }

            if (filters?.caseType && filters.caseType !== "all") {
                query = query.eq("case_type", filters.caseType);
            }

            if (filters?.caseStatus && filters.caseStatus !== "all") {
                query = query.eq("case_status", filters.caseStatus);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Enrich with booking data
            const bookingIds = (data || []).map((d: any) => d.unified_booking_id);
            const { data: bookings } = await supabase
                .from("bookings_mirror")
                .select("unified_booking_id, ota_source, guest_name, payment_type")
                .in("unified_booking_id", bookingIds);

            const bookingsMap = new Map(
                (bookings || []).map((b: any) => [b.unified_booking_id, b])
            );

            const items = (data || []).map((d: any) => {
                const booking = bookingsMap.get(d.unified_booking_id);
                return {
                    ...d,
                    case_type: d.case_type || "DISPUTE",
                    case_status: d.case_status || "DRAFT",
                    amount_requested: d.amount_requested || d.amount_in_dispute || 0,
                    amount_approved: d.amount_approved || 0,
                    currency: d.currency || "VND",
                    ota_source: booking?.ota_source,
                    guest_name: booking?.guest_name,
                    payment_type: booking?.payment_type,
                } as CaseRecord;
            });

            // Sort: open cases first
            items.sort((a: CaseRecord, b: CaseRecord) => {
                const openStatuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"];
                const isAOpen = openStatuses.includes(a.case_status);
                const isBOpen = openStatuses.includes(b.case_status);
                if (isAOpen && !isBOpen) return -1;
                if (!isAOpen && isBOpen) return 1;
                return new Date(b.opened_at || b.created_at).getTime() -
                    new Date(a.opened_at || a.created_at).getTime();
            });

            return items;
        },
    });
}

export function useCaseCenterStats() {
    const { data: cases = [] } = useCaseCenter({ caseType: "all", caseStatus: "all" });

    const openStatuses: CaseStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"];
    const openCases = cases.filter(c => openStatuses.includes(c.case_status));

    return {
        totalCases: cases.length,
        openCount: openCases.length,
        openAmount: openCases.reduce((sum, c) => sum + Number(c.amount_requested), 0),
        settledCount: cases.filter(c => c.case_status === "SETTLED").length,
        closedCount: cases.filter(c => c.case_status === "CLOSED").length,
        disputeCount: cases.filter(c => c.case_type === "DISPUTE").length,
        refundCount: cases.filter(c => c.case_type === "REFUND").length,
        approvedAwaitingSettlement: cases.filter(c => c.case_status === "APPROVED").length,
    };
}

export function useCreateCase() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            unified_booking_id: string;
            dispute_type: string;
            case_type: CaseType;
            amount_requested: number;
            refund_channel?: RefundChannel;
            note?: string;
            payout_id?: string;
            ota_reference?: string;
            // Booking context (for audit)
            guest_name?: string;
            ota_source?: string;
            booking_code?: string;
            property_id?: string;
            property_name?: string;
            payment_type?: string;
        }) => {
            const { data: user } = await supabase.auth.getUser();
            const userId = user?.user?.id;

            const insertData: Record<string, unknown> = {
                unified_booking_id: data.unified_booking_id,
                dispute_type: data.dispute_type,
                case_type: data.case_type,
                case_status: "SUBMITTED",
                amount_in_dispute: data.amount_requested,
                amount_requested: data.amount_requested,
                status: "OPEN", // legacy field — kept for backward compat
                opened_at: new Date().toISOString(),
                last_activity_at: new Date().toISOString(),
                created_by: userId,
                resolution_note: data.note || null,
                payout_id: data.payout_id || null,
                ota_reference: data.ota_reference || null,
                currency: "VND",
            };

            if (data.refund_channel) {
                insertData.refund_channel = data.refund_channel;
            }

            // For VIA_OTA refund: expect booking cancellation
            // Guard: always send boolean (DB default is false)
            insertData.booking_cancellation_expected = data.refund_channel === "VIA_OTA";
            if (data.refund_channel === "VIA_OTA") {
                insertData.booking_cancellation_status = "NOT_CANCELLED";
            }

            // Step 1: Create case (single insert, no finance artifacts)
            // ⚠️ SEPARATION OF CONCERNS: Disputes NEVER creates payment_requests,
            // cash_outs, cashflow_entries, or OTA payout adjustments.
            // All finance actions happen in OTA Payout Detail or Payment Requests page.
            const { data: caseResult, error: caseError } = await supabase
                .from("ota_disputes")
                .insert(insertData as any)
                .select()
                .single();

            if (caseError) throw caseError;

            // Step 2: Audit log for case creation
            try {
                const { createAuditLog } = await import("./useAuditLog");
                await createAuditLog({
                    action: "CREATE_CASE",
                    entity: "ota_disputes",
                    entityId: caseResult.id,
                    afterData: {
                        case_type: data.case_type,
                        dispute_type: data.dispute_type,
                        amount: data.amount_requested,
                        refund_channel: data.refund_channel || null,
                        note: data.note || null,
                    },
                });
            } catch { /* audit log failure is non-critical */ }

            // Step 3: Audit log for booking history timeline
            try {
                const { createAuditLog } = await import("./useAuditLog");
                const caseTypeLabel = data.case_type === "REFUND"
                    ? (data.refund_channel === "DIRECT_TO_GUEST" ? "Yêu cầu hoàn tiền trực tiếp" : "Yêu cầu OTA hoàn tiền")
                    : (data.dispute_type as string).includes("NO_SHOW") ? "Đánh dấu No-show" : "Tạo tranh chấp";
                await createAuditLog({
                    action: caseTypeLabel,
                    entity: "bookings_mirror",
                    entityId: data.unified_booking_id,
                    afterData: {
                        case_id: caseResult.id,
                        case_type: data.case_type,
                        dispute_type: data.dispute_type,
                        amount: data.amount_requested,
                        refund_channel: data.refund_channel || null,
                        note: data.note || null,
                    },
                });
            } catch { /* audit log failure is non-critical */ }

            return caseResult;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["case_center"] });
            queryClient.invalidateQueries({ queryKey: ["dispute_tracking"] });
            queryClient.invalidateQueries({ queryKey: ["ota_disputes"] });
            queryClient.invalidateQueries({ queryKey: ["booking_cases"] });
            queryClient.invalidateQueries({ queryKey: ["booking_audit_logs"] });
            toast.success("Đã tạo case");
        },
        onError: (error: Error) => {
            toast.error("Lỗi tạo case: " + error.message);
        },
    });
}

export function useUpdateCaseStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            id: string;
            case_status: CaseStatus;
            resolution_note?: string;
            amount_approved?: number;
        }) => {
            const updateData: Record<string, unknown> = {
                case_status: data.case_status,
                last_activity_at: new Date().toISOString(),
            };

            if (data.resolution_note !== undefined) {
                updateData.resolution_note = data.resolution_note;
            }
            if (data.amount_approved !== undefined) {
                updateData.amount_approved = data.amount_approved;
            }

            // Sync legacy status field
            const legacyStatusMap: Record<string, string> = {
                DRAFT: "OPEN",
                SUBMITTED: "OPEN",
                UNDER_REVIEW: "IN_REVIEW",
                APPROVED: "IN_REVIEW",
                REJECTED: "LOST",
                SETTLED: "WON",
                CLOSED: "CLOSED",
            };
            updateData.status = legacyStatusMap[data.case_status] || "OPEN";

            // Close timestamp for terminal states
            if (["SETTLED", "CLOSED", "REJECTED"].includes(data.case_status)) {
                updateData.closed_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from("ota_disputes")
                .update(updateData)
                .eq("id", data.id);

            if (error) throw error;

            // Audit log for status update
            try {
                const { createAuditLog } = await import("./useAuditLog");
                await createAuditLog({
                    action: "UPDATE_CASE_STATUS",
                    entity: "ota_disputes",
                    entityId: data.id,
                    afterData: {
                        case_status: data.case_status,
                        resolution_note: data.resolution_note || null,
                        amount_approved: data.amount_approved || null,
                    },
                });
            } catch { /* audit log failure is non-critical */ }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["case_center"] });
            queryClient.invalidateQueries({ queryKey: ["dispute_tracking"] });
            queryClient.invalidateQueries({ queryKey: ["ota_disputes"] });
            toast.success("Đã cập nhật trạng thái case");
        },
        onError: (error: Error) => {
            toast.error("Lỗi: " + error.message);
        },
    });
}

export function useLinkCaseRecord() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            id: string;
            field: "payout_id" | "ota_adjustment_record_id" | "ota_debit_note_record_id" | "ota_payout_record_id";
            value: string;
        }) => {
            const { error } = await supabase
                .from("ota_disputes")
                .update({
                    [data.field]: data.value,
                    last_activity_at: new Date().toISOString(),
                })
                .eq("id", data.id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["case_center"] });
            queryClient.invalidateQueries({ queryKey: ["dispute_tracking"] });
            toast.success("Đã liên kết bản ghi");
        },
        onError: (error: Error) => {
            toast.error("Lỗi link: " + error.message);
        },
    });
}

// === useSettleCase REMOVED ===
// Settlement logic has been removed from Disputes.
// All finance execution happens in OTA Payout Detail.
// See docs/disputes/CaseTrackingOnly.md
