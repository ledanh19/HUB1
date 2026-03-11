import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RefreshCw, CheckCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BackfillResult {
  dry_run: boolean;
  total_deductions_processed: number;
  created_recon_items: number;
  posted_to_ledger: number;
  skipped: number;
  errors: Array<{ deduction_id: string; error: string }>;
  items?: Array<{
    deduction_id: string;
    amount: number;
    deduction_type: string;
    ota_source: string;
    already_bridged: boolean;
  }>;
}

export function BackfillAdjustmentsButton() {
  const { userRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "audit" | "confirm" | "running" | "done">("idle");
  const [auditResult, setAuditResult] = useState<BackfillResult | null>(null);
  const [runResult, setRunResult] = useState<BackfillResult | null>(null);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  // RBAC: Only super_admin can see this button
  const canSeeBackfill = userRole === "super_admin";
  if (!canSeeBackfill) return null;

  const handleOpen = async () => {
    setOpen(true);
    setPhase("audit");
    setLoading(true);
    setAuditResult(null);
    setRunResult(null);
    setReason("");
    setAcknowledged(false);

    try {
      const { data, error } = await (supabase.rpc as any)(
        "backfill_deductions_to_ledger",
        { p_limit: 500, p_dry_run: true }
      );
      if (error) throw error;
      setAuditResult(data as BackfillResult);
      setPhase("confirm");
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("AUTH_REQUIRED")) toast.error("Vui lòng đăng nhập lại.");
      else if (msg.includes("PERMISSION_DENIED")) toast.error("Chỉ Super Admin được phép chạy backfill.");
      else toast.error("Lỗi kiểm tra: " + msg);
      setPhase("idle");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    setPhase("running");
    setLoading(true);

    try {
      const { data, error } = await (supabase.rpc as any)(
        "backfill_deductions_to_ledger",
        { p_limit: 5000, p_dry_run: false, p_reason: reason.trim() }
      );
      if (error) throw error;
      setRunResult(data as BackfillResult);
      setPhase("done");
      toast.success(`Backfill hoàn tất: ${(data as BackfillResult).posted_to_ledger} bút toán đã tạo`);
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("PERIOD_LOCK")) toast.error("Kỳ kế toán đang khóa, không thể hạch toán.");
      else if (msg.includes("PERMISSION_DENIED")) toast.error("Chỉ Super Admin được phép chạy backfill.");
      else toast.error("Lỗi backfill: " + msg);
      setPhase("confirm");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setPhase("idle");
    setAuditResult(null);
    setRunResult(null);
    setReason("");
    setAcknowledged(false);
  };

  const toBridge = auditResult?.items?.filter(i => !i.already_bridged).length ?? 0;
  const canConfirm = reason.trim().length >= 10 && acknowledged && toBridge > 0;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleOpen}>
            <ShieldAlert className="h-4 w-4" />
            <span className="hidden sm:inline">Backfill điều chỉnh</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Chỉ Super Admin — tool xử lý dữ liệu lịch sử</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-warning" />
              Kiểm tra & Backfill điều chỉnh OTA
            </DialogTitle>
            <DialogDescription>
              Chuyển các khoản điều chỉnh (deductions) sang sổ cái để hiển thị trên báo cáo P&L.
              <span className="block mt-1 text-warning font-medium">⚠️ Thao tác dữ liệu lịch sử — chỉ Super Admin.</span>
            </DialogDescription>
          </DialogHeader>

          {phase === "audit" && (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Đang kiểm tra...
            </div>
          )}

          {phase === "confirm" && auditResult && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng deductions</span>
                  <span className="font-medium tabular-nums">{auditResult.created_recon_items}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cần tạo bút toán</span>
                  <span className="font-semibold text-primary tabular-nums">{toBridge}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Đã xử lý trước đó</span>
                  <span className="tabular-nums">{auditResult.created_recon_items - toBridge}</span>
                </div>
              </div>

              {toBridge === 0 ? (
                <div className="flex items-center gap-2 text-success text-sm">
                  <CheckCircle className="h-4 w-4" />
                  Tất cả đã được xử lý, không cần backfill.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-warning text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    {toBridge} khoản điều chỉnh chưa có bút toán trên sổ cái.
                  </div>

                  {/* Confirm controls */}
                  <div className="space-y-3 border-t pt-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Lý do backfill (bắt buộc, tối thiểu 10 ký tự) *</Label>
                      <Textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="VD: Dữ liệu lịch sử Sprint 8 chưa có ledger, đã audit 3 deductions..."
                        rows={3}
                      />
                      {reason.trim().length > 0 && reason.trim().length < 10 && (
                        <p className="text-xs text-destructive">Tối thiểu 10 ký tự ({reason.trim().length}/10)</p>
                      )}
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="backfill-ack"
                        checked={acknowledged}
                        onCheckedChange={(v) => setAcknowledged(v === true)}
                      />
                      <Label htmlFor="backfill-ack" className="text-sm leading-tight cursor-pointer">
                        Tôi hiểu đây là thao tác dữ liệu lịch sử và đã kiểm tra trước khi chạy.
                      </Label>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {phase === "running" && (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Đang xử lý backfill...
            </div>
          )}

          {phase === "done" && runResult && (
            <div className="space-y-4">
              <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Recon items đã tạo</span>
                  <span className="font-semibold tabular-nums">{runResult.created_recon_items}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bút toán đã ghi sổ</span>
                  <span className="font-semibold text-success tabular-nums">{runResult.posted_to_ledger}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bỏ qua (đã tồn tại)</span>
                  <span className="tabular-nums">{runResult.skipped}</span>
                </div>
                {runResult.errors.length > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Lỗi</span>
                    <span className="tabular-nums">{runResult.errors.length}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle className="h-4 w-4" />
                Hoàn tất! P&L sẽ hiển thị các khoản điều chỉnh OTA.
              </div>
            </div>
          )}

          <DialogFooter>
            {phase === "confirm" && toBridge > 0 && (
              <Button onClick={handleRun} disabled={loading || !canConfirm}>
                Chạy Backfill ({toBridge} khoản)
              </Button>
            )}
            <Button variant="outline" onClick={handleClose}>
              {phase === "done" ? "Đóng" : "Huỷ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
