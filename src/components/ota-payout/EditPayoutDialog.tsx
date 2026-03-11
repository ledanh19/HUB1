import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAuditLog } from "@/hooks/useAuditLog";

interface PayoutData {
  id: string;
  ota_source: string;
  ota_property_id: string | null;
  provider_payout_id: string | null;
  payout_date: string;
  payout_period_from: string | null;
  payout_period_to: string | null;
  payout_method: string | null;
  payment_gateway: string | null;
  note: string | null;
  status: string | null;
  received_at: string | null;
}

interface EditPayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payout: PayoutData | null;
}

export function EditPayoutDialog({ open, onOpenChange, payout }: EditPayoutDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [providerPayoutId, setProviderPayoutId] = useState("");
  const [payoutDate, setPayoutDate] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [note, setNote] = useState("");
  const [receivedAt, setReceivedAt] = useState("");

  const isPending = payout?.status === "PENDING";
  const hasReceivedMoney = payout?.status === "PARTIAL" || payout?.status === "RECEIVED";
  const isDisputed = payout?.status === "DISPUTED";

  const canEditPayoutDate = isPending || hasReceivedMoney;
  const canEditPeriodDates = isPending;
  const canEditProviderId = isPending || hasReceivedMoney;
  const canEditReceivedAt = hasReceivedMoney;
  const canEditNote = true;

  useEffect(() => {
    if (payout && open) {
      setProviderPayoutId(payout.provider_payout_id || "");
      setPayoutDate(payout.payout_date || "");
      setPeriodFrom(payout.payout_period_from || "");
      setPeriodTo(payout.payout_period_to || "");
      setNote(payout.note || "");
      setReceivedAt(payout.received_at ? payout.received_at.split("T")[0] : "");
    }
  }, [payout, open]);

  const handleSubmit = async () => {
    if (!payout) return;
    setIsSubmitting(true);

    try {
      const updates: Record<string, any> = {};
      const beforeData: Record<string, any> = {};

      if (note !== (payout.note || "")) {
        beforeData.note = payout.note;
        updates.note = note || null;
      }

      if (canEditProviderId && providerPayoutId !== (payout.provider_payout_id || "")) {
        beforeData.provider_payout_id = payout.provider_payout_id;
        updates.provider_payout_id = providerPayoutId || null;
      }

      if (canEditPayoutDate && payoutDate !== payout.payout_date) {
        beforeData.payout_date = payout.payout_date;
        updates.payout_date = payoutDate;
      }

      if (canEditPeriodDates) {
        if (periodFrom !== (payout.payout_period_from || "")) {
          beforeData.payout_period_from = payout.payout_period_from;
          updates.payout_period_from = periodFrom || null;
        }
        if (periodTo !== (payout.payout_period_to || "")) {
          beforeData.payout_period_to = payout.payout_period_to;
          updates.payout_period_to = periodTo || null;
        }
      }

      if (canEditReceivedAt) {
        const currentReceivedAt = payout.received_at ? payout.received_at.split("T")[0] : "";
        if (receivedAt !== currentReceivedAt) {
          beforeData.received_at = payout.received_at;
          updates.received_at = receivedAt ? receivedAt + "T12:00:00Z" : null;
        }
      }

      if (Object.keys(updates).length === 0) {
        toast.info("Không có thay đổi nào");
        onOpenChange(false);
        return;
      }

      const { error } = await supabase
        .from("ota_payouts")
        .update(updates)
        .eq("id", payout.id);

      if (error) throw error;

      await createAuditLog({
        action: "OTA_PAYOUT_EDIT",
        entity: "ota_payouts",
        entityId: payout.id,
        beforeData,
        afterData: updates,
      });

      toast.success("Đã cập nhật payout thành công");
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout", payout.id] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!payout) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-base">Chỉnh sửa Payout</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isPending && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            {hasReceivedMoney
                ? "⚠️ Payout đã ghi nhận tiền — chỉ cho phép sửa Ngày payout, ID Payout và Ghi chú."
                : "⚠️ Payout đang tranh chấp — chỉ cho phép sửa Ghi chú."}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">ID Payout (từ OTA)</Label>
            <Input
              value={providerPayoutId}
              onChange={(e) => setProviderPayoutId(e.target.value)}
              placeholder="Nhập ID Payout từ OTA"
              disabled={!canEditProviderId}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ngày payout *</Label>
            <Input
              type="date"
              value={payoutDate}
              onChange={(e) => setPayoutDate(e.target.value)}
              disabled={!canEditPayoutDate}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Kỳ từ</Label>
              <Input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                disabled={!canEditPeriodDates}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kỳ đến</Label>
              <Input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                disabled={!canEditPeriodDates}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ngày nhận thanh toán</Label>
            <Input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              disabled={!canEditReceivedAt}
              placeholder="Chọn ngày nhận thực tế"
            />
            {!canEditReceivedAt && isPending && (
              <p className="text-[10px] text-muted-foreground">Chỉ khả dụng sau khi ghi nhận tiền về</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ghi chú</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú..."
              rows={2}
              disabled={!canEditNote}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
