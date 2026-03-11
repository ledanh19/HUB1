import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "./useAuditLog";

// Generate request code for collection
async function generateCollectionRequestCode(): Promise<string> {
  const now = new Date();
  const yearMonth = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: existing } = await supabase
    .from("payment_requests")
    .select("request_code")
    .like("request_code", `CR${yearMonth}%`)
    .order("request_code", { ascending: false })
    .limit(1);

  let seq = 1;
  if (existing && existing.length > 0) {
    const lastCode = existing[0].request_code;
    const lastSeq = parseInt(lastCode.slice(6), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `CR${yearMonth}${String(seq).padStart(4, '0')}`;
}

// HOÀN CỌC - Tạo đề xuất thu tiền từ Host
// Khi hoàn cọc: Host trả lại tiền cho Roomrise
// => Tạo đề xuất thu tiền (COLLECTION_REQUEST), khi thu tiền xong => sinh phiếu thu
export function useRefundDepositWithCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      depositId: string;
      amount: number;
      partnerId: string;
      partnerName: string;
      unifiedBookingId: string;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get deposit before
      const { data: deposit } = await supabase
        .from("host_deposits")
        .select("*")
        .eq("id", params.depositId)
        .single();

      if (!deposit) throw new Error("Không tìm thấy đặt cọc");
      if (deposit.approval_status !== "PAID") {
        throw new Error("Chỉ có thể hoàn cọc đã chi tiền");
      }
      if (deposit.status === "REFUNDED") {
        throw new Error("Đặt cọc này đã được hoàn trước đó");
      }
      if (deposit.status === "OFFSET") {
        throw new Error("Đặt cọc này đã được cấn trừ vào quyết toán");
      }

      // Generate request code
      const requestCode = await generateCollectionRequestCode();

      // 1. Create collection request (Đề xuất thu tiền từ Host)
      // requested_by is set server-side by DB trigger (trg_payment_requests_force_requested_by)
      const { data: collectionRequest, error: crError } = await supabase
        .from("payment_requests")
        .insert({
          request_code: requestCode,
          payment_type: "HOST_DEPOSIT_REFUND", // Loại: Hoàn cọc Host
          partner_id: params.partnerId,
          unified_booking_id: params.unifiedBookingId,
          source_amount: params.amount,
          proposed_amount: params.amount,
          note: params.note || `Hoàn cọc từ ${params.partnerName} - Booking: ${params.unifiedBookingId}`,
          status: "PENDING", // Chờ duyệt thu tiền
        })
        .select()
        .single();

      if (crError) throw crError;

      // 2. Update deposit status to REFUNDING (đang chờ thu tiền)
      const { error: depositError } = await supabase
        .from("host_deposits")
        .update({
          status: "REFUNDED",
          refunded_at: new Date().toISOString(),
          refunded_by: user?.id,
        })
        .eq("id", params.depositId);

      if (depositError) throw depositError;

      // 3. Audit log
      await createAuditLog({
        action: "Tạo đề xuất hoàn cọc Host",
        entity: "host_deposits",
        entityId: params.depositId,
        beforeData: deposit,
        afterData: {
          status: "REFUNDED",
          collection_request_id: collectionRequest.id,
          collection_request_code: requestCode,
        },
      });

      await createAuditLog({
        action: "Tạo đề xuất thu tiền hoàn cọc",
        entity: "payment_requests",
        entityId: collectionRequest.id,
        afterData: collectionRequest,
      });

      return {
        deposit,
        collectionRequest,
        requestCode,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["host-deposits"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      toast.success(`Đã tạo đề xuất thu tiền hoàn cọc: ${data.requestCode}`);
    },
    onError: (error) => {
      toast.error("Lỗi hoàn cọc: " + error.message);
    },
  });
}

// HOÀN TRẢ TRƯỚC - Tạo đề xuất thu tiền từ Host
export function useRefundPrepaidWithCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      prepaidId: string;
      amount: number;
      partnerId: string;
      partnerName: string;
      unifiedBookingId: string;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get prepaid before
      const { data: prepaid } = await supabase
        .from("host_prepaids")
        .select("*")
        .eq("id", params.prepaidId)
        .single();

      if (!prepaid) throw new Error("Không tìm thấy trả trước");
      if (prepaid.approval_status !== "PAID") {
        throw new Error("Chỉ có thể hoàn trả trước đã chi tiền");
      }
      if (prepaid.prepaid_status === "APPLIED") {
        throw new Error("Trả trước này đã được cấn trừ vào quyết toán");
      }

      // Generate request code
      const requestCode = await generateCollectionRequestCode();

      // 1. Create collection request
      // requested_by is set server-side by DB trigger (trg_payment_requests_force_requested_by)
      const { data: collectionRequest, error: crError } = await supabase
        .from("payment_requests")
        .insert({
          request_code: requestCode,
          payment_type: "HOST_PREPAID_REFUND",
          partner_id: params.partnerId,
          unified_booking_id: params.unifiedBookingId,
          source_amount: params.amount,
          proposed_amount: params.amount,
          note: params.note || `Hoàn trả trước từ ${params.partnerName} - Booking: ${params.unifiedBookingId}`,
          status: "PENDING",
        })
        .select()
        .single();

      if (crError) throw crError;

      // 2. Update prepaid status
      const { error: prepaidError } = await supabase
        .from("host_prepaids")
        .update({
          prepaid_status: "REFUNDED",
        })
        .eq("id", params.prepaidId);

      if (prepaidError) throw prepaidError;

      // 3. Audit log
      await createAuditLog({
        action: "Tạo đề xuất hoàn trả trước Host",
        entity: "host_prepaids",
        entityId: params.prepaidId,
        beforeData: prepaid,
        afterData: {
          prepaid_status: "REFUNDED",
          collection_request_id: collectionRequest.id,
        },
      });

      return {
        prepaid,
        collectionRequest,
        requestCode,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["host-prepaids"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      toast.success(`Đã tạo đề xuất thu tiền hoàn trả trước: ${data.requestCode}`);
    },
    onError: (error) => {
      toast.error("Lỗi hoàn trả trước: " + error.message);
    },
  });
}

