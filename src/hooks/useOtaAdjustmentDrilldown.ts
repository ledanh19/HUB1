import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";

const DRILLDOWN_LIMIT = 200;

export interface OtaAdjustmentDrilldownRow {
    /** ledger_entries.id */
    ledger_id: string;
    /** entry_date from ledger (= payout_date) */
    entry_date: string;
    /** ledger amount (always positive) */
    amount: number;
    /** DEBIT or CREDIT */
    direction: string;
    /** source_id = recon_item.id */
    recon_item_id: string;
    /** adj_category from recon item */
    adj_category: string | null;
    /** item_type from recon item */
    item_type: string | null;
    /** note from recon item */
    note: string | null;
    /** FK to ota_payouts */
    payout_id: string | null;
    /** FK to ota_disputes */
    dispute_id: string | null;
    /** OTA source label (Booking.com, Agoda, etc.) */
    ota_source: string | null;
    /** Provider payout ID */
    provider_payout_id: string | null;
    /** Economic event date (for accrual view) */
    economic_date: string | null;
    /** True if economic_date is in a different period from entry_date */
    is_prior_period: boolean;
}

export interface AdjustmentTotals {
    dispute_net: number;
    penalties: number;
    compensation: number;
    rounding_fx_net: number;
    underpayment: number;
    other_net: number;
    total_net: number;
}

export interface DrilldownResult {
    rows: OtaAdjustmentDrilldownRow[];
    totals: AdjustmentTotals;
    /** Total ledger rows fetched (before category filter) */
    ledgerCount: number;
    /** Rows that matched a recon item via join */
    joinedCount: number;
    /** True if join mismatch detected (ledgerCount > joinedCount) */
    joinMismatch: boolean;
    /** True if results were capped at DRILLDOWN_LIMIT */
    capped: boolean;
    /** Total count (before limit) */
    totalCount: number;
    /** Current page (0-based) */
    page: number;
    /** Page size */
    pageSize: number;
}

/**
 * Hook to fetch OTA adjustment drilldown rows from ledger + reconciliation items.
 * Hardened: join guard with cast fallback, performance cap, tie-out metadata.
 */
