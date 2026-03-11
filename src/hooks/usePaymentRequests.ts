import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createAuditLog } from "./useAuditLog";
import { keepPrevious } from "@/lib/query-helpers";

export type PaymentRequestType = "HOST_PAYMENT" | "SERVICE_PARTNER_PAYMENT" | "INTERNAL_EXPENSE" | "OTA_COMMISSION" | "HOST_DEPOSIT" | "HOST_PREPAID" | "HOST_DEPOSIT_REFUND" | "HOST_PREPAID_REFUND" | "GUEST_REFUND";
export type PaymentRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";
export type ExpenseCategory =
  | "SALARY"
  | "BHXH_EMPLOYER"
  | "BHXH_EMPLOYEE"
  | "OTA_COMMISSION"
  | "OFFICE"
  | "MARKETING"
  | "BANK_FEE"
  | "TECHNOLOGY"
  | "OTHER";

export interface PaymentRequest {
  id: string;
  request_code: string;
  payment_type: PaymentRequestType;
  settlement_id?: string;
  settlement_type?: "HOST" | "SERVICE";
  settlement_code?: string;
  expense_category?: ExpenseCategory;
  partner_id?: string;
  partner_name?: string;
  unified_booking_id?: string;
  booking_code?: string;
  source_amount: number;
  proposed_amount: number;
  difference_amount: number;
  difference_reason?: string;
  expense_period?: string;
  confirmed_at?: string;
  recipient_name?: string;
  recipient_unit?: string;
  status: PaymentRequestStatus;
  requested_by?: string;
  requested_by_name?: string;
  requested_at: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_by_name?: string;
  rejected_at?: string;
  rejection_reason?: string;
  note?: string;
  created_at: string;
  // Computed
  total_paid?: number;
  remaining?: number;
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

// Fetch all payment requests
export function usePaymentRequests(filters?: {
  paymentType?: PaymentRequestType;
  status?: PaymentRequestStatus;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ["payment-requests", filters],
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    placeholderData: keepPrevious,
    queryFn: async () => {
      let query = supabase
        .from("payment_requests")
        .select("*, partner:partners(partner_name)")
        .order("requested_at", { ascending: false });

      if (filters?.paymentType) {
        query = query.eq("payment_type", filters.paymentType);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.partnerId) {
        query = query.eq("partner_id", filters.partnerId);
      }
      if (filters?.dateFrom) {
        query = query.gte("requested_at", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("requested_at", filters.dateTo + "T23:59:59");
      }

      const { data: requests, error } = await query;
      if (error) throw error;
      if (!requests) return [];

      // Get settlement codes for HOST and SERVICE payments
      const hostSettlementIds = requests
        .filter(r => r.settlement_type === "HOST" && r.settlement_id)
        .map(r => r.settlement_id);
      const serviceSettlementIds = requests
        .filter(r => r.settlement_type === "SERVICE" && r.settlement_id)
        .map(r => r.settlement_id);

      const hostSettlementsMap = new Map<string, string>();
      const serviceSettlementsMap = new Map<string, string>();

      if (hostSettlementIds.length > 0) {
        const { data: hostSettlements } = await supabase
          .from("host_settlements")
          .select("id, settlement_code")
          .in("id", hostSettlementIds as string[]);
        hostSettlements?.forEach(s => hostSettlementsMap.set(s.id, s.settlement_code));
      }

      if (serviceSettlementIds.length > 0) {
        const { data: serviceSettlements } = await supabase
          .from("service_settlements")
          .select("id, settlement_code")
          .in("id", serviceSettlementIds as string[]);
        serviceSettlements?.forEach(s => serviceSettlementsMap.set(s.id, s.settlement_code));
      }

      // Get paid amounts for each request
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

      // Enrich user names from profiles (requested_by, approved_by, rejected_by)
      const userIds = [...new Set(
        requests.flatMap((r: any) => [r.requested_by, r.approved_by, r.rejected_by]).filter(Boolean) as string[]
      )];
      const profilesMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        profiles?.forEach((p: any) => profilesMap.set(p.id, p.full_name || p.email || ""));
      }

      // Get booking codes for HOST_DEPOSIT/HOST_PREPAID types
      const depositBookingIds = requests
        .filter(r => ["HOST_DEPOSIT", "HOST_PREPAID", "HOST_DEPOSIT_REFUND", "HOST_PREPAID_REFUND"].includes(r.payment_type))
        .map(r => r.unified_booking_id)
        .filter((id): id is string => !!id);

      const bookingCodeMap = new Map<string, string>();
      if (depositBookingIds.length > 0) {
        const uniqueIds = [...new Set(depositBookingIds)];
        const { data: bookings } = await supabase
          .from("bookings_mirror")
          .select("unified_booking_id, ota_booking_code")
          .in("unified_booking_id", uniqueIds);

        bookings?.forEach(b => {
          if (b.ota_booking_code) {
            bookingCodeMap.set(b.unified_booking_id, b.ota_booking_code);
          }
        });
      }

      // Self-healing: migrate legacy INTERNAL_EXPENSE refund records to GUEST_REFUND
      const legacyRefunds = requests.filter(
        (r: any) => r.payment_type === "INTERNAL_EXPENSE" && r.note?.includes("---TRACE---")
      );
      if (legacyRefunds.length > 0) {
        const legacyIds = legacyRefunds.map((r: any) => r.id);
        supabase
          .from("payment_requests")
          .update({ payment_type: "GUEST_REFUND", expense_category: null })
          .in("id", legacyIds)
          .then(() => console.log(`[PaymentRequests] Migrated ${legacyIds.length} legacy refund records to GUEST_REFUND`));
        // Also fix in-memory for immediate display
        legacyRefunds.forEach((r: any) => { r.payment_type = "GUEST_REFUND"; r.expense_category = null; });
      }

      return requests.map((r: any): PaymentRequest => {
        const settlementCode = r.settlement_type === "HOST"
          ? hostSettlementsMap.get(r.settlement_id || "")
          : serviceSettlementsMap.get(r.settlement_id || "");
        const totalPaid = paidByRequest.get(r.id) || 0;

        return {
          id: r.id,
          request_code: r.request_code,
          payment_type: r.payment_type,
          settlement_id: r.settlement_id,
          settlement_type: r.settlement_type,
          settlement_code: settlementCode,
          expense_category: r.expense_category,
          partner_id: r.partner_id,
          partner_name: r.partner?.partner_name,
          source_amount: Number(r.source_amount) || 0,
          proposed_amount: Number(r.proposed_amount) || 0,
          difference_amount: Number(r.difference_amount) || 0,
          difference_reason: r.difference_reason,
          expense_period: r.expense_period,
          confirmed_at: r.confirmed_at,
          recipient_name: r.recipient_name,
          recipient_unit: r.recipient_unit,
          status: r.status,
          requested_by: r.requested_by,
          requested_by_name: profilesMap.get(r.requested_by || "") || undefined,
          requested_at: r.requested_at,
          approved_by: r.approved_by,
          approved_by_name: profilesMap.get(r.approved_by || "") || undefined,
          approved_at: r.approved_at,
          rejected_by: r.rejected_by,
          rejected_by_name: profilesMap.get(r.rejected_by || "") || undefined,
          rejected_at: r.rejected_at,
          rejection_reason: r.rejection_reason,
          note: r.note,
          created_at: r.created_at,
          unified_booking_id: r.unified_booking_id || undefined,
          booking_code: r.unified_booking_id ? bookingCodeMap.get(r.unified_booking_id) : undefined,
          total_paid: totalPaid,
          remaining: r.proposed_amount - totalPaid,
        };
      });
    },
  });
}

