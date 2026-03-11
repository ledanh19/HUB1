/**
 * useGuestOriginAnalytics — READ-ONLY analytics hook for Guest Origin section.
 *
 * Queries unified_bookings for nationality + total_amount_net,
 * filtered by booking_date within the dashboard's selected period,
 * aggregates client-side, and returns top 20 countries by booking volume.
 *
 * NON-BREAKING: Does not modify any existing hooks, queries, or data models.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import { resolveISO3 } from "@/lib/countryMapping";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";

export interface GuestOriginRow {
    /** ISO Alpha-3 country code */
    iso3: string;
    /** Raw nationality string (most common variant) */
    country: string;
    /** Number of bookings from this country */
    bookings: number;
    /** Total revenue from this country */
    revenue: number;
    /** Average daily rate */
    adr: number;
    /** Share of total bookings (0–100) */
    share: number;
}

export interface GuestOriginData {
    rows: GuestOriginRow[];
    totalBookings: number;
    isLoading: boolean;
}

interface UseGuestOriginParams {
    /** Period start date in yyyy-MM-dd format */
    dateStart: string;
    /** Period end date in yyyy-MM-dd format */
    dateEnd: string;
    /** Optional: defer query on mobile */
    enabled?: boolean;
}

// An Gia group → filter same as Dashboard
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

export function useGuestOriginAnalytics({ dateStart, dateEnd, enabled }: UseGuestOriginParams): GuestOriginData {
    const { data, isLoading } = useQuery({
        queryKey: ["guest-origin-analytics", dateStart, dateEnd],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: enabled ?? true,
        queryFn: async () => {
            try {
                // Fetch group properties for filtering (same as Dashboard)
                const { data: propertyLinks } = await supabase
                    .from("channex_property_groups")
                    .select("channex_property_id")
                    .eq("channex_group_id", AN_GIA_GROUP_ID);

                const groupPropertyIds = new Set(
                    propertyLinks?.map((p) => p.channex_property_id) || []
                );

                // Fetch from unified_bookings (True SOT for analytics)
                // Note: unified_bookings uses pms_property_id which maps to channex_property_id
                const PAGE_SIZE = 1000;
                const allBookings: any[] = [];
                for (let from = 0; ; from += PAGE_SIZE) {
                    const { data: page, error } = await supabase
                        .from("unified_bookings")
                        .select("nationality, total_amount_net, pms_property_id")
                        .neq("booking_status", "CANCELLED")
                        .gte("booking_date", dateStart)
                        .lte("booking_date", dateEnd)
                        .range(from, from + PAGE_SIZE - 1);

                    if (error) {
                        console.error("[useGuestOriginAnalytics] Query error:", error);
                        break;
                    }
                    if (!page || page.length === 0) break;
                    allBookings.push(...page);
                    if (page.length < PAGE_SIZE) break;
                }

                if (allBookings.length === 0) return { rows: [], total: 0 };

                // Group by normalized ISO3 code
                const countryMap = new Map<
                    string,
                    { bookings: number; revenue: number; rawName: string }
                >();

                let totalBookings = 0;
                for (const b of allBookings) {
                    // Group filter: only include bookings for An Gia properties
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

                // Convert to sorted array
                const rows: Omit<GuestOriginRow, "share">[] = [];
                for (const [iso3, d] of countryMap.entries()) {
                    rows.push({
                        iso3,
                        country: d.rawName,
                        bookings: d.bookings,
                        revenue: d.revenue,
                        adr: d.bookings > 0 ? d.revenue / d.bookings : 0,
                    });
                }

                // Sort by bookings DESC, take top 20
                rows.sort((a, b) => b.bookings - a.bookings);
                const top20 = rows.slice(0, 20);

                // Calculate share
                const result: GuestOriginRow[] = top20.map((r) => ({
                    ...r,
                    share: totalBookings > 0 ? (r.bookings / totalBookings) * 100 : 0,
                }));

                return { rows: result, total: totalBookings };
            } catch (err) {
                console.error("[useGuestOriginAnalytics] Unexpected error:", err);
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
