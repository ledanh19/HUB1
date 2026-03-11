import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================
// OTA ADJUSTMENT RECORDS — Manual Only
// Tracks OTA adjustments (+ = win, - = lose)
// ============================================

export interface OtaAdjustmentRecord {
    id: string;
    channel: string;
    amount: number;       // Signed: + = OTA trả thêm, - = OTA trừ
    reason: string;
    adjustment_date: string;
    reference: string | null;
    note: string | null;
    attachment_url: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export function useOtaAdjustmentRecords(filters?: {
    channel?: string;
    dateFrom?: string;
    dateTo?: string;
}) {
    return useQuery({
        queryKey: ["ota_adjustment_records", filters],
        staleTime: 30_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            let query = (supabase as any)
                .from("ota_adjustment_records")
                .select("*")
                .order("adjustment_date", { ascending: false });

            if (filters?.channel) {
                query = query.eq("channel", filters.channel);
            }
            if (filters?.dateFrom) {
                query = query.gte("adjustment_date", filters.dateFrom);
            }
            if (filters?.dateTo) {
                query = query.lte("adjustment_date", filters.dateTo);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as OtaAdjustmentRecord[];
        },
    });
}

export function useCreateOtaAdjustment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            channel: string;
            amount: number;
            reason: string;
            adjustment_date: string;
            reference?: string;
            note?: string;
            attachment_url?: string;
        }) => {
            const { data: user } = await supabase.auth.getUser();

            const { data: result, error } = await (supabase as any)
                .from("ota_adjustment_records")
                .insert({
                    channel: data.channel,
                    amount: data.amount,
                    reason: data.reason,
                    adjustment_date: data.adjustment_date,
                    reference: data.reference || null,
                    note: data.note || null,
                    attachment_url: data.attachment_url || null,
                    created_by: user?.user?.id,
                })
                .select()
                .single();

            if (error) throw error;
            return result as OtaAdjustmentRecord;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ota_adjustment_records"] });
            queryClient.invalidateQueries({ queryKey: ["ota_reconciliation"] });
            toast.success("Đã tạo bản ghi điều chỉnh OTA");
        },
        onError: (error: Error) => {
            toast.error("Lỗi: " + error.message);
        },
    });
}

export function useUpdateOtaAdjustment() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: {
            id: string;
            amount?: number;
            reason?: string;
            reference?: string;
            note?: string;
            attachment_url?: string;
        }) => {
            const updateData: Record<string, unknown> = {};
            if (data.amount !== undefined) updateData.amount = data.amount;
            if (data.reason !== undefined) updateData.reason = data.reason;
            if (data.reference !== undefined) updateData.reference = data.reference;
            if (data.note !== undefined) updateData.note = data.note;
            if (data.attachment_url !== undefined) updateData.attachment_url = data.attachment_url;

            const { data: result, error } = await (supabase as any)
                .from("ota_adjustment_records")
                .update(updateData)
                .eq("id", data.id)
                .select()
                .single();

            if (error) throw error;
            return result as OtaAdjustmentRecord;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["ota_adjustment_records"] });
            queryClient.invalidateQueries({ queryKey: ["ota_reconciliation"] });
            toast.success("Đã cập nhật bản ghi điều chỉnh");
        },
        onError: (error: Error) => {
            toast.error("Lỗi: " + error.message);
        },
    });
}
