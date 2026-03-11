import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "./useAuditLog";
import { resolveHostSettlementNet } from "@/lib/settlementNetHelper";

export type PaymentType = "HOST_PAYMENT" | "SERVICE_PARTNER_PAYMENT" | "INTERNAL_EXPENSE" | "OTHER";
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
export type PaymentMethod = "BANK_TRANSFER" | "CASH" | "UPC" | "ONEPAY" | "9PAY" | "VPBANK";

export type PaymentStatus = "UNPAID" | "PAID";

export interface OutgoingPayment {
  id: string;
  payment_type: PaymentType;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_gateway?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  transfer_reference?: string;
  paid_at: string;
  paid_by?: string;
  note?: string;
  created_at: string;
  // Type-specific fields
  partner_id?: string;
  partner_name?: string;
  settlement_id?: string;
  settlement_code?: string;
  expense_category?: ExpenseCategory;
  recipient_name?: string;
  source_table: string;
  source_id: string;
  // New fields per spec
  status?: PaymentStatus;
  expense_period?: string;
  confirmed_at?: string;
  proposed_at?: string;
}

// Fetch all outgoing payments (unified view)
export function useOutgoingPayments(filters?: {
  paymentType?: PaymentType;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ["outgoing-payments", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const payments: OutgoingPayment[] = [];

      // 1. Fetch HOST_SETTLEMENT_PAYMENT from cashflow_entries
      if (!filters?.paymentType || filters.paymentType === "HOST_PAYMENT") {
        let hostCashflowQuery = supabase
          .from("cashflow_entries")
          .select("*")
          .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
          .eq("direction", "OUT")
          .order("cash_date", { ascending: false });

        if (filters?.dateFrom) {
          hostCashflowQuery = hostCashflowQuery.gte("cash_date", filters.dateFrom);
        }
        if (filters?.dateTo) {
          hostCashflowQuery = hostCashflowQuery.lte("cash_date", filters.dateTo);
        }

        const { data: hostCashflows } = await hostCashflowQuery;

        if (hostCashflows && hostCashflows.length > 0) {
          // Get settlement details for display
          // NOTE: After Sprint 12, source_id is cash_out_id (not settlement_id)
          // For backward compatibility, try both lookups
          const sourceIds = [...new Set(hostCashflows.map(cf => cf.source_id).filter(Boolean))];

          // Try settlement lookup first (for legacy entries where source_id = settlement_id)
          const { data: settlements } = await supabase
            .from("host_settlements")
            .select("id, settlement_code, partner_id, partner:partners(partner_name)")
            .in("id", sourceIds as string[]);

          const settlementMap = new Map(settlements?.map(s => [s.id, s]) || []);

          payments.push(
            ...hostCashflows.map((cf: any) => {
              const settlement = settlementMap.get(cf.source_id) as any;
              return {
                id: cf.id,
                payment_type: "HOST_PAYMENT" as PaymentType,
                amount: Number(cf.amount),
                currency: cf.currency || "VND",
                payment_method: "BANK_TRANSFER" as PaymentMethod,
                paid_at: cf.cash_date,
                paid_by: cf.created_by,
                note: cf.note,
                created_at: cf.created_at,
                partner_id: settlement?.partner_id || cf.counterparty_id,
                partner_name: settlement?.partner?.partner_name,
                settlement_id: settlement?.id || cf.source_id,
                settlement_code: settlement?.settlement_code,
                source_table: "cashflow_entries",
                source_id: cf.id,
              };
            })
          );
        }
      }

      // 2. Fetch SERVICE_SETTLEMENT_PAYMENT from cashflow_entries
      if (!filters?.paymentType || filters.paymentType === "SERVICE_PARTNER_PAYMENT") {
        let serviceCashflowQuery = supabase
          .from("cashflow_entries")
          .select("*")
          .eq("source_type", "SERVICE_SETTLEMENT_PAYMENT")
          .eq("direction", "OUT")
          .order("cash_date", { ascending: false });

        if (filters?.dateFrom) {
          serviceCashflowQuery = serviceCashflowQuery.gte("cash_date", filters.dateFrom);
        }
        if (filters?.dateTo) {
          serviceCashflowQuery = serviceCashflowQuery.lte("cash_date", filters.dateTo);
        }

        const { data: serviceCashflows } = await serviceCashflowQuery;

        if (serviceCashflows && serviceCashflows.length > 0) {
          const sourceIds = [...new Set(serviceCashflows.map(cf => cf.source_id).filter(Boolean))];
          const { data: settlements } = await supabase
            .from("service_settlements")
            .select("id, settlement_code, partner_id, partner:partners(partner_name)")
            .in("id", sourceIds as string[]);

          const settlementMap = new Map(settlements?.map(s => [s.id, s]) || []);

          payments.push(
            ...serviceCashflows.map((cf: any) => {
              const settlement = settlementMap.get(cf.source_id) as any;
              return {
                id: cf.id,
                payment_type: "SERVICE_PARTNER_PAYMENT" as PaymentType,
                amount: Number(cf.amount),
                currency: cf.currency || "VND",
                payment_method: "BANK_TRANSFER" as PaymentMethod,
                paid_at: cf.cash_date,
                paid_by: cf.created_by,
                note: cf.note,
                created_at: cf.created_at,
                partner_id: settlement?.partner_id || cf.counterparty_id,
                partner_name: settlement?.partner?.partner_name,
                settlement_id: settlement?.id || cf.source_id,
                settlement_code: settlement?.settlement_code,
                source_table: "cashflow_entries",
                source_id: cf.id,
              };
            })
          );
        }
      }

      // 3. Fetch internal_expenses
      if (!filters?.paymentType || filters.paymentType === "INTERNAL_EXPENSE") {
        let expenseQuery = supabase
          .from("internal_expenses")
          .select("*")
          .order("paid_at", { ascending: false });

        if (filters?.dateFrom) {
          expenseQuery = expenseQuery.gte("paid_at", filters.dateFrom);
        }
        if (filters?.dateTo) {
          expenseQuery = expenseQuery.lte("paid_at", filters.dateTo + "T23:59:59");
        }

        const { data: expenses } = await expenseQuery;
        if (expenses) {
          payments.push(
            ...expenses.map((exp: any) => ({
              id: exp.id,
              payment_type: "INTERNAL_EXPENSE" as PaymentType,
              amount: Number(exp.amount),
              currency: exp.currency,
              payment_method: exp.payment_method as PaymentMethod,
              payment_gateway: exp.payment_gateway,
              bank_name: exp.bank_name,
              bank_account_number: exp.bank_account_number,
              bank_account_name: exp.bank_account_name,
              transfer_reference: exp.transfer_reference,
              paid_at: exp.paid_at,
              paid_by: exp.paid_by,
              note: exp.note,
              created_at: exp.created_at,
              expense_category: exp.expense_category as ExpenseCategory,
              recipient_name: exp.recipient_name,
              source_table: "internal_expenses",
              source_id: exp.id,
              // New fields
              status: (exp.status as PaymentStatus) || "PAID",
              expense_period: exp.expense_period,
              confirmed_at: exp.confirmed_at,
              proposed_at: exp.proposed_at || exp.created_at,
            }))
          );
        }
      }

      // Sort combined results by paid_at desc
      return payments.sort(
        (a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
      );
    },
  });
}

