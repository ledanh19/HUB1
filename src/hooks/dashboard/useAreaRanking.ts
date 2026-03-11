/**
 * useAreaRanking — Area ranking (Province/District/Ward) by accommodation category.
 *
 * SELF-CONTAINED: Queries its own data directly from the appropriate SOT
 * to ensure numbers always match the rest of each tab.
 *
 * Dashboard tab: queries analytics_historical_daily_pl_v (P&L SOT)
 * OTA tab:       queries bookings_mirror (OTA SOT)
 *
 * DIMENSION MAPPING CHAIN — MULTI-STRATEGY (SOT-first):
 *
 * Strategy 1 (Direct): property_name → property_catalog.property_name
 * Strategy 2 (Indirect): pms_property_name → unified_booking_id
 *            → host_supply_segments.host_property_name → property_catalog
 * Strategy 3 (Contains): pms_property_name CONTAINS property_catalog.property_name
 * Strategy 4 (Channex grouping): if any pms_property_name under the same
 *            channex_property_id is resolved, propagate to all variants
 * Strategy 5 (Manual): manual_property_name → property_catalog (direct + contains)
 *
 * Fallback: "Chưa xác định" ONLY when ALL strategies exhausted.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DASHBOARD_STALE_TIMES } from "@/hooks/useDashboardData";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AreaRankingRow {
    areaName: string;
    categoryName: string;
    revenue: number;
    reservations: number;
    roomNights: number;
    propertyCount: number;
}

export interface AreaRankingResult {
    provinceRanking: AreaRankingRow[];
    districtRanking: AreaRankingRow[];
    wardRanking: AreaRankingRow[];
    isLoading: boolean;
    unmappedProperties: string[];
    totalMappedRevenue: number;
    totalUnmappedRevenue: number;
    debugDrilldown: UnknownDrilldownRow[];
}

interface PropertyAreaInfo {
    province: string | null;
    district: string | null;
    ward: string | null;
    category: string;
}

interface MappingResult {
    info: PropertyAreaInfo;
    source: string; // which strategy resolved this
}

export interface UnknownDrilldownRow {
    propertyName: string;
    revenue: number;
    reservations: number;
    reasonUnknown: string;
    dimensionSourceAttempted: string;
    bestCandidateCatalogName: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";
const PAGE_SIZE = 1000;

// ── Normalize for matching ────────────────────────────────────────────────────

function normalizeKey(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, " ");
}

// ── Contains matcher ──────────────────────────────────────────────────────────
// Check if targetName contains any catalog name (longest match wins)
function findContainsMatch(
    targetName: string,
    catalogNames: string[],
    catalogMap: Map<string, PropertyAreaInfo>,
): { info: PropertyAreaInfo; matchedCatalogName: string } | null {
    const normalizedTarget = normalizeKey(targetName);
    let bestMatch: { info: PropertyAreaInfo; matchedCatalogName: string; len: number } | null = null;

    for (const catName of catalogNames) {
        const normalizedCat = normalizeKey(catName);
        // Check if target contains catalog name (catalog name must be at least 4 chars to avoid false positives)
        if (normalizedCat.length >= 4 && normalizedTarget.includes(normalizedCat)) {
            const info = catalogMap.get(catName);
            if (info && (!bestMatch || normalizedCat.length > bestMatch.len)) {
                bestMatch = { info, matchedCatalogName: catName, len: normalizedCat.length };
            }
        }
    }

    return bestMatch ? { info: bestMatch.info, matchedCatalogName: bestMatch.matchedCatalogName } : null;
}

// ── Dimension mapping hook ────────────────────────────────────────────────────
// Builds: property_name (from P&L or OTA) → area info

function usePmsPropertyAreaMap() {
    return useQuery({
        queryKey: ["pms-property-area-map-v5"],
        staleTime: 10 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const result = new Map<string, MappingResult>();

            // ── Step 1: property_catalog (the ONLY source of address data) ──
            const { data: catalogRows, error: catalogErr } = await supabase
                .from("property_catalog" as any)
                .select("property_name, province_name_snapshot, district_name_snapshot, ward_name_snapshot, property_type:property_type_catalog(name_vi)");

            if (catalogErr) {
                console.error("[AreaMap] property_catalog error:", catalogErr);
                return result;
            }

            const catalogMap = new Map<string, PropertyAreaInfo>();
            const catalogNames: string[] = [];
            for (const row of (catalogRows ?? []) as any[]) {
                const name = row.property_name;
                if (!name) continue;
                catalogNames.push(name);
                const info: PropertyAreaInfo = {
                    province: row.province_name_snapshot || null,
                    district: row.district_name_snapshot || null,
                    ward: row.ward_name_snapshot || null,
                    category: row.property_type?.name_vi || "Chưa phân loại",
                };
                catalogMap.set(name, info);
                catalogMap.set(normalizeKey(name), info);
                // Also add to result as direct matches
                result.set(name, { info, source: "direct-exact" });
                result.set(normalizeKey(name), { info, source: "direct-normalized" });
            }

            console.log(`[AreaMap] Step 1: ${catalogNames.length} catalog entries loaded`);

            // ── Step 2: host_supply_segments → booking→host_property_name ──
            const { data: segmentRows, error: segErr } = await supabase
                .from("host_supply_segments")
                .select("unified_booking_id, host_property_name")
                .not("host_property_name", "is", null);

            if (segErr) {
                console.error("[AreaMap] host_supply_segments error:", segErr);
            }

            const bookingToHostProp = new Map<string, string>();
            for (const row of (segmentRows ?? []) as any[]) {
                if (row.unified_booking_id && row.host_property_name) {
                    bookingToHostProp.set(row.unified_booking_id, row.host_property_name);
                }
            }

            console.log(`[AreaMap] Step 2: ${bookingToHostProp.size} segment→host_property mappings`);

            // ── Step 3: bookings_mirror → pms_property_name + channex_property_id ──
            const { data: bmRows, error: bmErr } = await supabase
                .from("bookings_mirror")
                .select("pms_property_name, unified_booking_id, channex_property_id")
                .not("pms_property_name", "is", null);

            if (bmErr) {
                console.error("[AreaMap] bookings_mirror error:", bmErr);
            }

            // Build: pms_property_name → set of host_property_names
            // AND: channex_property_id → set of pms_property_names
            const pmsToHostProps = new Map<string, Set<string>>();
            const channexToPmsNames = new Map<string, Set<string>>();

            for (const row of (bmRows ?? []) as any[]) {
                const pmsName = row.pms_property_name;
                const ubId = row.unified_booking_id;
                const channexId = row.channex_property_id;

                if (!pmsName) continue;

                // Track channex→pms mapping
                if (channexId) {
                    if (!channexToPmsNames.has(channexId)) channexToPmsNames.set(channexId, new Set());
                    channexToPmsNames.get(channexId)!.add(pmsName);
                }

                // Track pms→host_property_name via segment chain
                if (ubId) {
                    const hostPropName = bookingToHostProp.get(ubId);
                    if (hostPropName) {
                        if (!pmsToHostProps.has(pmsName)) pmsToHostProps.set(pmsName, new Set());
                        pmsToHostProps.get(pmsName)!.add(hostPropName);
                    }
                }
            }

            console.log(`[AreaMap] Step 3: ${pmsToHostProps.size} pms→host_prop, ${channexToPmsNames.size} channex_ids`);

            // ── Step 4: Resolve ALL pms_property_names via multi-strategy ──
            const allPmsNames = new Set((bmRows ?? []).map((r: any) => r.pms_property_name).filter(Boolean));

            let strategy2Count = 0;
            let strategy3Count = 0;
            let strategy4Count = 0;

            // Strategy 2: indirect match via host_supply_segments
            for (const pmsName of allPmsNames) {
                if (result.has(pmsName) || result.has(normalizeKey(pmsName))) continue;
                const hostProps = pmsToHostProps.get(pmsName);
                if (!hostProps) continue;
                for (const hpName of hostProps) {
                    const info = catalogMap.get(hpName) || catalogMap.get(normalizeKey(hpName));
                    if (info) {
                        result.set(pmsName, { info, source: "indirect-segment" });
                        result.set(normalizeKey(pmsName), { info, source: "indirect-segment" });
                        strategy2Count++;
                        break;
                    }
                }
            }

            // Strategy 3: contains match (OTA name contains catalog name)
            for (const pmsName of allPmsNames) {
                if (result.has(pmsName) || result.has(normalizeKey(pmsName))) continue;
                const match = findContainsMatch(pmsName, catalogNames, catalogMap);
                if (match) {
                    result.set(pmsName, { info: match.info, source: `contains:${match.matchedCatalogName}` });
                    result.set(normalizeKey(pmsName), { info: match.info, source: `contains:${match.matchedCatalogName}` });
                    strategy3Count++;
                }
            }

            // Strategy 4: channex_property_id grouping
            // If ANY pms_property_name under a channex_property_id is resolved, propagate to ALL
            for (const [, pmsNames] of channexToPmsNames) {
                // Find first resolved name
                let resolvedResult: MappingResult | null = null;
                for (const name of pmsNames) {
                    const r = result.get(name) || result.get(normalizeKey(name));
                    if (r) { resolvedResult = r; break; }
                }
                if (!resolvedResult) continue;
                // Propagate to all unresolved names in the same channex group
                for (const name of pmsNames) {
                    if (!result.has(name) && !result.has(normalizeKey(name))) {
                        result.set(name, { info: resolvedResult.info, source: `channex-group:${resolvedResult.source}` });
                        result.set(normalizeKey(name), { info: resolvedResult.info, source: `channex-group:${resolvedResult.source}` });
                        strategy4Count++;
                    }
                }
            }

            // ── Step 5: Manual bookings fallback ──
            // Manual bookings appear in P&L with manual_property_name.
            // Try to match them against catalog (direct + contains).
            // These aren't in the pmsNames set, but they'll be resolved at lookup time
            // when the P&L SOT returns property_name values from manual bookings.
            // The direct + contains strategies above already handle this since result
            // stores catalog names + normalized keys AND we do contains matching at lookup.

            // Final stats
            const unmappedAfterAll: string[] = [];
            for (const pmsName of allPmsNames) {
                if (!result.has(pmsName) && !result.has(normalizeKey(pmsName))) {
                    unmappedAfterAll.push(pmsName);
                }
            }

            console.log(`[AreaMap] FINAL STATS:`, {
                catalogEntries: catalogNames.length,
                totalPmsNames: allPmsNames.size,
                strategy1_direct: catalogNames.length,
                strategy2_indirect: strategy2Count,
                strategy3_contains: strategy3Count,
                strategy4_channex: strategy4Count,
                stillUnmapped: unmappedAfterAll.length,
                unmappedNames: unmappedAfterAll,
            });

            return result;
        },
    });
}

// ── SOT types ─────────────────────────────────────────────────────────────────

export type AreaRankingSOT = "pl" | "ota";

interface UseAreaRankingParams {
    dateStart: string;
    dateEnd: string;
    sot: AreaRankingSOT;
    timeKey?: string;
    propertyId?: string | null;
    enabled?: boolean;
}

// ── Aggregation helper ────────────────────────────────────────────────────────

interface PropertyAggData {
    propertyName: string;
    revenue: number;
    reservations: number;
    roomNights: number;
}

function aggregateByArea(
    properties: PropertyAggData[],
    lookup: Map<string, MappingResult>,
    catalogNames: string[],
    catalogMap: Map<string, PropertyAreaInfo>,
    getArea: (info: PropertyAreaInfo) => string | null,
): AreaRankingRow[] {
    const groups = new Map<string, {
        revenue: number;
        reservations: number;
        roomNights: number;
        propSet: Set<string>;
    }>();

    for (const p of properties) {
        // Try multiple resolution strategies
        let info: PropertyAreaInfo | null = null;

        // 1. Lookup from pre-built map (covers direct, indirect, channex strategies)
        const mapped = lookup.get(p.propertyName) || lookup.get(normalizeKey(p.propertyName));
        if (mapped) {
            info = mapped.info;
        }

        // 2. At-query-time contains match (for P&L property names not in bookings_mirror,
        //    e.g. manual_property_name values)
        if (!info) {
            const containsMatch = findContainsMatch(p.propertyName, catalogNames, catalogMap);
            if (containsMatch) info = containsMatch.info;
        }

        const area = info ? (getArea(info) || "Chưa xác định") : "Chưa xác định";
        const category = info?.category || "Chưa phân loại";
        const compositeKey = `${area}|||${category}`;

        const g = groups.get(compositeKey) || {
            revenue: 0, reservations: 0, roomNights: 0, propSet: new Set<string>(),
        };
        g.revenue += p.revenue;
        g.reservations += p.reservations;
        g.roomNights += p.roomNights;
        g.propSet.add(p.propertyName);
        groups.set(compositeKey, g);
    }

    return Array.from(groups.entries())
        .map(([key, g]) => {
            const [areaName, categoryName] = key.split("|||");
            return {
                areaName,
                categoryName,
                revenue: g.revenue,
                reservations: g.reservations,
                roomNights: g.roomNights,
                propertyCount: g.propSet.size,
            };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 15);
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useAreaRanking({
    dateStart,
    dateEnd,
    sot,
    timeKey = "booking_date",
    propertyId,
    enabled = true,
}: UseAreaRankingParams): AreaRankingResult {
    const { data: areaMap, isLoading: lookupLoading } = usePmsPropertyAreaMap();

    // ── Query own SOT data ──
    const { data: sotData, isLoading: sotLoading } = useQuery({
        queryKey: ["area-ranking-sot-data", sot, dateStart, dateEnd, timeKey, propertyId],
        staleTime: sot === "pl" ? DASHBOARD_STALE_TIMES.pnl : DASHBOARD_STALE_TIMES.operations,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled,
        queryFn: async (): Promise<PropertyAggData[]> => {
            if (sot === "pl") {
                const { data, error } = await supabase
                    .from("analytics_historical_daily_pl_v" as any)
                    .select("property_name, revenue_pl, bookings_count, nights")
                    .gte("business_date", dateStart)
                    .lte("business_date", dateEnd);

                if (error) {
                    console.error("[useAreaRanking] P&L query error:", error);
                    return [];
                }

                const groups = new Map<string, PropertyAggData>();
                for (const row of (data ?? []) as any[]) {
                    const name = row.property_name || "Không xác định";
                    const g = groups.get(name) || { propertyName: name, revenue: 0, reservations: 0, roomNights: 0 };
                    g.revenue += Number(row.revenue_pl ?? 0);
                    g.reservations += Number(row.bookings_count ?? 0);
                    g.roomNights += Number(row.nights ?? 0);
                    groups.set(name, g);
                }
                return Array.from(groups.values());

            } else {
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
                        .select("pms_property_name, total_amount_net, nights, booking_status, channex_property_id")
                        .gte(timeKey, dateStart)
                        .lte(timeKey, dateEnd)
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

                const groups = new Map<string, PropertyAggData>();
                for (const b of filtered) {
                    if (b.booking_status === "CANCELLED") continue;
                    const name = b.pms_property_name || "Không xác định";
                    const g = groups.get(name) || { propertyName: name, revenue: 0, reservations: 0, roomNights: 0 };
                    g.revenue += Number(b.total_amount_net || 0);
                    g.reservations += 1;
                    g.roomNights += Number(b.nights || 0);
                    groups.set(name, g);
                }
                return Array.from(groups.values());
            }
        },
    });

    const lookup = areaMap ?? new Map<string, MappingResult>();
    const properties = sotData ?? [];
    const isLoading = lookupLoading || sotLoading;

    // ── Extract raw catalog data from lookup for contains matching at query time ──
    const { catalogNames, catalogMap } = useMemo(() => {
        const names: string[] = [];
        const map = new Map<string, PropertyAreaInfo>();
        for (const [k, v] of lookup) {
            if (v.source === "direct-exact") {
                names.push(k);
                map.set(k, v.info);
                map.set(normalizeKey(k), v.info);
            }
        }
        return { catalogNames: names, catalogMap: map };
    }, [lookup]);

    // ── Debug drilldown for unknown rows ──
    const { unmappedProperties, totalMappedRevenue, totalUnmappedRevenue, debugDrilldown } = useMemo(() => {
        const unmapped: string[] = [];
        let mappedRev = 0;
        let unmappedRev = 0;
        const drilldown: UnknownDrilldownRow[] = [];

        for (const p of properties) {
            const mapped = lookup.get(p.propertyName) || lookup.get(normalizeKey(p.propertyName));
            // Also try contains match at query time
            const containsMatch = !mapped ? findContainsMatch(p.propertyName, catalogNames, catalogMap) : null;

            if (mapped || containsMatch) {
                mappedRev += p.revenue;
            } else {
                unmapped.push(p.propertyName);
                unmappedRev += p.revenue;

                // Classify WHY it's unknown
                let reason = "A: No catalog/segment/address found";
                const attempts: string[] = [];

                // Check what we tried
                attempts.push("direct-catalog");
                attempts.push("indirect-segment");
                attempts.push("contains-match");
                attempts.push("channex-group");

                // Try to find best candidate (closest catalog name)
                let bestCandidate: string | null = null;
                const normalizedProp = normalizeKey(p.propertyName);
                for (const catName of catalogNames) {
                    const normalizedCat = normalizeKey(catName);
                    if (normalizedProp.includes(normalizedCat) || normalizedCat.includes(normalizedProp)) {
                        bestCandidate = catName;
                        reason = "G: Normalization issue — partial match found but not triggered";
                        break;
                    }
                }

                // Check specific reasons
                if (p.propertyName === "Không xác định") {
                    reason = "A: property_name is null/empty in source";
                } else if (bestCandidate) {
                    // Already set above
                } else {
                    reason = "F: pms_property_name not in bookings_mirror or no segment chain";
                }

                drilldown.push({
                    propertyName: p.propertyName,
                    revenue: p.revenue,
                    reservations: p.reservations,
                    reasonUnknown: reason,
                    dimensionSourceAttempted: attempts.join(", "),
                    bestCandidateCatalogName: bestCandidate,
                });
            }
        }

        // Output detailed debug
        if (drilldown.length > 0) {
            const totalRevenue = properties.reduce((s, p) => s + p.revenue, 0);
            console.warn(`[AreaRanking] ${sot.toUpperCase()} UNKNOWN DRILLDOWN:`, {
                unknownCount: drilldown.length,
                unknownRevenue: unmappedRev.toLocaleString(),
                totalRevenue: totalRevenue.toLocaleString(),
                unknownPct: totalRevenue > 0 ? `${((unmappedRev / totalRevenue) * 100).toFixed(1)}%` : "N/A",
                rows: drilldown.sort((a, b) => b.revenue - a.revenue),
            });
        } else {
            console.log(`[AreaRanking] ${sot.toUpperCase()}: ✅ ALL properties mapped — 0 unknown`);
        }

        return { unmappedProperties: unmapped, totalMappedRevenue: mappedRev, totalUnmappedRevenue: unmappedRev, debugDrilldown: drilldown };
    }, [properties, lookup, sot, catalogNames, catalogMap]);

    const provinceRanking = useMemo(
        () => aggregateByArea(properties, lookup, catalogNames, catalogMap, info => info.province),
        [properties, lookup, catalogNames, catalogMap],
    );

    const districtRanking = useMemo(
        () => aggregateByArea(properties, lookup, catalogNames, catalogMap, info => info.district),
        [properties, lookup, catalogNames, catalogMap],
    );

    const wardRanking = useMemo(
        () => aggregateByArea(properties, lookup, catalogNames, catalogMap, info => info.ward),
        [properties, lookup, catalogNames, catalogMap],
    );

    return {
        provinceRanking, districtRanking, wardRanking, isLoading,
        unmappedProperties, totalMappedRevenue, totalUnmappedRevenue,
        debugDrilldown,
    };
}
