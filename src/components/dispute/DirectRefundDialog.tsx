import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { AlertCircle, Loader2, Undo2 } from "lucide-react";
import { useCreateCase, type RefundChannel } from "@/hooks/useCaseCenter";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    bookingId: string;
    guestName?: string;
    totalAmount?: number;
    otaSource?: string;
    bookingCode?: string;
    propertyId?: string;
    propertyName?: string;
    paymentType?: string;
}

/**
 * DirectRefundDialog — creates a REFUND tracking case from Booking Detail.
 * Mobile: renders as native full-screen page.
 */
export function DirectRefundDialog({
    open,
    onOpenChange,
    bookingId,
    guestName,
    totalAmount,
    otaSource,
    bookingCode,
    propertyId,
    propertyName,
    paymentType,
}: Props) {
    const [amount, setAmount] = useState("");
    const [refundChannel, setRefundChannel] = useState<RefundChannel>("DIRECT_TO_GUEST");
    const [note, setNote] = useState("");

    const createCaseMutation = useCreateCase();
    const navigate = useNavigate();

    useEffect(() => {
        if (!open) {
            setAmount("");
            setRefundChannel("DIRECT_TO_GUEST");
            setNote("");
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!amount || parseFloat(amount) <= 0) return;

        await createCaseMutation.mutateAsync({
            unified_booking_id: bookingId,
            dispute_type: refundChannel === "VIA_OTA" ? "OTA_REFUND_REQUEST" : "GUEST_REFUND",
            case_type: "REFUND",
            amount_requested: parseFloat(amount),
            refund_channel: refundChannel,
            note: note || undefined,
            guest_name: guestName,
            ota_source: otaSource,
            booking_code: bookingCode,
            property_id: propertyId,
            property_name: propertyName,
            payment_type: paymentType,
        });

        if (refundChannel === "DIRECT_TO_GUEST") {
            toast.success("Đã tạo Case theo dõi hoàn tiền", {
                description: "Vào Đề xuất thanh toán để tạo phiếu chi (nếu cần).",
                action: {
                    label: "Tạo đề xuất",
                    onClick: () => navigate("/payment-requests"),
                },
                duration: 8000,
            });
        } else {
            toast.success("Đã tạo Case theo dõi yêu cầu OTA hoàn", {
                description: "OTA duyệt sẽ hủy đặt phòng. Theo dõi trong Case Center.",
            });
        }

        onOpenChange(false);
    };

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
            maximumFractionDigits: 0,
        }).format(value);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent mobileFullScreen size="md">
                {/* Mobile full-screen header */}
                <DialogHeader className="max-sm:px-4 max-sm:py-3 max-sm:border-b max-sm:border-border shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Undo2 className="h-5 w-5 text-primary" />
                        Yêu cầu hoàn tiền
                    </DialogTitle>
                </DialogHeader>

                {/* Scrollable form content */}
                <div className="max-sm:flex-1 max-sm:overflow-y-auto max-sm:overscroll-contain">
                    <div className="space-y-3 max-sm:px-4 max-sm:py-3 sm:py-2">
                        {/* Booking info — compact */}
                        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Booking</span>
                                <span className="font-mono font-medium text-xs">{bookingId.slice(0, 16)}...</span>
                            </div>
                            {guestName && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Khách</span>
                                    <span className="font-medium">{guestName}</span>
                                </div>
                            )}
                            {totalAmount && totalAmount > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tổng booking</span>
                                    <span className="font-semibold">{formatCurrency(totalAmount)}</span>
                                </div>
                            )}
                        </div>

                        {/* Tracking-only notice — compact */}
                        <div className="bg-primary/10 rounded-lg px-3 py-2 text-xs text-primary flex items-start gap-2">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>Case <strong>chỉ theo dõi tiến độ</strong>. Tiền xử lý riêng.</span>
                        </div>

                        {/* Refund channel */}
                        <div className="space-y-1.5">
                            <Label className="text-sm">Kênh hoàn tiền *</Label>
                            <Select value={refundChannel} onValueChange={(v) => setRefundChannel(v as RefundChannel)}>
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="DIRECT_TO_GUEST">Hoàn trực tiếp cho khách</SelectItem>
                                    <SelectItem value="VIA_OTA">Nhờ OTA hoàn tiền</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Amount */}
                        <div className="space-y-1.5">
                            <Label className="text-sm">Số tiền hoàn (ước tính) *</Label>
                            <CurrencyInput
                                value={amount}
                                onChange={setAmount}
                                placeholder="Nhập số tiền cần hoàn..."
                            />
                            {totalAmount && totalAmount > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    Tối đa: {formatCurrency(totalAmount)}
                                </p>
                            )}
                        </div>

                        {/* Note */}
                        <div className="space-y-1.5">
                            <Label className="text-sm">Lý do hoàn tiền</Label>
                            <Textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Khách phàn nàn dịch vụ, OTA yêu cầu hoàn..."
                                rows={2}
                                className="resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer — fixed at bottom on mobile */}
                <div className="shrink-0 max-sm:px-4 max-sm:py-3 max-sm:border-t max-sm:border-border sm:flex sm:justify-end sm:gap-2">
                    <Button
                        onClick={handleSubmit}
                        disabled={!amount || parseFloat(amount) <= 0 || createCaseMutation.isPending}
                        className="w-full sm:w-auto"
                    >
                        {createCaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Tạo case theo dõi
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto mt-2 sm:mt-0">
                        Hủy
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
