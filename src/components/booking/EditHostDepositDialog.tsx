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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useUpdateHostDepositRequest, HostDepositRequest } from "@/hooks/useHostDepositRequests";

interface EditHostDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: HostDepositRequest | null;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
};

export function EditHostDepositDialog({
  open,
  onOpenChange,
  request,
}: EditHostDepositDialogProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  
  const updateMutation = useUpdateHostDepositRequest();
  
  // Populate form when request changes
  useEffect(() => {
    if (request && open) {
      setAmount(request.proposed_amount.toLocaleString("vi-VN"));
      setNote(request.note || "");
    }
  }, [request, open]);

  const isDeposit = request?.purpose === "HOST_DEPOSIT";
  const title = isDeposit ? "Chỉnh sửa đề xuất đặt cọc" : "Chỉnh sửa đề xuất trả trước";

  const handleSubmit = async () => {
    if (!request) return;
    
    const parsedAmount = parseFloat(amount.replace(/[^\d]/g, ""));
    if (!parsedAmount || parsedAmount <= 0) return;

    await updateMutation.mutateAsync({
      requestId: request.id,
      proposed_amount: parsedAmount,
      note: note || undefined,
    });

    onOpenChange(false);
  };

  const handleClose = () => {
    setAmount("");
    setNote("");
    onOpenChange(false);
  };

  const parsedAmount = parseFloat(amount.replace(/[^\d]/g, "")) || 0;
  const isValid = parsedAmount > 0;

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Mã đề xuất: {request.request_code} • Host: {request.partner_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="edit-amount">Số tiền (VND) <span className="text-destructive">*</span></Label>
            <Input
              id="edit-amount"
              type="text"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d]/g, "");
                setAmount(val ? parseInt(val).toLocaleString("vi-VN") : "");
              }}
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="edit-note">Ghi chú</Label>
            <Textarea
              id="edit-note"
              placeholder="Ghi chú..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isValid || updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
