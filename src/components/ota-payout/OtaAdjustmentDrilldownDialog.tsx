import { useState } from "react";
import { AppLink } from "@/components/system/AppLink";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Loader2,
    CheckCircle,
    ExternalLink,
    Scale,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Lock,
} from "lucide-react";
import { useOtaAdjustmentDrilldown } from "@/hooks/useOtaAdjustmentDrilldown";
import { ADJ_CATEGORY_LABELS } from "@/hooks/useOtaPayoutReconciliation";
import { formatCurrencyVND } from "@/lib/finance-formatters";
import { usePermissions } from "@/hooks/useAuth";

const ALL_CATEGORIES = [
    "DISPUTE_WIN",
    "DISPUTE_LOSS",
    "OTA_PENALTY",
    "OTA_COMPENSATION",
    "OTA_ROUNDING_FX",
    "OTA_UNDERPAYMENT",
    "OTA_ADJUSTMENT_OTHER",
] as const;

interface OtaAdjustmentDrilldownDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dateRange: { start: string; end: string } | null;
    defaultCategory?: string | null;
    /** P&L totals for tie-out comparison */
    plTotals?: { otaAdjNet: number } | null;
}

export function OtaAdjustmentDrilldownDialog({
    open,
    onOpenChange,
    dateRange,
    defaultCategory,
    plTotals,
}: OtaAdjustmentDrilldownDialogProps) {
    const { isFinanceRole, isAdmin } = usePermissions();
    const canViewDisputes = isFinanceRole || isAdmin;

    const [selectedCategory, setSelectedCategory] = useState<string | null>(
        defaultCategory || null
    );
    const [page, setPage] = useState(0);

    // Re-sync when defaultCategory changes (dialog opening with new category)
    const [lastDefault, setLastDefault] = useState(defaultCategory);
    if (defaultCategory !== lastDefault) {
        setLastDefault(defaultCategory);
        setSelectedCategory(defaultCategory || null);
        setPage(0); // Reset page on category change
    }

    const { data, isLoading } = useOtaAdjustmentDrilldown(
        open ? dateRange : null,
        selectedCategory,
        page
    );

    const rows = data?.rows || [];
    const totals = data?.totals;

    // Tie-out check: compare dialog total with P&L total
    const tieOutOk =
        !plTotals ||
        !totals ||
        selectedCategory !== null || // Only check tie-out for "all" view
        Math.abs(plTotals.otaAdjNet - totals.total_net) <= 1;

    const formatDate = (d: string | null) => {
        if (!d) return "—";
        return new Date(d).toLocaleDateString("vi-VN");
    };

    const handleCategoryChange = (cat: string | null) => {
        setSelectedCategory(cat);
        setPage(0);
    };

    const totalPages = data ? Math.ceil(data.totalCount / data.pageSize) : 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Scale className="h-5 w-5" />
                        Chi tiết điều chỉnh OTA Payout
                    </DialogTitle>
                </DialogHeader>

                {/* Category filter chips */}
                <div className="flex flex-wrap gap-2 mb-4">
                    <Button
                        variant={selectedCategory === null ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => handleCategoryChange(null)}
                    >
                        Tất cả
                    </Button>
                    {ALL_CATEGORIES.map((cat) => (
                        <Button
                            key={cat}
                            variant={selectedCategory === cat ? "default" : "outline"}
                            size="sm"
                            className="text-xs"
                            onClick={() => handleCategoryChange(selectedCategory === cat ? null : cat)}
                        >
                            {ADJ_CATEGORY_LABELS[cat] || cat}
                        </Button>
                    ))}
                </div>

                {/* Summary bar with tie-out */}
                {totals && (
                    <div className="space-y-2">
                        <div className={`flex items-center gap-2 p-2 rounded-md text-xs font-mono ${totals.total_net >= 0 ? "bg-success/10 border border-success/30" : "bg-destructive/10 border border-destructive/30"
                            }`}>
                            <CheckCircle className={`h-4 w-4 shrink-0 ${totals.total_net >= 0 ? "text-success" : "text-destructive"}`} />
                            <span className="flex-1">
                                {rows.length} dòng{data?.capped ? ` (trang ${page + 1}/${totalPages}, tổng ${data.totalCount})` : ""} | Tổng: {totals.total_net >= 0 ? "+" : ""}{formatCurrencyVND(totals.total_net)}
                            </span>
                        </div>

                        {/* Tie-out check */}
                        {!tieOutOk && plTotals && (
                            <div className="flex items-center gap-2 p-2 rounded-md text-xs bg-warning/10 border border-warning/30">
                                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                                <span>
                                    Lệch dữ liệu: P&L = {formatCurrencyVND(plTotals.otaAdjNet)},
                                    Dialog = {formatCurrencyVND(totals.total_net)}.
                                    Kiểm tra join/type/cast.
                                </span>
                            </div>
                        )}

                        {/* Join mismatch warning */}
                        {data?.joinMismatch && (
                            <div className="flex items-center gap-2 p-2 rounded-md text-xs bg-warning/10 border border-warning/30">
                                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                                <span>
                                    {data.ledgerCount} bút toán, chỉ {data.joinedCount} khớp reconciliation.
                                    {data.ledgerCount - data.joinedCount} dòng thiếu liên kết.
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Table */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        Không có dòng điều chỉnh nào trong kỳ này
                        {selectedCategory ? ` (${ADJ_CATEGORY_LABELS[selectedCategory] || selectedCategory})` : ""}.
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[90px]">Ngày</TableHead>
                                <TableHead className="w-[90px]">Ngày PS</TableHead>
                                <TableHead>Phân loại</TableHead>
                                <TableHead>Hướng</TableHead>
                                <TableHead className="text-right">Số tiền</TableHead>
                                <TableHead className="max-w-[200px]">Ghi chú</TableHead>
                                <TableHead>Payout</TableHead>
                                <TableHead>Case</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.ledger_id}>
                                    <TableCell className="text-xs tabular-nums">
                                        {formatDate(row.entry_date)}
                                    </TableCell>
                                    <TableCell className="text-xs tabular-nums">
                                        {row.economic_date ? (
                                            <span className="flex items-center gap-1">
                                                {formatDate(row.economic_date)}
                                                {row.is_prior_period && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning/10 text-warning border border-warning/30">
                                                        Kỳ trước
                                                    </span>
                                                )}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge
                                            variant={
                                                row.adj_category === "DISPUTE_WIN" ? "success" :
                                                    row.adj_category === "DISPUTE_LOSS" || row.adj_category === "OTA_PENALTY" ? "danger" :
                                                        row.adj_category === "OTA_COMPENSATION" ? "info" :
                                                            "default"
                                            }
                                            size="sm"
                                        >
                                            {ADJ_CATEGORY_LABELS[row.adj_category || ""] || row.adj_category || "—"}
                                        </StatusBadge>
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge
                                            variant={row.direction === "DEBIT" ? "success" : "danger"}
                                            size="sm"
                                        >
                                            {row.direction === "DEBIT" ? "Thu" : "Chi"}
                                        </StatusBadge>
                                    </TableCell>
                                    <TableCell className={`text-right font-semibold tabular-nums ${row.direction === "DEBIT" ? "text-success" : "text-destructive"
                                        }`}>
                                        {row.direction === "DEBIT" ? "+" : "-"}{formatCurrencyVND(row.amount)}
                                    </TableCell>
                                    <TableCell className="text-xs max-w-[200px] truncate">
                                        {row.note || "—"}
                                    </TableCell>
                                    <TableCell>
                                        {row.payout_id ? (
                                            <Button variant="ghost" size="sm" className="text-xs p-0 h-auto" asChild>
                                                <AppLink to={`/ota-payouts/${row.payout_id}`}>
                                                    <ExternalLink className="h-3 w-3 mr-1" />
                                                    {row.ota_source || "Xem"}
                                                    {row.provider_payout_id ? ` #${row.provider_payout_id}` : ""}
                                                </AppLink>
                                            </Button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {row.dispute_id ? (
                                            canViewDisputes ? (
                                                <Button variant="ghost" size="sm" className="text-xs p-0 h-auto" asChild>
                                                    <AppLink to={`/disputes/${row.dispute_id}`}>
                                                        <ExternalLink className="h-3 w-3 mr-1" />
                                                        Case
                                                    </AppLink>
                                                </Button>
                                            ) : (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-not-allowed">
                                                                <Lock className="h-3 w-3" />
                                                                Case
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            Không đủ quyền xem tranh chấp
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                {/* Pagination */}
                {data && totalPages > 1 && (
                    <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-xs text-muted-foreground">
                            Trang {page + 1} / {totalPages} ({data.totalCount} dòng)
                        </span>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 0}
                                onClick={() => setPage(p => p - 1)}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= totalPages - 1}
                                onClick={() => setPage(p => p + 1)}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
