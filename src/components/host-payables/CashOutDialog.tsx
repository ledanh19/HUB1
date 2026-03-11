import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateHostDepositCashOut, HostDepositRequest } from "@/hooks/useHostDepositRequests";
import { Loader2, AlertCircle, Banknote } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReceiptUpload } from "@/components/ui/receipt-upload";

interface CashOutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: HostDepositRequest | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
};

export function CashOutDialog({ open, onOpenChange, request }: CashOutDialogProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"BANK_TRANSFER" | "CASH" | "OTHER">("BANK_TRANSFER");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [note, setNote] = useState("");
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const createCashOut = useCreateHostDepositCashOut();

  if (!request) return null;

  const remaining = request.remaining;
  const amountNum = parseFloat(amount) || 0;
  const exceedsRemaining = amountNum > remaining;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || amountNum <= 0 || exceedsRemaining) return;

    await createCashOut.mutateAsync({
      request_id: request.id,
      amount: amountNum,
      payment_method: paymentMethod,
      bank_name: paymentMethod === "BANK_TRANSFER" ? bankName : undefined,
      bank_account_number: paymentMethod === "BANK_TRANSFER" ? bankAccountNumber : undefined,
      bank_account_name: paymentMethod === "BANK_TRANSFER" ? bankAccountName : undefined,
      transfer_reference: transferReference || undefined,
      note: note || undefined,
      receipt_image: receiptImage || undefined,
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setAmount("");
    setPaymentMethod("BANK_TRANSFER");
    setBankName("");
    setBankAccountNumber("");
    setBankAccountName("");
    setTransferReference("");
    setNote("");
    setReceiptImage(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Ghi nhận chi tiền thực tế
          </DialogTitle>
          <DialogDescription>
            Chi tiền cho đề xuất {request.request_code}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Đề xuất:</span>
            <span className="font-medium">{formatCurrency(request.proposed_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Đã chi:</span>
            <span className="font-medium text-success">{formatCurrency(request.total_paid)}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="text-muted-foreground">Còn lại:</span>
            <span className="font-bold text-primary">{formatCurrency(remaining)}</span>
          </div>
        </div>

        {exceedsRemaining && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Số tiền chi không được vượt quá còn lại ({formatCurrency(remaining)})
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Số tiền chi (VND) <span className="text-destructive">*</span></Label>
            <CurrencyInput
              value={amount}
              onChange={setAmount}
              placeholder="0"
              disabled={false}
            />
          </div>

          <div className="space-y-2">
            <Label>Phương thức <span className="text-destructive">*</span></Label>
            <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
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

          {paymentMethod === "BANK_TRANSFER" && (
            <>
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
                    placeholder="123456789"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tên tài khoản</Label>
                <Input
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="NGUYEN VAN A"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Mã giao dịch</Label>
            <Input
              value={transferReference}
              onChange={(e) => setTransferReference(e.target.value)}
              placeholder="VD: VCB123456"
            />
          </div>

          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Ảnh chứng từ</Label>
            <ReceiptUpload
              value={receiptImage}
              onChange={setReceiptImage}
              folderPath={`cash-outs/${request?.id}`}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={createCashOut.isPending || !amount || amountNum <= 0 || exceedsRemaining}
            >
              {createCashOut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Xác nhận chi tiền
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
