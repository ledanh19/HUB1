import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computePaymentStatus, type PaymentStatusComputed } from "./useSettlementPaymentStats";
import { resolveHostSettlementNet } from "@/lib/settlementNetHelper";
import {
  HOST_SETTLEMENT_SOURCE_TYPES,
  SERVICE_SETTLEMENT_SOURCE_TYPES,
  HOST_CASHOUT_SETTLEMENT_TYPE,
  SERVICE_CASHOUT_SETTLEMENT_TYPE,
} from "@/constants/settlementPaymentSourceTypes";
import { computePaidSourceInfo, type PaidSource } from "@/lib/settlementPaidSource";

export type SettlementType = "HOST" | "SERVICE";
export type { PaymentStatusComputed };

export interface SettlementWithComputed {
  id: string;
  settlement_code: string;
  settlement_type: SettlementType;
  settlement_status: string;
  entity_id: string;
  entity_name: string;
  period_from: string;
  period_to: string;
  net_amount: number; // snapshot at closure
  net_direction: "PAY" | "RECEIVE"; // Roomrise pays or receives
  finalized_at: string | null;
  finalized_by: string | null;
  finalized_by_name?: string;
  note: string | null;
  // Void metadata
  voided_at?: string | null;
  void_reason?: string | null;
  // Computed from payments - NOT stored in DB
  paid_amount: number;
  remaining_amount: number;
  payment_status: PaymentStatusComputed;
  // Defense-in-depth: dual-write detection
  paid_source: PaidSource;
  dual_paid_warning: boolean;
}

interface SettlementFilters {
  settlementType?: SettlementType;
  entityId?: string;
  periodFrom?: string;
  periodTo?: string;
  paymentStatus?: PaymentStatusComputed;
  search?: string;
}

/**
 * Fetch settlement history with COMPUTED payment stats
 * paid_amount, remaining_amount, payment_status are calculated from cashflow_entries
 * NOT stored in settlement table - this follows single source of truth principle
 */
