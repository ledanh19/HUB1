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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmBookingAmount } from "@/hooks/useBookingAmountOverrides";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface ConfirmAmountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unifiedBookingId: string;
  guestName?: string;
  suggestedAmount?: number | null;
  bookingType?: string | null;
  suggestedCommissionPercent?: number | null;
}

export function ConfirmAmountDialog({
  open,
  onOpenChange,
  unifiedBookingId,
  guestName,
  suggestedAmount,
  bookingType,
  suggestedCommissionPercent,
}: ConfirmAmountDialogProps) {
  const [amount, setAmount] = useState(suggestedAmount?.toString() || "");
  const [commissionPercent, setCommissionPercent] = useState(suggestedCommissionPercent?.toString() || "");
  const [note, setNote] = useState("");
  const confirmMutation = useConfirmBookingAmount();
  
  const isImported = bookingType === "IMPORTED";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return;
    }

    // Parse commission percent for imported bookings
    let numCommissionPercent: number | null = null;
    if (isImported && commissionPercent) {
      numCommissionPercent = parseFloat(commissionPercent);
      if (isNaN(numCommissionPercent) || numCommissionPercent < 0 || numCommissionPercent > 100) {
        numCommissionPercent = null;
      }
    }

    confirmMutation.mutate({
      unified_booking_id: unifiedBookingId,
      amount: numAmount,
      commission_percent: numCommissionPercent,
      note: note || undefined,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setAmount("");
        setCommissionPercent("");
        setNote("");
      },
    });
  };

  const formatCurrency = (value: string) => {
    const num = parseFloat(value.replace(/,/g, ""));
    if (isNaN(num)) return value;
    return new Intl.NumberFormat("vi-VN").format(num);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Xác nhận Giá phải thu
          </DialogTitle>
          <DialogDescription>
            Nhập số tiền thực tế cần thu cho booking này.
            {guestName && (
              <span className="block mt-1 font-medium text-foreground">
                Khách: {guestName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền (VND) *</Label>
            <Input
              id="amount"
              type="text"
              inputMode="numeric"
              placeholder="Nhập số tiền"
              value={amount}
              onChange={(e) => {
                // Only allow numbers
                const val = e.target.value.replace(/[^0-9]/g, "");
                setAmount(val);
              }}
              className="text-right text-lg font-medium"
              required
            />
            {amount && (
              <p className="text-sm text-muted-foreground text-right">
                {formatCurrency(amount)} VND
              </p>
            )}
          </div>

          {/* Commission percent field - only for IMPORTED bookings */}
          {isImported && (
            <div className="space-y-2">
              <Label htmlFor="commissionPercent">% Hoa hồng</Label>
              <div className="relative">
                <Input
                  id="commissionPercent"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ví dụ: 15"
                  value={commissionPercent}
                  onChange={(e) => {
                    // Only allow numbers and decimal point
                    const val = e.target.value.replace(/[^0-9.]/g, "");
                    setCommissionPercent(val);
                  }}
                  className="text-right pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
              {commissionPercent && parseFloat(commissionPercent) > 0 && amount && parseFloat(amount) > 0 && (
                <p className="text-sm text-muted-foreground text-right">
                  Phí hoa hồng: {new Intl.NumberFormat("vi-VN").format(
                    Math.round(parseFloat(amount) * parseFloat(commissionPercent) / 100)
                  )} VND
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              placeholder="Ghi chú (tuỳ chọn)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          {/* Warning for 0 amount */}
          {amount === "0" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-warning-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                Xác nhận giá = 0 sẽ không tạo nghĩa vụ thu tiền cho booking này.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={!amount || confirmMutation.isPending}
            >
              {confirmMutation.isPending ? "Đang xác nhận..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
