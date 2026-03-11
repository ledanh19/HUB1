/**
 * useHistoricalAnalytics Hook
 *
 * SINGLE SOURCE OF TRUTH hook for historical finance analytics.
 * Reads from analytics_historical_daily_v (Sprint 2 SQL view).
 *
 * TIME KEY: actual_check_out_at (recognized at checkout).
 * TIMEZONE: Already handled in SQL view (AT TIME ZONE 'Asia/Ho_Chi_Minh').
 *
 * REPLACES (for actualized metrics):
 *   - useAnalyticsTimeSeries
 *   - useAnalyticsPivotRanking
 *   - useAnalyticsChannelShare
 *   - useHostCostTimeSeries (overview KPIs only)
 *
 * DOES NOT REPLACE:
 *   - usePriceSpreadMatched (room-line level exact matching)
 *   - useHostCostByRoomType (segment-level detail)
 *   - usePriceSpreadForecast (forward-looking)
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, startOfWeek, startOfMonth, startOfQuarter, format } from 'date-fns';
import type {
    Granularity,
    CompareMode,
    TimeSeriesRow,
    KpiData,
    PivotRankingRow,
    ChannelShareRow,
} from '../types';
import {
    MIN_NIGHTS_FOR_ADR,
    calculateRevenueAdr,
    calculateHostAdr,
    calculateMarginSpread,
    calculatePopChange,
    calculateSharePct,
    RANKING_CHART_LIMIT,
    CHANNEL_SHARE_LIMIT,
    UNMAPPED_LABEL,
    normalizeChannelName,
    formatPeriodLabel,
} from '../constants';
import { getComparisonRange } from './useAnalyticsFilters';

// ============================================================================
// TYPES
// ============================================================================

/** Raw row from analytics_historical_daily_v */
interface ViewRow {
    business_date: string;
    property_name: string;
    channel: string;
    room_type: string;
    bookings_count: number;
    nights: number;
    revenue_gross: number;
    revenue_net: number;
    host_cost: number;
    gross_profit: number;
    adr: number | null;
    margin_pct: number | null;
}

export interface UseHistoricalAnalyticsOptions {
    dateStart: string;          // YYYY-MM-DD
    dateEnd: string;            // YYYY-MM-DD
    granularity: Granularity;   // day | week | month | quarter
    compareMode: CompareMode;   // none | previous | yoy
    propertyId?: string | null; // null = ALL; string = single property name
}

export interface HistoricalAnalyticsResult {
    // KPIs
    kpi: KpiData | null;
    comparisonKpi: KpiData | null;

    // Time Series
    timeSeries: TimeSeriesRow[];
    comparisonTimeSeries: TimeSeriesRow[];

    // Rankings
    propertyRanking: PivotRankingRow[];
    channelRanking: PivotRankingRow[];
    channelShare: ChannelShareRow[];

    // Metadata
    isLoading: boolean;
    warnings: string[];
}

// ============================================================================
// BUCKETING HELPER
// ============================================================================

/**
 * bucketBusinessDate — Convert a business_date string to a period key.
 *
 * RULES:
 *   - day: YYYY-MM-DD (pass-through)
 *   - week: ISO week (Monday start) → YYYY-MM-DD of the Monday
 *   - month: YYYY-MM (calendar month)
 *   - quarter: YYYY-QN (calendar quarter)
 *
 * IMPORTANT: business_date from the view is ALREADY timezone-safe
 * (AT TIME ZONE 'Asia/Ho_Chi_Minh'). Do NOT re-apply timezone conversion.
 */
