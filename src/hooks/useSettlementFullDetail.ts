import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveHostSettlementNet } from "@/lib/settlementNetHelper";

export interface SettlementFullBooking {
  unified_booking_id: string;
  guest_name: string | null;
  host_property_name: string | null;
  host_room_type: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  actual_check_out_at: string | null;
  total_amount_net: number | null;
  payment_type: string | null;
  host_cost: number | null;
  ota_booking_code: string | null;
  source: string | null;
  stay_status: string | null;
}

export interface SettlementFullSegment {
  id: string;
  unified_booking_id: string;
  room_code: string | null;
  host_room_type: string | null;
  host_property_name: string | null;
  date_from: string;
  date_to: string;
  nights: number;
  nightly_rate: number;
  total_amount: number;
  room_line_index: number | null;
}

export interface SettlementFullPayment {
  id: string;
  unified_booking_id: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  bank_name: string | null;
  transfer_reference: string | null;
  note: string | null;
}

export interface SettlementFullDepositPrepaid {
  id: string;
  request_code: string;
  unified_booking_id: string;
  proposed_amount: number;
  status: string;
  requested_at: string;
  approved_at: string | null;
  note: string | null;
  total_paid: number;
  type: "DEPOSIT" | "PREPAID";
}

export interface SettlementFullCollection {
  id: string;
  unified_booking_id: string;
  amount_collected: number;
  payment_method: string;
  payee_type: string;
  payer_type: string;
  collected_at: string | null;
  status: string | null;
  note: string | null;
  collection_type: string;
}

export interface SettlementFullSurcharge {
  id: string;
  unified_booking_id: string;
  surcharge_type: string;
  amount: number;
  description: string | null;
  status: string;
  collector_type: string;
}

export interface SettlementFullExtraCharge {
  id: string;
  unified_booking_id: string;
  charge_type: string;
  amount: number;
  note: string | null;
}

export interface HostSettlementFullDetail {
  settlement: {
    id: string;
    settlement_code: string;
    partner_id: string;
    partner_name: string;
    period_from: string;
    period_to: string;
    status: string;
    total_booking_revenue: number;
    total_payable_amount: number;
    total_host_collected: number;
    total_deposits_applied: number;
    total_prepaids_applied: number;
    total_paid_amount: number;
    remaining_amount: number;
    note: string | null;
    finalized_at: string | null;
    finalized_by: string | null;
    created_at: string;
  };
  bookings: SettlementFullBooking[];
  segments: SettlementFullSegment[];
  payments: SettlementFullPayment[];
  depositsAndPrepaids: SettlementFullDepositPrepaid[];
  collections: SettlementFullCollection[];
  surcharges: SettlementFullSurcharge[];
  extraCharges: SettlementFullExtraCharge[];
  cashflowPayments: {
    id: string;
    amount: number;
    cash_date: string;
    direction: string;
    note: string | null;
  }[];
  computedStats: {
    paid_amount: number;
    remaining_amount: number;
    payment_status: "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";
    net_amount: number;
    net_direction: "PAY" | "RECEIVE";
    snapshot_mismatch: boolean;
    snapshot_delta: number;
  };
}

export interface ServiceSettlementFullDetail {
  settlement: {
    id: string;
    settlement_code: string;
    partner_id: string;
    partner_name: string;
    period_from: string;
    period_to: string;
    total_sale_price: number;
    total_cost_price: number;
    partner_collected_amount: number;
    roomrise_collected_amount: number;
    net_amount: number;
    net_direction: string;
    payment_status: string;
    note: string | null;
    finalized_at: string | null;
    finalized_by: string | null;
    created_at: string;
    total_paid: number | null;
  };
  serviceOrders: {
    id: string;
    order_code: string;
    service_type: string;
    sale_price: number;
    cost_price: number;
    customer_name: string | null;
    service_date: string | null;
    status: string;
    note: string | null;
  }[];
  cashflowPayments: {
    id: string;
    amount: number;
    cash_date: string;
    direction: string;
    note: string | null;
  }[];
  computedStats: {
    paid_amount: number;
    remaining_amount: number;
    payment_status: "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";
    net_direction: "PAY" | "RECEIVE";
  };
}

function computePaymentStatus(paidAmount: number, netAmount: number): "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID" {
  const absNet = Math.abs(netAmount);
  if (absNet === 0) return "PAID";
  if (paidAmount <= 0) return "UNPAID";
  if (paidAmount >= absNet) return paidAmount > absNet ? "OVERPAID" : "PAID";
  return "PARTIAL";
}

/**
 * Fetch FULL detail of a Host Settlement including all related data
 */
