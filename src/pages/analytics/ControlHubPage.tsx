/**
 * Control Hub Analytics Page (4-Tab Hub)
 * 
 * Central hub for all analytics with 4 integrated tabs:
 * 1. Executive Overview - High-level snapshot
 * 2. Revenue & Demand - Channel/property/area revenue analysis
 * 3. Host Cost (Actual Stay) - Supply-side cost tracking  
 * 4. Price Spread (EXACT) - Margin analysis with decision signals
 * 
 * Route: /analytics/hub
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building,
  DollarSign,
  GitCompare,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { KPIGrid } from '@/components/kpi/KPIGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AnalyticsFilters,
  KpiRow,
  TrendComboChart,
  ShareChart,
  RankingChart,
  PriceSpreadDecisionTable,
  InsightHeader,
  ContextSubheader,
} from '@/modules/analytics/components';
import {
  useAnalyticsFilters,
  useAnalyticsTimeSeries,
  useAnalyticsChannelShare,
  useAnalyticsPivotRanking,
  useHostCostByRoomType,
  useHostCostTimeSeries,
  usePriceSpreadByGroup,
  useContextMode,
} from '@/modules/analytics/hooks';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  RANKING_CHART_LIMIT,
} from '@/modules/analytics/constants';

// ============================================================================
// TAB TYPES
// ============================================================================

type TabValue = 'executive' | 'revenue' | 'host-cost' | 'price-spread';

// ============================================================================
// EXECUTIVE TAB CONTENT
// ============================================================================

function ExecutiveTab() {
  const { filters, buildAnalyticsUrl } = useAnalyticsFilters();
  const { mode, propertyName } = useContextMode(filters);
  const { data: timeSeriesData, isLoading } = useAnalyticsTimeSeries(filters);

  const kpi = timeSeriesData?.totalKpi ?? null;
  const timeSeries = timeSeriesData?.data ?? [];

  const insightRevenue = kpi?.revenuePop !== null && kpi?.revenuePop !== undefined
    ? kpi.revenuePop > 0
      ? `Tăng ${formatPercent(kpi.revenuePop)} so với kỳ trước`
      : `Giảm ${formatPercent(Math.abs(kpi.revenuePop))} so với kỳ trước`
    : null;

  const insightSpread = kpi?.marginSpread !== null && kpi?.marginSpread !== undefined
    ? kpi.marginSpread < 0
      ? `⚠️ Biên âm ${formatCurrency(kpi.marginSpread)}`
      : `Biên dương ${formatCurrency(kpi.marginSpread)}`
    : null;

  return (
    <div className="space-y-4">
      {/* Context + Insight */}
      <ContextSubheader mode={mode} propertyName={propertyName} />
      <InsightHeader kpi={kpi} isLoading={isLoading} />

      {/* KPI Row - P1-03: Use compact formatting to prevent truncation */}
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
        compact
      />

      {/* Insights Banner */}
      {!isLoading && (insightRevenue || insightSpread) && (
        <div className="grid gap-4 md:grid-cols-2">
          {insightRevenue && (
            <Card className={kpi?.revenuePop && kpi.revenuePop >= 0 ? 'border-success/20 bg-success/10' : 'border-warning/20 bg-warning/10'}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  {kpi?.revenuePop && kpi.revenuePop >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-success" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-warning" />
                  )}
                  <span className="text-sm font-medium">Doanh thu {insightRevenue}</span>
                </div>
              </CardContent>
            </Card>
          )}
          {insightSpread && (
            <Card className={kpi?.marginSpread && kpi.marginSpread >= 0 ? 'border-success/20 bg-success/10' : 'border-destructive/20 bg-destructive/10'}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  {kpi?.marginSpread && kpi.marginSpread >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-success" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  )}
                  <span className="text-sm font-medium">{insightSpread}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Revenue Trend Chart */}
      <TrendComboChart
        data={timeSeries}
        title="Xu hướng doanh thu 12 kỳ gần nhất"
        barDataKey="revenueTotal"
        barLabel="Doanh thu"
        lineDataKey="revenueAdr"
        lineLabel="ADR"
        isLoading={isLoading}
        height={280}
      />

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <QuickLinkCard
          title="Revenue Analytics"
          description="Chi tiết doanh thu theo kênh/property"
          icon={DollarSign}
          href={buildAnalyticsUrl('/analytics/revenue')}
          trend={kpi?.revenuePop}
        />
        <QuickLinkCard
          title="Host Cost Analytics"
          description="Chi phí host theo loại phòng"
          icon={Building}
          href={buildAnalyticsUrl('/analytics/host-cost')}
          trend={kpi?.hostAdrPop}
        />
        <QuickLinkCard
          title="Price Spread Analytics"
          description="Biên lợi nhuận & quyết định giá"
          icon={GitCompare}
          href={buildAnalyticsUrl('/analytics/price-spread')}
          trend={kpi?.marginSpread !== null && kpi?.marginSpread !== undefined
            ? (kpi.marginSpread > 0 ? 1 : kpi.marginSpread < 0 ? -1 : 0)
            : null}
        />
      </div>
    </div>
  );
}

function QuickLinkCard({
  title,
  description,
  icon: Icon,
  href,
  trend
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  trend?: number | null;
}) {
  return (
    <Card className="group hover:border-primary/50 transition-colors cursor-pointer">
      <Link to={href}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            {trend !== null && trend !== undefined && (
              <div className={`flex items-center gap-1 text-xs ${trend >= 0 ? 'text-success' : 'text-destructive'}`}>
                {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              </div>
            )}
          </div>
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
          <div className="flex items-center gap-1 text-xs text-primary mt-2 group-hover:underline">
            Xem chi tiết <ChevronRight className="h-3 w-3" />
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

// ============================================================================
// REVENUE TAB CONTENT
// ============================================================================

function RevenueTab() {
  const { filters } = useAnalyticsFilters();
  const { data: timeSeriesData, isLoading: tsLoading } = useAnalyticsTimeSeries(filters);
  const { data: channelShareData, isLoading: shareLoading } = useAnalyticsChannelShare(filters);
  const { data: rankingData, isLoading: rankLoading } = useAnalyticsPivotRanking(
    { ...filters, pivot: 'property' },
    'revenue',
    5,
    'desc'
  );

  const kpi = timeSeriesData?.totalKpi ?? null;
  const timeSeries = timeSeriesData?.data ?? [];
  const channelShare = channelShareData?.data ?? [];
  const ranking = rankingData?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Compact KPI */}
      <KpiRow
        kpi={kpi}
        isLoading={tsLoading}
        showRevenue
        showNights
        showBookings
        showRevenueAdr
        showHostCost={false}
        showHostAdr={false}
        showMarginSpread={false}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Channel Share */}
        <ShareChart
          data={channelShare}
          title="Tỷ trọng doanh thu theo kênh"
          subtitle="Top 8 + Khác"
          isLoading={shareLoading}
          height={280}
        />

        {/* Top Properties */}
        <RankingChart
          data={ranking}
          title="Top 5 chỗ nghỉ theo doanh thu"
          subtitle="Trong khoảng thời gian đã chọn"
          metric="revenue"
          isLoading={rankLoading}
          showTop
        />
      </div>

      {/* Trend */}
      <TrendComboChart
        data={timeSeries}
        title="Xu hướng doanh thu theo thời gian"
        barDataKey="revenueTotal"
        barLabel="Doanh thu"
        lineDataKey="revenueAdr"
        lineLabel="ADR Doanh thu"
        isLoading={tsLoading}
        height={260}
      />

      {/* View Details Link */}
      <div className="text-center">
        <Button variant="outline" asChild>
          <Link to="/analytics/revenue">
            Xem chi tiết Revenue Analytics
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// HOST COST TAB CONTENT
// ============================================================================

function HostCostTab() {
  const { filters } = useAnalyticsFilters();

  const hookOptions = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    granularity: filters.granularity,
    selectedPropertyNames: filters.selectedIds.length > 0 ? filters.selectedIds : undefined,
  };

  const { data: roomTypeData, isLoading: rtLoading } = useHostCostByRoomType(hookOptions);
  const { data: timeSeriesData, isLoading: tsLoading } = useHostCostTimeSeries(hookOptions);

  const kpi = roomTypeData?.kpi ?? null;
  const timeSeries = timeSeriesData ?? [];
  const topRoomTypes = roomTypeData?.data.slice(0, 5) ?? [];

  // Transform for chart
  const chartData = timeSeries.map(row => ({
    periodStart: row.periodKey,
    periodLabel: row.periodLabel,
    hostCostTotal: row.totalHostCost,
    hostAdr: row.adrHost,
    belowSampleThreshold: row.belowSampleThreshold,
    revenueTotal: 0,
    nightsTotal: row.totalStayNights,
    bookingsCount: 0,
    revenueAdr: null,
    marginSpread: null,
  }));

  return (
    <div className="space-y-4">
      {/* Data Source Note */}
      <Alert className="bg-info/10 border-info/20">
        <BarChart3 className="h-4 w-4 text-info" />
        <AlertDescription className="text-xs text-info">
          <strong>SOT:</strong> host_supply_segments (segment-level cost). Dữ liệu từ 13/12/2025.
        </AlertDescription>
      </Alert>

      {/* KPI Cards */}
      <KPIGrid columns={4}>
        <MetricCard
          title="Tổng chi phí Host"
          value={rtLoading ? '—' : formatCurrency(kpi?.totalHostCost ?? 0)}
          tone="primary"
          className="border-primary/50 bg-primary/5"
        />
        <MetricCard
          title="Số đêm lưu trú"
          value={rtLoading ? '—' : formatNumber(kpi?.totalStayNights ?? 0)}
        />
        <MetricCard
          title="ADR Host"
          value={rtLoading ? '—' : (kpi?.adrHost !== null ? formatCurrency(kpi?.adrHost ?? 0) : '—')}
        />
        <MetricCard
          title="Số loại phòng"
          value={rtLoading ? '—' : formatNumber(kpi?.roomTypeCount ?? 0)}
        />
      </KPIGrid>

      {/* Trend Chart - BUG 5 FIX: Show empty state if no data */}
      {tsLoading ? (
        <Skeleton className="h-[260px] w-full" />
      ) : chartData.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Xu hướng chi phí Host</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] flex items-center justify-center text-muted-foreground">
              Chưa đủ dữ liệu theo thời gian (kiểm tra ngày có host_supply_segments)
            </div>
          </CardContent>
        </Card>
      ) : (
        <TrendComboChart
          data={chartData}
          title="Xu hướng chi phí Host"
          barDataKey="hostCostTotal"
          barLabel="Chi phí Host"
          lineDataKey="hostAdr"
          lineLabel="ADR Host"
          isLoading={false}
          height={260}
        />
      )}

      {/* Top Room Types Table - BUG 6 FIX: Title matches content (Property × Room Type) */}
      {topRoomTypes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top 5 chỗ nghỉ × loại phòng theo chi phí</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topRoomTypes.map((row, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div>
                    <span className="font-medium text-sm">{row.propertyName}</span>
                    <span className="text-muted-foreground text-xs ml-2">• {row.roomType}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-sm">{formatCurrency(row.totalHostCost)}</span>
                    <span className="text-muted-foreground text-xs ml-2">
                      ADR: {row.adrHost !== null ? formatCurrency(row.adrHost) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Details */}
      <div className="text-center">
        <Button variant="outline" asChild>
          <Link to="/analytics/host-cost">
            Xem chi tiết Host Cost Analytics
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// PRICE SPREAD TAB CONTENT
// ============================================================================

function PriceSpreadTab() {
  const { filters } = useAnalyticsFilters();

  const hookOptions = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    granularity: filters.granularity,
    selectedPropertyNames: filters.selectedIds.length > 0 ? filters.selectedIds : undefined,
  };

  const { data: propertyData, isLoading } = usePriceSpreadByGroup(hookOptions, 'property');
  const kpi = propertyData?.kpi ?? null;

  // Signal counts
  const increaseCount = kpi?.increaseCount ?? 0;
  const holdCount = kpi?.holdCount ?? 0;
  const decreaseCount = kpi?.decreaseCount ?? 0;
  const lossCount = kpi?.lossCount ?? 0;

  return (
    <div className="space-y-4">
      {/* EXACT Matching Note */}
      <Alert className="bg-info/10 border-info/20">
        <GitCompare className="h-4 w-4 text-info" />
        <AlertDescription className="text-xs text-info">
          <strong>EXACT Matching:</strong> segment.room_line_index ↔ room_line.line_index.
          Match rate: {kpi?.matchRate?.toFixed(1) ?? 0}%
        </AlertDescription>
      </Alert>

      {/* Signal Summary */}
      <KPIGrid columns={4}>
        <MetricCard
          title="Có thể tăng giá"
          value={formatNumber(increaseCount)}
          icon={TrendingUp}
          tone="success"
          className="border-success/20 bg-success/10"
        />
        <MetricCard
          title="Giữ giá"
          value={formatNumber(holdCount)}
          icon={BarChart3}
          className="border-border bg-muted"
        />
        <MetricCard
          title="Cần review"
          value={formatNumber(decreaseCount)}
          icon={TrendingDown}
          tone="warning"
          className="border-warning/20 bg-warning/10"
        />
        <MetricCard
          title="Đang bán lỗ"
          value={formatNumber(lossCount)}
          icon={AlertTriangle}
          tone="danger"
          className="border-destructive/20 bg-destructive/10"
        />
      </KPIGrid>

      {/* Quick KPIs */}
      <KPIGrid columns={3}>
        <MetricCard
          title="ADR OTA"
          value={kpi?.avgOtaAdr !== null ? formatCurrency(kpi?.avgOtaAdr ?? 0) : '—'}
        />
        <MetricCard
          title="ADR Host"
          value={kpi?.avgHostAdr !== null ? formatCurrency(kpi?.avgHostAdr ?? 0) : '—'}
        />
        <MetricCard
          title="Avg Spread"
          value={kpi?.avgSpread !== null && kpi?.avgSpread !== undefined ? formatCurrency(kpi.avgSpread) : '—'}
          tone={kpi?.avgSpread !== null && kpi?.avgSpread !== undefined && kpi.avgSpread < 0 ? 'danger' : 'success'}
          className={kpi?.avgSpread !== null && kpi?.avgSpread !== undefined && kpi.avgSpread < 0 ? 'border-destructive/20 bg-destructive/10' : 'border-success/20 bg-success/10'}
        />
      </KPIGrid>

      {/* Top 5 Decision Table */}
      <PriceSpreadDecisionTable
        data={propertyData?.data.slice(0, 5) ?? []}
        isLoading={isLoading}
        title="Top 5 chỗ nghỉ cần chú ý"
        subtitle="Sắp xếp theo doanh thu OTA"
      />

      {/* View Details */}
      <div className="text-center">
        <Button variant="outline" asChild>
          <Link to="/analytics/price-spread">
            Xem chi tiết Price Spread Analytics
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN HUB PAGE
// ============================================================================

export default function ControlHubAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>('executive');

  return (
    <>
      <Header title="Analytics Control Hub" subtitle="Trung tâm phân tích" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* Unified Filter Bar */}
            <AnalyticsFilters variant="overview" />

            {/* Tab Navigation */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="space-y-4">
              <TabsList className="grid grid-cols-4 w-full max-w-xl">
                <TabsTrigger value="executive" className="gap-2 text-xs sm:text-sm">
                  <BarChart3 className="h-4 w-4 hidden sm:block" />
                  Executive
                </TabsTrigger>
                <TabsTrigger value="revenue" className="gap-2 text-xs sm:text-sm">
                  <DollarSign className="h-4 w-4 hidden sm:block" />
                  Revenue
                </TabsTrigger>
                <TabsTrigger value="host-cost" className="gap-2 text-xs sm:text-sm">
                  <Building className="h-4 w-4 hidden sm:block" />
                  Host Cost
                </TabsTrigger>
                <TabsTrigger value="price-spread" className="gap-2 text-xs sm:text-sm">
                  <GitCompare className="h-4 w-4 hidden sm:block" />
                  Price Spread
                </TabsTrigger>
              </TabsList>

              <TabsContent value="executive">
                <ExecutiveTab />
              </TabsContent>

              <TabsContent value="revenue">
                <RevenueTab />
              </TabsContent>

              <TabsContent value="host-cost">
                <HostCostTab />
              </TabsContent>

              <TabsContent value="price-spread">
                <PriceSpreadTab />
              </TabsContent>
            </Tabs>

            {/* Footer */}
            <p className="text-xs text-muted-foreground text-center">
              Dữ liệu dựa trên ngày check-in. ADR = Average Daily Rate tính theo đêm lưu trú.
              Host Cost từ host_supply_segments (có từ 13/12/2025).
            </p>
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
