import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase, safeMutation } from "@/integrations/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";

interface EditManualBookingDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    booking: {
        unified_booking_id: string;
        guest_name: string;
        guest_phone: string | null;
        guest_email: string | null;
        source: string;
        check_in_date: string;
        check_out_date: string;
        total_amount_net: number;
        total_amount_gross: number;
        nights: number;
        note?: string | null;
        booking_status: string;
        payment_type: string;
    };
}

const sources = [
    { value: "Facebook", label: "Facebook" },
    { value: "TikTok", label: "TikTok" },
    { value: "Zalo", label: "Zalo" },
    { value: "Walk-in", label: "Walk-in" },
    { value: "Referral", label: "Giới thiệu" },
    { value: "Corporate", label: "Doanh nghiệp" },
    { value: "Other", label: "Khác" },
];

export function EditManualBookingDialog({
    open,
    onOpenChange,
    booking,
}: EditManualBookingDialogProps) {
    const queryClient = useQueryClient();
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        guest_name: "",
        guest_phone: "",
        guest_email: "",
        source: "Facebook",
        check_in_date: "",
        check_out_date: "",
        total_amount_net: "",
        note: "",
    });

    // Prefill form when dialog opens or booking changes
    useEffect(() => {
        if (open && booking) {
            setFormData({
                guest_name: booking.guest_name || "",
                guest_phone: booking.guest_phone || "",
                guest_email: booking.guest_email || "",
                source: booking.source || "Facebook",
                check_in_date: booking.check_in_date || "",
                check_out_date: booking.check_out_date || "",
                total_amount_net: String(booking.total_amount_net || 0),
                note: booking.note || "",
            });
        }
    }, [open, booking]);

    const calculateNights = () => {
        if (!formData.check_in_date || !formData.check_out_date) return 0;
        // T00:00:00 forces local timezone parse (avoids UTC ±1 day drift)
        const checkIn = new Date(formData.check_in_date + "T00:00:00");
        const checkOut = new Date(formData.check_out_date + "T00:00:00");
        const diffTime = checkOut.getTime() - checkIn.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const nights = calculateNights();
        if (nights <= 0) {
            toast.error("Ngày trả phòng phải sau ngày nhận phòng");
            return;
        }

        if (!formData.guest_name.trim()) {
            toast.error("Vui lòng nhập tên khách");
            return;
        }

        const totalAmountNet = parseFloat(formData.total_amount_net) || 0;
        if (totalAmountNet <= 0) {
            toast.error("Vui lòng nhập số tiền phải thu > 0");
            return;
        }

        setSaving(true);
        try {
            // Before snapshot
            const beforeData = {
                guest_name: booking.guest_name,
                guest_phone: booking.guest_phone,
                guest_email: booking.guest_email,
                source: booking.source,
                check_in_date: booking.check_in_date,
                check_out_date: booking.check_out_date,
                nights: booking.nights,
                total_amount_net: booking.total_amount_net,
                total_amount_gross: booking.total_amount_gross,
                note: booking.note,
            };

            // After data
            const afterData = {
                guest_name: formData.guest_name.trim(),
                guest_phone: formData.guest_phone || null,
                guest_email: formData.guest_email || null,
                source: formData.source,
                check_in_date: formData.check_in_date,
                check_out_date: formData.check_out_date,
                nights,
                total_amount_net: totalAmountNet,
                total_amount_gross: totalAmountNet, // derived: gross = net for manual
                note: formData.note || null,
            };

            // Update manual_bookings (server-side guard: only if still CONFIRMED)
            const { error: updateError, data: updatedRows } = await safeMutation(() =>
                supabase
                    .from("manual_bookings")
                    .update(afterData)
                    .eq("unified_booking_id", booking.unified_booking_id)
                    .eq("booking_status", "CONFIRMED")
                    .select("unified_booking_id")
            );

            if (updateError) throw updateError;

            // 0-row check: booking status changed concurrently
            if (!updatedRows || updatedRows.length === 0) {
                toast.error("Booking đã thay đổi trạng thái. Vui lòng refresh.");
                queryClient.invalidateQueries({ queryKey: ["booking_detail", booking.unified_booking_id] });
                setSaving(false);
                return;
            }

            // Single audit log (entity = actual table mutated)
            await createAuditLog({
                action: AuditActions.BOOKING_UPDATED,
                entity: "manual_bookings",
                entityId: booking.unified_booking_id,
                beforeData,
                afterData: { ...afterData, timeline: true },
            });

            toast.success("Đã cập nhật thông tin booking");

            // Invalidate all related queries
            queryClient.invalidateQueries({ queryKey: ["booking_detail", booking.unified_booking_id] });
            queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
            queryClient.invalidateQueries({ queryKey: ["unified_bookings_paginated"] });
            queryClient.invalidateQueries({ queryKey: ["stay_record", booking.unified_booking_id] });
            queryClient.invalidateQueries({ queryKey: ["stays"] });
            queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", booking.unified_booking_id] });
            queryClient.invalidateQueries({ queryKey: ["booking_type_counts"] });

            onOpenChange(false);
        } catch (err: any) {
            toast.error("Lỗi cập nhật booking: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const nights = calculateNights();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Sửa thông tin Booking</DialogTitle>
                    <DialogDescription>
                        Cập nhật thông tin đặt phòng manual. Mã booking và hình thức thanh toán không thay đổi.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Locked fields info */}
                    <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                        <span className="font-medium">Mã booking:</span> {booking.unified_booking_id} •{" "}
                        <span className="font-medium">Thanh toán:</span> THU TẠI KS (Hotel Collect)
                    </div>

                    {/* Guest Info */}
                    <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                        <h3 className="font-medium">Thông tin khách hàng</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Họ tên khách *</Label>
                                <Input
                                    value={formData.guest_name}
                                    onChange={(e) => setFormData({ ...formData, guest_name: e.target.value })}
                                    placeholder="Nguyễn Văn A"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Số điện thoại</Label>
                                <Input
                                    value={formData.guest_phone}
                                    onChange={(e) => setFormData({ ...formData, guest_phone: e.target.value })}
                                    placeholder="0901234567"
                                />
                            </div>
                            <div className="space-y-2 col-span-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={formData.guest_email}
                                    onChange={(e) => setFormData({ ...formData, guest_email: e.target.value })}
                                    placeholder="email@example.com"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Booking Info */}
                    <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                        <h3 className="font-medium">Thông tin lưu trú</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nhận phòng *</Label>
                                <Input
                                    type="date"
                                    value={formData.check_in_date}
                                    onChange={(e) => setFormData({ ...formData, check_in_date: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Trả phòng *</Label>
                                <Input
                                    type="date"
                                    value={formData.check_out_date}
                                    onChange={(e) => setFormData({ ...formData, check_out_date: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        {nights > 0 && (
                            <p className="text-sm text-muted-foreground">
                                Số đêm: <span className="font-medium text-foreground">{nights} đêm</span>
                                {nights !== booking.nights && (
                                    <span className="text-warning ml-2">(trước: {booking.nights} đêm)</span>
                                )}
                            </p>
                        )}
                    </div>

                    {/* Source */}
                    <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                        <h3 className="font-medium">Nguồn booking</h3>
                        <Select
                            value={formData.source}
                            onValueChange={(v) => setFormData({ ...formData, source: v })}
                        >
                            <SelectTrigger className="w-[200px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {sources.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                        {s.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Finance */}
                    <div className="space-y-4 p-4 rounded-lg bg-muted/30">
                        <h3 className="font-medium">Tài chính</h3>
                        <div className="space-y-2">
                            <Label>Số tiền phải thu (VND) *</Label>
                            <CurrencyInput
                                value={formData.total_amount_net}
                                onChange={(v) => setFormData({ ...formData, total_amount_net: v })}
                                placeholder="2000000"
                            />
                        </div>
                    </div>

                    {/* Note */}
                    <div className="space-y-2">
                        <Label>Ghi chú</Label>
                        <Textarea
                            value={formData.note}
                            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                            placeholder="Ghi chú thêm..."
                            rows={2}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Đóng
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Lưu thay đổi
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
