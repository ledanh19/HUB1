import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveHostSettlementNet } from "@/lib/settlementNetHelper";
import {
  HOST_SETTLEMENT_SOURCE_TYPES,
  HOST_CASHOUT_SETTLEMENT_TYPE,
  SERVICE_CASHOUT_SETTLEMENT_TYPE,
  SERVICE_SETTLEMENT_SOURCE_TYPES,
} from "@/constants/settlementPaymentSourceTypes";
import { computePaidSourceInfo, type PaidSource } from "@/lib/settlementPaidSource";

export type PaymentStatusComputed = "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";

export interface SettlementPaymentStats {
  settlement_id: string;
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatusComputed;
  paid_source: PaidSource;
  dual_paid_warning: boolean;
}

/**
 * Compute payment status from paid vs net amounts
 * This is the SINGLE source of truth for payment status calculation
 */
export function computePaymentStatus(paidAmount: number, netAmount: number): PaymentStatusComputed {
  const absNet = Math.abs(netAmount);
  const tolerance = 1000; // VND rounding tolerance
  if (paidAmount <= 0) return "UNPAID";
  if (paidAmount >= absNet - tolerance) return paidAmount > absNet + tolerance ? "OVERPAID" : "PAID";
  return "PARTIAL";
}

/**
 * Fetch computed payment stats for a single host settlement
 * Stats are COMPUTED from cashflow_entries, NOT stored in settlement
 */