// Thu tiền hoàn cọc - tạo phiếu thu (hotel_collects) và cashflow
export function useCollectRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      amount: number;
      paymentMethod: string;
      reference?: string;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Get request details
      const { data: request } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("id", params.requestId)
        .single();

      if (!request) throw new Error("Không tìm thấy đề xuất");
      if (request.status !== "APPROVED") {
        throw new Error("Chỉ có thể thu tiền cho đề xuất đã được duyệt");
      }

      // 1. Create hotel_collects (phiếu thu)
      const { data: collection, error: collectError } = await supabase
        .from("hotel_collects")
        .insert({
          unified_booking_id: request.unified_booking_id,
          amount_collected: params.amount,
          payment_method: params.paymentMethod,
          collection_type: "COLLECT",
          related_type: request.payment_type === "HOST_DEPOSIT_REFUND" ? "HOST_DEPOSIT_REFUND" : "HOST_PREPAID_REFUND",
          related_id: params.requestId,
          payer_type: "HOST",
          payee_type: "ROOMRISE",
          status: "COLLECTED",
          collected_by: user?.id,
          receipt: params.reference || null,
          note: params.note || `Thu tiền hoàn cọc/trả trước từ Host`,
        })
        .select()
        .single();

      if (collectError) throw collectError;

      // SPRINT 12: Atomic ledger + cashflow + audit via unified RPC
      const { error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
        p_transaction_type: 'HOST_DEPOSIT_REFUND',
        p_direction: 'IN',
        p_amount: params.amount,
        p_cash_date: new Date().toISOString().split('T')[0],
        p_counterparty_type: 'HOST',
        p_counterparty_id: request.partner_id,
        p_source_type: request.payment_type,
        p_source_id: collection.id,
        p_note: `Thu tiền hoàn cọc/trả trước - ${request.request_code}`,
        p_metadata: { request_id: params.requestId, collection_id: collection.id },
      });
      if (txnError) throw txnError;

      // 3. Update request status to PAID
      await supabase
        .from("payment_requests")
        .update({ status: "PAID" })
        .eq("id", params.requestId);

      // 4. Audit log
      await createAuditLog({
        action: "Thu tiền hoàn cọc/trả trước Host",
        entity: "hotel_collects",
        entityId: collection.id,
        afterData: { ...collection, request_code: request.request_code },
      });

      return collection;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["hotel-collects"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      toast.success("Đã ghi nhận thu tiền");
    },
    onError: (error) => {
      toast.error("Lỗi thu tiền: " + error.message);
    },
  });
}

// Tạo đề xuất hoàn tiền từ payment_request (HOST_DEPOSIT/HOST_PREPAID đã PAID)
// Dùng cho trang HostDepositsPage mới - đọc từ payment_requests thay vì host_deposits
export function useCreateHostDepositRefundRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      original_request_id: string;
      partner_id: string;
      partner_name: string;
      unified_booking_id: string;
      amount: number;
      note?: string;
    }) => {
      // Get original request
      const { data: originalRequest } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("id", params.original_request_id)
        .single();

      if (!originalRequest) throw new Error("Không tìm thấy đề xuất gốc");
      if (originalRequest.status !== "PAID") {
        throw new Error("Chỉ có thể hoàn tiền cho đề xuất đã chi");
      }

      const isDeposit = originalRequest.payment_type === "HOST_DEPOSIT";
      const refundType = isDeposit ? "HOST_DEPOSIT_REFUND" : "HOST_PREPAID_REFUND";

      // Generate request code
      const requestCode = await generateCollectionRequestCode();

      // Create collection request (Đề xuất thu tiền từ Host)
      // requested_by is set server-side by DB trigger (trg_payment_requests_force_requested_by)
      const { data: collectionRequest, error: crError } = await supabase
        .from("payment_requests")
        .insert({
          request_code: requestCode,
          payment_type: refundType,
          partner_id: params.partner_id,
          unified_booking_id: params.unified_booking_id,
          source_amount: params.amount,
          proposed_amount: params.amount,
          source_id: params.original_request_id, // Link to original request
          note: params.note || `Hoàn tiền từ ${params.partner_name} - Booking: ${params.unified_booking_id} - Đề xuất gốc: ${originalRequest.request_code}`,
          status: "PENDING",
        })
        .select()
        .single();

      if (crError) throw crError;

      // Audit log
      await createAuditLog({
        action: isDeposit ? "Tạo đề xuất thu tiền hoàn cọc" : "Tạo đề xuất thu tiền hoàn trả trước",
        entity: "payment_requests",
        entityId: collectionRequest.id,
        afterData: {
          ...collectionRequest,
          original_request_code: originalRequest.request_code
        },
      });

      return {
        collectionRequest,
        requestCode,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["host-deposit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      toast.success(`Đã tạo đề xuất thu tiền: ${data.requestCode}`);
    },
    onError: (error) => {
      toast.error("Lỗi tạo đề xuất hoàn tiền: " + error.message);
    },
  });
}