export function bucketBusinessDate(dateStr: string, granularity: Granularity): string {
    const date = parseISO(dateStr);

    switch (granularity) {
        case 'day':
            return dateStr; // Already YYYY-MM-DD

        case 'week': {
            // ISO week: Monday start
            const monday = startOfWeek(date, { weekStartsOn: 1 });
            return format(monday, 'yyyy-MM-dd');
        }

        case 'month':
            return format(startOfMonth(date), 'yyyy-MM');

        case 'quarter': {
            const q = Math.ceil((date.getMonth() + 1) / 3);
            return `${date.getFullYear()}-Q${q}`;
        }

        default:
            return dateStr;
    }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchHistoricalDailyData(
    dateStart: string,
    dateEnd: string,
    propertyId?: string | null,
): Promise<ViewRow[]> {
    let query = supabase
        .from('analytics_historical_daily_v' as any)
        .select('*')
        .gte('business_date', dateStart)
        .lte('business_date', dateEnd);

    // Property filter: single property or ALL
    if (propertyId) {
        query = query.eq('property_name', propertyId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('[useHistoricalAnalytics] Fetch error:', error);
        return [];
    }

    return (data as unknown as ViewRow[]) ?? [];
}

// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

interface AggBucket {
    revenueTotal: number;
    hostCostTotal: number;
    nightsTotal: number;
    bookingsCount: number;
}

function computeKpiFromRows(rows: ViewRow[]): KpiData | null {
    if (!rows || rows.length === 0) return null;

    const agg = rows.reduce<AggBucket>(
        (acc, r) => ({
            revenueTotal: acc.revenueTotal + (r.revenue_net ?? 0),
            hostCostTotal: acc.hostCostTotal + (r.host_cost ?? 0),
            nightsTotal: acc.nightsTotal + (r.nights ?? 0),
            bookingsCount: acc.bookingsCount + (r.bookings_count ?? 0),
        }),
        { revenueTotal: 0, hostCostTotal: 0, nightsTotal: 0, bookingsCount: 0 },
    );

    const revenueAdr = calculateRevenueAdr(agg.revenueTotal, agg.nightsTotal);
    const hostAdr = calculateHostAdr(agg.hostCostTotal, agg.nightsTotal);
    const marginSpread = calculateMarginSpread(revenueAdr, hostAdr);

    return {
        revenueTotal: agg.revenueTotal,
        hostCostTotal: agg.hostCostTotal,
        nightsTotal: agg.nightsTotal,
        bookingsCount: agg.bookingsCount,
        revenueAdr,
        hostAdr,
        marginSpread,
        belowSampleThreshold: agg.nightsTotal < MIN_NIGHTS_FOR_ADR,
        // PoP deltas are filled after comparison data is available
        revenuePop: null,
        hostAdrPop: null,
        marginSpreadPop: null,
    };
}

function computeTimeSeries(rows: ViewRow[], granularity: Granularity): TimeSeriesRow[] {
    // Group by bucket
    const buckets = new Map<string, AggBucket>();

    for (const row of rows) {
        const key = bucketBusinessDate(row.business_date, granularity);
        const existing = buckets.get(key) ?? {
            revenueTotal: 0, hostCostTotal: 0, nightsTotal: 0, bookingsCount: 0,
        };

        existing.revenueTotal += row.revenue_net ?? 0;
        existing.hostCostTotal += row.host_cost ?? 0;
        existing.nightsTotal += row.nights ?? 0;
        existing.bookingsCount += row.bookings_count ?? 0;

        buckets.set(key, existing);
    }

    // Sort by time and build TimeSeriesRow[]
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([periodKey, agg]): TimeSeriesRow => {
            const revenueAdr = calculateRevenueAdr(agg.revenueTotal, agg.nightsTotal);
            const hostAdr = calculateHostAdr(agg.hostCostTotal, agg.nightsTotal);
            const marginSpread = calculateMarginSpread(revenueAdr, hostAdr);

            return {
                periodStart: periodKey,
                periodLabel: formatPeriodLabel(periodKey, granularity),
                revenueTotal: agg.revenueTotal,
                hostCostTotal: agg.hostCostTotal,
                nightsTotal: agg.nightsTotal,
                bookingsCount: agg.bookingsCount,
                revenueAdr,
                hostAdr,
                marginSpread,
                belowSampleThreshold: agg.nightsTotal < MIN_NIGHTS_FOR_ADR,
            };
        });
}

function computePropertyRanking(rows: ViewRow[]): PivotRankingRow[] {
    const groups = new Map<string, AggBucket>();

    for (const row of rows) {
        const name = row.property_name || UNMAPPED_LABEL;
        const existing = groups.get(name) ?? {
            revenueTotal: 0, hostCostTotal: 0, nightsTotal: 0, bookingsCount: 0,
        };
        existing.revenueTotal += row.revenue_net ?? 0;
        existing.hostCostTotal += row.host_cost ?? 0;
        existing.nightsTotal += row.nights ?? 0;
        existing.bookingsCount += row.bookings_count ?? 0;
        groups.set(name, existing);
    }

    const totalRevenue = Array.from(groups.values()).reduce((s, g) => s + g.revenueTotal, 0);

    return Array.from(groups.entries())
        .map(([name, agg]): PivotRankingRow => {
            const revenueAdr = calculateRevenueAdr(agg.revenueTotal, agg.nightsTotal);
            const hostAdr = calculateHostAdr(agg.hostCostTotal, agg.nightsTotal);
            return {
                pivotId: name,
                pivotName: name,
                revenueTotal: agg.revenueTotal,
                hostCostTotal: agg.hostCostTotal,
                nightsTotal: agg.nightsTotal,
                bookingsCount: agg.bookingsCount,
                revenueAdr,
                hostAdr,
                marginSpread: calculateMarginSpread(revenueAdr, hostAdr),
                sharePct: calculateSharePct(agg.revenueTotal, totalRevenue),
                belowSampleThreshold: agg.nightsTotal < MIN_NIGHTS_FOR_ADR,
            };
        })
        .sort((a, b) => b.revenueTotal - a.revenueTotal)
        .slice(0, RANKING_CHART_LIMIT);
}

function computeChannelRanking(rows: ViewRow[]): PivotRankingRow[] {
    const groups = new Map<string, AggBucket>();

    for (const row of rows) {
        const channel = normalizeChannelName(row.channel || UNMAPPED_LABEL);
        const existing = groups.get(channel) ?? {
            revenueTotal: 0, hostCostTotal: 0, nightsTotal: 0, bookingsCount: 0,
        };
        existing.revenueTotal += row.revenue_net ?? 0;
        existing.hostCostTotal += row.host_cost ?? 0;
        existing.nightsTotal += row.nights ?? 0;
        existing.bookingsCount += row.bookings_count ?? 0;
        groups.set(channel, existing);
    }

    const totalRevenue = Array.from(groups.values()).reduce((s, g) => s + g.revenueTotal, 0);

    return Array.from(groups.entries())
        .map(([name, agg]): PivotRankingRow => {
            const revenueAdr = calculateRevenueAdr(agg.revenueTotal, agg.nightsTotal);
            const hostAdr = calculateHostAdr(agg.hostCostTotal, agg.nightsTotal);
            return {
                pivotId: name,
                pivotName: name,
                revenueTotal: agg.revenueTotal,
                hostCostTotal: agg.hostCostTotal,
                nightsTotal: agg.nightsTotal,
                bookingsCount: agg.bookingsCount,
                revenueAdr,
                hostAdr,
                marginSpread: calculateMarginSpread(revenueAdr, hostAdr),
                sharePct: calculateSharePct(agg.revenueTotal, totalRevenue),
                belowSampleThreshold: agg.nightsTotal < MIN_NIGHTS_FOR_ADR,
            };
        })
        .sort((a, b) => b.revenueTotal - a.revenueTotal)
        .slice(0, RANKING_CHART_LIMIT);
}

function computeChannelShare(rows: ViewRow[]): ChannelShareRow[] {
    const groups = new Map<string, number>();

    for (const row of rows) {
        const channel = normalizeChannelName(row.channel || UNMAPPED_LABEL);
        groups.set(channel, (groups.get(channel) ?? 0) + (row.revenue_net ?? 0));
    }

    const totalRevenue = Array.from(groups.values()).reduce((s, v) => s + v, 0);

    const sorted = Array.from(groups.entries())
        .map(([name, revenue]): ChannelShareRow => ({
            channelId: name,
            channelName: name,
            revenueTotal: revenue,
            sharePct: calculateSharePct(revenue, totalRevenue),
        }))
        .sort((a, b) => b.revenueTotal - a.revenueTotal);

    // Top N + "Khác"
    if (sorted.length > CHANNEL_SHARE_LIMIT) {
        const top = sorted.slice(0, CHANNEL_SHARE_LIMIT);
        const rest = sorted.slice(CHANNEL_SHARE_LIMIT);
        const restRevenue = rest.reduce((s, r) => s + r.revenueTotal, 0);
        top.push({
            channelId: 'others',
            channelName: 'Khác',
            revenueTotal: restRevenue,
            sharePct: calculateSharePct(restRevenue, totalRevenue),
        });
        return top;
    }

    return sorted;
}

function computeWarnings(rows: ViewRow[]): string[] {
    const warnings: string[] = [];

    // Check for zero host cost coverage (revenue-weighted)
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue_net ?? 0), 0);
    const zeroCostRevenue = rows
        .filter(r => (r.host_cost ?? 0) === 0 && (r.revenue_net ?? 0) > 0)
        .reduce((s, r) => s + (r.revenue_net ?? 0), 0);

    if (totalRevenue > 0 && zeroCostRevenue > 0) {
        const pct = (zeroCostRevenue / totalRevenue) * 100;
        if (pct > 10) {
            warnings.push(`Host cost coverage incomplete: ${pct.toFixed(0)}% of revenue has zero host cost.`);
        } else if (pct > 0) {
            warnings.push(`${pct.toFixed(1)}% of revenue has zero host cost — minor gap.`);
        }
    }

    return warnings;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useHistoricalAnalytics(
    options: UseHistoricalAnalyticsOptions,
): HistoricalAnalyticsResult {
    const { dateStart, dateEnd, granularity, compareMode, propertyId } = options;

    // Calculate comparison range
    const compRange = useMemo(
        () => getComparisonRange(dateStart, dateEnd, compareMode),
        [dateStart, dateEnd, compareMode],
    );

    // Primary data fetch
    const {
        data: rawData,
        isLoading: primaryLoading,
    } = useQuery({
        queryKey: ['historical-analytics', dateStart, dateEnd, propertyId ?? 'all'],
        queryFn: () => fetchHistoricalDailyData(dateStart, dateEnd, propertyId),
        staleTime: 5 * 60 * 1000, // 5 min
    });

    // Comparison data fetch (only when compare mode is active)
    const {
        data: compRawData,
        isLoading: compLoading,
    } = useQuery({
        queryKey: ['historical-analytics', compRange?.dateStart ?? '', compRange?.dateEnd ?? '', propertyId ?? 'all'],
        queryFn: () =>
            compRange
                ? fetchHistoricalDailyData(compRange.dateStart, compRange.dateEnd, propertyId)
                : Promise.resolve([]),
        enabled: !!compRange,
        staleTime: 5 * 60 * 1000,
    });

    // ════════════════════════════════════════════════════════════════════════
    // MEMOIZED TRANSFORMS — all computed from the same raw dataset
    // ════════════════════════════════════════════════════════════════════════

    const rows = rawData ?? [];
    const compRows = compRawData ?? [];

    const kpi = useMemo(() => computeKpiFromRows(rows), [rows]);
    const comparisonKpi = useMemo(() => computeKpiFromRows(compRows), [compRows]);

    // Enrich KPI with PoP deltas
    const enrichedKpi = useMemo((): KpiData | null => {
        if (!kpi) return null;
        if (!comparisonKpi) return kpi;

        return {
            ...kpi,
            revenuePop: calculatePopChange(kpi.revenueTotal, comparisonKpi.revenueTotal),
            hostAdrPop: kpi.hostAdr !== null && comparisonKpi.hostAdr !== null
                ? calculatePopChange(kpi.hostAdr, comparisonKpi.hostAdr)
                : null,
            marginSpreadPop: kpi.marginSpread !== null && comparisonKpi.marginSpread !== null
                ? kpi.marginSpread - comparisonKpi.marginSpread
                : null,
        };
    }, [kpi, comparisonKpi]);

    const timeSeries = useMemo(() => computeTimeSeries(rows, granularity), [rows, granularity]);
    const comparisonTimeSeries = useMemo(
        () => (compRange ? computeTimeSeries(compRows, granularity) : []),
        [compRows, granularity, compRange],
    );

    const propertyRanking = useMemo(() => computePropertyRanking(rows), [rows]);
    const channelRanking = useMemo(() => computeChannelRanking(rows), [rows]);
    const channelShare = useMemo(() => computeChannelShare(rows), [rows]);
    const warnings = useMemo(() => computeWarnings(rows), [rows]);

    return {
        kpi: enrichedKpi,
        comparisonKpi,
        timeSeries,
        comparisonTimeSeries,
        propertyRanking,
        channelRanking,
        channelShare,
        isLoading: primaryLoading || (!!compRange && compLoading),
        warnings,
    };
}
