import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Banknote,
  Receipt,
  CheckCircle,
  DollarSign,
  Plane,
  Plus,
  Info,
  ExternalLink
} from "lucide-react";
import { CollectPaymentDialog } from "./CollectPaymentDialog";
import { AddServiceDialog } from "./AddServiceDialog";
import { PAYMENT_TOLERANCE_VND } from "@/constants/payment-tolerance";

interface PaymentBucketsSectionProps {
  booking: {
    unified_booking_id: string;
    payment_type: string;
    booking_type: string;
    total_amount_net: number | null;
    guest_name: string;
    booking_status?: string | null;
  };
  roomExpected: number; // Pre-computed from computeBookingAmount (handles CANCELLED, overrides)
  roomCollectedAmount: number;
  feesExpected: number;
  feesCollected: number;
  servicesExpected: number;
  servicesCollected: number;
  isOtaCollect: boolean;
  otaPayoutCount: number;
  roomCollectionCount: number;
  feesCollectionCount: number;
  servicesCollectionCount: number;
  canAddFees?: boolean;
  onAddFees?: () => void;
  onAddService?: () => void;
  onCollectionComplete?: () => void;
  onConfirmRounding?: (amount: number) => void;
  isConfirmingRounding?: boolean;
  /** Hide the "Tổng hợp thu tiền" summary block (used when mobile wrapper shows its own) */
  hideSummary?: boolean;
  /** Hide add service/fees buttons */
  hideAddButtons?: boolean;
}

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

// Derived payment status - NOT stored in DB
const getPaymentStatus = (expected: number, collected: number) => {
  if (collected === 0) return "UNPAID";
  if (collected >= expected) return "PAID";
  return "PARTIALLY_PAID";
};

