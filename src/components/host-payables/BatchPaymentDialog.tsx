import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Banknote, AlertTriangle } from "lucide-react";
import { useCreateBatchPayment, EnhancedPayable } from "@/hooks/useHostPayablesEnhanced";

interface BatchPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payables: EnhancedPayable[];
  selectedIds: string[];
  partnerName: string;
  partnerId: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function BatchPaymentDialog({
  open,
  onOpenChange,
  payables,
  selectedIds,
  partnerName,
  partnerId,
}: BatchPaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [note, setNote] = useState("");
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const createBatchPayment = useCreateBatchPayment();

  // Initialize amounts from selected payables
  const selectedPayables = useMemo(() => {
    return payables.filter((p) => selectedIds.includes(p.id));
  }, [payables, selectedIds]);

  // Initialize amounts when dialog opens
  useMemo(() => {
    if (open && selectedPayables.length > 0) {
      const initialAmounts: Record<string, number> = {};
      selectedPayables.forEach((p) => {
        initialAmounts[p.id] = p.remaining_amount;
      });
      setAmounts(initialAmounts);
    }
  }, [open, selectedPayables]);

  const totalAmount = useMemo(() => {
    return Object.values(amounts).reduce((sum, a) => sum + (a || 0), 0);
  }, [amounts]);

  const handleAmountChange = (payableId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setAmounts((prev) => ({ ...prev, [payableId]: numValue }));
  };

  const handleSubmit = async () => {
    if (totalAmount <= 0) {
      return;
    }

    await createBatchPayment.mutateAsync({
      partnerId,
      payableIds: selectedIds,
      amounts,
      paymentMethod,
      bankName: paymentMethod === "BANK_TRANSFER" ? bankName : undefined,
      bankAccountNumber: paymentMethod === "BANK_TRANSFER" ? bankAccountNumber : undefined,
      bankAccountName: paymentMethod === "BANK_TRANSFER" ? bankAccountName : undefined,
      transferReference: paymentMethod === "BANK_TRANSFER" ? transferReference : undefined,
      note,
    });

    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setPaymentMethod("BANK_TRANSFER");
    setBankName("");
    setBankAccountNumber("");
    setBankAccountName("");
    setTransferReference("");
    setNote("");
    setAmounts({});
  };

  const hasHostCollected = selectedPayables.some(
    (p) => p.collection_responsibility === "HOST_COLLECTED"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Thanh toán gộp cho Host
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Host Info */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Host</p>
                <p className="font-medium">{partnerName}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Số booking</p>
                <p className="font-medium">{selectedPayables.length}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Tổng thanh toán</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </div>

          {/* Warning for Host Collected */}
          {hasHostCollected && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">
                  Có booking Host đã tự thu tiền
                </p>
                <p className="text-xs text-warning">
                  Các booking này sẽ được ghi nhận nhưng không cần thanh toán thực tế
                </p>
              </div>
            </div>
          )}

          {/* Booking List */}
          <div>
            <Label className="mb-2 block">Chi tiết các booking</Label>
            <ScrollArea className="h-48 border rounded-lg">
              <div className="p-2 space-y-2">
                {selectedPayables.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-2 rounded border ${p.collection_responsibility === "HOST_COLLECTED"
                        ? "bg-warning/10 border-warning/20"
                        : ""
                      }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{p.unified_booking_id}</span>
                        {p.collection_responsibility === "HOST_COLLECTED" && (
                          <Badge variant="outline" className="text-xs border-warning text-warning">
                            Host tự thu
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.total_nights} đêm × {formatCurrency(p.avg_nightly_rate)} = {formatCurrency(p.amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Còn lại: {formatCurrency(p.remaining_amount)}
                      </div>
                    </div>
                    <div className="w-36">
                      <CurrencyInput
                        value={amounts[p.id] || 0}
                        onChange={(v) => handleAmountChange(p.id, v)}
                        className="text-right"
                        disabled={p.collection_responsibility === "HOST_COLLECTED"}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Payment Method */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Hình thức thanh toán</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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

          {/* Bank Transfer Details */}
          {paymentMethod === "BANK_TRANSFER" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ngân hàng</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="VD: Vietcombank"
                />
              </div>
              <div>
                <Label>Số tài khoản</Label>
                <Input
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="Số TK nhận"
                />
              </div>
              <div>
                <Label>Tên tài khoản</Label>
                <Input
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="Chủ TK"
                />
              </div>
              <div>
                <Label>Mã giao dịch</Label>
                <Input
                  value={transferReference}
                  onChange={(e) => setTransferReference(e.target.value)}
                  placeholder="Ref/FT..."
                />
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <Label>Ghi chú</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thanh toán (tuỳ chọn)"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createBatchPayment.isPending || totalAmount <= 0}
          >
            {createBatchPayment.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="mr-2 h-4 w-4" />
            )}
            Xác nhận thanh toán {formatCurrency(totalAmount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
