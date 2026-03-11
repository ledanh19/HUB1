import { useState } from "react";
import { SectionCard } from "@/components/layout/SectionCard";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle,
  AlertTriangle,
  Info,
  FileText,
  Plus,
  Eye,
  Pencil,
  Loader2,
  Scale,
  Receipt,
} from "lucide-react";
import {
  usePayoutReconciliationItems,
  useCreateReconciliationItem,
  usePostBankFeeToLedger,
  usePostAdjustmentToLedger,
  RECONCILIATION_ITEM_TYPES,
  ADJ_CATEGORY_LABELS,
  type ReconciliationItemType,
} from "@/hooks/useOtaPayoutReconciliation";
import type { OtaPayout } from "@/hooks/useOtaPayouts";
import type { PayoutSummary } from "@/lib/buildPayoutSummary";
import { TOLERANCE_VND } from "@/lib/buildPayoutSummary";

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB");
};

interface EvidenceData {
  kind?: "BANK_STATEMENT" | "SCREENSHOT" | "NOTE";
  bank_ref?: string;
  txn_date?: string;
  statement_line?: string;
  attachment_url?: string;
  uploaded_by?: string;
  uploaded_at?: string;
}

interface ReconciliationBreakdownCardProps {
  payout: OtaPayout;
  summary: PayoutSummary;
  canEdit: boolean;
}

