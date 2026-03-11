import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "./useAuditLog";

export type HostDepositPurpose = "HOST_DEPOSIT" | "HOST_PREPAID";
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface HostDepositRequest {
  id: string;
  request_code: string;
  purpose: HostDepositPurpose;
  partner_id: string;
  partner_name?: string;
  unified_booking_id: string;
  booking_code?: string;
  proposed_amount: number;
  status: RequestStatus;
  requested_by?: string;
  requested_at: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  note?: string;
  total_paid: number;
  remaining: number;
  // Đã có đề xuất hoàn tiền chưa
  has_refund_request?: boolean;
  refund_request_code?: string;
  refund_request_status?: RequestStatus;
  // Settlement info - đã được cấn trừ vào quyết toán
  settlement_id?: string | null;
  settlement_code?: string | null;
  settlement_status?: string | null;
  is_applied?: boolean; // true if linked to a SETTLED/CLOSED settlement
}

// Generate request code
async function generateRequestCode(): Promise<string> {
  const now = new Date();
  const yearMonth = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: existing } = await supabase
    .from("payment_requests")
    .select("request_code")
    .like("request_code", `PR${yearMonth}%`)
    .order("request_code", { ascending: false })
    .limit(1);

  let seq = 1;
  if (existing && existing.length > 0) {
    const lastCode = existing[0].request_code;
    const lastSeq = parseInt(lastCode.slice(6), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `PR${yearMonth}${String(seq).padStart(4, '0')}`;
}

// Fetch Host Deposit/Prepaid requests
export function useHostDepositRequests(filters?: {
  purpose?: HostDepositPurpose;
  status?: RequestStatus;
  partnerId?: string;
  unifiedBookingId?: string;
}) {
  return useQuery({
    queryKey: ["host-deposit-requests", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("payment_requests")
        .select("*, partner:partners(partner_name)")
        .in("payment_type", ["HOST_DEPOSIT", "HOST_PREPAID"])
        .order("requested_at", { ascending: false });

      if (filters?.purpose) {
        query = query.eq("payment_type", filters.purpose);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.partnerId) {
        query = query.eq("partner_id", filters.partnerId);
      }
      if (filters?.unifiedBookingId) {
        query = query.eq("unified_booking_id", filters.unifiedBookingId);
      }

      const { data: requests, error } = await query;
      if (error) throw error;
      if (!requests) return [];

      // Get paid amounts
      const requestIds = requests.map(r => r.id);
      const paidByRequest = new Map<string, number>();
      if (requestIds.length > 0) {
        const { data: cashOuts } = await supabase
          .from("cash_outs")
          .select("payment_request_id, amount")
          .in("payment_request_id", requestIds);

        cashOuts?.forEach(co => {
          const current = paidByRequest.get(co.payment_request_id) || 0;
          paidByRequest.set(co.payment_request_id, current + Number(co.amount || 0));
        });
      }

      // Get refund requests (có source_id link đến request gốc)
      const refundByRequest = new Map<string, { code: string; status: RequestStatus }>();
      if (requestIds.length > 0) {
        const { data: refundRequests } = await supabase
          .from("payment_requests")
          .select("id, source_id, request_code, status")
          .in("payment_type", ["HOST_DEPOSIT_REFUND", "HOST_PREPAID_REFUND"])
          .in("source_id", requestIds);

        refundRequests?.forEach(rr => {
          if (rr.source_id) {
            refundByRequest.set(rr.source_id, {
              code: rr.request_code,
              status: rr.status as RequestStatus
            });
          }
        });
      }

      // Get booking codes from bookings_mirror
      const unifiedBookingIds = requests
        .map(r => r.unified_booking_id)
        .filter((id): id is string => !!id);

      const bookingCodeMap = new Map<string, string>();
      if (unifiedBookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from("bookings_mirror")
          .select("unified_booking_id, ota_booking_code")
          .in("unified_booking_id", unifiedBookingIds);

        bookings?.forEach(b => {
          if (b.ota_booking_code) {
            bookingCodeMap.set(b.unified_booking_id, b.ota_booking_code);
          }
        });
      }

      // Get settlement info for requests that have settlement_id
      const settlementIds = requests
        .map(r => r.settlement_id)
        .filter((id): id is string => !!id);

      const settlementMap = new Map<string, { code: string; status: string }>();
      if (settlementIds.length > 0) {
        const { data: settlements } = await supabase
          .from("host_settlements")
          .select("id, settlement_code, status")
          .in("id", settlementIds);

        settlements?.forEach(s => {
          settlementMap.set(s.id, { code: s.settlement_code, status: s.status });
        });
      }

      return requests.map((r: any): HostDepositRequest => {
        const totalPaid = paidByRequest.get(r.id) || 0;
        const refundInfo = refundByRequest.get(r.id);

        // Check settlement status - only PAID requests linked to SETTLED/CLOSED settlement are truly applied
        const settlementData = r.settlement_id ? settlementMap.get(r.settlement_id) : null;
        const isApplied = r.status === "PAID" && !!settlementData &&
          ["SETTLED", "CLOSED", "FINALIZED"].includes(settlementData.status);

        return {
          id: r.id,
          request_code: r.request_code,
          purpose: r.payment_type as HostDepositPurpose,
          partner_id: r.partner_id,
          partner_name: r.partner?.partner_name,
          unified_booking_id: r.unified_booking_id || "",
          booking_code: r.unified_booking_id ? bookingCodeMap.get(r.unified_booking_id) : undefined,
          proposed_amount: Number(r.proposed_amount) || 0,
          status: r.status,
          requested_by: r.requested_by,
          requested_at: r.requested_at,
          approved_by: r.approved_by,
          approved_at: r.approved_at,
          rejected_by: r.rejected_by,
          rejected_at: r.rejected_at,
          rejection_reason: r.rejection_reason,
          note: r.note,
          total_paid: totalPaid,
          remaining: Number(r.proposed_amount) - totalPaid,
          has_refund_request: !!refundInfo,
          refund_request_code: refundInfo?.code,
          refund_request_status: refundInfo?.status,
          settlement_id: r.settlement_id,
          settlement_code: settlementData?.code,
          settlement_status: settlementData?.status,
          is_applied: isApplied,
        };
      });
    },
  });
}

// Stats for Host Deposit/Prepaid
export function useHostDepositStats() {
  return useQuery({
    queryKey: ["host-deposit-stats"],
    queryFn: async () => {
      const { data: requests, error } = await supabase
        .from("payment_requests")
        .select("id, payment_type, status, proposed_amount, settlement_id")
        .in("payment_type", ["HOST_DEPOSIT", "HOST_PREPAID"]);

      if (error) throw error;
      if (!requests || requests.length === 0) {
        const zero = { count: 0, amount: 0 };
        return {
          deposit: { pending: { ...zero }, approved: { ...zero }, paid: { ...zero }, rejected: { ...zero }, applied: { ...zero } },
          prepaid: { pending: { ...zero }, approved: { ...zero }, paid: { ...zero }, rejected: { ...zero }, applied: { ...zero } },
        };
      }

      // Get paid amounts
      const requestIds = requests.map(r => r.id);
      const paidByRequest = new Map<string, number>();
      const { data: cashOuts } = await supabase
        .from("cash_outs")
        .select("payment_request_id, amount")
        .in("payment_request_id", requestIds);

      cashOuts?.forEach(co => {
        const current = paidByRequest.get(co.payment_request_id) || 0;
        paidByRequest.set(co.payment_request_id, current + Number(co.amount || 0));
      });

      // Get settlement statuses for applied check
      const settlementIds = [...new Set(requests.map(r => r.settlement_id).filter(Boolean))] as string[];
      const appliedSettlementIds = new Set<string>();
      if (settlementIds.length > 0) {
        const { data: settlements } = await supabase
          .from("host_settlements")
          .select("id, status")
          .in("id", settlementIds)
          .in("status", ["SETTLED", "CLOSED", "FINALIZED"]);
        settlements?.forEach(s => appliedSettlementIds.add(s.id));
      }

      const stats = {
        deposit: {
          pending: { count: 0, amount: 0 },
          approved: { count: 0, amount: 0 },
          paid: { count: 0, amount: 0 },
          rejected: { count: 0, amount: 0 },
          applied: { count: 0, amount: 0 },
        },
        prepaid: {
          pending: { count: 0, amount: 0 },
          approved: { count: 0, amount: 0 },
          paid: { count: 0, amount: 0 },
          rejected: { count: 0, amount: 0 },
          applied: { count: 0, amount: 0 },
        },
      };

      requests.forEach(r => {
        const amount = Number(r.proposed_amount) || 0;
        const paidAmount = paidByRequest.get(r.id) || 0;
        const category = r.payment_type === "HOST_DEPOSIT" ? "deposit" : "prepaid";
        const isApplied = r.settlement_id && appliedSettlementIds.has(r.settlement_id);

        switch (r.status) {
          case "PENDING":
            stats[category].pending.count++;
            stats[category].pending.amount += amount;
            break;
          case "APPROVED":
            stats[category].approved.count++;
            stats[category].approved.amount += amount;
            break;
          case "PAID":
            stats[category].paid.count++;
            stats[category].paid.amount += paidAmount; // Use actual paid amount
            // Also count applied (subset of PAID)
            if (isApplied) {
              stats[category].applied.count++;
              stats[category].applied.amount += paidAmount;
            }
            break;
          case "REJECTED":
            stats[category].rejected.count++;
            stats[category].rejected.amount += amount;
            break;
        }
      });

      return stats;
    },
  });
}

// CSKH: Create Host Deposit/Prepaid Request (PENDING - chưa chi tiền)
export function useCreateHostDepositRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      purpose: HostDepositPurpose;
      partner_id: string;
      unified_booking_id: string;
      proposed_amount: number;
      note?: string;
    }) => {
      // Validation: all 3 fields required
      if (!params.partner_id) throw new Error("Host (partner_id) là bắt buộc");
      if (!params.unified_booking_id) throw new Error("Booking (unified_booking_id) là bắt buộc");
      if (!params.proposed_amount || params.proposed_amount <= 0) throw new Error("Số tiền đề xuất phải > 0");

      // requested_by is set server-side by DB trigger (trg_payment_requests_force_requested_by)
      const requestCode = await generateRequestCode();

      const { data, error } = await supabase
        .from("payment_requests")
        .insert({
          request_code: requestCode,
          payment_type: params.purpose, // HOST_DEPOSIT or HOST_PREPAID
          partner_id: params.partner_id,
          unified_booking_id: params.unified_booking_id,
          source_amount: params.proposed_amount,
          proposed_amount: params.proposed_amount,
          note: params.note,
          status: "PENDING",
        })
        .select()
        .single();

      if (error) throw error;

      // Audit: CREATE_PAYMENT_REQUEST
      await createAuditLog({
        action: params.purpose === "HOST_DEPOSIT"
          ? "Tạo đề xuất đặt cọc Host (chờ duyệt)"
          : "Tạo đề xuất trả trước Host (chờ duyệt)",
        entity: "payment_requests",
        entityId: data.id,
        afterData: data,
      });

      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate ALL related queries to ensure data syncs across pages
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["host-deposit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      toast.success(
        variables.purpose === "HOST_DEPOSIT"
          ? "Đã tạo đề xuất đặt cọc Host – Chờ duyệt"
          : "Đã tạo đề xuất trả trước Host – Chờ duyệt"
      );
    },
    onError: (error) => {
      toast.error("Lỗi tạo đề xuất: " + error.message);
    },
  });
}

