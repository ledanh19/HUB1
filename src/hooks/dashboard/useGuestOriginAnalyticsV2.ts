/**
 * useGuestOriginAnalyticsV2 — Guest Origin analytics with timeKey support.
 *
 * Enhanced version of useGuestOriginAnalytics that supports configurable
 * timeKey (booking_date / check_in_date / check_out_date) to match the
 * global filter policy in Dashboard Tab 2.
 *
 * Data source: unified_bookings (same as original useGuestOriginAnalytics)
 * Rules:
 *   - Cancellation exclusion: booking_status != 'CANCELLED'
 *   - An Gia property filter (same as Dashboard)
 *   - ISO3 normalization via resolveISO3()
 *   - ADR = revenue / bookings (same as original GuestOriginSection)
 *   - Top 20 countries by booking volume
 *
 * NON-BREAKING: New file, does not modify existing useGuestOriginAnalytics.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import { resolveISO3 } from "@/lib/countryMapping";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";
import type { TimeKey } from "./useDashboardAnalyticsFilters";

// ─── Constants ────────────────────────────────────────────────────────────────

const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";
const PAGE_SIZE = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuestOriginRowV2 {
    iso3: string;
    country: string;
    bookings: number;
    revenue: number;
    adr: number;
    share: number;
}

export interface GuestOriginDataV2 {
    rows: GuestOriginRowV2[];
    totalBookings: number;
    isLoading: boolean;
}

interface UseGuestOriginAnalyticsV2Params {
    dateFrom: string;
    dateTo: string;
    timeKey: TimeKey;
    enabled?: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGuestOriginAnalyticsV2({
    dateFrom,
    dateTo,
    timeKey,
    enabled = true,
}: UseGuestOriginAnalyticsV2Params): GuestOriginDataV2 {
    const { data, isLoading } = useQuery({
        queryKey: ["guest-origin-analytics-v2", dateFrom, dateTo, timeKey],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled,
        queryFn: async () => {
            try {
                // 1. Get An Gia property IDs
                const { data: propertyLinks } = await supabase
                    .from("channex_property_groups")
                    .select("channex_property_id")
                    .eq("channex_group_id", AN_GIA_GROUP_ID);

                const groupPropertyIds = new Set(
                    propertyLinks?.map((p) => p.channex_property_id) || []
                );

                // 2. Fetch unified_bookings with selected timeKey
                const allBookings: any[] = [];
                for (let from = 0; ; from += PAGE_SIZE) {
                    const { data: page, error } = await supabase
                        .from("unified_bookings")
                        .select("nationality, total_amount_net, pms_property_id, booking_date, check_in_date, check_out_date")
                        .neq("booking_status", "CANCELLED")
                        .gte(timeKey, dateFrom)
                        .lte(timeKey, dateTo)
                        .range(from, from + PAGE_SIZE - 1);

                    if (error) {
                        console.error("[useGuestOriginAnalyticsV2] Query error:", error);
                        break;
                    }
                    if (!page || page.length === 0) break;
                    allBookings.push(...page);
                    if (page.length < PAGE_SIZE) break;
                }

                if (allBookings.length === 0) return { rows: [], total: 0 };

                // 3. Group by normalized ISO3 code
                const countryMap = new Map<
                    string,
                    { bookings: number; revenue: number; rawName: string }
                >();

                let totalBookings = 0;
                for (const b of allBookings) {
                    // Filter by An Gia properties
                    if (groupPropertyIds.size > 0 && b.pms_property_id) {
                        if (!groupPropertyIds.has(b.pms_property_id)) continue;
                    }

                    const nationality = b.nationality as string | null;
                    if (!nationality) continue;

                    const iso3 = resolveISO3(nationality);
                    const revenue = Number(b.total_amount_net || 0);

                    const existing = countryMap.get(iso3);
                    if (existing) {
                        existing.bookings += 1;
                        existing.revenue += revenue;
                    } else {
                        countryMap.set(iso3, {
                            bookings: 1,
                            revenue,
                            rawName: nationality,
                        });
                    }
                    totalBookings += 1;
                }

                // 4. Convert to sorted array, top 20
                const rawRows: Omit<GuestOriginRowV2, "share">[] = [];
                for (const [iso3, d] of countryMap.entries()) {
                    rawRows.push({
                        iso3,
                        country: d.rawName,
                        bookings: d.bookings,
                        revenue: d.revenue,
                        adr: d.bookings > 0 ? d.revenue / d.bookings : 0,
                    });
                }

                rawRows.sort((a, b) => b.bookings - a.bookings);
                const top20 = rawRows.slice(0, 20);

                const rows: GuestOriginRowV2[] = top20.map((r) => ({
                    ...r,
                    share: totalBookings > 0 ? (r.bookings / totalBookings) * 100 : 0,
                }));

                return { rows, total: totalBookings };
            } catch (err) {
                console.error("[useGuestOriginAnalyticsV2] Unexpected error:", err);
                return { rows: [], total: 0 };
            }
        },
    });

    return {
        rows: data?.rows || [],
        totalBookings: data?.total || 0,
        isLoading,
    };
}
