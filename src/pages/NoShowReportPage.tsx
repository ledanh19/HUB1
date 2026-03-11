import { useState, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import { MetricCard } from "@/components/ui/metric-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Calendar,
  Loader2,
  Building2,
  User,
  TrendingUp,
  BarChart3,
  X,
  Download,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { NO_SHOW_REASON_LABELS, NoShowReason } from "@/hooks/useNoShow";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function NoShowReportPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");

  // Fetch no-show records with booking info
  const { data: noShowData = [], isLoading, refetch } = useQuery({
    queryKey: ["no_show_report", dateFrom, dateTo],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("no_show_records")
        .select("*")
        .is("removed_at", null)
        .gte("no_show_date", dateFrom)
        .lte("no_show_date", dateTo)
        .order("no_show_date", { ascending: false });

      if (error) throw error;

      // Get booking details and profile info for each no-show
      const enrichedData = await Promise.all(
        (data || []).map(async (record) => {
          // Get profile info
          let recorderName = "Unknown";
          if (record.created_by) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", record.created_by)
              .maybeSingle();
            recorderName = profile?.full_name || profile?.email || "Unknown";
          }

          // Try manual_bookings first
          const { data: manualBooking } = await supabase
            .from("manual_bookings")
            .select("source, guest_name, manual_property_name")
            .eq("unified_booking_id", record.unified_booking_id)
            .maybeSingle();

          if (manualBooking) {
            return {
              ...record,
              source: manualBooking.source,
              guest_name: manualBooking.guest_name,
              property_name: manualBooking.manual_property_name,
              recorder_name: recorderName,
            };
          }

          // Try bookings_mirror
          const { data: pmsBooking } = await supabase
            .from("bookings_mirror")
            .select("ota_source, guest_name, pms_property_name")
            .eq("unified_booking_id", record.unified_booking_id)
            .maybeSingle();

          return {
            ...record,
            source: pmsBooking?.ota_source || "Unknown",
            guest_name: pmsBooking?.guest_name || "Unknown",
            property_name: pmsBooking?.pms_property_name || null,
            recorder_name: recorderName,
          };
        })
      );

      return enrichedData;
    },
  });

  // Get unique sources
  const uniqueSources = useMemo(() => {
    return [...new Set(noShowData.map((r) => r.source).filter(Boolean))];
  }, [noShowData]);

  // Filter data
  const filteredData = useMemo(() => {
    return noShowData.filter((r) => {
      const matchesSource = sourceFilter === "all" || r.source === sourceFilter;
      const matchesReason = reasonFilter === "all" || r.reason === reasonFilter;
      return matchesSource && matchesReason;
    });
  }, [noShowData, sourceFilter, reasonFilter]);

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredData, { defaultPageSize: 10, resetDeps: [sourceFilter, reasonFilter, dateFrom, dateTo] });

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredData.length;

    // By reason
    const byReason: Record<string, number> = {};
    filteredData.forEach((r) => {
      byReason[r.reason] = (byReason[r.reason] || 0) + 1;
    });

    // By source/OTA
    const bySource: Record<string, number> = {};
    filteredData.forEach((r) => {
      const source = r.source || "Unknown";
      bySource[source] = (bySource[source] || 0) + 1;
    });

    // By property
    const byProperty: Record<string, number> = {};
    filteredData.forEach((r) => {
      const property = r.property_name || "Không xác định";
      byProperty[property] = (byProperty[property] || 0) + 1;
    });

    // By recorder (personnel)
    const byRecorder: Record<string, number> = {};
    filteredData.forEach((r) => {
      const recorder = r.recorder_name || "Unknown";
      byRecorder[recorder] = (byRecorder[recorder] || 0) + 1;
    });

    // By month
    const byMonth: Record<string, number> = {};
    filteredData.forEach((r) => {
      const month = r.no_show_date?.slice(0, 7) || "Unknown";
      byMonth[month] = (byMonth[month] || 0) + 1;
    });

    return { total, byReason, bySource, byProperty, byRecorder, byMonth };
  }, [filteredData]);

  const hasActiveFilters = sourceFilter !== "all" || reasonFilter !== "all";

  const clearFilters = () => {
    setSourceFilter("all");
    setReasonFilter("all");
  };

  return (
    <>
      <Header
        title="Báo cáo No-Show"
        subtitle="Thống kê nội bộ - không liên quan tài chính"
      />

      <PageContainer><SectionCard>
        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Lọc báo cáo no-show"
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        >
          <FilterBar.Field label="Từ ngày">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </FilterBar.Field>
          <FilterBar.Field label="Đến ngày">
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </FilterBar.Field>
          <FilterBar.Field label="Nguồn">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả nguồn" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nguồn</SelectItem>
                {uniqueSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar.Field>
          <FilterBar.Field label="Lý do">
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả lý do" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả lý do</SelectItem>
                {Object.entries(NO_SHOW_REASON_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar.Field>
        </FilterBar>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Tổng No-Show"
            value={stats.total}
            icon={AlertTriangle}
          />
          <MetricCard
            title="Nguồn có nhiều nhất"
            value={
              Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])[0]?.[0] ||
              "—"
            }
            subtitle={`${Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])[0]?.[1] || 0} lượt`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Lý do phổ biến"
            value={
              NO_SHOW_REASON_LABELS[
              Object.entries(stats.byReason).sort((a, b) => b[1] - a[1])[0]?.[0] as NoShowReason
              ] || "—"
            }
            subtitle={`${Object.entries(stats.byReason).sort((a, b) => b[1] - a[1])[0]?.[1] || 0} lượt`}
            icon={BarChart3}
          />
          <MetricCard
            title="Chỗ nghỉ nhiều nhất"
            value={
              Object.entries(stats.byProperty).sort((a, b) => b[1] - a[1])[0]?.[0]?.slice(0, 15) ||
              "—"
            }
            subtitle={`${Object.entries(stats.byProperty).sort((a, b) => b[1] - a[1])[0]?.[1] || 0} lượt`}
            icon={Building2}
          />
        </div>

        {/* Stats Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* By Source */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Theo nguồn (OTA)
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.bySource)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([source, count]) => (
                  <div key={source} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{source}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              {Object.keys(stats.bySource).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Chưa có dữ liệu</p>
              )}
            </div>
          </div>

          {/* By Reason */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Theo lý do
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.byReason)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <div key={reason} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {NO_SHOW_REASON_LABELS[reason as NoShowReason] || reason}
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              {Object.keys(stats.byReason).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Chưa có dữ liệu</p>
              )}
            </div>
          </div>

          {/* By Property */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Theo chỗ nghỉ
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.byProperty)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([property, count]) => (
                  <div key={property} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate max-w-40">{property}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              {Object.keys(stats.byProperty).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Chưa có dữ liệu</p>
              )}
            </div>
          </div>

          {/* By Recorder */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Theo nhân sự
            </h3>
            <div className="space-y-2">
              {Object.entries(stats.byRecorder)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([recorder, count]) => (
                  <div key={recorder} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate max-w-40">{recorder}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              {Object.keys(stats.byRecorder).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Chưa có dữ liệu</p>
              )}
            </div>
          </div>
        </div>

        {/* Detail Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-medium">Danh sách No-Show ({filteredData.length})</h3>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2 p-2">
                {filteredData.length === 0 ? (
                  <div className="px-4 py-12 text-center text-muted-foreground">
                    Không có dữ liệu no-show trong khoảng thời gian này
                  </div>
                ) : (
                  paginatedData.map((record) => (
                    <Link key={record.id} to={`/bookings/${record.unified_booking_id}`}>
                      <div className="rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors mb-2">
                        {/* Row 1: Guest + Source */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-foreground truncate">{record.guest_name}</span>
                          <StatusBadge variant="info" size="sm">{record.source}</StatusBadge>
                        </div>
                        {/* Row 2: Date + Reason */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs text-muted-foreground">{formatDate(record.no_show_date)}</span>
                          <StatusBadge variant="warning" size="sm">
                            {NO_SHOW_REASON_LABELS[record.reason as NoShowReason] || record.reason}
                          </StatusBadge>
                        </div>
                        {/* Row 3: Recorder + Note */}
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{record.recorder_name || "—"}</span>
                          {record.note && <span className="truncate max-w-[150px]">{record.note}</span>}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[180px]">
                        Booking
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[140px]">
                        Khách
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[100px]">
                        Nguồn
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[120px]">
                        Ngày No-Show
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[140px]">
                        Lý do
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[120px]">
                        Người ghi nhận
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[180px]">
                        Ghi chú
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                          Không có dữ liệu no-show trong khoảng thời gian này
                        </td>
                      </tr>
                    ) : (
                      paginatedData.map((record) => (
                        <tr key={record.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <Link
                              to={`/bookings/${record.unified_booking_id}`}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              {record.unified_booking_id}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm">{record.guest_name}</span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge variant="info" size="sm">
                              {record.source}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm">{formatDate(record.no_show_date)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge variant="warning" size="sm">
                              {NO_SHOW_REASON_LABELS[record.reason as NoShowReason] || record.reason}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-muted-foreground">
                              {record.recorder_name || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-muted-foreground truncate max-w-xs block">
                              {record.note || "—"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <DataTablePagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalCount}
            displayedItems={displayedCount}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="no-show"
          />
        </div>
      </SectionCard></PageContainer>
    </>
  );
}
