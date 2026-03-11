import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  MobileDialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Loader2, AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { useCreateRefund, useCanRefundServer, HotelCollect } from "@/hooks/useCollections";
import { useRefundThreshold, useCreateRefundApprovalRequest } from "@/hooks/useRefundApproval";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HOTEL_COLLECT_OPTIONS } from "@/constants/paymentMethods";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { supabase } from "@/integrations/supabase";

export interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: HotelCollect;
  maxRefundAmount: number;
  onSuccess?: () => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function RefundDialog({
  open,
  onOpenChange,
  collection,
  maxRefundAmount,
  onSuccess,
}: RefundDialogProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [reasonNote, setReasonNote] = useState("");

  const createRefund = useCreateRefund();
  const createApprovalRequest = useCreateRefundApprovalRequest();
  const { data: threshold = 1000000 } = useRefundThreshold();

  // Check if booking is OTA_COLLECT (double-impact guard)
  const { data: bookingPaymentType } = useQuery({
    queryKey: ["booking-payment-type", collection.unified_booking_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings_mirror")
        .select("payment_type")
        .eq("unified_booking_id", collection.unified_booking_id)
        .limit(1)
        .maybeSingle();
      return data?.payment_type || null;
    },
    enabled: open,
    staleTime: 60000,
  });

  const isOtaCollect = bookingPaymentType === "OTA_COLLECT";

  // PHASE 3.1: Server-side validation (checks period lock, max amount, etc.)
  const { data: canRefundCheck, isLoading: checkingCanRefund } = useCanRefundServer(
    open ? collection.id : undefined
  );

  const refundAmount = parseFloat(amount) || 0;
  // Use server-side max amount if available, otherwise fallback to prop
  const serverMaxAmount = canRefundCheck?.max_refund_amount;
  const effectiveMaxAmount = serverMaxAmount !== undefined ? serverMaxAmount : maxRefundAmount;
  const isOverLimit = refundAmount > effectiveMaxAmount;
  const requiresApproval = refundAmount > threshold;

  // Server-side validation result
  const canRefund = canRefundCheck?.can_refund ?? true;
  const canRefundReason = canRefundCheck?.reason;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isNaN(refundAmount) || refundAmount <= 0) {
      return;
    }

    if (refundAmount > maxRefundAmount) {
      return;
    }

    if (!reasonNote.trim()) {
      return;
    }

    if (requiresApproval) {
      // Route to approval queue
      await createApprovalRequest.mutateAsync({
        originalCollectionId: collection.id,
        unifiedBookingId: collection.unified_booking_id,
        amount: refundAmount,
        paymentMethod,
        reasonNote: reasonNote.trim(),
      });
    } else {
      // Direct refund
      await createRefund.mutateAsync({
        originalCollectionId: collection.id,
        unifiedBookingId: collection.unified_booking_id,
        amount: refundAmount,
        paymentMethod,
        reasonNote: reasonNote.trim(),
      });
    }

    // Reset form
    setAmount("");
    setPaymentMethod("CASH");
    setReasonNote("");
    onOpenChange(false);
    onSuccess?.();
  };

  const isPending = createRefund.isPending || createApprovalRequest.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="sm:max-w-[425px] max-sm:overflow-hidden">
        <MobileDialogHeader
          title="Hoàn tiền"
          onClose={() => onOpenChange(false)}
          onSubmit={() => {
            const form = document.getElementById('refund-form') as HTMLFormElement;
            form?.requestSubmit();
          }}
          submitLabel={requiresApproval ? "Gửi yêu cầu" : "Xác nhận"}
          submitDisabled={isPending || !amount || isOverLimit || !reasonNote.trim() || !canRefund || checkingCanRefund || isOtaCollect}
          isSubmitting={isPending}
        />
        <DialogHeader className="max-sm:hidden">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Hoàn tiền
          </DialogTitle>
          <DialogDescription>
            Hoàn lại tiền đã thu cho khách. Thao tác này sẽ tạo cashflow ra và không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>

        <div className="max-sm:flex-1 max-sm:overflow-y-auto max-sm:px-4 max-sm:py-4">
        <form id="refund-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Mobile 2-col data layout */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm sm:hidden">
            <span className="text-muted-foreground">Collection gốc:</span>
            <span className="font-medium">{formatCurrency(Number(collection.amount_collected))}</span>
            <span className="text-muted-foreground">Có thể hoàn:</span>
            <span className="font-medium text-success">{formatCurrency(effectiveMaxAmount)}</span>
            <span className="text-muted-foreground">Ngưỡng duyệt:</span>
            <span className="text-muted-foreground">{formatCurrency(threshold)}</span>
          </div>

          {/* Desktop alert summary */}
          <Alert className="max-sm:hidden">
            <AlertDescription className="space-y-1">
              <div className="flex justify-between">
                <span>Collection gốc:</span>
                <span className="font-medium">{formatCurrency(Number(collection.amount_collected))}</span>
              </div>
              <div className="flex justify-between">
                <span>Số tiền có thể hoàn:</span>
                <span className="font-medium text-success">{formatCurrency(effectiveMaxAmount)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Ngưỡng cần duyệt:</span>
                <span>{formatCurrency(threshold)}</span>
              </div>
            </AlertDescription>
          </Alert>

          {/* PHASE 3.1: Show server-side validation errors */}
          {checkingCanRefund && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>Đang kiểm tra...</AlertDescription>
            </Alert>
          )}

          {isOtaCollect && (
            <Alert variant="destructive" className="border-destructive/50">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                <strong>Booking OTA_COLLECT:</strong> Hoàn tiền cho booking OTA thu phải xử lý qua module{" "}
                <strong>OTA Payout Reconciliation</strong> (điều chỉnh payout) để tránh tính trùng tài chính.
              </AlertDescription>
            </Alert>
          )}

          {!checkingCanRefund && !canRefund && canRefundReason && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Không thể hoàn tiền:</strong> {canRefundReason}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền hoàn *</Label>
            <CurrencyInput
              id="amount"
              value={amount}
              onChange={setAmount}
              placeholder="Nhập số tiền hoàn"
              disabled={!canRefund}
            />
            {isOverLimit && (
              <p className="text-sm text-destructive">
                Số tiền hoàn không được vượt quá {formatCurrency(effectiveMaxAmount)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Phương thức hoàn tiền</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOTEL_COLLECT_OPTIONS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    <div className="flex items-center gap-2">
                      <PaymentMethodIcon code={method.value} className="h-4 w-4 text-muted-foreground" />
                      {method.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Lý do hoàn tiền *</Label>
            <Textarea
              id="reason"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Nhập lý do hoàn tiền (bắt buộc)"
              required
              rows={3}
            />
          </div>

          {requiresApproval && refundAmount > 0 && (
            <Alert className="bg-warning/10 border-warning/30">
              <Clock className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                Số tiền hoàn vượt ngưỡng {formatCurrency(threshold)}. Yêu cầu sẽ được gửi đến Admin để phê duyệt.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="max-sm:hidden">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              variant={requiresApproval ? "default" : "destructive"}
              disabled={
                isPending ||
                !amount ||
                isOverLimit ||
                !reasonNote.trim() ||
                !canRefund ||
                checkingCanRefund ||
                isOtaCollect
              }
            >
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {requiresApproval ? (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  Gửi yêu cầu duyệt
                </>
              ) : (
                "Xác nhận hoàn tiền"
              )}
            </Button>
          </DialogFooter>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
