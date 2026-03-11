import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation, safeRpc } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "./useAuditLog";
import { keepPrevious } from "@/lib/query-helpers";

export type PaymentMethod = "BANK_TRANSFER" | "CASH" | "UPC" | "ONEPAY" | "9PAY" | "VPBANK";

export interface CashOut {
  id: string;
  payment_request_id: string;
  request_code?: string;
  payment_type?: string;
  partner_name?: string;
  amount: number;
  currency: string;
  paid_at: string;
  payment_method: PaymentMethod;
  payment_gateway?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  transfer_reference?: string;
  recipient_name?: string;
  is_out_of_process: boolean;
  out_of_process_reason?: string;
  paid_by?: string;
  note?: string;
  created_at: string;
  receipt_image?: string | null;
  receipt_status?: string | null;
}

// Fetch all cash outs
export function useCashOuts(filters?: {
  dateFrom?: string;
  dateTo?: string;
  paymentMethod?: PaymentMethod;
}) {
  return useQuery({
    queryKey: ["cash-outs", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: async () => {
      let query = supabase
        .from("cash_outs")
        .select("*")
        .order("paid_at", { ascending: false });

      if (filters?.dateFrom) {
        query = query.gte("paid_at", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("paid_at", filters.dateTo + "T23:59:59");
      }
      if (filters?.paymentMethod) {
        query = query.eq("payment_method", filters.paymentMethod);
      }

      const { data: cashOuts, error } = await query;
      if (error) throw error;
      if (!cashOuts) return [];

      // Get payment request details (filter out nulls to avoid .in() errors)
      const requestIds = [...new Set(
        cashOuts.map(co => co.payment_request_id).filter((id): id is string => id != null)
      )];
      const requestsMap = new Map<string, any>();

      if (requestIds.length > 0) {
        const { data: requests, error: reqError } = await supabase
          .from("payment_requests")
          .select("id, request_code, payment_type, recipient_name, partner:partners(partner_name)")
          .in("id", requestIds);

        if (reqError) {
          console.error("[useCashOuts] Failed to fetch payment_requests:", reqError);
        }
        requests?.forEach(r => requestsMap.set(r.id, r));
      }

      return cashOuts.map((co: any): CashOut => {
        const request = requestsMap.get(co.payment_request_id);
        return {
          id: co.id,
          payment_request_id: co.payment_request_id,
          request_code: request?.request_code,
          payment_type: request?.payment_type,
          partner_name: request?.partner?.partner_name || request?.recipient_name,
          amount: Number(co.amount),
          currency: co.currency,
          paid_at: co.paid_at,
          payment_method: co.payment_method,
          payment_gateway: co.payment_gateway,
          bank_name: co.bank_name,
          bank_account_number: co.bank_account_number,
          bank_account_name: co.bank_account_name,
          transfer_reference: co.transfer_reference,
          recipient_name: co.recipient_name,
          is_out_of_process: co.is_out_of_process,
          out_of_process_reason: co.out_of_process_reason,
          paid_by: co.paid_by,
          note: co.note,
          created_at: co.created_at,
          receipt_image: co.receipt_image,
          receipt_status: co.receipt_status,
        };
      });
    },
  });
}

// Create cash out - PHASE II: Use atomic RPC to prevent race conditions
export function useCreateCashOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      payment_request_id: string;
      amount: number;
      paid_at: string;
      payment_method: PaymentMethod;
      payment_gateway?: string;
      bank_name?: string;
      bank_account_number?: string;
      bank_account_name?: string;
      transfer_reference?: string;
      recipient_name?: string;
      is_out_of_process?: boolean;
      out_of_process_reason?: string;
      note?: string;
      receipt_image?: string;
      receipt_status?: string;
    }) => {
      // PHASE II: Call atomic RPC instead of direct insert
      // This handles: validation, FOR UPDATE lock, ledger entry, cashflow, audit
      const { data: cashOutId, error } = await safeRpc(() => supabase.rpc('create_cash_out_atomic', {
        p_payment_request_id: params.payment_request_id,
        p_amount: params.amount,
        p_payment_method: params.payment_method,
        p_paid_at: params.paid_at,
        p_bank_name: params.bank_name || null,
        p_account_number: params.bank_account_number || null,
        p_account_name: params.bank_account_name || null,
        p_transfer_reference: params.transfer_reference || null,
        p_recipient_name: params.recipient_name || null,
        p_note: params.note || null,
        p_is_out_of_process: params.is_out_of_process || false,
        p_out_of_process_reason: params.out_of_process_reason || null,
        p_receipt_image: params.receipt_image || null,
      }));

      if (error) {
        // Map Postgres error to user-friendly message
        if (error.message.includes('vượt quá số còn lại')) {
          throw new Error(error.message);
        }
        if (error.message.includes('đã được phê duyệt')) {
          throw new Error(error.message);
        }
        throw new Error('Lỗi chi tiền: ' + error.message);
      }

      // Fetch the created cash out for return
      const { data: cashOut } = await supabase
        .from('cash_outs')
        .select('*')
        .eq('id', cashOutId)
        .single();

      return cashOut;
    },
    // OPTIMISTIC UPDATE for cash out
    onMutate: async (params) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["cash-outs"] });
      await queryClient.cancelQueries({ queryKey: ["payment-requests"] });

      // Snapshot for rollback
      const previousCashOuts = queryClient.getQueryData(["cash-outs"]);
      const previousRequests = queryClient.getQueryData(["payment-requests"]);

      // Optimistic update: add pending cash out to list
      const optimisticCashOut = {
        id: `temp-${Date.now()}`,
        payment_request_id: params.payment_request_id,
        amount: params.amount,
        paid_at: params.paid_at,
        payment_method: params.payment_method,
        currency: "VND",
        is_out_of_process: params.is_out_of_process || false,
        _isOptimistic: true,
      };

      queryClient.setQueryData(["cash-outs"], (old: CashOut[] | undefined) => {
        if (!old) return [optimisticCashOut];
        return [optimisticCashOut, ...old];
      });

      return { previousCashOuts, previousRequests };
    },
    onError: (error, params, context) => {
      // Rollback
      if (context?.previousCashOuts) {
        queryClient.setQueryData(["cash-outs"], context.previousCashOuts);
      }
      if (context?.previousRequests) {
        queryClient.setQueryData(["payment-requests"], context.previousRequests);
      }
      toast.error("Lỗi chi tiền: " + error.message);
    },
    onSuccess: () => {
      toast.success("Đã ghi nhận chi tiền");
      // High priority refetch - immediate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["cash-outs"] });
        queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
        queryClient.invalidateQueries({ queryKey: ["approved-requests-for-cashout"] });
      }, 100);
      // Low priority refetch - reduced delay (was 1000ms)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["cash-out-stats"] });
        queryClient.invalidateQueries({ queryKey: ["payment-request-stats"] });
        queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["host_settlements"] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      }, 400);
    },
  });
}

