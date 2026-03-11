import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================
// OTA DEBIT NOTE RECORDS — Manual Only
// Tracks OTA debit notes (OTA yêu cầu trả tiền)
// Status: OPEN → PAID
// ============================================

export type DebitNoteStatus = "OPEN" | "PAID";

export interface OtaDebitNoteRecord {
    id: string;
    channel: string;
    amount: number;           // Always positive
    issue_date: string;
    status: DebitNoteStatus;
    reference: string | null;
    paid_via_cash_out_id: string | null;
    note: string | null;
    attachment_url: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export const DEBIT_NOTE_STATUS_DISPLAY: Record<DebitNoteStatus, { label: string; variant: string }> = {
    OPEN: { label: "Chưa trả", variant: "warning" },
    PAID: { label: "Đã trả", variant: "success" },
};

export function useOtaDebitNotes(filters?: {
    channel?: string;
    status?: DebitNoteStatus | "all";
}) {
    return useQuery({
        queryKey: ["ota_debit_notes", filters],
        staleTime: 30_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            let query = (supabase as any)
                .from("ota_debit_note_records")
                .select("*")
                .order("issue_date", { ascending: false });

            if (filters?.channel) {
                query = query.eq("channel", filters.channel);
            }
            if (filters?.status && filters.status !== "all") {
                query = query.eq("status", filters.status);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as OtaDebitNoteRecord[];
        },
    });
}

export function useCreateOtaDebitNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            channel: string;
            amount: number;
            issue_date: string;
            reference?: string;
            note?: string;
            attachment_url?: string;
        }) => {
            const { data: user } = await supabase.auth.getUser();

            const { data: result, error } = await (supabase as any)
                .from("ota_debit_note_records")
                .insert({
                    channel: data.channel,
                    amount: Math.abs(data.amount), // Always positive
                    issue_date: data.issue_date,
                    status: "OPEN",
                    reference: data.reference || null,
                    note: data.note || null,
                    attachment_url: data.attachment_url || null,
                    created_by: user?.user?.id,
                })
                .select()
                .single();

            if (error) throw error;
            return result as OtaDebitNoteRecord;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ota_debit_notes"] });
            queryClient.invalidateQueries({ queryKey: ["ota_reconciliation"] });
            toast.success("Đã tạo debit note");
        },
        onError: (error: Error) => {
            toast.error("Lỗi: " + error.message);
        },
    });
}

export function useMarkDebitNotePaid() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            id: string;
            cash_out_id: string;
        }) => {
            const { data: result, error } = await (supabase as any)
                .from("ota_debit_note_records")
                .update({
                    status: "PAID",
                    paid_via_cash_out_id: data.cash_out_id,
                })
                .eq("id", data.id)
                .select()
                .single();

            if (error) throw error;
            return result as OtaDebitNoteRecord;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ota_debit_notes"] });
            queryClient.invalidateQueries({ queryKey: ["ota_reconciliation"] });
            toast.success("Đã cập nhật debit note thành PAID");
        },
        onError: (error: Error) => {
            toast.error("Lỗi: " + error.message);
        },
    });
}

export function useUpdateOtaDebitNote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            id: string;
            reference?: string;
            note?: string;
            attachment_url?: string;
        }) => {
            const updateData: Record<string, unknown> = {};
            if (data.reference !== undefined) updateData.reference = data.reference;
            if (data.note !== undefined) updateData.note = data.note;
            if (data.attachment_url !== undefined) updateData.attachment_url = data.attachment_url;

            const { data: result, error } = await (supabase as any)
                .from("ota_debit_note_records")
                .update(updateData)
                .eq("id", data.id)
                .select()
                .single();

            if (error) throw error;
            return result as OtaDebitNoteRecord;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ota_debit_notes"] });
            toast.success("Đã cập nhật debit note");
        },
        onError: (error: Error) => {
            toast.error("Lỗi: " + error.message);
        },
    });
}
