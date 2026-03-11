import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApplyPrepaid, HostPrepaid } from "@/hooks/useHostDeposits";
import { Loader2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ApplyPrepaidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prepaid: HostPrepaid | null;
  payableId: string;
  payableRemaining: number;
  isCheckedOut?: boolean;
  bookingPartnerId?: string;
}

export function ApplyPrepaidDialog({
  open,
  onOpenChange,
  prepaid,
  payableId,
  payableRemaining,
  isCheckedOut = true,
  bookingPartnerId,
}: ApplyPrepaidDialogProps) {
  const applyPrepaid = useApplyPrepaid();

  if (!prepaid) return null;

  const applyAmount = Math.min(prepaid.prepaid_amount, payableRemaining);
  const exceedsPayable = prepaid.prepaid_amount > payableRemaining;
  const partnerMismatch = bookingPartnerId && prepaid.partner_id !== bookingPartnerId;

  // GUARDRAIL: Block if not checked out
  const blockedNotCheckedOut = !isCheckedOut;

  // GUARDRAIL: Block if would exceed payable (apply amount <= 0 means payable is 0)
  const blockedNoPayable = payableRemaining <= 0;

  // GUARDRAIL: Block if prepaid not yet PAID (chưa chi tiền)
  const blockedNotPaid = prepaid.approval_status !== "PAID";

  const canApply = !blockedNotCheckedOut && !blockedNoPayable && !partnerMismatch && !blockedNotPaid && applyAmount > 0;

  const handleApply = async () => {
    if (!canApply) return;

    await applyPrepaid.mutateAsync({
      prepaidId: prepaid.id,
      payableId: payableId,
      amount: applyAmount,
    });
    onOpenChange(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cấn trừ Prepaid</DialogTitle>
          <DialogDescription>
            Xác nhận cấn trừ trả trước vào công nợ Host
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* BLOCK: Not PAID yet */}
          {blockedNotPaid && (
            <Alert className="bg-warning/10 border-warning/20">
              <Clock className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                <strong>Chặn thao tác:</strong> Trả trước này chưa được xác nhận chi tiền (trạng thái: {
                  prepaid.approval_status === "PENDING" ? "Chờ duyệt" :
                    prepaid.approval_status === "APPROVED" ? "Đã duyệt - chờ chi" :
                      prepaid.approval_status === "REJECTED" ? "Đã từ chối" : prepaid.approval_status
                }). Chỉ có thể cấn trừ prepaid đã chi tiền.
              </AlertDescription>
            </Alert>
          )}

          {/* BLOCK: Not checked out */}
          {!blockedNotPaid && blockedNotCheckedOut && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Chặn thao tác:</strong> Không thể cấn trừ prepaid trước khi booking đã trả phòng.
                Vui lòng hoàn tất trả phòng trước.
              </AlertDescription>
            </Alert>
          )}

          {/* BLOCK: Partner mismatch */}
          {!blockedNotPaid && partnerMismatch && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Chặn thao tác:</strong> Prepaid này thuộc Host khác, không khớp với booking hiện tại.
              </AlertDescription>
            </Alert>
          )}

          {/* BLOCK: No remaining payable */}
          {!blockedNotPaid && blockedNoPayable && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Chặn thao tác:</strong> Công nợ đã được thanh toán đủ. Không thể cấn trừ thêm.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Prepaid:</span>
              <p className="font-medium">{formatCurrency(prepaid.prepaid_amount)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Payable còn lại:</span>
              <p className="font-medium">{formatCurrency(payableRemaining)}</p>
            </div>
          </div>

          {exceedsPayable && !blockedNoPayable && !blockedNotPaid && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Prepaid ({formatCurrency(prepaid.prepaid_amount)}) lớn hơn công nợ còn lại.
                Chỉ có thể cấn trừ {formatCurrency(applyAmount)}.
              </AlertDescription>
            </Alert>
          )}

          {canApply && (
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">Số tiền sẽ cấn trừ:</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(applyAmount)}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Lưu ý: Thao tác cấn trừ không tạo cashflow mới. Prepaid đã được ghi nhận cash-out khi xác nhận chi tiền.
          </p>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {canApply ? "Hủy" : "Đóng"}
            </Button>
            {canApply && (
              <Button onClick={handleApply} disabled={applyPrepaid.isPending}>
                {applyPrepaid.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Xác nhận cấn trừ
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
