import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateHostPayment } from "@/hooks/useHostPayments";
import { Loader2, Banknote, Building2 } from "lucide-react";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payableId: string;
  partnerId: string;
  unifiedBookingId: string;
  remainingAmount: number;
  partnerName?: string;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  payableId,
  partnerId,
  unifiedBookingId,
  remainingAmount,
  partnerName,
}: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState(remainingAmount.toString());
  const [paymentMethod, setPaymentMethod] = useState<"BANK_TRANSFER" | "CASH" | "OTHER">("BANK_TRANSFER");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");

  const createPayment = useCreateHostPayment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const paymentAmount = parseFloat(amount);
    if (!paymentAmount || paymentAmount <= 0) return;

    if (paymentAmount > remainingAmount) {
      return;
    }

    await createPayment.mutateAsync({
      payable_id: payableId,
      partner_id: partnerId,
      unified_booking_id: unifiedBookingId,
      amount: paymentAmount,
      payment_method: paymentMethod,
      bank_name: paymentMethod === "BANK_TRANSFER" ? bankName : undefined,
      bank_account_number: paymentMethod === "BANK_TRANSFER" ? bankAccountNumber : undefined,
      bank_account_name: paymentMethod === "BANK_TRANSFER" ? bankAccountName : undefined,
      transfer_reference: paymentMethod === "BANK_TRANSFER" ? transferReference : undefined,
      paid_at: paidAt,
      note: note || undefined,
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setAmount(remainingAmount.toString());
    setPaymentMethod("BANK_TRANSFER");
    setBankName("");
    setBankAccountNumber("");
    setBankAccountName("");
    setTransferReference("");
    setPaidAt(new Date().toISOString().slice(0, 16));
    setNote("");
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Ghi nhận thanh toán Host
          </DialogTitle>
          <DialogDescription>
            Thanh toán cho {partnerName || "Host"} - Còn lại: {formatCurrency(remainingAmount)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Số tiền thanh toán (VND)</Label>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                placeholder="0"
              />
              {parseFloat(amount) > remainingAmount && (
                <p className="text-xs text-destructive">Vượt quá số tiền còn lại</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Phương thức</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Chuyển khoản</SelectItem>
                  <SelectItem value="CASH">Tiền mặt</SelectItem>
                  <SelectItem value="OTHER">Khác</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {paymentMethod === "BANK_TRANSFER" && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4" />
                Thông tin chuyển khoản
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ngân hàng</Label>
                  <Input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="VD: Vietcombank"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Số tài khoản</Label>
                  <Input
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="Số tài khoản"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tên chủ tài khoản</Label>
                  <Input
                    value={bankAccountName}
                    onChange={(e) => setBankAccountName(e.target.value)}
                    placeholder="Tên chủ TK"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Mã giao dịch</Label>
                  <Input
                    value={transferReference}
                    onChange={(e) => setTransferReference(e.target.value)}
                    placeholder="Mã GD ngân hàng"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Thời gian thanh toán</Label>
            <Input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thanh toán (tùy chọn)"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={createPayment.isPending || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > remainingAmount}
            >
              {createPayment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ghi nhận thanh toán
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
