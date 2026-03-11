import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Search, Eye, ArrowRight, ArrowDownLeft, FileText,
  Receipt, Wallet, Clock, CheckCircle2, AlertCircle,
  Building2, Briefcase, AlertTriangle
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  useSettlementHistory,
  useHostsForFilter,
  SettlementType,
  PaymentStatusComputed,
  SettlementWithComputed
} from "@/hooks/useSettlementHistory";
import { getPaymentStatusVariant } from "@/constants/status-config";
import { CollectSettlementDialog } from "@/components/settlement/CollectSettlementDialog";
import { SettlementDetailDialog } from "@/components/settlement/SettlementDetailDialog";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { FilterBar } from "@/components/ui/filter-bar";

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return "-";
  return format(new Date(dateString), "dd/MM/yyyy", { locale: vi });
};

// Labels based on direction: RECEIVE = thu, PAY = thanh toán
const getPaymentStatusLabel = (status: PaymentStatusComputed, direction: "PAY" | "RECEIVE"): string => {
  if (direction === "RECEIVE") {
    const labels: Record<PaymentStatusComputed, string> = {
      UNPAID: "Chưa thu",
      PARTIAL: "Thu một phần",
      PAID: "Đã thu đủ",
      OVERPAID: "Thu dư",
    };
    return labels[status];
  }
  const labels: Record<PaymentStatusComputed, string> = {
    UNPAID: "Chưa thanh toán",
    PARTIAL: "Thanh toán một phần",
    PAID: "Đã thanh toán",
    OVERPAID: "Trả dư",
  };
  return labels[status];
};



