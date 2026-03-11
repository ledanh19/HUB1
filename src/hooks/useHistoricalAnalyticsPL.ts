/**
 * useHistoricalAnalyticsPL Hook
 *
 * P&L-ALIGNED analytics hook for Dashboard Channex Report tab.
 * Reads from analytics_historical_daily_pl_v (P&L SOT view).
 *
 * KEY DIFFERENCES from useHistoricalAnalytics:
 *   - Uses revenue_pl (override-applied, cancel-detected) instead of revenue_net
 *   - Source view is scoped to An Gia properties only
 *   - Time key is check_out_date (matches P&L)
 *   - Stay guard is CHECKED_OUT (matches P&L)
 *   - No manual_bookings included → NOW INCLUDED (via SQL view UNION ALL)
 *
 * ONLY used by Dashboard Channex Report tab.
 * Other analytics pages continue using useHistoricalAnalytics.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseISO, startOfWeek, startOfMonth, format } from 'date-fns';
import type {
    Granularity,
    CompareMode,
    TimeSeriesRow,
    KpiData,
    PivotRankingRow,
    ChannelShareRow,
} from '@/modules/analytics/types';
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
} from '@/modules/analytics/constants';
import { getComparisonRange } from '@/modules/analytics/hooks/useAnalyticsFilters';

// ============================================================================
// TYPES
// ============================================================================

/** Row from analytics_historical_daily_pl_v */
interface PLViewRow {
    business_date: string;
    property_name: string;
    channel: string;
    room_type: string;
    bookings_count: number;
    nights: number;
    revenue_pl: number;
    revenue_raw_net: number;
    overrides_count: number;
    host_cost: number;
    gross_profit_pl: number;
    adr: number | null;
    margin_pct: number | null;
}

export interface UseHistoricalAnalyticsPLOptions {
    dateStart: string;
    dateEnd: string;
    granularity: Granularity;
    compareMode: CompareMode;
    propertyId?: string | null;
    enabled?: boolean;
}

export interface HistoricalAnalyticsPLResult {
    kpi: KpiData | null;
    comparisonKpi: KpiData | null;
    timeSeries: TimeSeriesRow[];
    comparisonTimeSeries: TimeSeriesRow[];
    propertyRanking: PivotRankingRow[];
    channelRanking: PivotRankingRow[];
    comparisonPropertyRanking: PivotRankingRow[];
    comparisonChannelRanking: PivotRankingRow[];
    channelShare: ChannelShareRow[];
    isLoading: boolean;
    warnings: string[];
}

// ============================================================================
// BUCKETING
// ============================================================================