export function useSettlementHistory(filters?: SettlementFilters) {
  return useQuery({
    queryKey: ["settlement-history", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const settlementsWithComputed: SettlementWithComputed[] = [];

      // ========== HOST SETTLEMENTS ==========
      if (!filters?.settlementType || filters.settlementType === "HOST") {
        const { data: hostSettlements, error: hostError } = await supabase
          .from("host_settlements")
          .select(`
            id,
            settlement_code,
            partner_id,
            period_from,
            period_to,
            total_payable_amount,
            total_booking_revenue,
            total_host_collected,
            total_deposits_applied,
            total_prepaids_applied,
            finalized_at,
            finalized_by,
            note,
            status,
            partners:partner_id (partner_name)
          `)
          .in("status", ["CLOSED", "FINALIZED", "SETTLED", "PARTIALLY_PAID", "VOID"])
          .order("finalized_at", { ascending: false });

        if (hostError) throw hostError;

        const hostSettlementIds = (hostSettlements || []).map(s => s.id);

        // Fetch paid amounts from BOTH sources (cash_outs + cashflow_entries) to handle legacy
        const hostPaidBySettlement = new Map<string, number>();
        const hostApplyBySettlement = new Map<string, number>();

        if (hostSettlementIds.length > 0) {
          const [cashOutsRes, cashflowRes, applyRes] = await Promise.all([
            supabase
              .from("cash_outs")
              .select("settlement_id, amount")
              .eq("settlement_type", HOST_CASHOUT_SETTLEMENT_TYPE)
              .in("settlement_id", hostSettlementIds),
            supabase
              .from("cashflow_entries")
              .select("source_id, amount")
              .in("source_type", [...HOST_SETTLEMENT_SOURCE_TYPES])
              .eq("direction", "OUT")
              .in("source_id", hostSettlementIds),
            supabase
              .from("host_settlement_apply_events")
              .select("settlement_id, amount")
              .in("settlement_id", hostSettlementIds),
          ]);

          // Sum cash_outs by settlement
          const coPaid = new Map<string, number>();
          if (!cashOutsRes.error && cashOutsRes.data) {
            cashOutsRes.data.forEach((co) => {
              const sid = co.settlement_id || "";
              coPaid.set(sid, (coPaid.get(sid) || 0) + Number(co.amount || 0));
            });
          }

          // Sum cashflow_entries by settlement
          const cfPaid = new Map<string, number>();
          if (!cashflowRes.error && cashflowRes.data) {
            cashflowRes.data.forEach((cf) => {
              const sid = cf.source_id || "";
              cfPaid.set(sid, (cfPaid.get(sid) || 0) + Number(cf.amount || 0));
            });
          }

          // Take MAX of both sources per settlement (canonical: covers both paths)
          // Also track per-source totals for dual-write detection
          const allIds = new Set([...coPaid.keys(), ...cfPaid.keys()]);
          allIds.forEach((sid) => {
            hostPaidBySettlement.set(sid, Math.max(coPaid.get(sid) || 0, cfPaid.get(sid) || 0));
          });

          // Store per-source maps for later PaidSourceInfo computation
          (hostPaidBySettlement as any).__coPaid = coPaid;
          (hostPaidBySettlement as any).__cfPaid = cfPaid;

          if (!applyRes.error && applyRes.data) {
            applyRes.data.forEach((ae) => {
              const current = hostApplyBySettlement.get(ae.settlement_id) || 0;
              hostApplyBySettlement.set(ae.settlement_id, current + Number(ae.amount || 0));
            });
          }
        }

        // Build host settlements with computed values
        for (const hs of hostSettlements || []) {
          // Resolve NET via Snapshot Authority helper
          const { netAmount, netDirection } = resolveHostSettlementNet(hs as any);
          // Subtract apply events (manual netting) from net
          const applyTotal = hostApplyBySettlement.get(hs.id) || 0;
          const effectiveNet = netAmount - applyTotal;
          const coPaidMap = (hostPaidBySettlement as any).__coPaid as Map<string, number> | undefined;
          const cfPaidMap = (hostPaidBySettlement as any).__cfPaid as Map<string, number> | undefined;
          const psi = computePaidSourceInfo(
            coPaidMap?.get(hs.id) || 0,
            cfPaidMap?.get(hs.id) || 0,
          );
          const paidAmount = psi.paid_amount;
          const absNet = Math.abs(effectiveNet);
          const remaining = Math.max(0, absNet - paidAmount);
          const paymentStatus = computePaymentStatus(paidAmount, effectiveNet);

          const partnerData = hs.partners as { partner_name: string } | null;

          settlementsWithComputed.push({
            id: hs.id,
            settlement_code: hs.settlement_code,
            settlement_type: "HOST",
            settlement_status: (hs as any).status || "SETTLED",
            entity_id: hs.partner_id,
            entity_name: partnerData?.partner_name || "Unknown",
            period_from: hs.period_from,
            period_to: hs.period_to,
            net_amount: effectiveNet,
            net_direction: effectiveNet >= 0 ? "PAY" : "RECEIVE",
            finalized_at: hs.finalized_at,
            finalized_by: hs.finalized_by,
            note: hs.note,
            voided_at: (hs as any).voided_at || null,
            void_reason: (hs as any).void_reason || null,
            paid_amount: paidAmount,
            remaining_amount: remaining,
            payment_status: paymentStatus,
            paid_source: psi.paid_source,
            dual_paid_warning: psi.dual_paid_warning,
          });
        }
      }

      // ========== SERVICE SETTLEMENTS ==========
      if (!filters?.settlementType || filters.settlementType === "SERVICE") {
        const { data: serviceSettlements, error: serviceError } = await supabase
          .from("service_settlements")
          .select(`
            id,
            settlement_code,
            partner_id,
            period_from,
            period_to,
            net_amount,
            net_direction,
            finalized_at,
            finalized_by,
            note,
            payment_status,
            partners:partner_id (partner_name)
          `)
          .not("finalized_at", "is", null)
          .order("finalized_at", { ascending: false });

        if (serviceError) throw serviceError;

        const serviceSettlementIds = (serviceSettlements || []).map(s => s.id);

        // Fetch paid from BOTH cash_outs AND cashflow_entries (handle legacy)
        const servicePaidBySettlement = new Map<string, number>();
        if (serviceSettlementIds.length > 0) {
          const [cashOutsRes, cashflowRes] = await Promise.all([
            supabase
              .from("cash_outs")
              .select("settlement_id, amount")
              .eq("settlement_type", SERVICE_CASHOUT_SETTLEMENT_TYPE)
              .in("settlement_id", serviceSettlementIds),
            supabase
              .from("cashflow_entries")
              .select("source_id, amount")
              .in("source_type", [...SERVICE_SETTLEMENT_SOURCE_TYPES])
              .eq("direction", "OUT")
              .in("source_id", serviceSettlementIds),
          ]);

          const coPaid = new Map<string, number>();
          if (!cashOutsRes.error && cashOutsRes.data) {
            cashOutsRes.data.forEach((co) => {
              const sid = co.settlement_id || "";
              coPaid.set(sid, (coPaid.get(sid) || 0) + Number(co.amount || 0));
            });
          }

          const cfPaid = new Map<string, number>();
          if (!cashflowRes.error && cashflowRes.data) {
            cashflowRes.data.forEach((cf) => {
              const sid = cf.source_id || "";
              cfPaid.set(sid, (cfPaid.get(sid) || 0) + Number(cf.amount || 0));
            });
          }

          const allIds = new Set([...coPaid.keys(), ...cfPaid.keys()]);
          allIds.forEach((sid) => {
            servicePaidBySettlement.set(sid, Math.max(coPaid.get(sid) || 0, cfPaid.get(sid) || 0));
          });

          (servicePaidBySettlement as any).__coPaid = coPaid;
          (servicePaidBySettlement as any).__cfPaid = cfPaid;
        }

        // Build service settlements with computed values
        for (const ss of serviceSettlements || []) {
          const netAmount = Number(ss.net_amount) || 0;
          // For service settlements: positive = Roomrise pays partner, negative = Partner pays Roomrise
          const netDirection: "PAY" | "RECEIVE" = netAmount >= 0 ? "PAY" : "RECEIVE";
          const sCoPaidMap = (servicePaidBySettlement as any).__coPaid as Map<string, number> | undefined;
          const sCfPaidMap = (servicePaidBySettlement as any).__cfPaid as Map<string, number> | undefined;
          const sPsi = computePaidSourceInfo(
            sCoPaidMap?.get(ss.id) || 0,
            sCfPaidMap?.get(ss.id) || 0,
          );
          const paidAmount = sPsi.paid_amount;
          const absNet = Math.abs(netAmount);
          const remaining = Math.max(0, absNet - paidAmount);
          const paymentStatus = computePaymentStatus(paidAmount, netAmount);

          const partnerData = ss.partners as { partner_name: string } | null;

          settlementsWithComputed.push({
            id: ss.id,
            settlement_code: ss.settlement_code,
            settlement_type: "SERVICE",
            settlement_status: "SETTLED",
            entity_id: ss.partner_id,
            entity_name: partnerData?.partner_name || "Unknown",
            period_from: ss.period_from,
            period_to: ss.period_to,
            net_amount: netAmount,
            net_direction: netDirection,
            finalized_at: ss.finalized_at,
            finalized_by: ss.finalized_by,
            note: ss.note,
            paid_amount: paidAmount,
            remaining_amount: remaining,
            payment_status: paymentStatus,
            paid_source: sPsi.paid_source,
            dual_paid_warning: sPsi.dual_paid_warning,
          });
        }
      }

      // Sort all settlements by finalized_at desc
      settlementsWithComputed.sort((a, b) => {
        const dateA = a.finalized_at ? new Date(a.finalized_at).getTime() : 0;
        const dateB = b.finalized_at ? new Date(b.finalized_at).getTime() : 0;
        return dateB - dateA;
      });

      // Apply filters
      let filtered = settlementsWithComputed;

      if (filters?.entityId) {
        filtered = filtered.filter(s => s.entity_id === filters.entityId);
      }

      if (filters?.paymentStatus) {
        filtered = filtered.filter(s => s.payment_status === filters.paymentStatus);
      }

      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(s =>
          s.settlement_code.toLowerCase().includes(searchLower) ||
          s.entity_name.toLowerCase().includes(searchLower) ||
          (s.note && s.note.toLowerCase().includes(searchLower))
        );
      }

      return filtered;
    },
  });
}

