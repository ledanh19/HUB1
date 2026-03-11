import { useState, lazy, Suspense } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { OtaBadge } from "@/components/ui/ota-badge";
import { getOtaPayoutStatusVariant } from "@/constants/status-config";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  Wallet,
  AlertCircle,
  Info,
  Plus,
  Eye,
  FileText,
  Pencil,
} from "lucide-react";
import {
  useOtaPayouts,
  OTA_SOURCES,
  STATUS_DISPLAY,
  canEditPayout,
} from "@/hooks/useOtaPayouts";
import { CreatePayoutDialog } from "@/components/ota-payout/CreatePayoutDialog";
import { RecordMultiPayoutCashInDialog } from "@/components/ota-payout/RecordMultiPayoutCashInDialog";
import { EditPayoutDialog } from "@/components/ota-payout/EditPayoutDialog";
import { BankFeeReportCard } from "@/components/ota-payout/BankFeeReportCard";
import { BackfillAdjustmentsButton } from "@/components/ota-payout/BackfillAdjustmentsButton";
import { useAuth } from "@/hooks/useAuth";
import { useTablePagination } from "@/hooks/useTablePagination";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, List } from "lucide-react";
import { OtaArDashboardTab } from "@/components/ota-payout/OtaArDashboardTab";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN");
};