// Fetch approved requests for cash-out (status = APPROVED and has remaining amount)
export function useApprovedRequestsForCashOut() {
  return useQuery({
    queryKey: ["approved-requests-for-cashout"],
    queryFn: async () => {
      const { data: requests, error } = await supabase
        .from("payment_requests")
        .select("*, partner:partners(partner_name)")
        .in("status", ["APPROVED", "PAID"])
        .order("approved_at", { ascending: false });

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

      // Filter to only those with remaining amount > 0 OR status = APPROVED (not yet fully paid)
      return requests
        .map((r: any) => {
          const totalPaid = paidByRequest.get(r.id) || 0;
          const remaining = Number(r.proposed_amount) - totalPaid;
          return {
            id: r.id,
            request_code: r.request_code,
            payment_type: r.payment_type,
            partner_name: r.partner?.partner_name,
            proposed_amount: Number(r.proposed_amount),
            total_paid: totalPaid,
            remaining: remaining,
            status: r.status,
          };
        })
        .filter(r => r.remaining > 0 || r.status === "APPROVED");
    },
  });
}

// Create payment request
export function useCreatePaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      payment_type: PaymentRequestType;
      settlement_id?: string;
      settlement_type?: "HOST" | "SERVICE";
      expense_category?: ExpenseCategory;
      partner_id?: string;
      source_amount: number;
      proposed_amount: number;
      difference_reason?: string;
      expense_period?: string;
      confirmed_at?: string;
      recipient_name?: string;
      recipient_unit?: string;
      note?: string;
    }) => {
      // requested_by is set server-side by DB trigger (trg_payment_requests_force_requested_by)
      // using auth.uid() — no need to set it client-side
      const requestCode = await generateRequestCode();

      const { data, error } = await supabase
        .from("payment_requests")
        .insert({
          request_code: requestCode,
          payment_type: params.payment_type,
          settlement_id: params.settlement_id,
          settlement_type: params.settlement_type,
          expense_category: params.expense_category,
          partner_id: params.partner_id,
          source_amount: params.source_amount,
          proposed_amount: params.proposed_amount,
          difference_reason: params.difference_reason,
          expense_period: params.expense_period,
          confirmed_at: params.confirmed_at,
          recipient_name: params.recipient_name,
          recipient_unit: params.recipient_unit,
          note: params.note,
          status: "PENDING",
        })
        .select()
        .single();

      if (error) throw error;

      await createAuditLog({
        action: "Tạo đề xuất thanh toán",
        entity: "payment_requests",
        entityId: data.id,
        afterData: data,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Đã tạo đề xuất thanh toán");
    },
    onError: (error) => {
      toast.error("Lỗi tạo đề xuất: " + error.message);
    },
  });
}

