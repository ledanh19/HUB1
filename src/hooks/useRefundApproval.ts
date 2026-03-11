import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "@/hooks/useAuditLog";

// Get current refund threshold
export const useRefundThreshold = () => {
  return useQuery({
    queryKey: ["refund-threshold"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refund_thresholds")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.threshold_amount || 1000000; // Default 1 million VND
    },
  });
};

// Check if refund requires approval
export const useRequiresApproval = (amount: number) => {
  const { data: threshold = 1000000 } = useRefundThreshold();
  return amount > threshold;
};

// Get pending refund approvals
export const usePendingRefundApprovals = () => {
  return useQuery({
    queryKey: ["pending-refund-approvals"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approvals")
        .select("*")
        .eq("request_type", "REFUND")
        .eq("status", "PENDING")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
};

// Create refund approval request
export const useCreateRefundApprovalRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      originalCollectionId,
      unifiedBookingId,
      amount,
      paymentMethod,
      reasonNote,
    }: {
      originalCollectionId: string;
      unifiedBookingId: string;
      amount: number;
      paymentMethod: string;
      reasonNote: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const { data, error } = await supabase
        .from("approvals")
        .insert({
          request_type: "REFUND",
          requested_by: user.id,
          request_payload: {
            original_collection_id: originalCollectionId,
            unified_booking_id: unifiedBookingId,
            amount,
            payment_method: paymentMethod,
            reason_note: reasonNote,
          },
          status: "PENDING",
        })
        .select()
        .single();

      if (error) throw error;

      await createAuditLog({
        action: "REFUND_APPROVAL_REQUESTED",
        entity: "approvals",
        entityId: data.id,
        afterData: { amount, unified_booking_id: unifiedBookingId },
      });

      return data;
    },
    onSuccess: () => {
      toast.success("Yêu cầu đã gửi", { description: "Hoàn tiền lớn cần Admin phê duyệt" });
      queryClient.invalidateQueries({ queryKey: ["pending-refund-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });
};

// Approve refund request (admin only) — uses atomic RPC for ledger consistency
export const useApproveRefundRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      approvalId,
      note,
    }: {
      approvalId: string;
      note?: string;
    }) => {
      const { data, error } = await supabase.rpc("approve_refund_with_ledger_atomic", {
        p_approval_id: approvalId,
        p_note: note || null,
      });

      if (error) {
        if (error.message.includes('OTA_COLLECT')) {
          throw new Error('Booking OTA_COLLECT đã có điều chỉnh qua OTA Payout. Không thể hoàn tiền trực tiếp.');
        }
        if (error.message.includes('Kỳ kế toán đã khóa')) {
          throw new Error('Kỳ kế toán đã khóa. Không thể hoàn tiền.');
        }
        if (error.message.includes('vượt quá')) {
          throw new Error(error.message);
        }
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      toast.success("Đã phê duyệt", { description: "Hoàn tiền đã được thực hiện" });
      queryClient.invalidateQueries({ queryKey: ["pending-refund-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["hotel-collects"] });
      queryClient.invalidateQueries({ queryKey: ["no_show_snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["no_show_kpis"] });
      queryClient.invalidateQueries({ queryKey: ["pl-calculator-noshow-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });
};

// Reject refund request
export const useRejectRefundRequest = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      approvalId,
      note,
    }: {
      approvalId: string;
      note: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      const { error } = await supabase
        .from("approvals")
        .update({
          status: "REJECTED",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          note,
        })
        .eq("id", approvalId);

      if (error) throw error;

      await createAuditLog({
        action: "REFUND_REJECTED",
        entity: "approvals",
        entityId: approvalId,
        afterData: { note },
      });
    },
    onSuccess: () => {
      toast.info("Đã từ chối", { description: "Yêu cầu hoàn tiền đã bị từ chối" });
      queryClient.invalidateQueries({ queryKey: ["pending-refund-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });
};

// Update threshold (admin only)
export const useUpdateRefundThreshold = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newThreshold: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Unauthorized");

      // Deactivate old thresholds
      await supabase
        .from("refund_thresholds")
        .update({ is_active: false })
        .eq("is_active", true);

      // Create new threshold
      const { data, error } = await supabase
        .from("refund_thresholds")
        .insert({
          threshold_amount: newThreshold,
          is_active: true,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      await createAuditLog({
        action: "REFUND_THRESHOLD_UPDATED",
        entity: "refund_thresholds",
        entityId: data.id,
        afterData: { threshold_amount: newThreshold },
      });

      return data;
    },
    onSuccess: () => {
      toast.success("Đã cập nhật", { description: "Ngưỡng hoàn tiền đã được thay đổi" });
      queryClient.invalidateQueries({ queryKey: ["refund-threshold"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });
};
