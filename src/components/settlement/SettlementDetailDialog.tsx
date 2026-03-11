import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Building2,
  Briefcase,
  Receipt,
  ArrowRight,
  ArrowDownLeft,
  AlertCircle,
  Wallet,
  User,
  CreditCard,
  Package,
  Clock,
  CheckCircle2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Ban,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useHostSettlementFullDetail, useServiceSettlementFullDetail } from "@/hooks/useSettlementFullDetail";
import { formatBookingCode } from "@/lib/bookingCodeFormatter";
import { useVoidSettlement } from "@/hooks/useHostSettlement";
import { isPostSettlementTag, stripTag } from "@/lib/postSettlementTag";

interface SettlementDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settlementId: string | null;
  settlementType: "HOST" | "SERVICE";
  onGoToPayment?: () => void;
  onGoToCollect?: () => void;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return "-";
  try {
    return format(new Date(dateString), "dd/MM/yyyy", { locale: vi });
  } catch {
    return dateString;
  }
};

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return "-";
  try {
    return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: vi });
  } catch {
    return dateString;
  }
};

const paymentStatusColors = {
  UNPAID: "bg-destructive/10 text-destructive dark:text-destructive",
  PARTIAL: "bg-warning/10 text-warning",
  PAID: "bg-success/10 text-success dark:bg-success/10",
  OVERPAID: "bg-warning/10 text-warning dark:bg-warning/10",
};

