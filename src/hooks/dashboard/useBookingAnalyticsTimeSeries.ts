/**
 * useBookingAnalyticsTimeSeries — Time series KPIs for Dashboard Tab 2.
 *
 * Queries bookings_mirror (same SOT as BookingSourcesChart) and groups
 * client-side into DAY (YYYY-MM-DD) or MONTH (YYYY-MM) buckets.
 *
 * IMPORTANT: For MONTH bucket, fills ALL months between dateFrom and dateTo
 * with 0 values so the chart shows a complete year axis even if months
 * have no data yet (future months).
 *
 * Follows BookingSourcesChart's exact rules for:
 *   - Revenue: total_amount_net for non-cancelled bookings
 *   - Cancellation: booking_status === 'CANCELLED'
 *   - ADR: revenue / roomNights
 *   - Lead time: differenceInDays(check_in_date, booking_date)
 *
 * NON-BREAKING: New file, no modifications to existing code.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase";
import { differenceInDays, addMonths, addDays, subDays, format as fmtDate } from "date-fns";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";
import type { TimeKey, Bucket } from "./useDashboardAnalyticsFilters";

// ─── Constants ────────────────────────────────────────────────────────────────

const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";
const PAGE_SIZE = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimeSeriesKpis {
    revenue: number;
    reservations: number;
    roomNights: number;
    cancellations: number;
    adr: number;
    avgLos: number;
    avgLeadTime: number;
}

export interface TimeSeriesPoint {
    t: string; // YYYY-MM-DD or YYYY-MM
    revenue: number;
    reservations: number;
    roomNights: number;
    cancellations: number;
}

export interface BookingAnalyticsTimeSeriesResult {
    kpis: TimeSeriesKpis;
    comparisonKpis: TimeSeriesKpis | null;
    series: TimeSeriesPoint[];
    isLoading: boolean;
}

interface UseBookingAnalyticsTimeSeriesParams {
    dateFrom: string;
    dateTo: string;
    timeKey: TimeKey;
    bucket: Bucket;
    propertyId?: string | null;
    enabled?: boolean;
}

// ─── Helper: bucket key from date string ──────────────────────────────────────

function toBucketKey(dateStr: string, bucket: Bucket): string {
    if (bucket === "DAY") return dateStr; // YYYY-MM-DD
    return dateStr.substring(0, 7); // YYYY-MM
}

/**
 * Generate all bucket keys (YYYY-MM or YYYY-MM-DD) between two dates.
 * Ensures the chart axis shows a complete range with zeros for missing data.
 */