export const useOtaAdjustmentDrilldown = (
    dateRange: { start: string; end: string } | null,
    category?: string | null,
    page: number = 0
) => {
    return useQuery<DrilldownResult>({
        queryKey: ["ota-adjustment-drilldown", dateRange, category, page],
        enabled: !!dateRange,
        staleTime: 60_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            if (!dateRange) return emptyResult();

            // 1. Fetch ledger entries with limit + offset for pagination
            let query = supabase
                .from("ledger_entries")
                .select("id, source_id, entry_date, amount, direction, economic_date", { count: "exact" })
                .eq("source_type", "OTA_PAYOUT_ADJUSTMENT")
                .eq("entry_type", "ORIGINAL")
                .eq("is_reversed", false)
                .gte("entry_date", dateRange.start)
                .lte("entry_date", dateRange.end)
                .order("entry_date", { ascending: false })
                .range(page * DRILLDOWN_LIMIT, (page + 1) * DRILLDOWN_LIMIT - 1);

            const { data: ledgerRows, error: ledgerErr, count: totalCount } = await query;

            if (ledgerErr) throw ledgerErr;
            if (!ledgerRows || ledgerRows.length === 0) {
                return { ...emptyResult(), totalCount: totalCount || 0, page };
            }

            const ledgerCount = ledgerRows.length;

            // 2. Join to recon items — try direct UUID match first
            const sourceIds = (ledgerRows as any[]).map((r: any) => r.source_id);
            let reconMap = new Map<string, any>();
            let joinedCount = 0;

            // Attempt 1: direct .in("id", sourceIds) — works if source_id is UUID string matching recon.id
            const { data: reconRows, error: reconErr } = await supabase
                .from("ota_payout_reconciliation_items")
                .select("id, item_type, adj_category, note, direction, dispute_id, payout_id, economic_date, is_prior_period")
                .in("id", sourceIds);

            if (reconErr) throw reconErr;
            (reconRows as any[] || []).forEach((r: any) => reconMap.set(r.id, r));
            joinedCount = reconMap.size;

            // Guard: if significant mismatch, try text-cast fallback query
            // This handles potential type mismatches (e.g. source_id stored without hyphens)
            if (joinedCount < ledgerCount * 0.8 && ledgerCount > 0) {
                console.warn(
                    `[OTA Drilldown] Join mismatch: ${ledgerCount} ledger rows, only ${joinedCount} matched. Attempting text-cast fallback.`
                );
                // Fallback: fetch ALL recon items and match by string comparison
                const unmatchedSourceIds = sourceIds.filter((id: string) => !reconMap.has(id));
                if (unmatchedSourceIds.length > 0) {
                    const { data: fallbackRows } = await supabase
                        .from("ota_payout_reconciliation_items")
                        .select("id, item_type, adj_category, note, direction, dispute_id, payout_id, economic_date, is_prior_period")
                        .in("id", unmatchedSourceIds.map((id: string) => id.replace(/-/g, "")));

                    (fallbackRows as any[] || []).forEach((r: any) => {
                        // Map by converting recon.id to match source_id format
                        const matchingSourceId = unmatchedSourceIds.find(
                            (sid: string) => sid.replace(/-/g, "") === r.id.replace(/-/g, "")
                        );
                        if (matchingSourceId) reconMap.set(matchingSourceId, r);
                    });
                    joinedCount = reconMap.size;
                }
            }

            const joinMismatch = joinedCount < ledgerCount;

            // 3. Get payout info
            const payoutIds = [...new Set(
                Array.from(reconMap.values()).map((r: any) => r.payout_id).filter(Boolean)
            )];
            const payoutMap = new Map<string, any>();
            if (payoutIds.length > 0) {
                const { data: payouts } = await supabase
                    .from("ota_payouts")
                    .select("id, ota_source, provider_payout_id")
                    .in("id", payoutIds);
                (payouts as any[] || []).forEach((p: any) => payoutMap.set(p.id, p));
            }

            // 4. Build rows + totals (with category filter)
            const totals = emptyTotals();
            const rows: OtaAdjustmentDrilldownRow[] = [];

            for (const lr of (ledgerRows as any[])) {
                const recon = reconMap.get(lr.source_id);
                const cat = recon?.adj_category || "OTA_ADJUSTMENT_OTHER";
                const payout = recon?.payout_id ? payoutMap.get(recon.payout_id) : null;

                // Category filter (client-side since ledger doesn't store category)
                if (category && cat !== category) continue;

                const amt = Number(lr.amount || 0);
                const signed = lr.direction === "DEBIT" ? amt : -amt;

                // Aggregate totals
                switch (cat) {
                    case "DISPUTE_WIN": totals.dispute_net += amt; break;
                    case "DISPUTE_LOSS": totals.dispute_net -= amt; break;
                    case "OTA_PENALTY": totals.penalties += amt; break;
                    case "OTA_COMPENSATION": totals.compensation += amt; break;
                    case "OTA_ROUNDING_FX": totals.rounding_fx_net += signed; break;
                    case "OTA_UNDERPAYMENT": totals.underpayment += amt; break;
                    default: totals.other_net += signed; break;
                }
                totals.total_net += signed;

                rows.push({
                    ledger_id: lr.id,
                    entry_date: lr.entry_date,
                    amount: amt,
                    direction: lr.direction,
                    recon_item_id: lr.source_id,
                    adj_category: cat,
                    item_type: recon?.item_type || null,
                    note: recon?.note || null,
                    payout_id: recon?.payout_id || null,
                    dispute_id: recon?.dispute_id || null,
                    ota_source: payout?.ota_source || null,
                    provider_payout_id: payout?.provider_payout_id || null,
                    economic_date: lr.economic_date || recon?.economic_date || null,
                    is_prior_period: recon?.is_prior_period || false,
                });
            }

            return {
                rows,
                totals,
                ledgerCount,
                joinedCount,
                joinMismatch,
                capped: (totalCount || 0) > DRILLDOWN_LIMIT,
                totalCount: totalCount || 0,
                page,
                pageSize: DRILLDOWN_LIMIT,
            };
        },
    });
};

function emptyTotals(): AdjustmentTotals {
    return { dispute_net: 0, penalties: 0, compensation: 0, rounding_fx_net: 0, underpayment: 0, other_net: 0, total_net: 0 };
}

function emptyResult(): DrilldownResult {
    return {
        rows: [], totals: emptyTotals(),
        ledgerCount: 0, joinedCount: 0, joinMismatch: false,
        capped: false, totalCount: 0, page: 0, pageSize: DRILLDOWN_LIMIT,
    };
}