// Approve payment request
export function useApprovePaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { requestId: string }) => {
      // Use secure RPC with server-side permission check
      const { data: requestId, error } = await (supabase.rpc as any)('approve_payment_request_secure', {
        p_request_id: params.requestId,
      });

      if (error) {
        // Map permission error to user-friendly message
        if (error.message.includes('quyền')) {
          throw new Error(error.message);
        }
        throw new Error('Lỗi phê duyệt: ' + error.message);
      }

      // Fetch updated request for return value
      const { data } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("id", params.requestId)
        .single();

      return data;
    },
    // OPTIMISTIC UPDATE: Update cache immediately before server confirms
    onMutate: async (params) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["payment-requests"] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(["payment-requests"]);

      // Optimistically update the cache
      queryClient.setQueryData(["payment-requests"], (old: PaymentRequest[] | undefined) => {
        if (!old) return old;
        return old.map(req =>
          req.id === params.requestId
            ? { ...req, status: "APPROVED" as PaymentRequestStatus, _isOptimistic: true }
            : req
        );
      });

      // Return context with snapshot for rollback
      return { previousData };
    },
    onError: (error, params, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(["payment-requests"], context.previousData);
      }
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Đã phê duyệt đề xuất");
      // Background refetch - non-blocking
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
        queryClient.invalidateQueries({ queryKey: ["approved-requests-for-cashout"] });
        queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      }, 100);
      // Dashboard updates async - low priority
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 500);
    },
  });
}

