import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertTriangle, User, Calendar, Building2, Receipt, Banknote, CreditCard, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";
import { useSurchargeSummary } from "@/hooks/useSurcharges";
import { useServiceOrdersByBooking } from "@/hooks/useServiceOrders";
import { useHostSupplySegments } from "@/hooks/useHostSupplySegments";

// Lý do không thu tiền
type SkipReason = "ROOMRISE_PAY" | "OTHER";

interface CheckOutDialogProps {
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
  // Callbacks để mở dialog thu tiền
  onCollectRoom?: () => void;
  onCollectService?: () => void;
  onCollectSurcharge?: () => void;
  // Optional: specific segment to check out (for multi-segment support)
  currentSegmentId?: string | null;
}

export function CheckOutDialog({
  open,
  onOpenChange,
  stay,
  booking,
  amountCollected,
  onCollectRoom,
  onCollectService,
  onCollectSurcharge,
  currentSegmentId,
}: CheckOutDialogProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    actual_check_out_at: new Date().toISOString().slice(0, 16),
    note: "",
  });

  // Get all segments for this booking
  const { data: segments = [] } = useHostSupplySegments(stay.unified_booking_id);

  // Find the current segment to check out:
  // 1. If currentSegmentId is provided, use it
  // 2. Otherwise, find segment that has actual_check_in_at but no actual_check_out_at
  const segmentToCheckOut = useMemo(() => {
    if (currentSegmentId) {
      return segments.find(s => s.id === currentSegmentId);
    }
    // Find segment with check-in but no check-out
    return segments.find(s => s.actual_check_in_at && !s.actual_check_out_at);
  }, [segments, currentSegmentId]);

  // State cho các khoản chưa thu - lý do bỏ qua
  const [roomSkipReason, setRoomSkipReason] = useState<SkipReason | null>(null);
  const [roomSkipNote, setRoomSkipNote] = useState("");
  const [serviceSkipReason, setServiceSkipReason] = useState<SkipReason | null>(null);
  const [serviceSkipNote, setServiceSkipNote] = useState("");
  const [surchargeSkipReason, setSurchargeSkipReason] = useState<SkipReason | null>(null);
  const [surchargeSkipNote, setSurchargeSkipNote] = useState("");

  // Get surcharge summary
  const { data: surchargeSummary } = useSurchargeSummary(stay.unified_booking_id);

  // Get service orders
  const { data: serviceOrders = [] } = useServiceOrdersByBooking(stay.unified_booking_id);

  // Calculate unpaid services (collector_type = ROOMRISE, status != DONE)
  const unpaidServices = serviceOrders.filter(
    (s: any) => s.collector_type === "ROOMRISE" && s.status !== "DONE" && s.status !== "CANCELLED"
  );
  const unpaidServicesAmount = unpaidServices.reduce((sum: number, s: any) => sum + (s.sale_price || 0), 0);

  // NOTE: Check-out is an OPERATION action that does NOT change owner
  // The audit_log records who performed the action for tracking purposes

  const totalAmount = booking.total_amount_net || 0;
  const remainingAmount = totalAmount - amountCollected;
  const isHotelCollect = booking.payment_type === "HOTEL_COLLECT";
  const hasUnpaidRoom = isHotelCollect && remainingAmount > 0;
  const hasUnpaidServices = unpaidServicesAmount > 0;
  const hasUnpaidSurcharges = (surchargeSummary?.totalPending || 0) > 0;

  // Kiểm tra có khoản nào chưa thu không
  const hasAnyUnpaid = hasUnpaidRoom || hasUnpaidServices || hasUnpaidSurcharges;

  // Kiểm tra đã xử lý hết các khoản chưa thu chưa (thu hoặc có lý do)
  const roomHandled = !hasUnpaidRoom || (roomSkipReason !== null && (roomSkipReason !== "OTHER" || roomSkipNote.trim()));
  const serviceHandled = !hasUnpaidServices || (serviceSkipReason !== null && (serviceSkipReason !== "OTHER" || serviceSkipNote.trim()));
  const surchargeHandled = !hasUnpaidSurcharges || (surchargeSkipReason !== null && (surchargeSkipReason !== "OTHER" || surchargeSkipNote.trim()));
  const allHandled = roomHandled && serviceHandled && surchargeHandled;

  // Reset form khi dialog mở
  useEffect(() => {
    if (open) {
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
    }
  }, [open]);

  // === OPTIMISTIC UPDATE HELPER ===
  const applyOptimisticUpdate = useCallback((updates: Record<string, unknown>) => {
    const updateInList = (oldData: unknown) => {
      if (!oldData || !Array.isArray(oldData)) return oldData;
      return oldData.map((item: Record<string, unknown>) =>
        item.unified_booking_id === stay.unified_booking_id
          ? { ...item, ...updates, _isOptimistic: true }
          : item
      );
    };

    queryClient.setQueryData(["stays_with_bookings"], updateInList);
    queryClient.setQueryData(["stays"], updateInList);
    queryClient.setQueryData(["unified_bookings"], updateInList);

    // Update stays_operations with partial match (matches any date param)
    queryClient.setQueriesData({ queryKey: ["stays_operations"], exact: false }, updateInList);

    // Update stay_record for BookingDetailPage
    queryClient.setQueryData(["stay_record", stay.unified_booking_id], (old: unknown) =>
      old ? { ...(old as Record<string, unknown>), ...updates, _isOptimistic: true } : old
    );

    // Also update booking_detail query (for BookingDetailPage action buttons)
    queryClient.setQueryData(["booking_detail", stay.unified_booking_id], (old: unknown) =>
      old ? { ...(old as Record<string, unknown>), ...updates, _isOptimistic: true } : old
    );
  }, [queryClient, stay.unified_booking_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (saving) return;

    // Nếu còn khoản chưa xử lý, chưa cho submit
    if (hasAnyUnpaid && !allHandled) {
      toast.error("Vui lòng xử lý các khoản chưa thu hoặc chọn lý do bỏ qua");
      return;
    }

    // === OPTIMISTIC UPDATE: Apply immediately (<100ms) ===
    const optimisticUpdates = {
      stay_status: "CHECKED_OUT",
      actual_check_out_at: formData.actual_check_out_at,
    };
    applyOptimisticUpdate(optimisticUpdates);

    // Close dialog immediately
    onOpenChange(false);
    toast.loading("Đang ghi nhận trả phòng...", { id: "checkout-toast" });

    setSaving(true);
    try {
      const { error: stayError } = await supabase
        .from("stays")
        .update({
          stay_status: "CHECKED_OUT",
          actual_check_out_at: formData.actual_check_out_at,
          operation_note: formData.note || null,
        })
        .eq("id", stay.id);

      if (stayError) throw stayError;

      // Fire-and-forget for non-critical updates
      supabase
        .from("manual_bookings")
        .update({ booking_status: "CHECKED_OUT" })
        .eq("unified_booking_id", stay.unified_booking_id)
        .then(() => { });

      // === SEGMENT-LEVEL CHECK-OUT TRACKING (SOT sync) ===
      // MUST sync host_supply_segments to keep dashboard in sync with stays (SOT)
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (segmentToCheckOut?.id) {
          // Update specific segment being checked out
          await supabase
            .from("host_supply_segments")
            .update({
              actual_check_out_at: formData.actual_check_out_at,
              checked_out_by: userData?.user?.id || null,
            } as any)
            .eq("id", segmentToCheckOut.id);
        } else {
          // No specific segment found - update ALL segments that are checked-in but not checked-out
          // This ensures dashboard stays in sync with stays SOT
          await supabase
            .from("host_supply_segments")
            .update({
              actual_check_out_at: formData.actual_check_out_at,
              checked_out_by: userData?.user?.id || null,
            } as any)
            .eq("unified_booking_id", stay.unified_booking_id)
            .is("actual_check_out_at", null);
        }
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments", stay.unified_booking_id] });
      } catch (err) {
        console.error("[CheckOut] Error syncing segment check-out (non-blocking):", err);
      }

      // Build skip info for audit
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

      createAuditLog({
        action: AuditActions.CHECK_OUT,
        entity: "booking",
        entityId: stay.unified_booking_id,
        afterData: {
          stay_status: "CHECKED_OUT",
          actual_check_out_at: formData.actual_check_out_at,
          remaining_room_amount: remainingAmount,
          pending_services: unpaidServicesAmount,
          pending_surcharges: surchargeSummary?.totalPending || 0,
          ...skipInfo,
          checkout_note: formData.note || null,
        },
      }).catch(console.error);

      // NOTE: Check-out is an OPERATION action - it logs the actor but does NOT change the owner
      // Owner is only assigned via manual assignment (Gán thủ công, Gán người phụ trách)
      // The audit log above already records who performed this action for tracking purposes

      toast.success("Trả phòng thành công!", { id: "checkout-toast" });

      // IMMEDIATE: Invalidate stay_record to refresh BookingDetailPage action buttons
      queryClient.invalidateQueries({ queryKey: ["stay_record", stay.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["booking_detail", stay.unified_booking_id] });

      // Background sync for dashboard
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
      }, 1500);

      setFormData({
        actual_check_out_at: new Date().toISOString().slice(0, 16),
        note: "",
      });
    } catch (err: any) {
      // === ROLLBACK on error ===
      applyOptimisticUpdate({
        stay_status: "CHECKED_IN", // Revert
        actual_check_out_at: null,
      });
      toast.error("Lỗi trả phòng: " + err.message, { id: "checkout-toast" });
      queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
    } finally {
      setSaving(false);
    }
  };

  // Handler để thu tiền rồi quay lại
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

  // Component cho từng khoản chưa thu
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

      <div className="flex gap-2">
        {onCollect && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => handleCollectAndReturn(onCollect)}
            className="flex-1"
          >
            <CreditCard className="h-4 w-4 mr-1" />
            Thu tiền ngay
          </Button>
        )}
      </div>

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

  const formRef = useRef<HTMLFormElement>(null);
  const submitDisabled = saving || (hasAnyUnpaid && !allHandled);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="sm:max-w-lg sm:max-h-[90vh] sm:overflow-y-auto max-sm:overflow-hidden">
        <MobileDialogHeader
          title="Trả phòng khách"
          onClose={() => onOpenChange(false)}
          onSubmit={() => formRef.current?.requestSubmit()}
          submitLabel="Trả phòng"
          submitDisabled={submitDisabled}
          isSubmitting={saving}
        />
        <DialogHeader className="max-sm:hidden">
          <DialogTitle>Trả phòng khách</DialogTitle>
          <DialogDescription>
            Xác nhận khách trả phòng
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
            </div>
          </div>

          {/* Check-out Time */}
          <div className="space-y-2">
            <Label>Thời gian trả phòng</Label>
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
              <span className="text-muted-foreground">Đã thu tiền phòng:</span>
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
                <p className="text-xs text-success">Có thể trả phòng ngay</p>
              </div>
            </div>
          )}

          {/* Unpaid Room Amount */}
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

          {/* Unpaid Services */}
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

          {/* Unpaid Surcharges */}
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
              placeholder="Ghi chú khi trả phòng..."
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
                  Vui lòng thu tiền hoặc chọn lý do không thu cho tất cả các khoản trước khi trả phòng.
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
              Xác nhận Trả phòng
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
