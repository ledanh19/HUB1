import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useParams, useNavigate, Link } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { useOtaPayoutCashInStatus } from "@/hooks/useOtaPayoutCashIn";
import { ReconciliationBreakdownCard } from "@/components/ota-payout/ReconciliationBreakdownCard";
import { buildPayoutSummary } from "@/lib/buildPayoutSummary";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { OtaBadge } from "@/components/ui/ota-badge";
import { getOtaPayoutStatusVariant } from "@/constants/status-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BackButton } from "@/components/ui/BackButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Minus,
  Calendar,
  CreditCard,
  Building2,
  Wallet,
  FileText,
  AlertCircle,
  Trash2,
  Pencil,
  XCircle,
  Link2,
  Banknote,
  ArrowDownCircle,
  Clock,
  Hash,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import {
  useOtaPayoutById,
  useOtaPayoutDetails,
  useOtaPayoutDeductions,
  useDeletePayoutDeduction,
  useUpdatePayoutDeduction,
  useDeactivatePayoutDetail,
  useVoidPayout,
  ADJUSTMENT_TYPES,
  canEditPayout,
} from "@/hooks/useOtaPayouts";
import { useOtaDisputeTracking, useCreateOtaDispute, DISPUTE_TYPE_DISPLAY, OtaDisputeType } from "@/hooks/useOtaDisputeTracking";
import { useAuth } from "@/hooks/useAuth";
import { AddBookingToPayoutDialog } from "@/components/ota-payout/AddBookingToPayoutDialog";
import { AddAdjustmentDialog } from "@/components/ota-payout/AddAdjustmentDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { LinkCaseModal } from "@/components/ota-payout/LinkCaseModal";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";
import * as XLSX from "xlsx";

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "—";
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

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB");
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "RECEIVED":
      return "Đã nhận";
    case "PENDING":
      return "Chờ về";
    case "PARTIAL":
      return "Về một phần";
    default:
      return status;
  }
};

