/**
 * Price Spread Analytics Page
 * 
 * Answers "Which property/room types have good/bad margin for pricing decisions?"
 * Route: /analytics/price-spread
 * 
 * TWO MODES:
 * 1. Executed (default): EXACT matching from executed stays (SOT)
 *    - host_supply_segments.actual_check_in_at IS NOT NULL
 *    - TRUE Price Spread = OTA ADR - Host ADR at room-line level
 * 
 * 2. Forecast (Estimated): Future pricing estimation
 *    - Based on booking pipeline + historical host ADR
 *    - Clearly labeled "EST" - not mixed with executed KPIs
 *    - No occupancy/availability simulation
 * 
 * AUDIT PATCHES:
 * - P2-02: Replaced local KpiCard with shared KpiItems
 * - P2-03: Fixed doubled tabular-nums tracking-tight
 * - P2-05: Compacted SOT banners into 1-line collapsible
 * - P3-02: KPI grid responsive (2/3/6 columns)
 * - P3-03: "0 matched" guidance state
 * - P3-06: Uses price-spread filter variant instead of host-cost
 */

import { useState } from 'react';
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Percent,
  BarChart3,
  Building,
  Layers,
  Hash,
  History,
  CalendarClock,
  ChevronDown,
  Info,
  SearchX,
  Filter,
  RotateCcw,
} from 'lucide-react';
import {
  AnalyticsFilters,
  KpiItems,
  PriceSpreadDecisionTable,
  PriceSpreadForecastTable,
  ContextSubheader,
} from '@/modules/analytics/components';
import type { KpiItem } from '@/modules/analytics/components';
import {
  useAnalyticsFilters,
  useHistoricalAnalytics,
  usePriceSpreadByGroup,
  usePriceSpreadForecast,
  useContextMode,
} from '@/modules/analytics/hooks';
import { formatCurrency, formatNumber, MIN_NIGHTS_FOR_ADR } from '@/modules/analytics/constants';
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PeriodGranularity } from '@/modules/analytics/hooks/usePriceSpreadForecast';
import { usePrefetchMountLog } from '@/lib/navigation/usePrefetchMountLog';

// ============================================================================
// SIGNAL SUMMARY CARDS
// ============================================================================

interface SignalSummaryProps {
  increaseCount: number;
  holdCount: number;
  decreaseCount: number;
  lossCount: number;
  isLoading: boolean;
}

