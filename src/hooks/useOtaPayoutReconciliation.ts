import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import { toast } from "sonner";

export const RECONCILIATION_ITEM_TYPES = [
  { value: "BANK_TRANSFER_FEE", label: "Phí chuyển khoản ngân hàng" },
  { value: "DISPUTE", label: "Tranh chấp (Dispute)" },
  { value: "UNDERPAYMENT", label: "Thiếu tiền (giữ PARTIAL)" },
  { value: "MANUAL_ADJUSTMENT", label: "Điều chỉnh thủ công" },
  { value: "OTHER", label: "Khác (yêu cầu ghi chú)" },
] as const;

export type ReconciliationItemType = typeof RECONCILIATION_ITEM_TYPES[number]["value"];

/** Classification labels for adjustment categories */
export const ADJ_CATEGORY_LABELS: Record<string, string> = {
  BANK_FEE: "Phí NH",
  DISPUTE_WIN: "Thắng tranh chấp",
  DISPUTE_LOSS: "Thua tranh chấp",
  OTA_PENALTY: "Phạt OTA",
  OTA_COMPENSATION: "Bồi thường OTA",
  OTA_ROUNDING_FX: "Làm tròn / FX",
  OTA_UNDERPAYMENT: "Thiếu tiền",
  OTA_ADJUSTMENT_OTHER: "Khác",
};

/**
 * Hook to get reconciliation items for a payout
 */
export const usePayoutReconciliationItems = (payoutId: string | null) => {
  return useQuery({
    queryKey: ["payout_reconciliation_items", payoutId],
    enabled: !!payoutId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ota_payout_reconciliation_items")
        .select("*")
        .eq("payout_id", payoutId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
};

/**
 * Hook to create a reconciliation item via atomic RPC
 * Supports direction + dispute_id for adjustment classification
 */
export const useCreateReconciliationItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      payout_id: string;
      item_type: ReconciliationItemType;
      amount: number;
      note?: string | null;
      evidence?: Record<string, any> | null;
      direction?: "DEBIT" | "CREDIT";
      dispute_id?: string | null;
      idempotency_key?: string | null;
    }) => {
      const { data: result, error } = await (supabase.rpc as any)(
        "create_ota_payout_reconciliation_item_atomic",
        {
          p_payout_id: data.payout_id,
          p_item_type: data.item_type,
          p_amount: data.amount,
          p_note: data.note || null,
          p_evidence: data.evidence || null,
          p_direction: data.direction || "CREDIT",
          p_dispute_id: data.dispute_id || null,
          p_idempotency_key: data.idempotency_key || null,
        }
      );

      if (error) throw new Error(error.message || "Lỗi khi tạo mục đối soát");
      return result;
    },
    onSuccess: (result, variables) => {
      if (result?.already_exists) {
        toast.info("Mục đối soát đã tồn tại (idempotent)");
        return;
      }
      const statusLabel = result?.new_status === "RECEIVED" ? "Về đủ" : "Về một phần";
      toast.success(`Đã phân loại chênh lệch → ${statusLabel}`);
      queryClient.invalidateQueries({ queryKey: ["payout_reconciliation_items", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts_for_cashin"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_cashin_status", variables.payout_id] });
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
};

/**
 * Hook to post bank fee to ledger via atomic RPC
 */
export const usePostBankFeeToLedger = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payoutId: string) => {
      const { data: result, error } = await (supabase.rpc as any)(
        "post_ota_payout_bank_fee_to_ledger_atomic",
        { p_payout_id: payoutId }
      );
      if (error) throw new Error(error.message || "Lỗi khi hạch toán phí NH");
      return result;
    },
    onSuccess: (result, payoutId) => {
      if (result?.already_posted) {
        toast.info("Phí NH đã được hạch toán trước đó");
      } else {
        toast.success("Đã hạch toán phí NH vào sổ cái");
      }
      queryClient.invalidateQueries({ queryKey: ["payout_reconciliation_items", payoutId] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout", payoutId] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
    },
    onError: (error: Error) => {
      toast.error("Lỗi hạch toán: " + error.message);
    },
  });
};

/**
 * Hook to post a non-bank-fee adjustment to ledger via atomic RPC
 */
export const usePostAdjustmentToLedger = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reconItemId: string) => {
      const { data: result, error } = await (supabase.rpc as any)(
        "post_ota_payout_adjustment_to_ledger_atomic",
        { p_recon_item_id: reconItemId }
      );
      if (error) throw new Error(error.message || "Lỗi khi hạch toán điều chỉnh");
      return result;
    },
    onSuccess: (result) => {
      if (result?.already_posted) {
        toast.info("Đã hạch toán trước đó (idempotent)");
      } else if (result?.skipped) {
        toast.info(result.reason || "Bỏ qua");
      } else {
        toast.success(`Đã hạch toán điều chỉnh [${result?.adj_category}] vào sổ cái`);
      }
      // Invalidate using payout_id from result if available
      const payoutId = result?.payout_id;
      if (payoutId) {
        queryClient.invalidateQueries({ queryKey: ["payout_reconciliation_items", payoutId] });
        queryClient.invalidateQueries({ queryKey: ["ota_payout", payoutId] });
      }
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["pl-calculator-ota-adjustments"] });
    },
    onError: (error: Error) => {
      toast.error("Lỗi hạch toán: " + error.message);
    },
  });
};

