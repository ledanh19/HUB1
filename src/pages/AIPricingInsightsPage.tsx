import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  Calendar,
  BarChart3,
  Target,
  Clock,
  Percent,
  ArrowUp,
  ArrowDown,
  Minus,
  RefreshCw,
  Info,
  CheckCircle2,
  XCircle,
  Zap,
  ShieldCheck,
  ExternalLink,
  Filter,
  ChevronRight
} from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  useAnGiaPropertiesForPricing,
  useRoomTypesForPricing,
  useAIPricingInsights,
  CalendarDay,
  DemandSignal,
  PricingSignal,
  AlertType,
  BASELINE_WINDOWS,
  InsightState,
} from "@/hooks/useAIPricingInsights";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip as RechartsTooltip
} from "recharts";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAIPricingShadowLog } from "@/hooks/useAIPricingShadowLog";
import { AIPricingHelpGuide, METRIC_TOOLTIPS } from "@/components/ai-pricing/AIPricingHelpGuide";

export default function AIPricingInsightsPage() {
  // Context configuration state
  const [selectedMappingId, setSelectedMappingId] = useState<string>("");
  const [selectedRoomType, setSelectedRoomType] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("30");
  const [baselineWeeks, setBaselineWeeks] = useState<number>(8);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  // "Lọc ngày" should filter to the specific affected dates of the clicked alert
  const [dateFilterDates, setDateFilterDates] = useState<string[] | null>(null);
  const [alertFilter, setAlertFilter] = useState<AlertType | 'all'>('all');

  // Fetch real data
  const { data: properties, isLoading: propertiesLoading } = useAnGiaPropertiesForPricing();
  const selectedProperty = properties?.find(p => p.id === selectedMappingId);

  const { data: roomTypes, isLoading: roomTypesLoading } = useRoomTypesForPricing(
    selectedProperty?.channex_property_id
  );
  const { data: insightsData, isLoading: insightsLoading, refetch, dataUpdatedAt } = useAIPricingInsights(
    selectedMappingId || undefined,
    selectedProperty?.channex_property_id,
    selectedRoomType === 'all' ? undefined : selectedRoomType,
    parseInt(dateRange),
    baselineWeeks
  );

  // Fallback: if the computed currentRate is missing for a specific day, fetch day-rate directly.
  const { data: selectedDayRate } = useQuery({
    queryKey: [
      'ai-pricing-insights-day-rate',
      selectedMappingId,
      selectedDay?.dateStr,
      selectedRoomType,
    ],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: !!selectedDay && !!selectedMappingId,
    queryFn: async () => {
      if (!selectedDay || !selectedMappingId) return null;

      const { data, error } = await supabase
        .from('inventory_cells')
        .select('rate')
        .eq('property_id', selectedMappingId)
        .eq('cell_date', selectedDay.dateStr)
        .not('rate', 'is', null)
        .limit(10000);

      if (error) throw error;

      const rates = (data || [])
        .map((r) => (r.rate == null ? null : Number(r.rate)))
        .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

      if (rates.length === 0) return null;
      return rates.reduce((s, v) => s + v, 0) / rates.length;
    },
  });

  // Auto-select first property when loaded
  if (properties && properties.length > 0 && !selectedMappingId) {
    setSelectedMappingId(properties[0].id);
  }

  const calendarData = insightsData?.calendarData || [];
  const kpis = insightsData?.kpis || {
    avgOccupancy: 0,
    bookingVelocity: null as number | null,
    daysToFull: 0,
    inventoryAtRisk: 0,
    totalInventory: 0,
    totalBooked: 0,
    selloutRiskDays: 0,
    dataFreshnessMinutes: 0,
    hasBookingData: false,
  };
  const alerts = insightsData?.alerts || [];
  const bookingPace = insightsData?.bookingPace || [];
  const dataFreshness = insightsData?.dataFreshness;
  const hasBookingData = kpis.hasBookingData;

  // Filter calendar data by alert / affected dates
  const filteredCalendarData = useMemo(() => {
    // First priority: explicit date filter from "Lọc ngày"
    if (dateFilterDates && dateFilterDates.length > 0) {
      const set = new Set(dateFilterDates);
      return calendarData.filter(day => set.has(day.dateStr));
    }

    // Fallback: type-based filter
    if (alertFilter === 'all') return calendarData;

    return calendarData.filter(day => {
      switch (alertFilter) {
        case 'vacancy':
          return day.warning === 'vacancy_risk';
        case 'sellout':
          return day.warning === 'sellout_risk';
        case 'data_issue':
          return day.warning === 'data_lag' || day.warning === 'inventory_anomaly';
        case 'anomaly':
          return day.warning === 'inventory_anomaly';
        default:
          return true;
      }
    });
  }, [calendarData, alertFilter, dateFilterDates]);

  // TOP 1 DESIGN: Semantic signal badges - subtle, not colorful
  const getDemandColor = (signal: DemandSignal) => {
    switch (signal) {
      case 'high': return 'signal-badge signal-badge-high';
      case 'normal': return 'signal-badge signal-badge-normal';
      case 'low': return 'signal-badge signal-badge-low';
      default: return 'signal-badge bg-muted text-muted-foreground';
    }
  };

  const getPricingIcon = (signal: PricingSignal) => {
    switch (signal) {
      case 'increase': return <ArrowUp className="h-3 w-3 text-success" />;
      case 'decrease': return <ArrowDown className="h-3 w-3 text-destructive" />;
      default: return <Minus className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getWarningText = (warning: CalendarDay['warning']) => {
    switch (warning) {
      case 'vacancy_risk': return 'Nguy cơ trống phòng cao';
      case 'sellout_risk': return 'Có thể hết phòng sớm';
      case 'data_lag': return 'Dữ liệu inventory bị trễ';
      case 'inventory_anomaly': return 'Dữ liệu inventory bất thường';
      default: return '';
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || isNaN(value)) return 'N/A';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(value);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-success';
    if (confidence >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case 'vacancy': return <AlertTriangle className="h-4 w-4" />;
      case 'sellout': return <Zap className="h-4 w-4" />;
      case 'data_issue': return <XCircle className="h-4 w-4" />;
      case 'anomaly': return <Info className="h-4 w-4" />;
    }
  };

  // TOP 1 DESIGN: Calendar cell styling - semantic states
  const getCalendarCellStyle = (day: CalendarDay) => {
    const state = day.insightState;

    // INVALID: gray, disabled
    if (state === 'INVALID') {
      return 'calendar-cell calendar-cell-invalid';
    }

    // DEGRADED: reference only (dashed border)
    if (state === 'DEGRADED') {
      return 'calendar-cell calendar-cell-reference';
    }

    // VALID with warning: notable
    if (day.warning) {
      return 'calendar-cell calendar-cell-notable';
    }

    // VALID normal
    return 'calendar-cell calendar-cell-normal';
  };

  const hasContext = selectedMappingId && selectedProperty;

  return (
    <>
      <Header title="AI Pricing Insights" subtitle="Phân tích giá thông minh" icon={Activity} />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* === HEADER & MODE DISCLOSURE === */}
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Advisory · Không tự động định giá
                  </Badge>
                  {/* Help Guide Button */}
                  <AIPricingHelpGuide />
                </div>
                <p className="text-sm text-muted-foreground">
                  Phân tích nhu cầu thị trường OTA – Hỗ trợ quyết định giá
                </p>
                {/* Mandatory Disclosure - Vietnamese */}
                <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-md border border-dashed max-w-xl">
                  Công cụ phân tích dựa trên hành vi đặt phòng OTA thực tế.
                  Trang này không tự động thay đổi giá, chỉ cung cấp insight để bạn ra quyết định.
                </div>
              </div>

              {/* Data Freshness Indicator */}
              {dataFreshness && hasContext && (
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                  dataFreshness.isStale
                    ? "bg-warning/10 text-warning border border-warning/20"
                    : "bg-success/10 text-success border border-success/20"
                )}>
                  {dataFreshness.isStale ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>
                    {dataFreshness.lastSync
                      ? `Cập nhật ${formatDistanceToNow(dataFreshness.lastSync, { addSuffix: true, locale: vi })}`
                      : 'Chưa đồng bộ dữ liệu'
                    }
                  </span>
                </div>
              )}
            </div>

            {/* === CONTEXT CONFIGURATION (Required) === */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Chỗ nghỉ:</span>
                    <Select value={selectedMappingId} onValueChange={(v) => {
                      setSelectedMappingId(v);
                      setSelectedRoomType("all");
                      setSelectedDay(null);
                      setAlertFilter('all');
                      setDateFilterDates(null);
                    }}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder={propertiesLoading ? "Đang tải..." : "Chọn chỗ nghỉ"} />
                      </SelectTrigger>
                      <SelectContent>
                        {properties?.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.property_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Loại phòng:</span>
                    <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder={roomTypesLoading ? "Đang tải..." : "Loại phòng"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả loại phòng</SelectItem>
                        {roomTypes?.map(r => (
                          <SelectItem key={r.provider_room_type_id} value={r.provider_room_type_id}>
                            {r.room_type_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Khoảng thời gian:</span>
                    <Select value={dateRange} onValueChange={setDateRange}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 ngày</SelectItem>
                        <SelectItem value="14">14 ngày</SelectItem>
                        <SelectItem value="30">30 ngày</SelectItem>
                        <SelectItem value="45">45 ngày</SelectItem>
                        <SelectItem value="60">60 ngày</SelectItem>
                        <SelectItem value="75">75 ngày (đến hết T2)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Baseline:</span>
                    <Select value={baselineWeeks.toString()} onValueChange={(v) => setBaselineWeeks(parseInt(v))}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BASELINE_WINDOWS.map(w => (
                          <SelectItem key={w.value} value={w.value.toString()}>{w.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={insightsLoading}>
                          <RefreshCw className={cn("h-4 w-4", insightsLoading && "animate-spin")} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Cập nhật dữ liệu mới nhất từ OTA & Channel Manager</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardContent>
            </Card>

            {/* No context selected */}
            {!hasContext && (
              <Card>
                <CardContent className="pt-4">
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium text-foreground mb-2">Chọn chỗ nghỉ để xem Insights</p>
                    <p className="text-sm text-muted-foreground">
                      Vui lòng chọn chỗ nghỉ bạn muốn phân tích
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {hasContext && (
              <>
                {/* === 1. DEMAND SUMMARY (Decision Anchor) - TOP 1 SPEC === */}
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                  <CardContent className="pt-5 pb-5">
                    {insightsLoading ? (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-4">
                          <Activity className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold text-foreground">Tóm tắt nhu cầu</h3>
                          <Badge variant="outline" className="text-micro">Decision Anchor</Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          {/* Demand Level */}
                          <div className="p-3 rounded-lg bg-background/80 border">
                            <p className="text-xs text-muted-foreground mb-1">Mức nhu cầu</p>
                            <div className="flex items-center gap-2">
                              {kpis.avgOccupancy >= 70 ? (
                                <>
                                  <div className="h-2.5 w-2.5 rounded-full bg-success" />
                                  <span className="font-semibold text-success">Cao</span>
                                </>
                              ) : kpis.avgOccupancy >= 40 ? (
                                <>
                                  <div className="h-2.5 w-2.5 rounded-full bg-warning" />
                                  <span className="font-semibold text-warning">Trung bình</span>
                                </>
                              ) : (
                                <>
                                  <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                                  <span className="font-semibold text-destructive">Thấp</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Selling Speed */}
                          <div className="p-3 rounded-lg bg-background/80 border">
                            <p className="text-xs text-muted-foreground mb-1">Tốc độ bán</p>
                            <div className="flex items-center gap-2">
                              {kpis.bookingVelocity === null ? (
                                <>
                                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground" />
                                  <span className="font-semibold text-muted-foreground">Chưa đủ dữ liệu</span>
                                </>
                              ) : kpis.bookingVelocity > 20 ? (
                                <>
                                  <TrendingUp className="h-4 w-4 text-success" />
                                  <span className="font-semibold text-success">Nhanh</span>
                                </>
                              ) : kpis.bookingVelocity < -20 ? (
                                <>
                                  <TrendingDown className="h-4 w-4 text-destructive" />
                                  <span className="font-semibold text-destructive">Chậm</span>
                                </>
                              ) : (
                                <>
                                  <Minus className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-semibold text-muted-foreground">Bình thường</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Inventory Risk */}
                          <div className="p-3 rounded-lg bg-background/80 border">
                            <p className="text-xs text-muted-foreground mb-1">Rủi ro tồn kho</p>
                            <div className="flex items-center gap-2">
                              {kpis.inventoryAtRisk > 10 ? (
                                <>
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                  <span className="font-semibold text-destructive">Có</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                  <span className="font-semibold text-success">Không</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Data Confidence */}
                          <div className="p-3 rounded-lg bg-background/80 border">
                            <p className="text-xs text-muted-foreground mb-1">Độ tin cậy dữ liệu</p>
                            <div className="flex items-center gap-2">
                              {(() => {
                                // Calculate average confidence from calendar data
                                const avgConfidence = calendarData.length > 0
                                  ? calendarData.reduce((sum, d) => sum + d.displayConfidence, 0) / calendarData.length
                                  : 0;

                                if (avgConfidence >= 75) {
                                  return (
                                    <>
                                      <div className="h-2.5 w-2.5 rounded-full bg-success" />
                                      <span className="font-semibold text-success">Cao</span>
                                    </>
                                  );
                                } else if (avgConfidence >= 50) {
                                  return (
                                    <>
                                      <div className="h-2.5 w-2.5 rounded-full bg-warning" />
                                      <span className="font-semibold text-warning">Trung bình</span>
                                    </>
                                  );
                                } else {
                                  return (
                                    <>
                                      <div className="h-2.5 w-2.5 rounded-full bg-destructive" />
                                      <span className="font-semibold text-destructive">Thấp</span>
                                    </>
                                  );
                                }
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Disclaimer */}
                        <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded border border-dashed">
                          <span className="font-medium">📊 Đây là trạng thái nhu cầu tổng thể trong {dateRange} ngày tới</span> — không phải khuyến nghị thay đổi giá.
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* === NO BOOKING DATA WARNING === */}
                {!hasBookingData && !insightsLoading && (
                  <Alert variant="default" className="border-warning/50 bg-warning/5">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <span className="font-medium">Chỗ nghỉ này chưa có dữ liệu đặt phòng trong hệ thống.</span>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        Các chỉ số về Booking Velocity, Baseline Pace và Pickup sẽ hiển thị = 0.
                        Occupancy được tính dựa trên trạng thái inventory từ Channel Manager.
                      </span>
                    </AlertDescription>
                  </Alert>
                )}

                {/* === ALERT LAYER (Exception-Based) === */}
                {alerts.length > 0 && (
                  <div className="space-y-2">
                    {alerts.map((alert, idx) => (
                      <Alert
                        key={idx}
                        variant={alert.severity === 'critical' ? 'destructive' : 'default'}
                        className={cn(
                          alert.severity === 'warning' && "border-warning/50 bg-warning/5",
                          alert.severity === 'info' && "border-primary/50 bg-primary/5"
                        )}
                      >
                        {getAlertIcon(alert.type)}
                        <AlertDescription className="flex items-center justify-between">
                          <span>{alert.message}</span>
                          {alert.affectedDates.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDateFilterDates(alert.affectedDates);
                                setAlertFilter('all');
                              }}
                              className="text-xs"
                            >
                              <Filter className="h-3 w-3 mr-1" />
                              Lọc ngày
                            </Button>
                          )}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}

                {/* === MARKET HEALTH DASHBOARD (TOP 1 DESIGN: KPI Cards) === */}
                <div className="grid gap-4 md:grid-cols-4">
                  {/* KPI 1: Avg Forward Occupancy */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="kpi-card cursor-help" style={{ animationDelay: '0ms' }}>
                          {insightsLoading ? (
                            <Skeleton className="h-16 w-full" />
                          ) : (
                            <>
                              <p className="kpi-label flex items-center gap-1">
                                Avg Forward Occupancy
                                <Info className="h-3 w-3" />
                              </p>
                              <p className="kpi-value mt-1">{kpis.avgOccupancy.toFixed(1)}%</p>
                              <p className="kpi-sublabel">{dateRange} ngày tới</p>
                            </>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs">
                          Tỷ lệ phòng dự kiến đã được bán trong {dateRange} ngày tới.
                          Dựa trên lượng phòng hiện còn so với tổng tồn phòng.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* KPI 2: Booking Velocity - TOP 1 DESIGN: No negative display */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="kpi-card cursor-help" style={{ animationDelay: '30ms' }}>
                          {insightsLoading ? (
                            <Skeleton className="h-16 w-full" />
                          ) : kpis.bookingVelocity === null ? (
                            <>
                              <p className="kpi-label flex items-center gap-1">
                                Booking Velocity
                                <Info className="h-3 w-3" />
                              </p>
                              <p className="kpi-value-unavailable mt-1">— Chưa đủ dữ liệu</p>
                              <p className="kpi-sublabel">cần thêm booking lịch sử</p>
                            </>
                          ) : (
                            <>
                              <p className="kpi-label flex items-center gap-1">
                                Booking Velocity
                                <Info className="h-3 w-3" />
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="kpi-value">
                                  {kpis.bookingVelocity > 0 ? '+' : ''}{kpis.bookingVelocity.toFixed(0)}%
                                </p>
                                {kpis.bookingVelocity > 0 ? (
                                  <TrendingUp className="h-4 w-4 text-success" />
                                ) : kpis.bookingVelocity < 0 ? (
                                  <TrendingDown className="h-4 w-4 text-warning" />
                                ) : (
                                  <Minus className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <p className="kpi-sublabel">so với lịch sử</p>
                            </>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs">
                          Tốc độ đặt phòng hiện tại so với các tuần trước.
                          <br /><strong>Lưu ý:</strong> Giá trị âm = chậm hơn lịch sử (không phải lỗi).
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* KPI 3: Median Days-to-Full */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="kpi-card cursor-help" style={{ animationDelay: '60ms' }}>
                          {insightsLoading ? (
                            <Skeleton className="h-16 w-full" />
                          ) : (
                            <>
                              <p className="kpi-label flex items-center gap-1">
                                Median Days-to-Full
                                <Info className="h-3 w-3" />
                              </p>
                              <p className="kpi-value mt-1">
                                {kpis.daysToFull >= 99 ? '99+' : kpis.daysToFull} ngày
                              </p>
                              <p className="kpi-sublabel">ước tính</p>
                            </>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs">
                          Ước tính số ngày cần thiết để bán hết phòng.
                          Dựa trên hành vi đặt phòng OTA trong quá khứ.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* KPI 4: Inventory at Risk */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="kpi-card cursor-help" style={{ animationDelay: '90ms' }}>
                          {insightsLoading ? (
                            <Skeleton className="h-16 w-full" />
                          ) : (
                            <>
                              <p className="kpi-label flex items-center gap-1">
                                Inventory at Risk
                                <Info className="h-3 w-3" />
                              </p>
                              <p className="kpi-value mt-1">{kpis.inventoryAtRisk.toFixed(1)}%</p>
                              <p className="kpi-sublabel">ngày có nguy cơ</p>
                            </>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="text-xs">
                          Tỷ lệ ngày có nguy cơ không bán được phòng.
                          Hiện tại {kpis.inventoryAtRisk === 0 ? 'chưa ghi nhận rủi ro tồn phòng' : 'có rủi ro cần theo dõi'}.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* === BOOKING PACE ANALYTICS (Correct RMS Definition) === */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <BarChart3 className="h-5 w-5" />
                      Phân tích nhịp độ đặt phòng
                    </CardTitle>
                    <CardDescription>
                      Trục ngang: Số ngày trước check-in | Trục dọc: % phòng đã bán
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {insightsLoading ? (
                      <Skeleton className="h-48 w-full" />
                    ) : bookingPace.length === 0 ? (
                      <div className="h-48 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Info className="h-8 w-8 mx-auto mb-2" />
                          <p>Không đủ dữ liệu để hiển thị biểu đồ</p>
                        </div>
                      </div>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={bookingPace}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="daysBeforeCheckin"
                              reversed
                              label={{ value: 'Ngày trước nhận phòng', position: 'bottom', offset: -5 }}
                              className="text-xs"
                            />
                            <YAxis
                              domain={[0, 100]}
                              label={{ value: '% Đã bán', angle: -90, position: 'insideLeft' }}
                              className="text-xs"
                            />
                            <RechartsTooltip
                              formatter={(value: number) => [`${value.toFixed(1)}%`]}
                              labelFormatter={(label) => `${label} ngày trước nhận phòng`}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="currentPace"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              name="Hiện tại"
                              dot={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="baselinePace"
                              stroke="hsl(var(--muted-foreground))"
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              name="Lịch sử"
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="mt-3 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                      Biểu đồ này cho thấy khách đang đặt sớm hay muộn hơn bình thường,
                      không phản ánh mức giá cao hay thấp.
                    </div>
                    <div className="flex justify-between mt-4 pt-4 border-t">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Đã đặt: </span>
                        <span className="font-medium">{kpis.totalBooked} / {kpis.totalInventory} phòng-đêm</span>
                      </div>
                      <div className={cn(
                        "text-sm font-medium px-2 py-1 rounded",
                        kpis.bookingVelocity === null ? "bg-muted text-muted-foreground" :
                          kpis.bookingVelocity > 20 ? "bg-success/10 text-success" :
                            kpis.bookingVelocity < -20 ? "bg-destructive/10 text-destructive" :
                              "bg-muted text-muted-foreground"
                      )}>
                        {kpis.bookingVelocity === null ? 'Chưa đủ dữ liệu so sánh' :
                          kpis.bookingVelocity > 20 ? 'Đặt nhanh hơn lịch sử' :
                            kpis.bookingVelocity < -20 ? 'Đặt chậm hơn lịch sử' :
                              'Nhịp độ bình thường'}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* === DEMAND & PRICING SIGNAL CALENDAR (Advisory Only) === */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Calendar className="h-5 w-5" />
                          Lịch tín hiệu nhu cầu & cung phòng
                        </CardTitle>
                        <CardDescription>
                          Các tín hiệu phản ánh mất cân bằng cung – cầu, không phải hành động định giá tự động
                        </CardDescription>
                      </div>
                      {(alertFilter !== 'all' || (dateFilterDates && dateFilterDates.length > 0)) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAlertFilter('all');
                            setDateFilterDates(null);
                          }}
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Xoá bộ lọc
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {insightsLoading ? (
                      <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: 14 }).map((_, i) => (
                          <Skeleton key={i} className="h-24 w-full" />
                        ))}
                      </div>
                    ) : filteredCalendarData.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">
                          {alertFilter !== 'all'
                            ? 'Không có ngày nào khớp với filter'
                            : 'Không có dữ liệu inventory cho property này'
                          }
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-7 gap-2">
                          {/* Week headers */}
                          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                              {day}
                            </div>
                          ))}

                          {/* Calendar days - with Insight State handling */}
                          {filteredCalendarData.map((day, idx) => {
                            const isInvalid = day.insightState === 'INVALID';
                            const isDegraded = day.insightState === 'DEGRADED';

                            return (
                              <TooltipProvider key={idx}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => !isInvalid && setSelectedDay(day)}
                                      disabled={isInvalid}
                                      className={cn(
                                        getCalendarCellStyle(day),
                                        selectedDay?.dateStr === day.dateStr ? "ring-2 ring-primary" : "",
                                        !isInvalid && day.inventory === 0 && "opacity-60",
                                        !isInvalid && !day.isAutoEligible && "border-dashed"
                                      )}
                                    >
                                      <div className="text-xs font-medium text-foreground">
                                        {format(day.date, 'd/M', { locale: vi })}
                                      </div>

                                      {/* INVALID state: show minimal info + icon */}
                                      {isInvalid ? (
                                        <div className="text-center py-1">
                                          <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                                          <span className="text-micro text-muted-foreground">N/A</span>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="text-micro text-muted-foreground">
                                            {day.stopSell && day.inventory === 0
                                              ? `Đóng • ${day.inventory}/${day.maxInventory}`
                                              : `${day.inventory}/${day.maxInventory} còn`}
                                          </div>
                                          <div className="flex items-center justify-between mt-1">
                                            <Badge variant="outline" className={cn("text-micro px-1 py-0", getDemandColor(day.demandSignal))}>
                                              {day.demandSignal === 'high' ? 'H' : day.demandSignal === 'normal' ? 'N' : 'L'}
                                            </Badge>
                                            <div className="flex items-center gap-0.5">
                                              {day.inventory > 0 ? getPricingIcon(day.pricingSignal) : (
                                                <span className="text-micro text-muted-foreground">—</span>
                                              )}
                                              {/* R6: Severity indicator */}
                                              {day.pricingSignal !== 'hold' && (
                                                <span className={cn(
                                                  "text-micro font-bold",
                                                  day.signalSeverity === 'HIGH' ? "text-destructive" :
                                                    day.signalSeverity === 'MEDIUM' ? "text-warning" : "text-muted-foreground"
                                                )}>
                                                  {day.signalSeverity[0]}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          {/* Confidence + Volume badges */}
                                          <div className="flex items-center justify-between text-micro mt-0.5">
                                            <span className={getConfidenceColor(day.displayConfidence)}>
                                              {day.displayConfidence}%
                                            </span>
                                            {/* Degraded indicator */}
                                            {isDegraded && (
                                              <Badge variant="outline" className="text-micro px-0.5 py-0 bg-warning/10 text-warning border-warning/30">
                                                ⚠
                                              </Badge>
                                            )}
                                            {/* R3: Volume qualifier badge */}
                                            {day.volumeQualifier === 'LOW_VOLUME' && !isDegraded && (
                                              <Badge variant="outline" className="text-micro px-0.5 py-0 bg-warning/10 text-warning border-warning/30">
                                                LV
                                              </Badge>
                                            )}
                                            {/* R4: Baseline reliability */}
                                            {day.baselineReliability === 'LOW' && !isDegraded && (
                                              <Badge variant="outline" className="text-micro px-0.5 py-0 bg-destructive/10 text-destructive border-destructive/30">
                                                BL
                                              </Badge>
                                            )}
                                            {/* R2: Intent unknown */}
                                            {day.inventoryIntent === 'UNKNOWN' && (
                                              <Badge variant="outline" className="text-micro px-0.5 py-0 bg-primary/100/10 text-primary border-primary/30">
                                                ?
                                              </Badge>
                                            )}
                                          </div>
                                        </>
                                      )}

                                      {/* Warning icon (only for VALID/DEGRADED) */}
                                      {!isInvalid && day.warning && (
                                        <div className="absolute -top-1 -right-1">
                                          <AlertTriangle className="h-3 w-3 text-warning" />
                                        </div>
                                      )}

                                      {/* INVALID icon overlay */}
                                      {isInvalid && (
                                        <div className="absolute -top-1 -right-1">
                                          <div className="h-3 w-3 rounded-full bg-muted-foreground flex items-center justify-center">
                                            <span className="text-micro text-background font-bold">!</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Auto-gate indicator (only for VALID/DEGRADED) */}
                                      {!isInvalid && !day.isAutoEligible && (
                                        <div className="absolute -bottom-1 -left-1">
                                          <div className="h-2.5 w-2.5 rounded-full bg-destructive border border-background" />
                                        </div>
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="text-xs space-y-1">
                                      <p className="font-medium">{format(day.date, 'EEEE, dd/MM', { locale: vi })}</p>

                                      {isInvalid ? (
                                        <div className="text-destructive">
                                          <p className="font-medium">🚫 Insight không khả dụng</p>
                                          <ul className="mt-1 space-y-0.5">
                                            {day.insightStateInfo.reasons.map((r, i) => (
                                              <li key={i}>• {r}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : (
                                        <>
                                          {isDegraded && (
                                            <div className="text-warning mb-1">
                                              <p className="font-medium">⚠ Insight giảm độ tin cậy</p>
                                              <p className="text-micro">{day.insightStateInfo.reasons.join(', ')}</p>
                                            </div>
                                          )}
                                          <p className="text-muted-foreground">
                                            Độ tin cậy dữ liệu: {day.displayConfidence}%
                                          </p>
                                          <p>Tốc độ: {day.velocity > 0 ? '+' : ''}{day.velocity.toFixed(0)}% ({day.velocityAbsolute > 0 ? '+' : ''}{day.velocityAbsolute.toFixed(1)} booking)</p>
                                          {!day.isAutoEligible && (
                                            <p className="text-destructive">⛔ Không đủ điều kiện tự động hoá</p>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })}
                        </div>

                        {/* TOP 1 DESIGN: Simplified Legend - Semantic */}
                        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className={getDemandColor('high')}>H</span>
                            <span className="text-muted-foreground">Nhu cầu cao</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={getDemandColor('normal')}>N</span>
                            <span className="text-muted-foreground">Bình thường</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={getDemandColor('low')}>L</span>
                            <span className="text-muted-foreground">Nhu cầu thấp</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ArrowUp className="h-3 w-3 text-success" />
                            <span className="text-muted-foreground">Cân nhắc tăng</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ArrowDown className="h-3 w-3 text-destructive" />
                            <span className="text-muted-foreground">Cân nhắc giảm</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                            <span className="text-muted-foreground">Không khả dụng</span>
                          </div>
                        </div>

                        {/* R7: Mandatory disclosure */}
                        <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-dashed">
                          <p className="text-xs text-muted-foreground">
                            Tín hiệu phản ánh hành vi đặt phòng OTA đã xảy ra,
                            không phản ánh toàn bộ nhu cầu thị trường.
                            Độ tin cậy dữ liệu không phải xác suất thành công về giá.
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* === WHAT INSIGHTS DOES NOT DO (TOP 1 SPEC) === */}
                <Card className="border-dashed bg-muted/20">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted">
                        <Info className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground mb-2">Trang Insights KHÔNG thực hiện</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Đề xuất tăng / giảm / giữ giá cụ thể</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Áp dụng pricing rule tự động</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Đẩy giá lên OTA</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>So sánh giá với đối thủ</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Ép người dùng phải hành động</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3 italic">
                          👉 Insights = Hiểu đúng nhu cầu — không hành động sớm
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* === BRIDGE TO RECOMMENDATIONS (TOP 1 SPEC) === */}
                <Card className="border-primary/30 bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm text-foreground mb-1">
                          <span className="font-medium">💡 Bước tiếp theo</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Nếu xu hướng nhu cầu này tiếp tục, bước tiếp theo thường là xem <strong>Gợi ý hành động (Recommendations)</strong>.
                        </p>
                      </div>
                      <Button variant="outline" asChild className="ml-4">
                        <Link to="/ai-pricing/recommendations" className="flex items-center gap-2">
                          Xem Recommendations
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <p className="text-micro text-muted-foreground mt-2 italic">
                      Không bắt buộc — chỉ dẫn đúng nhịp tư duy.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </SectionCard>
      </PageContainer>

      {/* === EXPLAINABLE DAY INSIGHT PANEL (TOP 1 DESIGN: Calm Reveal) === */}
      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto insight-panel-content">
          {selectedDay && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {format(selectedDay.date, 'EEEE, dd/MM/yyyy', { locale: vi })}
                  {/* Insight State Badge */}
                  {selectedDay.insightState === 'INVALID' && (
                    <Badge variant="destructive" className="text-micro">Không khả dụng</Badge>
                  )}
                  {selectedDay.insightState === 'DEGRADED' && (
                    <Badge variant="outline" className="text-micro bg-warning/10 text-warning border-warning/30">Giảm độ tin cậy</Badge>
                  )}
                </SheetTitle>
                <SheetDescription>
                  Chi tiết insight theo ngày
                </SheetDescription>
              </SheetHeader>

              {/* INVALID STATE - Show error message, no metrics */}
              {selectedDay.insightState === 'INVALID' ? (
                <div className="mt-4 space-y-4">
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
                    <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <h4 className="font-semibold text-destructive mb-2">🚫 Insight không khả dụng</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Insight này bị tắt để tránh diễn giải sai lệch.
                    </p>
                    <div className="text-left bg-background/50 rounded p-3">
                      <p className="text-xs font-medium text-destructive mb-2">Lý do:</p>
                      <ul className="text-xs text-destructive/80 space-y-1">
                        {selectedDay.insightStateInfo.reasons.map((reason, idx) => (
                          <li key={idx}>• {reason}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center italic">
                    Các chỉ số bị ẩn khi dữ liệu không nhất quán để tránh hiểu nhầm.
                  </p>
                  <Button variant="outline" onClick={() => setSelectedDay(null)} className="w-full">
                    Đóng
                  </Button>
                </div>
              ) : (
                /* VALID / DEGRADED STATE - Show full content */
                <div className="mt-4 space-y-4">
                  {/* DEGRADED warning box */}
                  {selectedDay.insightState === 'DEGRADED' && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                      <p className="text-sm font-medium text-warning mb-1">⚠️ Lưu ý</p>
                      <ul className="text-xs text-warning space-y-0.5">
                        {selectedDay.insightStateInfo.reasons.map((r, i) => (
                          <li key={i}>• {r}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-warning mt-2 font-medium">
                        Insight chỉ nên dùng để tham khảo, không khuyến nghị hành động tự động.
                      </p>
                    </div>
                  )}
                  {/* NOTE: Duplicate Snapshot section removed - keeping only the one below with tooltip */}

                  {/* Block 1: Snapshot (frozen) */}
                  <div>
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      📸 Snapshot
                      <Badge variant="outline" className="text-micro">Tại thời điểm phát sinh tín hiệu</Badge>
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      Dữ liệu được "đóng băng" tại thời điểm này để đảm bảo tính nhất quán.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Tồn phòng còn lại</p>
                        <p className="text-lg font-semibold">
                          {selectedDay.stopSell && selectedDay.inventory === 0
                            ? `Đóng • ${selectedDay.inventory}/${selectedDay.maxInventory} phòng`
                            : `${selectedDay.inventory}/${selectedDay.maxInventory} phòng`}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Số ngày đến nhận phòng</p>
                        <p className="text-lg font-semibold">{selectedDay.leadTime} ngày</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Giá hiện tại</p>
                        <p className="text-lg font-semibold">{formatCurrency(selectedDayRate ?? selectedDay.currentRate)}</p>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-3 rounded-lg bg-muted/50 cursor-help">
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                Độ tin cậy dữ liệu
                                <Info className="h-3 w-3" />
                              </p>
                              <p className={cn("text-lg font-semibold", getConfidenceColor(selectedDay.displayConfidence))}>
                                {selectedDay.displayConfidence}%
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">
                              <strong>Độ tin cậy dữ liệu</strong> đo lường chất lượng dữ liệu đầu vào,
                              KHÔNG phải xác suất thành công của quyết định pricing.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  {/* Block 2: Computed Metrics + Volume Qualifier */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">📊 Chỉ số tính toán</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Occupancy Rate</p>
                        <p className="text-lg font-semibold">{selectedDay.displayOccupancy.toFixed(1)}%</p>
                        <p className="text-micro text-muted-foreground">Phòng đã được bán tại thời điểm hiện tại</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          Baseline (cùng thứ trong lịch sử)
                          {selectedDay.baselineReliability === 'LOW' && (
                            <Badge variant="outline" className="text-micro px-1 py-0 bg-destructive/10 text-destructive">Yếu</Badge>
                          )}
                        </p>
                        <p className="text-lg font-semibold">{Math.max(0, Math.min(100, selectedDay.baselineOccupancy)).toFixed(1)}%</p>
                        {selectedDay.baselineReliability === 'LOW' && (
                          <p className="text-micro text-muted-foreground">Dữ liệu lịch sử không đủ mạnh</p>
                        )}
                      </div>
                      {/* R3: Velocity with BOTH % and absolute */}
                      <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          Tốc độ đặt phòng so với lịch sử
                          {selectedDay.volumeQualifier === 'LOW_VOLUME' && (
                            <Badge variant="outline" className="text-micro px-1 py-0 bg-warning/10 text-warning">Ít mẫu</Badge>
                          )}
                        </p>
                        <p className="text-lg font-semibold">
                          {Math.max(-500, Math.min(500, selectedDay.velocity)) > 0 ? '+' : ''}{Math.max(-500, Math.min(500, selectedDay.velocity)).toFixed(1)}%
                          <span className="text-sm text-muted-foreground ml-2">
                            ({selectedDay.velocityAbsolute > 0 ? '+' : ''}{selectedDay.velocityAbsolute.toFixed(1)} booking)
                          </span>
                        </p>
                        {/* R3: Low volume warning */}
                        {selectedDay.volumeQualifier === 'LOW_VOLUME' && (
                          <p className="text-xs text-warning mt-1">
                            ⚠️ Số lượng mẫu thấp có thể gây hiểu nhầm
                          </p>
                        )}
                      </div>
                      {/* NEW: Inventory Status (TOP 1 SPEC) */}
                      <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                        <p className="text-xs text-muted-foreground mb-2">Trạng thái tồn phòng</p>
                        {selectedDay.inventoryStatusInfo ? (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs font-medium",
                                  selectedDay.inventoryStatusInfo.status === 'SOLD_OUT' && "bg-success/10 text-success border-success/30",
                                  selectedDay.inventoryStatusInfo.status === 'BLOCKED' && "bg-warning/10 text-warning border-warning/30",
                                  selectedDay.inventoryStatusInfo.status === 'INVENTORY_CUT' && "bg-warning/10 text-warning border-warning/30",
                                  selectedDay.inventoryStatusInfo.status === 'NORMAL' && "bg-primary/10 text-primary border-primary/30",
                                  selectedDay.inventoryStatusInfo.status === 'UNKNOWN' && "bg-destructive/10 text-destructive border-destructive/30",
                                )}
                              >
                                {selectedDay.inventoryStatusInfo.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {selectedDay.inventoryStatusInfo.explanation}
                              </span>
                            </div>

                            {/* Data Evidence */}
                            <div className="mt-3 pt-3 border-t border-border/50">
                              <p className="text-micro text-muted-foreground font-medium mb-2">Data Evidence:</p>
                              <div className="grid grid-cols-3 gap-2 text-micro">
                                <div>
                                  <span className="text-muted-foreground">Sold:</span>{' '}
                                  <span className="font-medium">{selectedDay.inventoryStatusInfo.evidence.soldRooms} phòng</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Remaining:</span>{' '}
                                  <span className="font-medium">{selectedDay.inventoryStatusInfo.evidence.remainingRooms} phòng</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Capacity:</span>{' '}
                                  <span className="font-medium">{selectedDay.inventoryStatusInfo.evidence.capacity} phòng</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Stop-sell:</span>{' '}
                                  <span className={cn("font-medium", selectedDay.inventoryStatusInfo.evidence.stopSell && "text-warning")}>
                                    {selectedDay.inventoryStatusInfo.evidence.stopSell === null ? 'N/A' :
                                      selectedDay.inventoryStatusInfo.evidence.stopSell ? 'Có' : 'Không'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">CTA:</span>{' '}
                                  <span className={cn("font-medium", selectedDay.inventoryStatusInfo.evidence.closedToArrival && "text-warning")}>
                                    {selectedDay.inventoryStatusInfo.evidence.closedToArrival === null ? 'N/A' :
                                      selectedDay.inventoryStatusInfo.evidence.closedToArrival ? 'Có' : 'Không'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Data lag:</span>{' '}
                                  <span className={cn("font-medium", selectedDay.inventoryStatusInfo.evidence.dataLagMinutes > 120 && "text-warning")}>
                                    {selectedDay.inventoryStatusInfo.evidence.dataLagMinutes} phút
                                  </span>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                              Đang tải...
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Block 3: AI Explanation */}
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                      🧠 Giải thích xu hướng
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      {/* Demand analysis */}
                      <li className="flex items-start gap-2">
                        <span className="mt-1">•</span>
                        <span>
                          Nhu cầu <strong>{selectedDay.demandSignal === 'high' ? 'cao' : selectedDay.demandSignal === 'low' ? 'thấp' : 'bình thường'}</strong>:
                          {selectedDay.maxInventory - selectedDay.inventory === selectedDay.maxInventory
                            ? ' Phòng đã bán hết'
                            : ` Occupancy ${selectedDay.occupancyRate.toFixed(0)}%`
                          }
                        </span>
                      </li>

                      {/* Velocity analysis with absolute */}
                      <li className="flex items-start gap-2">
                        <span className="mt-1">•</span>
                        <span>
                          Tốc độ đặt phòng {selectedDay.velocity > 0 ? 'tăng' : selectedDay.velocity < 0 ? 'giảm' : 'ổn định'}
                          {selectedDay.velocity !== 0 && ` (${selectedDay.velocityAbsolute > 0 ? '+' : ''}${selectedDay.velocityAbsolute.toFixed(1)} booking)`}
                        </span>
                      </li>

                      {/* Lead time situation */}
                      <li className="flex items-start gap-2">
                        <span className="mt-1">•</span>
                        <span>
                          Thời gian đến check-in còn {selectedDay.leadTime} ngày
                        </span>
                      </li>

                      {/* Pricing signal explanation */}
                      {selectedDay.pricingSignal !== 'hold' && selectedDay.inventory > 0 && (
                        <li className="flex items-start gap-2">
                          <span className="mt-1">{selectedDay.pricingSignal === 'increase' ? '✅' : '⚠️'}</span>
                          <span className="font-medium">
                            {selectedDay.pricingSignal === 'increase'
                              ? 'Có thể cân nhắc tăng giá: Nhu cầu cao + tồn phòng thấp'
                              : 'Có thể cân nhắc giảm giá: Nhu cầu thấp + lead time ngắn + tồn phòng cao'
                            }
                          </span>
                        </li>
                      )}

                      {/* Warning */}
                      {selectedDay.warning && (
                        <li className="flex items-start gap-2 text-warning font-medium">
                          <span className="mt-1">⚠️</span>
                          <span>{getWarningText(selectedDay.warning)}</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Block 4: Why Trust / Not Trust (Auto-generated) */}
                  <div className={cn(
                    "p-4 rounded-lg border",
                    selectedDay.isAutoEligible
                      ? "bg-success/5 border-success/20"
                      : "bg-destructive/5 border-destructive/20"
                  )}>
                    <h4 className={cn(
                      "text-sm font-medium mb-3 flex items-center gap-2",
                      selectedDay.isAutoEligible ? "text-success" : "text-destructive"
                    )}>
                      {selectedDay.isAutoEligible ? '✅' : '⛔'}
                      {selectedDay.isAutoEligible ? 'Vì sao có thể tin tín hiệu này' : 'Vì sao KHÔNG nên tin tuyệt đối tín hiệu này'}
                    </h4>

                    {selectedDay.isAutoEligible ? (
                      <ul className="text-xs text-success space-y-1">
                        <li>• Dữ liệu được cập nhật đủ mới</li>
                        <li>• Baseline lịch sử đủ mạnh</li>
                        <li>• Số lượng mẫu đủ lớn</li>
                        <li>• Trạng thái tồn phòng rõ ràng</li>
                        <li className="font-medium mt-2">→ Đủ điều kiện để xem xét recommendations</li>
                      </ul>
                    ) : (
                      <ul className="text-xs text-destructive space-y-1">
                        {selectedDay.autoGateReasons.map((reason, idx) => (
                          <li key={idx}>• {reason}</li>
                        ))}
                        <li className="font-medium mt-2">→ Không đủ điều kiện cho tự động hoá. Cần thận trọng khi ra quyết định.</li>
                      </ul>
                    )}
                  </div>

                  {/* Confidence Factors (if any) */}
                  {selectedDay.confidenceFactors.length > 0 && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                      <h4 className="text-sm font-medium text-warning mb-2">📉 Các yếu tố làm giảm độ tin cậy</h4>
                      <ul className="text-xs text-warning space-y-1">
                        {selectedDay.confidenceFactors.map((factor, idx) => (
                          <li key={idx}>• {factor}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* R5 & R8: Disclaimers */}
                  <div className="p-3 rounded-lg bg-muted/30 border border-dashed">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">📝 Ghi chú quan trọng</h4>
                    <ul className="text-micro text-muted-foreground space-y-1">
                      <li>• Nhịp độ đặt phòng không phản ánh ngưỡng giá tối đa</li>
                      <li>• Insight không tối ưu lợi nhuận ròng</li>
                      <li>• AI không hiểu mục tiêu tài chính nội bộ của bạn</li>
                    </ul>
                  </div>

                  {/* Next Step */}
                  <div className="pt-4 border-t space-y-3">
                    <p className="text-xs text-muted-foreground italic">
                      Insight không phải kết luận cuối cùng, mà là điểm khởi đầu cho quyết định pricing.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSelectedDay(null)}
                        className="flex-1"
                      >
                        Đóng
                      </Button>
                      <Button
                        variant="default"
                        asChild
                        className="flex-1"
                      >
                        <Link to="/ai-pricing/recommendations">
                          Xem gợi ý tiếp theo
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    </div>
                    <p className="text-micro text-muted-foreground text-center">
                      Chuyển sang phần Recommendations để xem các kịch bản giá tham khảo
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