function SignalSummary({ increaseCount, holdCount, decreaseCount, lossCount, isLoading }: SignalSummaryProps) {
  const total = increaseCount + holdCount + decreaseCount;

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      <Card className="border-success/20 bg-success/5">
        <CardContent className="p-4">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-success" />
                <p className="text-xs text-success font-medium">Có thể tăng giá</p>
              </div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-success">{formatNumber(increaseCount)}</p>
              <p className="text-xs text-success">
                {total > 0 ? ((increaseCount / total) * 100).toFixed(1) : 0}% room lines
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-muted">
        <CardContent className="p-4">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Minus className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-foreground font-medium">Giữ giá</p>
              </div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{formatNumber(holdCount)}</p>
              <p className="text-xs text-muted-foreground">
                {total > 0 ? ((holdCount / total) * 100).toFixed(1) : 0}% room lines
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-warning/20 bg-warning/5">
        <CardContent className="p-4">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-warning" />
                <p className="text-xs text-warning font-medium">Cần giảm giá</p>
              </div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-warning">{formatNumber(decreaseCount)}</p>
              <p className="text-xs text-warning">
                {total > 0 ? ((decreaseCount / total) * 100).toFixed(1) : 0}% room lines
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-4">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <p className="text-xs text-destructive font-medium">Đang bán lỗ</p>
              </div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-destructive">{formatNumber(lossCount)}</p>
              <p className="text-xs text-destructive">
                {total > 0 ? ((lossCount / total) * 100).toFixed(1) : 0}% room lines
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// P3-03: ZERO MATCHED GUIDANCE COMPONENT
// ============================================================================

function ZeroMatchedGuidance({
  hasFilters,
  onResetFilters,
}: {
  hasFilters: boolean;
  onResetFilters: () => void;
}) {
  return (
    <Card className="border-dashed border-2 border-muted-foreground/20">
      <CardContent className="p-8 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <SearchX className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-base font-semibold mb-1">Không có dòng matched</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Không tìm thấy dữ liệu Price Spread trong phạm vi đã chọn.
            Điều này có thể do chưa có lượt lưu trú đã thực hiện (actual check-in)
            hoặc chưa match được giữa OTA booking và Host supply segment.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Gợi ý:</p>
          <ul className="text-left space-y-1">
            <li className="flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              Thử đổi khoảng thời gian (mở rộng thêm)
            </li>
            <li className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 shrink-0" />
              Thay đổi loại ngày lọc (Ngày nhận phòng / Ngày trả phòng)
            </li>
            <li className="flex items-center gap-2">
              <Building className="h-3.5 w-3.5 shrink-0" />
              Chọn chỗ nghỉ khác hoặc bỏ bộ lọc chỗ nghỉ
            </li>
            <li className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Kiểm tra host_supply_segments đã có dữ liệu chưa
            </li>
          </ul>
        </div>
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={onResetFilters} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset bộ lọc
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// EXECUTED MODE CONTENT
// ============================================================================

interface ExecutedModeContentProps {
  kpi: any;
  propertyData: any;
  roomTypeData: any;
  channelData: any;
  propertyLoading: boolean;
  roomTypeLoading: boolean;
  channelLoading: boolean;
  filters: any;
  onResetFilters: () => void;
}

function ExecutedModeContent({
  kpi,
  propertyData,
  roomTypeData,
  channelData,
  propertyLoading,
  roomTypeLoading,
  channelLoading,
  filters,
  onResetFilters,
}: ExecutedModeContentProps) {
  const isLoading = propertyLoading;
  const [sotExpanded, setSotExpanded] = useState(false);

  // P2-02: KPI items using shared component (replaces local KpiCard)
  const kpiItems: KpiItem[] = [
    {
      label: 'Matched Lines',
      value: kpi ? formatNumber(kpi.matchedLineCount) : null,
      icon: <Hash className="h-4 w-4 text-muted-foreground" />,
      variant: 'highlight',
      subValue: kpi ? `Match rate: ${kpi.matchRate.toFixed(1)}%` : undefined,
    },
    {
      label: 'Tổng OTA Revenue',
      value: kpi?.totalOtaRevenue ?? null,
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: 'Tổng Host Cost',
      value: kpi?.totalHostCost ?? null,
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: 'ADR OTA',
      value: kpi?.avgOtaAdr ?? null,
      belowThreshold: kpi?.belowSampleThreshold,
      icon: <BarChart3 className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: 'ADR Host',
      value: kpi?.avgHostAdr ?? null,
      belowThreshold: kpi?.belowSampleThreshold,
      icon: <BarChart3 className="h-4 w-4 text-muted-foreground" />,
    },
    {
      label: 'Avg Spread',
      value: kpi?.avgSpread ?? null,
      belowThreshold: kpi?.belowSampleThreshold,
      icon: <Percent className="h-4 w-4 text-muted-foreground" />,
      variant: kpi?.avgSpread !== null && kpi?.avgSpread !== undefined && kpi.avgSpread < 0 ? 'danger' :
        kpi?.avgSpread !== null && kpi?.avgSpread !== undefined && kpi.avgSpread > 50000 ? 'success' : 'default',
      subValue: kpi?.avgSpreadPercent !== null && kpi?.avgSpreadPercent !== undefined
        ? `${kpi.avgSpreadPercent > 0 ? '+' : ''}${kpi.avgSpreadPercent.toFixed(1)}%`
        : undefined,
    },
  ];

  return (
    <>
      {/* P2-05: SOT Info Banner - compacted to 1-line collapsible */}
      <div
        className="flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 cursor-pointer select-none"
        onClick={() => setSotExpanded(!sotExpanded)}
        role="button"
        tabIndex={0}
      >
        <BarChart3 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">EXECUTED STAY ONLY:</span>
        <span className="truncate">Dữ liệu chỉ bao gồm lượt lưu trú đã thực hiện</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 ml-auto transition-transform ${sotExpanded ? 'rotate-180' : ''}`} />
      </div>
      {sotExpanded && (
        <div className="text-xs text-primary/75 bg-primary/5 border border-primary/10 rounded-lg px-3 py-2 -mt-2">
          SOT: <code>host_supply_segments.room_line_index</code> ↔ <code>booking_room_lines_mirror.line_index</code> +
          <code className="ml-1">actual_check_in_at IS NOT NULL</code>.
        </div>
      )}

      {/* Match Rate Warning - kept visible */}
      {kpi && kpi.matchRate < 80 && kpi.matchedLineCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/20 rounded-lg px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Match Rate: {kpi.matchRate.toFixed(1)}%</strong> — {formatNumber(kpi.matchedLineCount)} matched,
            {' '}{formatNumber(kpi.unmatchedOtaLineCount)} OTA chưa có host cost,
            {' '}{formatNumber(kpi.unmatchedHostSegmentCount)} host chưa có OTA.
          </span>
        </div>
      )}

      {/* P3-03: Empty state with guidance */}
      {!isLoading && (!kpi || kpi.matchedLineCount === 0) && (
        <ZeroMatchedGuidance
          hasFilters={filters.selectedIds.length > 0}
          onResetFilters={onResetFilters}
        />
      )}

      {/* P2-02 + P3-02: KPI Row using shared KpiItems with responsive grid */}
      <KpiItems
        items={kpiItems}
        isLoading={isLoading}
        gridClassName="grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
      />

      {/* Signal Summary Cards */}
      <SignalSummary
        increaseCount={kpi?.increaseCount ?? 0}
        holdCount={kpi?.holdCount ?? 0}
        decreaseCount={kpi?.decreaseCount ?? 0}
        lossCount={kpi?.lossCount ?? 0}
        isLoading={isLoading}
      />

      {/* Decision Tables by Dimension */}
      <Tabs defaultValue="property" className="space-y-4">
        <TabsList>
          <TabsTrigger value="property" className="gap-2">
            <Building className="h-4 w-4" />
            Theo Chỗ nghỉ
          </TabsTrigger>
          <TabsTrigger value="roomType" className="gap-2">
            <Layers className="h-4 w-4" />
            Theo Loại phòng
          </TabsTrigger>
          <TabsTrigger value="channel" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Theo Kênh OTA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="property">
          <PriceSpreadDecisionTable
            data={propertyData?.data ?? []}
            isLoading={propertyLoading}
            title="Price Spread theo Chỗ nghỉ"
            subtitle={`${kpi?.propertyCount ?? 0} chỗ nghỉ có dữ liệu matched`}
          />
        </TabsContent>

        <TabsContent value="roomType">
          <PriceSpreadDecisionTable
            data={roomTypeData?.data ?? []}
            isLoading={roomTypeLoading}
            title="Price Spread theo Loại phòng"
            subtitle={`${kpi?.roomTypeCount ?? 0} loại phòng có dữ liệu matched`}
          />
        </TabsContent>

        <TabsContent value="channel">
          <PriceSpreadDecisionTable
            data={channelData?.data ?? []}
            isLoading={channelLoading}
            title="Price Spread theo Kênh OTA"
            subtitle={`${kpi?.channelCount ?? 0} kênh OTA có dữ liệu matched`}
          />
        </TabsContent>
      </Tabs>

      {/* Footer Note */}
      <p className="text-xs text-muted-foreground text-center">
        EXACT Price Spread: ADR OTA từ booking_room_lines_mirror.amount, ADR Host từ host_supply_segments.total_amount.
        Matched by unified_booking_id + room_line_index.
        Signal: INCREASE (Spread &gt; 50k), HOLD (0-50k), DECREASE (&lt; 0).
      </p>
    </>
  );
}

// ============================================================================
// FORECAST MODE CONTENT
// ============================================================================

interface ForecastModeContentProps {
  forecastData: { rows: any[]; kpi: any } | undefined;
  forecastLoading: boolean;
  forecastStart: string;
  forecastEnd: string;
  granularity: PeriodGranularity;
  onGranularityChange: (value: PeriodGranularity) => void;
}

function ForecastModeContent({
  forecastData,
  forecastLoading,
  forecastStart,
  forecastEnd,
  granularity,
  onGranularityChange,
}: ForecastModeContentProps) {
  const granularityLabels: Record<PeriodGranularity, string> = {
    month: 'Theo tháng',
    week: 'Theo tuần',
    day: 'Theo ngày',
  };

  return (
    <>
      {/* Forecast Period Info + Granularity Selector */}
      <Alert className="bg-warning/5 border-warning/20">
        <div className="flex items-start justify-between w-full">
          <div className="flex items-start gap-2">
            <CalendarClock className="h-4 w-4 text-warning mt-0.5" />
            <AlertDescription className="text-xs text-warning">
              <strong>FORECAST MODE (Estimated):</strong> Dữ liệu dự báo từ {forecastStart} đến {forecastEnd}.
              <br />
              <span className="opacity-75">
                Dựa trên booking pipeline + ADR host lịch sử. Không bao gồm host availability.
              </span>
            </AlertDescription>
          </div>

          {/* Granularity Selector */}
          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs text-warning whitespace-nowrap">Chi tiết:</span>
            <Select value={granularity} onValueChange={(v) => onGranularityChange(v as PeriodGranularity)}>
              <SelectTrigger className="h-7 w-[120px] text-xs bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">📅 Tháng</SelectItem>
                <SelectItem value="week">📆 Tuần</SelectItem>
                <SelectItem value="day">📌 Ngày</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Alert>

      {/* Forecast Table */}
      <PriceSpreadForecastTable
        data={forecastData?.rows ?? []}
        kpi={forecastData?.kpi ?? null}
        isLoading={forecastLoading}
        title={`Dự báo Price Spread (3 tháng tới) - ${granularityLabels[granularity]}`}
      />

      {/* Footer Note */}
      <p className="text-xs text-muted-foreground text-center">
        <strong>Lưu ý:</strong> Forecast dựa trên booking pipeline và ADR host lịch sử.
        Suggested % chỉ mang tính tham khảo, cần xem xét thêm các yếu tố thị trường.
      </p>
    </>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

type AnalyticsMode = 'executed' | 'forecast';

export default function PriceSpreadAnalyticsPage() {
  const [mode, setMode] = useState<AnalyticsMode>('executed');
  const [forecastGranularity, setForecastGranularity] = useState<PeriodGranularity>('month');
  const { filters, resetFilters } = useAnalyticsFilters();
  const { mode: contextMode, propertyName } = useContextMode(filters);

  // Executed mode options (past data)
  const executedOptions = {
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    granularity: filters.granularity,
    selectedPropertyNames: filters.selectedIds.length > 0 ? filters.selectedIds : undefined,
    dateFilterType: filters.dateFilterType,
  };

  // Forecast mode options (future data - next 3 months)
  const now = new Date();
  const forecastStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const forecastEnd = format(endOfMonth(addMonths(now, 3)), 'yyyy-MM-dd');
  const forecastOptions = {
    dateStart: forecastStart,
    dateEnd: forecastEnd,
    selectedPropertyNames: filters.selectedIds.length > 0 ? filters.selectedIds : undefined,
    groupBy: 'propertyRoomType' as const,
    periodGranularity: forecastGranularity,
  };

  // Fetch executed data
  const { data: propertyData, isLoading: propertyLoading } = usePriceSpreadByGroup(
    executedOptions,
    'property',
  );
  const { data: roomTypeData, isLoading: roomTypeLoading } = usePriceSpreadByGroup(
    executedOptions,
    'roomType',
  );
  const { data: channelData, isLoading: channelLoading } = usePriceSpreadByGroup(
    executedOptions,
    'channel',
  );

  // Fetch forecast data
  const { data: forecastData, isLoading: forecastLoading } = usePriceSpreadForecast(forecastOptions);

  usePrefetchMountLog('PriceSpreadAnalyticsPage', [
    { key: ['price-spread-by-group', 'property'], query: { status: propertyLoading ? 'loading' : 'success', isFetching: propertyLoading, dataUpdatedAt: Date.now() } },
  ]);

  // Use property data for KPI (executed mode)
  const kpi = propertyData?.kpi ?? null;

  // Sprint 3: Historical KPI header (checkout-aligned)
  const historical = useHistoricalAnalytics({
    dateStart: filters.dateStart,
    dateEnd: filters.dateEnd,
    granularity: filters.granularity,
    compareMode: 'none',
    propertyId: filters.selectedIds.length === 1 ? filters.selectedIds[0] : null,
  });

  // Coverage indicator: how much of historical revenue is matched
  const matchedOtaRevenue = kpi?.totalOtaRevenue ?? 0;
  const historicalRevenue = historical.kpi?.revenueTotal ?? 0;
  const coveragePct = historicalRevenue > 0
    ? Math.min(100, (matchedOtaRevenue / historicalRevenue) * 100)
    : 0;

  return (
    <>
      <Header title="Price Spread Analytics" subtitle="Theo ngày trả phòng thực tế (Actual Checkout)" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex justify-end">
              <ToggleGroup
                type="single"
                value={mode}
                onValueChange={(v) => v && setMode(v as AnalyticsMode)}
                className="border rounded-lg p-1"
              >
                <ToggleGroupItem value="executed" aria-label="Executed Mode" className="gap-2 px-4">
                  <History className="h-4 w-4" />
                  <span className="hidden sm:inline">Đã thực hiện</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="forecast" aria-label="Forecast Mode" className="gap-2 px-4">
                  <CalendarClock className="h-4 w-4" />
                  <span className="hidden sm:inline">Dự báo</span>
                  <Badge variant="outline" className="text-micro px-1 py-0 bg-warning/5 text-warning border-warning/30">
                    EST
                  </Badge>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* P3-06: Use price-spread filter variant instead of host-cost */}
            <AnalyticsFilters
              variant="price-spread"
              showDateRange={mode === 'executed'}
              showGranularity={mode === 'executed'}
            />

            {/* Context Mode */}
            <ContextSubheader mode={contextMode} propertyName={propertyName} />

            {/* Sprint 3: Historical KPI header (checkout-aligned) + coverage indicator */}
            {mode === 'executed' && historical.kpi && (
              <div className="bg-muted/30 rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">Checkout-aligned</Badge>
                    <span>KPIs khớp với Overview page</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Matched coverage:</span>
                    <Badge
                      variant={coveragePct >= 80 ? 'default' : 'secondary'}
                      className={`text-[10px] px-1.5 py-0 ${coveragePct < 50 ? 'bg-warning/20 text-warning' : ''}`}
                      title="Price spread calculations only include room lines with exact host-segment matches."
                    >
                      {coveragePct.toFixed(0)}% of revenue
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Revenue (Actual Checkout)</span>
                    <p className="font-semibold tabular-nums">{formatCurrency(historical.kpi.revenueTotal)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Host Cost</span>
                    <p className="font-semibold tabular-nums">{formatCurrency(historical.kpi.hostCostTotal)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Spread</span>
                    <p className="font-semibold tabular-nums">{formatCurrency(historical.kpi.revenueTotal - historical.kpi.hostCostTotal)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Mode-specific Content */}
            {mode === 'executed' ? (
              <ExecutedModeContent
                kpi={kpi}
                propertyData={propertyData}
                roomTypeData={roomTypeData}
                channelData={channelData}
                propertyLoading={propertyLoading}
                roomTypeLoading={roomTypeLoading}
                channelLoading={channelLoading}
                filters={filters}
                onResetFilters={resetFilters}
              />
            ) : (
              <ForecastModeContent
                forecastData={forecastData}
                forecastLoading={forecastLoading}
                forecastStart={forecastStart}
                forecastEnd={forecastEnd}
                granularity={forecastGranularity}
                onGranularityChange={setForecastGranularity}
              />
            )}

            {/* Footer Note — Sprint 3: Standardized disclosure */}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Dữ liệu được tính theo ngày trả phòng thực tế (actual_check_out_at).
              <br />
              Chỉ bao gồm các booking đã hoàn tất lưu trú (CANCELLED / NO_SHOW excluded).
              <br />
              Timezone: Asia/Ho_Chi_Minh. Price Spread sử dụng room-line level EXACT matching.
            </p>
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