export function useHostSettlementFullDetail(settlementId: string | null) {
  return useQuery({
    queryKey: ["host-settlement-full-detail", settlementId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<HostSettlementFullDetail | null> => {
      if (!settlementId) return null;

      // 1. Fetch settlement with partner info
      const { data: settlement, error: settlementError } = await supabase
        .from("host_settlements")
        .select(`
          *,
          partners:partner_id (partner_name)
        `)
        .eq("id", settlementId)
        .maybeSingle();

      if (settlementError) throw settlementError;
      if (!settlement) return null;

      const partnerId = settlement.partner_id;
      const partnerName = (settlement.partners as any)?.partner_name || "Unknown";

      // 2. Fetch segments linked to this settlement
      const { data: segments, error: segmentsError } = await supabase
        .from("host_supply_segments")
        .select("*")
        .eq("settlement_id", settlementId);

      if (segmentsError) throw segmentsError;

      // Also fetch surcharges/extras locked by this settlement to get their booking IDs
      // (post-settlement phụ phí may have no corresponding segments in THIS settlement)
      const [surchargeBookingRes, extraBookingRes] = await Promise.all([
        supabase
          .from("host_surcharges")
          .select("unified_booking_id")
          .eq("settlement_id", settlementId),
        supabase
          .from("host_extra_charges")
          .select("unified_booking_id")
          .eq("settlement_id", settlementId),
      ]);

      const bookingIds = [...new Set([
        ...(segments || []).map(s => s.unified_booking_id),
        ...(surchargeBookingRes.data || []).map(s => s.unified_booking_id),
        ...(extraBookingRes.data || []).map(e => e.unified_booking_id),
      ])];

      // 3. Fetch bookings data
      let bookings: SettlementFullBooking[] = [];
      if (bookingIds.length > 0) {
        const { data: bookingsData } = await supabase
          .from("unified_bookings")
          .select("*")
          .in("unified_booking_id", bookingIds);

        const { data: staysData } = await supabase
          .from("stays")
          .select("*")
          .in("unified_booking_id", bookingIds);

        const staysMap = new Map<string, any>();
        staysData?.forEach(s => staysMap.set(s.unified_booking_id, s));

        // Calculate host_cost per booking from segments
        const segmentCostMap = new Map<string, number>();
        (segments || []).forEach(seg => {
          const current = segmentCostMap.get(seg.unified_booking_id) || 0;
          segmentCostMap.set(seg.unified_booking_id, current + Number(seg.total_amount || 0));
        });

        bookings = (bookingsData || []).map(b => {
          const stay = staysMap.get(b.unified_booking_id);
          return {
            unified_booking_id: b.unified_booking_id || "",
            guest_name: b.guest_name,
            host_property_name: stay?.host_property_name || b.host_property_name,
            host_room_type: stay?.host_room_type || b.host_room_type,
            check_in_date: b.check_in_date,
            check_out_date: b.check_out_date,
            actual_check_out_at: stay?.actual_check_out_at || null,
            total_amount_net: b.total_amount_net,
            payment_type: b.payment_type,
            host_cost: segmentCostMap.get(b.unified_booking_id) || 0,
            ota_booking_code: b.ota_booking_code ?? null,
            source: b.source ?? null,
            stay_status: stay?.stay_status || null,
          };
        });
      }

      // 4. Fetch surcharges locked by this settlement
      const { data: surchargesData } = await supabase
        .from("host_surcharges")
        .select("*")
        .eq("settlement_id", settlementId);

      const surcharges: SettlementFullSurcharge[] = (surchargesData || []).map(s => ({
        id: s.id,
        unified_booking_id: s.unified_booking_id,
        surcharge_type: s.surcharge_type,
        amount: Number(s.amount),
        description: s.description,
        status: s.status,
        collector_type: s.collector_type,
      }));

      // 5. Fetch extra charges locked by this settlement
      const { data: extraData } = await supabase
        .from("host_extra_charges")
        .select("*")
        .eq("settlement_id", settlementId);

      const extraCharges: SettlementFullExtraCharge[] = (extraData || []).map(e => ({
        id: e.id,
        unified_booking_id: e.unified_booking_id,
        charge_type: e.charge_type,
        amount: Number(e.amount),
        note: e.note,
      }));

      // 6. Fetch host_payments linked to this settlement's bookings
      let payments: SettlementFullPayment[] = [];
      if (bookingIds.length > 0) {
        const { data: paymentsData } = await supabase
          .from("host_payments")
          .select("*")
          .eq("partner_id", partnerId)
          .in("unified_booking_id", bookingIds);

        payments = (paymentsData || []).map(p => ({
          id: p.id,
          unified_booking_id: p.unified_booking_id,
          amount: Number(p.amount),
          payment_method: p.payment_method,
          paid_at: p.paid_at,
          bank_name: p.bank_name,
          transfer_reference: p.transfer_reference,
          note: p.note,
        }));
      }

      // 7. Fetch deposit/prepaid requests linked to this settlement
      const { data: depositRequests } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("settlement_id", settlementId);

      // Also fetch cash_outs for these requests
      const requestIds = (depositRequests || []).map(d => d.id);
      let cashOutsByRequest = new Map<string, number>();
      if (requestIds.length > 0) {
        const { data: cashOuts } = await supabase
          .from("cash_outs")
          .select("payment_request_id, amount")
          .in("payment_request_id", requestIds);

        cashOuts?.forEach(co => {
          const current = cashOutsByRequest.get(co.payment_request_id) || 0;
          cashOutsByRequest.set(co.payment_request_id, current + Number(co.amount || 0));
        });
      }

      const depositsAndPrepaids: SettlementFullDepositPrepaid[] = (depositRequests || []).map(d => ({
        id: d.id,
        request_code: d.request_code,
        unified_booking_id: d.unified_booking_id || "",
        proposed_amount: Number(d.proposed_amount) || 0,
        status: d.status,
        requested_at: d.requested_at,
        approved_at: d.approved_at,
        note: d.note,
        total_paid: cashOutsByRequest.get(d.id) || 0,
        type: d.payment_type === "HOST_DEPOSIT" ? "DEPOSIT" : "PREPAID",
      }));

      // 8. Fetch collections for these bookings
      let collections: SettlementFullCollection[] = [];
      if (bookingIds.length > 0) {
        const { data: collectionsData } = await supabase
          .from("hotel_collects")
          .select("*")
          .in("unified_booking_id", bookingIds);

        collections = (collectionsData || []).map(c => ({
          id: c.id,
          unified_booking_id: c.unified_booking_id,
          amount_collected: Number(c.amount_collected),
          payment_method: c.payment_method,
          payee_type: c.payee_type,
          payer_type: c.payer_type,
          collected_at: c.collected_at,
          status: c.status,
          note: c.note,
          collection_type: c.collection_type,
        }));
      }

      // Resolve NET via Snapshot Authority helper
      const { netAmount, netDirection, snapshotMismatch, snapshotDelta } = resolveHostSettlementNet(settlement);
      const expectedDirection = netDirection === "RECEIVE" ? "IN" : "OUT";

      const [cashflowRes, applyRes] = await Promise.all([
        supabase
          .from("cashflow_entries")
          .select("*")
          .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
          .eq("source_id", settlementId)
          .eq("direction", expectedDirection)
          .order("cash_date", { ascending: false }),
        supabase
          .from("host_settlement_apply_events")
          .select("amount")
          .eq("settlement_id", settlementId),
      ]);

      const cashflowPayments = cashflowRes.data;
      const applyTotal = (applyRes.data || []).reduce((sum, ae) => sum + Number(ae.amount || 0), 0);
      const effectiveNet = netAmount - applyTotal;

      const paidAmount = (cashflowPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const remainingComputed = Math.max(0, Math.abs(effectiveNet) - paidAmount);
      const paymentStatus = computePaymentStatus(paidAmount, effectiveNet);

      return {
        settlement: {
          id: settlement.id,
          settlement_code: settlement.settlement_code,
          partner_id: settlement.partner_id,
          partner_name: partnerName,
          period_from: settlement.period_from,
          period_to: settlement.period_to,
          status: settlement.status,
          total_booking_revenue: Number(settlement.total_booking_revenue) || 0,
          total_payable_amount: Number(settlement.total_payable_amount) || 0,
          total_host_collected: Number(settlement.total_host_collected) || 0,
          total_deposits_applied: Number(settlement.total_deposits_applied) || 0,
          total_prepaids_applied: Number(settlement.total_prepaids_applied) || 0,
          total_paid_amount: Number(settlement.total_paid_amount) || 0,
          remaining_amount: Number(settlement.remaining_amount) || 0,
          note: settlement.note,
          finalized_at: settlement.finalized_at,
          finalized_by: settlement.finalized_by,
          created_at: settlement.created_at,
        },
        bookings,
        segments: (segments || []).map(s => ({
          id: s.id,
          unified_booking_id: s.unified_booking_id,
          room_code: s.room_code,
          host_room_type: s.host_room_type,
          host_property_name: s.host_property_name,
          date_from: s.date_from,
          date_to: s.date_to,
          nights: Number(s.nights) || 0,
          nightly_rate: Number(s.nightly_rate) || 0,
          total_amount: Number(s.total_amount) || 0,
          room_line_index: s.room_line_index,
        })),
        payments,
        depositsAndPrepaids,
        collections,
        surcharges,
        extraCharges,
        cashflowPayments: (cashflowPayments || []).map(p => ({
          id: p.id,
          amount: Number(p.amount),
          cash_date: p.cash_date,
          direction: p.direction,
          note: p.note,
        })),
        computedStats: {
          paid_amount: paidAmount,
          remaining_amount: remainingComputed,
          payment_status: paymentStatus,
          net_amount: effectiveNet,
          net_direction: effectiveNet >= 0 ? "PAY" as const : "RECEIVE" as const,
          snapshot_mismatch: snapshotMismatch,
          snapshot_delta: snapshotDelta,
        },
      };
    },
    enabled: !!settlementId,
  });
}

/**
 * Fetch FULL detail of a Service Settlement
 */
export function useServiceSettlementFullDetail(settlementId: string | null) {
  return useQuery({
    queryKey: ["service-settlement-full-detail", settlementId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ServiceSettlementFullDetail | null> => {
      if (!settlementId) return null;

      // 1. Fetch settlement with partner info
      const { data: settlement, error: settlementError } = await supabase
        .from("service_settlements")
        .select(`
          *,
          partners:partner_id (partner_name)
        `)
        .eq("id", settlementId)
        .maybeSingle();

      if (settlementError) throw settlementError;
      if (!settlement) return null;

      const partnerName = (settlement.partners as any)?.partner_name || "Unknown";

      // 2. Fetch service orders linked to this settlement
      const { data: serviceOrders } = await supabase
        .from("service_orders")
        .select(`
          id,
          unified_booking_id,
          service_id,
          partner_id,
          service_date_time,
          pax,
          sale_price,
          cost_price,
          status,
          note,
          collector_type,
          service_provider_type,
          services:service_id (service_name, service_type)
        `)
        .eq("partner_id", settlement.partner_id)
        .gte("service_date_time", settlement.period_from)
        .lte("service_date_time", settlement.period_to + "T23:59:59");

      // 3. Fetch cashflow entries for this settlement
      const netAmount = Number(settlement.net_amount) || 0;
      const netDirection: "PAY" | "RECEIVE" = netAmount >= 0 ? "PAY" : "RECEIVE";
      const expectedDirection = netDirection === "RECEIVE" ? "IN" : "OUT";

      const { data: cashflowPayments } = await supabase
        .from("cashflow_entries")
        .select("*")
        .eq("source_type", "SERVICE_SETTLEMENT_PAYMENT")
        .eq("source_id", settlementId)
        .eq("direction", expectedDirection)
        .order("cash_date", { ascending: false });

      const paidAmount = (cashflowPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const remainingComputed = Math.max(0, Math.abs(netAmount) - paidAmount);
      const paymentStatus = computePaymentStatus(paidAmount, netAmount);

      return {
        settlement: {
          id: settlement.id,
          settlement_code: settlement.settlement_code,
          partner_id: settlement.partner_id,
          partner_name: partnerName,
          period_from: settlement.period_from,
          period_to: settlement.period_to,
          total_sale_price: Number(settlement.total_sale_price) || 0,
          total_cost_price: Number(settlement.total_cost_price) || 0,
          partner_collected_amount: Number(settlement.partner_collected_amount) || 0,
          roomrise_collected_amount: Number(settlement.roomrise_collected_amount) || 0,
          net_amount: netAmount,
          net_direction: settlement.net_direction,
          payment_status: settlement.payment_status,
          note: settlement.note,
          finalized_at: settlement.finalized_at,
          finalized_by: settlement.finalized_by,
          created_at: settlement.created_at,
          total_paid: Number(settlement.total_paid) || 0,
        },
        serviceOrders: (serviceOrders || []).map((o: any) => ({
          id: o.id,
          order_code: o.id?.substring(0, 8)?.toUpperCase() || "",
          service_type: o.services?.service_type || o.service_provider_type || "OTHER",
          sale_price: Number(o.sale_price) || 0,
          cost_price: Number(o.cost_price) || 0,
          customer_name: null,
          service_date: o.service_date_time,
          status: o.status,
          note: o.note,
        })),
        cashflowPayments: (cashflowPayments || []).map(p => ({
          id: p.id,
          amount: Number(p.amount),
          cash_date: p.cash_date,
          direction: p.direction,
          note: p.note,
        })),
        computedStats: {
          paid_amount: paidAmount,
          remaining_amount: remainingComputed,
          payment_status: paymentStatus,
          net_direction: netDirection,
        },
      };
    },
    enabled: !!settlementId,
  });
}
