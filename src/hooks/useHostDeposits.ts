import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "./useAuditLog";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface HostDeposit {
  id: string;
  partner_id: string;
  unified_booking_id: string;
  deposit_amount: number;
  deposit_date: string;
  status: "HELD" | "REFUNDED" | "OFFSET" | "FORFEITED";
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  rejection_note: string | null;
  note: string | null;
  applied_at: string | null;
  applied_by: string | null;
  applied_to_payable_id: string | null;
  refunded_at: string | null;
  refunded_by: string | null;
  created_at: string;
  partner?: { partner_name: string };
}

export interface HostPrepaid {
  id: string;
  partner_id: string;
  unified_booking_id: string;
  prepaid_amount: number;
  currency: string;
  prepaid_status: "OPEN" | "APPLIED";
  approval_status: ApprovalStatus;
  approved_at: string | null;
  approved_by: string | null;
  rejection_note: string | null;
  paid_at: string | null;
  applied_at: string | null;
  applied_by: string | null;
  applied_to_payable_id: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  partner?: { partner_name: string };
}

export function useHostDeposits(unifiedBookingId?: string) {
  return useQuery({
    queryKey: ["host-deposits", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("host_deposits")
        .select("*, partner:partners(partner_name)")
        .order("created_at", { ascending: false });

      if (unifiedBookingId) {
        query = query.eq("unified_booking_id", unifiedBookingId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as HostDeposit[];
    },
    enabled: true,
  });
}

export function useHostPrepaids(unifiedBookingId?: string) {
  return useQuery({
    queryKey: ["host-prepaids", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("host_prepaids")
        .select("*, partner:partners(partner_name)")
        .order("created_at", { ascending: false });

      if (unifiedBookingId) {
        query = query.eq("unified_booking_id", unifiedBookingId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as HostPrepaid[];
    },
    enabled: true,
  });
}

// CSKH tạo ĐỀ XUẤT đặt cọc (chỉ tạo record, KHÔNG tạo cashflow)
export function useCreateHostDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      partner_id: string;
      unified_booking_id: string;
      deposit_amount: number;
      deposit_date: string;
      note?: string;
    }) => {
      // Create deposit với approval_status = PENDING
      const { data: deposit, error } = await supabase
        .from("host_deposits")
        .insert({
          partner_id: params.partner_id,
          unified_booking_id: params.unified_booking_id,
          deposit_amount: params.deposit_amount,
          deposit_date: params.deposit_date,
          note: params.note,
          status: "HELD",
          approval_status: "PENDING", // Chờ duyệt
        })
        .select()
        .single();

      if (error) throw error;

      // Audit log - KHÔNG tạo cashflow
      await createAuditLog({
        action: "Tạo đề xuất đặt cọc Host (chờ duyệt)",
        entity: "host_deposits",
        entityId: deposit.id,
        afterData: deposit,
      });

      return deposit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["host_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã tạo đề xuất đặt cọc - Chờ duyệt");
    },
    onError: (error) => {
      toast.error("Lỗi tạo đề xuất: " + error.message);
    },
  });
}

// CSKH tạo ĐỀ XUẤT trả trước (chỉ tạo record, KHÔNG tạo cashflow)
export function useCreateHostPrepaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      partner_id: string;
      unified_booking_id: string;
      prepaid_amount: number;
      paid_at: string;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Create prepaid với approval_status = PENDING
      const { data: prepaid, error } = await supabase
        .from("host_prepaids")
        .insert({
          partner_id: params.partner_id,
          unified_booking_id: params.unified_booking_id,
          prepaid_amount: params.prepaid_amount,
          paid_at: params.paid_at,
          note: params.note,
          prepaid_status: "OPEN",
          approval_status: "PENDING", // Chờ duyệt
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Audit log - KHÔNG tạo cashflow
      await createAuditLog({
        action: "Tạo đề xuất trả trước Host (chờ duyệt)",
        entity: "host_prepaids",
        entityId: prepaid.id,
        afterData: prepaid,
      });

      return prepaid;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["host_prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã tạo đề xuất trả trước - Chờ duyệt");
    },
    onError: (error) => {
      toast.error("Lỗi tạo đề xuất: " + error.message);
    },
  });
}

