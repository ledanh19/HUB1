import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation, safeRpc } from "@/integrations/supabase";
import { toast } from "sonner";
import { createAuditLog } from "./useAuditLog";
import { keepPrevious } from "@/lib/query-helpers";

export interface EnhancedPayable {
  id: string;
  unified_booking_id: string;
  partner_id: string;
  partner_name: string;
  amount: number;
  paid_amount: number;
  applied_deposit_amount: number;
  applied_prepaid_amount: number;
  remaining_amount: number;
  status: string;
  due_date: string | null;
  collection_responsibility: string;
  // Segment details
  total_nights: number;
  avg_nightly_rate: number;
  segments: {
    id: string;
    date_from: string;
    date_to: string;
    nights: number;
    nightly_rate: number;
    total_amount: number;
    host_property_name: string | null;
    room_code: string | null;
  }[];
  // Extra charges + surcharges
  extra_charges_total: number;
  surcharges_total: number;
  // Check-out date
  actual_check_out_at: string | null;
}

/**
 * PHASE A FIX: Bulk-fetch payment truth from verified source tables.
 * Returns maps keyed by payable_id for paid, deposit, and prepaid amounts.
 *
 * IMPORTANT: host_payments is the SOLE canonical paid source per payable.
 * DO NOT add host_payment_batch_items here — batch flow writes BOTH
 * a batch_item AND a host_payment row for the same amount, so summing
 * both would double-count. Batch items are grouping/audit artifacts only.
 */
export async function fetchPayablePaymentTruth(payableIds: string[]) {
  if (!payableIds.length) {
    return {
      paidMap: new Map<string, number>(),
      depositMap: new Map<string, number>(),
      prepaidMap: new Map<string, number>(),
    };
  }

  // Run 3 queries in parallel — bulk by payable IDs
  const [paymentsRes, depositsRes, prepaidsRes] = await Promise.all([
    supabase
      .from("host_payments")
      .select("payable_id, amount")
      .in("payable_id", payableIds),
    supabase
      .from("host_deposits")
      .select("applied_to_payable_id, deposit_amount")
      .in("applied_to_payable_id", payableIds)
      .not("applied_at", "is", null), // Only applied deposits
    supabase
      .from("host_prepaids")
      .select("applied_to_payable_id, prepaid_amount")
      .in("applied_to_payable_id", payableIds)
      .not("applied_at", "is", null), // Only applied prepaids
  ]);

  // Build paid map: host_payments only (canonical per-payable payment source)
  const paidMap = new Map<string, number>();
  paymentsRes.data?.forEach((p) => {
    const pid = p.payable_id;
    paidMap.set(pid, (paidMap.get(pid) || 0) + Number(p.amount || 0));
  });

  // Build deposit map
  const depositMap = new Map<string, number>();
  depositsRes.data?.forEach((d) => {
    const pid = d.applied_to_payable_id!;
    depositMap.set(pid, (depositMap.get(pid) || 0) + Number(d.deposit_amount || 0));
  });

  // Build prepaid map
  const prepaidMap = new Map<string, number>();
  prepaidsRes.data?.forEach((p) => {
    const pid = p.applied_to_payable_id!;
    prepaidMap.set(pid, (prepaidMap.get(pid) || 0) + Number(p.prepaid_amount || 0));
  });

  return { paidMap, depositMap, prepaidMap };
}

