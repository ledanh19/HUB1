/**
 * Host Cost Analytics Page (PURE SUPPLY-SIDE)
 * 
 * Answers "What is our actual host cost structure for executed stays?"
 * Route: /analytics/host-cost
 * 
 * SUPPLY-SIDE SOT: Uses host_supply_segments with actual_check_in_at IS NOT NULL
 * - Host Cost = actual cost incurred for executed stays
 * - Time key = date_from (supply side, when cost is incurred)
 * - Scope = ALL executed segments (not dependent on OTA matching)
 * 
 * NOTE: This page shows PURE HOST COST data.
 * For margin analysis (OTA vs Host), use the Price Spread page.
 * 
 * ENHANCED: Added OTA Sell Price tab for channel performance analysis.
 * 
 * AUDIT PATCHES:
 * - P2-01: Replaced local KpiCard with shared KpiItems
 * - P2-03: Fixed doubled tabular-nums tracking-tight
 * - P2-04: Removed leftover console.log
 * - P2-05: Compacted SOT banners into 1-line collapsible
 * - P3-04: Fixed misleading chart title
 * - P3-05: Added Host Cost % KPI (display-only)
 */

import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Building,
  DollarSign,
  Bed,
  BarChart3,
  Hash,
  Layers,
  ShoppingBag,
  Info,
  Percent,
  ChevronDown,
} from 'lucide-react';
import {
  AnalyticsFilters,
  KpiItems,
  RankingChart,
  OtaSellPriceTable,
  ShareChart,
  DualLineChart,
  InsightHeader,
  ContextSubheader,
} from '@/modules/analytics/components';
import type { KpiItem } from '@/modules/analytics/components';
import {
  useAnalyticsFilters,
  useHistoricalAnalytics,
  useHostCostByRoomType,
  useHostCostTimeSeries,
  useOtaSellPriceByGroup,
  useContextMode,
} from '@/modules/analytics/hooks';
import { formatCurrency, formatNumber, MIN_NIGHTS_FOR_ADR } from '@/modules/analytics/constants';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { useTablePagination } from '@/hooks/useTablePagination';
import { usePrefetchMountLog } from '@/lib/navigation/usePrefetchMountLog';
import { useState } from 'react';

// ============================================================================
// HOST COST TABLE COMPONENT (PURE SUPPLY-SIDE)
// ============================================================================

interface HostCostTableProps {
  data: Array<{
    propertyName: string;
    roomType: string;
    segmentCount: number;
    totalStayNights: number;
    totalHostCost: number;
    adrHost: number | null;
    belowSampleThreshold: boolean;
    hasZeroCost: boolean;
    sharePct: number;
  }>;
  isLoading: boolean;
  title: string;
  subtitle?: string;
}