// Admin/Kế toán DUYỆT đặt cọc
export function useApproveDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (depositId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: depositBefore } = await supabase
        .from("host_deposits")
        .select("*")
        .eq("id", depositId)
        .single();

      const { error } = await supabase
        .from("host_deposits")
        .update({
          approval_status: "APPROVED",
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        })
        .eq("id", depositId);

      if (error) throw error;

      await createAuditLog({
        action: "Duyệt đề xuất đặt cọc Host",
        entity: "host_deposits",
        entityId: depositId,
        beforeData: depositBefore,
        afterData: { approval_status: "APPROVED" },
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["host_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã duyệt đề xuất đặt cọc");
    },
    onError: (error) => {
      toast.error("Lỗi duyệt: " + error.message);
    },
  });
}

// Admin/Kế toán DUYỆT trả trước
export function useApprovePrepaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prepaidId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: prepaidBefore } = await supabase
        .from("host_prepaids")
        .select("*")
        .eq("id", prepaidId)
        .single();

      const { error } = await supabase
        .from("host_prepaids")
        .update({
          approval_status: "APPROVED",
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
        })
        .eq("id", prepaidId);

      if (error) throw error;

      await createAuditLog({
        action: "Duyệt đề xuất trả trước Host",
        entity: "host_prepaids",
        entityId: prepaidId,
        beforeData: prepaidBefore,
        afterData: { approval_status: "APPROVED" },
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["host_prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã duyệt đề xuất trả trước");
    },
    onError: (error) => {
      toast.error("Lỗi duyệt: " + error.message);
    },
  });
}

// Admin/Kế toán TỪ CHỐI đặt cọc
export function useRejectDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { depositId: string; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: depositBefore } = await supabase
        .from("host_deposits")
        .select("*")
        .eq("id", params.depositId)
        .single();

      const { error } = await supabase
        .from("host_deposits")
        .update({
          approval_status: "REJECTED",
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
          rejection_note: params.reason,
        })
        .eq("id", params.depositId);

      if (error) throw error;

      await createAuditLog({
        action: "Từ chối đề xuất đặt cọc Host",
        entity: "host_deposits",
        entityId: params.depositId,
        beforeData: depositBefore,
        afterData: { approval_status: "REJECTED", rejection_note: params.reason },
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["host_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã từ chối đề xuất");
    },
    onError: (error) => {
      toast.error("Lỗi từ chối: " + error.message);
    },
  });
}

// Admin/Kế toán TỪ CHỐI trả trước
export function useRejectPrepaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { prepaidId: string; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: prepaidBefore } = await supabase
        .from("host_prepaids")
        .select("*")
        .eq("id", params.prepaidId)
        .single();

      const { error } = await supabase
        .from("host_prepaids")
        .update({
          approval_status: "REJECTED",
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
          rejection_note: params.reason,
        })
        .eq("id", params.prepaidId);

      if (error) throw error;

      await createAuditLog({
        action: "Từ chối đề xuất trả trước Host",
        entity: "host_prepaids",
        entityId: params.prepaidId,
        beforeData: prepaidBefore,
        afterData: { approval_status: "REJECTED", rejection_note: params.reason },
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["host_prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã từ chối đề xuất");
    },
    onError: (error) => {
      toast.error("Lỗi từ chối: " + error.message);
    },
  });
}

// Admin/Kế toán XÁC NHẬN ĐÃ CHI TIỀN (tạo cashflow tại đây)
export function useConfirmDepositPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (depositId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: deposit } = await supabase
        .from("host_deposits")
        .select("*")
        .eq("id", depositId)
        .single();

      if (!deposit) throw new Error("Không tìm thấy đặt cọc");
      if (deposit.approval_status !== "APPROVED") {
        throw new Error("Chỉ có thể xác nhận chi tiền cho đề xuất đã được duyệt");
      }

      // Update status to PAID
      const { error } = await supabase
        .from("host_deposits")
        .update({
          approval_status: "PAID",
        })
        .eq("id", depositId);

      if (error) throw error;

      // SPRINT 12: Atomic cash_out + ledger + cashflow + audit via unified RPC
      // Replaces: direct .from("cashflow_entries").insert({ source_type: "HOST_DEPOSIT" })
      const { error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
        p_transaction_type: 'HOST_DEPOSIT',
        p_direction: 'OUT',
        p_amount: deposit.deposit_amount,
        p_cash_date: deposit.deposit_date,
        p_counterparty_type: 'HOST',
        p_counterparty_id: deposit.partner_id,
        p_source_type: 'HOST_DEPOSIT',
        p_source_id: deposit.id,
        p_note: `Đặt cọc Host - ${deposit.note || ""}`,
        p_metadata: { deposit_id: deposit.id, unified_booking_id: deposit.unified_booking_id },
      });

      if (txnError) throw txnError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["host_deposits"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã xác nhận chi tiền đặt cọc");
    },
    onError: (error) => {
      toast.error("Lỗi xác nhận: " + error.message);
    },
  });
}

