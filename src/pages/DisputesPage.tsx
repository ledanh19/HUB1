import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { OtaBadge } from "@/components/ui/ota-badge";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Plus,
  MoreHorizontal,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Info,
  CreditCard,
  Building,
} from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  useDisputeTracking,
  useDisputeStats,
  useUpdateDispute,
  DISPUTE_STATUS_DISPLAY,
  ALL_DISPUTE_TYPE_DISPLAY,
  OTA_DISPUTE_TYPE_DISPLAY,
  HOTEL_DISPUTE_TYPE_DISPLAY,
  type DisputeStatus,
  type DisputeType,
  type DisputeCategory,
  type Dispute,
} from "@/hooks/useDisputeTracking";
import { CreateDisputeDialog } from "@/components/dispute/CreateDisputeDialog";
import { useTablePagination } from "@/hooks/useTablePagination";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function DisputesPage() {
  const navigate = useNavigate();
  const { canUsePage } = useCurrentUserPagePermissions();
  const canPerformActions = canUsePage('/disputes');

  const [statusFilter, setStatusFilter] = useState<DisputeStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<DisputeType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<DisputeCategory | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);

  // Update form state
  const [newStatus, setNewStatus] = useState<DisputeStatus | "">("");
  const [resolutionNote, setResolutionNote] = useState("");

  const disputesQuery = useDisputeTracking({

    status: statusFilter,
    type: typeFilter,
    category: categoryFilter,
  });
  const { data: disputes = [], isLoading } = disputesQuery;

  usePrefetchMountLog('DisputesPage', [
    { key: ['dispute_tracking'], query: disputesQuery },
  ]);
  const stats = useDisputeStats();
  const updateMutation = useUpdateDispute();

  // Filter by search term
  const filteredDisputes = disputes.filter((dispute) =>
    dispute.unified_booking_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (dispute.guest_name && dispute.guest_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredDisputes, { defaultPageSize: 10, resetDeps: [searchTerm, statusFilter, typeFilter, categoryFilter] });

  const handleUpdateSubmit = async () => {
    if (!selectedDispute || !newStatus) return;

    await updateMutation.mutateAsync({
      id: selectedDispute.id,
      status: newStatus,
      resolution_note: resolutionNote || undefined,
    });

    setUpdateDialogOpen(false);
    setSelectedDispute(null);
    resetUpdateForm();
  };

  const resetUpdateForm = () => {
    setNewStatus("");
    setResolutionNote("");
  };

  const openUpdateDialog = (dispute: Dispute) => {
    setSelectedDispute(dispute);
    setNewStatus(dispute.status as DisputeStatus);
    setResolutionNote(dispute.resolution_note || "");
    setUpdateDialogOpen(true);
  };

  return (
    <>
      <Header
        title="Case Center"
        subtitle=""
        actions={
          <div className="flex items-center gap-2">
            {canPerformActions && (
              <Button size="sm" className="gap-2" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Tạo</span>
              </Button>
            )}
          </div>
        }
      />

      <PageContainer>
        <SectionCard>
          {/* Stats - Mobile scroll */}
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 lg:grid-cols-6 md:overflow-visible scrollbar-hide">
            <MetricCard
              title="Đang mở"
              value={stats.openCount}
              subtitle={formatCurrency(stats.openAmount)}
              icon={AlertTriangle}
              onClick={() => setStatusFilter("NEW")}
              className="w-[160px] md:w-auto shrink-0"
            />
            <MetricCard
              title="OTA"
              value={stats.otaOpenCount}
              subtitle={`/ ${stats.otaCount}`}
              icon={CreditCard}
              onClick={() => setCategoryFilter("OTA_COLLECT")}
              className="w-[160px] md:w-auto shrink-0"
            />
            <MetricCard
              title="Hotel"
              value={stats.hotelOpenCount}
              subtitle={`/ ${stats.hotelCount}`}
              icon={Building}
              onClick={() => setCategoryFilter("HOTEL_COLLECT")}
              className="w-[160px] md:w-auto shrink-0"
            />
            <MetricCard
              title="Xử lý"
              value={stats.processingCount}
              icon={Clock}
              onClick={() => setStatusFilter("PROCESSING")}
              className="w-[160px] md:w-auto shrink-0"
            />
            <MetricCard
              title="Thu đc"
              value={stats.winCount}
              subtitle={formatCurrency(stats.winAmount)}
              icon={CheckCircle}
              onClick={() => setStatusFilter("RESOLVED_WIN")}
              className="w-[160px] md:w-auto shrink-0"
            />
            <MetricCard
              title="Mất"
              value={stats.lossCount}
              subtitle={formatCurrency(stats.lossAmount)}
              icon={XCircle}
              onClick={() => setStatusFilter("RESOLVED_LOSS")}
              className="w-[160px] md:w-auto shrink-0"
            />
          </div>

          {/* Filters */}
          <FilterBar
            title="Bộ lọc"
            subtitle="Tìm kiếm và lọc tranh chấp"
            hasActiveFilters={!!(searchTerm || statusFilter !== "all" || typeFilter !== "all" || categoryFilter !== "all")}
            onClearFilters={() => {
              setSearchTerm("");
              setStatusFilter("all");
              setTypeFilter("all");
              setCategoryFilter("all");
            }}
          >
            <FilterBar.Field label="Tìm kiếm" colSpan={2}>
              <DebouncedSearch
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Tìm booking, khách..."
              />
            </FilterBar.Field>

            <FilterBar.Field label="Nguồn">
              <Select
                value={categoryFilter}
                onValueChange={(v) => setCategoryFilter(v as DisputeCategory | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="OTA_COLLECT">OTA</SelectItem>
                  <SelectItem value="HOTEL_COLLECT">Hotel</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Trạng thái">
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as DisputeStatus | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="NEW">Mới</SelectItem>
                  <SelectItem value="PROCESSING">Xử lý</SelectItem>
                  <SelectItem value="RESOLVED_WIN">Thu đc</SelectItem>
                  <SelectItem value="RESOLVED_LOSS">Mất</SelectItem>
                  <SelectItem value="CLOSED">Kết thúc</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>

            <FilterBar.Field label="Loại tranh chấp">
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as DisputeType | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">OTA</div>
                  {Object.entries(OTA_DISPUTE_TYPE_DISPLAY).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground mt-1">Hotel</div>
                  {Object.entries(HOTEL_DISPUTE_TYPE_DISPLAY).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>
          </FilterBar>

          {/* Disputes List */}
          {isLoading ? (
            <PageSkeleton cards={0} rows={6} columns={8} />
          ) : filteredDisputes.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Chưa có tranh chấp</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {paginatedData.map((dispute) => {
                  const statusDisplay = DISPUTE_STATUS_DISPLAY[dispute.status as DisputeStatus] ||
                    DISPUTE_STATUS_DISPLAY.NEW;
                  const typeDisplay = ALL_DISPUTE_TYPE_DISPLAY[dispute.dispute_type as DisputeType] ||
                    { label: dispute.dispute_type, description: "", category: "OTA_COLLECT" as DisputeCategory };
                  const isOpen = dispute.status === "NEW" || dispute.status === "PROCESSING";

                  return (
                    <div
                      key={dispute.id}
                      className={`rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors ${isOpen ? "bg-warning/5 border-warning/30" : ""
                        }`}
                      onClick={() => navigate(`/disputes/${dispute.id}`)}
                    >
                      {/* Row 1: Source + Amount */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {dispute.ota_source ? (
                            <OtaBadge source={dispute.ota_source} />
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              <Building className="h-3 w-3 mr-1" />
                              Hotel
                            </Badge>
                          )}
                          <StatusBadge variant={statusDisplay.variant as any} dot size="sm">
                            {statusDisplay.label}
                          </StatusBadge>
                        </div>
                        <span className="font-bold text-sm text-destructive flex-shrink-0">
                          {formatCurrency(Number(dispute.amount_in_dispute))}
                        </span>
                      </div>

                      {/* Row 2: Booking + Type + Date */}
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-medium text-foreground">
                            {formatBookingCode(dispute.unified_booking_id, (dispute as any).ota_booking_code, dispute.ota_source)}
                          </span>
                          {dispute.guest_name && (
                            <span className="text-muted-foreground"> · {dispute.guest_name}</span>
                          )}
                          <span className="truncate">{typeDisplay.label}</span>
                        </div>
                        <span className="flex-shrink-0">
                          {dispute.last_activity_at
                            ? new Date(dispute.last_activity_at).toLocaleDateString("vi-VN")
                            : dispute.opened_at
                              ? new Date(dispute.opened_at).toLocaleDateString("vi-VN")
                              : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[90px]">
                        Nguồn
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[140px]">
                        Mã ĐP
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[120px]">
                        Khách
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[120px]">
                        OTA Payout
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[140px]">
                        Loại
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase w-[130px]">
                        Số tiền
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[100px]">
                        Trạng thái
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[100px]">
                        Cập nhật
                      </th>
                      <th className="px-4 py-3 w-[50px]"></th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[80px]">
                        Case
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedData.map((dispute) => {
                      const statusDisplay = DISPUTE_STATUS_DISPLAY[dispute.status as DisputeStatus] ||
                        DISPUTE_STATUS_DISPLAY.NEW;
                      const typeDisplay = ALL_DISPUTE_TYPE_DISPLAY[dispute.dispute_type as DisputeType] ||
                        { label: dispute.dispute_type, description: "", category: "OTA_COLLECT" as DisputeCategory };
                      const isOpen = dispute.status === "NEW" || dispute.status === "PROCESSING";

                      return (
                        <tr
                          key={dispute.id}
                          className={`hover:bg-muted/30 transition-colors cursor-pointer ${isOpen ? "bg-warning/5" : ""
                            }`}
                          onClick={() => navigate(`/disputes/${dispute.id}`)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {dispute.ota_source ? (
                                <OtaBadge source={dispute.ota_source} />
                              ) : (
                                <Badge variant="secondary" className="text-xs w-fit">
                                  <Building className="h-3 w-3 mr-1" />
                                  Hotel
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/bookings/${dispute.unified_booking_id}`}
                              className="font-medium text-primary hover:underline text-sm"
                            >
                              {formatBookingCode(dispute.unified_booking_id, (dispute as any).ota_booking_code, dispute.ota_source)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {dispute.guest_name || '—'}
                          </td>
                          <td className="px-4 py-3">
                            {dispute.payout_id ? (
                              <Link
                                to={`/ota-payouts/${dispute.payout_id}`}
                                className="text-sm text-primary hover:underline"
                              >
                                {dispute.payout_code || "Xem Payout"}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="text-sm">{typeDisplay.label}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{typeDisplay.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold text-destructive">
                              {formatCurrency(Number(dispute.amount_in_dispute))}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <StatusBadge variant={statusDisplay.variant as any} dot>
                                    {statusDisplay.label}
                                  </StatusBadge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{statusDisplay.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {dispute.last_activity_at
                              ? new Date(dispute.last_activity_at).toLocaleDateString("vi-VN")
                              : dispute.opened_at
                                ? new Date(dispute.opened_at).toLocaleDateString("vi-VN")
                                : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link to={`/disputes/${dispute.id}`}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Xem chi tiết
                                  </Link>
                                </DropdownMenuItem>
                                {canPerformActions && isOpen && (
                                  <DropdownMenuItem onClick={() => openUpdateDialog(dispute)}>
                                    <Clock className="mr-2 h-4 w-4" />
                                    Cập nhật trạng thái
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={(dispute as any).case_type === "REFUND" ? "destructive" : "secondary"} className="text-xs">
                              {(dispute as any).case_type === "REFUND" ? "Hoàn tiền" : "Tranh chấp"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
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
                itemLabel="tranh chấp"
                className="border-t-0 rounded-b-xl border border-border bg-card"
              />
            </>
          )}
        </SectionCard>
      </PageContainer>

      {/* Create Dialog */}
      <CreateDisputeDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {/* Update Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cập nhật tranh chấp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedDispute && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div>Booking: {selectedDispute.unified_booking_id}</div>
                <div>Số tiền: {formatCurrency(Number(selectedDispute.amount_in_dispute))}</div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Trạng thái mới *</Label>
              <Select
                value={newStatus}
                onValueChange={(v) => setNewStatus(v as DisputeStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DISPUTE_STATUS_DISPLAY).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      <div>
                        <div>{value.label}</div>
                        <div className="text-xs text-muted-foreground">{value.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ghi chú kết quả</Label>
              <Textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Ghi chú về kết quả xử lý..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleUpdateSubmit}
              disabled={!newStatus || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
