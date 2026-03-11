import { useState, useMemo } from "react";
import { buildWaterfallAllocation } from "@/lib/buildWaterfallAllocation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { OtaBadge } from "@/components/ui/ota-badge";
import { Loader2, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { useOtaPayoutsForCashIn, useRecordMultiPayoutCashIn, OTA_PAYMENT_METHODS, UPC_CHANNELS } from "@/hooks/useOtaPayoutCashIn";
import { useCashAccountOptions } from "@/hooks/useCashAccounts";
import { OTA_SOURCES } from "@/hooks/useOtaPayouts";
import { useCreateReconciliationItem, RECONCILIATION_ITEM_TYPES, ReconciliationItemType } from "@/hooks/useOtaPayoutReconciliation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN");
};

interface RecordMultiPayoutCashInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecordMultiPayoutCashInDialog({
  open,
  onOpenChange,
}: RecordMultiPayoutCashInDialogProps) {
  const [otaSourceFilter, setOtaSourceFilter] = useState("");
  const [payoutSearch, setPayoutSearch] = useState("");
  const [selectedPayoutIds, setSelectedPayoutIds] = useState<Set<string>>(new Set());
  const [totalAmount, setTotalAmount] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [paymentChannel, setPaymentChannel] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [differenceType, setDifferenceType] = useState<ReconciliationItemType | "">("");
  const [differenceNote, setDifferenceNote] = useState("");

  const { data: availablePayouts = [], isLoading: loadingPayouts } = useOtaPayoutsForCashIn();
  const { options: cashAccountOptions, isLoading: loadingAccounts } = useCashAccountOptions();
  const recordMultiCashIn = useRecordMultiPayoutCashIn();
  const createReconciliation = useCreateReconciliationItem();

  // Filter payouts by OTA source
  const filteredPayouts = useMemo(() => {
    if (!otaSourceFilter) return [];
    let results = availablePayouts.filter((p) => p.ota_source === otaSourceFilter);
    if (payoutSearch.trim()) {
      const q = payoutSearch.toLowerCase();
      results = results.filter((p) =>
        (p.ota_property_id && p.ota_property_id.toLowerCase().includes(q)) ||
        (p.provider_payout_id && p.provider_payout_id.toLowerCase().includes(q)) ||
        (p.payout_period_from && p.payout_period_from.includes(q)) ||
        (p.payout_period_to && p.payout_period_to.includes(q))
      );
    }
    return results;
  }, [availablePayouts, otaSourceFilter, payoutSearch]);

  // Clear selection when source changes
  const handleSourceChange = (source: string) => {
    setOtaSourceFilter(source);
    setSelectedPayoutIds(new Set());
    setTotalAmount("");
    setPayoutSearch("");
  };

  // Selected payouts data — sorted oldest-first for deterministic waterfall
  // Business rule: oldest payout_date first.
  // If finance later defines a different settlement priority field,
  // update only the sort in buildWaterfallAllocation.
  const selectedPayouts = useMemo(
    () => availablePayouts
      .filter((p) => selectedPayoutIds.has(p.id))
      .sort((a, b) => {
        const dateA = a.payout_date || "";
        const dateB = b.payout_date || "";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return a.id.localeCompare(b.id);
      }),
    [availablePayouts, selectedPayoutIds]
  );

  const totalSelectedRemaining = selectedPayouts.reduce((sum, p) => sum + p.remaining_amount, 0);

  // Auto-allocate via deterministic waterfall (pure function, testable)
  // All selected payouts always appear in result, even with amount=0
  const allocation = useMemo(
    () => buildWaterfallAllocation(
      selectedPayouts.map((p) => ({
        id: p.id,
        payout_date: p.payout_date,
        remaining_amount: p.remaining_amount,
      })),
      Number(totalAmount) || 0
    ),
    [totalAmount, selectedPayouts]
  );

  const totalAllocated = allocation.reduce((s, a) => s + a.amount, 0);
  const hasAnyAllocation = allocation.some((a) => a.amount > 0);
  const hasZeroAllocations = allocation.some((a) => a.amount === 0) && allocation.length > 0 && (Number(totalAmount) || 0) > 0;

  const togglePayout = (payoutId: string) => {
    setSelectedPayoutIds((prev) => {
      const next = new Set(prev);
      if (next.has(payoutId)) next.delete(payoutId);
      else next.add(payoutId);
      return next;
    });
  };

  // Difference computation
  const differenceAmount = useMemo(() => {
    if (selectedPayoutIds.size === 0 || !totalAmount) return 0;
    return Math.max(0, totalSelectedRemaining - (Number(totalAmount) || 0));
  }, [totalSelectedRemaining, totalAmount, selectedPayoutIds]);

  const hasDifference = differenceAmount > 0 && Number(totalAmount) > 0;
  const isBankFeeSuggested = hasDifference && differenceAmount <= 10000;
  const needsDifferenceClassification = hasDifference && differenceType !== "UNDERPAYMENT";
  const differenceClassified = !hasDifference || !!differenceType;
  const needsDifferenceNote = differenceType === "OTHER" || differenceType === "MANUAL_ADJUSTMENT";

  const handleSubmit = async () => {
    const total = Number(totalAmount);
    if (!cashAccountId || !total || total <= 0 || selectedPayoutIds.size === 0) return;
    if (hasDifference && !differenceType) return;
    if (needsDifferenceNote && !differenceNote.trim()) return;

    // Build allocations from only those with amount > 0
    const validAllocations = allocation
      .filter((alloc) => alloc.amount > 0)
      .map((alloc) => ({ payout_id: alloc.payoutId, amount: alloc.amount }));

    if (validAllocations.length === 0) return;

    setIsSubmitting(true);
    try {
      await recordMultiCashIn.mutateAsync({
        allocations: validAllocations,
        total_amount: total,
        cash_account_id: cashAccountId,
        received_date: receivedDate,
        payment_method: paymentMethod,
        payment_channel: paymentMethod === "UPC" ? paymentChannel : null,
        reference: reference || null,
        note: note || null,
      });

      // If there's a classified difference (not UNDERPAYMENT), create reconciliation items
      // FIX: Distribute by SHORTFALL (remaining - allocated) not proportional-to-allocation.
      // This ensures the payout that absorbed the shortfall in the waterfall gets the
      // matching bank fee, so received + bank_fee >= expected and status becomes RECEIVED.
      if (hasDifference && differenceType && differenceType !== "UNDERPAYMENT") {
        // Calculate shortfall per payout: how much each payout is short after allocation
        const shortfalls = validAllocations.map((alloc) => {
          const payout = selectedPayouts.find(p => p.id === alloc.payout_id);
          const remaining = payout?.remaining_amount || 0;
          return { payout_id: alloc.payout_id, shortfall: Math.max(0, remaining - alloc.amount) };
        });
        const totalShortfall = shortfalls.reduce((s, x) => s + x.shortfall, 0);

        for (const sf of shortfalls) {
          // Distribute differenceAmount proportionally to shortfall share
          const payoutDiff = totalShortfall > 0
            ? (sf.shortfall / totalShortfall) * differenceAmount
            : 0;
          if (payoutDiff > 0) {
            try {
              await createReconciliation.mutateAsync({
                payout_id: sf.payout_id,
                item_type: differenceType as ReconciliationItemType,
                amount: Math.round(payoutDiff),
                note: differenceNote || `Chênh lệch ${RECONCILIATION_ITEM_TYPES.find(t => t.value === differenceType)?.label || differenceType}`,
              });
            } catch {
              // Individual reconciliation failure shouldn't block the whole operation
            }
          }
        }
      }

      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      // Error toast already shown by mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setOtaSourceFilter("");
    setSelectedPayoutIds(new Set());
    setTotalAmount("");
    setReceivedDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("BANK_TRANSFER");
    setPaymentChannel("");
    setReference("");
    setNote("");
    setCashAccountId("");
    setDifferenceType("");
    setDifferenceNote("");
  };

  const total = Number(totalAmount) || 0;
  const isOverAllocated = total > totalSelectedRemaining && totalSelectedRemaining > 0;
  const stillOpenAfterSubmit = Math.max(0, totalSelectedRemaining - totalAllocated);

  // Get available OTA sources from payouts
  const availableOtaSources = useMemo(() => {
    const sources = new Set(availablePayouts.map((p) => p.ota_source));
    return OTA_SOURCES.filter((s) => sources.has(s.value));
  }, [availablePayouts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            Ghi nhận tiền về
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Warning */}
          <Alert className="bg-warning/10 border-warning/20 dark:bg-warning/10 dark:border-warning py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <AlertDescription className="text-xs text-warning">
                <strong>Bắt buộc:</strong> Chọn nguồn OTA trước, sau đó chọn payout cần ghi nhận.
              </AlertDescription>
            </div>
          </Alert>

          {/* Step 1: OTA Source filter */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">1. Chọn nguồn OTA *</Label>
            <Select value={otaSourceFilter} onValueChange={handleSourceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn OTA Channel" />
              </SelectTrigger>
              <SelectContent>
                {availableOtaSources.length === 0 ? (
                  <SelectItem value="_none" disabled>Không có payout nào</SelectItem>
                ) : (
                  availableOtaSources.map((ota) => (
                    <SelectItem key={ota.value} value={ota.value}>
                      {ota.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Select payouts */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">2. Chọn payout cần ghi nhận</Label>

            {otaSourceFilter && (
              <Input
                placeholder="Tìm theo ID chỗ nghỉ, ID Payout, kỳ..."
                value={payoutSearch}
                onChange={(e) => setPayoutSearch(e.target.value)}
              />
            )}

            <div className="border rounded-lg max-h-[220px] overflow-y-auto divide-y divide-border">
              {!otaSourceFilter ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Vui lòng chọn nguồn OTA trước
                </div>
              ) : loadingPayouts ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPayouts.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Không có payout nào cần ghi nhận cho {otaSourceFilter}
                </div>
              ) : (
                filteredPayouts.map((payout) => (
                  <label
                    key={payout.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${selectedPayoutIds.has(payout.id) ? "bg-primary/5" : ""
                      }`}
                  >
                    <Checkbox
                      checked={selectedPayoutIds.has(payout.id)}
                      onCheckedChange={() => togglePayout(payout.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <OtaBadge source={payout.ota_source} />
                        <span className="text-xs text-muted-foreground">
                          {payout.payout_period_from && payout.payout_period_to
                            ? `${formatDate(payout.payout_period_from)} - ${formatDate(payout.payout_period_to)}`
                            : formatDate(payout.payout_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-micro text-muted-foreground">
                        {payout.ota_property_id && (
                          <span>
                            <span className="opacity-60">ID chỗ nghỉ:</span>{" "}
                            <span className="font-mono">{payout.ota_property_id}</span>
                          </span>
                        )}
                        {payout.provider_payout_id && (
                          <span>
                            <span className="opacity-60">ID Payout:</span>{" "}
                            <span className="font-mono">{payout.provider_payout_id}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(payout.remaining_amount)}
                      </p>
                      <p className="text-micro text-muted-foreground">còn lại</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            {selectedPayoutIds.size > 0 && (
              <div className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
                <span className="text-muted-foreground">
                  Đã chọn <strong className="text-foreground">{selectedPayoutIds.size}</strong> payout
                </span>
                <span className="font-semibold text-primary tabular-nums">
                  Tổng cần nhận: {formatCurrency(totalSelectedRemaining)}
                </span>
              </div>
            )}
          </div>

          {/* Step 3: Cash account */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1">
              3. Tài khoản nhận tiền <span className="text-destructive">*</span>
            </Label>
            <Select value={cashAccountId} onValueChange={setCashAccountId} disabled={loadingAccounts}>
              <SelectTrigger className={!cashAccountId ? "border-destructive" : ""}>
                <SelectValue placeholder={loadingAccounts ? "Đang tải..." : "Chọn tài khoản nhận tiền"} />
              </SelectTrigger>
              <SelectContent>
                {cashAccountOptions.map((account) => (
                  <SelectItem key={account.value} value={account.value} textValue={account.label}>
                    <div className="flex flex-col">
                      <span>{account.label}</span>
                      <span className="text-xs text-muted-foreground">{account.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 4: Transaction details */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">4. Chi tiết giao dịch</Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tổng số tiền nhận *</Label>
                <CurrencyInput
                  value={totalAmount}
                  onChange={setTotalAmount}
                  placeholder="Nhập số tiền"
                />
                {isOverAllocated && (
                  <p className="text-xs text-destructive">
                    Vượt quá tổng cần nhận ({formatCurrency(totalSelectedRemaining)})
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ngày nhận *</Label>
                <Input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Hình thức *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OTA_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "UPC" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Kênh thanh toán *</Label>
                  <Select value={paymentChannel} onValueChange={setPaymentChannel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn kênh" />
                    </SelectTrigger>
                    <SelectContent>
                      {UPC_CHANNELS.map((ch) => (
                        <SelectItem key={ch.value} value={ch.value}>{ch.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">Mã giao dịch</Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="UNC / Transaction ID"
                  />
                </div>
              )}
            </div>

            {paymentMethod === "UPC" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Mã giao dịch</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UNC / Transaction ID"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú thêm..."
                rows={2}
              />
            </div>
          </div>

          {/* Difference classification */}
          {hasDifference && (
            <div className="space-y-3 border border-warning/30 bg-warning/5 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <Label className="text-sm font-semibold text-warning">
                  Chênh lệch: {formatCurrency(differenceAmount)}
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Chênh lệch OTA được phân loại rõ ràng để đảm bảo báo cáo P&L chính xác.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Ngân hàng nhận {formatCurrency(total)} / Cần nhận {formatCurrency(totalSelectedRemaining)}.
                {isBankFeeSuggested && <span className="text-warning font-medium ml-1">Gợi ý: Phí chuyển khoản</span>}
              </div>
              <Select value={differenceType} onValueChange={(v) => setDifferenceType(v as ReconciliationItemType)}>
                <SelectTrigger className={!differenceType ? "border-warning" : ""}>
                  <SelectValue placeholder="Chọn lý do chênh lệch *" />
                </SelectTrigger>
                <SelectContent>
                  {RECONCILIATION_ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsDifferenceNote && (
                <Textarea
                  value={differenceNote}
                  onChange={(e) => setDifferenceNote(e.target.value)}
                  placeholder="Ghi chú bắt buộc cho loại này..."
                  rows={2}
                  className={!differenceNote.trim() ? "border-warning" : ""}
                />
              )}
              {differenceType === "UNDERPAYMENT" && (
                <p className="text-xs text-muted-foreground italic">
                  Payout sẽ giữ trạng thái "Về một phần" để theo dõi.
                </p>
              )}
            </div>
          )}

          {/* Allocation preview — shows ALL selected payouts */}
          {selectedPayoutIds.size > 0 && total > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Phân bổ tự động (payout cũ nhất ưu tiên trước)</Label>
              {hasZeroAllocations && (
                <Alert className="bg-warning/10 border-warning/20 dark:bg-warning/10 dark:border-warning py-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                    <AlertDescription className="text-xs text-warning">
                      Số tiền hiện tại không đủ cho tất cả payout. Tiền sẽ được phân bổ theo thứ tự <strong>payout cũ nhất trước</strong>.
                    </AlertDescription>
                  </div>
                </Alert>
              )}
              <div className="border rounded-lg divide-y divide-border text-sm">
                {allocation.map((alloc) => {
                  const payout = selectedPayouts.find((p) => p.id === alloc.payoutId);
                  if (!payout) return null;
                  const isZero = alloc.amount === 0;
                  const isFull = alloc.amount >= payout.remaining_amount && payout.remaining_amount > 0;
                  return (
                    <div key={alloc.payoutId} className={`flex items-center justify-between px-3 py-2 ${isZero ? "opacity-50 bg-muted/20" : ""}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <OtaBadge source={payout.ota_source} />
                        <span className="text-xs text-muted-foreground">
                          {formatDate(payout.payout_date)}
                        </span>
                        {payout.provider_payout_id && (
                          <span className="text-micro font-mono text-muted-foreground">
                            #{payout.provider_payout_id.slice(0, 10)}
                          </span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {isZero ? (
                          <span className="text-xs text-muted-foreground italic">Chưa phân bổ</span>
                        ) : (
                          <span className={`font-semibold tabular-nums ${isFull ? "text-success" : "text-warning"}`}>
                            {formatCurrency(alloc.amount)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-1">
                          / {formatCurrency(payout.remaining_amount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {/* Summary row */}
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-xs">
                  <span className="text-muted-foreground">
                    {selectedPayoutIds.size} payout · Cần nhận: {formatCurrency(totalSelectedRemaining)}
                  </span>
                  <div className="text-right space-y-0.5">
                    <div>
                      <span className="text-muted-foreground">Phân bổ lần này: </span>
                      <span className="font-semibold tabular-nums text-foreground">{formatCurrency(totalAllocated)}</span>
                    </div>
                    {stillOpenAfterSubmit > 0 && (
                      <div>
                        <span className="text-muted-foreground">Còn mở sau submit: </span>
                        <span className="font-semibold tabular-nums text-warning">{formatCurrency(stillOpenAfterSubmit)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !otaSourceFilter ||
              !cashAccountId ||
              !totalAmount ||
              total <= 0 ||
              selectedPayoutIds.size === 0 ||
              isOverAllocated ||
              !hasAnyAllocation ||
              (paymentMethod === "UPC" && !paymentChannel) ||
              (hasDifference && !differenceType) ||
              (needsDifferenceNote && !differenceNote.trim()) ||
              isSubmitting
            }
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Xác nhận ({selectedPayoutIds.size} payout)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