function generateAllBucketKeys(dateFrom: string, dateTo: string, bucket: Bucket): string[] {
    const keys: string[] = [];
    if (bucket === "MONTH") {
        // Generate all YYYY-MM from dateFrom month to dateTo month
        let cursor = new Date(dateFrom + "T00:00:00");
        const end = new Date(dateTo + "T00:00:00");
        while (cursor <= end) {
            keys.push(fmtDate(cursor, "yyyy-MM"));
            cursor = addMonths(cursor, 1);
        }
    } else {
        // Generate all YYYY-MM-DD
        let cursor = new Date(dateFrom + "T00:00:00");
        const end = new Date(dateTo + "T00:00:00");
        while (cursor <= end) {
            keys.push(fmtDate(cursor, "yyyy-MM-dd"));
            cursor = addDays(cursor, 1);
        }
    }
    return keys;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBookingAnalyticsTimeSeries({
    dateFrom,
    dateTo,
    timeKey,
    bucket,
    propertyId,
    enabled = true,
}: UseBookingAnalyticsTimeSeriesParams): BookingAnalyticsTimeSeriesResult {
    const { data, isLoading } = useQuery({
        queryKey: ["booking-analytics-timeseries", dateFrom, dateTo, timeKey, bucket, propertyId],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled,
        queryFn: async () => {
            // 1. Get An Gia property IDs
            const { data: propertyLinks } = await supabase
                .from("channex_property_groups")
                .select("channex_property_id")
                .eq("channex_group_id", AN_GIA_GROUP_ID);

            const groupPropertyIds = new Set(
                propertyLinks?.map((p) => p.channex_property_id) || []
            );

            // 2. Fetch bookings in date range (paginated)
            const allBookings: any[] = [];
            for (let from = 0; ; from += PAGE_SIZE) {
                const { data: page, error } = await supabase
                    .from("bookings_mirror")
                    .select(
                        "ota_source, ota_booking_code, total_amount_net, nights, booking_date, check_in_date, check_out_date, booking_status, channex_property_id, ota_property_id, pms_property_name, room_type"
                    )
                    .gte(timeKey, dateFrom)
                    .lte(timeKey, dateTo)
                    .range(from, from + PAGE_SIZE - 1);

                if (error) throw error;
                if (!page || page.length === 0) break;
                allBookings.push(...page);
                if (page.length < PAGE_SIZE) break;
            }

            // 3. Filter by An Gia properties
            let filtered =
                groupPropertyIds.size > 0
                    ? allBookings.filter((b) => groupPropertyIds.has(b.channex_property_id))
                    : allBookings;

            // 4. Filter by PMS property (channex_property_id) if selected
            if (propertyId) {
                filtered = filtered.filter((b) => b.channex_property_id === propertyId);
            }

            // 5. Initialize ALL bucket keys with zeros (so chart shows full axis)
            const allKeys = generateAllBucketKeys(dateFrom, dateTo, bucket);
            const bucketMap = new Map<string, TimeSeriesPoint>();
            for (const key of allKeys) {
                bucketMap.set(key, { t: key, revenue: 0, reservations: 0, roomNights: 0, cancellations: 0 });
            }

            let totalRevenue = 0;
            let totalReservations = 0;
            let totalRoomNights = 0;
            let totalCancellations = 0;
            let totalLeadTime = 0;
            let leadTimeCount = 0;

            // 6. Aggregate into buckets and KPIs
            for (const b of filtered) {
                const dateValue = b[timeKey] as string | null;
                if (!dateValue) continue;

                const key = toBucketKey(dateValue, bucket);
                const isCancelled = b.booking_status === "CANCELLED";

                if (!bucketMap.has(key)) {
                    bucketMap.set(key, { t: key, revenue: 0, reservations: 0, roomNights: 0, cancellations: 0 });
                }
                const point = bucketMap.get(key)!;

                if (isCancelled) {
                    point.cancellations += 1;
                    totalCancellations += 1;
                } else {
                    const amount = Number(b.total_amount_net || 0);
                    const nights = Number(b.nights || 0);

                    point.revenue += amount;
                    point.reservations += 1;
                    point.roomNights += nights;

                    totalRevenue += amount;
                    totalReservations += 1;
                    totalRoomNights += nights;

                    // Lead time (same as BookingSourcesChart)
                    if (b.booking_date && b.check_in_date) {
                        const bookingDate = new Date(b.booking_date);
                        const checkInDate = new Date(b.check_in_date);
                        const lt = differenceInDays(checkInDate, bookingDate);
                        if (lt >= 0) {
                            totalLeadTime += lt;
                            leadTimeCount += 1;
                        }
                    }
                }
            }

            // 7. Sort series by time key
            const series = Array.from(bucketMap.values()).sort((a, b) =>
                a.t.localeCompare(b.t)
            );

            // 8. Compute KPIs
            const kpis: TimeSeriesKpis = {
                revenue: totalRevenue,
                reservations: totalReservations,
                roomNights: totalRoomNights,
                cancellations: totalCancellations,
                adr: totalRoomNights > 0 ? totalRevenue / totalRoomNights : 0,
                avgLos: totalReservations > 0 ? totalRoomNights / totalReservations : 0,
                avgLeadTime: leadTimeCount > 0 ? totalLeadTime / leadTimeCount : 0,
            };

            return { kpis, series };
        },
    });

    // ── Comparison period query (same-length previous period) ──
    const compRange = useMemo(() => {
        const from = new Date(dateFrom + "T00:00:00");
        const to = new Date(dateTo + "T00:00:00");
        const diffMs = to.getTime() - from.getTime();
        const compTo = subDays(from, 1);
        const compFrom = new Date(compTo.getTime() - diffMs);
        return {
            dateFrom: fmtDate(compFrom, "yyyy-MM-dd"),
            dateTo: fmtDate(compTo, "yyyy-MM-dd"),
        };
    }, [dateFrom, dateTo]);

    const { data: compData, isLoading: compLoading } = useQuery({
        queryKey: ["booking-analytics-comparison-kpis", compRange.dateFrom, compRange.dateTo, timeKey, propertyId],
        staleTime: DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled,
        queryFn: async () => {
            const { data: propertyLinks } = await supabase
                .from("channex_property_groups")
                .select("channex_property_id")
                .eq("channex_group_id", AN_GIA_GROUP_ID);
            const groupPropertyIds = new Set(
                propertyLinks?.map((p) => p.channex_property_id) || []
            );

            const allBookings: any[] = [];
            for (let from = 0; ; from += PAGE_SIZE) {
                const { data: page, error } = await supabase
                    .from("bookings_mirror")
                    .select(
                        "total_amount_net, nights, booking_date, check_in_date, check_out_date, booking_status, channex_property_id"
                    )
                    .gte(timeKey, compRange.dateFrom)
                    .lte(timeKey, compRange.dateTo)
                    .range(from, from + PAGE_SIZE - 1);
                if (error) throw error;
                if (!page || page.length === 0) break;
                allBookings.push(...page);
                if (page.length < PAGE_SIZE) break;
            }

            let filtered = groupPropertyIds.size > 0
                ? allBookings.filter((b) => groupPropertyIds.has(b.channex_property_id))
                : allBookings;
            if (propertyId) {
                filtered = filtered.filter((b) => b.channex_property_id === propertyId);
            }

            let totalRevenue = 0, totalReservations = 0, totalRoomNights = 0, totalCancellations = 0;
            let totalLeadTime = 0, leadTimeCount = 0;

            for (const b of filtered) {
                const isCancelled = b.booking_status === "CANCELLED";
                if (isCancelled) {
                    totalCancellations += 1;
                } else {
                    totalRevenue += Number(b.total_amount_net || 0);
                    totalReservations += 1;
                    totalRoomNights += Number(b.nights || 0);
                    if (b.booking_date && b.check_in_date) {
                        const lt = differenceInDays(new Date(b.check_in_date), new Date(b.booking_date));
                        if (lt >= 0) { totalLeadTime += lt; leadTimeCount += 1; }
                    }
                }
            }

            return {
                revenue: totalRevenue,
                reservations: totalReservations,
                roomNights: totalRoomNights,
                cancellations: totalCancellations,
                adr: totalRoomNights > 0 ? totalRevenue / totalRoomNights : 0,
                avgLos: totalReservations > 0 ? totalRoomNights / totalReservations : 0,
                avgLeadTime: leadTimeCount > 0 ? totalLeadTime / leadTimeCount : 0,
            } as TimeSeriesKpis;
        },
    });

    return {
        kpis: data?.kpis ?? {
            revenue: 0,
            reservations: 0,
            roomNights: 0,
            cancellations: 0,
            adr: 0,
            avgLos: 0,
            avgLeadTime: 0,
        },
        comparisonKpis: compData ?? null,
        series: data?.series ?? [],
        isLoading: isLoading || compLoading,
    };
}
