/**
 * PHASE III: Cash Transfers Page
 * - Chuyển tiền giữa các tài khoản nội bộ
 * - Tạo 2 ledger entries (1 CREDIT từ nguồn, 1 DEBIT vào đích)
 * - View danh sách chuyển khoản
 * - Role guard: admin, ke_toan only
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeRpc } from "@/integrations/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRightLeft, Plus, RefreshCw } from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { format } from "date-fns";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";

interface CashAccount {
  id: string;
  account_code: string;
  account_name: string;
  bank_name: string | null;
  account_number: string | null;
  is_default: boolean;
}

interface CashTransfer {
  id: string;
  transfer_code: string;
  from_cash_account_id: string;
  to_cash_account_id: string;
  transfer_date: string;
  amount: number;
  note: string | null;
  is_voided: boolean;
  voided_at: string | null;
  voided_reason: string | null;
  created_at: string;
  created_by: string | null;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
};

export default function CashTransfersPage() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState(format(new Date(new Date().setDate(1)), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [createDialog, setCreateDialog] = useState(false);

  // Form state
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [transferDate, setTransferDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // Fetch cash accounts
  const { data: accounts } = useQuery({
    queryKey: ["cash-accounts-for-transfer"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("id, account_code, account_name, bank_name, account_number, is_default")
        .eq("is_archived", false)
        .order("account_code");
      if (error) throw error;
      return data as CashAccount[];
    },
  });

  // Fetch transfers
  const { data: transfers, isLoading, refetch } = useQuery({
    queryKey: ["cash-transfers", dateFrom, dateTo],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_transfers")
        .select("*")
        .gte("transfer_date", dateFrom)
        .lte("transfer_date", dateTo)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as CashTransfer[];
    },
  });

  // Create transfer mutation
  const createTransferMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await safeRpc(() => supabase.rpc("create_cash_transfer_atomic", {
        p_from_account_id: fromAccountId,
        p_to_account_id: toAccountId,
        p_transfer_date: transferDate,
        p_amount: parseFloat(amount),
        p_note: note || null,
      }));
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Chuyển khoản thành công", { description: "Đã tạo 2 bút toán tương ứng" });
      queryClient.invalidateQueries({ queryKey: ["cash-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
      resetForm();
      setCreateDialog(false);
    },
    onError: (error: Error) => {
      toast.error("Lỗi chuyển khoản", { description: error.message });
    },
  });

  const resetForm = () => {
    setFromAccountId("");
    setToAccountId("");
    setTransferDate(format(new Date(), "yyyy-MM-dd"));
    setAmount("");
    setNote("");
  };

  // Helper to get account info
  const getAccountInfo = (accountId: string): CashAccount | undefined => {
    return accounts?.find(a => a.id === accountId);
  };

  const { page, pageSize, setPage, setPageSize, paginatedData: paginatedTransfers, totalPages, displayedCount, totalCount } =
    useTablePagination(transfers ?? [], { defaultPageSize: 10, resetDeps: [dateFrom, dateTo] });

  // Calculate totals
  const totals = transfers?.reduce((acc, t) => {
    if (!t.is_voided) {
      acc.total += t.amount;
      acc.count += 1;
    }
    return acc;
  }, { total: 0, count: 0 }) ?? { total: 0, count: 0 };

  return (
    <>
      <Header title="Chuyển khoản nội bộ" subtitle="Chuyển tiền giữa các tài khoản nội bộ" />
      <PageContainer>
        <SectionCard>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Chuyển khoản nội bộ</CardTitle>
                    <CardDescription>
                      Chuyển tiền giữa các tài khoản tiền mặt/ngân hàng của doanh nghiệp
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Làm mới
                  </Button>
                  <Dialog open={createDialog} onOpenChange={setCreateDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Tạo chuyển khoản
                      </Button>
                    </DialogTrigger>
                    <DialogContent size="md">
                      <DialogHeader>
                        <DialogTitle>Tạo chuyển khoản nội bộ</DialogTitle>
                        <DialogDescription>
                          Chuyển tiền từ tài khoản này sang tài khoản khác. Hệ thống sẽ tự động tạo 2 bút toán.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Từ tài khoản <span className="text-destructive">*</span></Label>
                          <Select value={fromAccountId} onValueChange={setFromAccountId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Chọn tài khoản nguồn" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts?.filter(a => a.id !== toAccountId).map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  <div className="flex flex-col">
                                    <span>{acc.account_code} - {acc.account_name}</span>
                                    {acc.bank_name && (
                                      <span className="text-xs text-muted-foreground">
                                        {acc.bank_name} - {acc.account_number}
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-center">
                          <ArrowRightLeft className="h-5 w-5 text-muted-foreground rotate-90" />
                        </div>
                        <div className="space-y-2">
                          <Label>Đến tài khoản <span className="text-destructive">*</span></Label>
                          <Select value={toAccountId} onValueChange={setToAccountId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Chọn tài khoản đích" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts?.filter(a => a.id !== fromAccountId).map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  <div className="flex flex-col">
                                    <span>{acc.account_code} - {acc.account_name}</span>
                                    {acc.bank_name && (
                                      <span className="text-xs text-muted-foreground">
                                        {acc.bank_name} - {acc.account_number}
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Ngày chuyển <span className="text-destructive">*</span></Label>
                            <Input
                              type="date"
                              value={transferDate}
                              onChange={(e) => setTransferDate(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Số tiền (VND) <span className="text-destructive">*</span></Label>
                            <CurrencyInput
                              value={amount}
                              onChange={setAmount}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Ghi chú</Label>
                          <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Mô tả mục đích chuyển khoản..."
                            rows={2}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => { resetForm(); setCreateDialog(false); }}>
                          Huỷ
                        </Button>
                        <Button
                          onClick={() => createTransferMutation.mutate()}
                          disabled={
                            !fromAccountId || !toAccountId || !transferDate || !amount ||
                            parseFloat(amount) <= 0 || fromAccountId === toAccountId ||
                            createTransferMutation.isPending
                          }
                        >
                          {createTransferMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                          Xác nhận chuyển
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <FilterBar
                title="Bộ lọc"
                subtitle="Lọc chuyển khoản nội bộ theo khoảng thời gian"
                className="mb-4"
              >
                <FilterBar.Field label="Từ ngày">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-40"
                  />
                </FilterBar.Field>
                <FilterBar.Field label="Đến ngày">
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-40"
                  />
                </FilterBar.Field>
                <FilterBar.Field>
                  <div className="flex items-end h-full">
                    <div className="text-sm text-muted-foreground">
                      {totals.count > 0 && (
                        <span>
                          {totals.count} chuyển khoản | Tổng: <strong>{formatCurrency(totals.total)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </FilterBar.Field>
              </FilterBar>

              {/* Table */}
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : transfers && transfers.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[120px]">Mã chuyển</TableHead>
                        <TableHead className="w-[100px]">Ngày</TableHead>
                        <TableHead>Từ tài khoản</TableHead>
                        <TableHead className="w-[50px] text-center">→</TableHead>
                        <TableHead>Đến tài khoản</TableHead>
                        <TableHead className="text-right">Số tiền</TableHead>
                        <TableHead>Ghi chú</TableHead>
                        <TableHead className="w-[80px]">Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTransfers.map((transfer) => {
                        const fromAcc = getAccountInfo(transfer.from_cash_account_id);
                        const toAcc = getAccountInfo(transfer.to_cash_account_id);
                        return (
                          <TableRow
                            key={transfer.id}
                            className={transfer.is_voided ? "opacity-50 line-through" : ""}
                          >
                            <TableCell className="font-mono text-xs font-medium">
                              {transfer.transfer_code}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {transfer.transfer_date}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{fromAcc?.account_code}</div>
                              <div className="text-xs text-muted-foreground">{fromAcc?.account_name}</div>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">
                              →
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{toAcc?.account_code}</div>
                              <div className="text-xs text-muted-foreground">{toAcc?.account_name}</div>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {formatCurrency(transfer.amount)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-40 truncate">
                              {transfer.note}
                            </TableCell>
                            <TableCell>
                              {transfer.is_voided ? (
                                <Badge variant="destructive" className="text-xs">Đã huỷ</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-success/5 text-success border-success/30 text-xs">
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chưa có chuyển khoản nội bộ nào trong khoảng thời gian này</p>
                  <Button variant="outline" className="mt-4" onClick={() => setCreateDialog(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Tạo chuyển khoản đầu tiên
                  </Button>
                </div>
              )}

              {transfers && transfers.length > 0 && (
                <DataTablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  displayedItems={displayedCount}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="chuyển khoản"
                />
              )}
            </CardContent>
          </Card>
        </SectionCard>
      </PageContainer>
    </>
  );
}
