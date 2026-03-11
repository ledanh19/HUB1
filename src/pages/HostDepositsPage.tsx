import { useState, useMemo } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { StatusBadge } from "@/components/ui/status-badge";
import { getHostDepositStatusVariant, getHostDepositStatusLabel } from "@/constants/status-config";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  PiggyBank,
  Wallet,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Link,
  ExternalLink,
  XCircle,
  Lock,
} from "lucide-react";
import { Link as RouterLink } from "react-router-dom";
import {
  useHostDepositRequests,
  useHostDepositStats,
  HostDepositRequest,
  hostDepositStatusLabels,
} from "@/hooks/useHostDepositRequests";
import { useCanManageDeposits } from "@/hooks/useHostDeposits";
import { useCreateHostDepositRefundRequest } from "@/hooks/useHostDepositRefund";
import { MetricCard } from "@/components/ui/metric-card";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";

type RequestStatus = "PENDING" | "APPROVED" | "PAID" | "REJECTED" | "ALL";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
};

export default function HostDepositsPage() {
  const [activeTab, setActiveTab] = useState<"deposit" | "prepaid">("deposit");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatus>("ALL");

  // Refund dialog state
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<HostDepositRequest | null>(null);
  const [refundNote, setRefundNote] = useState("");

  // Fetch data from payment_requests table (unified source)
  const depositQuery = useHostDepositRequests({ purpose: "HOST_DEPOSIT" });
  const { data: depositRequests = [], isLoading: depositsLoading } = depositQuery;
  const { data: prepaidRequests = [], isLoading: prepaidsLoading } = useHostDepositRequests({ purpose: "HOST_PREPAID" });
  const { data: stats } = useHostDepositStats();
  const { data: canManage } = useCanManageDeposits();

  const refundMutation = useCreateHostDepositRefundRequest();

  usePrefetchMountLog('HostDepositsPage', [
    { key: ['host-deposit-requests', { purpose: 'HOST_DEPOSIT' }], query: depositQuery },
  ]);

  // Filter deposits
  const filteredDeposits = useMemo(() => {
    return depositRequests.filter((d) => {
      const matchSearch =
        d.unified_booking_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.partner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.request_code?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === "ALL" || d.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [depositRequests, searchTerm, statusFilter]);

  // Filter prepaids
  const filteredPrepaids = useMemo(() => {
    return prepaidRequests.filter((p) => {
      const matchSearch =
        p.unified_booking_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.partner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.request_code?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === "ALL" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [prepaidRequests, searchTerm, statusFilter]);

  const handleRefundClick = (item: HostDepositRequest) => {
    setSelectedItem(item);
    setRefundNote("");
    setRefundDialogOpen(true);
  };

  const handleRefundConfirm = async () => {
    if (!selectedItem) return;

    await refundMutation.mutateAsync({
      original_request_id: selectedItem.id,
      partner_id: selectedItem.partner_id,
      partner_name: selectedItem.partner_name || "",
      unified_booking_id: selectedItem.unified_booking_id,
      amount: selectedItem.proposed_amount,
      note: refundNote,
    });

    setRefundDialogOpen(false);
    setSelectedItem(null);
  };

  // Pagination for deposits tab
  const depositPagination = useTablePagination(filteredDeposits, { defaultPageSize: 10, resetDeps: [searchTerm, statusFilter] });
  // Pagination for prepaids tab
  const prepaidPagination = useTablePagination(filteredPrepaids, { defaultPageSize: 10, resetDeps: [searchTerm, statusFilter] });

  // Chỉ có thể đề xuất hoàn cọc khi: status = PAID (đã chi tiền) VÀ chưa có refund request VÀ chưa cấn trừ vào quyết toán
  const canRefund = (item: HostDepositRequest) => {
    return item.status === "PAID" && !item.has_refund_request && !item.is_applied;
  };

  const isLoading = depositsLoading || prepaidsLoading;
  if (isLoading) return <><Header title="Host Deposits" subtitle="Quản lý ký quỹ Host" icon={PiggyBank} /><PageSkeleton cards={5} rows={6} columns={8} /></>;

  return (
    <>
      <Header title="Host Deposits" subtitle="Quản lý ký quỹ Host" icon={PiggyBank} />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground">
                  Theo dõi trạng thái đặt cọc, trả trước. Mọi thao tác chi tiền thực hiện tại{" "}
                  <RouterLink to="/payments/requests" className="text-primary hover:underline inline-flex items-center gap-1">
                    Đề xuất thanh toán <ExternalLink className="h-3 w-3" />
                  </RouterLink>
                </p>
              </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "deposit" | "prepaid")}>
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="deposit" className="flex items-center gap-2">
                  <PiggyBank className="h-4 w-4" />
                  Đặt cọc ({depositRequests.length})
                </TabsTrigger>
                <TabsTrigger value="prepaid" className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Trả trước ({prepaidRequests.length})
                </TabsTrigger>
              </TabsList>

              {/* Deposit Tab */}
              <TabsContent value="deposit" className="space-y-4">
                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-5">
                  <MetricCard
                    title="Chờ duyệt"
                    value={formatCurrency(stats?.deposit.pending.amount || 0)}
                    icon={Clock}
                    subtitle={`${stats?.deposit.pending.count || 0} khoản`}
                  />
                  <MetricCard
                    title="Đã duyệt - Chưa chi"
                    value={formatCurrency(stats?.deposit.approved.amount || 0)}
                    icon={CheckCircle2}
                    subtitle={`${stats?.deposit.approved.count || 0} khoản`}
                  />
                  <MetricCard
                    title="Đã chi tiền"
                    value={formatCurrency(stats?.deposit.paid.amount || 0)}
                    icon={ArrowRightLeft}
                    subtitle={`${stats?.deposit.paid.count || 0} khoản`}
                  />
                  <MetricCard
                    title="Đã cấn trừ"
                    value={formatCurrency(stats?.deposit.applied?.amount || 0)}
                    icon={Lock}
                    subtitle={`${stats?.deposit.applied?.count || 0} khoản (trong đã chi)`}
                  />
                  <MetricCard
                    title="Từ chối"
                    value={formatCurrency(stats?.deposit.rejected.amount || 0)}
                    icon={XCircle}
                    subtitle={`${stats?.deposit.rejected.count || 0} khoản`}
                  />
                </div>

                {/* Filters */}
                <FilterBar
                  title="Bộ lọc"
                  subtitle="Lọc đặt cọc Host"
                  hasActiveFilters={searchTerm !== "" || statusFilter !== "ALL"}
                  onClearFilters={() => { setSearchTerm(""); setStatusFilter("ALL"); }}
                >
                  <FilterBar.Field label="Tìm kiếm" colSpan={2}>
                    <DebouncedSearch
                      value={searchTerm}
                      onChange={setSearchTerm}
                      placeholder="Tìm theo mã booking, tên Host, mã đề xuất..."
                    />
                  </FilterBar.Field>
                  <FilterBar.Field label="Trạng thái">
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RequestStatus)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Tất cả</SelectItem>
                        <SelectItem value="PENDING">Chờ duyệt</SelectItem>
                        <SelectItem value="APPROVED">Đã duyệt - Chưa chi</SelectItem>
                        <SelectItem value="PAID">Đã chi tiền</SelectItem>
                        <SelectItem value="REJECTED">Từ chối</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterBar.Field>
                </FilterBar>

                {/* Table */}
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[130px]">Mã đề xuất</TableHead>
                          <TableHead className="w-[130px]">Mã Booking</TableHead>
                          <TableHead className="w-[150px]">Host</TableHead>
                          <TableHead className="w-[120px] text-right">Số tiền</TableHead>
                          <TableHead className="w-[140px]">Ngày tạo</TableHead>
                          <TableHead className="w-[140px]">Trạng thái</TableHead>
                          <TableHead className="w-[150px]">Ghi chú</TableHead>
                          <TableHead className="w-[160px] text-right">Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDeposits.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              Không có dữ liệu đặt cọc
                            </TableCell>
                          </TableRow>
                        ) : (
                          depositPagination.paginatedData.map((request) => (
                            <TableRow key={request.id}>
                              <TableCell className="font-mono text-sm">
                                <RouterLink
                                  to={`/payments/requests?highlight=${request.id}`}
                                  className="text-primary hover:underline"
                                >
                                  {request.request_code}
                                </RouterLink>
                              </TableCell>
                              <TableCell>
                                {request.unified_booking_id ? (
                                  <RouterLink
                                    to={`/bookings/${request.unified_booking_id}`}
                                    className="text-primary hover:underline font-mono text-sm"
                                    target="_blank"
                                  >
                                    {(request.booking_code || request.unified_booking_id.slice(-8)).replace(/^[A-Za-z]+-/, "")}
                                  </RouterLink>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="font-medium">
                                {request.partner_name || "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(request.proposed_amount)}
                              </TableCell>
                              <TableCell>
                                {format(new Date(request.requested_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <StatusBadge variant={getHostDepositStatusVariant(request.status) as any}>
                                    {getHostDepositStatusLabel(request.status)}
                                  </StatusBadge>
                                  {request.is_applied && (
                                    <StatusBadge variant="info" className="text-xs">
                                      <Lock className="h-3 w-3 mr-1" />
                                      Đã cấn trừ
                                    </StatusBadge>
                                  )}
                                  {request.settlement_code && !request.is_applied && (
                                    <span className="text-xs text-muted-foreground">
                                      QT: {request.settlement_code}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-40 truncate" title={request.note || ""}>
                                {request.note || "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                {request.has_refund_request ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <RouterLink
                                      to={`/payments/requests?highlight=${request.refund_request_code}`}
                                      className="text-sm text-primary hover:underline"
                                    >
                                      {request.refund_request_code}
                                    </RouterLink>
                                    <StatusBadge
                                      variant={
                                        request.refund_request_status === "PAID" ? "success" :
                                          request.refund_request_status === "APPROVED" ? "default" :
                                            request.refund_request_status === "REJECTED" ? "danger" : "warning"
                                      }
                                    >
                                      {request.refund_request_status === "PAID" ? "Đã thu" :
                                        request.refund_request_status === "APPROVED" ? "Đã duyệt - Chờ thu" :
                                          request.refund_request_status === "REJECTED" ? "Từ chối" : "Chờ duyệt thu"}
                                    </StatusBadge>
                                  </div>
                                ) : request.is_applied ? (
                                  <span className="text-xs text-muted-foreground italic">
                                    Đã cấn trừ trong QT
                                  </span>
                                ) : canManage && canRefund(request) ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRefundClick(request)}
                                  >
                                    <ArrowDownLeft className="h-4 w-4 mr-1" />
                                    Đề xuất Thu cọc
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <DataTablePagination
                      currentPage={depositPagination.page}
                      totalPages={depositPagination.totalPages}
                      totalItems={depositPagination.totalCount}
                      displayedItems={depositPagination.displayedCount}
                      pageSize={depositPagination.pageSize}
                      onPageChange={depositPagination.setPage}
                      onPageSizeChange={depositPagination.setPageSize}
                      itemLabel="cọc"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Prepaid Tab */}
              <TabsContent value="prepaid" className="space-y-4">
                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-5">
                  <MetricCard
                    title="Chờ duyệt"
                    value={formatCurrency(stats?.prepaid.pending.amount || 0)}
                    icon={Clock}
                    subtitle={`${stats?.prepaid.pending.count || 0} khoản`}
                  />
                  <MetricCard
                    title="Đã duyệt - Chưa chi"
                    value={formatCurrency(stats?.prepaid.approved.amount || 0)}
                    icon={CheckCircle2}
                    subtitle={`${stats?.prepaid.approved.count || 0} khoản`}
                  />
                  <MetricCard
                    title="Đã chi tiền"
                    value={formatCurrency(stats?.prepaid.paid.amount || 0)}
                    icon={ArrowRightLeft}
                    subtitle={`${stats?.prepaid.paid.count || 0} khoản`}
                  />
                  <MetricCard
                    title="Đã cấn trừ"
                    value={formatCurrency(stats?.prepaid.applied?.amount || 0)}
                    icon={Lock}
                    subtitle={`${stats?.prepaid.applied?.count || 0} khoản (trong đã chi)`}
                  />
                  <MetricCard
                    title="Từ chối"
                    value={formatCurrency(stats?.prepaid.rejected.amount || 0)}
                    icon={XCircle}
                    subtitle={`${stats?.prepaid.rejected.count || 0} khoản`}
                  />
                </div>

                {/* Filters */}
                <FilterBar
                  title="Bộ lọc"
                  subtitle="Lọc trả trước Host"
                  hasActiveFilters={searchTerm !== "" || statusFilter !== "ALL"}
                  onClearFilters={() => { setSearchTerm(""); setStatusFilter("ALL"); }}
                >
                  <FilterBar.Field label="Tìm kiếm" colSpan={2}>
                    <DebouncedSearch
                      value={searchTerm}
                      onChange={setSearchTerm}
                      placeholder="Tìm theo mã booking, tên Host, mã đề xuất..."
                    />
                  </FilterBar.Field>
                  <FilterBar.Field label="Trạng thái">
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RequestStatus)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Tất cả</SelectItem>
                        <SelectItem value="PENDING">Chờ duyệt</SelectItem>
                        <SelectItem value="APPROVED">Đã duyệt - Chưa chi</SelectItem>
                        <SelectItem value="PAID">Đã chi tiền</SelectItem>
                        <SelectItem value="REJECTED">Từ chối</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterBar.Field>
                </FilterBar>

                {/* Table */}
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[130px]">Mã đề xuất</TableHead>
                          <TableHead className="w-[130px]">Mã Booking</TableHead>
                          <TableHead className="w-[150px]">Host</TableHead>
                          <TableHead className="w-[120px] text-right">Số tiền</TableHead>
                          <TableHead className="w-[140px]">Ngày tạo</TableHead>
                          <TableHead className="w-[140px]">Trạng thái</TableHead>
                          <TableHead className="w-[150px]">Ghi chú</TableHead>
                          <TableHead className="w-[160px] text-right">Thao tác</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPrepaids.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              Không có dữ liệu trả trước
                            </TableCell>
                          </TableRow>
                        ) : (
                          prepaidPagination.paginatedData.map((request) => (
                            <TableRow key={request.id}>
                              <TableCell className="font-mono text-sm">
                                <RouterLink
                                  to={`/payments/requests?highlight=${request.id}`}
                                  className="text-primary hover:underline"
                                >
                                  {request.request_code}
                                </RouterLink>
                              </TableCell>
                              <TableCell>
                                {request.unified_booking_id ? (
                                  <RouterLink
                                    to={`/bookings/${request.unified_booking_id}`}
                                    className="text-primary hover:underline font-mono text-sm"
                                    target="_blank"
                                  >
                                    {(request.booking_code || request.unified_booking_id.slice(-8)).replace(/^[A-Za-z]+-/, "")}
                                  </RouterLink>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="font-medium">
                                {request.partner_name || "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(request.proposed_amount)}
                              </TableCell>
                              <TableCell>
                                {format(new Date(request.requested_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-1">
                                  <StatusBadge variant={getHostDepositStatusVariant(request.status) as any}>
                                    {getHostDepositStatusLabel(request.status)}
                                  </StatusBadge>
                                  {request.is_applied && (
                                    <StatusBadge variant="info" className="text-xs">
                                      <Lock className="h-3 w-3 mr-1" />
                                      Đã cấn trừ
                                    </StatusBadge>
                                  )}
                                  {request.settlement_code && !request.is_applied && (
                                    <span className="text-xs text-muted-foreground">
                                      QT: {request.settlement_code}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-40 truncate" title={request.note || ""}>
                                {request.note || "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                {request.has_refund_request ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <RouterLink
                                      to={`/payments/requests?highlight=${request.refund_request_code}`}
                                      className="text-sm text-primary hover:underline"
                                    >
                                      {request.refund_request_code}
                                    </RouterLink>
                                    <StatusBadge
                                      variant={
                                        request.refund_request_status === "PAID" ? "success" :
                                          request.refund_request_status === "APPROVED" ? "default" :
                                            request.refund_request_status === "REJECTED" ? "danger" : "warning"
                                      }
                                    >
                                      {request.refund_request_status === "PAID" ? "Đã thu" :
                                        request.refund_request_status === "APPROVED" ? "Đã duyệt - Chờ thu" :
                                          request.refund_request_status === "REJECTED" ? "Từ chối" : "Chờ duyệt thu"}
                                    </StatusBadge>
                                  </div>
                                ) : request.is_applied ? (
                                  <span className="text-xs text-muted-foreground italic">
                                    Đã cấn trừ trong QT
                                  </span>
                                ) : canManage && canRefund(request) ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRefundClick(request)}
                                  >
                                    <ArrowDownLeft className="h-4 w-4 mr-1" />
                                    Đề xuất Thu tiền
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <DataTablePagination
                      currentPage={prepaidPagination.page}
                      totalPages={prepaidPagination.totalPages}
                      totalItems={prepaidPagination.totalCount}
                      displayedItems={prepaidPagination.displayedCount}
                      pageSize={prepaidPagination.pageSize}
                      onPageChange={prepaidPagination.setPage}
                      onPageSizeChange={prepaidPagination.setPageSize}
                      itemLabel="cọc"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </SectionCard>
      </PageContainer>

      {/* Collect Deposit Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Đề xuất {selectedItem?.purpose === "HOST_DEPOSIT" ? "Thu cọc" : "Thu tiền trả trước"} từ Host
            </DialogTitle>
            <DialogDescription>
              Tạo đề xuất thu tiền từ Host. Sau khi được duyệt, sẽ thực hiện thu tiền và ghi nhận phiếu thu.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Mã đề xuất gốc:</span>
                  <p className="font-medium">{selectedItem.request_code}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Host:</span>
                  <p className="font-medium">{selectedItem.partner_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Booking:</span>
                  <p className="font-medium">{selectedItem.unified_booking_id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Số tiền thu:</span>
                  <p className="font-medium text-primary">{formatCurrency(selectedItem.proposed_amount)}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Ghi chú</label>
                <Textarea
                  placeholder="Lý do thu tiền từ Host..."
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleRefundConfirm}
              disabled={refundMutation.isPending}
            >
              {refundMutation.isPending ? "Đang xử lý..." : "Tạo đề xuất thu tiền"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