// Finance/Manager: Approve Request
export function useApproveHostDepositRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Only approve if status = PENDING
      const { data, error } = await supabase
        .from("payment_requests")
        .update({
          status: "APPROVED",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("status", "PENDING")
        .select()
        .single();

      if (error) throw error;

      // Audit: APPROVE_REQUEST
      await createAuditLog({
        action: "Duyệt đề xuất đặt cọc/trả trước Host",
        entity: "payment_requests",
        entityId: requestId,
        afterData: data,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["host-deposit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      queryClient.invalidateQueries({ queryKey: ["approved-requests-for-cashout"] });
      toast.success("Đã duyệt đề xuất – Chờ chi tiền");
    },
    onError: (error) => {
      toast.error("Lỗi duyệt: " + error.message);
    },
  });
}

// Finance/Manager: Reject Request
export function useRejectHostDepositRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { requestId: string; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Only reject if status = PENDING
      const { data, error } = await supabase
        .from("payment_requests")
        .update({
          status: "REJECTED",
          rejected_by: user?.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: params.reason,
        })
        .eq("id", params.requestId)
        .eq("status", "PENDING")
        .select()
        .single();

      if (error) throw error;

      // Audit: REJECT_REQUEST
      await createAuditLog({
        action: "Từ chối đề xuất đặt cọc/trả trước Host",
        entity: "payment_requests",
        entityId: params.requestId,
        afterData: data,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["host-deposit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      toast.success("Đã từ chối đề xuất");
    },
    onError: (error) => {
      toast.error("Lỗi từ chối: " + error.message);
    },
  });
}

// Finance/Manager: Create Cash-Out (actual money transfer)
export function useCreateHostDepositCashOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      request_id: string;
      amount: number;
      payment_method: "BANK_TRANSFER" | "CASH" | "OTHER";
      bank_name?: string;
      bank_account_number?: string;
      bank_account_name?: string;
      transfer_reference?: string;
      note?: string;
      receipt_image?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get request details
      const { data: request } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("id", params.request_id)
        .single();

      if (!request) throw new Error("Không tìm thấy đề xuất");
      if (!["APPROVED", "PAID"].includes(request.status)) {
        throw new Error("Chỉ có thể chi tiền cho đề xuất đã được duyệt");
      }

      // Calculate remaining
      const { data: existingCashOuts } = await supabase
        .from("cash_outs")
        .select("amount")
        .eq("payment_request_id", params.request_id);

      const totalPaid = existingCashOuts?.reduce((sum, co) => sum + Number(co.amount), 0) || 0;
      const remaining = Number(request.proposed_amount) - totalPaid;

      if (params.amount > remaining) {
        throw new Error(`Số tiền chi (${params.amount.toLocaleString()}) vượt quá còn lại (${remaining.toLocaleString()})`);
      }

      // Create cash-out record
      const { data: cashOut, error: cashOutError } = await supabase
        .from("cash_outs")
        .insert({
          payment_request_id: params.request_id,
          amount: params.amount,
          payment_method: params.payment_method,
          bank_name: params.bank_name,
          bank_account_number: params.bank_account_number,
          bank_account_name: params.bank_account_name,
          transfer_reference: params.transfer_reference,
          note: params.note,
          paid_by: user?.id,
          paid_at: new Date().toISOString(),
          receipt_image: params.receipt_image || null,
          receipt_status: params.receipt_image ? "UPLOADED" : "PENDING",
        })
        .select()
        .single();

      if (cashOutError) throw cashOutError;

      // SPRINT 12: Atomic ledger + cashflow + audit via unified RPC
      const cfSourceType = request.payment_type === "HOST_DEPOSIT" ? "HOST_DEPOSIT" : "HOST_PREPAID";
      const { error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
        p_transaction_type: cfSourceType,
        p_direction: 'OUT',
        p_amount: params.amount,
        p_cash_date: new Date().toISOString().split('T')[0],
        p_counterparty_type: 'HOST',
        p_counterparty_id: request.partner_id,
        p_source_type: cfSourceType,
        p_source_id: cashOut.id,
        p_note: `${request.payment_type === "HOST_DEPOSIT" ? "Đặt cọc" : "Trả trước"} Host - ${params.transfer_reference || ""} ${params.note || ""}`.trim(),
        p_payment_method: params.payment_method || 'BANK_TRANSFER',
        p_bank_name: params.bank_name || null,
        p_account_number: params.bank_account_number || null,
        p_account_name: params.bank_account_name || null,
        p_metadata: { request_id: params.request_id, request_code: request.request_code },
      });
      if (txnError) throw txnError;

      // Check if fully paid
      const newTotalPaid = totalPaid + params.amount;
      if (newTotalPaid >= Number(request.proposed_amount)) {
        await supabase
          .from("payment_requests")
          .update({ status: "PAID" })
          .eq("id", params.request_id);
      }

      // Audit: CREATE_CASH_OUT
      await createAuditLog({
        action: "Chi tiền đặt cọc/trả trước Host",
        entity: "cash_outs",
        entityId: cashOut.id,
        afterData: { ...cashOut, request_code: request.request_code },
      });

      return cashOut;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["host-deposit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["approved-requests-for-cashout"] });
      queryClient.invalidateQueries({ queryKey: ["cash-outs"] });
      queryClient.invalidateQueries({ queryKey: ["cash-out-stats"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      toast.success("Đã ghi nhận chi tiền");
    },
    onError: (error) => {
      toast.error("Lỗi chi tiền: " + error.message);
    },
  });
}