// Fetch host settlements for dropdown with COMPUTED payment stats
export function useHostSettlementsForPayment(partnerId?: string) {
  return useQuery({
    queryKey: ["host-settlements-for-payment", partnerId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Only show FINALIZED settlements for payment (not DRAFT)
      let query = supabase
        .from("host_settlements")
        .select("*, partner:partners(partner_name)")
        .in("status", ["FINALIZED", "CLOSED", "SETTLED", "PARTIALLY_PAID"])
        .not("status", "eq", "VOID")
        .order("created_at", { ascending: false });

      if (partnerId) {
        query = query.eq("partner_id", partnerId);
      }

      const { data: settlements, error } = await query;
      if (error) throw error;
      if (!settlements) return [];

      const settlementIds = settlements.map(s => s.id);

      // COMPUTED: Get paid amounts from cashflow_entries
      const paidBySettlement = new Map<string, number>();
      if (settlementIds.length > 0) {
        const { data: cashflows } = await supabase
          .from("cashflow_entries")
          .select("source_id, amount")
          .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
          .eq("direction", "OUT")
          .in("source_id", settlementIds);

        cashflows?.forEach((cf) => {
          const current = paidBySettlement.get(cf.source_id || "") || 0;
          paidBySettlement.set(cf.source_id || "", current + Number(cf.amount || 0));
        });
      }

      // Add computed fields to settlements and FILTER by direction
      // Only include settlements where Roomrise needs to PAY (netAmount > 0)
      return settlements
        .map(s => {
          // Resolve NET via Snapshot Authority helper
          const { netAmount, netDirection } = resolveHostSettlementNet(s);
          const paidAmount = paidBySettlement.get(s.id) || 0;
          const remaining = Math.max(0, Math.abs(netAmount) - paidAmount);

          return {
            ...s,
            computed_net_amount: netAmount,
            computed_paid_amount: paidAmount,
            computed_remaining_amount: remaining,
            net_direction: netDirection,
          };
        })
        .filter(s => s.net_direction === "PAY" && s.computed_remaining_amount > 0);
    },
    enabled: true,
  });
}

