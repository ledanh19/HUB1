import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
    AlertCircle,
    ExternalLink,
    Loader2,
    Pencil,
    XCircle,
    Undo2,
    Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MetaCard } from "@/components/meta";

interface BookingCaseCardProps {
    bookingId: string;
    guestName?: string;
}

// Status helpers
const caseStatusMap: Record<string, { label: string; variant: string }> = {
    OPEN: { label: "Mới", variant: "warning" },
    NEW: { label: "Mới", variant: "warning" },
    SUBMITTED: { label: "Đã gửi", variant: "warning" },
    PROCESSING: { label: "Đang xử lý", variant: "info" },
    IN_REVIEW: { label: "Đang xử lý", variant: "info" },
    RESOLVED_WIN: { label: "Đã giải quyết", variant: "success" },
    RESOLVED_LOSS: { label: "Thua", variant: "destructive" },
    WON: { label: "Đã giải quyết", variant: "success" },
    SETTLED: { label: "Đã quyết toán", variant: "success" },
    CLOSED: { label: "Đã đóng", variant: "default" },
    CANCELLED: { label: "Đã hủy", variant: "default" },
};

const caseTypeMap: Record<string, string> = {
    REFUND: "Hoàn tiền",
    DISPUTE: "Tranh chấp",
    NO_SHOW: "No-show",
    GUEST_REFUND: "Hoàn tiền khách",
    OTA_REFUND: "OTA hoàn tiền",
    OTA_WITHHOLD: "OTA giữ tiền",
    OTA_DEDUCTION: "OTA trừ tiền",
    OTA_NO_SHOW: "No-show OTA",
    OTA_COMPLAINT: "Khiếu nại OTA",
};

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(amount);

const formatDate = (dateStr: string) => {
    try {
        return new Date(dateStr).toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    } catch {
        return dateStr;
    }
};

// Helper: create booking-level audit log
async function auditBookingAction(bookingId: string, action: string, data: Record<string, unknown>) {
    try {
        const { createAuditLog } = await import("@/hooks/useAuditLog");
        await createAuditLog({
            action,
            entity: "bookings_mirror",
            entityId: bookingId,
            afterData: data,
        });
    } catch { /* audit log failure is non-critical */ }
}

