import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Loader2, Link2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface LinkCaseModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    unifiedBookingId: string;
    payoutId: string;
    /** Context: are we linking from a booking line or a deduction line? */
    context: "booking" | "deduction";
    /** If linking from deduction, pass the deduction info for display */
    deductionInfo?: { type: string; amount: number };
    onLinked?: () => void;
}

interface CaseRow {
    id: string;
    case_type: string;
    case_status: string;
    amount_requested: number;
    amount_approved: number;
    dispute_type: string;
    payout_id: string | null;
    currency: string;
}

const CASE_STATUS_LABELS: Record<string, string> = {
    DRAFT: "Nháp",
    SUBMITTED: "Đã gửi",
    UNDER_REVIEW: "Đang xem xét",
    APPROVED: "Đã duyệt",
    SETTLED: "Đã quyết toán",
    REJECTED: "Từ chối",
    CLOSED: "Đã đóng",
};

const STATUS_VARIANT: Record<string, string> = {
    DRAFT: "default",
    SUBMITTED: "info",
    UNDER_REVIEW: "warning",
    APPROVED: "success",
    SETTLED: "success",
    REJECTED: "danger",
    CLOSED: "default",
};

export function LinkCaseModal({
    open,
    onOpenChange,
    unifiedBookingId,
    payoutId,
    context,
    deductionInfo,
    onLinked,
}: LinkCaseModalProps) {
    const [cases, setCases] = useState<CaseRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [linking, setLinking] = useState(false);
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !unifiedBookingId) return;
        setLoading(true);
        setSelectedCaseId(null);

        supabase
            .from("ota_disputes")
            .select("id, case_type, case_status, amount_requested, amount_approved, dispute_type, payout_id, currency")
            .eq("unified_booking_id", unifiedBookingId)
            .not("case_status", "eq", "CLOSED")
            .order("created_at", { ascending: false })
            .then(({ data, error }) => {
                if (error) {
                    toast.error("Không tải được danh sách case");
                    setCases([]);
                } else {
                    setCases((data || []) as any as CaseRow[]);
                }
                setLoading(false);
            });
    }, [open, unifiedBookingId]);

    const handleLink = async () => {
        if (!selectedCaseId) return;
        setLinking(true);

        try {
            const { error } = await supabase
                .from("ota_disputes")
                .update({
                    payout_id: payoutId,
                    last_activity_at: new Date().toISOString(),
                } as any)
                .eq("id", selectedCaseId);

            if (error) throw error;

            toast.success("Đã link case với payout thành công");
            onOpenChange(false);
            onLinked?.();
        } catch (err: any) {
            toast.error("Lỗi link case: " + (err.message || "Unknown"));
        } finally {
            setLinking(false);
        }
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-primary" />
                        Link Case với Payout
                    </DialogTitle>
                </DialogHeader>

                <div className="text-xs text-muted-foreground mb-2">
                    Booking: <span className="font-mono">{unifiedBookingId.slice(0, 16)}...</span>
                    {context === "deduction" && deductionInfo && (
                        <span className="ml-2">
                            | Deduction: {deductionInfo.type} {formatCurrency(deductionInfo.amount)}
                        </span>
                    )}
                </div>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : cases.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        Không có case nào cho booking này (hoặc tất cả đã CLOSED)
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {cases.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setSelectedCaseId(c.id)}
                                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedCaseId === c.id
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:bg-muted/50"
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <StatusBadge
                                            variant={c.case_type === "REFUND" ? "warning" : "info"}
                                            size="sm"
                                        >
                                            {c.case_type === "REFUND" ? "Hoàn tiền" : "Tranh chấp"}
                                        </StatusBadge>
                                        <StatusBadge
                                            variant={(STATUS_VARIANT[c.case_status] || "default") as any}
                                            size="sm"
                                        >
                                            {CASE_STATUS_LABELS[c.case_status] || c.case_status}
                                        </StatusBadge>
                                        {selectedCaseId === c.id && (
                                            <CheckCircle className="h-4 w-4 text-primary" />
                                        )}
                                    </div>
                                    {c.payout_id && (
                                        <span className="text-xs text-amber-600">
                                            Đã link payout khác
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground font-mono">{c.id.slice(0, 12)}...</span>
                                    <span className="font-medium">
                                        {formatCurrency(c.amount_requested)}
                                        {c.amount_approved > 0 && (
                                            <span className="text-emerald-600 ml-1">(duyệt: {formatCurrency(c.amount_approved)})</span>
                                        )}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Hủy
                    </Button>
                    <Button
                        onClick={handleLink}
                        disabled={!selectedCaseId || linking}
                    >
                        {linking && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Link Case
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
