import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RotateCcw, Loader2, ShieldAlert } from "lucide-react";
import { useRemoveNoShow } from "@/hooks/useNoShow";

interface RemoveNoShowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noShowId: string;
  bookingId: string;
  guestName?: string;
}

export function RemoveNoShowDialog({
  open,
  onOpenChange,
  noShowId,
  bookingId,
  guestName,
}: RemoveNoShowDialogProps) {
  const [removalReason, setRemovalReason] = useState("");
  const removeMutation = useRemoveNoShow();

  const handleSubmit = async () => {
    if (!removalReason.trim()) {
      return;
    }

    await removeMutation.mutateAsync({
      noShowId,
      unified_booking_id: bookingId,
      removal_reason: removalReason.trim(),
    });

    onOpenChange(false);
    setRemovalReason("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-success" />
            Gỡ trạng thái No-Show
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Chỉ Admin</p>
              <p className="text-xs text-muted-foreground">
                Thao tác này sẽ được ghi vào audit log
              </p>
            </div>
          </div>

          {guestName && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Khách</p>
              <p className="font-medium">{guestName}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Lý do gỡ no-show <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={removalReason}
              onChange={(e) => setRemovalReason(e.target.value)}
              placeholder="Nhập lý do gỡ trạng thái no-show (bắt buộc)"
              rows={3}
            />
            {removalReason.trim().length === 0 && (
              <p className="text-xs text-destructive">Lý do là bắt buộc</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={removeMutation.isPending || !removalReason.trim()}
          >
            {removeMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Xác nhận gỡ No-Show
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
