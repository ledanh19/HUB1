import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============================================
// OTA RECONCILIATION VIEW
// SOT = PAYOUT TABLES
//
// PAYOUT-DRIVEN POLICY (Optimization Patch 2026-02-26):
// - total_payout: from ota_payouts.net_payout_amount
// - deductions: from ota_payout_deductions (signed, grouped by deduction_type)
// - debit_notes: from ota_debit_note_records (total + paid)
// - unresolved_cases: count of open cases
// - unmatched_adjustments: adjustment_records NOT linked to any payout deduction
// ============================================

export interface OtaReconciliationRow {
    channel: string;
    month: string;         // YYYY-MM
    total_payout: number;
    total_deductions: number;          // signed total from ota_payout_deductions
    total_debit_note: number;
    total_debit_note_paid: number;
    unresolved_cases: number;
    unmatched_payout_records: number;
    unmatched_adjustments: number;     // adjustment_records not linked to payout
}

export function useOtaReconciliation(filters?: {
    channel?: string;
    dateFrom?: string;  // YYYY-MM-DD
    dateTo?: string;
}) {
    return useQuery({
        queryKey: ["ota_reconciliation", filters],
        staleTime: 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            // 1. Payout data (SOT)
            let payoutQuery = supabase
                .from("ota_payouts")
                .select("id, ota_source, payout_date, net_payout_amount, total_amount, status");

            if (filters?.channel) {
                payoutQuery = payoutQuery.eq("ota_source", filters.channel);
            }
            if (filters?.dateFrom) {
                payoutQuery = payoutQuery.gte("payout_date", filters.dateFrom);
            }
            if (filters?.dateTo) {
                payoutQuery = payoutQuery.lte("payout_date", filters.dateTo);
            }

            const { data: payouts } = await payoutQuery;

            // 2. Payout deductions — SOT for adjustments
            const payoutIds = (payouts || []).map((p: any) => p.id);
            let deductions: any[] = [];
            if (payoutIds.length > 0) {
                const { data } = await supabase
                    .from("ota_payout_deductions")
                    .select("payout_id, amount, deduction_type")
                    .in("payout_id", payoutIds);
                deductions = data || [];
            }

            // Build payout → ota_source map
            const payoutOtaMap = new Map<string, string>();
            const payoutDateMap = new Map<string, string>();
            (payouts || []).forEach((p: any) => {
                payoutOtaMap.set(p.id, p.ota_source);
                payoutDateMap.set(p.id, p.payout_date);
            });

            // 3. Debit notes
            let dnQuery = (supabase as any)
                .from("ota_debit_note_records")
                .select("channel, amount, issue_date, status");

            if (filters?.channel) {
                dnQuery = dnQuery.eq("channel", filters.channel);
            }
            if (filters?.dateFrom) {
                dnQuery = dnQuery.gte("issue_date", filters.dateFrom);
            }
            if (filters?.dateTo) {
                dnQuery = dnQuery.lte("issue_date", filters.dateTo);
            }

            const { data: debitNotes } = await dnQuery;

            // 4. Cases (unresolved)
            const { data: cases } = await supabase
                .from("ota_disputes")
                .select("unified_booking_id, case_status, opened_at");

            const caseBookingIds = (cases || []).map((c: any) => c.unified_booking_id);
            const { data: caseBookings } = await supabase
                .from("bookings_mirror")
                .select("unified_booking_id, ota_source")
                .in("unified_booking_id", caseBookingIds);

            const caseBookingMap = new Map(
                (caseBookings || []).map((b: any) => [b.unified_booking_id, b.ota_source])
            );

            // 5. Unmatched adjustments (adjustment_records with no linked case or payout)
            let adjQuery = (supabase as any)
                .from("ota_adjustment_records")
                .select("channel, amount, adjustment_date, linked_case_id, linked_payout_id");

            if (filters?.channel) {
                adjQuery = adjQuery.eq("channel", filters.channel);
            }
            if (filters?.dateFrom) {
                adjQuery = adjQuery.gte("adjustment_date", filters.dateFrom);
            }
            if (filters?.dateTo) {
                adjQuery = adjQuery.lte("adjustment_date", filters.dateTo);
            }

            const { data: adjustments } = await adjQuery;

            // Build aggregation map: key = "CHANNEL|YYYY-MM"
            const rowMap = new Map<string, OtaReconciliationRow>();

            const getOrCreate = (channel: string, month: string): OtaReconciliationRow => {
                const key = `${channel}|${month}`;
                if (!rowMap.has(key)) {
                    rowMap.set(key, {
                        channel,
                        month,
                        total_payout: 0,
                        total_deductions: 0,
                        total_debit_note: 0,
                        total_debit_note_paid: 0,
                        unresolved_cases: 0,
                        unmatched_payout_records: 0,
                        unmatched_adjustments: 0,
                    });
                }
                return rowMap.get(key)!;
            };

            // Aggregate payouts
            (payouts || []).forEach((p: any) => {
                const month = p.payout_date?.slice(0, 7) || "Unknown";
                const row = getOrCreate(p.ota_source, month);
                row.total_payout += Number(p.net_payout_amount || p.total_amount || 0);
                if (p.status === "PENDING") {
                    row.unmatched_payout_records += 1;
                }
            });

            // Aggregate deductions (from payout deductions — SOT)
            deductions.forEach((d: any) => {
                const otaSource = payoutOtaMap.get(d.payout_id) || "OTHER";
                const payoutDate = payoutDateMap.get(d.payout_id) || "Unknown";
                const month = payoutDate.slice(0, 7);
                const row = getOrCreate(otaSource, month);
                row.total_deductions += Number(d.amount || 0); // signed
            });

            // Aggregate debit notes
            (debitNotes || []).forEach((dn: any) => {
                const month = dn.issue_date?.slice(0, 7) || "Unknown";
                const row = getOrCreate(dn.channel, month);
                row.total_debit_note += Number(dn.amount || 0);
                if (dn.status === "PAID") {
                    row.total_debit_note_paid += Number(dn.amount || 0);
                }
            });

            // Aggregate unresolved cases
            const openStatuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"];
            (cases || []).forEach((c: any) => {
                if (!openStatuses.includes(c.case_status || "DRAFT")) return;
                const channel = caseBookingMap.get(c.unified_booking_id) || "OTHER";
                const month = c.opened_at?.slice(0, 7) || "Unknown";
                const row = getOrCreate(channel, month);
                row.unresolved_cases += 1;
            });

            // Aggregate unmatched adjustments (not linked to payout)
            (adjustments || []).forEach((a: any) => {
                // Unmatched = no linked_payout_id (supporting doc only)
                if (!a.linked_payout_id) {
                    const month = a.adjustment_date?.slice(0, 7) || "Unknown";
                    const row = getOrCreate(a.channel, month);
                    row.unmatched_adjustments += 1;
                }
            });

            // Convert to array, sorted by channel then month desc
            const results = Array.from(rowMap.values());
            results.sort((a, b) => {
                if (a.channel !== b.channel) return a.channel.localeCompare(b.channel);
                return b.month.localeCompare(a.month);
            });

            return results;
        },
    });
}

export function useOtaReconciliationSummary(filters?: {
    channel?: string;
    dateFrom?: string;
    dateTo?: string;
}) {
    const { data: rows = [] } = useOtaReconciliation(filters);

    return {
        totalPayout: rows.reduce((sum, r) => sum + r.total_payout, 0),
        totalDeductions: rows.reduce((sum, r) => sum + r.total_deductions, 0),
        totalDebitNote: rows.reduce((sum, r) => sum + r.total_debit_note, 0),
        totalDebitNotePaid: rows.reduce((sum, r) => sum + r.total_debit_note_paid, 0),
        totalUnresolvedCases: rows.reduce((sum, r) => sum + r.unresolved_cases, 0),
        totalUnmatchedRecords: rows.reduce((sum, r) => sum + r.unmatched_payout_records, 0),
        totalUnmatchedAdjustments: rows.reduce((sum, r) => sum + r.unmatched_adjustments, 0),
        channelCount: new Set(rows.map(r => r.channel)).size,
    };
}