// Check if user can manage (approve/reject/cash-out)
export function useCanManageHostDeposits() {
  return useQuery({
    queryKey: ["can-manage-host-deposits"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (!data || data.length === 0) return false;

      // Admin, Kế toán, Super Admin can manage
      const allowedRoles = ['admin', 'ke_toan', 'super_admin'];
      return data.some(r => allowedRoles.includes(r.role));
    },
  });
}

// Update Host Deposit/Prepaid Request (only PENDING status)
export function useUpdateHostDepositRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      proposed_amount?: number;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Check current status - only allow update if PENDING
      const { data: current, error: fetchError } = await supabase
        .from("payment_requests")
        .select("status, settlement_id")
        .eq("id", params.requestId)
        .single();

      if (fetchError) throw fetchError;
      if (current.status !== "PENDING") {
        throw new Error("Chỉ có thể sửa đề xuất đang chờ duyệt (PENDING)");
      }
      if (current.settlement_id) {
        throw new Error("Không thể sửa đề xuất đã gắn với phiếu quyết toán");
      }

      const updateData: any = {};
      if (params.proposed_amount !== undefined) {
        updateData.proposed_amount = params.proposed_amount;
        updateData.source_amount = params.proposed_amount;
      }
      if (params.note !== undefined) {
        updateData.note = params.note;
      }

      const { data, error } = await supabase
        .from("payment_requests")
        .update(updateData)
        .eq("id", params.requestId)
        .select()
        .single();

      if (error) throw error;

      // Audit log
      await createAuditLog({
        action: "Cập nhật đề xuất đặt cọc/trả trước Host",
        entity: "payment_requests",
        entityId: params.requestId,
        afterData: data,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["host-deposit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      toast.success("Đã cập nhật đề xuất");
    },
    onError: (error) => {
      toast.error("Lỗi cập nhật: " + error.message);
    },
  });
}

