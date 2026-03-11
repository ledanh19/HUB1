/**
 * useOtaArDashboardV2 — Single RPC hook for OTA AR Dashboard tab
 * 
 * Replaces useOtaArSummary + useOtaPayoutPendingSummary with 1 RPC call.
 * Supports property + source + channex property filters.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase";

// -- Types matching RPC JSON output --
export interface OtaArV2Summary {
    eligible_amount: number;
    eligible_count: number;
    pending_amount: number;
    pending_count: number;
    total_outstanding: number;
    overdue_payout_count: number;
    overdue_payout_amount: number;
}

export interface OtaArV2AgingBucket {
    bucket: "0_7" | "8_14" | "15_30" | "GT_30";
    amount: number;
    count: number;
}

export interface OtaArV2SourceRow {
    source: string;
    amount: number;
    count: number;
}

export interface OtaArV2PropertyRow {
    ota_property_id: string;
    ota_source: string;
    property_name: string;
    channex_property_id: string | null;
    amount: number;
    count: number;
}

export interface OtaArV2Data {
    summary: OtaArV2Summary;
    aging: OtaArV2AgingBucket[];
    by_source: OtaArV2SourceRow[];
    by_property: OtaArV2PropertyRow[];
}

const EMPTY_DATA: OtaArV2Data = {
    summary: {
        eligible_amount: 0,
        eligible_count: 0,
        pending_amount: 0,
        pending_count: 0,
        total_outstanding: 0,
        overdue_payout_count: 0,
        overdue_payout_amount: 0,
    },
    aging: [],
    by_source: [],
    by_property: [],
};

export interface OtaArV2Filters {
    /** OTA property ID filter (ota_property_id) */
    propertyId?: string | null;
    /** OTA source filter (e.g. Booking.com) */
    source?: string | null;
    /** Channex property ID filter (channex_property_id) */
    channexPropertyId?: string | null;
}

export function useOtaArDashboardV2(filters: OtaArV2Filters = {}) {
    const { propertyId, source, channexPropertyId } = filters;

    return useQuery({
        queryKey: [
            "ota-ar-dashboard-v2",
            propertyId || "ALL",
            source || "ALL",
            channexPropertyId || "ALL",
        ],
        staleTime: 2 * 60 * 1000, // 2 min
        placeholderData: (prev) => prev,
        refetchOnWindowFocus: false,
        queryFn: async (): Promise<OtaArV2Data> => {
            // Build RPC params — only include p_channex_property_id when set
            // to keep backward compatibility with old 2-param RPC version
            const rpcParams: Record<string, string | null> = {
                p_property_id: propertyId || null,
                p_source: source || null,
            };
            if (channexPropertyId) {
                rpcParams.p_channex_property_id = channexPropertyId;
            }

            const { data, error } = await supabase.rpc(
                "rpc_get_ota_ar_dashboard_v2" as any,
                rpcParams
            );

            if (error) {
                console.error("[useOtaArDashboardV2] RPC error:", error.message);
                throw error;
            }

            if (!data) return EMPTY_DATA;

            // Parse the JSONB response
            const parsed = typeof data === "string" ? JSON.parse(data) : data;

            return {
                summary: parsed.summary || EMPTY_DATA.summary,
                aging: parsed.aging || [],
                by_source: parsed.by_source || [],
                by_property: parsed.by_property || [],
            };
        },
    });
}

/**
 * Hook to get list of channex properties for "Chỗ nghỉ" dropdown.
 * Returns channex_property_id + property_name (unique, no duplicates).
 */
export function useChannexPropertyList() {
    return useQuery({
        queryKey: ["channex-property-list-for-filter"],
        staleTime: 10 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("channex_user_properties" as any)
                .select("channex_property_id, property_name");

            if (error) {
                console.warn("[useChannexPropertyList] fetch failed:", error.message);
                return [];
            }

            return ((data || []) as any[])
                .filter((p) => p.channex_property_id && p.property_name)
                .map((p) => ({
                    id: p.channex_property_id as string,
                    name: p.property_name as string,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        },
    });
}

/**
 * Hook to get list of OTA property IDs for "ID chỗ nghỉ (OTA)" dropdown.
 * Cascades from channex property selection — when channexPropertyId is set,
 * only OTA IDs belonging to that channex property are returned.
 */
export function useOtaPropertyIdList(channexPropertyId?: string | null) {
    return useQuery({
        queryKey: ["ota-property-id-list-for-filter", channexPropertyId || "ALL"],
        staleTime: 10 * 60 * 1000,
        queryFn: async () => {
            let query = supabase
                .from("bookings_mirror" as any)
                .select("ota_property_id, channex_property_id")
                .eq("payment_type", "OTA_COLLECT")
                .neq("booking_status", "CANCELLED")
                .limit(2000);

            // Cascade: filter by channex property if selected
            if (channexPropertyId) {
                query = query.eq("channex_property_id", channexPropertyId);
            }

            const { data: bookings, error } = await query;

            if (error) {
                console.warn("[useOtaPropertyIdList] fetch failed:", error.message);
                return [];
            }

            // Deduplicate ota_property_id → channex_property_id
            const propMap = new Map<string, string>();
            for (const b of (bookings || []) as any[]) {
                if (b.ota_property_id && !propMap.has(b.ota_property_id)) {
                    propMap.set(b.ota_property_id, b.channex_property_id || "");
                }
            }

            // Get property names for display
            const channexIds = [...new Set([...propMap.values()].filter(Boolean))];
            const nameMap = new Map<string, string>();
            if (channexIds.length > 0) {
                const { data: props } = await supabase
                    .from("channex_user_properties" as any)
                    .select("channex_property_id, property_name")
                    .in("channex_property_id", channexIds);
                for (const p of (props || []) as any[]) {
                    nameMap.set(p.channex_property_id, p.property_name || "");
                }
            }

            return [...propMap.entries()]
                .map(([otaPropId, channexId]) => ({
                    id: otaPropId,
                    channexPropertyId: channexId,
                    name: nameMap.get(channexId) || otaPropId,
                    label: `${otaPropId} — ${nameMap.get(channexId) || ""}`,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        },
    });
}

/**
 * Hook to get list of unique OTA sources for filter dropdown
 */
export function useOtaSourceList() {
    return useQuery({
        queryKey: ["ota-source-list-for-filter"],
        staleTime: 10 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("bookings_mirror" as any)
                .select("ota_source")
                .eq("payment_type", "OTA_COLLECT")
                .neq("booking_status", "CANCELLED")
                .limit(1000);

            if (error) {
                console.warn("[useOtaSourceList] fetch failed:", error.message);
                return [];
            }

            // Get unique sources (normalize to uppercase to avoid duplicates like AGODA/Agoda)
            const sources = [...new Set((data || []).map((b: any) => (b.ota_source as string)?.toUpperCase()).filter(Boolean))]
                .sort();

            return sources;
        },
    });
}

// Keep backward compat export
export const usePropertyList = useChannexPropertyList;
