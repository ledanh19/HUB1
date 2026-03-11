/**
 * useBookingAnalyticsRankings — Property & Room Type rankings for Dashboard Tab 2.
 *
 * Queries bookings_mirror (same SOT) and aggregates:
 *   1. By ota_property_id: which OTA property sells the most
 *   2. By room_type: which room type sells the most
 *   3. By ota_property_id × ota_source (channel): which property at which OTA sells the most
 *
 * Property filter uses channex_property_id (PMS property mapping).
 * Property dropdown options use PMS properties (channex_property_id + pms_property_name).
 *
 * Follows same revenue/cancellation rules as BookingSourcesChart.
 *
 * NON-BREAKING: New file, no modifications to existing code.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";
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

export interface PropertyRankingRow {
    otaPropertyId: string;
    propertyName: string | null;
    revenue: number;
    reservations: number;
    roomNights: number;
    cancellations: number;
    adr: number;
}

export interface RoomTypeRankingRow {
    roomType: string;
    revenue: number;
    reservations: number;
    roomNights: number;
    cancellations: number;
    adr: number;
}

export interface PropertyChannelRankingRow {
    otaPropertyId: string;
    propertyName: string | null;
    channel: string;
    revenue: number;
    reservations: number;
    roomNights: number;
}

export interface PmsPropertyRankingRow {
    channexPropertyId: string;
    pmsPropertyName: string | null;
    revenue: number;
    reservations: number;
    roomNights: number;
    cancellations: number;
    adr: number;
}

export interface BookingAnalyticsRankingsResult {
    propertyRanking: PropertyRankingRow[];
    roomTypeRanking: RoomTypeRankingRow[];
    propertyChannelRanking: PropertyChannelRankingRow[];
    pmsPropertyRanking: PmsPropertyRankingRow[];
    /** Distinct PMS property options (channex_property_id + pms_property_name) for the filter dropdown */
    propertyOptions: { id: string; name: string | null }[];
    isLoading: boolean;
}

