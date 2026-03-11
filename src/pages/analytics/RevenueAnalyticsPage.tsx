/**
 * Revenue Analytics Page (Sprint 3 — Actual Checkout Refactor)
 *
 * REFACTORED: Now reads from analytics_historical_daily_v via useHistoricalAnalytics().
 * TIME KEY: actual_check_out_at (revenue recognized at checkout).
 *
 * Route: /analytics/revenue
 *
 * NOTE: futureMonths is removed — this page shows only ACTUALIZED revenue
 * from completed stays. Forward OTB is Sprint 4 scope.
 */

import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import {
  AnalyticsFilters,
  KpiRow,
  TrendComboChart,
  RankingChart,
  ShareChart,
  RankingTable,
  InsightHeader,
  ContextSubheader,
} from '@/modules/analytics/components';
import {
  useAnalyticsFilters,
  useHistoricalAnalytics,
  useContextMode,
} from '@/modules/analytics/hooks';
import { PIVOT_LABELS, RANKING_CHART_LIMIT } from '@/modules/analytics/constants';
import { usePrefetchMountLog } from '@/lib/navigation/usePrefetchMountLog';

export default function RevenueAnalyticsPage() {
  // Sprint 3: No futureMonths — historical view shows only completed stays
  const { filters } = useAnalyticsFilters();
  const { mode, propertyName } = useContextMode(filters);

  const {
    kpi,
    timeSeries,
    comparisonTimeSeries,
    propertyRanking,
    channelRanking,
    channelShare,
    isLoading,
  } = useHistoricalAnalytics({
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    granularity: filters.granularity,
    compareMode: filters.compareMode,
    propertyId: filters.selectedIds.length === 1 ? filters.selectedIds[0] : null,
  });

  usePrefetchMountLog('RevenueAnalyticsPage', [
    { key: ['historical-analytics'], query: { status: isLoading ? 'loading' : 'success', isFetching: isLoading, dataUpdatedAt: Date.now() } },
  ]);

  const compLabel = filters.compareMode === 'yoy' ? 'Năm ngoái' : 'Kỳ trước';
  const showChannelShare = filters.pivot === 'all' || filters.pivot === 'channel';
  const pivotLabel = PIVOT_LABELS[filters.pivot] || 'Pivot';

  // Use appropriate ranking based on pivot
  const ranking = filters.pivot === 'channel' ? channelRanking
    : filters.pivot === 'property' ? propertyRanking
      : propertyRanking;

  return (
    <>
      <Header title="Revenue (Actual Checkout)" subtitle="Phân tích doanh thu theo ngày trả phòng thực tế" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* Filters - Revenue: Full pivot options (all/channel/property/area) */}
            <AnalyticsFilters variant="revenue" />

            {/* Context + Insight */}
            <ContextSubheader mode={mode} propertyName={propertyName} />
            <InsightHeader kpi={kpi} isLoading={isLoading} />

            {/* KPI Row */}
            <KpiRow
              kpi={kpi}
              isLoading={isLoading}
              showRevenue
              showHostCost={false}
              showNights
              showBookings
              showRevenueAdr
              showHostAdr={false}
              showMarginSpread={false}
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
                  height={320}
                />
              </div>

              {/* Channel Share (1/3 width) */}
              {showChannelShare && (
                <ShareChart
                  data={channelShare}
                  title="Tỷ trọng doanh thu theo kênh"
                  subtitle="Top 8 kênh + Khác"
                  isLoading={isLoading}
                  height={320}
                />
              )}

              {/* Ranking Chart — visible when pivot is not all */}
              {filters.pivot !== 'all' && (
                <RankingChart
                  data={ranking}
                  title={`Top ${RANKING_CHART_LIMIT} theo doanh thu`}
                  subtitle={`Theo ${pivotLabel.toLowerCase()}`}
                  metric="revenue"
                  isLoading={isLoading}
                  showTop
                />
              )}
            </div>

            {/* Ranking Table */}
            {filters.pivot !== 'all' && (
              <RankingTable
                data={ranking}
                title={`Bảng xếp hạng ${pivotLabel.toLowerCase()}`}
                subtitle={`Top ${RANKING_CHART_LIMIT} theo doanh thu trong khoảng thời gian đã chọn`}
                isLoading={isLoading}
                showRevenue
                showHostCost={false}
                showNights
                showBookings
                showRevenueAdr
                showHostAdr={false}
                showMarginSpread={false}
                showShare
              />
            )}

            {/* Empty state for 'all' pivot */}
            {filters.pivot === 'all' && (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                <p>Chọn pivot (Kênh bán / Chỗ nghỉ / Khu vực) để xem bảng xếp hạng chi tiết.</p>
              </div>
            )}

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