// Admin/Kế toán XÁC NHẬN ĐÃ CHI TIỀN trả trước (tạo cashflow tại đây)
export function useConfirmPrepaidPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prepaidId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: prepaid } = await supabase
        .from("host_prepaids")
        .select("*")
        .eq("id", prepaidId)
        .single();

      if (!prepaid) throw new Error("Không tìm thấy trả trước");
      if (prepaid.approval_status !== "APPROVED") {
        throw new Error("Chỉ có thể xác nhận chi tiền cho đề xuất đã được duyệt");
      }

      // Update status to PAID
      const { error } = await supabase
        .from("host_prepaids")
        .update({
          approval_status: "PAID",
        })
        .eq("id", prepaidId);

      if (error) throw error;

      // SPRINT 12: Atomic cash_out + ledger + cashflow + audit via unified RPC
      // Replaces: direct .from("cashflow_entries").insert({ source_type: "HOST_PREPAID" })
      const { error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
        p_transaction_type: 'HOST_PREPAID',
        p_direction: 'OUT',
        p_amount: prepaid.prepaid_amount,
        p_cash_date: prepaid.paid_at?.split("T")[0] || new Date().toISOString().split("T")[0],
        p_counterparty_type: 'HOST',
        p_counterparty_id: prepaid.partner_id,
        p_source_type: 'HOST_PREPAID',
        p_source_id: prepaid.id,
        p_note: `Trả trước Host - ${prepaid.note || ""}`,
        p_metadata: { prepaid_id: prepaid.id, unified_booking_id: prepaid.unified_booking_id },
      });

      if (txnError) throw txnError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["host_prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã xác nhận chi tiền trả trước");
    },
    onError: (error) => {
      toast.error("Lỗi xác nhận: " + error.message);
    },
  });
}

// Apply deposit - chỉ khi đã PAID mới được cấn trừ
export function useApplyDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      depositId: string;
      payableId: string;
      amount: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get deposit before
      const { data: depositBefore } = await supabase
        .from("host_deposits")
        .select("*")
        .eq("id", params.depositId)
        .single();

      if (!depositBefore) throw new Error("Không tìm thấy đặt cọc");
      if (depositBefore.approval_status !== "PAID") {
        throw new Error("Chỉ có thể cấn trừ đặt cọc đã chi tiền");
      }

      // Update deposit status
      const { error: depositError } = await supabase
        .from("host_deposits")
        .update({
          status: "OFFSET",
          applied_at: new Date().toISOString(),
          applied_by: user?.id,
          applied_to_payable_id: params.payableId,
        })
        .eq("id", params.depositId);

      if (depositError) throw depositError;

      // Update payable applied amount
      const { data: payable } = await supabase
        .from("host_payables")
        .select("applied_deposit_amount")
        .eq("id", params.payableId)
        .single();

      const { error: payableError } = await supabase
        .from("host_payables")
        .update({
          applied_deposit_amount: (payable?.applied_deposit_amount || 0) + params.amount,
        })
        .eq("id", params.payableId);

      if (payableError) throw payableError;

      // Audit log - NO cashflow created for APPLY (bút toán logic)
      await createAuditLog({
        action: "Cấn trừ Deposit vào Payable",
        entity: "host_deposits",
        entityId: params.depositId,
        beforeData: depositBefore,
        afterData: { status: "OFFSET", applied_to_payable_id: params.payableId },
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["host-payables"] });
      toast.success("Đã cấn trừ deposit");
    },
    onError: (error) => {
      toast.error("Lỗi cấn trừ: " + error.message);
    },
  });
}

