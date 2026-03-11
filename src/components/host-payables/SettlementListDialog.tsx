import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, List, Calendar, Receipt, AlertCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useHostSettlementsPaymentStats } from "@/hooks/useSettlementPaymentStats";
import { SettlementDetailDialog } from "@/components/settlement/SettlementDetailDialog";

interface Settlement {
  id: string;
  settlement_code: string;
  period_from: string;
  period_to: string;
  total_payable_amount: number;
  total_host_collected: number;
  total_paid_amount: number;
  remaining_amount: number;
  status: string;
  created_at: string;
  finalized_at?: string | null;
  finalized_by?: string | null;
  total_booking_revenue?: number;
  total_deposits_applied?: number;
  total_prepaids_applied?: number;
  note?: string;
  partner_id?: string;
}

interface SettlementListDialogProps {
  settlements: Settlement[];
  isLoading: boolean;
  partnerName?: string;
}

const formatCurrency = (amount: number | null | undefined) => {
  if (amount == null) return "0đ";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: vi });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: vi });
  } catch {
    return dateStr;
  }
};

const getSettlementStatusBadge = (status: string) => {
  switch (status) {
    case "DRAFT":
      return <Badge variant="outline" className="bg-muted">Nháp</Badge>;
    case "SETTLED":
      return <Badge className="bg-info/100">Đã chốt</Badge>;
    case "CLOSED":
      return <Badge className="bg-success">Đã đóng</Badge>;
    case "FINALIZED":
      return <Badge className="bg-success">Đã finalize</Badge>;
    case "PARTIALLY_PAID":
      return <Badge className="bg-warning/100">TT một phần</Badge>;
    case "VOID":
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">Đã hủy</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPaymentStatusBadge = (paidAmount: number, remainingAmount: number, netAmount: number) => {
  if (netAmount === 0) {
    return <Badge className="bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground">Cân bằng</Badge>;
  }
  if (paidAmount <= 0 && Math.abs(netAmount) > 0) {
    return <Badge className="bg-destructive/10 text-destructive dark:text-destructive">Chưa TT</Badge>;
  }
  if (paidAmount > 0 && remainingAmount > 0) {
    return <Badge className="bg-warning/10 text-warning dark:bg-warning/10">TT một phần</Badge>;
  }
  if (remainingAmount <= 0) {
    return <Badge className="bg-success/10 text-success">Đã TT đủ</Badge>;
  }
  return <Badge variant="outline">—</Badge>;
};

export function SettlementListDialog({ settlements, isLoading, partnerName }: SettlementListDialogProps) {
  const [open, setOpen] = useState(false);
  const [detailSettlementId, setDetailSettlementId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Load computed payment stats for all displayed settlement IDs
  const settlementIds = useMemo(
    () => settlements.filter(s => s.status !== "VOID").map(s => s.id),
    [settlements]
  );
  const { data: paymentStatsMap } = useHostSettlementsPaymentStats(open ? settlementIds : []);

  const getComputedPaid = (settlementId: string): number => {
    return paymentStatsMap?.get(settlementId)?.paid_amount ?? 0;
  };

  const calculateNet = (s: Settlement) => {
    return (s.total_payable_amount || 0) - (s.total_host_collected || 0)
      - (s.total_deposits_applied || 0) - (s.total_prepaids_applied || 0);
  };

  const getNetDirection = (s: Settlement) => {
    const net = calculateNet(s);
    return net >= 0 ? "PAY" : "RECEIVE";
  };

  const getComputedRemaining = (s: Settlement): number => {
    const net = calculateNet(s);
    const paid = getComputedPaid(s.id);
    return Math.max(0, Math.abs(net) - paid);
  };

  const handleViewDetail = (settlement: Settlement) => {
    setDetailSettlementId(settlement.id);
    setDetailDialogOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <List className="h-4 w-4" />
            Danh sách phiếu quyết toán
            {settlements.length > 0 && (
              <Badge variant="secondary" className="ml-1">{settlements.length}</Badge>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Danh sách phiếu quyết toán
              {partnerName && <span className="text-muted-foreground font-normal">- {partnerName}</span>}
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {settlements.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[130px]">Mã phiếu</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Kỳ quyết toán</TableHead>
                      <TableHead className="text-right">Công nợ Host</TableHead>
                      <TableHead className="text-right">NET</TableHead>
                      <TableHead className="text-right">Còn lại</TableHead>
                      <TableHead className="text-center">TT thanh toán</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlements.map((s) => {
                      const net = calculateNet(s);
                      const direction = getNetDirection(s);
                      const computedPaid = getComputedPaid(s.id);
                      const computedRemaining = getComputedRemaining(s);
                      return (
                        <TableRow
                          key={s.id}
                          className={`cursor-pointer hover:bg-muted/50 ${s.status === "VOID" ? "opacity-50" : ""}`}
                          onClick={() => handleViewDetail(s)}
                        >
                          <TableCell>
                            <Button variant="link" className="p-0 h-auto font-mono text-xs font-semibold text-primary">
                              {s.settlement_code}
                            </Button>
                          </TableCell>
                          <TableCell>
                            {getSettlementStatusBadge(s.status)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(s.period_from)} - {formatDate(s.period_to)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-info">
                            {formatCurrency(s.total_payable_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={`font-bold ${direction === "PAY" ? "text-info" : "text-primary"}`}>
                              {formatCurrency(Math.abs(net))}
                            </span>
                            <Badge variant="secondary" className="ml-1 text-xs">
                              {direction === "PAY" ? "RS trả" : "RS thu"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-destructive">
                            {formatCurrency(computedRemaining)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getPaymentStatusBadge(computedPaid, computedRemaining, net)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(s.finalized_at || s.created_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 border rounded-lg bg-muted/30">
                <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">Chưa có phiếu quyết toán nào.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Settlement Detail Dialog — reuses the same component as Settlement History page */}
      <SettlementDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        settlementId={detailSettlementId}
        settlementType="HOST"
      />
    </>
  );
}