function HostCostTable({ data, isLoading, title, subtitle }: HostCostTableProps) {
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount } =
    useTablePagination(data, { defaultPageSize: 10, resetDeps: [data.length] });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Không có dữ liệu host cost trong khoảng thời gian đã chọn
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chỗ nghỉ</TableHead>
                    <TableHead>Loại phòng</TableHead>
                    <TableHead className="text-right">Số segments</TableHead>
                    <TableHead className="text-right">Đêm nghỉ</TableHead>
                    <TableHead className="text-right">Host Cost</TableHead>
                    <TableHead className="text-right">ADR Host</TableHead>
                    <TableHead className="text-right">% Tỷ trọng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((row, idx) => (
                    <TableRow key={`${row.propertyName}-${row.roomType}-${idx}`}>
                      <TableCell className="font-medium">
                        {row.propertyName}
                        {row.hasZeroCost && (
                          <Badge variant="outline" className="ml-2 text-xs text-warning">
                            ⚠️ Zero cost
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{row.roomType}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.segmentCount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.totalStayNights)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(row.totalHostCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.belowSampleThreshold ? (
                          <Badge variant="secondary" className="text-xs">N/A</Badge>
                        ) : row.adrHost !== null ? (
                          formatCurrency(row.adrHost)
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.sharePct.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DataTablePagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={data.length}
              displayedItems={displayedCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="host"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function HostCostAnalyticsPage() {
  const { filters } = useAnalyticsFilters();
  const { mode, propertyName } = useContextMode(filters);
  const [sotExpanded, setSotExpanded] = useState(false);

  // Convert selectedIds (property names from filter) to hook options
  const hookOptions = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    granularity: filters.granularity,
    selectedPropertyNames: filters.selectedIds.length > 0 ? filters.selectedIds : undefined,
  };

  // Use PURE SUPPLY-SIDE data - ALL executed segments (not dependent on OTA matching)
  const { data: hostCostData, isLoading: hostCostLoading } = useHostCostByRoomType(hookOptions);
  const { data: hostCostTimeSeries, isLoading: tsLoading } = useHostCostTimeSeries(hookOptions);

  // OTA Sell Price data by Channel (for comparison tab)
  const { data: otaChannelData, isLoading: otaChannelLoading } = useOtaSellPriceByGroup(hookOptions, 'channel');
  const { data: otaPropertyData, isLoading: otaPropertyLoading } = useOtaSellPriceByGroup(hookOptions, 'property');

  usePrefetchMountLog('HostCostAnalyticsPage', [
    { key: ['host-cost-by-room-type'], query: { status: hostCostLoading ? 'loading' : 'success', isFetching: hostCostLoading, dataUpdatedAt: Date.now() } },
  ]);

  const hostKpi = hostCostData?.kpi ?? null;
  const hostCostRows = hostCostData?.data ?? [];
  const timeSeries = hostCostTimeSeries ?? [];

  const otaChannelRows = otaChannelData?.data ?? [];
  const otaPropertyRows = otaPropertyData?.data ?? [];
  const otaKpi = otaChannelData?.kpi ?? null;

  const isLoading = hostCostLoading;

  // ========================================================================
  // Sprint 3: Historical view KPIs (checkout-aligned, matches Overview)
  // ========================================================================
  const historical = useHistoricalAnalytics({
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    granularity: filters.granularity,
    compareMode: 'none',
    propertyId: filters.selectedIds.length === 1 ? filters.selectedIds[0] : null,
  });


  // Transform time series for chart (Host ADR trend only - pure supply side)
  const adrChartData = timeSeries.map(row => ({
    periodKey: row.periodKey,
    periodLabel: row.periodLabel,
    line1Value: row.adrHost,
    line2Value: null, // No OTA data in pure supply-side view
    belowSampleThreshold: row.belowSampleThreshold,
  }));

  // P3-04: Top room types by Host Cost for ranking chart (FIXED TITLE)
  const topByHostCost = [...hostCostRows]
    .sort((a, b) => b.totalHostCost - a.totalHostCost)
    .slice(0, 10)
    .map(r => ({
      label: `${r.propertyName} - ${r.roomType}`,
      value: r.totalHostCost,
      subValue: r.adrHost ? `ADR: ${formatCurrency(r.adrHost)}` : undefined,
    }));

  // Top by ADR Host
  const topByAdrHost = [...hostCostRows]
    .filter(r => r.adrHost !== null)
    .sort((a, b) => (b.adrHost ?? 0) - (a.adrHost ?? 0))
    .slice(0, 10)
    .map(r => ({
      label: r.roomType,
      value: r.adrHost ?? 0,
    }));

  // P2-01: KPI items using shared component (replaces local KpiCard)
  const hostKpiItems: KpiItem[] = [
    {
      label: 'Đêm nghỉ (Executed)',
      value: hostKpi ? formatNumber(hostKpi.totalStayNights) : null,
      icon: <Bed className="h-4 w-4 text-muted-foreground" />,
      subValue: hostKpi ? `${formatNumber(hostKpi.segmentCount)} segments` : undefined,
    },
    {
      label: 'Tổng Host Cost',
      value: hostKpi?.totalHostCost ?? null,
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
      variant: 'highlight',
    },
    {
      label: 'ADR Host',
      value: hostKpi?.adrHost ?? null,
      belowThreshold: hostKpi?.belowSampleThreshold,
      icon: <BarChart3 className="h-4 w-4 text-info" />,
    },
    // P3-05: Host Cost % KPI (display-only, formula unchanged)
    {
      label: 'Host Cost %',
      value: hostKpi && otaKpi && otaKpi.totalRevenue > 0
        ? `${((hostKpi.totalHostCost / otaKpi.totalRevenue) * 100).toFixed(1)}%`
        : '—',
      icon: <Percent className="h-4 w-4 text-muted-foreground" />,
      tooltip: 'Host Cost / OTA Revenue × 100. Cần có dữ liệu OTA Sell Price để tính.',
      subValue: hostKpi ? `${formatNumber(hostKpi.roomTypeCount)} loại phòng · ${formatNumber(hostKpi.propertyCount)} chỗ nghỉ` : undefined,
    },
  ];

  // OTA KPI items using shared component
  const otaKpiItems: KpiItem[] = [
    {
      label: 'Tổng Doanh thu OTA',
      value: otaKpi?.totalRevenue ?? null,
      icon: <DollarSign className="h-4 w-4 text-success" />,
      variant: 'success',
    },
    {
      label: 'Số đêm bán',
      value: otaKpi ? formatNumber(otaKpi.totalNights) : null,
      icon: <Bed className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: 'ADR OTA',
      value: otaKpi?.otaAdr ?? null,
      belowThreshold: otaKpi?.belowSampleThreshold,
      icon: <BarChart3 className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: 'Số kênh',
      value: otaKpi ? formatNumber(otaKpi.channelCount) : null,
      icon: <Hash className="h-4 w-4 text-muted-foreground" />,
      subValue: otaKpi ? `${formatNumber(otaKpi.propertyCount)} chỗ nghỉ` : undefined,
    },
  ];

  // P2-04: console.log removed (was lines ~306-321)

  return (
    <>
      <Header title="Host Cost Analytics" subtitle="Theo ngày trả phòng thực tế (Actual Checkout)" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* Filters */}
            <AnalyticsFilters variant="host-cost" />

            {/* Context + Insight */}
            <ContextSubheader mode={mode} propertyName={propertyName} />

            {/* P2-05: SOT Info Banner - compacted to 1-line collapsible */}
            <div
              className="flex items-center gap-2 text-xs text-info bg-info/5 border border-info/20 rounded-lg px-3 py-1.5 cursor-pointer select-none"
              onClick={() => setSotExpanded(!sotExpanded)}
              role="button"
              tabIndex={0}
            >
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">SUPPLY-SIDE:</span>
              <span className="truncate">Chi phí Host từ lượt lưu trú đã thực hiện</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 ml-auto transition-transform ${sotExpanded ? 'rotate-180' : ''}`} />
            </div>
            {sotExpanded && (
              <div className="text-xs text-info/75 bg-info/5 border border-info/10 rounded-lg px-3 py-2 -mt-2">
                SOT: <code className="mx-1">host_supply_segments</code> với
                <code className="mx-1">actual_check_in_at IS NOT NULL</code>.
                Để phân tích Margin (so sánh OTA vs Host), vui lòng sử dụng trang <strong>Price Spread Analytics</strong>.
              </div>
            )}

            {/* Data Quality Warnings - kept visible but compact */}
            {hostKpi && hostKpi.zeroCostSegments > 0 && (
              <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/20 rounded-lg px-3 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span><strong>Data Quality:</strong> {formatNumber(hostKpi.zeroCostSegments)} segments với chi phí = 0 nhưng có đêm nghỉ.</span>
              </div>
            )}

            {hostKpi && hostKpi.unmappedPropertyCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/20 rounded-lg px-3 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span><strong>Unmapped:</strong> {formatNumber(hostKpi.unmappedPropertyCount)} segments không có host_property_name.</span>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && hostCostRows.length === 0 && (
              <Alert className="bg-muted">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Không có dữ liệu Host Cost</strong> trong khoảng thời gian đã chọn.
                  <br />
                  Điều này có nghĩa là không có segment nào đã check-in thực tế (actual_check_in_at IS NOT NULL) trong khoảng ngày này.
                </AlertDescription>
              </Alert>
            )}

            {/* P2-01: KPI Row using shared KpiItems (replaces local KpiCard) */}
            <KpiItems items={hostKpiItems} isLoading={isLoading} gridClassName="grid-cols-2 md:grid-cols-4" />

            {/* Sprint 3: Historical KPI header (checkout-aligned, matches Overview totals) */}
            {historical.kpi && (
              <div className="bg-muted/30 rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Checkout-aligned</Badge>
                  <span>KPIs khớp với Overview (đảm bảo cùng time key)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Revenue (Net)</span>
                    <p className="font-semibold tabular-nums">{formatCurrency(historical.kpi.revenueTotal)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Host Cost</span>
                    <p className="font-semibold tabular-nums">{formatCurrency(historical.kpi.hostCostTotal)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Host Cost %</span>
                    <p className="font-semibold tabular-nums">
                      {historical.kpi.revenueTotal > 0
                        ? `${((historical.kpi.hostCostTotal / historical.kpi.revenueTotal) * 100).toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Gross Profit</span>
                    <p className="font-semibold tabular-nums">{formatCurrency(historical.kpi.revenueTotal - historical.kpi.hostCostTotal)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tabbed Content: Host Cost vs OTA Sell Price */}
            <Tabs defaultValue="host-cost" className="space-y-4">
              <TabsList>
                <TabsTrigger value="host-cost" className="gap-2">
                  <Building className="h-4 w-4" />
                  Host Cost (Supply-Side)
                </TabsTrigger>
                <TabsTrigger value="ota-sell-price" className="gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  OTA Sell Price (Demand-Side)
                </TabsTrigger>
              </TabsList>

              {/* Host Cost Tab */}
              <TabsContent value="host-cost" className="space-y-4">
                {/* Charts Row */}
                <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                  {/* ADR Host Trend */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Xu hướng ADR Host</CardTitle>
                      <CardDescription>Chi phí Host trung bình mỗi đêm theo thời gian</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {tsLoading ? (
                        <Skeleton className="h-[280px] w-full" />
                      ) : adrChartData.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                          Không có dữ liệu
                        </div>
                      ) : (
                        <DualLineChart
                          data={adrChartData}
                          line1Key="line1Value"
                          line1Label="ADR Host"
                          line1Color="#3b82f6"
                          line2Key="line2Value"
                          line2Label=""
                          line2Color="transparent"
                          xAxisKey="periodLabel"
                          height={280}
                        />
                      )}
                    </CardContent>
                  </Card>

                  {/* P3-04: Fixed title from "Top 10 theo doanh thu" to "Top Loại phòng theo ADR Host" */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Top Loại phòng theo ADR Host
                      </CardTitle>
                      <CardDescription>Room types với chi phí Host cao nhất</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {hostCostLoading ? (
                        <Skeleton className="h-[280px] w-full" />
                      ) : topByAdrHost.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                          Không có dữ liệu
                        </div>
                      ) : (
                        <RankingChart
                          data={topByAdrHost}
                          labelKey="label"
                          valueKey="value"
                          color="#3b82f6"
                          formatValue={(v) => formatCurrency(v)}
                          height={280}
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Property × Room Type Table */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Supply Segments</Badge>
                    <span>Room Type Breakdown — dữ liệu từ host_supply_segments (không checkout-aligned)</span>
                  </div>
                  <HostCostTable
                    data={hostCostRows}
                    isLoading={hostCostLoading}
                    title="Chi phí Host theo Chỗ nghỉ × Loại phòng"
                    subtitle={`${formatNumber(hostKpi?.segmentCount ?? 0)} segments (đêm nghỉ đã thực hiện) trong khoảng thời gian đã chọn`}
                  />
                </div>
              </TabsContent>

              {/* OTA Sell Price Tab */}
              <TabsContent value="ota-sell-price" className="space-y-4">
                {/* P2-01: OTA KPI Summary using shared KpiItems */}
                <KpiItems items={otaKpiItems} isLoading={otaChannelLoading} gridClassName="grid-cols-2 md:grid-cols-4" />

                {/* Channel Share Chart + Property Table */}
                <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                  <ShareChart
                    data={otaChannelRows.slice(0, 8).map(r => ({
                      channelId: r.groupKey,
                      channelName: r.groupName,
                      revenueTotal: r.totalRevenue,
                      sharePct: r.sharePct,
                    }))}
                    title="Tỷ trọng doanh thu theo kênh OTA"
                    subtitle="Top 8 kênh bán"
                    isLoading={otaChannelLoading}
                    height={280}
                  />

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        Top Chỗ nghỉ theo Doanh thu OTA
                      </CardTitle>
                      <CardDescription>Chỗ nghỉ có doanh thu OTA cao nhất</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {otaPropertyLoading ? (
                        <Skeleton className="h-[280px] w-full" />
                      ) : otaPropertyRows.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                          Không có dữ liệu
                        </div>
                      ) : (
                        <RankingChart
                          data={otaPropertyRows.slice(0, 10).map(r => ({
                            label: r.groupName,
                            value: r.totalRevenue,
                          }))}
                          labelKey="label"
                          valueKey="value"
                          color="#3b82f6"
                          formatValue={(v) => formatCurrency(v)}
                          height={280}
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* OTA Sell Price by Channel Table */}
                <OtaSellPriceTable
                  data={otaChannelRows}
                  isLoading={otaChannelLoading}
                  title="OTA Sell Price theo Kênh"
                  subtitle={`${formatNumber(otaKpi?.lineCount ?? 0)} room lines trong khoảng thời gian đã chọn`}
                  groupByLabel="Kênh OTA"
                />

                {/* OTA Sell Price by Property Table */}
                <OtaSellPriceTable
                  data={otaPropertyRows}
                  isLoading={otaPropertyLoading}
                  title="OTA Sell Price theo Chỗ nghỉ"
                  subtitle="Hiệu suất bán từng chỗ nghỉ trên các kênh OTA"
                  groupByLabel="Chỗ nghỉ"
                />
              </TabsContent>
            </Tabs>

            {/* Footer Note — Sprint 3: Standardized disclosure */}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Dữ liệu được tính theo ngày trả phòng thực tế (actual_check_out_at).
              <br />
              Chỉ bao gồm các booking đã hoàn tất lưu trú (CANCELLED / NO_SHOW excluded).
              <br />
              Timezone: Asia/Ho_Chi_Minh. Room Type Breakdown sử dụng segment dates (không checkout-aligned).
            </p>
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