// Update cash out receipt
export function useUpdateCashOutReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      receipt_image: string | null;
      receipt_status: string;
    }) => {
      const { data: updated, error } = await supabase
        .from("cash_outs")
        .update({
          receipt_image: params.receipt_image,
          receipt_status: params.receipt_status,
        })
        .eq("id", params.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!updated) throw new Error("Không thể cập nhật chứng từ (không tìm thấy giao dịch hoặc không đủ quyền)");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-outs"] });
      toast.success("Đã cập nhật chứng từ");
    },
    onError: (error) => {
      toast.error("Lỗi cập nhật chứng từ: " + error.message);
    },
  });
}

// Cash out stats
export function useCashOutStats(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["cash-out-stats", dateFrom, dateTo],
    queryFn: async () => {
      let query: any = safeQuery(() => supabase.from("cash_outs").select("amount, payment_method, paid_at"));

      if (dateFrom) {
        query = query.gte("paid_at", dateFrom);
      }
      if (dateTo) {
        query = query.lte("paid_at", dateTo + "T23:59:59");
      }

      const { data: cashOuts, error } = await query;
      if (error) throw error;

      const stats = {
        totalAmount: 0,
        totalCount: 0,
        byMethod: {} as Record<string, { count: number; amount: number }>,
      };

      cashOuts?.forEach(co => {
        const amount = Number(co.amount) || 0;
        stats.totalAmount += amount;
        stats.totalCount++;

        if (!stats.byMethod[co.payment_method]) {
          stats.byMethod[co.payment_method] = { count: 0, amount: 0 };
        }
        stats.byMethod[co.payment_method].count++;
        stats.byMethod[co.payment_method].amount += amount;
      });

      return stats;
    },
  });
}

// Payment method labels
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Chuyển khoản",
  CASH: "Tiền mặt",
  UPC: "UPC",
  ONEPAY: "OnePay",
  "9PAY": "9Pay",
  VPBANK: "VPBank",
};
