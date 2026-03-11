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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, XCircle, AlertTriangle } from "lucide-react";
import { useCreateVoid, useCanVoidServer, HotelCollect } from "@/hooks/useCollections";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface VoidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: HotelCollect;
  onSuccess?: () => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export function VoidDialog({
  open,
  onOpenChange,
  collection,
  onSuccess,
}: VoidDialogProps) {
  const [reasonNote, setReasonNote] = useState("");

  const createVoid = useCreateVoid();
  // PHASE 3.1: Server-side validation (checks period lock, reconciliation, etc.)
  const { data: canVoidCheck, isLoading: checkingCanVoid } = useCanVoidServer(
    open ? collection.id : undefined
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reasonNote.trim()) {
      return;
    }

    await createVoid.mutateAsync({
      originalCollectionId: collection.id,
      unifiedBookingId: collection.unified_booking_id,
      reasonNote: reasonNote.trim(),
    });

    // Reset form
    setReasonNote("");
    onOpenChange(false);
    onSuccess?.();
  };

  const canVoid = canVoidCheck?.can_void ?? true;
  const canVoidReason = canVoidCheck?.reason;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-muted-foreground" />
            Hủy thu tiền
          </DialogTitle>
          <DialogDescription>
            Hủy bỏ ghi nhận thu tiền này. Chỉ dùng khi tiền <strong>chưa thực thu</strong> từ khách.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert variant="default" className="bg-muted">
            <AlertDescription className="space-y-2">
              <div className="flex justify-between">
                <span>Booking:</span>
                <span className="font-medium">{collection.unified_booking_id}</span>
              </div>
              <div className="flex justify-between">
                <span>Số tiền:</span>
                <span className="font-medium">{formatCurrency(Number(collection.amount_collected))}</span>
              </div>
              <div className="flex justify-between">
                <span>Phương thức:</span>
                <span className="font-medium">{collection.payment_method}</span>
              </div>
            </AlertDescription>
          </Alert>

          {/* PHASE 3.1: Show server-side validation errors */}
          {checkingCanVoid && (
            <Alert>
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>Đang kiểm tra...</AlertDescription>
            </Alert>
          )}

          {!checkingCanVoid && !canVoid && canVoidReason && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Không thể hủy:</strong> {canVoidReason}
              </AlertDescription>
            </Alert>
          )}

          <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Lưu ý:</strong> VOID chỉ dùng khi ghi nhận nhầm - tiền chưa thực thu từ khách. 
              Nếu tiền đã thu rồi, hãy dùng chức năng <strong>Hoàn tiền</strong> thay thế.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="reason">Lý do hủy *</Label>
            <Textarea
              id="reason"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Nhập lý do hủy thu (bắt buộc)"
              required
              rows={3}
              disabled={!canVoid}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Quay lại
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={createVoid.isPending || !reasonNote.trim() || !canVoid || checkingCanVoid}
            >
              {createVoid.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