// Reject payment request
export function useRejectPaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { requestId: string; rejectionReason: string }) => {
      // Use secure RPC with server-side permission check
      const { data: requestId, error } = await (supabase.rpc as any)('reject_payment_request_secure', {
        p_request_id: params.requestId,
        p_rejection_reason: params.rejectionReason,
      });

      if (error) {
        // Map permission error to user-friendly message
        if (error.message.includes('quyền')) {
          throw new Error(error.message);
        }
        throw new Error('Lỗi từ chối: ' + error.message);
      }

      // Fetch updated request for return value
      const { data } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("id", params.requestId)
        .single();

      return data;
    },
    // OPTIMISTIC UPDATE
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["payment-requests"] });
      const previousData = queryClient.getQueryData(["payment-requests"]);

      queryClient.setQueryData(["payment-requests"], (old: PaymentRequest[] | undefined) => {
        if (!old) return old;
        return old.map(req =>
          req.id === params.requestId
            ? { ...req, status: "REJECTED" as PaymentRequestStatus, rejection_reason: params.rejectionReason, _isOptimistic: true }
            : req
        );
      });

      return { previousData };
    },
    onError: (error, params, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["payment-requests"], context.previousData);
      }
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Đã từ chối đề xuất");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
        queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      }, 100);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 500);
    },
  });
}




// Cancel payment request (PENDING → CANCELLED via secure RPC)
export function useCancelPaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { requestId: string; reason: string }) => {
      if (!params.reason?.trim()) {
        throw new Error("Vui lòng nhập lý do hủy đề xuất.");
      }

      const { data, error } = await (supabase.rpc as any)('cancel_payment_request_secure', {
        p_request_id: params.requestId,
        p_reason: params.reason.trim(),
      });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("AUTH_REQUIRED")) {
          throw new Error("Vui lòng đăng nhập lại.");
        }
        if (msg.includes("PERMISSION_DENIED")) {
          throw new Error("Bạn không có quyền hủy đề xuất thanh toán.");
        }
        if (msg.includes("STATUS_INVALID")) {
          throw new Error("Chỉ đề xuất Chờ duyệt hoặc Đã duyệt (chưa chi) mới có thể hủy.");
        }
        if (msg.includes("HAS_CASHOUT")) {
          throw new Error("Không thể hủy: đề xuất đã có phiếu chi. Vui lòng hủy phiếu chi trước.");
        }
        if (msg.includes("HAS_COLLECTION")) {
          throw new Error("Không thể hủy: đề xuất đã có phiếu thu. Vui lòng hủy phiếu thu trước.");
        }
        if (msg.includes("REQUEST_NOT_FOUND")) {
          throw new Error("Không tìm thấy đề xuất thanh toán.");
        }
        throw new Error(error.message || "Lỗi hủy đề xuất");
      }

      return data;
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["payment-requests"] });
      const previousData = queryClient.getQueryData(["payment-requests"]);

      queryClient.setQueryData(["payment-requests"], (old: PaymentRequest[] | undefined) => {
        if (!old) return old;
        return old.map(req =>
          req.id === params.requestId
            ? { ...req, status: "CANCELLED" as PaymentRequestStatus }
            : req
        );
      });

      return { previousData };
    },
    onError: (error, _params, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["payment-requests"], context.previousData);
      }
      toast.error(error.message);
    },
    onSuccess: () => {
      toast.success("Đã hủy đề xuất thanh toán");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
        queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      }, 100);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 500);
    },
  });
}

