import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { keepPrevious } from "@/lib/query-helpers";
import { resolveHostSettlementNet } from "@/lib/settlementNetHelper";

export interface SettlementFilters {
  partnerId: string;
  bookingIds: string[]; // Specific booking IDs selected by user (required, segments are SOT)
}

export interface SettlementBooking {
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
  // For display code formatting
  ota_booking_code: string | null;
  source: string | null;
}

export interface SettlementSegment {
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

export interface SettlementPayable {
  id: string;
  unified_booking_id: string;
  amount: number;
  status: string;
  paid_amount: number | null;
  applied_deposit_amount: number | null;
  applied_prepaid_amount: number | null;
  due_date: string | null;
  created_at: string;
}

export interface SettlementPayment {
  id: string;
  unified_booking_id: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  bank_name: string | null;
  bank_account_number: string | null;
  transfer_reference: string | null;
  note: string | null;
}

export interface SettlementDeposit {
  id: string;
  request_code: string;
  unified_booking_id: string;
  proposed_amount: number;
  status: string; // PENDING | APPROVED | PAID | REJECTED
  requested_at: string;
  approved_at: string | null;
  note: string | null;
  total_paid: number;
}

export interface SettlementPrepaid {
  id: string;
  request_code: string;
  unified_booking_id: string;
  proposed_amount: number;
  status: string; // PENDING | APPROVED | PAID | REJECTED
  requested_at: string;
  approved_at: string | null;
  note: string | null;
  total_paid: number;
}

export interface SettlementCollection {
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

export interface SettlementSurcharge {
  id: string;
  unified_booking_id: string;
  surcharge_type: string;
  amount: number;
  description: string | null;
  status: string;
  collector_type: string;
}

export interface SettlementExtraCharge {
  id: string;
  unified_booking_id: string;
  charge_type: string;
  amount: number;
  note: string | null;
}

export interface HostSettlementData {
  partner: {
    id: string;
    partner_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  bookings: SettlementBooking[];
  segments: SettlementSegment[];
  payables: SettlementPayable[];
  payments: SettlementPayment[];
  deposits: SettlementDeposit[];
  prepaids: SettlementPrepaid[];
  collections: SettlementCollection[];
  hostRefunds: SettlementCollection[]; // Các khoản Roomrise đã thu lại từ Host
  surcharges: SettlementSurcharge[];
  extraCharges: SettlementExtraCharge[];
  summary: {
    totalBookingRevenue: number;
    // SOURCE OF TRUTH calculations
    totalSegmentCost: number; // from host_supply_segments
    totalSurcharges: number;
    totalExtraCharges: number;
    totalPayableAmount: number; // = segments + surcharges + extras
    // Settlement amounts - from host_payments (direct payments to host)
    totalPaidAmount: number;
    // Deposit/Prepaid APPLIED = cấn trừ vào công nợ (được tính trong settlement này)
    totalAppliedDeposit: number;
    totalAppliedPrepaid: number;
    remainingPayable: number;
    // Deposit/Prepaid tracking - detailed status
    depositsPending: number; // Chờ duyệt
    depositsApproved: number; // Đã duyệt, chờ chi
    depositsPaid: number; // Đã chi tiền thực sự
    prepaidsPending: number;
    prepaidsApproved: number;
    prepaidsPaid: number;
    // Collection tracking (for reference, not affecting payables)
    totalRoomriseCollected: number;
    totalHostCollected: number;
    // Host refunds - Roomrise thu lại từ Host (giảm NET POSITION)
    totalCollectedFromHost: number;
    // NET POSITION: positive = Roomrise owes Host, negative = Host owes Roomrise
    netPosition: number;
  };
}

export function useHostSettlement(filters: SettlementFilters | null) {
  return useQuery({
    queryKey: ["host-settlement", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: async (): Promise<HostSettlementData> => {
      if (!filters?.partnerId) {
        throw new Error("Missing required filters");
      }
      if (!filters.bookingIds || filters.bookingIds.length === 0) {
        throw new Error("Missing required bookingIds");
      }

      // Fetch partner info
      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id, partner_name, email, phone")
        .eq("id", filters.partnerId)
        .single();

      if (partnerError) throw partnerError;

      // =============================================
      // DETERMINE BASE BOOKING IDS (segments are SOT)
      // =============================================

      // Fetch host_payables for this partner (supplementary data, not gating)
      const { data: payables, error: payablesError } = await supabase
        .from("host_payables")
        .select("*")
        .eq("partner_id", filters.partnerId);

      if (payablesError) throw payablesError;

      // Scope is always the explicitly selected booking IDs
      const scopeBookingIds = filters.bookingIds;

      // Fetch stays for these bookings
      const { data: stays, error: staysError } = await supabase
        .from("stays")
        .select(`
          unified_booking_id,
          host_property_name,
          host_room_type,
          host_cost,
          actual_check_out_at,
          stay_status
        `)
        .in("unified_booking_id", scopeBookingIds.length > 0 ? scopeBookingIds : ["__none__"]);

      if (staysError) {
        console.warn("Could not fetch stays:", staysError);
      }

      // Fetch unified_bookings for fallback check-out dates and basic info
      const { data: unifiedBookingsForDates, error: ubError } = await supabase
        .from("unified_bookings")
        .select("unified_booking_id, check_out_date, check_in_date")
        .in("unified_booking_id", scopeBookingIds.length > 0 ? scopeBookingIds : ["__none__"]);

      if (ubError) {
        console.warn("Could not fetch unified_bookings for dates:", ubError);
      }

      // Create lookup map for fallback dates
      const bookingDatesMap = new Map<string, { check_out_date: string | null; check_in_date: string | null }>();
      unifiedBookingsForDates?.forEach((b) => {
        if (b.unified_booking_id) {
          bookingDatesMap.set(b.unified_booking_id, {
            check_out_date: b.check_out_date,
            check_in_date: b.check_in_date,
          });
        }
      });

      // Fetch ALL segments for this partner to filter by segment date_to
      const { data: allPartnerSegments, error: allSegmentsError } = await supabase
        .from("host_supply_segments")
        .select("id, unified_booking_id, date_to, settlement_id")
        .eq("partner_id", filters.partnerId)
        .in("unified_booking_id", scopeBookingIds.length > 0 ? scopeBookingIds : ["__none__"]);

      if (allSegmentsError) throw allSegmentsError;

      // Filter bookingIds to only those that have segments for this partner
      const bookingIdsWithSegments = new Set(
        (allPartnerSegments || []).map(seg => seg.unified_booking_id)
      );
      const bookingIdsInRange = filters.bookingIds.filter(id => bookingIdsWithSegments.has(id));

      // Fetch host_supply_segments to get actual host_cost per booking
      // Filter out segments that already have settlement_id (already settled)
      const { data: segments, error: segmentsError } = await supabase
        .from("host_supply_segments")
        .select("id, unified_booking_id, total_amount, settlement_id, room_code, host_room_type, host_property_name, date_from, date_to, nights, nightly_rate, room_line_index")
        .eq("partner_id", filters.partnerId)
        .in("unified_booking_id", bookingIdsInRange.length > 0 ? bookingIdsInRange : ["__none__"]);

      if (segmentsError) throw segmentsError;

      // Group segments by booking to determine if ALL segments are settled
      const segmentsByBooking = new Map<string, { total: number; settled: number }>();
      (segments || []).forEach(seg => {
        const current = segmentsByBooking.get(seg.unified_booking_id) || { total: 0, settled: 0 };
        current.total += 1;
        if (seg.settlement_id !== null) current.settled += 1;
        segmentsByBooking.set(seg.unified_booking_id, current);
      });

      // Only consider booking as fully settled if ALL segments have settlement_id
      const fullySettledBookingIds = new Set<string>();
      segmentsByBooking.forEach((counts, bookingId) => {
        if (counts.total > 0 && counts.total === counts.settled) {
          fullySettledBookingIds.add(bookingId);
        }
      });

      // bookingIds are always explicitly selected — include all (even if some segments are settled,
      // e.g. when viewing an existing settlement)
      const unsettledBookingIds = bookingIdsInRange;

      // Fetch host_surcharges to include in host_cost
      // IMPORTANT: Only fetch unsettled surcharges (settlement_id IS NULL)
      // to prevent double-counting across settlements
      const { data: surcharges, error: surchargesError } = await supabase
        .from("host_surcharges")
        .select("id, unified_booking_id, surcharge_type, amount, description, status, collector_type, settlement_id")
        .eq("host_partner_id", filters.partnerId)
        .is("settlement_id", null)
        .in("unified_booking_id", unsettledBookingIds.length > 0 ? unsettledBookingIds : ["__none__"]);

      if (surchargesError) throw surchargesError;

      // Fetch host_extra_charges
      // IMPORTANT: Only fetch unsettled extra charges (settlement_id IS NULL)
      const { data: extraCharges, error: extraChargesError } = await supabase
        .from("host_extra_charges")
        .select("id, unified_booking_id, charge_type, amount, note, settlement_id")
        .eq("partner_id", filters.partnerId)
        .is("settlement_id", null)
        .in("unified_booking_id", unsettledBookingIds.length > 0 ? unsettledBookingIds : ["__none__"]);

      if (extraChargesError) throw extraChargesError;

      // Calculate host_cost per booking from UNSETTLED segments only
      // Filter segments to only include those without settlement_id
      const unsettledSegments = (segments || []).filter(seg => seg.settlement_id === null);

      const segmentCostMap = new Map<string, number>();
      unsettledSegments.forEach(seg => {
        const current = segmentCostMap.get(seg.unified_booking_id) || 0;
        segmentCostMap.set(seg.unified_booking_id, current + Number(seg.total_amount));
      });
      // Add surcharges to host cost (only for unsettled bookings)
      surcharges?.forEach(surcharge => {
        if (unsettledBookingIds.includes(surcharge.unified_booking_id)) {
          const current = segmentCostMap.get(surcharge.unified_booking_id) || 0;
          segmentCostMap.set(surcharge.unified_booking_id, current + Number(surcharge.amount));
        }
      });
      // Add extra charges to host cost (only for unsettled bookings)
      extraCharges?.forEach(extra => {
        if (unsettledBookingIds.includes(extra.unified_booking_id)) {
          const current = segmentCostMap.get(extra.unified_booking_id) || 0;
          segmentCostMap.set(extra.unified_booking_id, current + Number(extra.amount));
        }
      });

      // Fetch unified bookings data
      const { data: bookingsData, error: bookingsError } = await supabase
        .from("unified_bookings")
        .select("*")
        .in("unified_booking_id", unsettledBookingIds.length > 0 ? unsettledBookingIds : ["__none__"]);

      if (bookingsError) throw bookingsError;

      // Map stays data to bookings with correct host_cost from segments
      const staysMap = new Map<string, {
        unified_booking_id: string;
        host_property_name: string | null;
        host_room_type: string | null;
        host_cost: number | null;
        actual_check_out_at: string | null;
        stay_status: string | null;
      }>();
      stays?.forEach((s) => {
        staysMap.set(s.unified_booking_id, s);
      });

      const bookings: SettlementBooking[] = (bookingsData || []).map(b => {
        const stay = staysMap.get(b.unified_booking_id);
        const hostCostFromSegments = segmentCostMap.get(b.unified_booking_id) || 0;
        const bookingDates = bookingDatesMap.get(b.unified_booking_id);
        return {
          unified_booking_id: b.unified_booking_id || "",
          guest_name: b.guest_name,
          host_property_name: stay?.host_property_name || b.host_property_name,
          host_room_type: stay?.host_room_type || b.host_room_type,
          check_in_date: b.check_in_date,
          check_out_date: b.check_out_date,
          actual_check_out_at: stay?.actual_check_out_at || bookingDates?.check_out_date || null,
          total_amount_net: b.total_amount_net,
          payment_type: b.payment_type,
          host_cost: hostCostFromSegments,
          ota_booking_code: b.ota_booking_code ?? null,
          source: b.source ?? null,
        };
      });

      // Filter payables to only those in unsettled bookings
      const filteredPayables = payables?.filter(p =>
        unsettledBookingIds.includes(p.unified_booking_id)
      ) || [];

      // Fetch payments for this partner
      // If date range is provided, filter by date; otherwise fetch all payments for unsettled bookings
      let paymentsQuery = supabase
        .from("host_payments")
        .select("*")
        .eq("partner_id", filters.partnerId)
        .order("paid_at", { ascending: false });

      // Fetch payments for selected bookings only
      paymentsQuery = paymentsQuery
        .in("unified_booking_id", unsettledBookingIds.length > 0 ? unsettledBookingIds : ["__none__"]);

      const { data: payments, error: paymentsError } = await paymentsQuery;

      if (paymentsError) throw paymentsError;

      // Fetch deposit/prepaid requests from payment_requests table (NEW ARCHITECTURE)
      // IMPORTANT: Include settlement_id to filter out already-consumed deposits/prepaids
      const { data: depositRequests, error: depositRequestsError } = await supabase
        .from("payment_requests")
        .select("id, request_code, unified_booking_id, proposed_amount, status, requested_at, approved_at, note, partner_id, settlement_id")
        .eq("partner_id", filters.partnerId)
        .eq("payment_type", "HOST_DEPOSIT")
        .order("requested_at", { ascending: false });

      if (depositRequestsError) throw depositRequestsError;

      const { data: prepaidRequests, error: prepaidRequestsError } = await supabase
        .from("payment_requests")
        .select("id, request_code, unified_booking_id, proposed_amount, status, requested_at, approved_at, note, partner_id, settlement_id")
        .eq("partner_id", filters.partnerId)
        .eq("payment_type", "HOST_PREPAID")
        .order("requested_at", { ascending: false });

      if (prepaidRequestsError) throw prepaidRequestsError;

      // Get cash_outs for these requests to calculate total_paid
      const depositRequestIds = (depositRequests || []).map(d => d.id);
      const prepaidRequestIds = (prepaidRequests || []).map(p => p.id);
      const allRequestIds = [...depositRequestIds, ...prepaidRequestIds];

      const cashOutsByRequest = new Map<string, number>();
      if (allRequestIds.length > 0) {
        const { data: cashOuts } = await supabase
          .from("cash_outs")
          .select("payment_request_id, amount")
          .in("payment_request_id", allRequestIds);

        cashOuts?.forEach(co => {
          const current = cashOutsByRequest.get(co.payment_request_id) || 0;
          cashOutsByRequest.set(co.payment_request_id, current + Number(co.amount || 0));
        });
      }

      // =============================================
      // BUG FIX: Filter out deposits/prepaids already consumed by SETTLED/CLOSED settlements
      // A deposit/prepaid is "consumed" when:
      //   1. It has settlement_id pointing to a settlement with status SETTLED or CLOSED
      // Deposits with settlement_id pointing to VOID/DRAFT settlements are still available
      // =============================================
      const linkedSettlementIds = new Set<string>();
      [...(depositRequests || []), ...(prepaidRequests || [])].forEach(r => {
        if (r.settlement_id) linkedSettlementIds.add(r.settlement_id);
      });

      // Check which linked settlements are actually active (SETTLED/CLOSED)
      const activeSettlementIds = new Set<string>();
      if (linkedSettlementIds.size > 0) {
        const { data: linkedSettlements } = await supabase
          .from("host_settlements")
          .select("id, status")
          .in("id", Array.from(linkedSettlementIds));

        linkedSettlements?.forEach(s => {
          if (s.status === "SETTLED" || s.status === "CLOSED") {
            activeSettlementIds.add(s.id);
          }
        });
      }

      // Helper: check if a deposit/prepaid is already consumed by an active settlement
      const isConsumedByActiveSettlement = (settlementId: string | null): boolean => {
        return !!settlementId && activeSettlementIds.has(settlementId);
      };

      // Filter deposits at PARTNER level (not booking level) to allow cross-segment offset.
      // DB query already scopes by partner_id. Exclude consumed + cancelled/rejected.
      const unsettledDeposits: SettlementDeposit[] = (depositRequests || [])
        .filter(d => !isConsumedByActiveSettlement(d.settlement_id))
        .filter(d => d.status !== "CANCELLED" && d.status !== "REJECTED")
        .map(d => ({
          id: d.id,
          request_code: d.request_code,
          unified_booking_id: d.unified_booking_id || "",
          proposed_amount: Number(d.proposed_amount) || 0,
          status: d.status,
          requested_at: d.requested_at,
          approved_at: d.approved_at,
          note: d.note,
          total_paid: cashOutsByRequest.get(d.id) || 0,
        }));

      const unsettledPrepaids: SettlementPrepaid[] = (prepaidRequests || [])
        .filter(p => !isConsumedByActiveSettlement(p.settlement_id))
        .filter(p => p.status !== "CANCELLED" && p.status !== "REJECTED")
        .map(p => ({
          id: p.id,
          request_code: p.request_code,
          unified_booking_id: p.unified_booking_id || "",
          proposed_amount: Number(p.proposed_amount) || 0,
          status: p.status,
          requested_at: p.requested_at,
          approved_at: p.approved_at,
          note: p.note,
          total_paid: cashOutsByRequest.get(p.id) || 0,
        }));

      // =====================================
      // DEPOSIT/PREPAID STATUS TRACKING
      // =====================================
      // PAID = tiền đã chi thực sự qua cash_outs → cấn trừ vào công nợ
      // APPROVED = đã duyệt, chờ chi tiền
      // PENDING = chờ duyệt

      // Status tracking for deposits - detailed breakdown
      const depositsPending = unsettledDeposits
        .filter(d => d.status === "PENDING")
        .reduce((sum, d) => sum + d.proposed_amount, 0);
      const depositsApproved = unsettledDeposits
        .filter(d => d.status === "APPROVED")
        .reduce((sum, d) => sum + d.proposed_amount, 0);
      const depositsPaid = unsettledDeposits
        .filter(d => d.status === "PAID")
        .reduce((sum, d) => sum + d.total_paid, 0);

      // Status tracking for prepaids - detailed breakdown
      const prepaidsPending = unsettledPrepaids
        .filter(p => p.status === "PENDING")
        .reduce((sum, p) => sum + p.proposed_amount, 0);
      const prepaidsApproved = unsettledPrepaids
        .filter(p => p.status === "APPROVED")
        .reduce((sum, p) => sum + p.proposed_amount, 0);
      const prepaidsPaid = unsettledPrepaids
        .filter(p => p.status === "PAID")
        .reduce((sum, p) => sum + p.total_paid, 0);

      // Applied amounts = 0 mặc định.
      // Settlement page sẽ tính toán dựa trên user chọn checkbox deposit/prepaid nào để cấn trừ.
      // Không tự động cấn trừ tất cả PAID deposits (Case 1: cọc giữ lại, không cấn trừ).
      const totalAppliedDeposit = 0;
      const totalAppliedPrepaid = 0;

      // Fetch collections for UNSETTLED bookings only
      const { data: collections, error: collectionsError } = await supabase
        .from("hotel_collects")
        .select("*")
        .in("unified_booking_id", unsettledBookingIds.length > 0 ? unsettledBookingIds : ["__none__"])
        .eq("status", "COLLECTED");

      if (collectionsError) throw collectionsError;

      // Fetch host refunds - Roomrise collected FROM Host (payer=HOST, payee=ROOMRISE)
      // This represents amounts Host has already paid back to Roomrise
      const { data: hostRefunds, error: hostRefundsError } = await supabase
        .from("hotel_collects")
        .select("*")
        .eq("payer_type", "HOST")
        .eq("payee_type", "ROOMRISE")
        .eq("status", "COLLECTED")
        .in("unified_booking_id", unsettledBookingIds.length > 0 ? unsettledBookingIds : ["__none__"]);

      if (hostRefundsError) throw hostRefundsError;

      // =====================================
      // CALCULATION LOGIC (SOURCE OF TRUTH)
      // =====================================
      const totalBookingRevenue = bookings.reduce((sum, b) => sum + (b.total_amount_net || 0), 0);
      const totalSegmentCost = unsettledSegments.reduce((sum, s) => sum + Number(s.total_amount), 0);
      const totalSurcharges = surcharges?.filter(s => unsettledBookingIds.includes(s.unified_booking_id)).reduce((sum, s) => sum + Number(s.amount), 0) || 0;
      const totalExtraCharges = extraCharges?.filter(e => unsettledBookingIds.includes(e.unified_booking_id)).reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      const totalPayableAmount = totalSegmentCost + totalSurcharges + totalExtraCharges;
      const totalPaidAmount = filteredPayables.reduce((sum, p) => sum + (Number(p.paid_amount) || 0), 0);

      // =====================================
      // COLLECTION CATEGORIZATION
      // =====================================
      // Collections are for TRACKING purposes, not for reducing payables
      // Payables are reduced via: host_payments, deposits applied, prepaids applied

      // HOST collected from guest directly (reduces net position)
      const totalHostCollected = collections
        ?.filter(c => c.payee_type === "HOST" && c.payer_type !== "HOST")
        .reduce((sum, c) => sum + c.amount_collected, 0) || 0;

      // ROOMRISE collected from guest (for tracking only)
      const totalRoomriseCollected = collections
        ?.filter(c => c.payee_type === "ROOMRISE" && c.payer_type !== "HOST")
        .reduce((sum, c) => sum + c.amount_collected, 0) || 0;

      // Host refunds - Roomrise đã thu lại từ Host (reduces NET POSITION towards 0 or negative)
      const totalCollectedFromHost = hostRefunds
        ?.reduce((sum, c) => sum + Number(c.amount_collected), 0) || 0;

      // =====================================
      // NET POSITION CALCULATION
      // =====================================
      // Positive = Roomrise owes Host, Negative = Host owes Roomrise
      // NET = Công nợ - Host thu từ khách - Đã chi - Deposit - Prepaid - Đã thu lại từ Host
      const netPosition = totalPayableAmount - totalHostCollected - totalPaidAmount - totalAppliedDeposit - totalAppliedPrepaid - totalCollectedFromHost;

      return {
        partner,
        bookings,
        segments: (unsettledSegments || []).map(seg => ({
          id: seg.id,
          unified_booking_id: seg.unified_booking_id,
          room_code: seg.room_code,
          host_room_type: seg.host_room_type,
          host_property_name: seg.host_property_name,
          date_from: seg.date_from,
          date_to: seg.date_to,
          nights: seg.nights,
          nightly_rate: Number(seg.nightly_rate),
          total_amount: Number(seg.total_amount),
          room_line_index: seg.room_line_index,
        })),
        payables: filteredPayables,
        payments: payments || [],
        deposits: unsettledDeposits,
        prepaids: unsettledPrepaids,
        collections: (collections || []).map(c => ({
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
        })),
        hostRefunds: (hostRefunds || []).map(c => ({
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
        })),
        surcharges: (surcharges || []).map(s => ({
          id: s.id,
          unified_booking_id: s.unified_booking_id,
          surcharge_type: s.surcharge_type,
          amount: Number(s.amount),
          description: s.description,
          status: s.status,
          collector_type: s.collector_type,
        })),
        extraCharges: (extraCharges || []).map(e => ({
          id: e.id,
          unified_booking_id: e.unified_booking_id,
          charge_type: e.charge_type,
          amount: Number(e.amount),
          note: e.note,
        })),
        summary: {
          totalBookingRevenue,
          totalSegmentCost,
          totalSurcharges,
          totalExtraCharges,
          totalPayableAmount,
          totalPaidAmount,
          totalAppliedDeposit,
          totalAppliedPrepaid,
          remainingPayable: totalPayableAmount - totalPaidAmount - totalAppliedDeposit - totalAppliedPrepaid - totalCollectedFromHost,
          depositsPending,
          depositsApproved,
          depositsPaid,
          prepaidsPending,
          prepaidsApproved,
          prepaidsPaid,
          totalRoomriseCollected,
          totalHostCollected,
          totalCollectedFromHost,
          netPosition,
        },
      };
    },
    enabled: !!filters?.partnerId && !!filters?.bookingIds && filters.bookingIds.length > 0,
  });
}

export function useHostPartners() {
  return useQuery({
    queryKey: ["host-partners-for-settlement"],
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

export interface ExistingSettlement {
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
  created_at: string;
  finalized_at: string | null;
}

export function useExistingSettlements(partnerId?: string) {
  return useQuery({
    queryKey: ["existing-settlements", partnerId],
    queryFn: async (): Promise<ExistingSettlement[]> => {
      let query = supabase
        .from("host_settlements")
        .select(`
          id,
          settlement_code,
          partner_id,
          partners!inner(partner_name),
          period_from,
          period_to,
          status,
          total_booking_revenue,
          total_payable_amount,
          total_host_collected,
          total_deposits_applied,
          total_prepaids_applied,
          total_paid_amount,
          remaining_amount,
          note,
          created_at,
          finalized_at
        `)
        .in("status", ["DRAFT", "CLOSED", "FINALIZED", "SETTLED", "PARTIALLY_PAID", "VOID"])
        .order("created_at", { ascending: false })
        .limit(50);

      if (partnerId) {
        query = query.eq("partner_id", partnerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const settlementIds = (data || []).map(s => s.id);

      // Compute paid_amount from cashflow_entries (single source of truth)
      const paidBySettlement = new Map<string, number>();
      if (settlementIds.length > 0) {
        const { data: cashflows, error: cfError } = await supabase
          .from("cashflow_entries")
          .select("source_id, amount")
          .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
          .eq("direction", "OUT")
          .in("source_id", settlementIds);

        if (!cfError && cashflows) {
          cashflows.forEach((cf) => {
            const current = paidBySettlement.get(cf.source_id || "") || 0;
            paidBySettlement.set(cf.source_id || "", current + Number(cf.amount || 0));
          });
        }
      }

      return (data || []).map((s: any) => {
        // Resolve NET via Snapshot Authority helper
        const { netAmount, netDirection } = resolveHostSettlementNet(s);
        const paidAmount = paidBySettlement.get(s.id) || 0;
        const absNet = Math.abs(netAmount);
        const remaining = Math.max(0, absNet - paidAmount);

        return {
          id: s.id,
          settlement_code: s.settlement_code,
          partner_id: s.partner_id,
          partner_name: s.partners?.partner_name || "—",
          period_from: s.period_from,
          period_to: s.period_to,
          status: s.status,
          total_booking_revenue: s.total_booking_revenue,
          total_payable_amount: s.total_payable_amount,
          total_host_collected: s.total_host_collected,
          total_deposits_applied: s.total_deposits_applied,
          total_prepaids_applied: s.total_prepaids_applied,
          total_paid_amount: paidAmount,
          remaining_amount: remaining,
          note: s.note,
          created_at: s.created_at,
          finalized_at: s.finalized_at,
        };
      });
    },
  });
}

// ===========================
// Unsettled Bookings for new booking-selection flow
// ===========================
export interface UnsettledBooking {
  unified_booking_id: string;
  guest_name: string | null;
  host_property_name: string | null;
  host_room_type: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  total_amount_net: number | null;
  payment_type: string | null;
  ota_booking_code: string | null;
  source: string | null;
  host_cost: number; // from segments
  segment_count: number;
  settled_segment_count: number;
}

/**
 * Fetch all unsettled bookings for a given host partner.
 * A booking is "unsettled" if it has at least one segment with settlement_id IS NULL.
 */
export function useUnsettledBookings(partnerId: string | null) {
  return useQuery({
    queryKey: ["unsettled-bookings", partnerId],
    queryFn: async (): Promise<UnsettledBooking[]> => {
      if (!partnerId) return [];

      // 1. Get all segments for this partner
      const { data: segments, error: segError } = await supabase
        .from("host_supply_segments")
        .select("unified_booking_id, total_amount, settlement_id")
        .eq("partner_id", partnerId);

      if (segError) throw segError;
      if (!segments || segments.length === 0) return [];

      // 2. Group by booking, count settled vs total
      const bookingMap = new Map<string, { total: number; settled: number; hostCost: number }>();
      segments.forEach(seg => {
        const entry = bookingMap.get(seg.unified_booking_id) || { total: 0, settled: 0, hostCost: 0 };
        entry.total += 1;
        if (seg.settlement_id !== null) {
          entry.settled += 1;
        } else {
          // Only count unsettled segments towards host_cost
          entry.hostCost += Number(seg.total_amount) || 0;
        }
        bookingMap.set(seg.unified_booking_id, entry);
      });

      // 3. Filter to bookings that have at least 1 unsettled segment
      const unsettledBySegment = Array.from(bookingMap.entries())
        .filter(([_, counts]) => counts.settled < counts.total)
        .map(([id]) => id);

      // 3b. Also include bookings with unsettled surcharges/extras
      //     (post-settlement phụ phí added after finalization)
      const allBookingIds = Array.from(bookingMap.keys());
      const { data: unsettledSurcharges } = await supabase
        .from("host_surcharges")
        .select("unified_booking_id")
        .eq("host_partner_id", partnerId)
        .is("settlement_id", null)
        .in("unified_booking_id", allBookingIds);

      const { data: unsettledExtras } = await supabase
        .from("host_extra_charges")
        .select("unified_booking_id")
        .eq("partner_id", partnerId)
        .is("settlement_id", null)
        .in("unified_booking_id", allBookingIds);

      const unsettledSet = new Set([
        ...unsettledBySegment,
        ...(unsettledSurcharges || []).map(s => s.unified_booking_id),
        ...(unsettledExtras || []).map(e => e.unified_booking_id),
      ]);
      const unsettledBookingIds = Array.from(unsettledSet);

      if (unsettledBookingIds.length === 0) return [];

      // 4. Fetch booking details
      const { data: bookings, error: bookingsError } = await supabase
        .from("unified_bookings")
        .select("unified_booking_id, guest_name, host_property_name, host_room_type, check_in_date, check_out_date, total_amount_net, payment_type, ota_booking_code, source")
        .in("unified_booking_id", unsettledBookingIds);

      if (bookingsError) throw bookingsError;

      // 5. Also get surcharges and extra charges for unsettled bookings
      const { data: surcharges } = await supabase
        .from("host_surcharges")
        .select("unified_booking_id, amount")
        .eq("host_partner_id", partnerId)
        .is("settlement_id", null)
        .in("unified_booking_id", unsettledBookingIds);

      const { data: extraCharges } = await supabase
        .from("host_extra_charges")
        .select("unified_booking_id, amount")
        .eq("partner_id", partnerId)
        .is("settlement_id", null)
        .in("unified_booking_id", unsettledBookingIds);

      // Add surcharges/extras to host cost
      surcharges?.forEach(s => {
        const entry = bookingMap.get(s.unified_booking_id);
        if (entry) entry.hostCost += Number(s.amount) || 0;
      });
      extraCharges?.forEach(e => {
        const entry = bookingMap.get(e.unified_booking_id);
        if (entry) entry.hostCost += Number(e.amount) || 0;
      });

      // 6. Dedup bookings — unified_bookings view can return duplicates
      //    when stays table has multiple rows per booking (LEFT JOIN multiplication).
      //    Safety net: keep first row per unified_booking_id.
      const seen = new Map<string, typeof bookings extends (infer T)[] ? T : never>();
      (bookings || []).forEach(b => {
        if (b.unified_booking_id && !seen.has(b.unified_booking_id)) {
          seen.set(b.unified_booking_id, b);
        }
      });
      const dedupedBookings = Array.from(seen.values());

      if (dedupedBookings.length < (bookings || []).length) {
        console.warn(
          `[useUnsettledBookings] Deduped ${(bookings || []).length - dedupedBookings.length} duplicate rows from unified_bookings view`
        );
      }

      // 7. Map to result
      return dedupedBookings.map(b => {
        const counts = bookingMap.get(b.unified_booking_id) || { total: 0, settled: 0, hostCost: 0 };
        return {
          unified_booking_id: b.unified_booking_id || "",
          guest_name: b.guest_name,
          host_property_name: b.host_property_name,
          host_room_type: b.host_room_type,
          check_in_date: b.check_in_date,
          check_out_date: b.check_out_date,
          total_amount_net: b.total_amount_net,
          payment_type: b.payment_type,
          ota_booking_code: b.ota_booking_code ?? null,
          source: b.source ?? null,
          host_cost: counts.hostCost,
          segment_count: counts.total,
          settled_segment_count: counts.settled,
        };
      }).sort((a, b) => {
        // Sort by check_out_date descending (newest first)
        const dateA = a.check_out_date || a.check_in_date || "";
        const dateB = b.check_out_date || b.check_in_date || "";
        return dateB.localeCompare(dateA);
      });
    },
    enabled: !!partnerId,
  });
}

// ===========================
// Void Settlement Mutation
// ===========================
export function useVoidSettlement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ settlementId, reason }: { settlementId: string; reason: string }) => {
      const { data, error } = await (supabase.rpc as any)("void_settlement_secure", {
        p_settlement_id: settlementId,
        p_reason: reason,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Đã hủy quyết toán thành công");
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["host-settlement"] });
      queryClient.invalidateQueries({ queryKey: ["existing-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["unsettled-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["settlement-history"] });
      queryClient.invalidateQueries({ queryKey: ["host-settlement-full-detail"] });
      queryClient.invalidateQueries({ queryKey: ["payment-requests"] });
      queryClient.invalidateQueries({ queryKey: ["host-supply-segments"] });
    },
    onError: (error: any) => {
      const message = error?.message || "Không thể hủy quyết toán";
      toast.error(message);
    },
  });
}
