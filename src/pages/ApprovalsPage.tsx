import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { StatusBadge } from "@/components/ui/status-badge";
import { getApprovalStatusVariant, getApprovalStatusLabel } from "@/constants/status-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Clock,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  AlertTriangle,
  Loader2,
  Settings,
  DollarSign,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { HEAVY_QUERY_OPTIONS } from "@/lib/navigation/heavyQueryOptions";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { supabase } from "@/integrations/supabase/client";
import {
  useRefundThreshold,
  useApproveRefundRequest,
  useRejectRefundRequest,
  useUpdateRefundThreshold,
} from "@/hooks/useRefundApproval";
import { Link } from "react-router-dom";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
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

interface ApprovalPayload {
  original_collection_id: string;
  unified_booking_id: string;
  amount: number;
  payment_method: string;
  reason_note: string;
}

export default function ApprovalsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [selectedApproval, setSelectedApproval] = useState<any | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [thresholdDialogOpen, setThresholdDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [newThreshold, setNewThreshold] = useState("");

  const { data: threshold = 1000000 } = useRefundThreshold();
  const approveRequest = useApproveRefundRequest();
  const rejectRequest = useRejectRefundRequest();
  const updateThreshold = useUpdateRefundThreshold();

  // Fetch approvals
  const approvalsQuery = useQuery({
    queryKey: ["approvals", statusFilter],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    ...HEAVY_QUERY_OPTIONS,
    queryFn: async () => {
      let query = supabase
        .from("approvals")
        .select("*")
        .eq("request_type", "REFUND")
        .order("created_at", { ascending: false });

      if (statusFilter !== "ALL") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
  const { data: approvals = [], isLoading, refetch } = approvalsQuery;

  usePrefetchMountLog('ApprovalsPage', [
    { key: ['approvals', statusFilter], query: approvalsQuery },
  ]);

  const handleApprove = async () => {
    if (!selectedApproval) return;
    await approveRequest.mutateAsync({
      approvalId: selectedApproval.id,
      note: "Approved",
    });
    setApproveDialogOpen(false);
    setSelectedApproval(null);
    refetch();
  };

  const handleReject = async () => {
    if (!selectedApproval || !rejectNote.trim()) return;
    await rejectRequest.mutateAsync({
      approvalId: selectedApproval.id,
      note: rejectNote.trim(),
    });
    setRejectDialogOpen(false);
    setSelectedApproval(null);
    setRejectNote("");
    refetch();
  };

  const handleUpdateThreshold = async () => {
    const value = parseFloat(newThreshold);
    if (isNaN(value) || value <= 0) return;
    await updateThreshold.mutateAsync(value);
    setThresholdDialogOpen(false);
    setNewThreshold("");
  };

  const pendingCount = approvals.filter((a) => a.status === "PENDING").length;

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(approvals, { defaultPageSize: 10, resetDeps: [statusFilter] });

  return (
    <>
      <Header
        title="Phê duyệt hoàn tiền"
        subtitle="Quản lý các yêu cầu hoàn tiền vượt ngưỡng"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewThreshold(threshold.toString());
                setThresholdDialogOpen(true);
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              Cấu hình ngưỡng
            </Button>
          </div>
        }
      />

      <PageContainer>
        <SectionCard>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-warning/10 p-3">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Chờ duyệt</p>
                  <p className="text-2xl font-semibold">{pendingCount}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ngưỡng hiện tại</p>
                  <p className="text-2xl font-semibold">{formatCurrency(threshold)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-muted p-3">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tổng yêu cầu</p>
                  <p className="text-2xl font-semibold">{approvals.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <FilterBar
            title="Bộ lọc"
            subtitle="Lọc yêu cầu phê duyệt"
            hasActiveFilters={statusFilter !== "PENDING"}
            onClearFilters={() => setStatusFilter("PENDING")}
          >
            <FilterBar.Field label="Trạng thái">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Chờ duyệt</SelectItem>
                  <SelectItem value="APPROVED">Đã duyệt</SelectItem>
                  <SelectItem value="REJECTED">Từ chối</SelectItem>
                  <SelectItem value="ALL">Tất cả</SelectItem>
                </SelectContent>
              </Select>
            </FilterBar.Field>
          </FilterBar>

          {/* Approvals Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : approvals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mb-2 opacity-50" />
                <p>Không có yêu cầu nào</p>
              </div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[140px]">
                        Thời gian
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[180px]">
                        Booking
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[130px]">
                        Người yêu cầu
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase w-[130px]">
                        Số tiền
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase w-[200px]">
                        Lý do
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase w-[100px]">
                        Trạng thái
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase w-[80px]">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedData.map((approval) => {
                      const payload = approval.request_payload as unknown as ApprovalPayload;

                      return (
                        <tr key={approval.id} className="hover:bg-muted/30">
                          <td className="px-6 py-4 text-sm">
                            {formatDateTime(approval.created_at)}
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              to={`/bookings/${payload.unified_booking_id}`}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              {payload.unified_booking_id}
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">
                            {approval.requested_by?.slice(0, 8) || "—"}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-semibold text-warning">
                            {formatCurrency(payload.amount)}
                          </td>
                          <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs truncate">
                            {payload.reason_note}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StatusBadge variant={getApprovalStatusVariant(approval.status) as any}>
                              {getApprovalStatusLabel(approval.status)}
                            </StatusBadge>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {approval.status === "PENDING" ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedApproval(approval);
                                      setApproveDialogOpen(true);
                                    }}
                                  >
                                    <CheckCircle className="mr-2 h-4 w-4 text-success" />
                                    Phê duyệt
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedApproval(approval);
                                      setRejectDialogOpen(true);
                                    }}
                                  >
                                    <XCircle className="mr-2 h-4 w-4 text-destructive" />
                                    Từ chối
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {approval.note || "—"}
                              </span>
                            )}
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
                  itemLabel="phê duyệt"
                />
              </>
            )}
          </div>
        </SectionCard>
      </PageContainer>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              Phê duyệt hoàn tiền
            </DialogTitle>
            <DialogDescription>
              Xác nhận phê duyệt yêu cầu hoàn tiền này. Sau khi duyệt, tiền sẽ được hoàn và tạo cashflow.
            </DialogDescription>
          </DialogHeader>

          {selectedApproval && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Booking:</span>
                <span className="font-medium">
                  {(selectedApproval.request_payload as ApprovalPayload).unified_booking_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số tiền:</span>
                <span className="font-semibold text-warning">
                  {formatCurrency((selectedApproval.request_payload as ApprovalPayload).amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lý do:</span>
                <span className="text-sm">
                  {(selectedApproval.request_payload as ApprovalPayload).reason_note}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Huỷ
            </Button>
            <Button onClick={handleApprove} disabled={approveRequest.isPending}>
              {approveRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Phê duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Từ chối yêu cầu
            </DialogTitle>
            <DialogDescription>
              Nhập lý do từ chối yêu cầu hoàn tiền này.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lý do từ chối *</Label>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Nhập lý do từ chối"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectRequest.isPending || !rejectNote.trim()}
            >
              {rejectRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Threshold Config Dialog */}
      <Dialog open={thresholdDialogOpen} onOpenChange={setThresholdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Cấu hình ngưỡng hoàn tiền
            </DialogTitle>
            <DialogDescription>
              Các yêu cầu hoàn tiền vượt ngưỡng này sẽ cần Admin phê duyệt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ngưỡng hoàn tiền (VND)</Label>
              <CurrencyInput
                value={newThreshold}
                onChange={setNewThreshold}
                placeholder="Nhập số tiền"
              />
              <p className="text-xs text-muted-foreground">
                Ngưỡng hiện tại: {formatCurrency(threshold)}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setThresholdDialogOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={handleUpdateThreshold}
              disabled={updateThreshold.isPending || !newThreshold}
            >
              {updateThreshold.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu cấu hình
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
