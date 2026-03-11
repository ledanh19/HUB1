import { useState, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { Badge } from "@/components/ui/badge";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  Loader2,
  AlertCircle,
  Calendar,
  Hotel,
  DollarSign,
  Hash,
  Moon,
  BarChart3,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  useOtaKpi,
  useOtaKpiSummary,
  useOtaProjects,
  KpiData
} from "@/hooks/useOtaOperations";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num: number) => {
  return new Intl.NumberFormat("vi-VN").format(num);
};

// Date range presets
const DATE_PRESETS = [
  { label: "7 ngày qua", getValue: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { label: "30 ngày qua", getValue: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { label: "90 ngày qua", getValue: () => ({ from: subDays(new Date(), 90), to: new Date() }) },
  { label: "Tháng này", getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
];

export default function KpiPage() {
  const { hasPageAccess } = useCurrentUserPagePermissions();
  const canAccess = hasPageAccess("/ota-operations/kpi");

  // Default to last 30 days
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<'channel' | 'property' | 'daily' | 'monthly'>('channel');

  // Fetch projects for property filter (via project's property_id)
  const { data: projects } = useOtaProjects();

  // Get unique properties from projects
  const properties = useMemo(() => {
    if (!projects) return [];
    const propertyMap = new Map<string, string>();
    projects.forEach(p => {
      if (p.property_id && p.property_name) {
        propertyMap.set(p.property_id, p.property_name);
      }
    });
    return Array.from(propertyMap.entries()).map(([id, name]) => ({ id, name }));
  }, [projects]);

  // Build params for KPI query
  const kpiParams = useMemo(() => ({
    startDate: dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : '',
    endDate: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : '',
    propertyIds: selectedProperty !== 'all' ? [selectedProperty] : undefined,
    groupBy,
  }), [dateRange, selectedProperty, groupBy]);

  // CRITICAL: Uses RPC only - never queries bookings_mirror directly
  const {
    data: kpiData,
    isLoading: loadingKpi,
    error: errorKpi,
    refetch: refetchKpi,
  } = useOtaKpi(kpiParams);

  const {
    data: summaryData,
    isLoading: loadingSummary,
  } = useOtaKpiSummary({
    startDate: kpiParams.startDate,
    endDate: kpiParams.endDate,
    propertyIds: kpiParams.propertyIds,
  });

  const isLoading = loadingKpi || loadingSummary;
  const summary = summaryData?.summary;
  const kpiItems = (kpiData?.data || []) as KpiData[];

  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(kpiItems, { defaultPageSize: 10, resetDeps: [dateRange, selectedProperty, groupBy] });

  if (!canAccess) {
    return (
      <>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold">Không có quyền truy cập</h2>
            <p className="text-muted-foreground">Bạn không có quyền xem trang này.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="OTA KPI Dashboard"
        subtitle="Thống kê hiệu suất OTA channels (chỉ dữ liệu CONFIRMED)"
      />

      <PageContainer><SectionCard>
        {/* Date Clamping Warning */}
        {kpiData?.meta?.date_clamped && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Date range đã được giới hạn</p>
              <p className="text-sm text-warning">
                Khoảng thời gian tối đa là 400 ngày. Dữ liệu hiển thị từ{" "}
                <strong>{kpiData.meta.start_date}</strong> đến{" "}
                <strong>{kpiData.meta.end_date}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Lọc dữ liệu KPI theo thời gian và property"
          hasActiveFilters={selectedProperty !== 'all' || groupBy !== 'channel'}
          onClearFilters={() => { setSelectedProperty('all'); setGroupBy('channel'); setDateRange({ from: subDays(new Date(), 30), to: new Date() }); }}
        >
          <FilterBar.Field label="Khoảng nhanh" colSpan={2}>
            <div className="flex gap-2 flex-wrap">
              {DATE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => setDateRange(preset.getValue())}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </FilterBar.Field>

          <FilterBar.Field label="Chọn ngày">
            <DatePickerWithRange
              date={dateRange}
              onDateChange={(range) => range && setDateRange(range)}
            />
          </FilterBar.Field>

          <FilterBar.Field label="Property">
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả properties</SelectItem>
                {properties.map((prop) => (
                  <SelectItem key={prop.id} value={prop.id}>
                    {prop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar.Field>

          <FilterBar.Field label="Nhóm theo">
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
              <SelectTrigger>
                <SelectValue placeholder="Nhóm theo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="channel">Theo Channel</SelectItem>
                <SelectItem value="property">Theo Property</SelectItem>
                <SelectItem value="daily">Theo Ngày</SelectItem>
                <SelectItem value="monthly">Theo Tháng</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
        </FilterBar>

        {/* Summary Cards */}
        <KPIGrid columns={3}>
          <MetricCard title="Tổng Bookings" value={loadingSummary ? '—' : formatNumber(summary?.total_bookings || 0)} icon={Hash} />
          <MetricCard title="Tổng Doanh thu" value={loadingSummary ? '—' : formatCurrency(summary?.total_revenue || 0)} icon={DollarSign} tone="success" />
          <MetricCard title="TB/Booking" value={loadingSummary ? '—' : formatCurrency(summary?.avg_booking_value || 0)} icon={BarChart3} />
          <MetricCard title="Tổng Đêm" value={loadingSummary ? '—' : formatNumber(summary?.total_nights || 0)} icon={Moon} />
          <MetricCard title="Channels" value={loadingSummary ? '—' : formatNumber(summary?.active_channels || 0)} icon={TrendingUp} tone="info" />
          <MetricCard title="Properties" value={loadingSummary ? '—' : formatNumber(summary?.active_properties || 0)} icon={Hotel} />
        </KPIGrid>

        {/* KPI Breakdown Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Chi tiết theo {groupBy === 'channel' ? 'Channel' : groupBy === 'property' ? 'Property' : groupBy === 'daily' ? 'Ngày' : 'Tháng'}
            </CardTitle>
            <CardDescription>
              Dữ liệu chỉ bao gồm bookings có trạng thái CONFIRMED
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loadingKpi ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : kpiData?.error === 'RPC_NOT_FOUND' ? (
              <div className="flex flex-col items-center justify-center py-12 text-warning">
                <AlertTriangle className="h-12 w-12 mb-4" />
                <p className="text-lg font-medium">KPI Function chưa sẵn sàng</p>
                <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
                  RPC <code className="bg-muted px-1 rounded">ota_get_kpi</code> chưa được cài đặt trong database.
                  Vui lòng liên hệ admin để chạy migrations OTA Operations.
                </p>
              </div>
            ) : errorKpi ? (
              <div className="flex items-center justify-center py-12 text-destructive">
                <AlertCircle className="h-5 w-5 mr-2" />
                Lỗi tải KPI: {(errorKpi as Error).message}
              </div>
            ) : kpiItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Không có dữ liệu</p>
                <p className="text-sm">Thử thay đổi khoảng thời gian hoặc bộ lọc property</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">
                      {groupBy === 'channel' ? 'Channel' :
                        groupBy === 'property' ? 'Property' :
                          groupBy === 'daily' ? 'Ngày' : 'Tháng'}
                    </TableHead>
                    <TableHead className="w-[120px] text-right">Bookings</TableHead>
                    <TableHead className="w-[150px] text-right">Doanh thu</TableHead>
                    <TableHead className="w-[150px] text-right">TB/Booking</TableHead>
                    <TableHead className="w-[120px] text-right">Tổng đêm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {groupBy === 'channel' && (
                            <Badge variant="outline" className="font-mono">
                              {item.channel || 'Unknown'}
                            </Badge>
                          )}
                          {groupBy === 'property' && (
                            <span className="font-medium">{(item as any).property_name || 'Unknown'}</span>
                          )}
                          {groupBy === 'daily' && (
                            <span>{format(new Date((item as any).date), 'dd/MM/yyyy')}</span>
                          )}
                          {groupBy === 'monthly' && (
                            <span>{format(new Date((item as any).month), 'MM/yyyy')}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(item.booking_count)}
                      </TableCell>
                      <TableCell className="text-right text-success font-medium">
                        {formatCurrency(item.total_revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.avg_booking_value)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(item.total_nights)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {kpiItems.length > 0 && (
              <DataTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                displayedItems={displayedCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="dòng"
              />
            )}
          </CardContent>
        </Card>

        {/* Info Note */}
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
          <p className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <strong>Lưu ý:</strong> KPI data được tính từ <code>booking_date</code> (ngày đặt phòng),
            chỉ bao gồm bookings có trạng thái <Badge variant="outline">CONFIRMED</Badge>.
            Date range tối đa là 400 ngày.
          </p>
        </div>
      </SectionCard></PageContainer>
    </>
  );
}