const getPaymentStatusLabel = (status: string, direction: "PAY" | "RECEIVE"): string => {
  if (direction === "RECEIVE") {
    const labels: Record<string, string> = {
      UNPAID: "Chưa thu",
      PARTIAL: "Thu một phần",
      PAID: "Đã thu đủ",
      OVERPAID: "Thu dư",
    };
    return labels[status] || status;
  }
  const labels: Record<string, string> = {
    UNPAID: "Chưa thanh toán",
    PARTIAL: "Thanh toán một phần",
    PAID: "Đã thanh toán",
    OVERPAID: "Trả dư",
  };
  return labels[status] || status;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "DRAFT":
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Nháp</Badge>;
    case "SETTLED":
      return <Badge className="bg-success text-white">Đã quyết toán</Badge>;
    case "CLOSED":
    case "FINALIZED":
      return <Badge className="bg-info">Đã đóng</Badge>;
    case "PARTIALLY_PAID":
      return <Badge className="bg-warning/100">TT một phần</Badge>;
    case "VOID":
      return <Badge variant="destructive">Đã hủy</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export function SettlementDetailDialog({
  open,
  onOpenChange,
  settlementId,
  settlementType,
  onGoToPayment,
  onGoToCollect,
}: SettlementDetailDialogProps) {
  const { data: hostDetail, isLoading: hostLoading } = useHostSettlementFullDetail(
    settlementType === "HOST" ? settlementId : null
  );
  const { data: serviceDetail, isLoading: serviceLoading } = useServiceSettlementFullDetail(
    settlementType === "SERVICE" ? settlementId : null
  );

  const isLoading = settlementType === "HOST" ? hostLoading : serviceLoading;

  // Void settlement state
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const voidMutation = useVoidSettlement();

  const handleVoidSettlement = () => {
    if (!settlementId || !voidReason.trim()) return;
    voidMutation.mutate(
      { settlementId, reason: voidReason.trim() },
      {
        onSuccess: () => {
          setVoidDialogOpen(false);
          setVoidReason("");
          onOpenChange(false);
        },
      }
    );
  };

  if (settlementType === "HOST" && hostDetail) {
    const s = hostDetail.settlement;
    const stats = hostDetail.computedStats;
    const isVoid = s.status === "VOID";
    const canVoid = s.status === "SETTLED" && stats.paid_amount === 0;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-info" />
              Chi tiết Phiếu Quyết toán Host: {s.settlement_code}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Xem đầy đủ thông tin quyết toán host, bao gồm bookings, segments, deposit/prepaid, collections và thanh toán.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="space-y-6 py-4">
              {/* Header Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg border">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Host</p>
                  <p className="font-semibold">{s.partner_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Kỳ quyết toán</p>
                  <p className="font-semibold">{formatDate(s.period_from)} → {formatDate(s.period_to)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Trạng thái</p>
                  <div className="mt-1">{getStatusBadge(s.status)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Ngày chốt</p>
                  <p className="font-semibold">{formatDateTime(s.finalized_at)}</p>
                </div>
              </div>

              {/* Void info banner */}
              {isVoid && (s as any).void_reason && (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-destructive">Đã hủy quyết toán</p>
                      <p className="text-xs text-muted-foreground">Lý do: {(s as any).void_reason}</p>
                      {(s as any).voided_at && (
                        <p className="text-xs text-muted-foreground">Thời gian: {formatDateTime((s as any).voided_at)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* KPI Summary - giống trang tạo báo cáo */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3 rounded-lg bg-muted dark:bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Doanh thu booking</p>
                  <p className="text-lg font-bold">{formatCurrency(s.total_booking_revenue)}</p>
                </div>
                <div className="p-3 rounded-lg bg-warning/10 dark:bg-warning/10 border border-warning/20">
                  <p className="text-xs text-warning">Tổng công nợ Host</p>
                  <p className="text-lg font-bold text-warning">{formatCurrency(s.total_payable_amount)}</p>
                </div>
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-xs text-warning">Host đã thu từ khách</p>
                  <p className="text-lg font-bold text-warning">{formatCurrency(s.total_host_collected)}</p>
                </div>
                <div className="p-3 rounded-lg bg-warning/10 dark:bg-warning/10 border border-warning/20">
                  <p className="text-xs text-warning">Deposit áp dụng</p>
                  <p className="text-lg font-bold text-warning">{formatCurrency(s.total_deposits_applied)}</p>
                </div>
                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-xs text-success ">Prepaid áp dụng</p>
                  <p className="text-lg font-bold text-success ">{formatCurrency(s.total_prepaids_applied)}</p>
                </div>
                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-xs text-success">Đã thanh toán (snapshot)</p>
                  <p className="text-lg font-bold text-success">{formatCurrency(s.total_paid_amount)}</p>
                </div>
              </div>

              {/* NET Formula */}
              <div className="p-3 rounded-lg bg-muted dark:bg-muted border text-xs font-mono">
                <p className="text-muted-foreground">
                  <strong>📐 Công thức NET:</strong> Công nợ ({formatCurrency(s.total_payable_amount)})
                  − Host thu ({formatCurrency(s.total_host_collected)})
                  − Deposit ({formatCurrency(s.total_deposits_applied)})
                  − Prepaid ({formatCurrency(s.total_prepaids_applied)})
                  = <span className={`font-bold ${stats.net_direction === "PAY" ? "text-info" : "text-primary"}`}>
                    {formatCurrency(Math.abs(stats.net_amount))}
                  </span>
                </p>
              </div>

              {/* NET Position */}
              <div className={`rounded-xl p-5 border-2 ${stats.net_direction === "PAY"
                ? "border-info/20 bg-info/10"
                : "border-primary/20 bg-primary/10"
                }`}>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <p className="text-xs flex items-center gap-2">
                      {stats.net_direction === "PAY"
                        ? <><TrendingUp className="h-4 w-4" /> NET (Roomrise phải TRẢ cho Host)</>
                        : <><TrendingDown className="h-4 w-4" /> NET (Roomrise phải THU từ Host)</>
                      }
                    </p>
                    <p className={`text-4xl font-bold mt-1 ${stats.net_direction === "PAY" ? "text-info" : "text-primary"}`}>
                      {formatCurrency(Math.abs(stats.net_amount))}
                    </p>
                  </div>
                  <Badge className={`text-base px-4 py-2 text-white ${stats.net_direction === "PAY" ? "bg-info" : "bg-primary"}`}>
                    {stats.net_direction === "PAY" ? "⬆️ RS TRẢ" : "⬇️ RS THU"}
                  </Badge>
                </div>
              </div>

              {/* Payment Progress - hidden for VOID settlements */}
              {isVoid ? (
                <div className="p-4 rounded-lg bg-muted/50 border border-border/50 text-center">
                  <Ban className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground font-medium">Phiếu đã hủy — thông tin thanh toán không áp dụng</p>
                  {stats.paid_amount > 0 && (
                    <p className="text-xs text-destructive mt-1">
                      ⚠️ Cảnh báo: Có {formatCurrency(stats.paid_amount)} đã được ghi nhận thanh toán cho phiếu này.
                      Kiểm tra lại dữ liệu đề xuất thanh toán và phiếu chi liên quan.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div className="border rounded-xl p-4 text-center bg-success/10/50 dark:bg-success/10">
                    <Wallet className="h-5 w-5 mx-auto mb-1 text-success" />
                    <span className="text-xs text-muted-foreground block">
                      {stats.net_direction === "RECEIVE" ? "Đã thu về" : "Đã chi trả"}
                    </span>
                    <p className="text-2xl font-bold text-success">{formatCurrency(stats.paid_amount)}</p>
                    {stats.paid_amount > 0 && Math.abs(stats.net_amount) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {((stats.paid_amount / Math.abs(stats.net_amount)) * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                  <div className="border rounded-xl p-4 text-center bg-destructive/10/50">
                    <Clock className="h-5 w-5 mx-auto mb-1 text-destructive" />
                    <span className="text-xs text-muted-foreground block">Còn lại</span>
                    <p className="text-2xl font-bold text-destructive">{formatCurrency(stats.remaining_amount)}</p>
                    {stats.remaining_amount > 0 && Math.abs(stats.net_amount) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {((stats.remaining_amount / Math.abs(stats.net_amount)) * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                  <div className="border rounded-xl p-4 text-center">
                    <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <span className="text-xs text-muted-foreground block">Trạng thái</span>
                    <Badge className={`mt-1 ${paymentStatusColors[stats.payment_status as keyof typeof paymentStatusColors] || ""}`}>
                      {getPaymentStatusLabel(stats.payment_status, stats.net_direction)}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Snapshot mismatch warning */}
              {stats.snapshot_mismatch && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
                  <span className="mt-0.5">⚠️</span>
                  <span>
                    <strong>Cảnh báo:</strong> Snapshot lệch so với tính lại ({formatCurrency(Math.abs(stats.snapshot_delta))}). Vui lòng báo admin.
                  </span>
                </div>
              )}

              {/* Post-settlement charges summary */}
              {(() => {
                const postExtraCharges = hostDetail.extraCharges.filter((c) => isPostSettlementTag(c.note));
                const postSurcharges = hostDetail.surcharges.filter((s) => isPostSettlementTag(s.description));
                const totalPostItems = postExtraCharges.length + postSurcharges.length;
                const totalPostAmount = [...postExtraCharges, ...postSurcharges].reduce((sum: number, c: any) => sum + (c.amount || 0), 0);

                if (totalPostItems === 0) return null;

                return (
                  <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-4 bg-amber-50/50 dark:bg-amber-950/20">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                        📌 Phát sinh sau quyết toán
                      </h4>
                      <Badge variant="outline" className="text-amber-700 dark:text-amber-300 border-amber-300">
                        {totalPostItems} khoản • {formatCurrency(totalPostAmount)}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {postExtraCharges.map((c: any) => (
                        <div key={c.id} className="flex justify-between text-xs text-muted-foreground">
                          <span>Phụ phí: {c.charge_type} {stripTag(c.note) ? `— ${stripTag(c.note)}` : ''}</span>
                          <span className="font-medium">{formatCurrency(c.amount)}</span>
                        </div>
                      ))}
                      {postSurcharges.map((s: any) => (
                        <div key={s.id} className="flex justify-between text-xs text-muted-foreground">
                          <span>Phụ thu: {s.surcharge_type} {stripTag(s.description) ? `— ${stripTag(s.description)}` : ''}</span>
                          <span className="font-medium">{formatCurrency(s.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <Separator />

              {/* Tabs for detailed data */}
              <Tabs defaultValue="bookings" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="bookings" className="text-xs">
                    <User className="h-3 w-3 mr-1" />
                    Bookings ({hostDetail.bookings.length})
                  </TabsTrigger>
                  <TabsTrigger value="segments" className="text-xs">
                    <Package className="h-3 w-3 mr-1" />
                    Segments ({hostDetail.segments.length})
                  </TabsTrigger>
                  <TabsTrigger value="charges" className="text-xs">
                    <Receipt className="h-3 w-3 mr-1" />
                    Phụ phí ({hostDetail.surcharges.length + hostDetail.extraCharges.length})
                  </TabsTrigger>
                  <TabsTrigger value="deposits" className="text-xs">
                    <CreditCard className="h-3 w-3 mr-1" />
                    Deposit/Prepaid ({hostDetail.depositsAndPrepaids.length})
                  </TabsTrigger>
                  <TabsTrigger value="collections" className="text-xs">
                    <Receipt className="h-3 w-3 mr-1" />
                    Collections ({hostDetail.collections.length})
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="text-xs">
                    <Wallet className="h-3 w-3 mr-1" />
                    Thanh toán ({hostDetail.cashflowPayments.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="bookings" className="border rounded-lg p-0 mt-4">
                  {hostDetail.bookings.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Mã Booking</TableHead>
                          <TableHead>Khách</TableHead>
                          <TableHead>Chỗ nghỉ</TableHead>
                          <TableHead>Nhận/Trả phòng</TableHead>
                          <TableHead className="text-right">Phát sinh</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hostDetail.bookings.map((b) => (
                          <TableRow key={b.unified_booking_id}>
                            <TableCell className="font-mono text-xs">
                              {formatBookingCode(b.unified_booking_id, b.ota_booking_code, b.source, b.check_in_date)}
                            </TableCell>
                            <TableCell>{b.guest_name || "-"}</TableCell>
                            <TableCell className="text-xs">{b.host_property_name || "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(b.check_in_date)} → {formatDate(b.actual_check_out_at || b.check_out_date)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-warning">
                              {formatCurrency(b.host_cost || 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">Không có booking</div>
                  )}
                </TabsContent>

                <TabsContent value="segments" className="border rounded-lg p-0 mt-4">
                  {hostDetail.segments.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Phòng</TableHead>
                          <TableHead>Loại phòng</TableHead>
                          <TableHead>Từ - Đến</TableHead>
                          <TableHead className="text-right">Đêm</TableHead>
                          <TableHead className="text-right">Đơn giá</TableHead>
                          <TableHead className="text-right">Thành tiền</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hostDetail.segments.map((seg) => (
                          <TableRow key={seg.id}>
                            <TableCell className="font-medium">{seg.room_code || "-"}</TableCell>
                            <TableCell>{seg.host_room_type || "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(seg.date_from)} → {formatDate(seg.date_to)}
                            </TableCell>
                            <TableCell className="text-right">{seg.nights}</TableCell>
                            <TableCell className="text-right">{formatCurrency(seg.nightly_rate)}</TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(seg.total_amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">Không có segments</div>
                  )}
                </TabsContent>

                <TabsContent value="charges" className="border rounded-lg p-0 mt-4">
                  {(hostDetail.surcharges.length > 0 || hostDetail.extraCharges.length > 0) ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-warning/10">
                          <TableHead className="text-warning">Mã Booking</TableHead>
                          <TableHead className="text-warning">Loại</TableHead>
                          <TableHead className="text-warning">Mô tả</TableHead>
                          <TableHead className="text-right text-warning">Số tiền</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hostDetail.surcharges.map((s) => {
                          const booking = hostDetail.bookings.find(b => b.unified_booking_id === s.unified_booking_id);
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="font-mono text-xs">
                                {formatBookingCode(s.unified_booking_id, booking?.ota_booking_code, booking?.source, booking?.check_in_date)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs bg-warning/5 text-warning border-warning/30">
                                  Phụ thu: {s.surcharge_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{s.description || "—"}</TableCell>
                              <TableCell className="text-right font-semibold text-warning">{formatCurrency(s.amount)}</TableCell>
                            </TableRow>
                          );
                        })}
                        {hostDetail.extraCharges.map((e) => {
                          const booking = hostDetail.bookings.find(b => b.unified_booking_id === e.unified_booking_id);
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="font-mono text-xs">
                                {formatBookingCode(e.unified_booking_id, booking?.ota_booking_code, booking?.source, booking?.check_in_date)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/30">
                                  Chi phí: {e.charge_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{e.note || "—"}</TableCell>
                              <TableCell className="text-right font-semibold text-warning">{formatCurrency(e.amount)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">Không có phụ phí / chi phí bổ sung</div>
                  )}
                </TabsContent>

                <TabsContent value="deposits" className="border rounded-lg p-0 mt-4">
                  {hostDetail.depositsAndPrepaids.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Mã yêu cầu</TableHead>
                          <TableHead>Loại</TableHead>
                          <TableHead>Trạng thái</TableHead>
                          <TableHead className="text-right">Đề xuất</TableHead>
                          <TableHead className="text-right">Đã chi</TableHead>
                          <TableHead>Ngày yêu cầu</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hostDetail.depositsAndPrepaids.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-xs">{d.request_code}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={d.type === "DEPOSIT" ? "text-warning" : "text-success"}>
                                {d.type === "DEPOSIT" ? "Deposit" : "Prepaid"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{d.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(d.proposed_amount)}</TableCell>
                            <TableCell className="text-right font-semibold text-success">{formatCurrency(d.total_paid)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDateTime(d.requested_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">Không có Deposit/Prepaid</div>
                  )}
                </TabsContent>

                <TabsContent value="collections" className="border rounded-lg p-0 mt-4">
                  {hostDetail.collections.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Ngày thu</TableHead>
                          <TableHead>Loại</TableHead>
                          <TableHead>Người thu</TableHead>
                          <TableHead>Phương thức</TableHead>
                          <TableHead className="text-right">Số tiền</TableHead>
                          <TableHead>Ghi chú</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hostDetail.collections.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>{formatDateTime(c.collected_at)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{c.collection_type}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={c.payee_type === "ROOMRISE" ? "default" : c.payee_type === "HOST" ? "secondary" : "outline"}>
                                {c.payee_type === "ROOMRISE" ? "Roomrise thu" : c.payee_type === "SERVICE_PARTNER" ? "NCC thu" : "Host thu"}
                              </Badge>
                            </TableCell>
                            <TableCell>{c.payment_method}</TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(c.amount_collected)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{c.note || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">Không có collections</div>
                  )}
                </TabsContent>

                <TabsContent value="payments" className="border rounded-lg p-0 mt-4">
                  {hostDetail.cashflowPayments.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Ngày</TableHead>
                          <TableHead>Hướng</TableHead>
                          <TableHead className="text-right">Số tiền</TableHead>
                          <TableHead>Ghi chú</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hostDetail.cashflowPayments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{formatDate(p.cash_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={p.direction === "IN" ? "text-success" : "text-info"}>
                                {p.direction === "IN" ? "Thu về" : "Chi ra"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-success">{formatCurrency(p.amount)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{p.note || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p>Chưa có giao dịch thanh toán</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Note */}
              {s.note && (
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Ghi chú</p>
                  <p className="text-xs whitespace-pre-wrap">{s.note}</p>
                </div>
              )}

              {/* Meta */}
              <div className="text-xs text-muted-foreground pt-2 border-t flex flex-wrap gap-4">
                <span>ID: <code className="bg-muted px-1 rounded">{s.id}</code></span>
                <span>Tạo lúc: {formatDateTime(s.created_at)}</span>
              </div>
            </div>
          </ScrollArea>

          {/* Footer Actions */}
          <DialogFooter className="pt-4 border-t flex items-center justify-between">
            <div>
              {canVoid && (
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setVoidDialogOpen(true)}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Hủy quyết toán
                </Button>
              )}
            </div>
            <div>
              {!isVoid && stats.remaining_amount > 0 && (
                stats.net_direction === "PAY" ? (
                  <Button onClick={onGoToPayment} className="bg-info hover:bg-info">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Đi tới Chi tiền cho Host
                  </Button>
                ) : (
                  <Button onClick={onGoToCollect} className="bg-primary hover:bg-primary">
                    <ArrowDownLeft className="h-4 w-4 mr-2" />
                    Đi tới Thu tiền từ Host
                  </Button>
                )
              )}
            </div>
          </DialogFooter>

          {/* Void Confirmation Dialog */}
          <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                  Hủy quyết toán
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    Bạn đang hủy phiếu quyết toán <strong>{s.settlement_code}</strong>.
                    Hành động này sẽ:
                  </p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>Chuyển trạng thái phiếu sang <strong>ĐÃ HỦY</strong></li>
                    <li>Hủy các đề xuất thanh toán liên quan</li>
                    <li>Mở khóa các segments/charges để cho phép quyết toán lại</li>
                  </ul>
                  <p className="text-destructive font-medium">⚠️ Hành động không thể hoàn tác.</p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <label className="text-sm font-medium mb-2 block">Lý do hủy <span className="text-destructive">*</span></label>
                <Textarea
                  placeholder="Nhập lý do hủy quyết toán..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => { setVoidReason(""); }}>Hủy bỏ</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!voidReason.trim() || voidMutation.isPending}
                  onClick={handleVoidSettlement}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {voidMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang xử lý...</>
                  ) : (
                    "Xác nhận hủy"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>
    );
  }

  if (settlementType === "SERVICE" && serviceDetail) {
    const s = serviceDetail.settlement;
    const stats = serviceDetail.computedStats;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Chi tiết Phiếu Quyết toán Dịch vụ: {s.settlement_code}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Xem đầy đủ thông tin quyết toán dịch vụ, bao gồm đơn dịch vụ và thanh toán.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="space-y-6 py-4">
              {/* Header Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg border">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Đối tác</p>
                  <p className="font-semibold">{s.partner_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Kỳ quyết toán</p>
                  <p className="font-semibold">{formatDate(s.period_from)} → {formatDate(s.period_to)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Trạng thái</p>
                  <div className="mt-1">{getStatusBadge(s.payment_status)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Ngày chốt</p>
                  <p className="font-semibold">{formatDateTime(s.finalized_at)}</p>
                </div>
              </div>

              {/* KPI Summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted dark:bg-muted/50 border">
                  <p className="text-xs text-muted-foreground">Tổng giá bán</p>
                  <p className="text-lg font-bold">{formatCurrency(s.total_sale_price)}</p>
                </div>
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs text-destructive dark:text-destructive">Tổng giá gốc</p>
                  <p className="text-lg font-bold text-destructive dark:text-destructive">{formatCurrency(s.total_cost_price)}</p>
                </div>
                <div className="p-3 rounded-lg bg-success/10 dark:bg-success/10 border border-success/20">
                  <p className="text-xs text-success">Lợi nhuận</p>
                  <p className="text-lg font-bold text-success">
                    {formatCurrency(s.total_sale_price - s.total_cost_price)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-xs text-warning">Partner đã thu</p>
                  <p className="text-lg font-bold text-warning">{formatCurrency(s.partner_collected_amount)}</p>
                </div>
                <div className="p-3 rounded-lg bg-info/10 border border-info/20">
                  <p className="text-xs text-info">Roomrise đã thu</p>
                  <p className="text-lg font-bold text-info">{formatCurrency(s.roomrise_collected_amount)}</p>
                </div>
                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-xs text-success">Đã thanh toán</p>
                  <p className="text-lg font-bold text-success">{formatCurrency(s.total_paid || 0)}</p>
                </div>
              </div>

              {/* NET Position */}
              <div className={`rounded-xl p-5 border-2 ${stats.net_direction === "PAY"
                ? "border-info/20 bg-info/10"
                : "border-primary/20 bg-primary/10"
                }`}>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm flex items-center gap-2">
                      {stats.net_direction === "PAY"
                        ? <><TrendingUp className="h-4 w-4" /> NET (Roomrise phải TRẢ cho Partner)</>
                        : <><TrendingDown className="h-4 w-4" /> NET (Roomrise phải THU từ Partner)</>
                      }
                    </p>
                    <p className={`text-4xl font-bold mt-1 ${stats.net_direction === "PAY" ? "text-info" : "text-primary"}`}>
                      {formatCurrency(Math.abs(s.net_amount))}
                    </p>
                  </div>
                  <Badge className={`text-base px-4 py-2 text-white ${stats.net_direction === "PAY" ? "bg-info" : "bg-primary"}`}>
                    {stats.net_direction === "PAY" ? "⬆️ RS TRẢ" : "⬇️ RS THU"}
                  </Badge>
                </div>
              </div>

              {/* Payment Progress */}
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-xl p-4 text-center bg-success/10/50 dark:bg-success/10">
                  <Wallet className="h-5 w-5 mx-auto mb-1 text-success" />
                  <span className="text-sm text-muted-foreground block">
                    {stats.net_direction === "RECEIVE" ? "Đã thu về" : "Đã chi trả"}
                  </span>
                  <p className="text-2xl font-bold text-success">{formatCurrency(stats.paid_amount)}</p>
                </div>
                <div className="border rounded-xl p-4 text-center bg-destructive/10/50">
                  <Clock className="h-5 w-5 mx-auto mb-1 text-destructive" />
                  <span className="text-sm text-muted-foreground block">Còn lại</span>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(stats.remaining_amount)}</p>
                </div>
                <div className="border rounded-xl p-4 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <span className="text-sm text-muted-foreground block">Trạng thái</span>
                  <Badge className={`mt-1 ${paymentStatusColors[stats.payment_status as keyof typeof paymentStatusColors] || ""}`}>
                    {getPaymentStatusLabel(stats.payment_status, stats.net_direction)}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Service Orders Table */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Đơn dịch vụ ({serviceDetail.serviceOrders.length})
                </h3>
                {serviceDetail.serviceOrders.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Mã đơn</TableHead>
                          <TableHead>Loại dịch vụ</TableHead>
                          <TableHead>Ngày</TableHead>
                          <TableHead className="text-right">Giá bán</TableHead>
                          <TableHead className="text-right">Giá gốc</TableHead>
                          <TableHead className="text-right">Lợi nhuận</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {serviceDetail.serviceOrders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">{o.order_code}</TableCell>
                            <TableCell>{o.service_type}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDateTime(o.service_date)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(o.sale_price)}</TableCell>
                            <TableCell className="text-right text-destructive">{formatCurrency(o.cost_price)}</TableCell>
                            <TableCell className="text-right font-semibold text-success">
                              {formatCurrency(o.sale_price - o.cost_price)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 border rounded-lg text-muted-foreground">Không có đơn dịch vụ</div>
                )}
              </div>

              {/* Cashflow Payments */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Lịch sử thanh toán ({serviceDetail.cashflowPayments.length})
                </h3>
                {serviceDetail.cashflowPayments.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Ngày</TableHead>
                          <TableHead>Hướng</TableHead>
                          <TableHead className="text-right">Số tiền</TableHead>
                          <TableHead>Ghi chú</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {serviceDetail.cashflowPayments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{formatDate(p.cash_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={p.direction === "IN" ? "text-success" : "text-info"}>
                                {p.direction === "IN" ? "Thu về" : "Chi ra"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-success">{formatCurrency(p.amount)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{p.note || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 border rounded-lg text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p>Chưa có giao dịch thanh toán</p>
                  </div>
                )}
              </div>

              {/* Note */}
              {s.note && (
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Ghi chú</p>
                  <p className="text-sm whitespace-pre-wrap">{s.note}</p>
                </div>
              )}

              {/* Meta */}
              <div className="text-xs text-muted-foreground pt-2 border-t flex flex-wrap gap-4">
                <span>ID: <code className="bg-muted px-1 rounded">{s.id}</code></span>
                <span>Tạo lúc: {formatDateTime(s.created_at)}</span>
              </div>
            </div>
          </ScrollArea>

          {/* Footer Actions */}
          {stats.remaining_amount > 0 && (
            <DialogFooter className="pt-4 border-t">
              {stats.net_direction === "PAY" ? (
                <Button onClick={onGoToPayment} className="bg-info hover:bg-info">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Đi tới Chi tiền cho Partner
                </Button>
              ) : (
                <Button onClick={onGoToCollect} className="bg-primary hover:bg-primary">
                  <ArrowDownLeft className="h-4 w-4 mr-2" />
                  Đi tới Thu tiền từ Partner
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // Loading or no data state
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Chi tiết Phiếu Quyết toán
          </DialogTitle>
          <DialogDescription className="sr-only">
            Trạng thái tải dữ liệu chi tiết phiếu quyết toán.
          </DialogDescription>
        </DialogHeader>
        <div className="py-12 text-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Đang tải dữ liệu...</p>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p>Không tìm thấy thông tin</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
