import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHostDeposits, useHostPrepaids, useCanManageDeposits, HostDeposit, HostPrepaid } from "@/hooks/useHostDeposits";
import { ApplyDepositDialog } from "./ApplyDepositDialog";
import { ApplyPrepaidDialog } from "./ApplyPrepaidDialog";
import { RefundDepositDialog } from "./RefundDepositDialog";
import { Plus, Info, ArrowRight, Undo2, Wallet, CreditCard, Receipt } from "lucide-react";
import { format } from "date-fns";

interface HostPayableDetailSectionProps {
  payableId: string;
  partnerId: string;
  unifiedBookingId: string;
  totalAmount: number;
  paidAmount: number;
  appliedDepositAmount: number;
  appliedPrepaidAmount: number;
  hasCheckedOut: boolean;
}

export function HostPayableDetailSection({
  payableId,
  partnerId,
  unifiedBookingId,
  totalAmount,
  paidAmount,
  appliedDepositAmount,
  appliedPrepaidAmount,
  hasCheckedOut,
}: HostPayableDetailSectionProps) {
  const [selectedDeposit, setSelectedDeposit] = useState<HostDeposit | null>(null);
  const [selectedPrepaid, setSelectedPrepaid] = useState<HostPrepaid | null>(null);
  const [showApplyDeposit, setShowApplyDeposit] = useState(false);
  const [showApplyPrepaid, setShowApplyPrepaid] = useState(false);
  const [showRefundDeposit, setShowRefundDeposit] = useState(false);

  const { data: deposits = [] } = useHostDeposits(unifiedBookingId);
  const { data: prepaids = [] } = useHostPrepaids(unifiedBookingId);
  const { data: canManage } = useCanManageDeposits();

  const heldDeposits = deposits.filter(d => d.status === "HELD");
  const openPrepaids = prepaids.filter(p => p.prepaid_status === "OPEN");

  const totalDepositsHeld = heldDeposits.reduce((sum, d) => sum + d.deposit_amount, 0);
  const totalPrepaidsOpen = openPrepaids.reduce((sum, p) => sum + p.prepaid_amount, 0);
  const totalApplied = appliedDepositAmount + appliedPrepaidAmount;
  const remainingPayable = totalAmount - paidAmount - totalApplied;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
  };

  const getApprovalStatusBadge = (approvalStatus: string) => {
    switch (approvalStatus) {
      case "PENDING": return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Chờ duyệt</Badge>;
      case "APPROVED": return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Đã duyệt - Chờ chi</Badge>;
      case "REJECTED": return <Badge variant="destructive">Từ chối</Badge>;
      case "PAID": return <Badge variant="outline" className="bg-success/10 text-success border-success/20">Đã chi tiền</Badge>;
      default: return <Badge variant="secondary">{approvalStatus}</Badge>;
    }
  };

  const getDepositStatusBadge = (status: string) => {
    switch (status) {
      case "HELD": return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Đang giữ</Badge>;
      case "OFFSET": return <Badge variant="outline" className="bg-info/10 text-info border-info/20">Đã cấn trừ</Badge>;
      case "REFUNDED": return <Badge variant="outline" className="bg-success/10 text-success border-success/20">Đã hoàn</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPrepaidStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN": return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Chờ cấn trừ</Badge>;
      case "APPLIED": return <Badge variant="outline" className="bg-info/10 text-info border-info/20">Đã cấn trừ</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Tổng hợp công nợ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <TooltipProvider>
              <div className="text-center p-3 bg-muted rounded-lg">
                <Tooltip>
                  <TooltipTrigger className="w-full">
                    <p className="text-xs text-muted-foreground">Tổng phải trả</p>
                    <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Payable là khoản phải trả sau trả phòng</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="text-center p-3 bg-warning/10 rounded-lg">
                <Tooltip>
                  <TooltipTrigger className="w-full">
                    <p className="text-xs text-warning">Deposit đang giữ</p>
                    <p className="text-lg font-bold text-warning">{formatCurrency(totalDepositsHeld)}</p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Deposit là tài sản tạm giữ - không phải chi phí</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="text-center p-3 bg-warning/10 rounded-lg">
                <Tooltip>
                  <TooltipTrigger className="w-full">
                    <p className="text-xs text-warning">Prepaid chờ cấn trừ</p>
                    <p className="text-lg font-bold text-warning">{formatCurrency(totalPrepaidsOpen)}</p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Prepaid là chi trả trước - sẽ cấn trừ sau trả phòng</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="text-center p-3 bg-info/10 rounded-lg">
                <p className="text-xs text-info">Đã cấn trừ</p>
                <p className="text-lg font-bold text-info">{formatCurrency(totalApplied)}</p>
              </div>

              <div className="text-center p-3 bg-primary/10 rounded-lg">
                <p className="text-xs text-primary">Còn phải thanh toán</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(remainingPayable)}</p>
              </div>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Deposits Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Đặt cọc Host (Deposit)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Deposit là tài sản tạm giữ - tiền Roomrise đặt cọc cho Host. Không phải chi phí, không phải công nợ.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            {canManage && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/payments/requests?openCreate=HOST_DEPOSIT&partnerId=${partnerId}&bookingId=${unifiedBookingId}`}>
                  <Plus className="h-4 w-4 mr-1" /> Tạo đặt cọc
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {deposits.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Chưa có đặt cọc</p>
          ) : (
            <div className="space-y-2">
              {deposits.map((deposit) => (
                <div key={deposit.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {getApprovalStatusBadge(deposit.approval_status)}
                        {deposit.approval_status === "PAID" && getDepositStatusBadge(deposit.status)}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">{formatCurrency(deposit.deposit_amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(deposit.deposit_date), "dd/MM/yyyy")}
                        {deposit.partner?.partner_name && ` • ${deposit.partner.partner_name}`}
                        {deposit.note && ` • ${deposit.note}`}
                      </p>
                      {deposit.rejection_note && (
                        <p className="text-xs text-destructive">Lý do từ chối: {deposit.rejection_note}</p>
                      )}
                      {deposit.approved_at && deposit.approval_status !== "PENDING" && (
                        <p className="text-xs text-muted-foreground">
                          {deposit.approval_status === "PAID" ? "Đã chi" : "Duyệt"}: {format(new Date(deposit.approved_at), "dd/MM/yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                  </div>
                  {canManage && deposit.approval_status === "PAID" && deposit.status === "HELD" && hasCheckedOut && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedDeposit(deposit);
                          setShowApplyDeposit(true);
                        }}
                      >
                        <ArrowRight className="h-4 w-4 mr-1" /> Cấn trừ
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedDeposit(deposit);
                          setShowRefundDeposit(true);
                        }}
                      >
                        <Undo2 className="h-4 w-4 mr-1" /> Hoàn
                      </Button>
                    </div>
                  )}
                  {!hasCheckedOut && deposit.approval_status === "PAID" && deposit.status === "HELD" && (
                    <span className="text-xs text-muted-foreground">Chờ trả phòng để cấn trừ</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prepaids Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Trả trước Host (Prepaid)
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Prepaid là chi trả trước cho Host - chưa phải công nợ, sẽ được cấn trừ vào payable sau trả phòng.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            {canManage && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/payments/requests?openCreate=HOST_PREPAID&partnerId=${partnerId}&bookingId=${unifiedBookingId}`}>
                  <Plus className="h-4 w-4 mr-1" /> Tạo trả trước
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {prepaids.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Chưa có trả trước</p>
          ) : (
            <div className="space-y-2">
              {prepaids.map((prepaid) => (
                <div key={prepaid.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {getApprovalStatusBadge(prepaid.approval_status)}
                        {prepaid.approval_status === "PAID" && getPrepaidStatusBadge(prepaid.prepaid_status)}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium">{formatCurrency(prepaid.prepaid_amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {prepaid.paid_at && format(new Date(prepaid.paid_at), "dd/MM/yyyy HH:mm")}
                        {prepaid.partner?.partner_name && ` • ${prepaid.partner.partner_name}`}
                        {prepaid.note && ` • ${prepaid.note}`}
                      </p>
                      {prepaid.rejection_note && (
                        <p className="text-xs text-destructive">Lý do từ chối: {prepaid.rejection_note}</p>
                      )}
                      {prepaid.approved_at && prepaid.approval_status !== "PENDING" && (
                        <p className="text-xs text-muted-foreground">
                          {prepaid.approval_status === "PAID" ? "Đã chi" : "Duyệt"}: {format(new Date(prepaid.approved_at), "dd/MM/yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                  </div>
                  {canManage && prepaid.approval_status === "PAID" && prepaid.prepaid_status === "OPEN" && hasCheckedOut && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPrepaid(prepaid);
                        setShowApplyPrepaid(true);
                      }}
                    >
                      <ArrowRight className="h-4 w-4 mr-1" /> Cấn trừ
                    </Button>
                  )}
                  {!hasCheckedOut && prepaid.approval_status === "PAID" && prepaid.prepaid_status === "OPEN" && (
                    <span className="text-xs text-muted-foreground">Chờ trả phòng để cấn trừ</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ApplyDepositDialog
        open={showApplyDeposit}
        onOpenChange={setShowApplyDeposit}
        deposit={selectedDeposit}
        payableId={payableId}
        payableRemaining={remainingPayable}
        isCheckedOut={hasCheckedOut}
        bookingPartnerId={partnerId}
      />

      <ApplyPrepaidDialog
        open={showApplyPrepaid}
        onOpenChange={setShowApplyPrepaid}
        prepaid={selectedPrepaid}
        payableId={payableId}
        payableRemaining={remainingPayable}
        isCheckedOut={hasCheckedOut}
        bookingPartnerId={partnerId}
      />

      <RefundDepositDialog
        open={showRefundDeposit}
        onOpenChange={setShowRefundDeposit}
        deposit={selectedDeposit}
      />
    </div>
  );
}
