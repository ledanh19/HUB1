import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============================================
// BOOKING FINANCE VIEW
// SOT (Source of Truth) = PAYOUT TABLES
//
// PAYOUT-DRIVEN POLICY (Optimization Patch 2026-02-26):
// - payout_recorded: from ota_payout_details.final_amount (fallback actual_amount)
// - deductions_total: from ota_payout_deductions.amount (signed) per booking
// - refund_direct: from SETTLED cases with DIRECT_CASH_OUT
// - debit_note_paid: from ota_debit_note_records status=PAID
//
// ⚠️ ota_adjustment_records are NOT included in net_position.
//     They are "supporting docs" shown separately to avoid double-count
//     with ota_payout_deductions which is the SOT.
// ============================================

export interface BookingFinanceItem {
    unified_booking_id: string;
    guest_name: string;
    ota_source: string;
    check_in_date: string;
    check_out_date: string;
    payment_type: string;
    // Financial (SOT = payout tables)
    booking_value: number;            // total_amount_net from booking
    payout_recorded: number;          // sum final_amount|actual_amount from ota_payout_details
    deductions_total: number;         // sum ota_payout_deductions.amount (signed: neg=trừ, pos=cộng)
    refund_direct: number;            // SETTLED cases with DIRECT_CASH_OUT
    debit_note_paid: number;          // debit notes PAID with cash_out
    net_position: number;             // computed
    // Supporting (NOT in net_position — avoid double-count)
    unmatched_adjustments: number;    // adjustment_records not linked to payout deductions
    // Counts
    open_cases: number;
    settled_cases: number;
}