export function useEnhancedHostPayables(filters?: {
  hostFilter?: string;
  statusFilter?: string;
  collectionFilter?: string;
}) {
  return useQuery({
    queryKey: ["enhanced-host-payables", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: async () => {
      // Get An Gia booking IDs for filtering
      const { fetchAnGiaBookingIds } = await import("./useAnGiaProperties");
      const anGiaBookingIds = await fetchAnGiaBookingIds();

      // Fetch payables with partner info, filtered by An Gia bookings
      let payablesQuery = supabase
        .from("host_payables")
        .select("*, partners(partner_name)")
        .order("due_date", { ascending: true });

      if (anGiaBookingIds.length > 0) {
        payablesQuery = payablesQuery.in("unified_booking_id", anGiaBookingIds);
      }

      const { data: payables, error: payablesError } = await payablesQuery;

      if (payablesError) throw payablesError;

      // Early return if no payables
      if (!payables || payables.length === 0) {
        return [];
      }

      // Get booking IDs and payable IDs from payables
      const payableBookingIds = payables.map(p => p.unified_booking_id);
      const payableIds = payables.map(p => p.id);

      // PHASE A FIX: Fetch payment truth from verified source tables
      // Run all related queries in PARALLEL for faster loading
      const [
        segmentsResult,
        extraChargesResult,
        surchargesResult,
        staysResult,
        unifiedBookingsResult,
        paymentTruth,
      ] = await Promise.all([
        supabase
          .from("host_supply_segments")
          .select("*")
          .in("unified_booking_id", payableBookingIds)
          .eq("is_voided_by_no_show", false),
        supabase
          .from("host_extra_charges")
          .select("*")
          .in("unified_booking_id", payableBookingIds),
        supabase
          .from("host_surcharges")
          .select("*")
          .in("unified_booking_id", payableBookingIds),
        supabase
          .from("stays")
          .select("unified_booking_id, actual_check_out_at")
          .in("unified_booking_id", payableBookingIds),
        supabase
          .from("unified_bookings")
          .select("unified_booking_id, check_out_date")
          .in("unified_booking_id", payableBookingIds),
        fetchPayablePaymentTruth(payableIds),
      ]);

      const { data: segments, error: segmentsError } = segmentsResult;
      if (segmentsError) throw segmentsError;

      const { data: extraCharges, error: chargesError } = extraChargesResult;
      if (chargesError) throw chargesError;

      const { data: surcharges, error: surchargesError } = surchargesResult;
      if (surchargesError) throw surchargesError;

      const { data: stays, error: staysError } = staysResult;
      if (staysError) {
        console.warn("Could not fetch stays:", staysError);
      }

      const { data: unifiedBookings, error: bookingsError } = unifiedBookingsResult;
      if (bookingsError) {
        console.warn("Could not fetch unified_bookings:", bookingsError);
      }

      // Create lookup maps
      const staysMap: Record<string, string | null> = {};
      stays?.forEach((s) => {
        staysMap[s.unified_booking_id] = s.actual_check_out_at;
      });

      // Fallback to check_out_date from booking if no stay record
      const bookingsMap: Record<string, string | null> = {};
      unifiedBookings?.forEach((b) => {
        if (b.unified_booking_id) {
          bookingsMap[b.unified_booking_id] = b.check_out_date;
        }
      });

      const segmentsMap: Record<string, typeof segments> = {};
      segments?.forEach((s) => {
        if (!segmentsMap[s.unified_booking_id]) {
          segmentsMap[s.unified_booking_id] = [];
        }
        segmentsMap[s.unified_booking_id].push(s);
      });

      const chargesMap: Record<string, Record<string, number>> = {};
      extraCharges?.forEach((c) => {
        if (!chargesMap[c.unified_booking_id]) {
          chargesMap[c.unified_booking_id] = {};
        }
        if (!chargesMap[c.unified_booking_id][c.partner_id]) {
          chargesMap[c.unified_booking_id][c.partner_id] = 0;
        }
        chargesMap[c.unified_booking_id][c.partner_id] += Number(c.amount);
      });

      // Group surcharges by booking AND partner
      const surchargesMap: Record<string, Record<string, number>> = {};
      surcharges?.forEach((s) => {
        if (!surchargesMap[s.unified_booking_id]) {
          surchargesMap[s.unified_booking_id] = {};
        }
        if (!surchargesMap[s.unified_booking_id][s.host_partner_id]) {
          surchargesMap[s.unified_booking_id][s.host_partner_id] = 0;
        }
        surchargesMap[s.unified_booking_id][s.host_partner_id] += Number(s.amount);
      });

      // Build enhanced payables
      const enhanced: EnhancedPayable[] = (payables || []).map((p) => {
        const bookingSegments = segmentsMap[p.unified_booking_id] || [];
        const partnerSegments = bookingSegments.filter(
          (s) => s.partner_id === p.partner_id
        );

        const totalNights = partnerSegments.reduce((sum, s) => sum + s.nights, 0);
        const totalSegmentAmount = partnerSegments.reduce(
          (sum, s) => sum + Number(s.total_amount),
          0
        );
        const avgNightlyRate =
          totalNights > 0 ? totalSegmentAmount / totalNights : 0;

        // PHASE A FIX: Use computed values from verified source tables
        const paidAmount = paymentTruth.paidMap.get(p.id) || 0;
        const appliedDeposit = paymentTruth.depositMap.get(p.id) || 0;
        const appliedPrepaid = paymentTruth.prepaidMap.get(p.id) || 0;
        const remainingAmount =
          Number(p.amount) - paidAmount - appliedDeposit - appliedPrepaid;

        // Derive status from computed values
        let computedStatus: string;
        if (remainingAmount <= 0) {
          computedStatus = "PAID";
        } else if (paidAmount > 0 || appliedDeposit > 0 || appliedPrepaid > 0) {
          computedStatus = "PARTIAL";
        } else {
          computedStatus = "PENDING";
        }

        // Get surcharges for this booking + partner
        const partnerSurcharges = surchargesMap[p.unified_booking_id]?.[p.partner_id] || 0;

        return {
          id: p.id,
          unified_booking_id: p.unified_booking_id,
          partner_id: p.partner_id,
          partner_name: (p.partners as any)?.partner_name || "",
          amount: Number(p.amount),
          paid_amount: paidAmount,
          applied_deposit_amount: appliedDeposit,
          applied_prepaid_amount: appliedPrepaid,
          remaining_amount: remainingAmount,
          status: computedStatus,
          due_date: p.due_date,
          collection_responsibility: p.collection_responsibility || "ROOMRISE_COLLECTED",
          total_nights: totalNights,
          avg_nightly_rate: avgNightlyRate,
          segments: partnerSegments.map((s) => ({
            id: s.id,
            date_from: s.date_from,
            date_to: s.date_to,
            nights: s.nights,
            nightly_rate: Number(s.nightly_rate),
            total_amount: Number(s.total_amount),
            host_property_name: s.host_property_name,
            room_code: s.room_code,
          })),
          extra_charges_total: chargesMap[p.unified_booking_id]?.[p.partner_id] || 0,
          surcharges_total: partnerSurcharges,
          actual_check_out_at: staysMap[p.unified_booking_id] || bookingsMap[p.unified_booking_id] || null,
        };
      });

      // Apply filters
      let filtered = enhanced;
      if (filters?.hostFilter && filters.hostFilter !== "all") {
        filtered = filtered.filter((p) => p.partner_id === filters.hostFilter);
      }
      if (filters?.statusFilter && filters.statusFilter !== "all") {
        filtered = filtered.filter((p) => p.status === filters.statusFilter);
      }
      if (filters?.collectionFilter && filters.collectionFilter !== "all") {
        filtered = filtered.filter(
          (p) => p.collection_responsibility === filters.collectionFilter
        );
      }

      return filtered;
    },
  });
}

export interface BatchPaymentParams {
  partnerId: string;
  payableIds: string[];
  amounts: Record<string, number>;
  paymentMethod: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  transferReference?: string;
  note?: string;
}

export function useCreateBatchPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BatchPaymentParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Chưa đăng nhập");

      const totalAmount = Object.values(params.amounts).reduce((sum, a) => sum + a, 0);

      // Generate batch code
      const { data: batchCode } = await safeRpc(() => supabase.rpc("generate_batch_code"));

      // Create batch record
      const { data: batch, error: batchError } = await supabase
        .from("host_payment_batches")
        .insert({
          batch_code: batchCode || `BP${Date.now()}`,
          partner_id: params.partnerId,
          total_amount: totalAmount,
          payment_method: params.paymentMethod,
          bank_name: params.bankName,
          bank_account_number: params.bankAccountNumber,
          bank_account_name: params.bankAccountName,
          transfer_reference: params.transferReference,
          paid_at: new Date().toISOString(),
          paid_by: user.id,
          note: params.note,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Create batch items and update payables
      for (const payableId of params.payableIds) {
        const amount = params.amounts[payableId];
        if (!amount || amount <= 0) continue;

        // Insert batch item
        await safeMutation(() => supabase.from("host_payment_batch_items").insert({
          batch_id: batch.id,
          payable_id: payableId,
          amount,
        }));

        // Get current payable
        const { data: payable } = await supabase
          .from("host_payables")
          .select("*")
          .eq("id", payableId)
          .single();

        if (!payable) continue;

        const newPaidAmount = (Number(payable.paid_amount) || 0) + amount;
        const totalDue = Number(payable.amount);
        const appliedDeposit = Number(payable.applied_deposit_amount) || 0;
        const appliedPrepaid = Number(payable.applied_prepaid_amount) || 0;
        const remaining = totalDue - newPaidAmount - appliedDeposit - appliedPrepaid;

        const newStatus = remaining <= 0 ? "PAID" : newPaidAmount > 0 ? "PARTIAL" : payable.status;

        // Update payable
        await supabase
          .from("host_payables")
          .update({
            paid_amount: newPaidAmount,
            status: newStatus,
            paid_at: new Date().toISOString(),
            paid_by: user.id,
          })
          .eq("id", payableId);

        // Create host payment record
        await safeMutation(() => supabase.from("host_payments").insert({
          payable_id: payableId,
          partner_id: params.partnerId,
          unified_booking_id: payable.unified_booking_id,
          amount,
          payment_method: params.paymentMethod,
          bank_name: params.bankName,
          bank_account_number: params.bankAccountNumber,
          bank_account_name: params.bankAccountName,
          transfer_reference: params.transferReference,
          paid_at: new Date().toISOString(),
          paid_by: user.id,
          note: `Batch: ${batch.batch_code}`,
        }));

        // SPRINT 12: Atomic cash_out + ledger + cashflow + audit via unified RPC
        const { error: txnError } = await supabase.rpc('create_financial_transaction_secure', {
          p_transaction_type: 'HOST_PAYMENT',
          p_direction: 'OUT',
          p_amount: amount,
          p_cash_date: new Date().toISOString().split('T')[0],
          p_counterparty_type: 'HOST',
          p_counterparty_id: params.partnerId,
          p_source_type: 'HOST_PAYMENT',
          p_source_id: batch.id,  // UUID only — payableId stored in metadata
          p_note: `Thanh toán gộp ${batch.batch_code} - Booking: ${payable.unified_booking_id}`,
          p_payment_method: params.paymentMethod || 'BANK_TRANSFER',
          p_bank_name: params.bankName || null,
          p_account_number: params.bankAccountNumber || null,
          p_account_name: params.bankAccountName || null,
          p_metadata: { batch_id: batch.id, batch_code: batch.batch_code, payable_id: payableId },
        });
        if (txnError) throw txnError;
      }

      // Audit log
      await createAuditLog({
        action: "Thanh toán gộp Host",
        entity: "host_payment_batches",
        entityId: batch.id,
        afterData: { batch_code: batch.batch_code, total_amount: totalAmount, payable_count: params.payableIds.length },
      });

      return batch;
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["host_payables"] });
      queryClient.invalidateQueries({ queryKey: ["host-payments"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      toast.success(`Đã thanh toán gộp: ${batch.batch_code}`);
    },
    onError: (error) => {
      toast.error("Lỗi thanh toán: " + error.message);
    },
  });
}

export function useHostPaymentBatches(partnerId?: string) {
  return useQuery({
    queryKey: ["host-payment-batches", partnerId],
    queryFn: async () => {
      let query = supabase
        .from("host_payment_batches")
        .select("*, partners(partner_name), host_payment_batch_items(*)")
        .order("paid_at", { ascending: false });

      if (partnerId) {
        query = query.eq("partner_id", partnerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