export function useHostSettlementPaymentStats(settlementId: string | null) {
  return useQuery({
    queryKey: ["host-settlement-payment-stats", settlementId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<SettlementPaymentStats | null> => {
      if (!settlementId) return null;

      // 1. Get settlement NET amount
      const { data: settlement, error: settError } = await supabase
        .from("host_settlements")
        .select("total_payable_amount, total_host_collected, total_deposits_applied, total_prepaids_applied, remaining_amount, status")
        .eq("id", settlementId)
        .single();

      if (settError) throw settError;
      if (!settlement) return null;

      // Resolve NET via Snapshot Authority helper
      const { netAmount } = resolveHostSettlementNet(settlement);

      // 2. Get total paid from cash_outs + cashflow_entries + apply events in parallel
      const [cashOutsRes, cashflowRes, applyRes] = await Promise.all([
        supabase
          .from("cash_outs")
          .select("amount")
            .eq("settlement_type", HOST_CASHOUT_SETTLEMENT_TYPE)
          .eq("settlement_id", settlementId),
        supabase
          .from("cashflow_entries")
          .select("amount")
          .in("source_type", [...HOST_SETTLEMENT_SOURCE_TYPES])
          .eq("direction", "OUT")
          .eq("source_id", settlementId),
        supabase
          .from("host_settlement_apply_events")
          .select("amount")
          .eq("settlement_id", settlementId),
      ]);

      if (cashOutsRes.error) throw cashOutsRes.error;
      if (cashflowRes.error) throw cashflowRes.error;
      if (applyRes.error) throw applyRes.error;

      const coPaid = cashOutsRes.data?.reduce((sum, co) => sum + Number(co.amount || 0), 0) || 0;
      const cfPaid = cashflowRes.data?.reduce((sum, cf) => sum + Number(cf.amount || 0), 0) || 0;
      const psi = computePaidSourceInfo(coPaid, cfPaid);
      const applyTotal = (applyRes.data || []).reduce((sum, ae) => sum + Number(ae.amount || 0), 0);
      const effectiveNet = netAmount - applyTotal;
      const absNet = Math.abs(effectiveNet);
      const remaining = Math.max(0, absNet - psi.paid_amount);
      const paymentStatus = computePaymentStatus(psi.paid_amount, effectiveNet);

      return {
        settlement_id: settlementId,
        paid_amount: psi.paid_amount,
        remaining_amount: remaining,
        payment_status: paymentStatus,
        paid_source: psi.paid_source,
        dual_paid_warning: psi.dual_paid_warning,
      };
    },
    enabled: !!settlementId,
  });
}

/**
 * Fetch computed payment stats for multiple host settlements at once.
 * Used by SettlementListDialog, Settlement History, and Aging Report.
 *
 * PHASE A FIX: Now queries BOTH cash_outs AND cashflow_entries,
 * applies computePaidSourceInfo per settlement, and returns
 * proper SettlementPaymentStats instead of raw number map.
 */
export function useHostSettlementsPaymentStats(settlementIds: string[]) {
  return useQuery({
    queryKey: ["host-settlements-payment-stats-batch", settlementIds.sort().join(",")],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Map<string, SettlementPaymentStats>> => {
      if (!settlementIds.length) return new Map();

      // Query both cash_outs and cashflow_entries in parallel
      const [cashOutsRes, cashflowRes] = await Promise.all([
        supabase
          .from("cash_outs")
          .select("settlement_id, amount")
          .eq("settlement_type", HOST_CASHOUT_SETTLEMENT_TYPE)
          .in("settlement_id", settlementIds),
        supabase
          .from("cashflow_entries")
          .select("source_id, amount")
          .in("source_type", [...HOST_SETTLEMENT_SOURCE_TYPES])
          .eq("direction", "OUT")
          .in("source_id", settlementIds),
      ]);

      if (cashOutsRes.error) throw cashOutsRes.error;
      if (cashflowRes.error) throw cashflowRes.error;

      // Group cash_outs by settlement_id
      const coBySettlement = new Map<string, number>();
      cashOutsRes.data?.forEach((co) => {
        const sid = co.settlement_id || "";
        coBySettlement.set(sid, (coBySettlement.get(sid) || 0) + Number(co.amount || 0));
      });

      // Group cashflow_entries by source_id (= settlement_id)
      const cfBySettlement = new Map<string, number>();
      cashflowRes.data?.forEach((cf) => {
        const sid = cf.source_id || "";
        cfBySettlement.set(sid, (cfBySettlement.get(sid) || 0) + Number(cf.amount || 0));
      });

      // Build stats map
      const result = new Map<string, SettlementPaymentStats>();
      for (const sid of settlementIds) {
        const coPaid = coBySettlement.get(sid) || 0;
        const cfPaid = cfBySettlement.get(sid) || 0;
        const psi = computePaidSourceInfo(coPaid, cfPaid);

        result.set(sid, {
          settlement_id: sid,
          paid_amount: psi.paid_amount,
          remaining_amount: 0, // Caller must compute remaining from NET - paid
          payment_status: "UNPAID", // Caller must recompute with NET context
          paid_source: psi.paid_source,
          dual_paid_warning: psi.dual_paid_warning,
        });
      }

      return result;
    },
    enabled: settlementIds.length > 0,
  });
}

/**
 * Fetch computed payment stats for a single service settlement.
 *
 * PHASE A FIX: Now queries BOTH cash_outs AND cashflow_entries,
 * applies computePaidSourceInfo for dual-write detection.
 * Previously only queried cash_outs and missed payments via cashflow.
 */
export function useServiceSettlementPaymentStats(settlementId: string | null) {
  return useQuery({
    queryKey: ["service-settlement-payment-stats", settlementId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<SettlementPaymentStats | null> => {
      if (!settlementId) return null;

      // 1. Get settlement NET amount
      const { data: settlement, error: settError } = await supabase
        .from("service_settlements")
        .select("net_amount")
        .eq("id", settlementId)
        .single();

      if (settError) throw settError;
      if (!settlement) return null;

      const netAmount = Number(settlement.net_amount) || 0;

      // 2. Get total paid from BOTH cash_outs AND cashflow_entries
      const [cashOutsRes, cashflowRes] = await Promise.all([
        supabase
          .from("cash_outs")
          .select("amount")
          .eq("settlement_type", SERVICE_CASHOUT_SETTLEMENT_TYPE)
          .eq("settlement_id", settlementId),
        supabase
          .from("cashflow_entries")
          .select("amount")
          .in("source_type", [...SERVICE_SETTLEMENT_SOURCE_TYPES])
          .eq("direction", "OUT")
          .eq("source_id", settlementId),
      ]);

      if (cashOutsRes.error) throw cashOutsRes.error;
      if (cashflowRes.error) throw cashflowRes.error;

      const coPaid = cashOutsRes.data?.reduce((sum, co) => sum + Number(co.amount || 0), 0) || 0;
      const cfPaid = cashflowRes.data?.reduce((sum, cf) => sum + Number(cf.amount || 0), 0) || 0;
      const psi = computePaidSourceInfo(coPaid, cfPaid);

      const absNet = Math.abs(netAmount);
      const remaining = Math.max(0, absNet - psi.paid_amount);
      const paymentStatus = computePaymentStatus(psi.paid_amount, netAmount);

      return {
        settlement_id: settlementId,
        paid_amount: psi.paid_amount,
        remaining_amount: remaining,
        payment_status: paymentStatus,
        paid_source: psi.paid_source,
        dual_paid_warning: psi.dual_paid_warning,
      };
    },
    enabled: !!settlementId,
  });
}
