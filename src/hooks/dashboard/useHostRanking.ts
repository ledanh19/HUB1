/**
 * useHostRanking — Host ranking by segment cost (room + extra charges).
 *
 * Queries host_supply_segments + host_extra_charges within the dashboard period,
 * aggregates by partner_id (host), and joins partners for host name.
 *
 * P&L SOT — used only by Dashboard tab.
 * Includes comparison period for trend %.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase, safeFrom } from "@/integrations/supabase";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HostRankingRow {
    partnerId: string;
    partnerName: string;
    roomCost: number;
    extraCharges: number;
    totalCost: number;
    segmentCount: number;
    trendPct: number | null; // vs prev period
}

export interface HostRankingResult {
    hostRanking: HostRankingRow[];
    isLoading: boolean;
}

// ── Fetch aggregated data for a date range ────────────────────────────────────

interface HostAgg {
    roomCost: number;
    extraCharges: number;
    segmentCount: number;
}

async function fetchHostData(dateFrom: string, dateTo: string): Promise<Map<string, HostAgg>> {
    // Fetch segments in range
    const PAGE = 1000;
    const segments: any[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await safeFrom("host_supply_segments" as any)
            .select("partner_id, total_amount, unified_booking_id")
            .gte("date_from", dateFrom)
            .lte("date_from", dateTo)
            .eq("is_voided_by_no_show", false)
            .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        segments.push(...data);
        if (data.length < PAGE) break;
    }

    // Aggregate segments by partner
    const byPartner = new Map<string, HostAgg>();
    const bookingIds = new Set<string>();
    for (const seg of segments) {
        const pid = seg.partner_id;
        if (!pid) continue;
        const e = byPartner.get(pid) || { roomCost: 0, extraCharges: 0, segmentCount: 0 };
        e.roomCost += Number(seg.total_amount || 0);
        e.segmentCount += 1;
        byPartner.set(pid, e);
        if (seg.unified_booking_id) bookingIds.add(seg.unified_booking_id);
    }

    // Fetch surcharges for those bookings
    if (bookingIds.size > 0) {
        const bids = Array.from(bookingIds);
        const BATCH = 200;
        for (let i = 0; i < bids.length; i += BATCH) {
            const batch = bids.slice(i, i + BATCH);
            const { data: extras } = await supabase
                .from("host_surcharges")
                .select("host_partner_id, amount")
                .in("unified_booking_id", batch);
            if (extras) {
                for (const ec of extras as any[]) {
                    const pid = ec.host_partner_id;
                    const e = byPartner.get(pid);
                    if (e) {
                        e.extraCharges += Number(ec.amount || 0);
                    }
                }
            }
        }
    }

    return byPartner;
}

// ── Main hook ─────────────────────────────────────────────────────────────────

interface UseHostRankingParams {
    dateStart: string;
    dateEnd: string;
    /** 'previous' = previous period of same length */
    enabled?: boolean;
}

export function useHostRanking({
    dateStart,
    dateEnd,
    enabled = true,
}: UseHostRankingParams): HostRankingResult {
    // Compute comparison range (same-length previous period)
    const compRange = useMemo(() => {
        const from = new Date(dateStart + "T00:00:00");
        const to = new Date(dateEnd + "T00:00:00");
        const diffMs = to.getTime() - from.getTime();
        const compFrom = new Date(from.getTime() - diffMs - 86400000);
        const compTo = new Date(from.getTime() - 86400000);
        return {
            dateStart: format(compFrom, "yyyy-MM-dd"),
            dateEnd: format(compTo, "yyyy-MM-dd"),
        };
    }, [dateStart, dateEnd]);

    // Fetch partner names (cached)
    const { data: partnerMap } = useQuery({
        queryKey: ["partners-name-lookup"],
        staleTime: 10 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const { data } = await supabase
                .from("partners")
                .select("id, partner_name");
            const map = new Map<string, string>();
            data?.forEach((p: any) => map.set(p.id, p.partner_name));
            return map;
        },
    });

    // Primary period
    const { data: primaryData, isLoading: primaryLoading } = useQuery({
        queryKey: ["host-ranking-primary", dateStart, dateEnd],
        staleTime: DASHBOARD_STALE_TIMES.pnl,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled,
        queryFn: () => fetchHostData(dateStart, dateEnd),
    });

    // Comparison period
    const { data: compData, isLoading: compLoading } = useQuery({
        queryKey: ["host-ranking-comp", compRange.dateStart, compRange.dateEnd],
        staleTime: DASHBOARD_STALE_TIMES.pnl,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled,
        queryFn: () => fetchHostData(compRange.dateStart, compRange.dateEnd),
    });

    const hostRanking = useMemo((): HostRankingRow[] => {
        if (!primaryData) return [];
        const names = partnerMap ?? new Map<string, string>();
        const comp = compData ?? new Map<string, HostAgg>();

        return Array.from(primaryData.entries())
            .map(([pid, agg]): HostRankingRow => {
                const total = agg.roomCost + agg.extraCharges;
                const compAgg = comp.get(pid);
                const compTotal = compAgg ? compAgg.roomCost + compAgg.extraCharges : 0;
                const trendPct = compTotal > 0
                    ? ((total - compTotal) / compTotal) * 100
                    : (total > 0 ? 100 : null);
                return {
                    partnerId: pid,
                    partnerName: names.get(pid) || "Không xác định",
                    roomCost: agg.roomCost,
                    extraCharges: agg.extraCharges,
                    totalCost: total,
                    segmentCount: agg.segmentCount,
                    trendPct,
                };
            })
            .sort((a, b) => b.totalCost - a.totalCost)
            .slice(0, 10);
    }, [primaryData, compData, partnerMap]);

    return {
        hostRanking,
        isLoading: primaryLoading || compLoading,
    };
}