/**
 * Hook to get settlement detail with linked payments
 * Payment data COMPUTED from cashflow_entries
 */
export function useSettlementDetail(settlementId: string | null, settlementType: SettlementType) {
  return useQuery({
    queryKey: ["settlement-detail", settlementId, settlementType],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!settlementId) return null;

      if (settlementType === "HOST") {
        // Fetch host settlement
        const { data: settlement, error } = await supabase
          .from("host_settlements")
          .select(`
            *,
            partners:partner_id (partner_name)
          `)
          .eq("id", settlementId)
          .maybeSingle();

        if (error) throw error;
        if (!settlement) return null;

        // Resolve NET via Snapshot Authority helper
        const { netAmount, netDirection } = resolveHostSettlementNet(settlement);

        // COMPUTED: Fetch linked payments from cash_outs + cashflow_entries + apply events
        const [paymentsRes, cashflowRes, applyRes] = await Promise.all([
          supabase
            .from("cash_outs")
            .select("*")
            .eq("settlement_type", HOST_CASHOUT_SETTLEMENT_TYPE)
            .eq("settlement_id", settlementId)
            .order("paid_at", { ascending: false }),
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

        if (paymentsRes.error) throw paymentsRes.error;
        const payments = paymentsRes.data;

        const applyTotal = (applyRes.data || []).reduce((sum, ae) => sum + Number(ae.amount || 0), 0);
        const effectiveNet = netAmount - applyTotal;

        const coPaid = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
        const cfPaid = (cashflowRes.data || []).reduce((sum, cf) => sum + Number(cf.amount || 0), 0);
        const psi = computePaidSourceInfo(coPaid, cfPaid);
        const remaining = Math.max(0, Math.abs(effectiveNet) - psi.paid_amount);
        const paymentStatus = computePaymentStatus(psi.paid_amount, effectiveNet);

        return {
          settlement: {
            ...settlement,
            net_amount: effectiveNet,
            net_direction: effectiveNet >= 0 ? "PAY" : "RECEIVE",
          },
          payments: payments || [],
          computed: {
            paid_amount: psi.paid_amount,
            remaining_amount: remaining,
            payment_status: paymentStatus,
            paid_source: psi.paid_source,
            dual_paid_warning: psi.dual_paid_warning,
          },
        };
      }

      if (settlementType === "SERVICE") {
        // Fetch service settlement
        const { data: settlement, error } = await supabase
          .from("service_settlements")
          .select(`
            *,
            partners:partner_id (partner_name)
          `)
          .eq("id", settlementId)
          .maybeSingle();

        if (error) throw error;
        if (!settlement) return null;

        const netAmount = Number(settlement.net_amount) || 0;
        const netDirection: "PAY" | "RECEIVE" = netAmount >= 0 ? "PAY" : "RECEIVE";
        

        // COMPUTED: Fetch linked payments from cash_outs + cashflow_entries
        const [paymentsRes2, cashflowRes2] = await Promise.all([
          supabase
            .from("cash_outs")
            .select("*")
            .eq("settlement_type", SERVICE_CASHOUT_SETTLEMENT_TYPE)
            .eq("settlement_id", settlementId)
            .order("paid_at", { ascending: false }),
          supabase
            .from("cashflow_entries")
            .select("amount")
            .in("source_type", [...SERVICE_SETTLEMENT_SOURCE_TYPES])
            .eq("direction", "OUT")
            .eq("source_id", settlementId),
        ]);

        if (paymentsRes2.error) throw paymentsRes2.error;
        const payments = paymentsRes2.data;

        const coPaid2 = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
        const cfPaid2 = (cashflowRes2.data || []).reduce((sum, cf) => sum + Number(cf.amount || 0), 0);
        const sPsi = computePaidSourceInfo(coPaid2, cfPaid2);
        const remaining = Math.max(0, Math.abs(netAmount) - sPsi.paid_amount);
        const paymentStatus = computePaymentStatus(sPsi.paid_amount, netAmount);

        return {
          settlement: {
            ...settlement,
            net_amount: netAmount,
            net_direction: netDirection,
          },
          payments: payments || [],
          computed: {
            paid_amount: sPsi.paid_amount,
            remaining_amount: remaining,
            payment_status: paymentStatus,
            paid_source: sPsi.paid_source,
            dual_paid_warning: sPsi.dual_paid_warning,
          },
        };
      }

      return null;
    },
    enabled: !!settlementId,
  });
}

// Fetch hosts for filter dropdown
export function useHostsForFilter() {
  return useQuery({
    queryKey: ["hosts-for-settlement-filter"],
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
      return data || [];
    },
  });
}

// Fetch service partners for filter dropdown
export function useServicePartnersForFilter() {
  return useQuery({
    queryKey: ["service-partners-for-settlement-filter"],
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
      return data || [];
    },
  });
}
