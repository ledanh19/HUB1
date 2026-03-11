/**
 * CORRECTION DIALOG (C5)
 * ======================
 * 
 * For correcting check-in / check-out mistakes.
 * - NOT undo - explicit "Correction" action
 * - Requires reason (audit)
 * - Blocked if settlement locked
 */

import { useState, useCallback, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle, ShieldAlert, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/hooks/useAuth";

type CorrectionType = "UNDO_CHECK_IN" | "UNDO_CHECK_OUT";

interface CorrectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  correctionType: CorrectionType;
  stay: {
    id: string;
    unified_booking_id: string;
    stay_status: string;
    actual_check_in_at: string | null;
    actual_check_out_at: string | null;
  };
  booking: {
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
  };
  isSettlementLocked?: boolean;
}

export function CorrectionDialog({
  open,
  onOpenChange,
  correctionType,
  stay,
  booking,
  isSettlementLocked = false,
}: CorrectionDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");

  const isUndoCheckIn = correctionType === "UNDO_CHECK_IN";
  const title = isUndoCheckIn ? "Huỷ Nhận phòng (Correction)" : "Huỷ Trả phòng (Correction)";
  const description = isUndoCheckIn
    ? "Huỷ bỏ trạng thái check-in do nhập nhầm. Yêu cầu ghi lý do."
    : "Huỷ bỏ trạng thái trả phòng do nhập nhầm. Yêu cầu ghi lý do.";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason.trim()) {
      toast.error("Vui lòng nhập lý do correction");
      return;
    }

    if (reason.trim().length < 10) {
      toast.error("Lý do phải có ít nhất 10 ký tự");
      return;
    }

    if (isSettlementLocked) {
      toast.error("Không thể correction - Segment đã được settlement. Liên hệ Admin.");
      return;
    }

    if (saving) return;

    // === OPTIMISTIC UPDATE: Apply immediately ===
    const newStatus = isUndoCheckIn ? "WAIT_ROOM" : "CHECKED_IN";
    applyOptimisticUpdate({
      stay_status: newStatus,
      actual_check_in_at: isUndoCheckIn ? null : stay.actual_check_in_at,
      actual_check_out_at: isUndoCheckIn ? stay.actual_check_out_at : null,
    });

    onOpenChange(false);
    toast.loading("Đang ghi nhận correction...", { id: "correction-toast" });

    setSaving(true);
    try {
      const beforeData = {
        stay_status: stay.stay_status,
        actual_check_in_at: stay.actual_check_in_at,
        actual_check_out_at: stay.actual_check_out_at,
      };

      if (isUndoCheckIn) {
        const { error: stayError } = await supabase
          .from("stays")
          .update({
            stay_status: "WAIT_ROOM",
            actual_check_in_at: null,
          })
          .eq("id", stay.id);

        if (stayError) throw stayError;

        supabase
          .from("manual_bookings")
          .update({ booking_status: "CONFIRMED" })
          .eq("unified_booking_id", stay.unified_booking_id)
          .then(() => { });

      } else {
        const { error: stayError } = await supabase
          .from("stays")
          .update({
            stay_status: "CHECKED_IN",
            actual_check_out_at: null,
          })
          .eq("id", stay.id);

        if (stayError) throw stayError;

        supabase
          .from("manual_bookings")
          .update({ booking_status: "CHECKED_IN" })
          .eq("unified_booking_id", stay.unified_booking_id)
          .then(() => { });
      }

      // Audit log (fire-and-forget)
      createAuditLog({
        action: isUndoCheckIn ? "CORRECTION_UNDO_CHECK_IN" : "CORRECTION_UNDO_CHECK_OUT",
        entity: "booking",
        entityId: stay.unified_booking_id,
        beforeData,
        afterData: {
          stay_status: isUndoCheckIn ? "WAIT_ROOM" : "CHECKED_IN",
          actual_check_in_at: isUndoCheckIn ? null : stay.actual_check_in_at,
          actual_check_out_at: isUndoCheckIn ? stay.actual_check_out_at : null,
          correction_reason: reason.trim(),
          corrected_by: user?.id,
          corrected_at: new Date().toISOString(),
        },
      }).catch(console.error);

      toast.success(`${title} thành công. Lý do đã được ghi nhận.`, { id: "correction-toast" });

      // Background sync
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", stay.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }, 1500);

      setReason("");
    } catch (err: any) {
      // === ROLLBACK on error ===
      applyOptimisticUpdate({
        stay_status: stay.stay_status,
        actual_check_in_at: stay.actual_check_in_at,
        actual_check_out_at: stay.actual_check_out_at,
      });
      toast.error("Lỗi correction: " + err.message, { id: "correction-toast" });
      queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formRef = useRef<HTMLFormElement>(null);
  const submitDisabled = saving || !reason.trim() || reason.trim().length < 10 || isSettlementLocked;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="sm:max-w-md max-sm:overflow-hidden">
        <MobileDialogHeader
          title={title}
          onClose={() => onOpenChange(false)}
          onSubmit={() => formRef.current?.requestSubmit()}
          submitLabel="Xác nhận"
          submitDisabled={submitDisabled}
          isSubmitting={saving}
        />
        <DialogHeader className="max-sm:hidden">
          <DialogTitle className="flex items-center gap-2 text-warning">
            <ShieldAlert className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 max-sm:flex-1 max-sm:overflow-y-auto max-sm:p-4">
          {/* Settlement Lock Warning */}
          {isSettlementLocked && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <Lock className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Không thể correction</p>
                <p className="text-xs text-muted-foreground">
                  Segment đã được settlement/locked. Liên hệ Admin để xử lý.
                </p>
              </div>
            </div>
          )}

          {/* Booking Info */}
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Khách:</span>
              <span className="font-medium">{booking.guest_name}</span>
              <span className="text-muted-foreground">Booking:</span>
              <span>{stay.unified_booking_id}</span>
              <span className="text-muted-foreground">Trạng thái:</span>
              <span>
                <StatusBadge variant={stay.stay_status === "CHECKED_IN" ? "success" : stay.stay_status === "CHECKED_OUT" ? "info" : "default"} size="sm">
                  {stay.stay_status}
                </StatusBadge>
              </span>
              {stay.actual_check_in_at && (
                <>
                  <span className="text-muted-foreground">Nhận phòng:</span>
                  <span>{formatDate(stay.actual_check_in_at)}</span>
                </>
              )}
              {stay.actual_check_out_at && (
                <>
                  <span className="text-muted-foreground">Trả phòng:</span>
                  <span>{formatDate(stay.actual_check_out_at)}</span>
                </>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Thao tác này sẽ được ghi audit log</p>
              <p className="text-xs text-muted-foreground">
                Lý do correction sẽ được lưu cùng thông tin người thực hiện và thời gian.
              </p>
            </div>
          </div>

          {/* Reason - REQUIRED */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Lý do correction <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do correction (tối thiểu 10 ký tự)..."
              rows={3}
              disabled={isSettlementLocked}
              required
            />
            <p className="text-xs text-muted-foreground">
              Ví dụ: "Nhập nhầm phòng, khách chưa đến", "Sai ngày trả phòng"
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 max-sm:hidden">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={submitDisabled}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận Correction
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CorrectionDialog;