export default function SettlementHistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<{
    settlementType?: SettlementType;
    entityId?: string;
    paymentStatus?: PaymentStatusComputed;
    search?: string;
  }>({});

  const [selectedSettlement, setSelectedSettlement] = useState<SettlementWithComputed | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [collectDialogOpen, setCollectDialogOpen] = useState(false);
  const [settlementForCollect, setSettlementForCollect] = useState<SettlementWithComputed | null>(null);

  const { data: settlements, isLoading } = useSettlementHistory(filters);
  const { data: hosts } = useHostsForFilter();

  // Deep-link: auto-open settlement detail from URL params (?open=<id>&type=HOST|SERVICE)
  const openSettlementId = searchParams.get("open");
  const openSettlementType = (searchParams.get("type") || "HOST") as "HOST" | "SERVICE";

  useEffect(() => {
    if (openSettlementId && !isLoading) {
      // Try to find the settlement in the loaded data
      const found = settlements?.find(s => s.id === openSettlementId);
      if (found) {
        setSelectedSettlement(found);
        setDetailDialogOpen(true);
      } else {
        // Settlement not in filtered list — open directly via ID
        setSelectedSettlement({ id: openSettlementId, settlement_type: openSettlementType } as any);
        setDetailDialogOpen(true);
      }
      // Clear the URL param to prevent re-opening on re-render
      searchParams.delete("open");
      searchParams.delete("type");
      setSearchParams(searchParams, { replace: true });
    }
  }, [openSettlementId, isLoading, settlements]);

  // Compute KPIs
  const kpis = useMemo(() => {
    if (!settlements) return { total: 0, unpaid: 0, rsPay: 0, rsReceive: 0 };

    // Exclude VOID settlements from KPIs
    const active = settlements.filter(s => s.settlement_status !== "VOID");
    const unpaid = active.filter(s => s.payment_status === "UNPAID" || s.payment_status === "PARTIAL");
    const rsPay = active.filter(s => s.net_direction === "PAY" && s.remaining_amount > 0);
    const rsReceive = active.filter(s => s.net_direction === "RECEIVE" && s.remaining_amount > 0);

    return {
      total: settlements.length,
      unpaid: unpaid.length,
      rsPay: rsPay.reduce((sum, s) => sum + s.remaining_amount, 0),
      rsReceive: rsReceive.reduce((sum, s) => sum + s.remaining_amount, 0),
    };
  }, [settlements]);

  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(settlements ?? [], { defaultPageSize: 10, resetDeps: [filters] });

  const handleViewDetail = (settlement: SettlementWithComputed) => {
    setSelectedSettlement(settlement);
    setDetailDialogOpen(true);
  };

  const handleGoToPayment = (settlement: SettlementWithComputed) => {
    navigate(`/payments/requests?settlementId=${settlement.id}&type=${settlement.settlement_type}`);
  };

  const handleGoToCollect = (settlement: SettlementWithComputed) => {
    setSettlementForCollect(settlement);
    setCollectDialogOpen(true);
  };

  return (
    <>
      <Header
        title="Danh sách Phiếu Quyết toán"
        subtitle="Quản lý và theo dõi các phiếu quyết toán đã chốt với Host & Đối tác dịch vụ"
      />

      <PageContainer><SectionCard>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Tổng phiếu" value={kpis.total} icon={FileText} />
          <MetricCard title="Chưa hoàn tất" value={kpis.unpaid} icon={Clock} />
          <MetricCard title="RS phải trả" value={formatCurrency(kpis.rsPay)} icon={Wallet} valueClassName="text-info" />
          <MetricCard title="RS phải thu" value={formatCurrency(kpis.rsReceive)} icon={Receipt} valueClassName="text-primary" />
        </div>

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Lọc phiếu quyết toán"
          hasActiveFilters={!!(filters.settlementType || filters.entityId || filters.paymentStatus || filters.search)}
          onClearFilters={() => setFilters({})}
        >
          <FilterBar.Field label="Loại quyết toán">
            <Select
              value={filters.settlementType || "ALL"}
              onValueChange={(v) => setFilters(prev => ({
                ...prev,
                settlementType: v === "ALL" ? undefined : v as SettlementType,
                entityId: undefined
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Loại quyết toán" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả loại</SelectItem>
                <SelectItem value="HOST">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Host
                  </div>
                </SelectItem>
                <SelectItem value="SERVICE">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Dịch vụ
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>

          {filters.settlementType === "HOST" && (
            <FilterBar.Field label="Chọn Host">
              <Select
                value={filters.entityId || "ALL"}
                onValueChange={(v) => setFilters(prev => ({
                  ...prev,
                  entityId: v === "ALL" ? undefined : v
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn Host" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả Host</SelectItem>
                  {hosts?.map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.partner_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>
          )}

          <FilterBar.Field label="Trạng thái thanh toán">
            <Select
              value={filters.paymentStatus || "ALL"}
              onValueChange={(v) => setFilters(prev => ({
                ...prev,
                paymentStatus: v === "ALL" ? undefined : v as PaymentStatusComputed
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                <SelectItem value="UNPAID">Chưa thanh toán</SelectItem>
                <SelectItem value="PARTIAL">Thanh toán một phần</SelectItem>
                <SelectItem value="PAID">Đã hoàn tất</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>

          <FilterBar.Field label="Tìm kiếm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm mã phiếu, tên..."
                className="pl-10"
                value={filters.search || ""}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>
          </FilterBar.Field>
        </FilterBar>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Phiếu quyết toán đã chốt</CardTitle>
            <CardDescription>
              Nhấn vào dòng để xem chi tiết. "RS phải trả" → Chi tiền. "RS phải nhận" → Thu tiền.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Đang tải...</div>
            ) : settlements && settlements.length > 0 ? (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-2">
                  {paginatedData.map((settlement) => (
                    <div
                      key={settlement.id}
                      className="rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors"
                      onClick={() => handleViewDetail(settlement)}
                    >
                      {/* Row 1: Code + Status */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {settlement.settlement_type === "HOST" ? (
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <span className="text-xs font-mono font-medium">{settlement.settlement_code}</span>
                        </div>
                        {settlement.settlement_status === "VOID" ? (
                          <StatusBadge variant="cancelled" size="sm">Đã hủy</StatusBadge>
                        ) : (
                          <StatusBadge variant={getPaymentStatusVariant(settlement.payment_status) as any} size="sm">
                            {getPaymentStatusLabel(settlement.payment_status, settlement.net_direction)}
                          </StatusBadge>
                        )}
                      </div>
                      {/* Row 2: Entity */}
                      <div className="text-xs font-medium text-foreground mb-1">{settlement.entity_name}</div>
                      {/* Row 3: Period */}
                      <div className="text-xs text-muted-foreground mb-1">
                        {formatDate(settlement.period_from)} → {formatDate(settlement.period_to)}
                      </div>
                      {/* Row 4: Amount + Direction + Remaining */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm tabular-nums">{formatCurrency(Math.abs(settlement.net_amount))}</span>
                          <Badge variant="secondary" className={`text-[10px] h-5 ${settlement.net_direction === "PAY" ? "bg-info/10 text-info" : "bg-primary/10 text-primary"}`}>
                            {settlement.net_direction === "PAY" ? "RS trả" : "RS nhận"}
                          </Badge>
                        </div>
                        {settlement.settlement_status === "VOID" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : settlement.remaining_amount > 0 ? (
                          <span className="text-xs font-semibold text-destructive tabular-nums">
                            Còn: {formatCurrency(settlement.remaining_amount)}
                          </span>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        )}
                      </div>
                      {/* Row 5: Actions */}
                      <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/30" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                          onClick={() => handleViewDetail(settlement)}>
                          <Eye className="h-3 w-3" /> Xem
                        </Button>
                        {settlement.settlement_status !== "VOID" && settlement.remaining_amount > 0 && settlement.net_direction === "PAY" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary"
                            onClick={() => handleGoToPayment(settlement)}>
                            <ArrowRight className="h-3 w-3" /> Chi tiền
                          </Button>
                        )}
                        {settlement.settlement_status !== "VOID" && settlement.remaining_amount > 0 && settlement.net_direction === "RECEIVE" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary"
                            onClick={() => handleGoToCollect(settlement)}>
                            <ArrowDownLeft className="h-3 w-3" /> Thu tiền
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[130px]">Mã phiếu</TableHead>
                        <TableHead className="w-[160px]">Đối tượng</TableHead>
                        <TableHead className="w-[180px]">Kỳ</TableHead>
                        <TableHead className="w-[120px] text-right">NET</TableHead>
                        <TableHead className="w-[90px] text-center">Hướng</TableHead>
                        <TableHead className="w-[120px] text-right">Còn lại</TableHead>
                        <TableHead className="w-[130px] text-center">Trạng thái</TableHead>
                        <TableHead className="w-[100px] text-center">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((settlement) => (
                        <TableRow
                          key={settlement.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleViewDetail(settlement)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {settlement.settlement_type === "HOST" ? (
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-mono text-sm font-medium">
                                {settlement.settlement_code}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{settlement.entity_name}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(settlement.period_from)} → {formatDate(settlement.period_to)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(Math.abs(settlement.net_amount))}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="secondary"
                              className={settlement.net_direction === "PAY"
                                ? "bg-info/10 text-info"
                                : "bg-primary/10 text-primary"
                              }
                            >
                              {settlement.net_direction === "PAY" ? "RS trả" : "RS nhận"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {settlement.settlement_status === "VOID" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : settlement.remaining_amount > 0 ? (
                              <span className="font-semibold text-destructive dark:text-destructive">
                                {formatCurrency(settlement.remaining_amount)}
                              </span>
                            ) : (
                              <span className="text-success">
                                <CheckCircle2 className="h-4 w-4 inline" />
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="inline-flex items-center gap-1">
                              {settlement.settlement_status === "VOID" ? (
                                <StatusBadge variant="cancelled">Đã hủy</StatusBadge>
                              ) : (
                                <StatusBadge variant={getPaymentStatusVariant(settlement.payment_status) as any}>
                                  {getPaymentStatusLabel(settlement.payment_status, settlement.net_direction)}
                                </StatusBadge>
                              )}
                              {settlement.dual_paid_warning && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                      Phiếu có dữ liệu thanh toán ở 2 nguồn (cash_outs &amp; cashflow_entries) với số tiền chênh lệch. Vui lòng kiểm tra tránh ghi trùng.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewDetail(settlement)}
                                title="Xem chi tiết"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {settlement.settlement_status !== "VOID" && settlement.remaining_amount > 0 && settlement.net_direction === "PAY" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleGoToPayment(settlement)}
                                  title="Chi tiền"
                                  className="text-primary hover:text-primary hover:bg-primary/5"
                                >
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              )}
                              {settlement.settlement_status !== "VOID" && settlement.remaining_amount > 0 && settlement.net_direction === "RECEIVE" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleGoToCollect(settlement)}
                                  title="Thu tiền"
                                  className="text-primary hover:text-primary hover:bg-primary/10"
                                >
                                  <ArrowDownLeft className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <DataTablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  displayedItems={displayedCount}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="phiếu"
                />
              </>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Chưa có phiếu quyết toán nào</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog - Using new comprehensive component */}
        <SettlementDetailDialog
          settlementId={selectedSettlement?.id || null}
          settlementType={selectedSettlement?.settlement_type as SettlementType || "HOST"}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onGoToPayment={() => {
            if (selectedSettlement) {
              setDetailDialogOpen(false);
              handleGoToPayment(selectedSettlement);
            }
          }}
          onGoToCollect={() => {
            if (selectedSettlement) {
              setDetailDialogOpen(false);
              handleGoToCollect(selectedSettlement);
            }
          }}
        />

        {/* Collect Settlement Dialog (for RS nhận) */}
        <CollectSettlementDialog
          open={collectDialogOpen}
          onOpenChange={setCollectDialogOpen}
          settlement={settlementForCollect}
        />
      </SectionCard></PageContainer>
    </>
  );
}