export default function OtaPayoutsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userRole } = useAuth();
  const { canUsePage } = useCurrentUserPagePermissions();
  const canPerformActions = canUsePage('/ota-payouts');
  const hasEditPermission = canEditPayout(userRole) && canPerformActions;

  // Tab state from URL: ?tab=dashboard or ?tab=list (default)
  const activeTab = searchParams.get("tab") === "dashboard" ? "dashboard" : "list";
  const setActiveTab = (tab: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (tab === "list") {
      newParams.delete("tab");
    } else {
      newParams.set("tab", tab);
    }
    setSearchParams(newParams, { replace: true });
  };

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showVoided, setShowVoided] = useState(false);
  const [otaFilter, setOtaFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  // Optimized date filter
  const [dateType, setDateType] = useState<"payout_date" | "received_at">("payout_date");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "7days" | "this_month" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [cashInDialogOpen, setCashInDialogOpen] = useState(false);
  const [editingPayout, setEditingPayout] = useState<any>(null);

  // Compute effective date range from preset
  const getEffectiveDateRange = (): { from: string; to: string } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    switch (datePreset) {
      case "today":
        return { from: fmt(today), to: fmt(today) };
      case "7days": {
        const d7 = new Date(today);
        d7.setDate(d7.getDate() - 6);
        return { from: fmt(d7), to: fmt(today) };
      }
      case "this_month": {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { from: fmt(firstDay), to: fmt(lastDay) };
      }
      case "custom":
        return { from: dateFrom, to: dateTo };
      default:
        return { from: "", to: "" };
    }
  };
  const effectiveRange = getEffectiveDateRange();

  const otaPayoutsQuery = useOtaPayouts({
    status: statusFilter,
    otaSource: otaFilter,
    showVoided,
  });
  const { data: payouts = [], isLoading } = otaPayoutsQuery;

  usePrefetchMountLog('OtaPayoutsPage', [
    { key: ['ota_payouts'], query: otaPayoutsQuery },
  ]);

  // Calculate stats from payouts
  const stats = {
    pending: payouts.filter(p => p.status === "PENDING"),
    received: payouts.filter(p => p.status === "RECEIVED"),
    partial: payouts.filter(p => p.status === "PARTIAL"),
    disputed: payouts.filter(p => p.status === "DISPUTED"),
  };

  const totalPendingAmount = stats.pending.reduce((sum, p) => sum + Number(p.net_payout_amount || 0), 0) +
    stats.partial.reduce((sum, p) => sum + Number(p.net_payout_amount || 0), 0);
  const totalReceivedAmount = stats.received.reduce((sum, p) => sum + Number(p.net_payout_amount || 0), 0);

  // Filter by search term + date range
  const filteredPayouts = payouts.filter((payout) => {
    // Text search
    const matchesSearch = !searchTerm ||
      payout.ota_source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payout.payout_period_from && payout.payout_period_from.includes(searchTerm)) ||
      (payout.payout_period_to && payout.payout_period_to.includes(searchTerm)) ||
      ((payout as any).provider_payout_id && (payout as any).provider_payout_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (payout.ota_property_id && payout.ota_property_id.toLowerCase().includes(searchTerm.toLowerCase()));

    // Unified date filter
    if (datePreset !== "all") {
      const targetDateStr = dateType === "payout_date"
        ? (payout.payout_date?.split("T")[0] || "")
        : ((payout.received_at ?? payout.reconciled_at)?.split("T")[0] || "");
      if (!targetDateStr) return false;
      if (effectiveRange.from && targetDateStr < effectiveRange.from) return false;
      if (effectiveRange.to && targetDateStr > effectiveRange.to) return false;
    }

    return matchesSearch;
  });

  // Compute totals for filtered data
  const filteredTotals = {
    grossAmount: filteredPayouts.reduce((sum, p) => sum + Number(p.gross_amount || 0), 0),
    deductionTotal: filteredPayouts.reduce((sum, p) => sum + Number(p.deduction_total || 0), 0),
    bankFeeTotal: filteredPayouts.reduce((sum, p) => sum + Number(p.bank_fee_total || 0), 0),
    netAmount: filteredPayouts.reduce((sum, p) => sum + Number(p.net_payout_amount || p.total_amount || 0), 0),
  };

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredPayouts, { defaultPageSize: 10, resetDeps: [searchTerm, statusFilter, otaFilter, dateType, datePreset, dateFrom, dateTo] });

  const handleCreateSuccess = (payoutId: string) => {
    navigate(`/ota-payouts/${payoutId}`);
  };

  const getStatusLabel = (status: string) => {
    return STATUS_DISPLAY[status as keyof typeof STATUS_DISPLAY]?.label || status;
  };

  return (
    <>
      <Header
        title="OTA Payout"
        subtitle=""
        actions={
          <div className="flex items-center gap-2">
            <BackfillAdjustmentsButton />
            {hasEditPermission && (
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setCashInDialogOpen(true)}>
                <CheckCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Ghi nhận tiền về</span>
              </Button>
            )}
            {hasEditPermission && (
              <Button size="sm" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Tạo Payout</span>
              </Button>
            )}
          </div>
        }
      />

      <PageContainer>
        {/* Tab System */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <SectionCard className="p-2 md:p-3">
            <TabsList className="w-full justify-start bg-transparent">
              <TabsTrigger value="dashboard" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Tổng quan công nợ
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2">
                <List className="h-4 w-4" />
                Danh sách payout
              </TabsTrigger>
            </TabsList>
          </SectionCard>

          {/* Dashboard Tab — lazy mount */}
          <TabsContent value="dashboard" className="mt-0">
            <OtaArDashboardTab />
          </TabsContent>

          {/* List Tab — existing UI unchanged */}
          <TabsContent value="list" className="mt-4">
            <SectionCard>
              {/* Internal tracking warning - compact on mobile */}
              <Alert className="bg-warning/10 border-warning/20 dark:bg-warning/10 dark:border-warning py-2 md:py-3">
                <AlertCircle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning text-micro md:text-sm">
                  <span className="hidden md:inline"><strong>Lưu ý:</strong> OTA Payout là hồ sơ theo dõi nội bộ, KHÔNG phải yêu cầu gửi tới OTA.</span>
                  <span className="md:hidden">Hồ sơ theo dõi nội bộ, không gửi tới OTA.</span>
                </AlertDescription>
              </Alert>

              {/* Stats by Status - Mobile scroll */}
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4 md:overflow-visible scrollbar-hide">
                <div
                  onClick={() => setStatusFilter("PENDING")}
                  className={`flex-shrink-0 w-[130px] md:w-auto rounded-lg border p-3 cursor-pointer transition-all active:opacity-80 ${stats.pending.length > 0 ? "border-warning/50 bg-warning/5" : "border-border bg-card"
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-warning" />
                    <span className="text-micro md:text-xs text-muted-foreground">Theo dõi</span>
                  </div>
                  <p className="text-xl md:text-hero-kpi font-bold tabular-nums tracking-tight">{stats.pending.length}</p>
                  <p className="text-micro text-muted-foreground truncate">{formatCurrency(totalPendingAmount)}</p>
                </div>

                <div
                  onClick={() => setStatusFilter("PARTIAL")}
                  className={`flex-shrink-0 w-[130px] md:w-auto rounded-lg border p-3 cursor-pointer transition-all active:opacity-80 ${stats.partial.length > 0 ? "border-info/50 bg-info/5" : "border-border bg-card"
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-4 w-4 text-info" />
                    <span className="text-micro md:text-xs text-muted-foreground">Một phần</span>
                  </div>
                  <p className="text-xl md:text-hero-kpi font-bold tabular-nums tracking-tight">{stats.partial.length}</p>
                </div>

                <div
                  onClick={() => setStatusFilter("DISPUTED")}
                  className={`flex-shrink-0 w-[130px] md:w-auto rounded-lg border p-3 cursor-pointer transition-all active:opacity-80 ${stats.disputed.length > 0 ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-micro md:text-xs text-muted-foreground">Vấn đề</span>
                  </div>
                  <p className="text-xl md:text-hero-kpi font-bold tabular-nums tracking-tight text-destructive">{stats.disputed.length}</p>
                </div>

                <div
                  onClick={() => setStatusFilter("RECEIVED")}
                  className="flex-shrink-0 w-[130px] md:w-auto rounded-lg border border-success/30 bg-card p-3 cursor-pointer transition-all active:opacity-80"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="text-micro md:text-xs text-muted-foreground">Nhận đủ</span>
                  </div>
                  <p className="text-xl md:text-hero-kpi font-bold tabular-nums tracking-tight text-success">{stats.received.length}</p>
                  <p className="text-micro text-muted-foreground truncate">{formatCurrency(totalReceivedAmount)}</p>
                </div>
              </div>

              {/* Summary - Compact on mobile */}
              <div className="bg-muted/30 rounded-lg p-3 md:p-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                  <span className="text-xs md:text-sm font-medium">Chờ về:</span>
                  <span className="text-base md:text-kpi font-semibold tabular-nums tracking-tight text-primary">
                    {formatCurrency(totalPendingAmount)}
                  </span>
                  <span className="text-micro md:text-sm text-muted-foreground">
                    ({stats.pending.length + stats.partial.length})
                  </span>
                </div>
              </div>

              {/* Filters */}
              <FilterBar
                title="Bộ lọc"
                subtitle="Tìm kiếm và lọc OTA payout"
                hasActiveFilters={statusFilter !== "all" || otaFilter !== "all" || searchTerm !== "" || datePreset !== "all" || showVoided}
                onClearFilters={() => {
                  setStatusFilter("all");
                  setOtaFilter("all");
                  setSearchTerm("");
                  setShowVoided(false);
                  setDateType("payout_date");
                  setDatePreset("all");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                <FilterBar.Field label="Tìm kiếm" colSpan={2}>
                  <DebouncedSearch
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder="Tìm theo OTA, kỳ..."
                  />
                </FilterBar.Field>
                <FilterBar.Field label="Kênh OTA">
                  <Select value={otaFilter} onValueChange={setOtaFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả OTA" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả OTA</SelectItem>
                      {OTA_SOURCES.map((ota) => (
                        <SelectItem key={ota.value} value={ota.value}>
                          {ota.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterBar.Field>
                <FilterBar.Field label="Trạng thái">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="PENDING">Theo dõi</SelectItem>
                      <SelectItem value="PARTIAL">Một phần</SelectItem>
                      <SelectItem value="DISPUTED">Vấn đề</SelectItem>
                      <SelectItem value="RECEIVED">Nhận đủ</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterBar.Field>
                <FilterBar.Field label="Loại ngày">
                  <Select value={dateType} onValueChange={(v) => setDateType(v as "payout_date" | "received_at")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="payout_date">Ngày payout</SelectItem>
                      <SelectItem value="received_at">Ngày nhận thanh toán</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterBar.Field>
                <FilterBar.Field label="Khoảng thời gian">
                  <Select value={datePreset} onValueChange={(v) => { setDatePreset(v as any); if (v !== "custom") { setDateFrom(""); setDateTo(""); } }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="today">Hôm nay</SelectItem>
                      <SelectItem value="7days">7 ngày qua</SelectItem>
                      <SelectItem value="this_month">Tháng này</SelectItem>
                      <SelectItem value="custom">Tùy chỉnh</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterBar.Field>
                {datePreset === "custom" && (
                  <>
                    <FilterBar.Field label="Từ ngày">
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </FilterBar.Field>
                    <FilterBar.Field label="Đến ngày">
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </FilterBar.Field>
                  </>
                )}
                <FilterBar.Field label="Đã hủy">
                  <Button
                    variant={showVoided ? "secondary" : "outline"}
                    size="sm"
                    className="w-full"
                    onClick={() => setShowVoided(!showVoided)}
                  >
                    {showVoided ? "Đang hiển thị" : "Ẩn"}
                  </Button>
                </FilterBar.Field>
              </FilterBar>

              {/* Payout List */}
              {isLoading ? (
                <PageSkeleton cards={0} rows={6} columns={8} />
              ) : filteredPayouts.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {statusFilter !== "all" || otaFilter !== "all"
                      ? "Không có hồ sơ phù hợp"
                      : "Chưa có hồ sơ nào"}
                  </p>
                  {hasEditPermission && statusFilter === "all" && otaFilter === "all" && (
                    <Button onClick={() => setCreateDialogOpen(true)} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Tạo Payout
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-2">
                    {paginatedData.map((payout) => (
                      <div
                        key={payout.id}
                        className={`rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors ${(payout as any).is_voided ? "opacity-60 bg-muted/30 border-muted" : payout.status === "DISPUTED" ? "bg-destructive/5 border-destructive/30" :
                          payout.status === "PENDING" ? "bg-warning/5 border-warning/30" : ""
                          }`}
                      >
                        {/* Row 1: OTA + Amount */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <OtaBadge source={payout.ota_source} />
                            {(payout as any).is_voided ? (
                              <StatusBadge variant="destructive" size="sm">ĐÃ HỦY</StatusBadge>
                            ) : (
                              <StatusBadge variant={getOtaPayoutStatusVariant(payout.status) as any} dot size="sm">
                                {getStatusLabel(payout.status)}
                              </StatusBadge>
                            )}
                          </div>
                          <span className="font-bold text-sm">
                            {formatCurrency(Number(payout.net_payout_amount || payout.total_amount || 0))}
                          </span>
                        </div>

                        {/* Row 1.5: Property + Payout IDs */}
                        {(payout.ota_property_id || payout.provider_payout_id) && (
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1 font-mono">
                            {payout.ota_property_id && <span title="ID chỗ nghỉ">{payout.ota_property_id}</span>}
                            {payout.provider_payout_id && <span className="text-muted-foreground/70" title="ID Payout">{payout.provider_payout_id}</span>}
                          </div>
                        )}

                        {/* Row 2: Period + Date */}
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {payout.payout_period_from && payout.payout_period_to ? (
                              <>{formatDate(payout.payout_period_from)} - {formatDate(payout.payout_period_to)}</>
                            ) : "—"}
                          </span>
                          <span>YC: {formatDate(payout.payout_date)}</span>
                        </div>

                        {/* Row 3: Amounts breakdown */}
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-1">
                          <span>Dự kiến: {formatCurrency(Number(payout.gross_amount || 0))}</span>
                          {Number(payout.deduction_total || 0) !== 0 && (
                            <span className={Number(payout.deduction_total || 0) < 0 ? "text-destructive" : "text-success"}>
                              ĐC: {formatCurrency(Number(payout.deduction_total || 0))}
                            </span>
                          )}
                        </div>

                        {/* Row 4: Received date */}
                        {(payout.received_at ?? payout.reconciled_at) && (
                          <div className="text-xs text-success mt-1">
                            Nhận: {formatDate(payout.received_at ?? payout.reconciled_at)}
                          </div>
                        )}

                        {/* Row 5: Action buttons */}
                        <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/30">
                          {hasEditPermission && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary"
                              onClick={(e) => { e.stopPropagation(); setEditingPayout(payout); }}
                            >
                              <Pencil className="h-3 w-3" />
                              Sửa
                            </Button>
                          )}
                          <Link to={`/ota-payouts/${payout.id}`} onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary">
                              <Eye className="h-3 w-3" />
                              Chi tiết
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block rounded-xl border border-border bg-card overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[100px]">
                            OTA
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[110px]">
                            ID chỗ nghỉ
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[110px]">
                            ID Payout
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[160px]">
                            Kỳ payout
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[100px]">
                            Ngày yêu cầu
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[100px]">
                            Ngày nhận
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase w-[120px]">
                            Tổng dự kiến
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase w-[110px]">
                            Điều chỉnh
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase w-[90px]">
                            Phí NH
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase w-[120px]">
                            Thực nhận
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[90px]">
                            Trạng thái
                          </th>
                          <th className="px-4 py-3 w-[70px]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {paginatedData.map((payout) => (
                          <tr
                            key={payout.id}
                            className={`hover:bg-muted/30 transition-colors cursor-pointer ${(payout as any).is_voided ? "opacity-60 bg-muted/20" : payout.status === "DISPUTED" ? "bg-destructive/5" :
                              payout.status === "PENDING" ? "bg-warning/5" : ""
                              }`}
                          >
                            <td className="px-4 py-3">
                              <OtaBadge source={payout.ota_source} />
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                              {payout.ota_property_id || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                              {payout.provider_payout_id || "—"}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {payout.payout_period_from && payout.payout_period_to ? (
                                <span>
                                  {formatDate(payout.payout_period_from)} – {formatDate(payout.payout_period_to)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {formatDate(payout.payout_date)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {(payout.received_at ?? payout.reconciled_at) ? (
                                <span className="text-success">{formatDate(payout.received_at ?? payout.reconciled_at)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm tabular-nums">
                              {formatCurrency(Number(payout.gross_amount || 0))}
                            </td>
                            <td className="px-4 py-3 text-right text-sm tabular-nums">
                              {Number(payout.deduction_total || 0) !== 0 ? (
                                <span className={Number(payout.deduction_total || 0) < 0 ? "text-destructive" : "text-success"}>
                                  {formatCurrency(Number(payout.deduction_total || 0))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm tabular-nums">
                              {Number(payout.bank_fee_total || 0) > 0 ? (
                                <span className="text-warning">{formatCurrency(Number(payout.bank_fee_total))}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-semibold tabular-nums">
                                {formatCurrency(Number(payout.net_payout_amount || payout.total_amount || 0))}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {(payout as any).is_voided ? (
                                <StatusBadge variant="destructive">ĐÃ HỦY</StatusBadge>
                              ) : (
                                <StatusBadge
                                  variant={getOtaPayoutStatusVariant(payout.status) as any}
                                  dot
                                >
                                  {getStatusLabel(payout.status)}
                                </StatusBadge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-0.5">
                                {hasEditPermission && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                                          onClick={(e) => { e.stopPropagation(); setEditingPayout(payout); }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Chỉnh sửa</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <Link to={`/ota-payouts/${payout.id}`} onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                          <td className="px-4 py-3 text-xs uppercase text-muted-foreground" colSpan={6}>
                            Tổng ({totalCount} payout)
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">
                            {formatCurrency(filteredTotals.grossAmount)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">
                            {filteredTotals.deductionTotal !== 0 ? (
                              <span className={filteredTotals.deductionTotal < 0 ? "text-destructive" : "text-success"}>
                                {formatCurrency(filteredTotals.deductionTotal)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums">
                            {filteredTotals.bankFeeTotal > 0 ? (
                              <span className="text-warning">{formatCurrency(filteredTotals.bankFeeTotal)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm tabular-nums text-primary">
                            {formatCurrency(filteredTotals.netAmount)}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <DataTablePagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    displayedItems={displayedCount}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    itemLabel="payout"
                  />
                </>
              )}
            </SectionCard>

            {/* Bank Fee Report — hidden per request */}
            {/* <BankFeeReportCard /> */}

          </TabsContent>
        </Tabs>
      </PageContainer>

      {/* Create Dialog */}
      <CreatePayoutDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      {/* Multi-Payout Cash-In Dialog */}
      <RecordMultiPayoutCashInDialog
        open={cashInDialogOpen}
        onOpenChange={setCashInDialogOpen}
      />

      {/* Edit Payout Dialog */}
      <EditPayoutDialog
        open={!!editingPayout}
        onOpenChange={(open) => { if (!open) setEditingPayout(null); }}
        payout={editingPayout}
      />
    </>
  );
}