export function useBookingFinanceView(filters?: {
    dateFrom?: string;
    dateTo?: string;
    otaSource?: string;
}) {
    return useQuery({
        queryKey: ["booking_finance_view", filters],
        staleTime: 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            // 1. Fetch bookings
            const { fetchAnGiaBookingIds } = await import("./useAnGiaProperties");
            const anGiaBookingIds = await fetchAnGiaBookingIds();

            let bookingQuery = supabase
                .from("bookings_mirror")
                .select("unified_booking_id, guest_name, ota_source, check_in_date, check_out_date, payment_type, total_amount_net")
                .eq("payment_type", "OTA_COLLECT");

            if (anGiaBookingIds.length > 0) {
                bookingQuery = bookingQuery.in("unified_booking_id", anGiaBookingIds);
            }
            if (filters?.dateFrom) {
                bookingQuery = bookingQuery.gte("check_out_date", filters.dateFrom);
            }
            if (filters?.dateTo) {
                bookingQuery = bookingQuery.lte("check_out_date", filters.dateTo);
            }
            if (filters?.otaSource) {
                bookingQuery = bookingQuery.eq("ota_source", filters.otaSource);
            }

            const { data: bookings, error: bErr } = await bookingQuery;
            if (bErr) throw bErr;
            if (!bookings || bookings.length === 0) return [];

            const bookingIds = bookings.map(b => b.unified_booking_id);

            // 2. Payout details — SOT for payout_recorded
            const { data: payoutDetails } = await supabase
                .from("ota_payout_details")
                .select("unified_booking_id, final_amount, actual_amount")
                .in("unified_booking_id", bookingIds);

            // 3. Payout deductions — SOT for financial adjustments (signed amounts)
            const { data: deductions } = await supabase
                .from("ota_payout_deductions")
                .select("unified_booking_id, amount")
                .in("unified_booking_id", bookingIds);

            // 4. Cases for refund_direct + debit_note linking + counts
            const { data: cases } = await supabase
                .from("ota_disputes")
                .select("unified_booking_id, case_status, case_type, amount_approved, settlement_type, ota_debit_note_record_id")
                .in("unified_booking_id", bookingIds);

            // 5. Debit notes PAID — only for SETTLED cases
            const settledDnIds = (cases || [])
                .filter((c: any) => c.ota_debit_note_record_id && c.case_status === "SETTLED")
                .map((c: any) => c.ota_debit_note_record_id);

            let debitNoteMap = new Map<string, number>();
            if (settledDnIds.length > 0) {
                const { data: dnRecords } = await (supabase as any)
                    .from("ota_debit_note_records")
                    .select("id, amount, status, paid_via_cash_out_id")
                    .in("id", settledDnIds)
                    .eq("status", "PAID")
                    .not("paid_via_cash_out_id", "is", null);

                const dnAmountMap = new Map((dnRecords || []).map((dn: any) => [dn.id, Number(dn.amount || 0)]));

                (cases || []).forEach((c: any) => {
                    if (c.ota_debit_note_record_id && dnAmountMap.has(c.ota_debit_note_record_id) && c.case_status === "SETTLED") {
                        const amt = Number(dnAmountMap.get(c.ota_debit_note_record_id) || 0);
                        const cur = Number(debitNoteMap.get(c.unified_booking_id) || 0);
                        debitNoteMap.set(c.unified_booking_id, cur + amt);
                    }
                });
            }

            // Build maps
            const payoutMap = new Map<string, number>();
            (payoutDetails || []).forEach((pd: any) => {
                const cur = payoutMap.get(pd.unified_booking_id) || 0;
                payoutMap.set(pd.unified_booking_id, cur + Number(pd.final_amount || pd.actual_amount || 0));
            });

            // Deductions map (signed: negative = trừ, positive = thưởng)
            const deductionMap = new Map<string, number>();
            (deductions || []).forEach((d: any) => {
                const cur = deductionMap.get(d.unified_booking_id) || 0;
                deductionMap.set(d.unified_booking_id, cur + Number(d.amount || 0));
            });

            // Cases by booking
            const casesMap = new Map<string, any[]>();
            (cases || []).forEach((c: any) => {
                const arr = casesMap.get(c.unified_booking_id) || [];
                arr.push(c);
                casesMap.set(c.unified_booking_id, arr);
            });

            // 6. Build final items
            const items: BookingFinanceItem[] = bookings.map((b: any) => {
                const bookingValue = Number(b.total_amount_net || 0);
                const payoutRecorded = payoutMap.get(b.unified_booking_id) || 0;
                const deductionsTotal = deductionMap.get(b.unified_booking_id) || 0; // signed
                const bookingCases = casesMap.get(b.unified_booking_id) || [];

                // Direct refunds from SETTLED cases with DIRECT_CASH_OUT
                const refundDirect = bookingCases
                    .filter((c: any) => c.case_type === "REFUND" && c.settlement_type === "DIRECT_CASH_OUT" && c.case_status === "SETTLED")
                    .reduce((sum: number, c: any) => sum + Number(c.amount_approved || 0), 0);

                // Debit notes PAID
                const debitNotePaid = debitNoteMap.get(b.unified_booking_id) || 0;

                const openStatuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"];
                const openCases = bookingCases.filter((c: any) => openStatuses.includes(c.case_status)).length;
                const settledCases = bookingCases.filter((c: any) => c.case_status === "SETTLED").length;

                // net_position = payout_recorded + deductions_total (signed) - refund_direct - debit_note_paid
                // deductions_total already signed: negative = loss, positive = bonus
                const netPosition = payoutRecorded + deductionsTotal - refundDirect - debitNotePaid;

                return {
                    unified_booking_id: b.unified_booking_id,
                    guest_name: b.guest_name,
                    ota_source: b.ota_source,
                    check_in_date: b.check_in_date,
                    check_out_date: b.check_out_date,
                    payment_type: b.payment_type,
                    booking_value: bookingValue,
                    payout_recorded: payoutRecorded,
                    deductions_total: deductionsTotal,
                    refund_direct: refundDirect,
                    debit_note_paid: debitNotePaid,
                    net_position: netPosition,
                    unmatched_adjustments: 0, // computed separately if needed
                    open_cases: openCases,
                    settled_cases: settledCases,
                };
            });

            return items;
        },
    });
}