interface UseBookingAnalyticsRankingsParams {
    dateFrom: string;
    dateTo: string;
    timeKey: TimeKey;
    propertyId?: string | null;
    enabled?: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBookingAnalyticsRankings({
    dateFrom,
    dateTo,
    timeKey,
    propertyId,
    enabled = true,
}: UseBookingAnalyticsRankingsParams): BookingAnalyticsRankingsResult {
    const { data, isLoading } = useQuery({
        queryKey: ["booking-analytics-rankings", dateFrom, dateTo, timeKey, propertyId],
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

            // 3b. Collect PMS property options BEFORE property filter (for dropdown)
            //     Uses channex_property_id as ID (PMS property mapping) + pms_property_name as label
            const propertyOptionsMap = new Map<string, string | null>();
            for (const b of filtered) {
                if (b.channex_property_id && !propertyOptionsMap.has(b.channex_property_id)) {
                    propertyOptionsMap.set(b.channex_property_id, b.pms_property_name || null);
                }
            }
            const propertyOptions = Array.from(propertyOptionsMap.entries())
                .map(([id, name]) => ({ id, name }))
                .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

            // 4. Apply PMS property filter (channex_property_id)
            if (propertyId) {
                filtered = filtered.filter((b) => b.channex_property_id === propertyId);
            }

            // 5. Aggregate by OTA property (ota_property_id) — for "which OTA property sells the most"
            const byProperty: Record<string, {
                name: string | null;
                revenue: number; reservations: number; roomNights: number; cancellations: number;
            }> = {};

            // 6. Aggregate by room type
            const byRoomType: Record<string, {
                revenue: number; reservations: number; roomNights: number; cancellations: number;
            }> = {};

            // 7. Aggregate by OTA property × channel
            const byPropertyChannel: Record<string, {
                otaPropertyId: string; propertyName: string | null; channel: string;
                revenue: number; reservations: number; roomNights: number;
            }> = {};

            // 8. Aggregate by PMS property (channex_property_id)
            const byPmsProperty: Record<string, {
                pmsPropertyName: string | null;
                revenue: number; reservations: number; roomNights: number; cancellations: number;
            }> = {};

            for (const b of filtered) {
                const isCancelled = b.booking_status === "CANCELLED";
                const amount = isCancelled ? 0 : Number(b.total_amount_net || 0);
                const nights = isCancelled ? 0 : Number(b.nights || 0);

                // ── OTA Property ranking (ota_property_id) ──
                const propKey = b.ota_property_id || "UNKNOWN";
                if (!byProperty[propKey]) {
                    byProperty[propKey] = { name: b.pms_property_name, revenue: 0, reservations: 0, roomNights: 0, cancellations: 0 };
                }
                if (isCancelled) {
                    byProperty[propKey].cancellations += 1;
                } else {
                    byProperty[propKey].revenue += amount;
                    byProperty[propKey].reservations += 1;
                    byProperty[propKey].roomNights += nights;
                }

                // ── Room type ranking ──
                const rtKey = b.room_type || "Không xác định";
                if (!byRoomType[rtKey]) {
                    byRoomType[rtKey] = { revenue: 0, reservations: 0, roomNights: 0, cancellations: 0 };
                }
                if (isCancelled) {
                    byRoomType[rtKey].cancellations += 1;
                } else {
                    byRoomType[rtKey].revenue += amount;
                    byRoomType[rtKey].reservations += 1;
                    byRoomType[rtKey].roomNights += nights;
                }

                // ── OTA Property × Channel ranking ──
                const channel = detectOtaFromCode(b.ota_source, b.ota_booking_code);
                const pcKey = `${propKey}__${channel}`;
                if (!isCancelled) {
                    if (!byPropertyChannel[pcKey]) {
                        byPropertyChannel[pcKey] = {
                            otaPropertyId: propKey,
                            propertyName: b.pms_property_name,
                            channel,
                            revenue: 0, reservations: 0, roomNights: 0,
                        };
                    }
                    byPropertyChannel[pcKey].revenue += amount;
                    byPropertyChannel[pcKey].reservations += 1;
                    byPropertyChannel[pcKey].roomNights += nights;
                }

                // ── PMS Property ranking (channex_property_id) ──
                const pmsKey = b.channex_property_id || "UNKNOWN";
                if (!byPmsProperty[pmsKey]) {
                    byPmsProperty[pmsKey] = { pmsPropertyName: b.pms_property_name, revenue: 0, reservations: 0, roomNights: 0, cancellations: 0 };
                }
                if (isCancelled) {
                    byPmsProperty[pmsKey].cancellations += 1;
                } else {
                    byPmsProperty[pmsKey].revenue += amount;
                    byPmsProperty[pmsKey].reservations += 1;
                    byPmsProperty[pmsKey].roomNights += nights;
                }
            }

            // Convert to sorted arrays
            const propertyRanking: PropertyRankingRow[] = Object.entries(byProperty)
                .map(([id, d]) => ({
                    otaPropertyId: id,
                    propertyName: d.name,
                    revenue: d.revenue,
                    reservations: d.reservations,
                    roomNights: d.roomNights,
                    cancellations: d.cancellations,
                    adr: d.roomNights > 0 ? d.revenue / d.roomNights : 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);

            const roomTypeRanking: RoomTypeRankingRow[] = Object.entries(byRoomType)
                .map(([rt, d]) => ({
                    roomType: rt,
                    revenue: d.revenue,
                    reservations: d.reservations,
                    roomNights: d.roomNights,
                    cancellations: d.cancellations,
                    adr: d.roomNights > 0 ? d.revenue / d.roomNights : 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);

            const propertyChannelRanking: PropertyChannelRankingRow[] = Object.values(byPropertyChannel)
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 20); // Top 20

            const pmsPropertyRanking: PmsPropertyRankingRow[] = Object.entries(byPmsProperty)
                .map(([id, d]) => ({
                    channexPropertyId: id,
                    pmsPropertyName: d.pmsPropertyName,
                    revenue: d.revenue,
                    reservations: d.reservations,
                    roomNights: d.roomNights,
                    cancellations: d.cancellations,
                    adr: d.roomNights > 0 ? d.revenue / d.roomNights : 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);

            return { propertyRanking, roomTypeRanking, propertyChannelRanking, pmsPropertyRanking, propertyOptions };
        },
    });

    return {
        propertyRanking: data?.propertyRanking ?? [],
        roomTypeRanking: data?.roomTypeRanking ?? [],
        propertyChannelRanking: data?.propertyChannelRanking ?? [],
        pmsPropertyRanking: data?.pmsPropertyRanking ?? [],
        propertyOptions: data?.propertyOptions ?? [],
        isLoading,
    };
}