function bucketDate(dateStr: string, granularity: Granularity): string {
    const date = parseISO(dateStr);
    switch (granularity) {
        case 'day': return dateStr;
        case 'week': return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        case 'month': return format(startOfMonth(date), 'yyyy-MM');
        case 'quarter': return `${date.getFullYear()}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
        default: return dateStr;
    }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchPLViewData(
    dateStart: string,
    dateEnd: string,
    propertyId?: string | null,
): Promise<PLViewRow[]> {
    let query = supabase
        .from('analytics_historical_daily_pl_v' as any)
        .select('*')
        .gte('business_date', dateStart)
        .lte('business_date', dateEnd);

    if (propertyId) {
        query = query.eq('property_name', propertyId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('[useHistoricalAnalyticsPL] Fetch error:', error);
        return [];
    }

    const rows = (data as unknown as PLViewRow[]) ?? [];

    // One-time debug log
    if (rows.length > 0) {
        const totalRevenuePL = rows.reduce((s, r) => s + (r.revenue_pl ?? 0), 0);
        const totalRevenueRawNet = rows.reduce((s, r) => s + (r.revenue_raw_net ?? 0), 0);
        const totalOverrides = rows.reduce((s, r) => s + (r.overrides_count ?? 0), 0);
        console.log(
            `[useHistoricalAnalyticsPL] ${dateStart}→${dateEnd}: ` +
            `${rows.length} rows, ` +
            `revenue_pl=${totalRevenuePL.toLocaleString()}, ` +
            `revenue_raw_net=${totalRevenueRawNet.toLocaleString()}, ` +
            `overrides=${totalOverrides}`
        );
    }

    return rows;
}

// ============================================================================
// AGGREGATION
// ============================================================================

interface AggBucket {
    revenueTotal: number;
    hostCostTotal: number;
    nightsTotal: number;
    bookingsCount: number;
}

function computeKpi(rows: PLViewRow[]): KpiData | null {
    if (!rows.length) return null;
    const agg = rows.reduce<AggBucket>(
        (a, r) => ({
            revenueTotal: a.revenueTotal + (r.revenue_pl ?? 0),
            hostCostTotal: a.hostCostTotal + (r.host_cost ?? 0),
            nightsTotal: a.nightsTotal + (r.nights ?? 0),
            bookingsCount: a.bookingsCount + (r.bookings_count ?? 0),
        }),
        { revenueTotal: 0, hostCostTotal: 0, nightsTotal: 0, bookingsCount: 0 },
    );
    const revenueAdr = calculateRevenueAdr(agg.revenueTotal, agg.nightsTotal);
    const hostAdr = calculateHostAdr(agg.hostCostTotal, agg.nightsTotal);
    return {
        ...agg, revenueAdr, hostAdr,
        marginSpread: calculateMarginSpread(revenueAdr, hostAdr),
        belowSampleThreshold: agg.nightsTotal < MIN_NIGHTS_FOR_ADR,
        revenuePop: null, hostAdrPop: null, marginSpreadPop: null,
    };
}

function computeTimeSeries(rows: PLViewRow[], granularity: Granularity): TimeSeriesRow[] {
    const buckets = new Map<string, AggBucket>();
    for (const row of rows) {
        const key = bucketDate(row.business_date, granularity);
        const e = buckets.get(key) ?? { revenueTotal: 0, hostCostTotal: 0, nightsTotal: 0, bookingsCount: 0 };
        e.revenueTotal += (row.revenue_pl ?? 0);
        e.hostCostTotal += (row.host_cost ?? 0);
        e.nightsTotal += (row.nights ?? 0);
        e.bookingsCount += (row.bookings_count ?? 0);
        buckets.set(key, e);
    }
    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([periodKey, agg]): TimeSeriesRow => {
            const revenueAdr = calculateRevenueAdr(agg.revenueTotal, agg.nightsTotal);
            const hostAdr = calculateHostAdr(agg.hostCostTotal, agg.nightsTotal);
            return {
                periodStart: periodKey,
                periodLabel: formatPeriodLabel(periodKey, granularity),
                ...agg, revenueAdr, hostAdr,
                marginSpread: calculateMarginSpread(revenueAdr, hostAdr),
                belowSampleThreshold: agg.nightsTotal < MIN_NIGHTS_FOR_ADR,
            };
        });
}

function computePropertyRanking(rows: PLViewRow[]): PivotRankingRow[] {
    const groups = new Map<string, AggBucket>();
    for (const r of rows) {
        const name = r.property_name || UNMAPPED_LABEL;
        const e = groups.get(name) ?? { revenueTotal: 0, hostCostTotal: 0, nightsTotal: 0, bookingsCount: 0 };
        e.revenueTotal += (r.revenue_pl ?? 0);
        e.hostCostTotal += (r.host_cost ?? 0);
        e.nightsTotal += (r.nights ?? 0);
        e.bookingsCount += (r.bookings_count ?? 0);
        groups.set(name, e);
    }
    const total = Array.from(groups.values()).reduce((s, g) => s + g.revenueTotal, 0);
    return Array.from(groups.entries())
        .map(([name, agg]): PivotRankingRow => {
            const revenueAdr = calculateRevenueAdr(agg.revenueTotal, agg.nightsTotal);
            const hostAdr = calculateHostAdr(agg.hostCostTotal, agg.nightsTotal);
            return {
                pivotId: name, pivotName: name, ...agg, revenueAdr, hostAdr,
                marginSpread: calculateMarginSpread(revenueAdr, hostAdr),
                sharePct: calculateSharePct(agg.revenueTotal, total),
                belowSampleThreshold: agg.nightsTotal < MIN_NIGHTS_FOR_ADR,
            };
        })
        .sort((a, b) => b.revenueTotal - a.revenueTotal)
        .slice(0, RANKING_CHART_LIMIT);
}

function computeChannelRanking(rows: PLViewRow[]): PivotRankingRow[] {
    const groups = new Map<string, AggBucket>();
    for (const r of rows) {
        const ch = normalizeChannelName(r.channel || UNMAPPED_LABEL);
        const e = groups.get(ch) ?? { revenueTotal: 0, hostCostTotal: 0, nightsTotal: 0, bookingsCount: 0 };
        e.revenueTotal += (r.revenue_pl ?? 0);
        e.hostCostTotal += (r.host_cost ?? 0);
        e.nightsTotal += (r.nights ?? 0);
        e.bookingsCount += (r.bookings_count ?? 0);
        groups.set(ch, e);
    }
    const total = Array.from(groups.values()).reduce((s, g) => s + g.revenueTotal, 0);
    return Array.from(groups.entries())
        .map(([name, agg]): PivotRankingRow => {
            const revenueAdr = calculateRevenueAdr(agg.revenueTotal, agg.nightsTotal);
            const hostAdr = calculateHostAdr(agg.hostCostTotal, agg.nightsTotal);
            return {
                pivotId: name, pivotName: name, ...agg, revenueAdr, hostAdr,
                marginSpread: calculateMarginSpread(revenueAdr, hostAdr),
                sharePct: calculateSharePct(agg.revenueTotal, total),
                belowSampleThreshold: agg.nightsTotal < MIN_NIGHTS_FOR_ADR,
            };
        })
        .sort((a, b) => b.revenueTotal - a.revenueTotal)
        .slice(0, RANKING_CHART_LIMIT);
}

function computeChannelShare(rows: PLViewRow[]): ChannelShareRow[] {
    const groups = new Map<string, number>();
    for (const r of rows) {
        const ch = normalizeChannelName(r.channel || UNMAPPED_LABEL);
        groups.set(ch, (groups.get(ch) ?? 0) + (r.revenue_pl ?? 0));
    }
    const total = Array.from(groups.values()).reduce((s, v) => s + v, 0);
    const sorted = Array.from(groups.entries())
        .map(([name, rev]): ChannelShareRow => ({
            channelId: name, channelName: name, revenueTotal: rev,
            sharePct: calculateSharePct(rev, total),
        }))
        .sort((a, b) => b.revenueTotal - a.revenueTotal);
    if (sorted.length > CHANNEL_SHARE_LIMIT) {
        const top = sorted.slice(0, CHANNEL_SHARE_LIMIT);
        const restRev = sorted.slice(CHANNEL_SHARE_LIMIT).reduce((s, r) => s + r.revenueTotal, 0);
        top.push({ channelId: 'others', channelName: 'Khác', revenueTotal: restRev, sharePct: calculateSharePct(restRev, total) });
        return top;
    }
    return sorted;
}

function computeWarnings(rows: PLViewRow[]): string[] {
    const w: string[] = [];
    const totalRev = rows.reduce((s, r) => s + (r.revenue_pl ?? 0), 0);
    const zeroHostCostRev = rows.filter(r => (r.host_cost ?? 0) === 0 && (r.revenue_pl ?? 0) > 0)
        .reduce((s, r) => s + (r.revenue_pl ?? 0), 0);
    if (totalRev > 0 && zeroHostCostRev > 0) {
        const pct = (zeroHostCostRev / totalRev) * 100;
        if (pct > 10) w.push(`Host cost coverage incomplete: ${pct.toFixed(0)}% of revenue has zero host cost.`);
        else if (pct > 0) w.push(`${pct.toFixed(1)}% of revenue has zero host cost — minor gap.`);
    }
    return w;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useHistoricalAnalyticsPL(
    options: UseHistoricalAnalyticsPLOptions,
): HistoricalAnalyticsPLResult {
    const { dateStart, dateEnd, granularity, compareMode } = options;
    const queryEnabled = options.enabled !== false;

    const compRange = useMemo(
        () => getComparisonRange(dateStart, dateEnd, compareMode),
        [dateStart, dateEnd, compareMode],
    );

    const { data: primaryData, isLoading: primaryLoading } = useQuery({
        queryKey: ['historical-analytics-pl', dateStart, dateEnd, options.propertyId ?? 'all'],
        queryFn: () => fetchPLViewData(dateStart, dateEnd, options.propertyId),
        staleTime: 5 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        enabled: queryEnabled,
    });

    const { data: compData, isLoading: compLoading } = useQuery({
        queryKey: ['historical-analytics-pl', compRange?.dateStart ?? '', compRange?.dateEnd ?? '', options.propertyId ?? 'all'],
        queryFn: () => compRange
            ? fetchPLViewData(compRange.dateStart, compRange.dateEnd, options.propertyId)
            : Promise.resolve([]),
        enabled: queryEnabled && !!compRange,
        staleTime: 5 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const rows = primaryData ?? [];
    const compRows = compData ?? [];

    const kpi = useMemo(() => computeKpi(rows), [rows]);
    const comparisonKpi = useMemo(() => computeKpi(compRows), [compRows]);

    const enrichedKpi = useMemo((): KpiData | null => {
        if (!kpi) return null;
        if (!comparisonKpi) return kpi;
        return {
            ...kpi,
            revenuePop: calculatePopChange(kpi.revenueTotal, comparisonKpi.revenueTotal),
            hostAdrPop: kpi.hostAdr !== null && comparisonKpi.hostAdr !== null
                ? calculatePopChange(kpi.hostAdr, comparisonKpi.hostAdr) : null,
            marginSpreadPop: kpi.marginSpread !== null && comparisonKpi.marginSpread !== null
                ? kpi.marginSpread - comparisonKpi.marginSpread : null,
        };
    }, [kpi, comparisonKpi]);

    const timeSeries = useMemo(() => computeTimeSeries(rows, granularity), [rows, granularity]);
    const comparisonTimeSeries = useMemo(
        () => (compRange ? computeTimeSeries(compRows, granularity) : []),
        [compRows, granularity, compRange],
    );

    const propertyRanking = useMemo(() => computePropertyRanking(rows), [rows]);
    const channelRanking = useMemo(() => computeChannelRanking(rows), [rows]);
    const comparisonPropertyRanking = useMemo(() => computePropertyRanking(compRows), [compRows]);
    const comparisonChannelRanking = useMemo(() => computeChannelRanking(compRows), [compRows]);
    const channelShare = useMemo(() => computeChannelShare(rows), [rows]);
    const warnings = useMemo(() => computeWarnings(rows), [rows]);

    return {
        kpi: enrichedKpi,
        comparisonKpi,
        timeSeries,
        comparisonTimeSeries,
        propertyRanking,
        channelRanking,
        comparisonPropertyRanking,
        comparisonChannelRanking,
        channelShare,
        isLoading: primaryLoading || (!!compRange && compLoading),
        warnings,
    };
}