// Fetch service settlements for dropdown with COMPUTED payment stats
export function useServiceSettlementsForPayment(partnerId?: string) {
  return useQuery({
    queryKey: ["service-settlements-for-payment", partnerId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Only show finalized settlements for payment
      let query = supabase
        .from("service_settlements")
        .select("*, partner:partners(partner_name)")
        .not("finalized_at", "is", null)
        .order("finalized_at", { ascending: false });

      if (partnerId) {
        query = query.eq("partner_id", partnerId);
      }

      const { data: settlements, error } = await query;
      if (error) throw error;
      if (!settlements) return [];

      const settlementIds = settlements.map(s => s.id);

      // COMPUTED: Get paid amounts from cashflow_entries
      const paidBySettlement = new Map<string, number>();
      if (settlementIds.length > 0) {
        const { data: cashflows } = await supabase
          .from("cashflow_entries")
          .select("source_id, amount")
          .eq("source_type", "SERVICE_SETTLEMENT_PAYMENT")
          .eq("direction", "OUT")
          .in("source_id", settlementIds);

        cashflows?.forEach((cf) => {
          const current = paidBySettlement.get(cf.source_id || "") || 0;
          paidBySettlement.set(cf.source_id || "", current + Number(cf.amount || 0));
        });
      }

      // Add computed fields to settlements and FILTER by direction
      // Only include settlements where Roomrise needs to PAY (netAmount > 0)
      return settlements
        .map(s => {
          const netAmount = Number(s.net_amount) || 0;
          const paidAmount = paidBySettlement.get(s.id) || 0;
          const remaining = Math.max(0, Math.abs(netAmount) - paidAmount);
          const netDirection: "PAY" | "RECEIVE" = netAmount >= 0 ? "PAY" : "RECEIVE";

          return {
            ...s,
            computed_net_amount: netAmount,
            computed_paid_amount: paidAmount,
            computed_remaining_amount: remaining,
            net_direction: netDirection,
          };
        })
        .filter(s => s.net_direction === "PAY" && s.computed_remaining_amount > 0);
    },
    enabled: true,
  });
}

// Fetch all host partners
export function useHostPartnersForPayment() {
  return useQuery({
    queryKey: ["host-partners-for-payment"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name")
        .in("partner_type", ["HOST_LANDLORD", "HOST_OPERATOR"])
        .eq("status", "active")
        .order("partner_name");

      if (error) throw error;
      return data;
    },
  });
}

// Fetch all service partners
export function useServicePartnersForPayment() {
  return useQuery({
    queryKey: ["service-partners-for-payment"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name")
        .in("partner_type", ["SERVICE_PICKUP", "SERVICE_TOUR", "SERVICE_OTHER"])
        .eq("status", "active")
        .order("partner_name");

      if (error) throw error;
      return data;
    },
  });
}

