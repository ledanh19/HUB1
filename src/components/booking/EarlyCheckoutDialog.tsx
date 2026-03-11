/**
 * EARLY CHECK-OUT DIALOG (C8)
 * ===========================
 * 
 * Handle early check-out + release remaining host nights.
 * - Cut segment date_to = actual_check_out_date
 * - BLOCK if segment already settled/locked
 * - Host payables auto-recalculate
 */

import { useState, useMemo, useCallback } from "react";
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
import { Loader2, AlertTriangle, Calendar, ArrowRight, Lock, Banknote, Home, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAuditLog } from "@/hooks/useAuditLog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useHostSupplySegments, HostSupplySegment, calculateNights } from "@/hooks/useHostSupplySegments";
import { syncHostPayables } from "@/hooks/useHostPayableSync";

interface EarlyCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stay: {
    id: string;
    unified_booking_id: string;
    actual_check_in_at: string | null;
  };
  booking: {
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    nights: number | null;
    total_amount_net: number | null;
    payment_type: string;
  };
}

export function EarlyCheckoutDialog({
  open,
  onOpenChange,
  stay,
  booking,
}: EarlyCheckoutDialogProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"select" | "confirm">("select");

  const [formData, setFormData] = useState({
    actual_check_out_at: new Date().toISOString().slice(0, 16),
    note: "",
  });

  // Get all segments for this booking
  const { data: segments = [] } = useHostSupplySegments(stay.unified_booking_id);

  // Find segment(s) that will be affected
  const checkoutDate = formData.actual_check_out_at.split("T")[0];

  const affectedSegments = useMemo(() => {
    return segments.filter(seg => {
      const segFrom = seg.date_from.split("T")[0];
      const segTo = seg.date_to.split("T")[0];
      // Segment is affected if checkout date is within the segment range
      // OR if checkout date is before segment ends
      return checkoutDate >= segFrom && checkoutDate < segTo;
    });
  }, [segments, checkoutDate]);

  // Calculate nights to release
  const releaseCalculation = useMemo(() => {
    const otaNights = booking.nights || 0;
    let originalCoveredNights = 0;
    let newCoveredNights = 0;
    let nightsToRelease = 0;
    const segmentsToUpdate: { segment: HostSupplySegment; newDateTo: string; nightsReleased: number }[] = [];

    segments.forEach(seg => {
      const segFrom = seg.date_from.split("T")[0];
      const segTo = seg.date_to.split("T")[0];
      originalCoveredNights += seg.nights;

      // Check if segment needs to be cut
      if (checkoutDate >= segFrom && checkoutDate < segTo) {
        // This segment needs to be cut
        const newDateTo = checkoutDate;
        const newNights = calculateNights(segFrom, newDateTo);
        const releasedNights = seg.nights - newNights;

        newCoveredNights += newNights;
        nightsToRelease += releasedNights;

        if (releasedNights > 0) {
          segmentsToUpdate.push({
            segment: seg,
            newDateTo,
            nightsReleased: releasedNights,
          });
        }
      } else if (checkoutDate <= segFrom) {
        // Entire segment is after checkout - should be deleted or handled
        nightsToRelease += seg.nights;
      } else {
        // Segment is completely before checkout
        newCoveredNights += seg.nights;
      }
    });

    return {
      otaNights,
      originalCoveredNights,
      newCoveredNights,
      nightsToRelease,
      segmentsToUpdate,
    };
  }, [segments, checkoutDate, booking.nights]);

  // Check if any segment is locked
  const hasLockedSegment = affectedSegments.some(seg => seg.settlement_id || seg.locked_at);

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
    queryClient.setQueryData(["stays_operations"], updateInList);
    queryClient.setQueryData(["stays"], updateInList);
    queryClient.setQueryData(["unified_bookings"], updateInList);
  }, [queryClient, stay.unified_booking_id]);

  const handleContinue = () => {
    if (hasLockedSegment) {
      toast.error("Không thể early check-out - Segment đã được settlement. Liên hệ Admin.");
      return;
    }
    setStep("confirm");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasLockedSegment) {
      toast.error("Không thể early check-out - Segment đã được settlement.");
      return;
    }

    if (saving) return;

    // === OPTIMISTIC UPDATE: Apply immediately ===
    applyOptimisticUpdate({
      stay_status: "CHECKED_OUT",
      actual_check_out_at: formData.actual_check_out_at,
    });

    onOpenChange(false);
    setStep("select");
    toast.loading("Đang xử lý early check-out...", { id: "early-checkout-toast" });

    setSaving(true);
    try {
      // 1. Update stays table with check-out
      const { error: stayError } = await supabase
        .from("stays")
        .update({
          stay_status: "CHECKED_OUT",
          actual_check_out_at: formData.actual_check_out_at,
          operation_note: formData.note || null,
        })
        .eq("id", stay.id);

      if (stayError) throw stayError;

      // 2. Cut affected segments (C8: cut segment, NOT delete)
      for (const update of releaseCalculation.segmentsToUpdate) {
        const newNights = calculateNights(
          update.segment.date_from.split("T")[0],
          update.newDateTo
        );
        const newTotalAmount = newNights * update.segment.nightly_rate;

        const { error: segError } = await supabase
          .from("host_supply_segments")
          .update({
            date_to: update.newDateTo,
            nights: newNights,
            total_amount: newTotalAmount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", update.segment.id);

        if (segError) throw segError;

        // Audit log for segment cut (fire-and-forget)
        createAuditLog({
          action: "EARLY_CHECKOUT_CUT_SEGMENT",
          entity: "host_supply_segments",
          entityId: update.segment.id,
          beforeData: {
            date_to: update.segment.date_to,
            nights: update.segment.nights,
            total_amount: update.segment.total_amount,
          },
          afterData: {
            date_to: update.newDateTo,
            nights: newNights,
            total_amount: newTotalAmount,
            nights_released: update.nightsReleased,
          },
        }).catch(console.error);
      }

      // 3. Update manual_bookings if exists (fire-and-forget)
      supabase
        .from("manual_bookings")
        .update({ booking_status: "CHECKED_OUT" })
        .eq("unified_booking_id", stay.unified_booking_id)
        .then(() => { });

      // 4. Sync host payables (recalculate) - background
      syncHostPayables(stay.unified_booking_id).catch(console.error);

      // 5. Create main audit log (fire-and-forget)
      createAuditLog({
        action: "EARLY_CHECK_OUT",
        entity: "booking",
        entityId: stay.unified_booking_id,
        afterData: {
          stay_status: "CHECKED_OUT",
          actual_check_out_at: formData.actual_check_out_at,
          ota_nights: releaseCalculation.otaNights,
          original_covered_nights: releaseCalculation.originalCoveredNights,
          new_covered_nights: releaseCalculation.newCoveredNights,
          nights_released: releaseCalculation.nightsToRelease,
          segments_updated: releaseCalculation.segmentsToUpdate.map(s => s.segment.id),
          note: formData.note,
        },
      }).catch(console.error);

      toast.success(`Early check-out thành công! Đã giải phóng ${releaseCalculation.nightsToRelease} đêm.`, { id: "early-checkout-toast" });

      // Background sync for dashboard/payables
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments", stay.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
        queryClient.invalidateQueries({ queryKey: ["host_payables"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }, 1500);

      setFormData({
        actual_check_out_at: new Date().toISOString().slice(0, 16),
        note: "",
      });
    } catch (err: any) {
      // === ROLLBACK on error ===
      applyOptimisticUpdate({
        stay_status: "CHECKED_IN",
        actual_check_out_at: null,
      });
      toast.error("Lỗi early check-out: " + err.message, { id: "early-checkout-toast" });
      queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setStep("select"); }}>
      <DialogContent mobileFullScreen className="sm:max-w-lg max-sm:overflow-hidden">
        <MobileDialogHeader
          title="Early Check-out"
          onClose={() => onOpenChange(false)}
        />
        <DialogHeader className="max-sm:hidden">
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-warning" />
            Early Check-out / Giải phóng đêm
          </DialogTitle>
          <DialogDescription>
            Khách check-out sớm hơn booking OTA. Cập nhật segment và giải phóng đêm còn lại cho host.
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4">
            {/* Settlement Lock Warning */}
            {hasLockedSegment && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <Lock className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Không thể early check-out</p>
                  <p className="text-xs text-muted-foreground">
                    Một hoặc nhiều segment đã được settlement/locked. Liên hệ Admin để xử lý.
                  </p>
                </div>
              </div>
            )}

            {/* Booking Info */}
            <div className="p-3 rounded-lg bg-muted/30">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">Khách:</span>
                <span className="font-medium">{booking.guest_name}</span>
                <span className="text-muted-foreground">Booking OTA:</span>
                <span>{formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)} ({booking.nights} đêm)</span>
                {stay.actual_check_in_at && (
                  <>
                    <span className="text-muted-foreground">Nhận phòng:</span>
                    <span>{formatDate(stay.actual_check_in_at)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Check-out Date Selection */}
            <div className="space-y-2">
              <Label>Ngày check-out thực tế</Label>
              <Input
                type="datetime-local"
                value={formData.actual_check_out_at}
                onChange={(e) => setFormData({ ...formData, actual_check_out_at: e.target.value })}
              />
            </div>

            {/* Release Preview */}
            {releaseCalculation.nightsToRelease > 0 && (
              <div className="p-4 rounded-lg border border-warning/50 bg-warning/5 space-y-3">
                <h4 className="font-medium flex items-center gap-2 text-warning">
                  <Home className="h-4 w-4" />
                  Đêm sẽ giải phóng: {releaseCalculation.nightsToRelease}
                </h4>
                <div className="text-sm space-y-1">
                  <div>OTA booking: {releaseCalculation.otaNights} đêm</div>
                  <div>Covered hiện tại: {releaseCalculation.originalCoveredNights} đêm</div>
                  <div>Covered sau cut: {releaseCalculation.newCoveredNights} đêm</div>
                </div>
                {releaseCalculation.segmentsToUpdate.map((update, idx) => (
                  <div key={idx} className="text-xs p-2 rounded bg-muted/50">
                    <strong>{update.segment.partner?.partner_name || 'Host'}:</strong>
                    <br />
                    {formatDate(update.segment.date_from)} → {formatDate(update.segment.date_to)}
                    {" → "}
                    <span className="text-primary font-medium">{formatDate(update.newDateTo)}</span>
                    <br />
                    Giải phóng: {update.nightsReleased} đêm
                  </div>
                ))}
              </div>
            )}

            {/* Important Notice */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-info/100/10 border border-info/30">
              <Banknote className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-info">Không ảnh hưởng tiền OTA</p>
                <p className="text-xs text-muted-foreground">
                  Booking OTA vẫn giữ nguyên số đêm và số tiền. Chỉ ảnh hưởng công nợ host (host payables sẽ tự động điều chỉnh).
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Huỷ
              </Button>
              <Button
                onClick={handleContinue}
                disabled={hasLockedSegment || releaseCalculation.nightsToRelease === 0}
              >
                Tiếp tục
              </Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Confirmation Summary */}
            <div className="p-4 rounded-lg border border-primary/50 bg-primary/5 space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                Xác nhận Early Check-out
              </h4>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span>Ngày check-out:</span>
                  <strong>{formatDate(formData.actual_check_out_at)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Đêm giải phóng:</span>
                  <strong className="text-warning">{releaseCalculation.nightsToRelease} đêm</strong>
                </div>
                <div className="flex justify-between">
                  <span>Segments cập nhật:</span>
                  <strong>{releaseCalculation.segmentsToUpdate.length}</strong>
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">Không thể hoàn tác tự động</p>
                <p className="text-xs text-muted-foreground">
                  Sau khi xác nhận, segment sẽ được cắt và host payables sẽ tự động cập nhật.
                  Cần correction thủ công nếu nhập sai.
                </p>
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Ghi chú (tuỳ chọn)</Label>
              <Textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="Lý do early check-out..."
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("select")}>
                Quay lại
              </Button>
              <Button type="submit" variant="destructive" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xác nhận Early Check-out
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default EarlyCheckoutDialog;