export function BookingCaseCard({ bookingId, guestName }: BookingCaseCardProps) {
    const queryClient = useQueryClient();
    const [editOpen, setEditOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [editingCase, setEditingCase] = useState<any>(null);
    const [editAmount, setEditAmount] = useState("");
    const [editNote, setEditNote] = useState("");
    const [cancelReason, setCancelReason] = useState("");



    // Query cases for this booking
    const { data: cases = [], isLoading } = useQuery({
        queryKey: ["booking_cases", bookingId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("ota_disputes")
                .select("*")
                .eq("unified_booking_id", bookingId)
                .order("opened_at", { ascending: false });

            if (error) throw error;
            return data || [];
        },
        enabled: !!bookingId,
    });

    // Invalidate all related queries
    const invalidateAll = () => {
        queryClient.invalidateQueries({ queryKey: ["booking_cases", bookingId] });
        queryClient.invalidateQueries({ queryKey: ["dispute_tracking"] });
        queryClient.invalidateQueries({ queryKey: ["case_center"] });
        queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", bookingId] });
    };

    // ==================== EDIT MUTATION ====================
    const editMutation = useMutation({
        mutationFn: async (params: { id: string; amount: number; note: string; caseRecord: any }) => {
            const oldAmount = params.caseRecord.amount_requested || params.caseRecord.amount_in_dispute || 0;

            const { error } = await supabase
                .from("ota_disputes")
                .update({
                    amount_in_dispute: params.amount,
                    amount_requested: params.amount,
                    resolution_note: params.note || null,
                    last_activity_at: new Date().toISOString(),
                })
                .eq("id", params.id);

            if (error) throw error;

            // Audit log → booking history (tracking-only, no finance)
            const typeName = caseTypeMap[params.caseRecord.case_type || params.caseRecord.dispute_type]
                || params.caseRecord.dispute_type;
            await auditBookingAction(bookingId, `Sửa ${typeName}`, {
                case_id: params.id,
                old_amount: oldAmount,
                new_amount: params.amount,
                note: params.note || null,
            });
        },
        onSuccess: () => {
            invalidateAll();
            toast.success("Đã cập nhật yêu cầu");
            setEditOpen(false);
        },
        onError: (error: Error) => {
            toast.error("Lỗi: " + error.message);
        },
    });

    // ==================== CANCEL MUTATION ====================
    const cancelMutation = useMutation({
        mutationFn: async (params: { caseRecord: any; reason: string }) => {
            const c = params.caseRecord;
            const typeName = caseTypeMap[c.case_type || c.dispute_type] || c.dispute_type;
            const amount = c.amount_requested || c.amount_in_dispute || 0;

            // Soft-cancel the case (tracking-only, no finance actions)
            const { error } = await supabase
                .from("ota_disputes")
                .update({
                    case_status: "CLOSED",
                    status: "CLOSED",
                    resolution_note: `[HỦY] ${params.reason || "Hủy bởi người dùng"}${c.resolution_note ? ` | Ghi chú cũ: ${c.resolution_note}` : ""}`,
                    last_activity_at: new Date().toISOString(),
                    closed_at: new Date().toISOString(),
                })
                .eq("id", c.id);

            if (error) throw error;

            // Audit log → booking history
            await auditBookingAction(bookingId, `Hủy ${typeName}`, {
                case_id: c.id,
                case_type: c.case_type,
                dispute_type: c.dispute_type,
                amount,
                reason: params.reason,
            });
        },
        onSuccess: () => {
            invalidateAll();
            toast.success("Đã hủy yêu cầu");
            setCancelOpen(false);
            setCancelReason("");
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    // ==================== HANDLERS ====================
    const handleEdit = (c: any) => {
        setEditingCase(c);
        setEditAmount(String(c.amount_requested || c.amount_in_dispute || 0));
        setEditNote(c.resolution_note || "");
        setEditOpen(true);
    };

    const handleEditSubmit = () => {
        if (!editingCase || !editAmount) return;
        editMutation.mutate({
            id: editingCase.id,
            amount: parseFloat(editAmount),
            note: editNote,
            caseRecord: editingCase,
        });
    };

    const handleCancel = (c: any) => {
        setEditingCase(c);
        setCancelReason("");
        setCancelOpen(true);
    };

    const handleCancelConfirm = () => {
        if (!editingCase) return;
        cancelMutation.mutate({
            caseRecord: editingCase,
            reason: cancelReason,
        });
    };

    // Don't render if no cases and not loading
    if (!isLoading && cases.length === 0) return null;

    return (
        <>
            <MetaCard title="Yêu cầu & Tranh chấp" icon={Scale}>
                {isLoading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang tải...
                    </div>
                ) : (
                    <div className="space-y-3">
                        {cases.map((c: any) => {
                            const rawStatus = c.case_status || c.status;
                            const status = caseStatusMap[rawStatus] || caseStatusMap.OPEN;
                            const typeName = caseTypeMap[c.case_type || c.dispute_type] || c.dispute_type;
                            const amount = c.amount_requested || c.amount_in_dispute || 0;
                            const isOpen = ["OPEN", "NEW", "SUBMITTED", "PROCESSING", "IN_REVIEW"].includes(rawStatus);
                            const isCancelled = rawStatus === "CANCELLED";

                            return (
                                <div
                                    key={c.id}
                                    className={`rounded-lg border p-3 space-y-2 transition-colors ${isCancelled
                                        ? "opacity-60 bg-muted/20"
                                        : "hover:bg-muted/30"
                                        }`}
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {c.case_type === "REFUND" ? (
                                                <Undo2 className="h-4 w-4 text-primary" />
                                            ) : (
                                                <AlertCircle className="h-4 w-4 text-warning" />
                                            )}
                                            <span className={`text-sm font-medium ${isCancelled ? "line-through" : ""}`}>
                                                {typeName}
                                            </span>
                                            <StatusBadge variant={status.variant as any}>
                                                {status.label}
                                            </StatusBadge>
                                        </div>
                                        <span className={`text-sm font-semibold tabular-nums ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                                            {formatCurrency(amount)}
                                        </span>
                                    </div>

                                    {/* Meta */}
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                        <span>{formatDate(c.opened_at)}</span>
                                        {c.refund_channel && (
                                            <Badge variant="secondary" className="text-xs">
                                                {c.refund_channel === "DIRECT_TO_GUEST"
                                                    ? "Trực tiếp"
                                                    : "Qua OTA"}
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Note */}
                                    {c.resolution_note && (
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {c.resolution_note}
                                        </p>
                                    )}

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 pt-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs"
                                            asChild
                                        >
                                            <Link to={`/disputes/${c.id}`}>
                                                <ExternalLink className="h-3 w-3 mr-1" />
                                                Chi tiết
                                            </Link>
                                        </Button>
                                        {isOpen && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={() => handleEdit(c)}
                                                >
                                                    <Pencil className="h-3 w-3 mr-1" />
                                                    Sửa
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs text-destructive hover:text-destructive"
                                                    onClick={() => handleCancel(c)}
                                                >
                                                    <XCircle className="h-3 w-3 mr-1" />
                                                    Hủy yêu cầu
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </MetaCard>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Sửa yêu cầu</DialogTitle>
                        <DialogDescription>Cập nhật số tiền và ghi chú</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Số tiền *</Label>
                            <CurrencyInput
                                value={editAmount}
                                onChange={setEditAmount}
                                placeholder="Nhập số tiền"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Ghi chú</Label>
                            <Textarea
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                                placeholder="Lý do sửa..."
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            Đóng
                        </Button>
                        <Button
                            onClick={handleEditSubmit}
                            disabled={!editAmount || parseFloat(editAmount) <= 0 || editMutation.isPending}
                        >
                            {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Lưu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Confirm Dialog */}
            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <XCircle className="h-5 w-5" />
                            Hủy yêu cầu
                        </DialogTitle>
                        <DialogDescription>
                            Hủy yêu cầu{" "}
                            <strong>
                                {editingCase
                                    ? caseTypeMap[editingCase.case_type || editingCase.dispute_type] || editingCase.dispute_type
                                    : ""}
                            </strong>{" "}
                            — {editingCase ? formatCurrency(editingCase.amount_requested || editingCase.amount_in_dispute || 0) : ""}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        {/* Cancel reason */}
                        <div className="space-y-2">
                            <Label>Lý do hủy</Label>
                            <Textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Nhập lý do hủy yêu cầu..."
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelOpen(false)}>
                            Đóng
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleCancelConfirm}
                            disabled={cancelMutation.isPending}
                        >
                            {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Xác nhận hủy
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
