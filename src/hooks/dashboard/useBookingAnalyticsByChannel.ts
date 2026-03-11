/**
 * useBookingAnalyticsByChannel — Channel breakdown for Dashboard Tab 2.
 *
 * Queries bookings_mirror (same SOT as BookingSourcesChart) and groups
 * by OTA channel using the exact same detectOtaFromCode() logic.
 *
 * Rules (parity with BookingSourcesChart):
 *   - Channel detection: detectOtaFromCode(ota_source, ota_booking_code)
 *   - Revenue: total_amount_net for non-cancelled bookings
 *   - Cancellation: booking_status === 'CANCELLED'
 *   - ADR: revenue / roomNights
 *   - LOS: roomNights / reservations
 *   - Lead time: differenceInDays(check_in_date, booking_date)
 *
 * NON-BREAKING: New file, no modifications to existing code.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
import { differenceInDays } from "date-fns";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";
import type { TimeKey } from "./useDashboardAnalyticsFilters";

// ─── Constants ────────────────────────────────────────────────────────────────

const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";
const PAGE_SIZE = 1000;

// ─── detectOtaFromCode (exact copy from BookingSourcesChart) ──────────────────

function detectOtaFromCode(otaSource: string, otaBookingCode: string | null): string {
    let source = (otaSource || "OTHER").toUpperCase();
    if (source === "OTHER" && otaBookingCode) {
        const code = otaBookingCode.toUpperCase();
        if (code.startsWith("BDC-") || code.includes("BOOKING")) {
            source = "BOOKING.COM";
        } else if (code.startsWith("AGO-") || code.includes("AGODA")) {
            source = "AGODA";
        } else if (code.startsWith("EXP-") || code.includes("EXPEDIA")) {
            source = "EXPEDIA";
        } else if (code.startsWith("TVL-") || code.includes("TRAVELOKA")) {
            source = "TRAVELOKA";
        } else if (code.startsWith("CTP-") || code.includes("CTRIP")) {
            source = "CTRIP";
        }
    }
    return source;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChannelBreakdownRow {
    channel: string;
    revenue: number;
    reservations: number;
    roomNights: number;
    cancellations: number;
    adr: number;
    avgLos: number;
    avgLeadTime: number;
}

export interface BookingAnalyticsByChannelResult {
    rows: ChannelBreakdownRow[];
    isLoading: boolean;
}

interface UseBookingAnalyticsByChannelParams {
    dateFrom: string;
    dateTo: string;
    timeKey: TimeKey;
    propertyId?: string | null;
    enabled?: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBookingAnalyticsByChannel({
    dateFrom,
    dateTo,
    timeKey,
    propertyId,
    enabled = true,
}: UseBookingAnalyticsByChannelParams): BookingAnalyticsByChannelResult {
    const { data, isLoading } = useQuery({
        queryKey: ["booking-analytics-by-channel", dateFrom, dateTo, timeKey, propertyId],
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

            // 2. Fetch bookings (paginated)
            const allBookings: any[] = [];
            for (let from = 0; ; from += PAGE_SIZE) {
                const { data: page, error } = await supabase
                    .from("bookings_mirror")
                    .select(
                        "ota_source, ota_booking_code, total_amount_net, nights, booking_date, check_in_date, check_out_date, booking_status, channex_property_id, ota_property_id"
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

            // 5. Group by channel (same logic as BookingSourcesChart)
            const byChannel: Record<
                string,
                {
                    count: number;
                    amount: number;
                    roomNights: number;
                    cancellations: number;
                    totalLeadTime: number;
                    leadTimeCount: number;
                }
            > = {};

            for (const booking of filtered) {
                const channel = detectOtaFromCode(booking.ota_source, booking.ota_booking_code);
                if (!byChannel[channel]) {
                    byChannel[channel] = {
                        count: 0,
                        amount: 0,
                        roomNights: 0,
                        cancellations: 0,
                        totalLeadTime: 0,
                        leadTimeCount: 0,
                    };
                }

                const isCancelled = booking.booking_status === "CANCELLED";

                if (isCancelled) {
                    byChannel[channel].cancellations += 1;
                } else {
                    byChannel[channel].count += 1;
                    byChannel[channel].amount += Number(booking.total_amount_net || 0);
                    byChannel[channel].roomNights += Number(booking.nights || 0);

                    if (booking.booking_date && booking.check_in_date) {
                        const bookingDate = new Date(booking.booking_date);
                        const checkInDate = new Date(booking.check_in_date);
                        const lt = differenceInDays(checkInDate, bookingDate);
                        if (lt >= 0) {
                            byChannel[channel].totalLeadTime += lt;
                            byChannel[channel].leadTimeCount += 1;
                        }
                    }
                }
            }

            // 6. Convert to sorted array
            const rows: ChannelBreakdownRow[] = Object.entries(byChannel)
                .map(([channel, d]) => ({
                    channel,
                    revenue: d.amount,
                    reservations: d.count,
                    roomNights: d.roomNights,
                    cancellations: d.cancellations,
                    adr: d.roomNights > 0 ? d.amount / d.roomNights : 0,
                    avgLos: d.count > 0 ? d.roomNights / d.count : 0,
                    avgLeadTime: d.leadTimeCount > 0 ? d.totalLeadTime / d.leadTimeCount : 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);

            return rows;
        },
    });

    return {
        rows: data ?? [],
        isLoading,
    };
}