export default function OtaPayoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const hasEditPermission = canEditPayout(userRole);

  const [addBookingOpen, setAddBookingOpen] = useState(false);
  const [addDeductionOpen, setAddDeductionOpen] = useState(false);
  const [createDisputeOpen, setCreateDisputeOpen] = useState(false);

  // Create dispute form state
  const [disputeBookingId, setDisputeBookingId] = useState("");
  const [disputeType, setDisputeType] = useState<OtaDisputeType>("OTA_WITHHOLD" as OtaDisputeType);
  const [disputeAmount, setDisputeAmount] = useState("");
  const [disputeNote, setDisputeNote] = useState("");

  // Void payout state
  const [voidPayoutOpen, setVoidPayoutOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  // Edit deduction state
  const [editDeductionOpen, setEditDeductionOpen] = useState(false);
  const [editingDeduction, setEditingDeduction] = useState<any>(null);
  const [editDeductionType, setEditDeductionType] = useState("");
  const [editDeductionAmount, setEditDeductionAmount] = useState("");
  const [editDeductionReason, setEditDeductionReason] = useState("");

  // Delete deduction confirm
  const [deleteDeductionId, setDeleteDeductionId] = useState<any>(null);
  const [deleteDeductionReason, setDeleteDeductionReason] = useState("");

  // Deactivate booking detail confirm
  const [deactivateDetail, setDeactivateDetail] = useState<any>(null);
  const [deactivateReason, setDeactivateReason] = useState("");

  // Link Case modal state
  const [linkCaseOpen, setLinkCaseOpen] = useState(false);
  const [linkCaseBookingId, setLinkCaseBookingId] = useState("");
  const [linkCaseContext, setLinkCaseContext] = useState<"booking" | "deduction">("booking");
  const [linkCaseDeductionInfo, setLinkCaseDeductionInfo] = useState<{ type: string; amount: number } | undefined>();

  const { data: payout, isLoading: loadingPayout } = useOtaPayoutById(id || "");
  const { data: details = [], isLoading: loadingDetails } = useOtaPayoutDetails(id || "");

  // Pagination for booking details
  const { page, pageSize, setPage, setPageSize, paginatedData: paginatedDetails, totalPages, displayedCount, totalCount } =
    useTablePagination(details, { defaultPageSize: 10, resetDeps: [id] });

  const { data: deductions = [], isLoading: loadingDeductions } = useOtaPayoutDeductions(id || "");
  const { data: linkedDisputes = [] } = useOtaDisputeTracking({ payoutId: id });
  const createDisputeMutation = useCreateOtaDispute();
  const deleteDeductionMutation = useDeletePayoutDeduction();
  const updateDeductionMutation = useUpdatePayoutDeduction();
  const deactivateDetailMutation = useDeactivatePayoutDetail();
  const voidPayoutMutation = useVoidPayout();

  // ── Export bookings to Excel ──
  const handleExportBookings = useCallback(() => {
    if (details.length === 0) {
      toast.warning("Không có booking để xuất");
      return;
    }
    const exportData = details.map((detail: any) => {
      const linked = linkedDisputes.find((d) => d.unified_booking_id === detail.unified_booking_id);
      return {
        "Mã đặt phòng": formatBookingCode(detail.unified_booking_id, detail.booking_code, null, detail.check_in_date),
        "Khách hàng": detail.guest_name || "",
        "Nhận phòng": detail.check_in_date ? new Date(detail.check_in_date).toLocaleDateString("vi-VN") : "",
        "Trả phòng": detail.actual_check_out_at ? new Date(detail.actual_check_out_at).toLocaleDateString("vi-VN") : "",
        "Trạng thái ĐP": detail.booking_status === "CANCELLED" ? "Đã hủy" : detail.booking_status === "NO_SHOW" ? "No-show" : "Confirmed",
        "Trạng thái phòng": detail.stay_status === "CHECKED_OUT" ? "Đã C/O" : detail.stay_status === "CHECKED_IN" ? "Đang ở" : detail.stay_status === "NO_SHOW" ? "No-show" : "",
        "Số tiền thực nhận": Number(detail.expected_amount || 0),
        "Nguồn OTA": payout?.ota_source || "",
        "ID chổ nghỉ": payout?.ota_property_id || "",
        "Loại phòng": detail.room_type || "",
        "Hình thức TT": detail.payment_type || "",
        "Số đêm": detail.nights || "",
        "Case liên quan": linked ? linked.id.slice(0, 8) : "",
        "Trạng thái Case": linked ? (linked.status === "NEW" ? "Mới" : linked.status === "PROCESSING" ? "Đang xử lý" : linked.status === "OTA_ACCEPTED" ? "Chấp nhận" : linked.status === "OTA_REJECTED" ? "Từ chối" : "Xong") : "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Booking Payout");
    const payoutDate = payout?.payout_date ? new Date(payout.payout_date).toISOString().split("T")[0] : "unknown";
    XLSX.writeFile(wb, `payout-bookings-${payout?.ota_source || "OTA"}-${payoutDate}.xlsx`);
    toast.success(`Đã xuất ${exportData.length} booking`);
  }, [details, linkedDisputes, payout]);

  // Hook must be called before any early returns (Rules of Hooks)
  const { data: cashInStatus } = useOtaPayoutCashInStatus(id || "");

  // ── SOT: Single PayoutSummary for ALL page sections ──
  // Must be called unconditionally (before early returns) per Rules of Hooks
  const summary = useMemo(
    () => payout ? buildPayoutSummary({
      payout,
      totalReceived: cashInStatus?.totalReceived || 0,
      bookingCount: details.length,
    }) : null,
    [payout, cashInStatus?.totalReceived, details.length]
  );

  const handleCreateDispute = async () => {
    if (!payout || !disputeBookingId || !disputeAmount) return;

    await createDisputeMutation.mutateAsync({
      unified_booking_id: disputeBookingId,
      dispute_type: disputeType,
      amount_in_dispute: Number(disputeAmount),
      note: disputeNote || undefined,
      payout_id: payout.id,
    });

    setCreateDisputeOpen(false);
    resetDisputeForm();
  };

  const resetDisputeForm = () => {
    setDisputeBookingId("");
    setDisputeType("OTA_WITHHOLD" as OtaDisputeType);
    setDisputeAmount("");
    setDisputeNote("");
  };

  const handleDeleteDeduction = async (deduction: any) => {
    await deleteDeductionMutation.mutateAsync({
      deduction_id: deduction.id,
      payout_id: deduction.payout_id,
      payout_detail_id: deduction.payout_detail_id,
      amount: deduction.amount,
      reason: deleteDeductionReason.trim() || 'Xóa điều chỉnh bởi người dùng',
    });
    setDeleteDeductionId(null);
    setDeleteDeductionReason("");
  };

  const handleDeactivateDetail = async (detail: any) => {
    if (!id) return;
    await deactivateDetailMutation.mutateAsync({
      detail_id: detail.id,
      payout_id: id,
      reason: deactivateReason.trim(),
    });
    setDeactivateDetail(null);
    setDeactivateReason("");
  };

  const openEditDeduction = (deduction: any) => {
    setEditingDeduction(deduction);
    setEditDeductionType(deduction.deduction_type);
    setEditDeductionAmount(String(deduction.amount));
    setEditDeductionReason(deduction.reason_note);
    setEditDeductionOpen(true);
  };

  const handleEditDeduction = async () => {
    if (!editingDeduction) return;
    await updateDeductionMutation.mutateAsync({
      deduction_id: editingDeduction.id,
      payout_id: editingDeduction.payout_id,
      payout_detail_id: editingDeduction.payout_detail_id,
      old_amount: editingDeduction.amount,
      new_amount: Number(editDeductionAmount),
      deduction_type: editDeductionType,
      reason_note: editDeductionReason,
    });
    setEditDeductionOpen(false);
    setEditingDeduction(null);
  };

  const handleVoidPayout = async () => {
    if (!payout || !voidReason.trim()) return;
    await voidPayoutMutation.mutateAsync({
      payout_id: payout.id,
      reason: voidReason,
    });
    navigate("/ota-payouts");
  };

  if (loadingPayout) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!payout) {
    return (
      <>
        <div className="p-4 text-center">
          <p className="text-muted-foreground">Không tìm thấy payout</p>
          <Button className="mt-4" onClick={() => navigate("/ota-payouts")}>
            Quay lại
          </Button>
        </div>
      </>
    );
  }

  const isVoided = !!(payout as any).is_voided;
  const isPending = payout.status === "PENDING";
  const canEdit = isPending && hasEditPermission && !isVoided;

  // Safe: summary is non-null here because payout is non-null (early return above)
  const payoutSummary = summary!;

  // Build lookup map: unified_booking_id → booking_code (from payout details)
  const bookingCodeMap = new Map<string, string>();
  details.forEach((d: any) => {
    if (d.unified_booking_id && d.booking_code) {
      bookingCodeMap.set(d.unified_booking_id, d.booking_code);
    }
  });

  // Use computed status from cash-in allocations (SOT) with DB status as fallback
  const effectiveStatus = cashInStatus?.derivedStatus === "NOT_RECEIVED"
    ? payout.status
    : (cashInStatus?.derivedStatus || payout.status);

  const getActualStatusVariant = () => {
    return effectiveStatus === "RECEIVED" ? "success" : effectiveStatus === "PARTIAL" ? "info" : "warning";
  };

  const getActualStatusLabel = () => {
    return getStatusLabel(effectiveStatus);
  };

  return (
    <>
      <Header
        title="Chi tiết Payout"
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            {isVoided && (
              <StatusBadge variant="destructive" size="sm">
                ĐÃ HỦY
              </StatusBadge>
            )}
            <StatusBadge variant={getActualStatusVariant() as any} size="sm">
              {getActualStatusLabel()}
            </StatusBadge>
            {payout.provider_payout_id && (
              <StatusBadge variant="info" size="sm">
                <span className="font-mono">#{payout.provider_payout_id}</span>
              </StatusBadge>
            )}
            <StatusBadge variant="default" size="sm">
              <span className="font-mono">ID: {payout.id.slice(0, 8)}</span>
            </StatusBadge>
            {payout.ota_property_id && (
              <StatusBadge variant="success" size="sm">
                <Building2 className="inline h-3 w-3 mr-1" />
                <span className="font-mono">{payout.ota_property_id}</span>
              </StatusBadge>
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-3">
            <BackButton to="/ota-payouts" />
            <OtaBadge source={payout.ota_source} />
            <StatusBadge variant={getActualStatusVariant() as any} dot>
              {getActualStatusLabel()}
            </StatusBadge>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddDeductionOpen(true)}
              >
                <Minus className="h-4 w-4 mr-2" />
                Thêm điều chỉnh
              </Button>
            )}
            {/* Void payout - only when PENDING */}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/50 hover:bg-destructive/10"
                onClick={() => setVoidPayoutOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Hủy phiếu
              </Button>
            )}
          </div>
        }
      />

      <PageContainer>
        {/* Permission warning for read-only users */}
        {!hasEditPermission && (
          <Alert className="border-warning/50 bg-warning/10">
            <ShieldAlert className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              Bạn chỉ có quyền xem. Chỉ Kế toán và Admin mới được thao tác.
            </AlertDescription>
          </Alert>
        )}


        {/* Summary KPI Cards — Agoda-style (SOT: buildPayoutSummary) */}
        <SectionCard>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tổng giá trị dự kiến</p>
                <p className="font-semibold text-base">
                  {formatCurrency(payoutSummary.gross)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background">
              <div className={`p-2 rounded-lg ${payoutSummary.adjustments < 0 ? "bg-destructive/10" : payoutSummary.adjustments > 0 ? "bg-success/10" : "bg-muted"}`}>
                <Minus className={`h-5 w-5 ${payoutSummary.adjustments < 0 ? "text-destructive" : payoutSummary.adjustments > 0 ? "text-success" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Điều chỉnh</p>
                <p className={`font-semibold text-base ${payoutSummary.adjustments < 0 ? "text-destructive" : payoutSummary.adjustments > 0 ? "text-success" : ""}`}>
                  {payoutSummary.adjustments > 0 ? "+" : ""}{formatCurrency(payoutSummary.adjustments)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
              <div className="p-2 rounded-lg bg-primary/10">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Thực nhận dự kiến</p>
                <p className="font-semibold text-primary text-base">
                  {formatCurrency(payoutSummary.expectedNet)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background">
              <div className="p-2 rounded-lg bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground"># Bookings</p>
                <p className="font-semibold text-base">{payoutSummary.bookingCount}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Payout Info */}
        <SectionCard
          title={
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Thông tin payout
            </span>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {payout.ota_property_id && (
              <div>
                <p className="text-muted-foreground">ID chỗ nghỉ</p>
                <p className="font-medium font-mono">{payout.ota_property_id}</p>
              </div>
            )}
            {payout.provider_payout_id && (
              <div>
                <p className="text-muted-foreground">Provider Payout ID</p>
                <p className="font-medium font-mono">{payout.provider_payout_id}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Kỳ payout</p>
              <p className="font-medium">
                {payout.payout_period_from && payout.payout_period_to
                  ? `${formatDate(payout.payout_period_from)} - ${formatDate(payout.payout_period_to)}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Số booking</p>
              <p className="font-medium">{details.length}</p>
            </div>
            {payout.note && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Ghi chú</p>
                <p className="font-medium">{payout.note}</p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Cash-In Records — only show when cash-in exists */}
        {cashInStatus && cashInStatus.cashInRecords.length > 0 && (
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4 text-success" />
                Ghi nhận tiền về
                <StatusBadge variant={cashInStatus.derivedStatus === "RECEIVED" ? "success" : cashInStatus.derivedStatus === "PARTIAL" ? "info" : "warning"} size="sm">
                  {cashInStatus.derivedStatus === "RECEIVED" ? "Đã nhận đủ" : cashInStatus.derivedStatus === "PARTIAL" ? "Nhận một phần" : "Chưa nhận"}
                </StatusBadge>
              </span>
            }
          >
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs mb-4">
              <div>
                <p className="text-muted-foreground">Dự kiến nhận</p>
                <p className="font-semibold text-sm">{formatCurrency(payoutSummary.expectedNet)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Đã nhận</p>
                <p className="font-semibold text-sm text-success">{formatCurrency(payoutSummary.received)}</p>
              </div>
              {cashInStatus.remainingAmount > 0 && (
                <div>
                  <p className="text-muted-foreground">Còn thiếu</p>
                  <p className="font-semibold text-sm text-warning">{formatCurrency(cashInStatus.remainingAmount)}</p>
                </div>
              )}
            </div>

            {/* Individual cash-in records */}
            <div className="space-y-3">
              {cashInStatus.cashInRecords
                .filter((r: any) => r.collection_type === "COLLECT")
                .map((record: any, idx: number) => (
                  <div key={record.id || idx} className="border border-border/60 rounded-lg p-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Banknote className="h-3 w-3" /> Hình thức
                        </p>
                        <p className="font-medium">
                          {record.payment_method === "BANK_TRANSFER"
                            ? "Chuyển khoản ngân hàng"
                            : record.payment_method === "UPC"
                              ? "Cổng thanh toán (UPC)"
                              : record.payment_method || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Ngày nhận
                        </p>
                        <p className="font-medium">
                          {record.collected_at
                            ? new Date(record.collected_at).toLocaleDateString("vi-VN")
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Wallet className="h-3 w-3" /> Số tiền
                        </p>
                        <p className="font-semibold text-success">
                          +{formatCurrency(Number(record.amount_collected || 0))}
                        </p>
                      </div>
                      {record.receipt && (
                        <div>
                          <p className="text-muted-foreground flex items-center gap-1">
                            <Hash className="h-3 w-3" /> Reference
                          </p>
                          <p className="font-medium font-mono text-xs">{record.receipt}</p>
                        </div>
                      )}
                      {record.note && (
                        <div className="col-span-2 md:col-span-4">
                          <p className="text-muted-foreground">Ghi chú</p>
                          <p className="font-medium">{record.note}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </SectionCard>
        )}

        {/* Linked Disputes */}
        {linkedDisputes.length > 0 && (
          <SectionCard
            noPadding
            title={
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                Tranh chấp liên quan ({linkedDisputes.length})
              </span>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linkedDisputes.map((dispute) => (
                  <TableRow key={dispute.id}>
                    <TableCell className="font-mono text-xs">
                      {dispute.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      {DISPUTE_TYPE_DISPLAY[dispute.dispute_type as OtaDisputeType]?.label || dispute.dispute_type}
                    </TableCell>
                    <TableCell>
                      <AppLink to={`/bookings/${dispute.unified_booking_id}`} className="hover:underline text-primary">
                        {dispute.guest_name || dispute.unified_booking_id}
                      </AppLink>
                    </TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      {formatCurrency(Number(dispute.amount_in_dispute))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        variant={
                          dispute.status === "NEW" || dispute.status === "PROCESSING" ? "warning" :
                            dispute.status === "OTA_ACCEPTED" ? "success" :
                              dispute.status === "OTA_REJECTED" ? "danger" : "default"
                        }
                        size="sm"
                      >
                        {dispute.status === "NEW" ? "Mới" :
                          dispute.status === "PROCESSING" ? "Đang xử lý" :
                            dispute.status === "OTA_ACCEPTED" ? "OTA chấp nhận" :
                              dispute.status === "OTA_REJECTED" ? "OTA từ chối" : "Đã kết thúc"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <AppLink to={`/disputes/${dispute.id}`}>Xem</AppLink>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        )}

        {/* Booking Details - READ ONLY */}
        <SectionCard
          noPadding
          title={
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Danh sách booking ({details.length})
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportBookings} disabled={details.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Xuất Excel
              </Button>
              {canEdit && (
                <Button size="sm" onClick={() => setAddBookingOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Thêm booking
                </Button>
              )}
            </div>
          }
        >
          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : details.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Chưa có booking nào trong payout này
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Mã đặt phòng</TableHead>
                    <TableHead className="w-[140px]">Khách hàng</TableHead>
                    <TableHead className="w-[100px]">Nhận phòng</TableHead>
                    <TableHead className="w-[100px]">Trả phòng</TableHead>
                    <TableHead className="w-[90px]">Đặt phòng</TableHead>
                    <TableHead className="w-[90px]">Lưu trú</TableHead>
                    <TableHead className="text-right w-[130px]">Số tiền thực nhận</TableHead>
                    <TableHead className="w-[100px]">Case</TableHead>
                    {canEdit && <TableHead className="w-[60px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDetails.map((detail) => {
                    const isCancelled = detail.expected_amount === 0;
                    return (
                      <TableRow key={detail.id} className={isCancelled ? "opacity-50" : ""}>
                        <TableCell>
                          <Link
                            to={`/bookings/${detail.unified_booking_id}`}
                            className="hover:underline text-xs font-mono text-primary"
                          >
                            {formatBookingCode(detail.unified_booking_id, (detail as any).booking_code, null, (detail as any).check_in_date)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {detail.guest_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(detail as any).check_in_date ? formatDate((detail as any).check_in_date) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(detail.actual_check_out_at)}
                        </TableCell>
                        <TableCell>
                          {(detail as any).booking_status === "CANCELLED" ? (
                            <StatusBadge variant="danger" size="sm">Đã hủy</StatusBadge>
                          ) : (detail as any).booking_status === "NO_SHOW" ? (
                            <StatusBadge variant="warning" size="sm">No-show</StatusBadge>
                          ) : (
                            <StatusBadge variant="success" size="sm">Confirmed</StatusBadge>
                          )}
                        </TableCell>
                        <TableCell>
                          {(detail as any).stay_status === "CHECKED_OUT" ? (
                            <StatusBadge variant="success" size="sm">Đã C/O</StatusBadge>
                          ) : (detail as any).stay_status === "CHECKED_IN" ? (
                            <StatusBadge variant="info" size="sm">Đang ở</StatusBadge>
                          ) : (detail as any).stay_status === "NO_SHOW" ? (
                            <StatusBadge variant="warning" size="sm">No-show</StatusBadge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${isCancelled ? "text-muted-foreground" : "text-primary"}`}>
                          {formatCurrency(detail.expected_amount)}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const linked = linkedDisputes.find((d) => d.unified_booking_id === detail.unified_booking_id);
                            if (linked) {
                              return (
                                <div className="flex items-center gap-1">
                                  <a
                                    href={`/disputes/${linked.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-mono text-primary hover:underline"
                                  >
                                    {linked.id.slice(0, 8)}
                                  </a>
                                  <StatusBadge
                                    variant={
                                      linked.status === "NEW" || linked.status === "PROCESSING" ? "warning" :
                                        linked.status === "OTA_ACCEPTED" ? "success" :
                                          linked.status === "OTA_REJECTED" ? "danger" : "default"
                                    }
                                    size="sm"
                                  >
                                    {linked.status === "NEW" ? "Mới" :
                                      linked.status === "PROCESSING" ? "Đang xử lý" :
                                        linked.status === "OTA_ACCEPTED" ? "Chấp nhận" :
                                          linked.status === "OTA_REJECTED" ? "Từ chối" : "Xong"}
                                  </StatusBadge>
                                </div>
                              );
                            }
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  setLinkCaseBookingId(detail.unified_booking_id);
                                  setLinkCaseContext("booking");
                                  setLinkCaseDeductionInfo(undefined);
                                  setLinkCaseOpen(true);
                                }}
                              >
                                <Link2 className="h-3.5 w-3.5 mr-1" />
                                Link Case
                              </Button>
                            );
                          })()}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeactivateDetail(detail)}
                              title="Xóa booking khỏi payout"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <DataTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                displayedItems={displayedCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="booking"
              />
            </>
          )}
        </SectionCard>

        {/* Adjustments section */}
        {(deductions.length > 0 || canEdit) && (
          <SectionCard
            noPadding
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Điều chỉnh ({deductions.length})
              </span>
            }
            actions={
              canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddDeductionOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Thêm điều chỉnh
                </Button>
              ) : undefined
            }
          >
            {loadingDeductions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : deductions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Không có điều chỉnh
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loại</TableHead>
                    <TableHead>Mã đặt phòng</TableHead>
                    <TableHead>Lý do</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Linked Case</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    {canEdit && <TableHead className="w-24">Thao tác</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deductions.map((deduction) => {
                    const amt = Number(deduction.amount);
                    const isPositive = amt > 0;
                    return (
                      <TableRow key={deduction.id}>
                        <TableCell>
                          <StatusBadge variant={isPositive ? "success" : "danger"} size="sm">
                            {ADJUSTMENT_TYPES.find((t) => t.value === deduction.deduction_type)
                              ?.label || deduction.deduction_type}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {deduction.unified_booking_id ? (
                            <Link
                              to={`/bookings/${deduction.unified_booking_id}`}
                              className="hover:underline text-primary font-mono text-xs"
                            >
                              {formatBookingCode(deduction.unified_booking_id, bookingCodeMap.get(deduction.unified_booking_id) || null, null)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">— chung</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm">
                          {deduction.reason_note}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${isPositive ? "text-success" : "text-destructive"}`}>
                          {isPositive ? "+" : ""}{formatCurrency(amt)}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const linked = linkedDisputes.find((d) => d.unified_booking_id === deduction.unified_booking_id);
                            if (linked) {
                              return (
                                <div className="flex items-center gap-1">
                                  <a
                                    href={`/disputes/${linked.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-mono text-primary hover:underline"
                                  >
                                    {linked.id.slice(0, 8)}
                                  </a>
                                  <StatusBadge
                                    variant={
                                      linked.status === "NEW" || linked.status === "PROCESSING" ? "warning" :
                                        linked.status === "OTA_ACCEPTED" ? "success" :
                                          linked.status === "OTA_REJECTED" ? "danger" : "default"
                                    }
                                    size="sm"
                                  >
                                    {linked.status === "NEW" ? "Mới" :
                                      linked.status === "PROCESSING" ? "Đang xử lý" :
                                        linked.status === "OTA_ACCEPTED" ? "Chấp nhận" :
                                          linked.status === "OTA_REJECTED" ? "Từ chối" : "Xong"}
                                  </StatusBadge>
                                </div>
                              );
                            }
                            if (deduction.unified_booking_id) {
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => {
                                    setLinkCaseBookingId(deduction.unified_booking_id);
                                    setLinkCaseContext("deduction");
                                    setLinkCaseDeductionInfo({
                                      type: deduction.deduction_type,
                                      amount: amt,
                                    });
                                    setLinkCaseOpen(true);
                                  }}
                                >
                                  <Link2 className="h-3.5 w-3.5 mr-1" />
                                  Link
                                </Button>
                              );
                            }
                            return <span className="text-xs text-muted-foreground">—</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(deduction.created_at)}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDeduction(deduction)}
                                title="Sửa"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteDeductionId(deduction)}
                                title="Xóa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        )}

        {/* Reconciliation Breakdown — SOT: uses shared summary */}
        {payout && (
          <ReconciliationBreakdownCard
            payout={payout}
            summary={payoutSummary}
            canEdit={hasEditPermission}
          />
        )}

      </PageContainer>

      {/* Add Booking Dialog */}
      <AddBookingToPayoutDialog
        open={addBookingOpen}
        onOpenChange={setAddBookingOpen}
        payoutId={payout.id}
        otaSource={payout.ota_source}
        otaPropertyId={(payout as any).ota_property_id || null}
      />

      {/* Add Adjustment Dialog */}
      <AddAdjustmentDialog
        open={addDeductionOpen}
        onOpenChange={setAddDeductionOpen}
        payoutId={payout.id}
      />




      {/* Void Payout Dialog */}
      <Dialog open={voidPayoutOpen} onOpenChange={setVoidPayoutOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Hủy phiếu Payout
            </DialogTitle>
          </DialogHeader>

          <Alert className="bg-destructive/10 border-destructive/20 dark:bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-sm text-destructive dark:text-destructive">
              <strong>Cảnh báo:</strong> Hủy phiếu sẽ xóa toàn bộ dữ liệu (booking gán, điều chỉnh). Các booking sẽ trở về trạng thái chưa gán payout.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">OTA:</span>
                <span className="font-medium">{payout?.ota_source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ngày payout:</span>
                <span className="font-medium">{formatDate(payout?.payout_date || null)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số booking:</span>
                <span className="font-medium">{details.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số điều chỉnh:</span>
                <span className="font-medium">{deductions.length}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Lý do hủy phiếu *</Label>
              <Textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Nhập lý do hủy phiếu (bắt buộc)..."
                rows={3}
              />
              {!voidReason.trim() && (
                <p className="text-xs text-destructive">Vui lòng nhập lý do</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidPayoutOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoidPayout}
              disabled={!voidReason.trim() || voidPayoutMutation.isPending}
            >
              {voidPayoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận hủy phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Deduction Dialog */}
      <Dialog open={editDeductionOpen} onOpenChange={setEditDeductionOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Sửa điều chỉnh
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Loại điều chỉnh *</Label>
              <Select value={editDeductionType} onValueChange={setEditDeductionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Số tiền *</Label>
              <CurrencyInput
                value={editDeductionAmount}
                onChange={setEditDeductionAmount}
                placeholder="Nhập số tiền"
                allowNegative
              />
            </div>

            <div className="space-y-2">
              <Label>Lý do *</Label>
              <Textarea
                value={editDeductionReason}
                onChange={(e) => setEditDeductionReason(e.target.value)}
                placeholder="Lý do điều chỉnh..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDeductionOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={handleEditDeduction}
              disabled={
                !editDeductionAmount ||
                Number(editDeductionAmount) === 0 ||
                !editDeductionReason.trim() ||
                updateDeductionMutation.isPending
              }
            >
              {updateDeductionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Deduction Confirm Dialog */}
      <Dialog open={!!deleteDeductionId} onOpenChange={(open) => { if (!open) { setDeleteDeductionId(null); setDeleteDeductionReason(""); } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Xóa điều chỉnh
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Bạn có chắc chắn muốn xóa khoản điều chỉnh{" "}
            <strong className="text-foreground">{formatCurrency(deleteDeductionId?.amount || 0)}</strong>?
            Số tiền thực nhận dự kiến sẽ được tính lại. Dữ liệu đối soát liên quan cũng sẽ bị xóa.
          </p>

          <div className="space-y-2">
            <Label>Lý do xóa *</Label>
            <Textarea
              value={deleteDeductionReason}
              onChange={(e) => setDeleteDeductionReason(e.target.value)}
              placeholder="Nhập lý do xóa (ít nhất 5 ký tự)..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDeductionId(null); setDeleteDeductionReason(""); }}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteDeductionId && handleDeleteDeduction(deleteDeductionId)}
              disabled={deleteDeductionMutation.isPending || deleteDeductionReason.trim().length < 5}
            >
              {deleteDeductionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Booking Detail Confirm Dialog */}
      <Dialog open={!!deactivateDetail} onOpenChange={(open) => { if (!open) { setDeactivateDetail(null); setDeactivateReason(""); } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Xóa booking khỏi payout
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Bạn có chắc chắn muốn xóa booking{" "}
            <strong className="text-foreground">
              {deactivateDetail?.guest_name || deactivateDetail?.unified_booking_id?.slice(0, 8)}
            </strong>{" "}
            ({formatCurrency(deactivateDetail?.expected_amount || 0)}) khỏi payout?
            Tổng gross sẽ được tính lại.
          </p>

          <div className="space-y-2">
            <Label>Lý do xóa *</Label>
            <Textarea
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              placeholder="Nhập lý do xóa (ít nhất 5 ký tự)..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeactivateDetail(null); setDeactivateReason(""); }}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={() => deactivateDetail && handleDeactivateDetail(deactivateDetail)}
              disabled={deactivateDetailMutation.isPending || deactivateReason.trim().length < 5}
            >
              {deactivateDetailMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Case Modal — Payout-driven linking */}
      {id && (
        <LinkCaseModal
          open={linkCaseOpen}
          onOpenChange={setLinkCaseOpen}
          unifiedBookingId={linkCaseBookingId}
          payoutId={id}
          context={linkCaseContext}
          deductionInfo={linkCaseDeductionInfo}
        />
      )}
    </>
  );
}
