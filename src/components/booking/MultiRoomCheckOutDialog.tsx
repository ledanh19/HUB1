/**
 * MULTI-ROOM CHECK-OUT DIALOG
 * ===========================
 * 
 * Supports partial check-out for multi-room bookings:
 * - Displays all room lines currently checked in
 * - Allows selecting multiple room lines for check-out
 * - Shows financial summary per room line
 * - Handles skip reasons for unpaid amounts
 * 
 * GOLDEN RULES:
 * - NON-BREAKING: Works alongside existing single-room flow
 * - SOT: Updates host_supply_segments.actual_check_out_at
 * - PARTIAL: Supports checking out subset of room lines
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  MobileDialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
// FIX: Using native HTML checkbox to avoid Radix compose-refs infinite loop (React error #185)
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Loader2,
  AlertTriangle,
  User,
  Calendar,
  Building2,
  CheckCircle,
  CheckCircle2,
  Home,
  MapPin,
  Info,
  Receipt,
  CreditCard,
  Banknote,
  CheckSquare,
  Square,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useHostSupplySegments } from "@/hooks/useHostSupplySegments";
import { useBookingRoomLines } from "@/hooks/useBookingRoomLines";
import { useSurchargeSummary } from "@/hooks/useSurcharges";
import { useServiceOrdersByBooking } from "@/hooks/useServiceOrders";
import {
  useMultiRoomCheckOut,
  mapSegmentToRoomLineStatus,
  calculateMultiRoomSummary,
  RoomLineStatus,
  CheckOutTarget,
} from "@/hooks/useMultiRoomCheckInOut";

type SkipReason = "ROOMRISE_PAY" | "OTHER";

interface MultiRoomCheckOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stay: {
    id: string;
    unified_booking_id: string;
    actual_check_in_at: string | null;
  };
  booking: {
    guest_name: string;
    guest_phone: string | null;
    check_in_date: string;
    check_out_date: string;
    payment_type: string;
    total_amount_net: number | null;
  };
  amountCollected: number;
  onCollectRoom?: () => void;
  onCollectService?: () => void;
  onCollectSurcharge?: () => void;
}

export function MultiRoomCheckOutDialog({
  open,
  onOpenChange,
  stay,
  booking,
  amountCollected,
  onCollectRoom,
  onCollectService,
  onCollectSurcharge,
}: MultiRoomCheckOutDialogProps) {
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    actual_check_out_at: new Date().toISOString().slice(0, 16),
    note: "",
  });

  // Selected room lines for check-out
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());

  // Skip reasons state
  const [roomSkipReason, setRoomSkipReason] = useState<SkipReason | null>(null);
  const [roomSkipNote, setRoomSkipNote] = useState("");
  const [serviceSkipReason, setServiceSkipReason] = useState<SkipReason | null>(null);
  const [serviceSkipNote, setServiceSkipNote] = useState("");
  const [surchargeSkipReason, setSurchargeSkipReason] = useState<SkipReason | null>(null);
  const [surchargeSkipNote, setSurchargeSkipNote] = useState("");

  // Fetch data
  const { data: segments = [] } = useHostSupplySegments(stay.unified_booking_id);
  const { data: roomLines = [] } = useBookingRoomLines(stay.unified_booking_id);
  const { data: surchargeSummary } = useSurchargeSummary(stay.unified_booking_id);
  const { data: serviceOrders = [] } = useServiceOrdersByBooking(stay.unified_booking_id);

  // Multi-room check-out mutation
  const checkOutMutation = useMultiRoomCheckOut();

  // Map segments to room line statuses
  const roomLineStatuses: RoomLineStatus[] = useMemo(() => {
    return segments.map(seg => mapSegmentToRoomLineStatus(seg as any));
  }, [segments]);

  // Calculate summary
  const summary = useMemo(() => {
    return calculateMultiRoomSummary(roomLineStatuses);
  }, [roomLineStatuses]);

  // Get checkable targets (can check out = currently checked in)
  const checkableTargets = useMemo(() => {
    return roomLineStatuses.filter(r => r.canCheckOut && r.segmentId);
  }, [roomLineStatuses]);

  // Financial calculations
  const totalAmount = booking.total_amount_net || 0;
  const remainingAmount = totalAmount - amountCollected;
  const isHotelCollect = booking.payment_type === "HOTEL_COLLECT";
  const hasUnpaidRoom = isHotelCollect && remainingAmount > 0;

  const unpaidServices = serviceOrders.filter(
    (s: any) => s.collector_type === "ROOMRISE" && s.status !== "DONE" && s.status !== "CANCELLED"
  );
  const unpaidServicesAmount = unpaidServices.reduce((sum: number, s: any) => sum + (s.sale_price || 0), 0);
  const hasUnpaidServices = unpaidServicesAmount > 0;
  const hasUnpaidSurcharges = (surchargeSummary?.totalPending || 0) > 0;
  const hasAnyUnpaid = hasUnpaidRoom || hasUnpaidServices || hasUnpaidSurcharges;

  // Check if all unpaid handled
  const roomHandled = !hasUnpaidRoom || (roomSkipReason !== null && (roomSkipReason !== "OTHER" || roomSkipNote.trim()));
  const serviceHandled = !hasUnpaidServices || (serviceSkipReason !== null && (serviceSkipReason !== "OTHER" || serviceSkipNote.trim()));
  const surchargeHandled = !hasUnpaidSurcharges || (surchargeSkipReason !== null && (surchargeSkipReason !== "OTHER" || surchargeSkipNote.trim()));
  const allHandled = roomHandled && serviceHandled && surchargeHandled;

  // Create stable key from checkable segment IDs to avoid infinite loop.
  // IMPORTANT: sort() to avoid loops when backend returns the same items in a different order across renders.
  const checkableSegmentIdsKey = useMemo(() => {
    return checkableTargets
      .map((t) => t.segmentId)
      .filter(Boolean)
      .sort()
      .join(",");
  }, [checkableTargets]);

  // CRITICAL FIX: Only reset state on dialog open transition (false → true)
  // Dependencies: ONLY 'open' - capture checkableSegmentIdsKey value when dialog opens
  const prevOpenRef = useRef(false);
  const checkableTargetsRef = useRef(checkableTargets);

  useEffect(() => {
    // Only run when dialog transitions from closed to open
    if (open && !prevOpenRef.current) {
      setFormData({
        actual_check_out_at: new Date().toISOString().slice(0, 16),
        note: "",
      });
      setRoomSkipReason(null);
      setRoomSkipNote("");
      setServiceSkipReason(null);
      setServiceSkipNote("");
      setSurchargeSkipReason(null);
      setSurchargeSkipNote("");
      // Auto-select all checkable targets using computed list
      const ids = checkableSegmentIdsKey.split(',').filter(Boolean);
      setSelectedTargets(new Set(ids));
    }
    prevOpenRef.current = open;
  }, [open]);

  // Keep ref in sync with checkableTargets
  useEffect(() => {
    checkableTargetsRef.current = checkableTargets;
  }, [checkableTargets]);

  // Toggle single target
  const toggleTarget = useCallback((segmentId: string) => {
    setSelectedTargets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(segmentId)) {
        newSet.delete(segmentId);
      } else {
        newSet.add(segmentId);
      }
      return newSet;
    });
  }, []);

  // Toggle all checkable targets
  const toggleAll = useCallback(() => {
    const targets = checkableTargetsRef.current;
    setSelectedTargets(prev => {
      if (prev.size === targets.length) {
        return new Set();
      } else {
        return new Set(targets.map(t => t.segmentId!));
      }
    });
  }, []);

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedTargets.size === 0) {
      return;
    }

    if (hasAnyUnpaid && !allHandled) {
      return;
    }

    setSaving(true);

    try {
      const targets: CheckOutTarget[] = Array.from(selectedTargets).map((segmentId: string) => {
        const status = roomLineStatuses.find(r => r.segmentId === segmentId);
        return {
          segment_id: segmentId,
          room_line_index: status?.roomLineIndex || 0,
        };
      });

      // Build skip info
      const skipInfo: Record<string, unknown> = {};
      if (hasUnpaidRoom && roomSkipReason) {
        skipInfo.room_skip = {
          amount: remainingAmount,
          reason: roomSkipReason,
          note: roomSkipReason === "OTHER" ? roomSkipNote : "Roomrise chi trả",
        };
      }
      if (hasUnpaidServices && serviceSkipReason) {
        skipInfo.service_skip = {
          amount: unpaidServicesAmount,
          reason: serviceSkipReason,
          note: serviceSkipReason === "OTHER" ? serviceSkipNote : "Roomrise chi trả",
        };
      }
      if (hasUnpaidSurcharges && surchargeSkipReason) {
        skipInfo.surcharge_skip = {
          amount: surchargeSummary?.totalPending || 0,
          reason: surchargeSkipReason,
          note: surchargeSkipReason === "OTHER" ? surchargeSkipNote : "Roomrise chi trả",
        };
      }

      await checkOutMutation.mutateAsync({
        unifiedBookingId: stay.unified_booking_id,
        stayId: stay.id,
        targets,
        actualCheckOutAt: formData.actual_check_out_at,
        note: formData.note,
        skipInfo: Object.keys(skipInfo).length > 0 ? skipInfo : undefined,
      });

      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    } finally {
      setSaving(false);
    }
  };

  const handleCollectAndReturn = (collectFn?: () => void) => {
    if (collectFn) {
      onOpenChange(false);
      collectFn();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: RoomLineStatus) => {
    switch (status.status) {
      case 'CHECKED_IN':
        return <StatusBadge variant="success" size="sm"><CheckCircle className="h-3 w-3 mr-1" />Đang lưu trú</StatusBadge>;
      case 'CHECKED_OUT':
        return <StatusBadge variant="neutral" size="sm">Đã check-out</StatusBadge>;
      case 'ASSIGNED':
        return <StatusBadge variant="info" size="sm">Chưa check-in</StatusBadge>;
      default:
        return <StatusBadge variant="danger" size="sm">Chưa gán</StatusBadge>;
    }
  };

  // Unpaid section component
  const UnpaidSection = ({
    title,
    amount,
    skipReason,
    setSkipReason,
    skipNote,
    setSkipNote,
    onCollect,
    icon: Icon,
  }: {
    title: string;
    amount: number;
    skipReason: SkipReason | null;
    setSkipReason: (v: SkipReason | null) => void;
    skipNote: string;
    setSkipNote: (v: string) => void;
    onCollect?: () => void;
    icon: typeof CreditCard;
  }) => (
    <div className="p-4 rounded-lg border border-warning/30 bg-warning/5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-warning" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        <span className="text-destructive font-semibold">{formatCurrency(amount)}</span>
      </div>

      {onCollect && (
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => handleCollectAndReturn(onCollect)}
          className="w-full"
        >
          <CreditCard className="h-4 w-4 mr-1" />
          Thu tiền ngay
        </Button>
      )}

      <div className="pt-2 border-t border-border/50">
        <Label className="text-xs text-muted-foreground mb-2 block">Hoặc chọn lý do không thu:</Label>
        <RadioGroup
          value={skipReason || ""}
          onValueChange={(v) => setSkipReason(v as SkipReason)}
          className="space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="ROOMRISE_PAY" id={`${title}-roomrise`} />
            <Label htmlFor={`${title}-roomrise`} className="text-sm font-normal cursor-pointer">
              Roomrise sẽ chi trả
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="OTHER" id={`${title}-other`} />
            <Label htmlFor={`${title}-other`} className="text-sm font-normal cursor-pointer">
              Lý do khác
            </Label>
          </div>
        </RadioGroup>

        {skipReason === "OTHER" && (
          <Textarea
            value={skipNote}
            onChange={(e) => setSkipNote(e.target.value)}
            placeholder="Nhập lý do..."
            rows={2}
            className="mt-2"
          />
        )}
      </div>
    </div>
  );

  const isMultiRoom = roomLines.length > 1 || segments.length > 1;
  const canSubmit = selectedTargets.size > 0 && (!hasAnyUnpaid || allHandled);
  const formRef = useRef<HTMLFormElement>(null);
  const submitDisabled = saving || !canSubmit;
  const checkoutSubmitLabel = selectedTargets.size < checkableTargets.length && selectedTargets.size > 0
    ? `Trả ${selectedTargets.size} phòng`
    : "Trả phòng";

  // CRITICAL: Early return when closed to prevent Radix ref setup loops
  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen size="2xl" className="sm:max-h-[90vh] sm:overflow-y-auto max-sm:overflow-hidden">
        <MobileDialogHeader
          title={isMultiRoom ? "Check-out Multi-room" : "Trả phòng"}
          onClose={() => onOpenChange(false)}
          onSubmit={() => formRef.current?.requestSubmit()}
          submitLabel={checkoutSubmitLabel}
          submitDisabled={submitDisabled}
          isSubmitting={saving}
        />
        <DialogHeader className="max-sm:hidden">
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Check-out {isMultiRoom ? "Multi-room" : ""}
          </DialogTitle>
          <DialogDescription>
            {isMultiRoom
              ? "Chọn các phòng cần check-out. Hỗ trợ check-out partial (một phần)."
              : "Xác nhận khách trả phòng"}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 max-sm:flex-1 max-sm:overflow-y-auto max-sm:p-4">
          {/* Booking Info */}
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Khách:</span>
              <span className="font-medium">{booking.guest_name}</span>
              <span className="text-muted-foreground">Lưu trú:</span>
              <span>{formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)}</span>
              <span className="text-muted-foreground">Nhận phòng:</span>
              <span>{formatDateTime(stay.actual_check_in_at)}</span>
              {isMultiRoom && (
                <>
                  <span className="text-muted-foreground">Số phòng:</span>
                  <span>
                    <StatusBadge variant="warning" size="sm">
                      {segments.length} phòng
                    </StatusBadge>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Summary */}
          {isMultiRoom && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Trạng thái phòng</span>
                <div className="flex gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {summary.checkedInRoomLines} đang lưu trú / {summary.checkedOutRoomLines} đã ra
                  </span>
                  {summary.isPartialCheckOut && (
                    <StatusBadge variant="warning" size="sm">Partial</StatusBadge>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Room Lines Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Chọn phòng check-out
              </Label>
              {checkableTargets.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  className="h-auto py-1"
                >
                  {selectedTargets.size === checkableTargets.length ? (
                    <>
                      <Square className="h-4 w-4 mr-1" />
                      Bỏ chọn tất cả
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-1" />
                      Chọn tất cả ({checkableTargets.length})
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {roomLineStatuses.map((status, idx) => {
                const isCheckable = status.canCheckOut && status.segmentId;
                const isSelected = status.segmentId ? selectedTargets.has(status.segmentId) : false;

                return (
                  <div
                    key={status.segmentId || idx}
                    onClick={() => isCheckable && status.segmentId && toggleTarget(status.segmentId)}
                    className={`p-3 rounded-lg border transition-all ${isCheckable
                      ? isSelected
                        ? 'border-primary bg-primary/10 cursor-pointer'
                        : 'border-border hover:border-primary/50 cursor-pointer'
                      : 'border-border/50 bg-muted/30 cursor-not-allowed opacity-60'
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {isCheckable && status.segmentId && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTarget(status.segmentId!)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={!isCheckable}
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              Phòng {status.roomLineIndex + 1}
                            </span>
                            {getStatusBadge(status)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {status.hostPropertyName && (
                              <span>{status.hostPropertyName}</span>
                            )}
                            {status.hostRoomType && (
                              <span> • {status.hostRoomType}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {formatDate(status.dateFrom)} → {formatDate(status.dateTo)}
                          </div>
                          {status.actualCheckInAt && (
                            <div className="text-xs text-success mt-1">
                              ✓ Check-in: {formatDateTime(status.actualCheckInAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {checkableTargets.length === 0 && (
              <div className="p-4 rounded-lg bg-muted/50 border text-center">
                <Info className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Không có phòng nào đang lưu trú để check-out</p>
              </div>
            )}
          </div>

          {/* Selected Summary */}
          {selectedTargets.size > 0 && (
            <div className="p-3 rounded-lg bg-info/10 border border-info/20">
              <div className="flex items-center gap-2 text-info">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium text-sm">
                  Đã chọn {selectedTargets.size}/{checkableTargets.length} phòng để check-out
                </span>
              </div>
              {selectedTargets.size < checkableTargets.length && (
                <p className="text-xs text-info mt-1 ml-6">
                  <Info className="h-3 w-3 inline mr-1" />
                  Check-out partial: Các phòng còn lại vẫn đang lưu trú
                </p>
              )}
            </div>
          )}

          {/* Check-out Time */}
          <div className="space-y-2">
            <Label>Thời gian check-out</Label>
            <Input
              type="datetime-local"
              value={formData.actual_check_out_at}
              onChange={(e) => setFormData({ ...formData, actual_check_out_at: e.target.value })}
            />
          </div>

          {/* Financial Summary */}
          <div className="p-4 rounded-lg bg-muted/30 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Tổng quan tài chính</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tổng tiền phòng:</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Đã thu:</span>
              <span className="text-success">{formatCurrency(amountCollected)}</span>
            </div>
            {hasUnpaidServices && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dịch vụ chưa thu:</span>
                <span className="text-warning">{formatCurrency(unpaidServicesAmount)}</span>
              </div>
            )}
            {hasUnpaidSurcharges && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Phụ phí chưa thu:</span>
                <span className="text-warning">{formatCurrency(surchargeSummary?.totalPending || 0)}</span>
              </div>
            )}
          </div>

          {/* No unpaid - show success */}
          {!hasAnyUnpaid && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-success/10 border border-success/20">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-medium text-success">Đã thu đủ tất cả các khoản</p>
                <p className="text-xs text-success">Có thể check-out ngay</p>
              </div>
            </div>
          )}

          {/* Unpaid sections */}
          {hasUnpaidRoom && (
            <UnpaidSection
              title="Tiền phòng chưa thu"
              amount={remainingAmount}
              skipReason={roomSkipReason}
              setSkipReason={setRoomSkipReason}
              skipNote={roomSkipNote}
              setSkipNote={setRoomSkipNote}
              onCollect={onCollectRoom}
              icon={Building2}
            />
          )}

          {hasUnpaidServices && (
            <UnpaidSection
              title="Dịch vụ chưa thu"
              amount={unpaidServicesAmount}
              skipReason={serviceSkipReason}
              setSkipReason={setServiceSkipReason}
              skipNote={serviceSkipNote}
              setSkipNote={setServiceSkipNote}
              onCollect={onCollectService}
              icon={Receipt}
            />
          )}

          {hasUnpaidSurcharges && (
            <UnpaidSection
              title="Phụ phí chưa thu"
              amount={surchargeSummary?.totalPending || 0}
              skipReason={surchargeSkipReason}
              setSkipReason={setSurchargeSkipReason}
              skipNote={surchargeSkipNote}
              setSkipNote={setSurchargeSkipNote}
              onCollect={onCollectSurcharge}
              icon={Banknote}
            />
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Ghi chú khi check-out..."
              rows={2}
            />
          </div>

          {/* Validation message */}
          {hasAnyUnpaid && !allHandled && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">Chưa xử lý hết các khoản</p>
                <p className="text-xs text-warning">
                  Vui lòng thu tiền hoặc chọn lý do không thu cho tất cả các khoản trước khi check-out.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 max-sm:hidden">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={submitDisabled}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {checkoutSubmitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
