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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Archive,
  Loader2,
  Building2,
  BedDouble,
  CreditCard,
  Receipt,
  Wallet,
  BarChart3,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  usePartnerReferenceSummary,
  archivePartner,
  reactivatePartner,
  blacklistPartner,
  PartnerStatus,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_COLORS,
} from "@/hooks/useCatalog";
import { useQueryClient } from "@tanstack/react-query";

interface ArchivePartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: {
    id: string;
    partner_name: string;
    partner_status?: PartnerStatus;
  } | null;
  action: "archive" | "blacklist" | "reactivate";
}

export function ArchivePartnerDialog({
  open,
  onOpenChange,
  partner,
  action,
}: ArchivePartnerDialogProps) {
  const [reason, setReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();

  // Fetch reference summary for impact preview
  const { data: summary, isLoading: loadingSummary } = usePartnerReferenceSummary(
    open ? partner?.id ?? null : null
  );

  // Reset reason when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!partner) return;

    // Validate reason for blacklist
    if (action === "blacklist" && !reason.trim()) {
      toast.error("Lỗi", { description: "Vui lòng nhập lý do đưa vào danh sách đen" });
      return;
    }

    setIsProcessing(true);
    try {
      let result;

      if (action === "archive") {
        result = await archivePartner(partner.id, reason || undefined);
      } else if (action === "blacklist") {
        result = await blacklistPartner(partner.id, reason);
      } else if (action === "reactivate") {
        result = await reactivatePartner(partner.id, "ACTIVE");
      }

      if (result?.success) {
        toast.success("Thành công", {
          description:
            action === "archive"
              ? `Đã lưu trữ đối tác "${partner.partner_name}"`
              : action === "blacklist"
              ? `Đã đưa "${partner.partner_name}" vào danh sách đen`
              : `Đã kích hoạt lại đối tác "${partner.partner_name}"`,
        });
        queryClient.invalidateQueries({ queryKey: ["partners"] });
        queryClient.invalidateQueries({ queryKey: ["partners-with-status"] });
        onOpenChange(false);
      } else {
        throw new Error(result?.error || "Có lỗi xảy ra");
      }
    } catch (err: any) {
      toast.error("Lỗi", { description: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const getDialogConfig = () => {
    switch (action) {
      case "archive":
        return {
          title: "Lưu trữ đối tác",
          description: `Bạn đang lưu trữ đối tác "${partner?.partner_name}". Đối tác sẽ được ẩn khỏi danh sách nhưng dữ liệu lịch sử vẫn được bảo toàn.`,
          icon: Archive,
          iconColor: "text-warning",
          buttonText: "Lưu trữ",
          buttonVariant: "default" as const,
          reasonLabel: "Lý do lưu trữ (tuỳ chọn)",
          reasonPlaceholder: "VD: Ngừng hợp tác, Hết hạn hợp đồng...",
          reasonRequired: false,
        };
      case "blacklist":
        return {
          title: "Đưa vào danh sách đen",
          description: `Bạn đang đưa "${partner?.partner_name}" vào danh sách đen. Đối tác này sẽ bị chặn hoàn toàn khỏi hệ thống.`,
          icon: Ban,
          iconColor: "text-destructive",
          buttonText: "Đưa vào danh sách đen",
          buttonVariant: "destructive" as const,
          reasonLabel: "Lý do (bắt buộc) *",
          reasonPlaceholder: "VD: Vi phạm hợp đồng, Gian lận, Khiếu nại nghiêm trọng...",
          reasonRequired: true,
        };
      case "reactivate":
        return {
          title: "Kích hoạt lại đối tác",
          description: `Bạn đang kích hoạt lại đối tác "${partner?.partner_name}". Đối tác sẽ xuất hiện trở lại trong danh sách hoạt động.`,
          icon: RotateCcw,
          iconColor: "text-success",
          buttonText: "Kích hoạt lại",
          buttonVariant: "default" as const,
          reasonLabel: "",
          reasonPlaceholder: "",
          reasonRequired: false,
        };
    }
  };

  const config = getDialogConfig();
  const Icon = config.icon;

  const hasReferences = summary && summary.total_references > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.iconColor}`} />
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Impact Summary */}
          {action !== "reactivate" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Tác động khi {action === "archive" ? "lưu trữ" : "đưa vào danh sách đen"}
              </div>

              {loadingSummary ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : summary ? (
                <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
                  {/* Reference counts grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center justify-between p-2 rounded bg-background">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        Chỗ nghỉ
                      </span>
                      <span className="font-medium">{summary.property_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-background">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <BedDouble className="h-4 w-4" />
                        Phòng
                      </span>
                      <span className="font-medium">{summary.room_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-background">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <BarChart3 className="h-4 w-4" />
                        Supply segments
                      </span>
                      <span className="font-medium">{summary.segment_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-background">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <CreditCard className="h-4 w-4" />
                        Công nợ
                      </span>
                      <span className="font-medium">{summary.payable_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-background">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Wallet className="h-4 w-4" />
                        Đặt cọc
                      </span>
                      <span className="font-medium">{summary.deposit_count}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-background">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Receipt className="h-4 w-4" />
                        Hoa hồng
                      </span>
                      <span className="font-medium">{summary.commission_count}</span>
                    </div>
                  </div>

                  {/* Total and status */}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="font-medium">Tổng dữ liệu liên quan</span>
                    <span className={`font-bold text-lg ${
                      hasReferences ? "text-warning" : "text-success"
                    }`}>
                      {summary.total_references} bản ghi
                    </span>
                  </div>

                  {/* Protection message */}
                  {hasReferences ? (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-warning">
                          Dữ liệu được bảo toàn
                        </p>
                        <p className="text-warning mt-1">
                          Tất cả lịch sử booking, công nợ, thanh toán sẽ được giữ nguyên. 
                          Đối tác chỉ bị ẩn khỏi UI, không bị xóa.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/20 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-success">
                          Không có dữ liệu liên quan
                        </p>
                        <p className="text-success mt-1">
                          Đối tác này chưa có bất kỳ giao dịch nào. 
                          Có thể {action === "archive" ? "lưu trữ" : "xử lý"} an toàn.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="text-destructive">Không thể tải thông tin tham chiếu</span>
                </div>
              )}
            </div>
          )}

          {/* Reason input */}
          {config.reasonLabel && (
            <div className="space-y-2">
              <Label htmlFor="reason">{config.reasonLabel}</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={config.reasonPlaceholder}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            variant={config.buttonVariant}
            onClick={handleConfirm}
            disabled={isProcessing || (config.reasonRequired && !reason.trim())}
          >
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {config.buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
