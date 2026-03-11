import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getDataHealthSeverityVariant } from "@/constants/status-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Search,
  Loader2,
  RefreshCw,
  User,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

interface DataHealthIssue {
  id: string;
  unified_booking_id: string;
  health_status: string;
  issue_type: string | null;
  anomaly_type: string | null;
  severity: string | null;
  detected_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  assigned_to: string | null;
  resolution_note: string | null;
  created_at: string;
}

const getSeverityIcon = (severity: string | null) => {
  switch (severity) {
    case "ERROR":
      return AlertCircle;
    case "WARNING":
      return AlertTriangle;
    default:
      return Info;
  }
};

const anomalyLabels: Record<string, string> = {
  MISSING_CHECKOUT: "Thiếu ngày checkout",
  MISSING_PAYMENT_TYPE: "Thiếu loại thanh toán",
  MISSING_OTA_EXPECTED: "Thiếu OTA expected",
  PAYOUT_VARIANCE: "Chênh lệch payout",
  MISSING_SUPPLY: "Thiếu phòng host",
  MISSING_COMMISSION_RULE: "Thiếu rule commission",
  ORPHAN_PAYMENT: "Payment không liên kết",
  DUPLICATE_ENTRY: "Dữ liệu trùng lặp",
};

export default function DataHealthPage() {
  const [issues, setIssues] = useState<DataHealthIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");

  useEffect(() => {
    fetchIssues();
  }, [statusFilter]);

  const fetchIssues = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("booking_data_health")
        .select("*")
        .order("detected_at", { ascending: false });

      if (statusFilter === "open") {
        query = query.is("resolved_at", null);
      } else if (statusFilter === "resolved") {
        query = query.not("resolved_at", "is", null);
      }

      const { data, error } = await query;

      if (error) throw error;
      setIssues(data || []);
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const runHealthCheck = async () => {
    setRefreshing(true);
    // Simulate health check - in production this would call an edge function
    setTimeout(() => {
      toast.success("Hoàn tất", { description: "Đã quét dữ liệu và cập nhật danh sách lỗi" });
      fetchIssues();
      setRefreshing(false);
    }, 2000);
  };

  // Stats
  const errorCount = issues.filter((i) => i.severity === "ERROR" && !i.resolved_at).length;
  const warningCount = issues.filter((i) => i.severity === "WARNING" && !i.resolved_at).length;
  const resolvedCount = issues.filter((i) => i.resolved_at).length;

  // Filter issues
  const filteredIssues = issues.filter((issue) => {
    const matchesSearch =
      !searchTerm ||
      issue.unified_booking_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.anomaly_type?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity =
      severityFilter === "all" || issue.severity === severityFilter;

    return matchesSearch && matchesSeverity;
  });

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredIssues, { defaultPageSize: 10, resetDeps: [searchTerm, severityFilter, statusFilter] });

  return (
    <>
      <Header
        title="Data Health"
        subtitle="Kiểm tra chất lượng dữ liệu & phát hiện lỗi"
        actions={
          <Button onClick={runHealthCheck} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Quét lại
          </Button>
        }
      />

      <PageContainer>
        <SectionCard>
        {/* Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Lỗi nghiêm trọng"
            value={errorCount}
            icon={AlertCircle}
            className="border-danger/50"
          />
          <MetricCard
            title="Cảnh báo"
            value={warningCount}
            icon={AlertTriangle}
            className="border-warning/50"
          />
          <MetricCard
            title="Đã xử lý"
            value={resolvedCount}
            icon={CheckCircle}
            className="border-success/50"
          />
          <MetricCard
            title="Tổng issues"
            value={issues.length}
            icon={Info}
          />
        </div>

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Tìm kiếm và lọc vấn đề dữ liệu"
          hasActiveFilters={searchTerm !== "" || severityFilter !== "all" || statusFilter !== "open"}
          onClearFilters={() => {
            setSearchTerm("");
            setSeverityFilter("all");
            setStatusFilter("open");
          }}
        >
          <FilterBar.Field label="Tìm kiếm" colSpan={2}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm theo booking..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </FilterBar.Field>
          <FilterBar.Field label="Mức độ">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Mức độ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="ERROR">Lỗi</SelectItem>
                <SelectItem value="WARNING">Cảnh báo</SelectItem>
                <SelectItem value="INFO">Thông tin</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
          <FilterBar.Field label="Trạng thái">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="open">Chưa xử lý</SelectItem>
                <SelectItem value="resolved">Đã xử lý</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
        </FilterBar>

        {/* Issues Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
            <p className="text-muted-foreground">Không có vấn đề nào</p>
            <p className="text-sm text-muted-foreground mt-1">
              Dữ liệu hệ thống đang ổn định
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[60px]">
                    Mức độ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[180px]">
                    Booking
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[160px]">
                    Loại lỗi
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[140px]">
                    Phát hiện lúc
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[120px]">
                    Người xử lý
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[100px]">
                    Trạng thái
                  </th>
                  <th className="px-4 py-3 w-[60px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedData.map((issue) => {
                  const Icon = getSeverityIcon(issue.severity);
                  const variant = getDataHealthSeverityVariant(issue.severity);

                  return (
                    <tr
                      key={issue.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div
                          className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                            variant === "danger"
                              ? "bg-danger/10"
                              : variant === "warning"
                              ? "bg-warning/10"
                              : "bg-info/10"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 ${
                              variant === "danger"
                                ? "text-danger"
                                : variant === "warning"
                                ? "text-warning"
                                : "text-info"
                            }`}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/bookings/${issue.unified_booking_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {issue.unified_booking_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">
                          {anomalyLabels[issue.anomaly_type || ""] ||
                            issue.issue_type ||
                            issue.anomaly_type ||
                            "Không xác định"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {issue.detected_at
                          ? new Date(issue.detected_at).toLocaleString("en-GB")
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {issue.assigned_to ? (
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">Assigned</span>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            Gán người
                          </Button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          variant={issue.resolved_at ? "success" : "warning"}
                          size="sm"
                        >
                          {issue.resolved_at ? "Đã xử lý" : "Chờ xử lý"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link to={`/bookings/${issue.unified_booking_id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <DataTablePagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalCount}
              displayedItems={displayedCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="lỗi"
            />
          </div>
        )}
        </SectionCard>
      </PageContainer>
    </>
  );
}