// Update payment request (edit)
export function useUpdatePaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      proposed_amount?: number;
      difference_reason?: string;
      expense_category?: ExpenseCategory;
      expense_period?: string;
      recipient_name?: string;
      recipient_unit?: string;
      note?: string;
    }) => {
      // Fetch current data for audit log
      const { data: before } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("id", params.requestId)
        .single();

      if (!before) throw new Error("Không tìm thấy đề xuất");

      // Enforce financial logic: only PENDING can edit amounts
      if (before.status !== "PENDING" && params.proposed_amount !== undefined) {
        throw new Error("Không thể sửa số tiền khi đề xuất đã được duyệt/từ chối");
      }
      if (before.status === "PAID" || before.status === "REJECTED") {
        throw new Error("Không thể sửa đề xuất đã chi/đã từ chối");
      }

      // Build update payload based on status
      const updatePayload: Record<string, any> = {};

      if (before.status === "PENDING") {
        // PENDING: can edit most fields
        if (params.proposed_amount !== undefined) {
          updatePayload.proposed_amount = params.proposed_amount;
        }
        if (params.difference_reason !== undefined) updatePayload.difference_reason = params.difference_reason;
        if (params.expense_category !== undefined) updatePayload.expense_category = params.expense_category;
        if (params.expense_period !== undefined) updatePayload.expense_period = params.expense_period;
        if (params.recipient_name !== undefined) updatePayload.recipient_name = params.recipient_name;
        if (params.recipient_unit !== undefined) updatePayload.recipient_unit = params.recipient_unit;
      }
      // PENDING + APPROVED: can always edit note
      if (params.note !== undefined) updatePayload.note = params.note;

      if (Object.keys(updatePayload).length === 0) {
        throw new Error("Không có thay đổi nào");
      }

      const { data, error } = await supabase
        .from("payment_requests")
        .update(updatePayload)
        .eq("id", params.requestId)
        .select()
        .single();

      if (error) throw error;

      await createAuditLog({
        action: "Chỉnh sửa đề xuất thanh toán",
        entity: "payment_requests",
        entityId: data.id,
        beforeData: before,
        afterData: data,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
      toast.success("Đã cập nhật đề xuất thanh toán");
    },
    onError: (error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// Payment request stats
export function usePaymentRequestStats() {
  return useQuery({
    queryKey: ["payment-request-stats"],
    queryFn: async () => {
      const { data: requests, error } = await supabase
        .from("payment_requests")
        .select("status, proposed_amount");

      if (error) throw error;

      const stats = {
        pending: { count: 0, amount: 0 },
        approved: { count: 0, amount: 0 },
        rejected: { count: 0, amount: 0 },
        paid: { count: 0, amount: 0 },
        total: { count: 0, amount: 0 },
      };

      requests?.forEach(r => {
        const amount = Number(r.proposed_amount) || 0;
        stats.total.count++;
        stats.total.amount += amount;

        switch (r.status) {
          case "PENDING":
            stats.pending.count++;
            stats.pending.amount += amount;
            break;
          case "APPROVED":
            stats.approved.count++;
            stats.approved.amount += amount;
            break;
          case "REJECTED":
            stats.rejected.count++;
            stats.rejected.amount += amount;
            break;
          case "PAID":
            stats.paid.count++;
            stats.paid.amount += amount;
            break;
        }
      });

      return stats;
    },
  });
}

// Category labels for display
export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  SALARY: "Lương nhân sự",
  BHXH_EMPLOYER: "BHXH – Phần doanh nghiệp",
  BHXH_EMPLOYEE: "BHXH – Phần người lao động",
  OTA_COMMISSION: "Hoa hồng OTA",
  OFFICE: "Văn phòng",
  MARKETING: "Marketing",
  BANK_FEE: "Phí ngân hàng",
  TECHNOLOGY: "Công nghệ",
  OTHER: "Khác",
};

export const paymentRequestTypeLabels: Record<PaymentRequestType, string> = {
  HOST_PAYMENT: "Thanh toán Host",
  SERVICE_PARTNER_PAYMENT: "Thanh toán Đối tác DV",
  INTERNAL_EXPENSE: "Chi phí nội bộ",
  OTA_COMMISSION: "Hoa hồng OTA",
  HOST_DEPOSIT: "Đặt cọc Host",
  HOST_PREPAID: "Trả trước Host",
  HOST_DEPOSIT_REFUND: "Thu hoàn cọc Host",
  HOST_PREPAID_REFUND: "Thu hoàn trả trước Host",
  GUEST_REFUND: "Hoàn tiền khách",
};

export const paymentRequestStatusLabels: Record<PaymentRequestStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt – Chưa chi",
  REJECTED: "Từ chối",
  PAID: "Đã chi",
  CANCELLED: "Đã hủy",
};

export const paymentRequestStatusColors: Record<PaymentRequestStatus, string> = {
  PENDING: "bg-warning/10 text-warning",
  APPROVED: "bg-info/10 text-info",
  REJECTED: "bg-destructive/10 text-destructive",
  PAID: "bg-success/10 text-success",
  CANCELLED: "bg-muted text-muted-foreground",
};
