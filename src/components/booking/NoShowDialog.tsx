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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCreateNoShow, NO_SHOW_REASON_LABELS, NoShowReason } from "@/hooks/useNoShow";
import { useResponsibleOwner } from "@/hooks/useResponsibleOwner";

interface NoShowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  guestName?: string;
}

export function NoShowDialog({
  open,
  onOpenChange,
  bookingId,
  guestName,
}: NoShowDialogProps) {
  const [reason, setReason] = useState<NoShowReason>("GUEST_NO_ARRIVAL");
  const [note, setNote] = useState("");
  const [noShowDate, setNoShowDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const createMutation = useCreateNoShow();
  
  // Responsible Owner tracking - assign on no-show mark
  const { isOwnerAssigned, assignOwner } = useResponsibleOwner(bookingId);

  const handleSubmit = async () => {
    if (!note.trim()) {
      return;
    }

    await createMutation.mutateAsync({
      unified_booking_id: bookingId,
      reason,
      note: note.trim(),
      no_show_date: noShowDate,
    });

    // Assign responsible owner on first meaningful action (now saves to database)
    if (!isOwnerAssigned) {
      await assignOwner("No-show marked");
    }

    onOpenChange(false);
    setNote("");
    setReason("GUEST_NO_ARRIVAL");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Ghi nhận No-Show
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {guestName && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Khách</p>
              <p className="font-medium">{guestName}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Ngày No-Show</Label>
            <Input
              type="date"
              value={noShowDate}
              onChange={(e) => setNoShowDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Lý do</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as NoShowReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NO_SHOW_REASON_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Ghi chú <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mô tả chi tiết tình huống no-show (bắt buộc)"
              rows={3}
            />
            {note.trim().length === 0 && (
              <p className="text-xs text-destructive">Ghi chú là bắt buộc</p>
            )}
          </div>

          <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
            <p className="text-sm text-warning flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Lưu ý: No-show chỉ là trạng thái vận hành, không ảnh hưởng tài chính.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !note.trim()}
            variant="destructive"
          >
            {createMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Xác nhận No-Show
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