export function ReconciliationBreakdownCard({
  payout,
  summary,
  canEdit,
}: ReconciliationBreakdownCardProps) {
  const { data: reconciliationItems = [], isLoading } = usePayoutReconciliationItems(payout.id);
  const createReconciliation = useCreateReconciliationItem();
  const postToLedger = usePostBankFeeToLedger();
  const postAdjToLedger = usePostAdjustmentToLedger();

  const [addItemOpen, setAddItemOpen] = useState(false);
  const [newItemType, setNewItemType] = useState<ReconciliationItemType | "">("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [newItemNote, setNewItemNote] = useState("");
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false);
  const [viewingEvidence, setViewingEvidence] = useState<EvidenceData | null>(null);
  const [editEvidenceItem, setEditEvidenceItem] = useState<any>(null);
  const [evidenceForm, setEvidenceForm] = useState<EvidenceData>({
    kind: "BANK_STATEMENT",
    bank_ref: "",
    txn_date: "",
    statement_line: "",
  });

  // Direction state for add-item form
  const [newItemDirection, setNewItemDirection] = useState<"DEBIT" | "CREDIT">("CREDIT");

  // Financial values from shared SOT summary
  const grossAmount = summary.gross;
  const deductionTotal = summary.adjustments;
  const expectedNet = summary.expectedNet;
  const bankFeeTotal = summary.bankFees;
  const adjustmentTotal = summary.otherAdjust;
  const reconciledTotal = summary.reconciledTotal;
  const totalReceived = summary.received;
  const equationBalanced = summary.isSettled;
  const remainingDiff = summary.difference;
  const isRoundingOnly = Math.abs(remainingDiff) > 0 && Math.abs(remainingDiff) <= TOLERANCE_VND;

  const statusLabel = payout.status === "RECEIVED" ? "Về đủ" : payout.status === "PARTIAL" ? "Về một phần" : "Chờ về";

  const handleAddItem = async () => {
    if (!newItemType || !newItemAmount) return;
    await createReconciliation.mutateAsync({
      payout_id: payout.id,
      item_type: newItemType as ReconciliationItemType,
      amount: Number(newItemAmount),
      note: newItemNote || null,
      evidence: evidenceForm.bank_ref ? evidenceForm : null,
      direction: newItemDirection,
    });
    setAddItemOpen(false);
    setNewItemType("");
    setNewItemAmount("");
    setNewItemNote("");
    setNewItemDirection("CREDIT");
    setEvidenceForm({ kind: "BANK_STATEMENT", bank_ref: "", txn_date: "", statement_line: "" });
  };

  const handleViewEvidence = (evidence: any) => {
    setViewingEvidence(evidence as EvidenceData);
    setEvidenceDialogOpen(true);
  };

  const getItemTypeLabel = (type: string) => {
    return RECONCILIATION_ITEM_TYPES.find((t) => t.value === type)?.label || type;
  };

  return (
    <>
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Đối soát tiền về (Reconciliation)
          </span>
        }
        subtitle={
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 cursor-help">
                  <Info className="h-3 w-3" />
                  Chênh lệch OTA được phân loại rõ ràng để đảm bảo P&L chính xác
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Mỗi khoản chênh lệch giữa tiền dự kiến và tiền thực nhận được phân loại cụ thể
                (phí ngân hàng, tranh chấp, điều chỉnh...) để báo cáo tài chính chính xác.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        }
        actions={
          canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setAddItemOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Phân loại
            </Button>
          ) : undefined
        }
      >
        {/* Section 1: Summary numbers + equation */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Dự kiến (Gross)</p>
              <p className="font-semibold tabular-nums">{formatCurrency(grossAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Điều chỉnh OTA</p>
              <p className={`font-semibold tabular-nums ${deductionTotal < 0 ? "text-destructive" : deductionTotal > 0 ? "text-success" : ""}`}>
                {deductionTotal !== 0 ? formatCurrency(deductionTotal) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Thực nhận dự kiến (Net)</p>
              <p className="font-semibold tabular-nums text-primary">{formatCurrency(expectedNet)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Thực nhận từ NH</p>
              <p className="font-semibold tabular-nums text-success">{formatCurrency(totalReceived)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Phí NH (Bank fee)</p>
              <p className={`font-semibold tabular-nums ${bankFeeTotal > 0 ? "text-warning" : ""}`}>
                {bankFeeTotal > 0 ? formatCurrency(bankFeeTotal) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Điều chỉnh khác</p>
              <p className="font-semibold tabular-nums">
                {adjustmentTotal > 0 ? formatCurrency(adjustmentTotal) : "—"}
              </p>
            </div>
          </div>

          {/* Equation line */}
          <div className={`flex items-center gap-2 p-2 rounded-md text-xs font-mono ${equationBalanced ? "bg-success/10 border border-success/30" : "bg-warning/10 border border-warning/30"}`}>
            {equationBalanced ? (
              <CheckCircle className="h-4 w-4 text-success shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            )}
            <span className="flex-1">
              Net ({formatCurrency(expectedNet)}) = Nhận ({formatCurrency(totalReceived)})
              {bankFeeTotal > 0 && ` + Phí NH (${formatCurrency(bankFeeTotal)})`}
              {adjustmentTotal > 0 && ` + ĐC (${formatCurrency(adjustmentTotal)})`}
              {isRoundingOnly && ` ± ${TOLERANCE_VND}đ tolerance`}
            </span>
            <StatusBadge variant={equationBalanced ? "success" : "warning"} size="sm">
              {equationBalanced ? statusLabel : `Chênh ${formatCurrency(Math.abs(remainingDiff))}`}
            </StatusBadge>
          </div>

          {/* Tolerance note */}
          {isRoundingOnly && (
            <p className="text-micro text-muted-foreground italic flex items-center gap-1">
              <Info className="h-3 w-3" />
              Rounding tolerance applied (±{TOLERANCE_VND}đ). Chênh lệch {formatCurrency(Math.abs(remainingDiff))} nằm trong ngưỡng cho phép.
            </p>
          )}
        </div>

        {/* Section 2: Breakdown table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : reconciliationItems.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            {equationBalanced && totalReceived > 0
              ? "Không có khoản chênh lệch nào cần phân loại."
              : totalReceived === 0
                ? "Chưa ghi nhận tiền về."
                : "Chưa có phân loại chênh lệch. Nhấn \"Phân loại\" để thêm."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loại</TableHead>
                <TableHead>Phân loại</TableHead>
                <TableHead>Hướng</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="w-[80px]">Chứng từ</TableHead>
                <TableHead className="w-[100px]">Sổ cái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reconciliationItems.map((item: any) => {
                const evidence = item.evidence as EvidenceData | null;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <StatusBadge
                        variant={
                          item.item_type === "BANK_TRANSFER_FEE" ? "warning" :
                            item.item_type === "DISPUTE" ? "danger" :
                              item.item_type === "UNDERPAYMENT" ? "info" : "default"
                        }
                        size="sm"
                      >
                        {getItemTypeLabel(item.item_type)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {item.adj_category ? (
                        <StatusBadge
                          variant={
                            item.adj_category === "DISPUTE_WIN" ? "success" :
                              item.adj_category === "DISPUTE_LOSS" || item.adj_category === "OTA_PENALTY" ? "danger" :
                                item.adj_category === "OTA_COMPENSATION" ? "info" :
                                  item.adj_category === "BANK_FEE" ? "warning" : "default"
                          }
                          size="sm"
                        >
                          {ADJ_CATEGORY_LABELS[item.adj_category] || item.adj_category}
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        variant={item.direction === "DEBIT" ? "success" : "danger"}
                        size="sm"
                      >
                        {item.direction === "DEBIT" ? "Thu" : "Chi"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${item.direction === "DEBIT" ? "text-success" : "text-warning"}`}>
                      {item.direction === "DEBIT" ? "+" : "-"}{formatCurrency(item.amount)}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {item.note || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </TableCell>
                    <TableCell>
                      {evidence && evidence.kind ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleViewEvidence(evidence)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Xem
                        </Button>
                      ) : canEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                          onClick={() => {
                            setEditEvidenceItem(item);
                            setEvidenceForm({
                              kind: "BANK_STATEMENT",
                              bank_ref: "",
                              txn_date: "",
                              statement_line: "",
                            });
                            setEvidenceDialogOpen(true);
                            setViewingEvidence(null);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Thêm
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.ledger_entry_id ? (
                        <StatusBadge variant="success" size="sm">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Đã HT
                        </StatusBadge>
                      ) : item.item_type === "BANK_TRANSFER_FEE" ? (
                        canEdit ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            disabled={postToLedger.isPending}
                            onClick={() => postToLedger.mutate(payout.id)}
                          >
                            {postToLedger.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Receipt className="h-3 w-3 mr-1" />
                            )}
                            HT Phí NH
                          </Button>
                        ) : (
                          <StatusBadge variant="warning" size="sm">Chưa HT</StatusBadge>
                        )
                      ) : canEdit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={postAdjToLedger.isPending}
                          onClick={() => postAdjToLedger.mutate(item.id)}
                        >
                          {postAdjToLedger.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Receipt className="h-3 w-3 mr-1" />
                          )}
                          Hạch toán
                        </Button>
                      ) : (
                        <StatusBadge variant="warning" size="sm">Chưa HT</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Section 3: Ledger link */}
        {(() => {
          const bankFeeItem = reconciliationItems.find((i: any) => i.item_type === "BANK_TRANSFER_FEE");
          const isPosted = !!bankFeeItem?.ledger_entry_id;
          return (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 text-xs">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              {bankFeeTotal > 0 ? (
                isPosted ? (
                  <span className="text-muted-foreground flex items-center gap-1">
                    Phí NH {formatCurrency(bankFeeTotal)} —
                    <StatusBadge variant="success" size="sm">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Đã hạch toán
                    </StatusBadge>
                    <span className="ml-1 font-mono text-[10px] opacity-60">
                      Ledger: {bankFeeItem.ledger_entry_id?.slice(0, 8)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1">
                    Phí NH {formatCurrency(bankFeeTotal)} —
                    <StatusBadge variant="warning" size="sm">Chưa hạch toán</StatusBadge>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2 text-xs h-6"
                        disabled={postToLedger.isPending}
                        onClick={() => postToLedger.mutate(payout.id)}
                      >
                        {postToLedger.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Receipt className="h-3 w-3 mr-1" />
                        )}
                        Hạch toán phí NH
                      </Button>
                    )}
                  </span>
                )
              ) : (
                <span className="text-muted-foreground">Không có khoản phí NH cần hạch toán</span>
              )}
            </div>
          );
        })()}
      </SectionCard>

      {/* Add Reconciliation Item Dialog */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Phân loại chênh lệch
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {remainingDiff > 0 && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm">
                <p className="text-warning font-medium">
                  Chênh lệch chưa phân loại: {formatCurrency(remainingDiff)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Loại chênh lệch *</Label>
              <Select value={newItemType} onValueChange={(v) => setNewItemType(v as ReconciliationItemType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn loại" />
                </SelectTrigger>
                <SelectContent>
                  {RECONCILIATION_ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Direction selector — only for non-bank-fee items */}
            {newItemType && newItemType !== "BANK_TRANSFER_FEE" && (
              <div className="space-y-2">
                <Label>Hướng tài chính *</Label>
                <Select value={newItemDirection} onValueChange={(v) => setNewItemDirection(v as "DEBIT" | "CREDIT")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CREDIT">Chi (CREDIT) — Giảm tiền nhận</SelectItem>
                    <SelectItem value="DEBIT">Thu (DEBIT) — Thêm tiền nhận</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Số tiền *</Label>
              <Input
                type="number"
                value={newItemAmount}
                onChange={(e) => setNewItemAmount(e.target.value)}
                placeholder={remainingDiff > 0 ? String(remainingDiff) : "0"}
              />
            </div>

            <div className="space-y-2">
              <Label>Ghi chú {(newItemType === "OTHER" || newItemType === "MANUAL_ADJUSTMENT") ? "*" : ""}</Label>
              <Textarea
                value={newItemNote}
                onChange={(e) => setNewItemNote(e.target.value)}
                placeholder="Ghi chú..."
                rows={2}
              />
            </div>

            {/* Inline evidence fields */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs text-muted-foreground">Chứng từ (không bắt buộc)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-micro">Mã giao dịch NH</Label>
                  <Input
                    value={evidenceForm.bank_ref || ""}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, bank_ref: e.target.value })}
                    placeholder="UNC / Ref"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-micro">Ngày GD</Label>
                  <Input
                    type="date"
                    value={evidenceForm.txn_date || ""}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, txn_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-micro">Dòng sao kê</Label>
                <Input
                  value={evidenceForm.statement_line || ""}
                  onChange={(e) => setEvidenceForm({ ...evidenceForm, statement_line: e.target.value })}
                  placeholder="Nội dung dòng sao kê ngân hàng"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Huỷ</Button>
            <Button
              onClick={handleAddItem}
              disabled={
                !newItemType ||
                !newItemAmount ||
                Number(newItemAmount) <= 0 ||
                ((newItemType === "OTHER" || newItemType === "MANUAL_ADJUSTMENT") && !newItemNote.trim()) ||
                createReconciliation.isPending
              }
            >
              {createReconciliation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidence View Dialog */}
      <Dialog open={evidenceDialogOpen} onOpenChange={setEvidenceDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Chứng từ đối soát
            </DialogTitle>
          </DialogHeader>

          {viewingEvidence ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Loại</p>
                  <p className="font-medium">
                    {viewingEvidence.kind === "BANK_STATEMENT" ? "Sao kê NH" :
                      viewingEvidence.kind === "SCREENSHOT" ? "Ảnh chụp" : "Ghi chú"}
                  </p>
                </div>
                {viewingEvidence.bank_ref && (
                  <div>
                    <p className="text-xs text-muted-foreground">Mã GD ngân hàng</p>
                    <p className="font-medium font-mono">{viewingEvidence.bank_ref}</p>
                  </div>
                )}
                {viewingEvidence.txn_date && (
                  <div>
                    <p className="text-xs text-muted-foreground">Ngày GD</p>
                    <p className="font-medium">{viewingEvidence.txn_date}</p>
                  </div>
                )}
                {viewingEvidence.statement_line && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Dòng sao kê</p>
                    <p className="font-medium">{viewingEvidence.statement_line}</p>
                  </div>
                )}
                {viewingEvidence.uploaded_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Thời gian tải lên</p>
                    <p className="font-medium text-xs">{viewingEvidence.uploaded_at}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Không có dữ liệu chứng từ</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEvidenceDialogOpen(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