// Apply prepaid - chỉ khi đã PAID mới được cấn trừ
export function useApplyPrepaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      prepaidId: string;
      payableId: string;
      amount: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get prepaid before
      const { data: prepaidBefore } = await supabase
        .from("host_prepaids")
        .select("*")
        .eq("id", params.prepaidId)
        .single();

      if (!prepaidBefore) throw new Error("Không tìm thấy trả trước");
      if (prepaidBefore.approval_status !== "PAID") {
        throw new Error("Chỉ có thể cấn trừ trả trước đã chi tiền");
      }

      // Update prepaid status
      const { error: prepaidError } = await supabase
        .from("host_prepaids")
        .update({
          prepaid_status: "APPLIED",
          applied_at: new Date().toISOString(),
          applied_by: user?.id,
          applied_to_payable_id: params.payableId,
        })
        .eq("id", params.prepaidId);

      if (prepaidError) throw prepaidError;

      // Update payable applied amount
      const { data: payable } = await supabase
        .from("host_payables")
        .select("applied_prepaid_amount")
        .eq("id", params.payableId)
        .single();

      const { error: payableError } = await supabase
        .from("host_payables")
        .update({
          applied_prepaid_amount: (payable?.applied_prepaid_amount || 0) + params.amount,
        })
        .eq("id", params.payableId);

      if (payableError) throw payableError;

      // Audit log - NO cashflow created for APPLY (bút toán logic)
      await createAuditLog({
        action: "Cấn trừ Prepaid vào Payable",
        entity: "host_prepaids",
        entityId: params.prepaidId,
        beforeData: prepaidBefore,
        afterData: { prepaid_status: "APPLIED", applied_to_payable_id: params.payableId },
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["host-payables"] });
      toast.success("Đã cấn trừ prepaid");
    },
    onError: (error) => {
      toast.error("Lỗi cấn trừ: " + error.message);
    },
  });
}

// Refund deposit - chỉ khi đã PAID và status = HELD
export function useRefundDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      depositId: string;
      amount: number;
      partnerId: string;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get deposit before
      const { data: depositBefore } = await supabase
        .from("host_deposits")
        .select("*")
        .eq("id", params.depositId)
        .single();

      if (!depositBefore) throw new Error("Không tìm thấy đặt cọc");
      if (depositBefore.approval_status !== "PAID") {
        throw new Error("Chỉ có thể hoàn cọc đã chi tiền");
      }

      // Update deposit status
      const { error: depositError } = await supabase
        .from("host_deposits")
        .update({
          status: "REFUNDED",
          refunded_at: new Date().toISOString(),
          refunded_by: user?.id,
        })
        .eq("id", params.depositId);

      if (depositError) throw depositError;

      // SPRINT 12: Atomic ledger + cashflow + audit via unified RPC
      // Replaces: direct .from("cashflow_entries").insert({ source_type: "HOST_DEPOSIT_REFUND" })
      // Direction: IN — money returned TO Roomrise from host
      const { error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
        p_transaction_type: 'HOST_DEPOSIT_REFUND',
        p_direction: 'IN',
        p_amount: params.amount,
        p_cash_date: new Date().toISOString().split("T")[0],
        p_counterparty_type: 'HOST',
        p_counterparty_id: params.partnerId,
        p_source_type: 'HOST_DEPOSIT_REFUND',
        p_source_id: params.depositId,
        p_note: `Hoàn cọc Host - ${params.note || ""}`,
        p_metadata: { deposit_id: params.depositId },
      });

      if (txnError) throw txnError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      toast.success("Đã hoàn cọc");
    },
    onError: (error) => {
      toast.error("Lỗi hoàn cọc: " + error.message);
    },
  });
}

export function useCanManageDeposits() {
  return useQuery({
    queryKey: ["can-manage-deposits"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (!data || data.length === 0) return false;

      // Admin, Kế toán, Super Admin có quyền duyệt/xác nhận chi tiền
      const allowedRoles = ['admin', 'ke_toan', 'super_admin'];
      return data.some(r => allowedRoles.includes(r.role));
    },
  });
}
