import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PermissionGate } from "@/components/ui/PermissionGate";
import { useRefundDeposit, HostDeposit } from "@/hooks/useHostDeposits";
import { Loader2 } from "lucide-react";

interface RefundDepositDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deposit: HostDeposit | null;
}

export function RefundDepositDialog({ 
  open, 
  onOpenChange, 
  deposit 
}: RefundDepositDialogProps) {
  const [note, setNote] = useState("");
  const refundDeposit = useRefundDeposit();
  
  if (!deposit) return null;
  
  const handleRefund = async () => {
    await refundDeposit.mutateAsync({
      depositId: deposit.id,
      amount: deposit.deposit_amount,
      partnerId: deposit.partner_id,
      note: note || undefined,
    });
    onOpenChange(false);
    setNote("");
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hoàn cọc Host</DialogTitle>
          <DialogDescription>
            Xác nhận hoàn trả tiền cọc từ Host về Roomrise
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">Số tiền hoàn cọc:</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(deposit.deposit_amount)}</p>
          </div>
          
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lý do hoàn cọc (tùy chọn)"
            />
          </div>
          
          <p className="text-xs text-muted-foreground">
            Lưu ý: Thao tác này sẽ tạo cashflow IN (tiền về Roomrise).
          </p>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <PermissionGate 
              page="/host-deposits" 
              require="can_use" 
              fallback="disable"
              disabledMessage="Bạn không có quyền hoàn cọc"
            >
              <Button onClick={handleRefund} disabled={refundDeposit.isPending}>
                {refundDeposit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Xác nhận hoàn cọc
              </Button>
            </PermissionGate>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