// Create host payment (linked to settlement)
// SPRINT 12: Uses create_financial_transaction_secure RPC instead of direct cashflow INSERT
// Creates: cash_out + ledger_entry + cashflow_entry + audit_log atomically
export function useCreateHostSettlementPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      partner_id: string;
      settlement_id: string;
      amount: number;
      payment_method: PaymentMethod;
      payment_gateway?: string;
      bank_name?: string;
      bank_account_number?: string;
      bank_account_name?: string;
      transfer_reference?: string;
      paid_at: string;
      note?: string;
    }) => {
      // Get settlement details (for display note)
      const { data: settlement, error: settlementError } = await supabase
        .from("host_settlements")
        .select("settlement_code")
        .eq("id", params.settlement_id)
        .single();

      if (settlementError) throw settlementError;

      // SPRINT 12: Atomic cash_out + ledger + cashflow + audit via unified RPC
      // Replaces: direct .from("cashflow_entries").insert({ source_type: "HOST_SETTLEMENT_PAYMENT" })
      // Settlement status guard + period lock + RBAC enforced inside RPC
      const { data: txnResult, error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
        p_transaction_type: 'HOST_SETTLEMENT_PAYMENT',
        p_direction: 'OUT',
        p_amount: params.amount,
        p_cash_date: params.paid_at.split("T")[0],
        p_counterparty_type: 'HOST',
        p_counterparty_id: params.partner_id,
        p_source_type: 'HOST_SETTLEMENT_PAYMENT',
        p_source_id: params.settlement_id,
        p_note: `Thanh toán quyết toán Host ${settlement.settlement_code} - ${params.transfer_reference || ""} ${params.note || ""}`.trim(),
        p_payment_method: params.payment_method || 'BANK_TRANSFER',
        p_bank_name: params.bank_name || null,
        p_account_number: params.bank_account_number || null,
        p_account_name: params.bank_account_name || null,
        p_transfer_reference: params.transfer_reference || null,
        p_metadata: { settlement_id: params.settlement_id, settlement_code: settlement.settlement_code },
      });

      if (txnError) throw txnError;

      return { settlement, txnResult };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outgoing-payments"] });
      queryClient.invalidateQueries({ queryKey: ["host-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["settlement-history"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      queryClient.invalidateQueries({ queryKey: ["host-settlement-payment-stats"] });
      queryClient.invalidateQueries({ queryKey: ["host-settlements-for-payment"] });
      toast.success("Đã ghi nhận thanh toán Host");
    },
    onError: (error) => {
      toast.error("Lỗi thanh toán: " + error.message);
    },
  });
}

// Create service partner payment
// SPRINT 12: Uses create_financial_transaction_secure RPC instead of direct cashflow INSERT
// Creates: cash_out + ledger_entry + cashflow_entry + audit_log atomically
export function useCreateServiceSettlementPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      partner_id: string;
      settlement_id: string;
      amount: number;
      payment_method: PaymentMethod;
      payment_gateway?: string;
      bank_name?: string;
      bank_account_number?: string;
      bank_account_name?: string;
      transfer_reference?: string;
      paid_at: string;
      note?: string;
    }) => {
      // Get settlement details (for display note)
      const { data: settlement, error: settlementError } = await supabase
        .from("service_settlements")
        .select("settlement_code")
        .eq("id", params.settlement_id)
        .single();

      if (settlementError) throw settlementError;

      // SPRINT 12: Atomic cash_out + ledger + cashflow + audit via unified RPC
      // Replaces: direct .from("cashflow_entries").insert({ source_type: "SERVICE_SETTLEMENT_PAYMENT" })
      const { data: txnResult, error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
        p_transaction_type: 'SERVICE_SETTLEMENT_PAYMENT',
        p_direction: 'OUT',
        p_amount: params.amount,
        p_cash_date: params.paid_at.split("T")[0],
        p_counterparty_type: 'SERVICE_PARTNER',
        p_counterparty_id: params.partner_id,
        p_source_type: 'SERVICE_SETTLEMENT_PAYMENT',
        p_source_id: params.settlement_id,
        p_note: `Thanh toán quyết toán DV ${settlement.settlement_code} - ${params.transfer_reference || ""} ${params.note || ""}`.trim(),
        p_payment_method: params.payment_method || 'BANK_TRANSFER',
        p_bank_name: params.bank_name || null,
        p_account_number: params.bank_account_number || null,
        p_account_name: params.bank_account_name || null,
        p_transfer_reference: params.transfer_reference || null,
        p_metadata: { settlement_id: params.settlement_id, settlement_code: settlement.settlement_code },
      });

      if (txnError) throw txnError;

      return { settlement, txnResult };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outgoing-payments"] });
      queryClient.invalidateQueries({ queryKey: ["service-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["settlement-history"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      queryClient.invalidateQueries({ queryKey: ["service-settlement-payment-stats"] });
      queryClient.invalidateQueries({ queryKey: ["service-settlements-for-payment"] });
      toast.success("Đã ghi nhận thanh toán Đối tác DV");
    },
    onError: (error) => {
      toast.error("Lỗi thanh toán: " + error.message);
    },
  });
}