export function PaymentBucketsSection({
  booking,
  roomExpected,
  roomCollectedAmount,
  feesExpected,
  feesCollected,
  servicesExpected,
  servicesCollected,
  isOtaCollect,
  otaPayoutCount,
  roomCollectionCount,
  feesCollectionCount,
  servicesCollectionCount,
  canAddFees = true,
  onAddFees,
  onAddService,
  onCollectionComplete,
  onConfirmRounding,
  isConfirmingRounding = false,
  hideSummary = false,
  hideAddButtons = false,
}: PaymentBucketsSectionProps) {
  const [collectRoomDialogOpen, setCollectRoomDialogOpen] = useState(false);
  const [collectFeesDialogOpen, setCollectFeesDialogOpen] = useState(false);
  const [collectServicesDialogOpen, setCollectServicesDialogOpen] = useState(false);
  const [addServiceDialogOpen, setAddServiceDialogOpen] = useState(false);

  // Check if booking is cancelled - show 0 for all expected amounts
  const isCancelled = (booking.booking_status || "").toUpperCase() === "CANCELLED" ||
    (booking.booking_status || "").toUpperCase() === "CANCELED" ||
    (booking.booking_status || "").toUpperCase() === "NO_SHOW";

  // Use roomExpected prop (already computed with CANCELLED logic)
  const roomRemaining = roomExpected - roomCollectedAmount;
  const feesRemaining = feesExpected - feesCollected;
  const servicesRemaining = servicesExpected - servicesCollected;

  // Total summary (derived - NOT stored in DB)
  const totalExpected = roomExpected + feesExpected + servicesExpected;
  const totalCollected = roomCollectedAmount + feesCollected + servicesCollected;
  const totalRemaining = totalExpected - totalCollected;

  // Rounding tolerance detection (HOTEL_COLLECT only, not OTA)
  const isWithinRoundingTolerance = !isOtaCollect && roomRemaining > 0 && roomRemaining <= PAYMENT_TOLERANCE_VND;
  // Check if rounding was already applied (detected from hotel_collects with note = 'ROUNDING_WRITE_OFF')
  // This is implicit: if roomRemaining <= 0, rounding was applied and payment status is naturally PAID

  // Room payment status (derived) — treat rounding tolerance as PAID
  const effectiveRoomStatus = isWithinRoundingTolerance ? "PAID" : getPaymentStatus(roomExpected, roomCollectedAmount);
  const roomPaymentStatus = effectiveRoomStatus;
  const getRoomStatusBadge = () => {
    switch (roomPaymentStatus) {
      case "UNPAID":
        return {
          variant: "danger" as const,
          label: isOtaCollect ? "Chờ OTA về tiền" : "Chưa thu"
        };
      case "PARTIALLY_PAID":
        return {
          variant: "warning" as const,
          label: isOtaCollect ? "OTA về 1 phần" : "Thu 1 phần"
        };
      case "PAID":
        return {
          variant: "success" as const,
          label: isOtaCollect ? "Đã thu đủ (OTA)" : "Đã thu đủ"
        };
      default:
        return { variant: "default" as const, label: "—" };
    }
  };
  const roomStatusBadge = getRoomStatusBadge();

  // Fees payment status (derived)
  const feesPaymentStatus = getPaymentStatus(feesExpected, feesCollected);
  const getFeesStatusBadge = () => {
    if (feesExpected === 0) return { variant: "default" as const, label: "Không có" };
    switch (feesPaymentStatus) {
      case "UNPAID":
        return { variant: "danger" as const, label: "Chưa thu" };
      case "PARTIALLY_PAID":
        return { variant: "warning" as const, label: "Thu 1 phần" };
      case "PAID":
        return { variant: "success" as const, label: "Đã thu đủ" };
      default:
        return { variant: "default" as const, label: "—" };
    }
  };

  // Services payment status (derived)
  const servicesPaymentStatus = getPaymentStatus(servicesExpected, servicesCollected);
  const getServicesStatusBadge = () => {
    if (servicesExpected === 0) return { variant: "default" as const, label: "Không có" };
    switch (servicesPaymentStatus) {
      case "UNPAID":
        return { variant: "danger" as const, label: "Chưa thu" };
      case "PARTIALLY_PAID":
        return { variant: "warning" as const, label: "Thu 1 phần" };
      case "PAID":
        return { variant: "success" as const, label: "Đã thu đủ" };
      default:
        return { variant: "default" as const, label: "—" };
    }
  };

  // Summary interpretation (derived - read-only)
  const getSummaryStatus = () => {
    const roomPaid = roomPaymentStatus === "PAID"; // Already includes rounding tolerance
    const feesPaid = feesPaymentStatus === "PAID" || feesExpected === 0;
    const servicesPaid = servicesPaymentStatus === "PAID" || servicesExpected === 0;

    if (roomPaid && feesPaid && servicesPaid) {
      return { text: "Đã thu đủ toàn bộ", variant: "success" as const };
    }

    // For OTA_COLLECT: room is handled by OTA
    if (isOtaCollect) {
      if (roomPaid && feesPaid && servicesPaid) {
        return { text: "Đã thu đủ", variant: "success" as const };
      }
      if (roomPaymentStatus === "UNPAID") {
        return { text: "Chờ OTA về tiền phòng", variant: "info" as const };
      }
      if (!feesPaid || !servicesPaid) {
        const issues = [];
        if (!feesPaid) issues.push("phụ phí");
        if (!servicesPaid) issues.push("dịch vụ");
        return { text: `Còn ${issues.join(" & ")} chưa thu`, variant: "warning" as const };
      }
      return { text: "OTA về tiền phòng, đã thu phụ phí/DV", variant: "success" as const };
    }

    // For HOTEL_COLLECT — rounding tolerance already factored into roomPaid
    if (!roomPaid) {
      return { text: "Chưa thu đủ tiền phòng", variant: "danger" as const };
    }
    if (roomPaid && !feesPaid && servicesPaid) return { text: "Đã thu đủ tiền phòng, còn phụ phí", variant: "warning" as const };
    if (roomPaid && feesPaid && !servicesPaid) return { text: "Đã thu đủ tiền phòng, còn dịch vụ", variant: "warning" as const };
    if (roomPaid && !feesPaid && !servicesPaid) return { text: "Đã thu đủ tiền phòng, còn phụ phí & dịch vụ", variant: "warning" as const };
    return { text: "Đang xử lý", variant: "default" as const };
  };

  // Special handling for CANCELLED bookings
  const summaryStatus = isCancelled
    ? { text: "Đặt phòng đã huỷ - Không cần thu tiền", variant: "default" as const }
    : getSummaryStatus();

  // Collection page link with booking filter
  const collectionsPageUrl = `/collections?booking=${booking.unified_booking_id}`;

  // For cancelled bookings, show special UI
  if (isCancelled) {
    return (
      <div className="space-y-4">
        {/* Cancelled Notice */}
        <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 bd-alert">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <Receipt className="h-5 w-5" />
            <span className="font-semibold">Đặt phòng đã huỷ</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Đặt phòng này đã bị huỷ. Số tiền phải thu = 0đ.
            Không cần thực hiện thu tiền thêm.
          </p>
        </div>

        {/* Summary for cancelled - show original amount for reference */}
        <div className="rounded-xl border border-border bg-card p-4 bd-summary">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Tổng hợp thu tiền</span>
            </div>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link to={collectionsPageUrl}>
                <ExternalLink className="mr-1 h-3 w-3" />
                Xem lịch sử
              </Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Số tiền gốc</p>
              <p className="font-medium line-through text-muted-foreground text-sm">
                {formatCurrency(booking.total_amount_net || 0)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Phải thu (sau huỷ)</p>
              <p className="font-bold text-success text-sm">0 ₫</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Đã thu</p>
              <p className="font-bold text-success text-sm">{formatCurrency(totalCollected)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Trạng thái</p>
              <p className="font-medium text-xs text-muted-foreground">
                Đã huỷ
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 3 Buckets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* BUCKET 1: ROOM (Tiền phòng) */}
        <div className="rounded-xl border border-border bg-card p-4 bd-payment-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Tiền phòng</span>
            </div>
            <StatusBadge variant={roomStatusBadge.variant} size="sm">
              {roomStatusBadge.label}
            </StatusBadge>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phải thu</span>
              <span className="font-medium">{formatCurrency(roomExpected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Đã thu</span>
              <span className="font-medium text-success">{formatCurrency(roomCollectedAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Còn lại</span>
              <span className={`font-bold ${roomRemaining === 0 ? "text-success" : roomRemaining < 0 ? "text-warning" : "text-destructive"}`}>
                {formatCurrency(Math.abs(roomRemaining))}
                {roomRemaining < 0 && " (dư)"}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            {isOtaCollect ? (
              <>
                <div className="flex items-center gap-1 mb-2 p-2 rounded bg-info/100/10 text-info">
                  <Info className="h-3 w-3" />
                  <span>OTA đã thu tiền phòng từ khách</span>
                </div>
                <span>{otaPayoutCount} đợt payout từ OTA</span>
              </>
            ) : (
              <>
                <span>{roomCollectionCount} lần thu</span>
                {roomRemaining > 0 && !isWithinRoundingTolerance && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setCollectRoomDialogOpen(true)}
                  >
                    <Banknote className="mr-2 h-3 w-3" />
                    Thu tiền phòng
                  </Button>
                )}
                {isWithinRoundingTolerance && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-1 p-2 rounded bg-muted text-xs text-muted-foreground">
                      <Info className="h-3 w-3 shrink-0" />
                      <span>Sai số làm tròn: {formatCurrency(roomRemaining)}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => onConfirmRounding?.(roomRemaining)}
                      disabled={isConfirmingRounding}
                    >
                      <CheckCircle className="mr-2 h-3 w-3" />
                      {isConfirmingRounding ? "Đang xử lý..." : "Xác nhận đã thu đủ (làm tròn)"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* BUCKET 2: FEES (Phụ phí) */}
        <div className="rounded-xl border border-border bg-card p-4 bd-payment-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Phụ phí</span>
            </div>
            <StatusBadge variant={getFeesStatusBadge().variant} size="sm">
              {getFeesStatusBadge().label}
            </StatusBadge>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phải thu</span>
              <span className="font-medium">{formatCurrency(feesExpected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Đã thu</span>
              <span className="font-medium text-success">{formatCurrency(feesCollected)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Còn lại</span>
              <span className={`font-bold ${feesRemaining === 0 ? "text-success" : feesRemaining < 0 ? "text-warning" : "text-destructive"}`}>
                {formatCurrency(Math.abs(feesRemaining))}
                {feesRemaining < 0 && " (dư)"}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span>{feesCollectionCount} phụ phí</span>
            <div className="flex flex-col gap-1 mt-2">
              {!hideAddButtons && canAddFees && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => onAddFees?.()}
                >
                  <Plus className="mr-2 h-3 w-3" />
                  Thêm phụ phí
                </Button>
              )}
              {feesRemaining > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setCollectFeesDialogOpen(true)}
                >
                  <Banknote className="mr-2 h-3 w-3" />
                  Thu phụ phí
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* BUCKET 3: SERVICES (Dịch vụ) */}
        <div className="rounded-xl border border-border bg-card p-4 bd-payment-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-info" />
              <span className="text-sm font-medium">Dịch vụ</span>
            </div>
            <StatusBadge variant={getServicesStatusBadge().variant} size="sm">
              {getServicesStatusBadge().label}
            </StatusBadge>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phải thu</span>
              <span className="font-medium">{formatCurrency(servicesExpected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Đã thu</span>
              <span className="font-medium text-success">{formatCurrency(servicesCollected)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Còn lại</span>
              <span className={`font-bold ${servicesRemaining === 0 ? "text-success" : servicesRemaining < 0 ? "text-warning" : "text-destructive"}`}>
                {formatCurrency(Math.abs(servicesRemaining))}
                {servicesRemaining < 0 && " (dư)"}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span>{servicesCollectionCount} dịch vụ</span>
            <div className="flex flex-col gap-1 mt-2">
              {!hideAddButtons && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => onAddService ? onAddService() : setAddServiceDialogOpen(true)}
              >
                <Plane className="mr-2 h-3 w-3" />
                Thêm dịch vụ
              </Button>
              )}
              {servicesRemaining > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setCollectServicesDialogOpen(true)}
                >
                  <Banknote className="mr-2 h-3 w-3" />
                  Thu tiền dịch vụ
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Summary (Derived - Read-only) */}
      {!hideSummary && (
      <div className="rounded-xl border border-border bg-card p-4 bd-summary">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Tổng hợp thu tiền</span>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" asChild>
            <Link to={collectionsPageUrl}>
              <ExternalLink className="mr-1 h-3 w-3" />
              Xem lịch sử
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Tổng phải thu</p>
            <p className="font-bold text-sm sm:text-base">{formatCurrency(totalExpected)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Tổng đã thu</p>
            <p className="font-bold text-success text-sm sm:text-base">{formatCurrency(totalCollected)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Tổng còn lại</p>
            <p className={`font-bold text-sm sm:text-base ${totalRemaining === 0 ? "text-success" : totalRemaining < 0 ? "text-warning" : "text-destructive"}`}>
              {formatCurrency(Math.abs(totalRemaining))}
              {totalRemaining < 0 && " (dư)"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Trạng thái</p>
            <p className={`font-medium text-xs leading-tight ${summaryStatus.variant === "success" ? "text-success" :
              summaryStatus.variant === "danger" ? "text-destructive" :
                summaryStatus.variant === "warning" ? "text-warning" :
                  summaryStatus.variant === "info" ? "text-info" : ""
              }`}>
              {summaryStatus.text}
            </p>
          </div>
        </div>
      </div>
      )}

      {/* Dialogs */}
      <CollectPaymentDialog
        open={collectRoomDialogOpen}
        onOpenChange={setCollectRoomDialogOpen}
        unifiedBookingId={booking.unified_booking_id}
        remainingAmount={roomRemaining}
        paymentType={booking.payment_type}
      />

      <CollectPaymentDialog
        open={collectFeesDialogOpen}
        onOpenChange={setCollectFeesDialogOpen}
        unifiedBookingId={booking.unified_booking_id}
        remainingAmount={feesRemaining}
        paymentType="HOTEL_COLLECT"
        defaultCategory="EXTRA"
        lockCategory
      />

      <CollectPaymentDialog
        open={collectServicesDialogOpen}
        onOpenChange={setCollectServicesDialogOpen}
        unifiedBookingId={booking.unified_booking_id}
        remainingAmount={servicesRemaining}
        paymentType="HOTEL_COLLECT"
        defaultCategory="SERVICE"
        lockCategory
      />

      <AddServiceDialog
        open={addServiceDialogOpen}
        onOpenChange={setAddServiceDialogOpen}
        unifiedBookingId={booking.unified_booking_id}
      />
    </div>
  );
}
