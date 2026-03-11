import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, Info, Banknote, Receipt, CreditCard, ArrowDownLeft } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";
import { format } from "date-fns";

interface Settlement {
  id: string;
  settlement_code: string;
  settlement_type: "HOST" | "SERVICE";
  entity_id: string;
  entity_name: string;
  net_amount: number;
  net_direction: "PAY" | "RECEIVE";
  remaining_amount: number;
}

interface CollectSettlementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settlement: Settlement | null;
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Tiền mặt", icon: Banknote },
  { value: "BANK_TRANSFER", label: "Chuyển khoản", icon: Receipt },
  { value: "CARD", label: "Thẻ (POS)", icon: CreditCard },
  { value: "QR", label: "QR Code", icon: Receipt },
  { value: "OTA_PAYOUT", label: "OTA Payout", icon: ArrowDownLeft },
];

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function CollectSettlementDialog({ open, onOpenChange, settlement }: CollectSettlementDialogProps) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [collectDate, setCollectDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Reset form when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && settlement) {
      setAmount(String(settlement.remaining_amount));
      setPaymentMethod("BANK_TRANSFER");
      setReference("");
      setNote("");
      setCollectDate(format(new Date(), "yyyy-MM-dd"));
    }
    onOpenChange(isOpen);
  };

  // Validate amount
  const amountNum = parseFloat(amount) || 0;
  const maxAmount = settlement?.remaining_amount || 0;
  const isAmountValid = amountNum > 0 && amountNum <= maxAmount;
  const isOverpaying = amountNum > maxAmount;

  // Create collection mutation
  const createCollectionMutation = useMutation({
    mutationFn: async () => {
      if (!settlement || !user) throw new Error("Dữ liệu không hợp lệ");

      const sourceType = settlement.settlement_type === "HOST"
        ? "HOST_SETTLEMENT_PAYMENT"
        : "SERVICE_SETTLEMENT_PAYMENT";

      const counterpartyType = settlement.settlement_type === "HOST"
        ? "HOST"
        : "SERVICE_PARTNER";

      const noteText = `${reference ? `Ref: ${reference}. ` : ""}${note || ""}`.trim() || `Thu từ ${settlement.entity_name} - ${settlement.settlement_code}`;

      // 1. Create hotel_collects record for Collections page sync
      const { data: collection, error: hcError } = await supabase
        .from("hotel_collects")
        .insert({
          unified_booking_id: `SETTLEMENT_${settlement.id}`, // Prefix to distinguish from booking collections
          amount_collected: amountNum,
          payment_method: paymentMethod,
          collected_at: `${collectDate}T00:00:00`,
          collected_by: user.id,
          payer_type: counterpartyType, // HOST or SERVICE_PARTNER
          payee_type: "ROOMRISE",
          related_type: "SETTLEMENT",
          related_id: settlement.id,
          collection_type: "COLLECT",
          status: "COLLECTED",
          note: noteText,
        })
        .select()
        .single();

      if (hcError) throw hcError;

      // 2. Create cashflow entry with direction = IN (receiving money)
      const { data: cashflow, error: cfError } = await supabase
        .from("cashflow_entries")
        .insert({
          cash_date: collectDate,
          source_type: sourceType,
          source_id: settlement.id,
          direction: "IN", // Roomrise receives money
          counterparty_type: counterpartyType,
          counterparty_id: settlement.entity_id,
          amount: amountNum,
          currency: "VND",
          note: noteText,
          created_by: user.id,
        })
        .select()
        .single();

      if (cfError) throw cfError;

      // Create audit log
      await createAuditLog({
        action: "Thu tiền quyết toán",
        entity: "hotel_collects",
        entityId: collection.id,
        afterData: {
          settlement_code: settlement.settlement_code,
          amount: amountNum,
          payment_method: paymentMethod,
          direction: "IN",
          entity_name: settlement.entity_name,
          cashflow_id: cashflow.id,
        },
      });

      return { collection, cashflow };
    },
    onSuccess: () => {
      toast.success("Ghi nhận thu tiền thành công", { description: `Đã thu ${formatCurrency(amountNum)} từ ${settlement?.entity_name}` });
      queryClient.invalidateQueries({ queryKey: ["settlement-history"] });
      queryClient.invalidateQueries({ queryKey: ["settlement-detail"] });
      queryClient.invalidateQueries({ queryKey: ["cashflow-entries"] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["hotel-collects"] });
      queryClient.invalidateQueries({ queryKey: ["hotel_collects"] });
      queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      queryClient.invalidateQueries({ queryKey: ["host_payables"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-today-collections"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-month-collections"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error("Lỗi", { description: error.message || "Không thể ghi nhận thu tiền" });
    },
  });

  if (!settlement) return null;

  // Only allow collection for RECEIVE direction
  if (settlement.net_direction !== "RECEIVE") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Không thể thu tiền</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Phiếu quyết toán này có hướng "Roomrise phải trả", không thể thu tiền.
              Vui lòng sử dụng chức năng Chi tiền.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thu tiền từ Quyết toán</DialogTitle>
          <DialogDescription>
            Ghi nhận giao dịch thu tiền cho phiếu quyết toán {settlement.settlement_code}
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-primary/10 border-primary/20 dark:border-primary">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-primary dark:text-primary">
            Giao dịch này dùng để thu tiền cho Phiếu quyết toán <strong>{settlement.settlement_code}</strong> từ <strong>{settlement.entity_name}</strong>
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {/* Settlement Info */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-muted rounded-lg text-sm">
            <div>
              <span className="text-muted-foreground">NET phải thu:</span>
              <p className="font-medium">{formatCurrency(Math.abs(settlement.net_amount))}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Còn lại:</span>
              <p className="font-medium text-destructive dark:text-destructive">{formatCurrency(settlement.remaining_amount)}</p>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền thu <span className="text-destructive">*</span></Label>
            <CurrencyInput
              id="amount"
              value={amount}
              onChange={setAmount}
              placeholder="0"
              className={isOverpaying ? "border-destructive" : ""}
            />
            {isOverpaying && (
              <p className="text-sm text-destructive">
                Số tiền không được vượt quá còn lại ({formatCurrency(maxAmount)})
              </p>
            )}
          </div>

          {/* Collect Date */}
          <div className="space-y-2">
            <Label htmlFor="collect-date">Ngày thu <span className="text-destructive">*</span></Label>
            <Input
              id="collect-date"
              type="date"
              value={collectDate}
              onChange={(e) => setCollectDate(e.target.value)}
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label>Phương thức</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    <div className="flex items-center gap-2">
                      <method.icon className="h-4 w-4" />
                      {method.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference */}
          <div className="space-y-2">
            <Label htmlFor="reference">Mã tham chiếu / Số UNC</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="VD: UNC123456"
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={() => createCollectionMutation.mutate()}
            disabled={!isAmountValid || createCollectionMutation.isPending}
          >
            {createCollectionMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Ghi nhận thu tiền
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