// Delete Host Deposit/Prepaid Request (only PENDING status)
export function useDeleteHostDepositRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      // Check current status - only allow delete if PENDING
      const { data: current, error: fetchError } = await supabase
        .from("payment_requests")
        .select("status, settlement_id, request_code")
        .eq("id", requestId)
        .single();

      if (fetchError) throw fetchError;
      if (current.status !== "PENDING") {
        throw new Error("Chỉ có thể hủy đề xuất đang chờ duyệt (PENDING)");
      }
      if (current.settlement_id) {
        throw new Error("Không thể hủy đề xuất đã gắn với phiếu quyết toán");
      }

      const { data: result, error } = await (supabase.rpc as any)('cancel_payment_request_secure', {
        p_request_id: requestId,
        p_reason: 'Hủy đề xuất đặt cọc/trả trước Host',
      });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("STATUS_INVALID")) {
          throw new Error("Chỉ đề xuất đang chờ duyệt (PENDING) mới có thể hủy.");
        }
        throw new Error(error.message || "Lỗi hủy đề xuất");
      }

      return { success: true };
    },
    onSuccess: () => {
      // Invalidate ALL related queries to ensure data syncs across pages
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["host-deposit-stats"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      toast.success("Đã hủy đề xuất");
    },
    onError: (error) => {
      toast.error("Lỗi hủy đề xuất: " + error.message);
    },
  });
}

// Labels for display
export const hostDepositPurposeLabels: Record<HostDepositPurpose, string> = {
  HOST_DEPOSIT: "Đặt cọc Host",
  HOST_PREPAID: "Trả trước Host",
};

export const hostDepositStatusLabels: Record<RequestStatus, string> = {
  PENDING: "Chờ duyệt – Chưa chi",
  APPROVED: "Đã duyệt – Chưa chi",
  REJECTED: "Từ chối",
  PAID: "Đã chi",
};

export const hostDepositStatusColors: Record<RequestStatus, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/20",
  APPROVED: "bg-info/10 text-info border-info/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
  PAID: "bg-success/10 text-success border-success/20",
};
