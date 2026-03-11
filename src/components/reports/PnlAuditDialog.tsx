/**
 * PnlAuditDialog — P&L Consistency Audit Dialog
 * 
 * Shows a table of P&L line items with independent audit values,
 * delta, and OK/WARN status. Admin/Finance only.
 */
import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    ShieldCheck,
    Loader2,
    Copy,
    CheckCircle2,
    AlertTriangle,
    Search,
} from "lucide-react";
import { PLContract } from "@/types/finance";
import { usePnlConsistencyAudit, type AuditLineItem } from "@/hooks/usePnlConsistencyAudit";
import { toast } from "sonner";

const fmt = (n: number) =>
    new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    }).format(n);

export function PnlAuditDialog({ plData }: { plData: PLContract }) {
    const [open, setOpen] = useState(false);

    const {
        data: auditResult,
        isLoading,
        refetch,
    } = usePnlConsistencyAudit(plData, {
        enabled: open,
    });

    const handleCopyJson = () => {
        if (!auditResult) return;
        navigator.clipboard.writeText(JSON.stringify(auditResult, null, 2));
        toast.success("Đã copy JSON audit");
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Search className="h-4 w-4" />
                    Kiểm tra đối soát
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Kiểm tra đối soát P&L
                    </DialogTitle>
                    <DialogDescription>
                        Đối chiếu từng dòng P&L với bảng nguồn thực tế (operational/ledger).
                        Kỳ: {plData.period.from} → {plData.period.to}
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">
                            Đang chạy kiểm tra...
                        </span>
                    </div>
                ) : auditResult ? (
                    <div className="space-y-4">
                        {/* Overall status */}
                        <div
                            className={`flex items-center gap-2 p-3 rounded-lg border ${auditResult.overall_status === "OK"
                                    ? "bg-success/10 border-success/30 text-success"
                                    : "bg-warning/10 border-warning/30 text-warning"
                                }`}
                        >
                            {auditResult.overall_status === "OK" ? (
                                <CheckCircle2 className="h-5 w-5" />
                            ) : (
                                <AlertTriangle className="h-5 w-5" />
                            )}
                            <span className="font-medium">
                                {auditResult.overall_status === "OK"
                                    ? "Tất cả kiểm tra đều khớp ✓"
                                    : "Có sai lệch cần kiểm tra!"}
                            </span>
                            <span className="text-xs ml-auto opacity-70">
                                {new Date(auditResult.timestamp).toLocaleString("vi-VN")}
                            </span>
                        </div>

                        {/* Audit table */}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Hạng mục</TableHead>
                                    <TableHead>Nguồn</TableHead>
                                    <TableHead className="text-right">P&L</TableHead>
                                    <TableHead className="text-right">Đối soát</TableHead>
                                    <TableHead className="text-right">Delta</TableHead>
                                    <TableHead className="text-center">TT</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {auditResult.items.map((item: AuditLineItem) => (
                                    <TableRow
                                        key={item.key}
                                        className={
                                            item.status === "WARN" ? "bg-warning/5" : ""
                                        }
                                    >
                                        <TableCell className="font-medium text-sm">
                                            {item.label}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                                            {item.source}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-sm">
                                            {fmt(item.pnl_value)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-sm">
                                            {fmt(item.audit_value)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-sm">
                                            {item.delta === 0 ? (
                                                <span className="text-muted-foreground">—</span>
                                            ) : (
                                                <span
                                                    className={
                                                        item.status === "WARN"
                                                            ? "text-destructive font-semibold"
                                                            : "text-muted-foreground"
                                                    }
                                                >
                                                    {fmt(item.delta)}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {item.status === "OK" ? (
                                                <Badge
                                                    variant="outline"
                                                    className="bg-success/10 text-success border-success/30 text-xs"
                                                >
                                                    OK
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="bg-warning/10 text-warning border-warning/30 text-xs"
                                                >
                                                    WARN
                                                </Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        Nhấn "Chạy kiểm tra" để bắt đầu đối soát.
                    </div>
                )}

                <DialogFooter className="flex-row gap-2 justify-between">
                    <div className="flex gap-2">
                        {auditResult && (
                            <Button variant="outline" size="sm" onClick={handleCopyJson}>
                                <Copy className="h-4 w-4 mr-1" />
                                Copy JSON
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Search className="h-4 w-4 mr-1" />
                            )}
                            {auditResult ? "Chạy lại" : "Chạy kiểm tra"}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                            Đóng
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