// Create internal expense
export function useCreateInternalExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      expense_category: ExpenseCategory;
      recipient_name?: string;
      amount: number;
      payment_method: PaymentMethod;
      payment_gateway?: string;
      bank_name?: string;
      bank_account_number?: string;
      bank_account_name?: string;
      transfer_reference?: string;
      paid_at: string;
      note?: string;
      // New fields per spec
      expense_period?: string;
      confirmed_at?: string;
      status?: PaymentStatus;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Determine status based on whether payment date is set
      const status = params.status || "PAID";

      // Create internal expense
      const { data: expense, error } = await supabase
        .from("internal_expenses")
        .insert({
          expense_category: params.expense_category,
          recipient_name: params.recipient_name,
          amount: params.amount,
          payment_method: params.payment_method,
          payment_gateway: params.payment_gateway,
          bank_name: params.bank_name,
          bank_account_number: params.bank_account_number,
          bank_account_name: params.bank_account_name,
          transfer_reference: params.transfer_reference,
          paid_at: params.paid_at,
          paid_by: user?.id,
          note: params.note,
          // New fields
          expense_period: params.expense_period,
          confirmed_at: params.confirmed_at,
          status: status,
          proposed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Create cashflow entry ONLY if status is PAID
      // NOTE: INTERNAL_EXPENSE is already ENFORCED via create_cash_out_atomic path
      // This direct insert is kept for backward compatibility but should be migrated
      if (status === "PAID") {
        await safeMutation(() => supabase.from("cashflow_entries").insert({
          amount: params.amount,
          cash_date: params.paid_at.split("T")[0],
          direction: "OUT",
          counterparty_type: "INTERNAL",
          counterparty_id: null,
          source_type: "INTERNAL_EXPENSE",
          source_id: expense.id,
          created_by: user?.id,
          note: `Chi phí nội bộ - ${getCategoryLabel(params.expense_category)} - ${params.recipient_name || ""} ${params.note || ""}`.trim(),
        }));
      }

      // Audit log
      await createAuditLog({
        action: "Ghi nhận chi phí nội bộ",
        entity: "internal_expenses",
        entityId: expense.id,
        afterData: expense,
      });

      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outgoing-payments"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      toast.success("Đã ghi nhận chi phí nội bộ");
    },
    onError: (error) => {
      toast.error("Lỗi ghi nhận: " + error.message);
    },
  });
}

// Helper function
function getCategoryLabel(category: ExpenseCategory): string {
  const labels: Record<ExpenseCategory, string> = {
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
  return labels[category] || category;
}

// Get payment stats
export function usePaymentStats(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["payment-stats", dateFrom, dateTo],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Host payments
      let hostQuery = supabase
        .from("host_payments")
        .select("amount");
      if (dateFrom) hostQuery = hostQuery.gte("paid_at", dateFrom);
      if (dateTo) hostQuery = hostQuery.lte("paid_at", dateTo + "T23:59:59");
      const { data: hostPayments } = await hostQuery;

      // Internal expenses
      let expenseQuery = supabase
        .from("internal_expenses")
        .select("amount");
      if (dateFrom) expenseQuery = expenseQuery.gte("paid_at", dateFrom);
      if (dateTo) expenseQuery = expenseQuery.lte("paid_at", dateTo + "T23:59:59");
      const { data: expenses } = await expenseQuery;

      const totalHost = hostPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const totalInternal = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      return {
        totalHost,
        totalServicePartner: 0, // TODO: Add when service payments are tracked
        totalInternal,
        totalAll: totalHost + totalInternal,
        countHost: hostPayments?.length || 0,
        countInternal: expenses?.length || 0,
      };
    },
  });
}
