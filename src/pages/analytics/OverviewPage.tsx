/**
 * Analytics Overview Page — Enterprise PMS Standard (Sprint 3 Refactor)
 *
 * REFACTORED: Now reads from analytics_historical_daily_v via useHistoricalAnalytics().
 * TIME KEY: actual_check_out_at (revenue recognized at checkout).
 *
 * Executive Snapshot Layer: answers "Are we up or down? Why? Which property/channel drives it?"
 *
 * Layout Structure:
 *   ┌─ AnalyticsFilters (date range, granularity, compare, property) [🔒 checkout locked]
 *   ├─ ContextSubheader (Portfolio/Property mode indicator)
 *   ├─ InsightHeader (top-line insight sentence)
 *   ├─ KpiRow (Primary: Revenue/HostCost/Spread; Secondary: ADR/Nights/Bookings)
 *   ├─ TrendComboChart (Revenue bar + ADR line, with optional comparison overlay)
 *   ├─ StackedAreaChart (Channel mix over time) — 1/3 width
 *   ├─ RankingChart (Top 5 by revenue) — conditional
 *   └─ DynamicPivotTable (collapsible detail table)
 */

import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import {
  AnalyticsFilters,
  KpiRow,
  TrendComboChart,
  RankingChart,
  StackedAreaChart,
  DynamicPivotTable,
  InsightHeader,
  ContextSubheader,
} from '@/modules/analytics/components';
import type { PivotColumn } from '@/modules/analytics/components';
import {
  useAnalyticsFilters,
  useHistoricalAnalytics,
  useContextMode,
} from '@/modules/analytics/hooks';
import { formatCurrency, formatPercent, RANKING_CHART_LIMIT } from '@/modules/analytics/constants';
import { usePrefetchMountLog } from '@/lib/navigation/usePrefetchMountLog';

// ============================================================================
// PORTFOLIO KPI COLUMN CONFIG
// ============================================================================

const PORTFOLIO_TABLE_COLUMNS: PivotColumn[] = [
  { key: 'revenueTotal', label: 'Revenue', format: 'currency' },
  { key: 'nightsTotal', label: 'Đêm', format: 'number' },
  { key: 'revenueAdr', label: 'ADR', format: 'currency' },
  { key: 'marginSpread', label: 'Spread', format: 'currency' },
  { key: 'sharePct', label: 'Share %', format: 'percent' },
];

const PROPERTY_TABLE_COLUMNS: PivotColumn[] = [
  { key: 'revenueTotal', label: 'Revenue', format: 'currency' },
  { key: 'nightsTotal', label: 'Đêm', format: 'number' },
  { key: 'revenueAdr', label: 'ADR', format: 'currency' },
  { key: 'sharePct', label: 'Share %', format: 'percent' },
];

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function AnalyticsOverviewPage() {
  const { filters, comparisonRange } = useAnalyticsFilters();
  const { mode, propertyName, isPropertyMode } = useContextMode(filters);

  // ========================================================================
  // DATA FETCHING — Sprint 3: Single historical view hook
  // ========================================================================

  const {
    kpi,
    timeSeries,
    comparisonTimeSeries,
    propertyRanking,
    channelShare,
    channelRanking,
    isLoading,
    warnings,
  } = useHistoricalAnalytics({
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    granularity: filters.granularity,
    compareMode: filters.compareMode,
    propertyId: filters.selectedIds.length === 1 ? filters.selectedIds[0] : null,
  });

  usePrefetchMountLog('AnalyticsOverviewPage', [
    { key: ['historical-analytics'], query: { status: isLoading ? 'loading' : 'success', isFetching: isLoading, dataUpdatedAt: Date.now() } },
  ]);

  // ========================================================================
  // DERIVED DATA
  // ========================================================================

  const ranking = isPropertyMode ? channelRanking : propertyRanking;
  const tableColumns = isPropertyMode ? PROPERTY_TABLE_COLUMNS : PORTFOLIO_TABLE_COLUMNS;
  const compLabel = filters.compareMode === 'yoy' ? 'Năm ngoái' : 'Kỳ trước';

  // Build channel time series from channel ranking for stacked area (simplified)
  const channelTimePoints = channelShare.map(ch => ({
    channelName: ch.channelName,
    revenueTotal: ch.revenueTotal,
    sharePct: ch.sharePct,
  }));

  return (
    <>
      <Header title="Analytics Overview" subtitle="Theo ngày trả phòng thực tế (Actual Checkout)" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* Filters — 🔒 LỌC THEO locked to checkout */}
            <AnalyticsFilters variant="overview" />

            {/* Context + Insight */}
            <ContextSubheader mode={mode} propertyName={propertyName} />
            <InsightHeader kpi={kpi} isLoading={isLoading} />

            {/* Warnings from historical view */}
            {warnings.length > 0 && (
              <div className="text-xs text-warning bg-warning/5 border border-warning/20 rounded-lg px-3 py-1.5">
                {warnings.map((w, i) => <span key={i}>{w}</span>)}
              </div>
            )}

            {/* KPI Row */}
            <KpiRow
              kpi={kpi}
              isLoading={isLoading}
              showRevenue
              showHostCost
              showNights
              showBookings
              showRevenueAdr
              showHostAdr
              showMarginSpread
            />

            {/* Charts Grid */}
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Main Trend Combo Chart (2/3 width) */}
              <div className="lg:col-span-2">
                <TrendComboChart
                  data={timeSeries}
                  comparisonData={comparisonTimeSeries.length > 0 ? comparisonTimeSeries : undefined}
                  comparisonLabel={compLabel}
                  title="Xu hướng doanh thu và ADR"
                  subtitle="Theo ngày trả phòng thực tế"
                  barDataKey="revenueTotal"
                  barLabel="Doanh thu"
                  lineDataKey="revenueAdr"
                  lineLabel="ADR Doanh thu"
                  isLoading={isLoading}
                  height={400}
                />
              </div>

              {/* Ranking Chart */}
              <RankingChart
                data={ranking}
                title={isPropertyMode
                  ? `Top kênh theo doanh thu`
                  : `Top chỗ nghỉ theo doanh thu`}
                metric="revenue"
                isLoading={isLoading}
                showTop
                height={400}
              />
            </div>

            {/* Pivot Table (collapsible) */}
            <DynamicPivotTable
              data={ranking}
              columns={tableColumns}
              title={isPropertyMode ? 'Chi tiết theo kênh' : 'Chi tiết theo chỗ nghỉ'}
              isLoading={isLoading}
            />

            {/* Footer Note — Sprint 3: Standardized disclosure */}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Dữ liệu được tính theo ngày trả phòng thực tế (actual_check_out_at).
              <br />
              Chỉ bao gồm các booking đã hoàn tất lưu trú (CANCELLED / NO_SHOW excluded).
              <br />
              Timezone: Asia/Ho_Chi_Minh.
            </p>
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
