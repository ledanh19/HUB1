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
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import {
  useUpdatePaymentRequest,
  PaymentRequest,
  PaymentRequestType,
  ExpenseCategory,
  paymentRequestTypeLabels,
  expenseCategoryLabels,
} from "@/hooks/usePaymentRequests";

interface EditPaymentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PaymentRequest | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);

export function EditPaymentRequestDialog({
  open,
  onOpenChange,
  request,
}: EditPaymentRequestDialogProps) {
  const updateRequest = useUpdatePaymentRequest();

  const [proposedAmount, setProposedAmount] = useState("");
  const [differenceReason, setDifferenceReason] = useState("");
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("OTHER");
  const [recipientName, setRecipientName] = useState("");
  const [recipientUnit, setRecipientUnit] = useState("");
  const [note, setNote] = useState("");

  const isPending = request?.status === "PENDING";
  const isApproved = request?.status === "APPROVED";
  const canEdit = isPending || isApproved;

  // Populate form when request changes
  useEffect(() => {
    if (request) {
      setProposedAmount(String(request.proposed_amount || 0));
      setDifferenceReason(request.difference_reason || "");
      setExpenseCategory((request.expense_category as ExpenseCategory) || "OTHER");
      setRecipientName(request.recipient_name || "");
      setRecipientUnit(request.recipient_unit || "");
      setNote(request.note || "");
    }
  }, [request]);

  if (!request) return null;

  const proposedAmountNum = parseFloat(proposedAmount) || 0;
  const sourceAmount = request.source_amount || 0;
  const differenceAmount = proposedAmountNum - sourceAmount;
  const isSettlementBased = request.payment_type === "HOST_PAYMENT" || request.payment_type === "SERVICE_PARTNER_PAYMENT";

  const handleSubmit = async () => {
    if (!canEdit) return;

    const params: Record<string, any> = { requestId: request.id };

    if (isPending) {
      params.proposed_amount = proposedAmountNum;
      params.difference_reason = differenceReason || undefined;

      if (request.payment_type === "INTERNAL_EXPENSE") {
        params.expense_category = expenseCategory;
        params.recipient_name = recipientName || undefined;
      }
      if (request.payment_type === "OTA_COMMISSION") {
        params.recipient_unit = recipientUnit || undefined;
      }
    }

    params.note = note || undefined;

    try {
      await updateRequest.mutateAsync(params as any);
      onOpenChange(false);
    } catch {
      // handled in mutation
    }
  };

  const LockedField = ({ label, value }: { label: string; value: string }) => (
    <div className="space-y-1">
      <Label className="flex items-center gap-1.5 text-muted-foreground">
        <Lock className="h-3 w-3" />
        {label}
      </Label>
      <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">{value}</div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa đề xuất thanh toán</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span>{request.request_code}</span>
            <Badge variant="outline">
              {isPending ? "Chờ duyệt — Sửa đầy đủ" : isApproved ? "Đã duyệt — Chỉ sửa ghi chú" : "Không thể sửa"}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Locked: payment type */}
          <LockedField label="Loại chi" value={paymentRequestTypeLabels[request.payment_type]} />

          {/* Locked: partner */}
          {request.partner_name && (
            <LockedField label="Đối tác" value={request.partner_name} />
          )}

          {/* Locked: settlement */}
          {request.settlement_code && (
            <LockedField label="Phiếu quyết toán" value={request.settlement_code} />
          )}

          {/* Source amount (read-only reference) */}
          {isSettlementBased && sourceAmount > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Số tiền theo căn cứ (còn lại chưa chi):</p>
              <p className="text-lg tabular-nums font-semibold tracking-tight">{formatCurrency(sourceAmount)}</p>
            </div>
          )}

          {/* Expense Category - only PENDING + INTERNAL_EXPENSE */}
          {request.payment_type === "INTERNAL_EXPENSE" && (
            isPending ? (
              <div className="space-y-2">
                <Label>Danh mục chi *</Label>
                <Select value={expenseCategory} onValueChange={(v) => setExpenseCategory(v as ExpenseCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(expenseCategoryLabels)
                      .filter(([key]) => key !== "OTA_COMMISSION")
                      .map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <LockedField label="Danh mục chi" value={expenseCategoryLabels[request.expense_category as ExpenseCategory] || "-"} />
            )
          )}

          {/* OTA Channel - only PENDING + OTA_COMMISSION */}
          {request.payment_type === "OTA_COMMISSION" && (
            isPending ? (
              <div className="space-y-2">
                <Label>Kênh OTA</Label>
                <Select value={recipientUnit} onValueChange={setRecipientUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Agoda">Agoda</SelectItem>
                    <SelectItem value="Booking.com">Booking.com</SelectItem>
                    <SelectItem value="Airbnb">Airbnb</SelectItem>
                    <SelectItem value="Expedia">Expedia</SelectItem>
                    <SelectItem value="Traveloka">Traveloka</SelectItem>
                    <SelectItem value="Trip.com">Trip.com</SelectItem>
                    <SelectItem value="Khác">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <LockedField label="Kênh OTA" value={request.recipient_unit || "-"} />
            )
          )}

          {/* Recipient Name - PENDING + INTERNAL_EXPENSE */}
          {request.payment_type === "INTERNAL_EXPENSE" && (
            isPending ? (
              <div className="space-y-2">
                <Label>Người nhận tiền</Label>
                <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Tên người/đơn vị nhận" />
              </div>
            ) : request.recipient_name ? (
              <LockedField label="Người nhận" value={request.recipient_name} />
            ) : null
          )}

          {/* Proposed Amount */}
          {isPending ? (
            <div className="space-y-2">
              <Label>Số tiền đề xuất chi *</Label>
              <CurrencyInput
                value={proposedAmount}
                onChange={setProposedAmount}
                placeholder="0"
              />
            </div>
          ) : (
            <LockedField label="Số tiền đề xuất chi" value={formatCurrency(request.proposed_amount)} />
          )}

          {/* Difference display (PENDING + settlement-based) */}
          {isPending && isSettlementBased && sourceAmount > 0 && proposedAmountNum > 0 && differenceAmount !== 0 && (
            <div className="p-3 border rounded-lg border-warning/30 bg-warning/5 space-y-2">
              <p className="text-sm font-medium text-warning">
                Chênh lệch: {differenceAmount > 0 ? "+" : ""}{formatCurrency(differenceAmount)}
              </p>
              <div className="space-y-1">
                <Label>Lý do chênh lệch *</Label>
                <Textarea
                  placeholder="Nhập lý do tại sao số tiền đề xuất khác với số tiền theo căn cứ"
                  value={differenceReason}
                  onChange={(e) => setDifferenceReason(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Note - always editable when canEdit */}
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              placeholder="Ghi chú thêm (không bắt buộc)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={updateRequest.isPending || !canEdit}>
            {updateRequest.isPending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
