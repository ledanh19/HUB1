import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "./useAuditLog";

export interface HostPayment {
  id: string;
  payable_id: string;
  partner_id: string;
  unified_booking_id: string;
  amount: number;
  currency: string;
  payment_method: "BANK_TRANSFER" | "CASH" | "OTHER";
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  transfer_reference: string | null;
  paid_at: string;
  paid_by: string | null;
  note: string | null;
  created_at: string;
  partner?: { partner_name: string };
}

export function useHostPayments(payableId?: string) {
  return useQuery({
    queryKey: ["host-payments", payableId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("host_payments")
        .select("*, partner:partners(partner_name)")
        .order("paid_at", { ascending: false });

      if (payableId) {
        query = query.eq("payable_id", payableId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as HostPayment[];
    },
  });
}

export function useCreateHostPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      payable_id: string;
      partner_id: string;
      unified_booking_id: string;
      amount: number;
      payment_method: "BANK_TRANSFER" | "CASH" | "OTHER";
      bank_name?: string;
      bank_account_number?: string;
      bank_account_name?: string;
      transfer_reference?: string;
      paid_at: string;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Create payment record
      const { data: payment, error } = await supabase
        .from("host_payments")
        .insert({
          payable_id: params.payable_id,
          partner_id: params.partner_id,
          unified_booking_id: params.unified_booking_id,
          amount: params.amount,
          payment_method: params.payment_method,
          bank_name: params.bank_name,
          bank_account_number: params.bank_account_number,
          bank_account_name: params.bank_account_name,
          transfer_reference: params.transfer_reference,
          paid_at: params.paid_at,
          paid_by: user?.id,
          note: params.note,
        })
        .select()
        .single();

      if (error) throw error;

      // Update payable paid_amount
      const { data: payable } = await supabase
        .from("host_payables")
        .select("paid_amount, amount")
        .eq("id", params.payable_id)
        .single();

      const newPaidAmount = (Number(payable?.paid_amount) || 0) + params.amount;
      const totalAmount = Number(payable?.amount) || 0;
      const newStatus = newPaidAmount >= totalAmount ? "PAID" : newPaidAmount > 0 ? "PARTIAL" : "PENDING";

      await supabase
        .from("host_payables")
        .update({
          paid_amount: newPaidAmount,
          status: newStatus,
          paid_at: newStatus === "PAID" ? new Date().toISOString() : null,
          paid_by: newStatus === "PAID" ? user?.id : null,
        })
        .eq("id", params.payable_id);

      // SPRINT 12: Atomic cash_out + ledger + cashflow + audit via unified RPC
      // Replaces: direct .from("cashflow_entries").insert() + separate createAuditLog()
      const { error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
        p_transaction_type: 'HOST_PAYMENT',
        p_direction: 'OUT',
        p_amount: params.amount,
        p_cash_date: params.paid_at.split("T")[0],
        p_counterparty_type: 'HOST',
        p_counterparty_id: params.partner_id,
        p_source_type: 'HOST_PAYMENT',
        p_source_id: payment.id,
        p_note: `Thanh toán Host - ${params.transfer_reference || ""} ${params.note || ""}`.trim(),
        p_payment_method: params.payment_method || 'BANK_TRANSFER',
        p_bank_name: params.bank_name || null,
        p_account_number: params.bank_account_number || null,
        p_account_name: params.bank_account_name || null,
        p_transfer_reference: params.transfer_reference || null,
        p_metadata: { payment_id: payment.id, payable_id: params.payable_id },
      });

      if (txnError) throw txnError;

      return payment;
    },
    onSuccess: () => {
      toast.success("Đã ghi nhận thanh toán Host");
      // Partial invalidation: immediate for related data
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["host-payments"] });
        queryClient.invalidateQueries({ queryKey: ["host-payables"] });
        queryClient.invalidateQueries({ queryKey: ["host_payables"] });
        queryClient.invalidateQueries({ queryKey: ["host-payable-detail"] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
        queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      }, 100);
      // Delay dashboard refresh
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      }, 500);
    },
    onError: (error) => {
      toast.error("Lỗi thanh toán: " + error.message);
    },
  });
}

export function useDepositPrepaidSummary() {
  return useQuery({
    queryKey: ["deposit-prepaid-summary"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [depositsResult, prepaidsResult] = await Promise.all([
        supabase
          .from("host_deposits")
          .select("deposit_amount, status, partner_id, partners(partner_name)")
          .eq("status", "HELD"),
        supabase
          .from("host_prepaids")
          .select("prepaid_amount, prepaid_status, partner_id, partners(partner_name)")
          .eq("prepaid_status", "OPEN"),
      ]);

      if (depositsResult.error) throw depositsResult.error;
      if (prepaidsResult.error) throw prepaidsResult.error;

      const totalDepositsHeld = depositsResult.data?.reduce((sum, d) => sum + Number(d.deposit_amount), 0) || 0;
      const totalPrepaidsOpen = prepaidsResult.data?.reduce((sum, p) => sum + Number(p.prepaid_amount), 0) || 0;

      return {
        totalDepositsHeld,
        totalPrepaidsOpen,
        depositsCount: depositsResult.data?.length || 0,
        prepaidsCount: prepaidsResult.data?.length || 0,
      };
    },
  });
}
