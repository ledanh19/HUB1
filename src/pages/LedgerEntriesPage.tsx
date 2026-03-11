/**
 * PHASE II/III: Ledger Entries Page
 * - View ledger entries (immutable source of truth)
 * - Filter by date range, source_type, account
 * - Export to Excel
 * - Role guard: admin, ke_toan only
 * 
 * PHASE III ADDITIONS:
 * - Reverse action (đảo bút toán)
 * - Reconcile/Unreconcile action (đối soát ngân hàng)
 * - Show reconciliation status
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeRpc } from "@/integrations/supabase";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Loader2, BookOpen, Download, Filter, RefreshCw, MoreHorizontal, Undo2, CheckCircle, XCircle } from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar";
import { TableSkeleton } from "@/components/ui/page-skeleton";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { format } from "date-fns";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { formatCurrencyVND } from "@/lib/finance-formatters";

interface LedgerEntry {
  id: string;
  entry_date: string;
  posting_at: string;
  source_type: string;
  source_id: string;
  entry_type: string;
  cash_account_id: string;
  account_snapshot: {
    code: string;
    name: string;
    bank_name?: string;
    account_number?: string;
  };
  direction: string;
  amount: number;
  currency: string;
  counterparty_type: string | null;
  counterparty_id: string | null;
  is_posted: boolean;
  is_reversed: boolean;
  note: string | null;
  created_at: string;
}

interface LedgerReconciliation {
  id: string;
  ledger_entry_id: string;
  bank_reference: string | null;
  bank_statement_date: string | null;
  reconciled_at: string;
  reconciled_by: string | null;
  note: string | null;
}

const SOURCE_TYPES = [
  { value: "", label: "Tất cả nguồn" },
  { value: "HOTEL_COLLECT", label: "Thu tiền" },
  { value: "CASH_OUT", label: "Chi tiền" },
  { value: "CASH_TRANSFER", label: "Chuyển khoản nội bộ" },
  { value: "OTA_PAYOUT", label: "OTA Payout" },
  { value: "OTA_PAYOUT_BANK_FEE", label: "Phí NH (OTA)" },
  { value: "HOST_SETTLEMENT", label: "Thanh toán Host" },
];

const ENTRY_TYPES = [
  { value: "", label: "Tất cả loại" },
  { value: "ORIGINAL", label: "Gốc" },
  { value: "REVERSAL", label: "Đảo" },
  { value: "ADJUSTMENT", label: "Điều chỉnh" },
];

export default function LedgerEntriesPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // Read URL params for drill-down from P&L/Cashflow reports
  const paramFrom = searchParams.get("from");
  const paramTo = searchParams.get("to");
  const paramSourceType = searchParams.get("source_type");
  const paramAccountId = searchParams.get("account_id");
  const paramEntryType = searchParams.get("entry_type");

  // Initialize state with URL params or defaults
  const [dateFrom, setDateFrom] = useState(
    paramFrom || format(new Date(new Date().setDate(1)), "yyyy-MM-dd")
  );
  const [dateTo, setDateTo] = useState(
    paramTo || format(new Date(), "yyyy-MM-dd")
  );
  const [sourceType, setSourceType] = useState(paramSourceType || "");
  const [entryType, setEntryType] = useState(paramEntryType || "");
  const [accountId, setAccountId] = useState(paramAccountId || "");

  // PHASE III: Action dialogs
  const [reverseDialog, setReverseDialog] = useState<{ open: boolean; entry: LedgerEntry | null }>({ open: false, entry: null });
  const [reverseReason, setReverseReason] = useState("");
  const [reconcileDialog, setReconcileDialog] = useState<{ open: boolean; entry: LedgerEntry | null }>({ open: false, entry: null });
  const [bankReference, setBankReference] = useState("");
  const [bankStatementDate, setBankStatementDate] = useState("");
  const [reconcileNote, setReconcileNote] = useState("");

  // Fetch cash accounts for filter
  const { data: accounts } = useQuery({
    queryKey: ["cash-accounts-for-filter"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("id, account_code, account_name")
        .eq("is_archived", false)
        .order("account_code");
      if (error) throw error;
      return data;
    },
  });

  // Fetch ledger entries
  const { data: entries, isLoading, refetch } = useQuery({
    queryKey: ["ledger-entries", dateFrom, dateTo, sourceType, entryType, accountId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("ledger_entries")
        .select("*")
        .gte("entry_date", dateFrom)
        .lte("entry_date", dateTo)
        .order("posting_at", { ascending: false })
        .limit(500);

      if (sourceType) query = query.eq("source_type", sourceType);
      if (entryType) query = query.eq("entry_type", entryType);
      if (accountId) query = query.eq("cash_account_id", accountId);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as LedgerEntry[];
    },
  });

  // PHASE III: Fetch reconciliations
  const { data: reconciliations } = useQuery({
    queryKey: ["ledger-reconciliations", entries?.map(e => e.id)],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!entries || entries.length === 0) return [];
      const entryIds = entries.map(e => e.id);
      const { data, error } = await supabase
        .from("ledger_reconciliations")
        .select("*")
        .in("ledger_entry_id", entryIds);
      if (error) throw error;
      return data as LedgerReconciliation[];
    },
    enabled: !!entries && entries.length > 0,
  });

  // Helper to check if entry is reconciled
  const isEntryReconciled = (entryId: string): LedgerReconciliation | undefined => {
    return reconciliations?.find(r => r.ledger_entry_id === entryId);
  };

  // PHASE III: Reverse mutation
  const reverseMutation = useMutation({
    mutationFn: async ({ entryId, reason }: { entryId: string; reason: string }) => {
      const { data, error } = await safeRpc(() => supabase.rpc("reverse_ledger_entry", {
        p_original_entry_id: entryId,
        p_reason: reason,
      }));
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Đảo bút toán thành công", { description: "Bút toán đã được đảo" });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      setReverseDialog({ open: false, entry: null });
      setReverseReason("");
    },
    onError: (error: Error) => {
      toast.error("Lỗi đảo bút toán", { description: error.message });
    },
  });

  // PHASE III: Reconcile mutation
  const reconcileMutation = useMutation({
    mutationFn: async ({ entryId, bankRef, bankDate, note }: { entryId: string; bankRef?: string; bankDate?: string; note?: string }) => {
      const { data, error } = await safeRpc(() => supabase.rpc("reconcile_ledger_entry", {
        p_ledger_entry_id: entryId,
        p_bank_reference: bankRef || null,
        p_bank_statement_date: bankDate || null,
        p_note: note || null,
      }));
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Đối soát thành công", { description: "Bút toán đã được đánh dấu đối soát" });
      queryClient.invalidateQueries({ queryKey: ["ledger-reconciliations"] });
      setReconcileDialog({ open: false, entry: null });
      setBankReference("");
      setBankStatementDate("");
      setReconcileNote("");
    },
    onError: (error: Error) => {
      toast.error("Lỗi đối soát", { description: error.message });
    },
  });

  // PHASE III: Unreconcile mutation
  const unreconcileMutation = useMutation({
    mutationFn: async ({ entryId, reason }: { entryId: string; reason: string }) => {
      const { data, error } = await safeRpc(() => supabase.rpc("unreconcile_ledger_entry", {
        p_ledger_entry_id: entryId,
        p_reason: reason,
      }));
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Huỷ đối soát thành công", { description: "Đã huỷ đánh dấu đối soát" });
      queryClient.invalidateQueries({ queryKey: ["ledger-reconciliations"] });
    },
    onError: (error: Error) => {
      toast.error("Lỗi huỷ đối soát", { description: error.message });
    },
  });

  const { page, pageSize, setPage, setPageSize, paginatedData: paginatedEntries, totalPages, displayedCount, totalCount } =
    useTablePagination(entries ?? [], { defaultPageSize: 10, resetDeps: [dateFrom, dateTo, sourceType, entryType, accountId] });

  // Calculate totals
  const totals = entries?.reduce(
    (acc, entry) => {
      if (entry.direction === "DEBIT") {
        acc.debit += entry.amount;
      } else {
        acc.credit += entry.amount;
      }
      return acc;
    },
    { debit: 0, credit: 0 }
  ) ?? { debit: 0, credit: 0 };

  // Export to CSV
  const handleExport = () => {
    if (!entries || entries.length === 0) return;

    const headers = ["Ngày", "Loại", "Nguồn", "Tài khoản", "Chiều", "Số tiền", "Đối tượng", "Ghi chú"];
    const rows = entries.map((e) => [
      e.entry_date,
      e.entry_type,
      e.source_type,
      e.account_snapshot?.code || "",
      e.direction,
      e.amount,
      e.counterparty_type || "",
      e.note || "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ledger_${dateFrom}_${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Header title="Sổ cái (Ledger Entries)" subtitle="Danh sách bút toán kế toán - chỉ xem" />
      <PageContainer><SectionCard>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Sổ cái (Ledger Entries)</CardTitle>
                  <CardDescription>
                    Danh sách bút toán kế toán - chỉ xem, không chỉnh sửa
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Làm mới
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={!entries?.length}>
                  <Download className="h-4 w-4 mr-1" />
                  Xuất CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <FilterBar
              title="Bộ lọc"
              subtitle="Lọc bút toán theo ngày, nguồn, loại và tài khoản"
              hasActiveFilters={sourceType !== "" || entryType !== "" || accountId !== ""}
              onClearFilters={() => { setSourceType(""); setEntryType(""); setAccountId(""); }}
              className="mb-4"
            >
              <FilterBar.Field label="Từ ngày">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </FilterBar.Field>
              <FilterBar.Field label="Đến ngày">
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </FilterBar.Field>
              <FilterBar.Field label="Loại nguồn">
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((s) => (
                      <SelectItem key={s.value || "all"} value={s.value || "all"}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>
              <FilterBar.Field label="Loại bút toán">
                <Select value={entryType} onValueChange={setEntryType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTRY_TYPES.map((t) => (
                      <SelectItem key={t.value || "all"} value={t.value || "all"}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>
              <FilterBar.Field label="Tài khoản">
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tất cả" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả tài khoản</SelectItem>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.account_code} - {acc.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBar.Field>
            </FilterBar>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <MetricCard
                title="Tổng DEBIT (Nợ)"
                value={formatCurrencyVND(totals.debit)}
                valueClassName="text-success"
                className="bg-success/5 border-success/20"
              />
              <MetricCard
                title="Tổng CREDIT (Có)"
                value={formatCurrencyVND(totals.credit)}
                valueClassName="text-destructive"
                className="bg-destructive/5 border-destructive/20"
              />
              <MetricCard
                title="Chênh lệch (DR - CR)"
                value={formatCurrencyVND(totals.debit - totals.credit)}
                valueClassName="text-primary"
                className="bg-primary/5 border-primary/20"
              />
            </div>

            {/* Table */}
            {isLoading ? (
              <TableSkeleton columns={10} rows={8} />
            ) : entries && entries.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[100px]">Ngày</TableHead>
                      <TableHead className="w-[80px]">Loại</TableHead>
                      <TableHead>Nguồn</TableHead>
                      <TableHead>Tài khoản</TableHead>
                      <TableHead className="w-[80px]">Chiều</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead>Đối tượng</TableHead>
                      <TableHead className="w-[80px]">Đối soát</TableHead>
                      <TableHead>Ghi chú</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEntries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className={entry.is_reversed ? "opacity-50 line-through" : ""}
                      >
                        <TableCell className="font-mono text-xs">
                          {entry.entry_date}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              entry.entry_type === "ORIGINAL"
                                ? "default"
                                : entry.entry_type === "REVERSAL"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="text-xs"
                          >
                            {entry.entry_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.source_type}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {entry.account_snapshot?.code}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.account_snapshot?.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={entry.direction === "DEBIT" ? "outline" : "secondary"}
                            className={
                              entry.direction === "DEBIT"
                                ? "bg-success/5 text-success border-success/30"
                                : "bg-destructive/5 text-destructive border-destructive/30"
                            }
                          >
                            {entry.direction === "DEBIT" ? "DR" : "CR"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrencyVND(entry.amount)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.counterparty_type && (
                            <span className="text-muted-foreground">
                              {entry.counterparty_type}
                              {entry.counterparty_id && `: ${entry.counterparty_id.slice(0, 8)}...`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const recon = isEntryReconciled(entry.id);
                            if (recon) {
                              return (
                                <Badge variant="outline" className="bg-success/5 text-success border-success/30 text-xs" title={`Ref: ${recon.bank_reference || "N/A"}`}>
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  ✓
                                </Badge>
                              );
                            }
                            return (
                              <span className="text-muted-foreground text-xs">—</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-xs truncate">
                          {entry.note}
                        </TableCell>
                        <TableCell>
                          {!entry.is_reversed && entry.entry_type !== "REVERSAL" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setReverseDialog({ open: true, entry })}
                                  className="text-destructive"
                                >
                                  <Undo2 className="h-4 w-4 mr-2" />
                                  Đảo bút toán
                                </DropdownMenuItem>
                                {isEntryReconciled(entry.id) ? (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      if (confirm("Huỷ đối soát bút toán này?")) {
                                        unreconcileMutation.mutate({ entryId: entry.id, reason: "Huỷ bởi user" });
                                      }
                                    }}
                                    className="text-warning"
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Huỷ đối soát
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => setReconcileDialog({ open: true, entry })}
                                    className="text-success"
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Đối soát
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Không có bút toán nào trong khoảng thời gian này</p>
              </div>
            )}

            {entries && entries.length > 0 && (
              <DataTablePagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalCount}
                displayedItems={displayedCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="bút toán"
              />
            )}
          </CardContent>
        </Card>
      </SectionCard></PageContainer>

      {/* PHASE III: Reverse Dialog */}
      <Dialog open={reverseDialog.open} onOpenChange={(open) => !open && setReverseDialog({ open: false, entry: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Đảo bút toán</DialogTitle>
            <DialogDescription>
              Bút toán gốc sẽ bị đánh dấu "đã đảo" và một bút toán đảo chiều sẽ được tạo. Thao tác không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          {reverseDialog.entry && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                <div><strong>Ngày:</strong> {reverseDialog.entry.entry_date}</div>
                <div><strong>Nguồn:</strong> {reverseDialog.entry.source_type}</div>
                <div><strong>Tài khoản:</strong> {reverseDialog.entry.account_snapshot?.code} - {reverseDialog.entry.account_snapshot?.name}</div>
                <div><strong>Chiều:</strong> {reverseDialog.entry.direction}</div>
                <div><strong>Số tiền:</strong> {formatCurrencyVND(reverseDialog.entry.amount)}</div>
              </div>
              <div className="space-y-2">
                <Label>Lý do đảo bút toán <span className="text-destructive">*</span></Label>
                <Textarea
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="Nhập lý do đảo bút toán..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseDialog({ open: false, entry: null })}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (reverseDialog.entry && reverseReason.trim()) {
                  reverseMutation.mutate({ entryId: reverseDialog.entry.id, reason: reverseReason.trim() });
                }
              }}
              disabled={!reverseReason.trim() || reverseMutation.isPending}
            >
              {reverseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Undo2 className="h-4 w-4 mr-1" />}
              Xác nhận đảo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PHASE III: Reconcile Dialog */}
      <Dialog open={reconcileDialog.open} onOpenChange={(open) => !open && setReconcileDialog({ open: false, entry: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-success">Đối soát bút toán</DialogTitle>
            <DialogDescription>
              Đánh dấu bút toán đã khớp với sao kê ngân hàng.
            </DialogDescription>
          </DialogHeader>
          {reconcileDialog.entry && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                <div><strong>Ngày:</strong> {reconcileDialog.entry.entry_date}</div>
                <div><strong>Tài khoản:</strong> {reconcileDialog.entry.account_snapshot?.code} - {reconcileDialog.entry.account_snapshot?.name}</div>
                <div><strong>Số tiền:</strong> {formatCurrencyVND(reconcileDialog.entry.amount)} ({reconcileDialog.entry.direction})</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mã tham chiếu ngân hàng</Label>
                  <Input
                    value={bankReference}
                    onChange={(e) => setBankReference(e.target.value)}
                    placeholder="VD: TRF123456789"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ngày sao kê</Label>
                  <Input
                    type="date"
                    value={bankStatementDate}
                    onChange={(e) => setBankStatementDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Textarea
                  value={reconcileNote}
                  onChange={(e) => setReconcileNote(e.target.value)}
                  placeholder="Ghi chú thêm (tuỳ chọn)..."
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcileDialog({ open: false, entry: null })}>
              Huỷ
            </Button>
            <Button
              onClick={() => {
                if (reconcileDialog.entry) {
                  reconcileMutation.mutate({
                    entryId: reconcileDialog.entry.id,
                    bankRef: bankReference,
                    bankDate: bankStatementDate,
                    note: reconcileNote,
                  });
                }
              }}
              disabled={reconcileMutation.isPending}
              className="bg-success hover:bg-success/80"
            >
              {reconcileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Xác nhận đối soát
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
