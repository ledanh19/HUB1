import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase, safeMutation } from "@/integrations/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";

interface CancelManualBookingDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    booking: {
        unified_booking_id: string;
        guest_name: string;
        check_in_date: string;
        check_out_date: string;
        total_amount_net: number;
        total_amount_gross: number;
        booking_status: string;
        source: string;
        nights: number;
        payment_type: string;
        note?: string | null;
    };
}

export function CancelManualBookingDialog({
    open,
    onOpenChange,
    booking,
}: CancelManualBookingDialogProps) {
    const queryClient = useQueryClient();
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);

    const handleCancel = async () => {
        if (!reason.trim() || reason.trim().length < 5) {
            toast.error("Vui lòng nhập lý do huỷ (tối thiểu 5 ký tự)");
            return;
        }

        setSaving(true);
        try {
            // Before snapshot
            const beforeData = {
                booking_status: booking.booking_status,
                total_amount_net: booking.total_amount_net,
                total_amount_gross: booking.total_amount_gross,
                guest_name: booking.guest_name,
                check_in_date: booking.check_in_date,
                check_out_date: booking.check_out_date,
                nights: booking.nights,
                source: booking.source,
                payment_type: booking.payment_type,
            };

            // Step 1: Update manual_bookings status only (preserve amounts for audit trail)
            // Server-side guard: only update if still CONFIRMED (race condition protection)
            const { error: bookingError, data: updatedRows } = await safeMutation(() =>
                supabase
                    .from("manual_bookings")
                    .update({
                        booking_status: "CANCELLED",
                    })
                    .eq("unified_booking_id", booking.unified_booking_id)
                    .eq("booking_status", "CONFIRMED")
                    .select("unified_booking_id")
            );

            if (bookingError) throw bookingError;

            // 0-row check: booking status changed concurrently
            if (!updatedRows || updatedRows.length === 0) {
                toast.error("Booking đã thay đổi trạng thái. Vui lòng refresh.");
                queryClient.invalidateQueries({ queryKey: ["booking_detail", booking.unified_booking_id] });
                setSaving(false);
                return;
            }

            // Step 2: Update stays status (best-effort)
            let staysUpdateFailed = false;
            try {
                await safeMutation(() =>
                    supabase
                        .from("stays")
                        .update({ stay_status: "CANCELLED" as any })
                        .eq("unified_booking_id", booking.unified_booking_id)
                );
            } catch {
                staysUpdateFailed = true;
                console.error("[CancelBooking] stays update failed, continuing...");
            }

            // Stays cascade verification: warn if update failed
            if (staysUpdateFailed) {
                toast.warning("Đã huỷ booking nhưng cập nhật stay thất bại. Vui lòng kiểm tra Stays.");
            }

            // Step 3: Single audit log (entity = actual table mutated)
            await createAuditLog({
                action: AuditActions.BOOKING_CANCELLED,
                entity: "manual_bookings",
                entityId: booking.unified_booking_id,
                beforeData,
                afterData: {
                    booking_status: "CANCELLED",
                    total_amount_net: booking.total_amount_net,
                    total_amount_gross: booking.total_amount_gross,
                    cancel_reason: reason.trim(),
                    cancelled_at: new Date().toISOString(),
                    stays_update_failed: staysUpdateFailed,
                    timeline: true,
                },
            });

            toast.success("Đã huỷ đặt phòng");

            // Invalidate all related queries
            queryClient.invalidateQueries({ queryKey: ["booking_detail", booking.unified_booking_id] });
            queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
            queryClient.invalidateQueries({ queryKey: ["unified_bookings_paginated"] });
            queryClient.invalidateQueries({ queryKey: ["stay_record", booking.unified_booking_id] });
            queryClient.invalidateQueries({ queryKey: ["stays"] });
            queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", booking.unified_booking_id] });
            queryClient.invalidateQueries({ queryKey: ["booking_type_counts"] });

            onOpenChange(false);
            setReason("");
        } catch (err: any) {
            toast.error("Lỗi huỷ booking: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return "—";
        return new Date(dateStr + "T00:00:00").toLocaleDateString("vi-VN");
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Huỷ đặt phòng
                    </DialogTitle>
                    <DialogDescription>
                        Hành động này không thể hoàn tác. Booking sẽ không còn tính vào doanh thu và KPI.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Booking Info Summary */}
                    <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Khách</span>
                            <span className="font-medium">{booking.guest_name}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Ngày</span>
                            <span>{formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Số tiền</span>
                            <span className="font-medium">
                                {formatCurrency(booking.total_amount_net)}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Trạng thái</span>
                            <span className="font-medium text-destructive">Loại khỏi KPI/Revenue</span>
                        </div>
                    </div>

                    {/* Cancel Reason */}
                    <div className="space-y-2">
                        <Label>Lý do huỷ *</Label>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Nhập lý do huỷ đặt phòng (tối thiểu 5 ký tự)..."
                            rows={3}
                        />
                        {reason.trim().length > 0 && reason.trim().length < 5 && (
                            <p className="text-xs text-destructive">Tối thiểu 5 ký tự</p>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Đóng
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleCancel}
                        disabled={saving || reason.trim().length < 5}
                    >
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Xác nhận huỷ
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
