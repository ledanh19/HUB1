/**
 * PHASE III: Accounting Periods Page
 * - Lock/Unlock kỳ kế toán
 * - View danh sách kỳ đã tạo
 * - Admin only
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeRpc } from "@/integrations/supabase";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Loader2, Calendar, Lock, Unlock, Plus, RefreshCw, AlertTriangle } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";

interface AccountingPeriod {
  id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  unlocked_at: string | null;
  unlocked_by: string | null;
  note: string | null;
  created_at: string;
}

export default function AccountingPeriodsPage() {
  const queryClient = useQueryClient();
  const [lockDialog, setLockDialog] = useState(false);
  const [unlockDialog, setUnlockDialog] = useState<{ open: boolean; period: AccountingPeriod | null }>({ open: false, period: null });
  
  // Lock form state
  const lastMonth = subMonths(new Date(), 1);
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
  const [lockNote, setLockNote] = useState("");
  
  // Unlock form state
  const [unlockReason, setUnlockReason] = useState("");

  // Fetch periods
  const { data: periods, isLoading, refetch } = useQuery({
    queryKey: ["accounting-periods"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounting_periods")
        .select("*")
        .order("period_start", { ascending: false })
        .limit(24); // Last 2 years
      if (error) throw error;
      return data as AccountingPeriod[];
    },
  });

  // Lock period mutation
  const lockMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await safeRpc(() => supabase.rpc("lock_accounting_period", {
        p_org_id: "00000000-0000-0000-0000-000000000001",
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_note: lockNote || null,
      }));
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Khóa kỳ thành công", { description: "Các giao dịch trong kỳ sẽ không thể sửa đổi" });
      queryClient.invalidateQueries({ queryKey: ["accounting-periods"] });
      setLockDialog(false);
      setLockNote("");
    },
    onError: (error: Error) => {
      toast.error("Lỗi khóa kỳ", { description: error.message });
    },
  });

  // Unlock period mutation
  const unlockMutation = useMutation({
    mutationFn: async ({ period, reason }: { period: AccountingPeriod; reason: string }) => {
      const { data, error } = await safeRpc(() => supabase.rpc("unlock_accounting_period_secure" as any, {
        p_period_id: period.id,
        p_reason: reason,
      }));
      if (error) {
        const msg = error.message || "";
        if (msg.includes("PERMISSION_DENIED")) {
          throw new Error("Chỉ Super Admin mới được phép mở khóa kỳ kế toán.");
        }
        if (msg.includes("REASON_REQUIRED")) {
          throw new Error("Lý do mở khóa phải dài hơn 10 ký tự.");
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Mở khóa kỳ thành công", { description: "Các giao dịch trong kỳ có thể được sửa đổi" });
      queryClient.invalidateQueries({ queryKey: ["accounting-periods"] });
      setUnlockDialog({ open: false, period: null });
      setUnlockReason("");
    },
    onError: (error: Error) => {
      toast.error("Lỗi mở khóa kỳ", { description: error.message });
    },
  });

  const { page, pageSize, setPage, setPageSize, paginatedData: paginatedPeriods, totalPages, displayedCount, totalCount } =
    useTablePagination(periods ?? [], { defaultPageSize: 10 });

  // Quick lock presets
  const setLastMonthPeriod = () => {
    const lastMonth = subMonths(new Date(), 1);
    setPeriodStart(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
    setPeriodEnd(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
  };

  const setCurrentMonthPeriod = () => {
    setPeriodStart(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    setPeriodEnd(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  };

  return (
    <>
      <Header title="Kỳ kế toán" subtitle="Khóa kỳ để ngăn chặn sửa đổi dữ liệu tài chính trong khoảng thời gian đã chốt" />
      <PageContainer>
        <SectionCard>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Kỳ kế toán</CardTitle>
                    <CardDescription>
                      Khóa kỳ để ngăn chặn sửa đổi dữ liệu tài chính trong khoảng thời gian đã chốt
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Làm mới
                  </Button>
                  <Dialog open={lockDialog} onOpenChange={setLockDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Lock className="h-4 w-4 mr-1" />
                        Khóa kỳ mới
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Khóa kỳ kế toán</DialogTitle>
                        <DialogDescription>
                          Sau khi khóa, các giao dịch (thu tiền, chi tiền, chuyển khoản) trong khoảng thời gian này sẽ không thể tạo mới hoặc sửa đổi.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={setLastMonthPeriod}>
                            Tháng trước
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={setCurrentMonthPeriod}>
                            Tháng này
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Từ ngày <span className="text-destructive">*</span></Label>
                            <Input
                              type="date"
                              value={periodStart}
                              onChange={(e) => setPeriodStart(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Đến ngày <span className="text-destructive">*</span></Label>
                            <Input
                              type="date"
                              value={periodEnd}
                              onChange={(e) => setPeriodEnd(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Ghi chú</Label>
                          <Textarea
                            value={lockNote}
                            onChange={(e) => setLockNote(e.target.value)}
                            placeholder="Lý do khóa kỳ (tuỳ chọn)..."
                            rows={2}
                          />
                        </div>
                        <div className="p-3 bg-warning/5 border border-warning/20 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                            <div className="text-sm text-warning">
                              <p className="font-medium">Lưu ý quan trọng:</p>
                              <ul className="list-disc list-inside mt-1 text-warning">
                                <li>Không thể tạo thu tiền, chi tiền trong kỳ đã khóa</li>
                                <li>Không thể đảo bút toán trong kỳ đã khóa</li>
                                <li>Admin có thể mở khóa nếu cần thiết</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setLockDialog(false)}>
                          Huỷ
                        </Button>
                        <Button
                          onClick={() => lockMutation.mutate()}
                          disabled={!periodStart || !periodEnd || lockMutation.isPending}
                        >
                          {lockMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                          <Lock className="h-4 w-4 mr-1" />
                          Xác nhận khóa
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Table */}
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : periods && periods.length > 0 ? (
                <>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[180px]">Tên kỳ</TableHead>
                        <TableHead className="w-[120px]">Từ ngày</TableHead>
                        <TableHead className="w-[120px]">Đến ngày</TableHead>
                        <TableHead className="w-[100px]">Trạng thái</TableHead>
                        <TableHead className="w-[160px]">Khóa lúc</TableHead>
                        <TableHead className="w-[200px]">Ghi chú</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPeriods.map((period) => (
                        <TableRow key={period.id}>
                          <TableCell className="font-medium">
                            {period.period_name}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {period.period_start}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {period.period_end}
                          </TableCell>
                          <TableCell>
                            {period.is_locked ? (
                              <StatusBadge variant="danger">
                                <Lock className="h-3 w-3 mr-1" />
                                Đã khóa
                              </StatusBadge>
                            ) : (
                              <StatusBadge variant="success">
                                <Unlock className="h-3 w-3 mr-1" />
                                Mở
                              </StatusBadge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {period.locked_at ? format(new Date(period.locked_at), "dd/MM/yyyy HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                            {period.note}
                          </TableCell>
                          <TableCell>
                            {period.is_locked ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUnlockDialog({ open: true, period })}
                                className="text-warning border-warning/30 hover:bg-warning/5"
                              >
                                <Unlock className="h-4 w-4 mr-1" />
                                Mở khóa
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <DataTablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  displayedItems={displayedCount}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="kỳ"
                />
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chưa có kỳ kế toán nào được tạo</p>
                  <Button variant="outline" className="mt-4" onClick={() => setLockDialog(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Khóa kỳ đầu tiên
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </SectionCard>
      </PageContainer>

      {/* Unlock Dialog */}
      <Dialog open={unlockDialog.open} onOpenChange={(open) => !open && setUnlockDialog({ open: false, period: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-warning">Mở khóa kỳ kế toán</DialogTitle>
            <DialogDescription>
              Mở khóa sẽ cho phép sửa đổi dữ liệu trong kỳ. Hành động này được ghi log.
            </DialogDescription>
          </DialogHeader>
          {unlockDialog.period && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg space-y-1 text-sm">
                <div><strong>Kỳ:</strong> {unlockDialog.period.period_name}</div>
                <div><strong>Từ:</strong> {unlockDialog.period.period_start} <strong>Đến:</strong> {unlockDialog.period.period_end}</div>
                <div><strong>Khóa lúc:</strong> {unlockDialog.period.locked_at ? format(new Date(unlockDialog.period.locked_at), "dd/MM/yyyy HH:mm") : "N/A"}</div>
              </div>
              <div className="space-y-2">
                <Label>Lý do mở khóa <span className="text-destructive">*</span></Label>
                <Textarea
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="Nhập lý do mở khóa kỳ..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialog({ open: false, period: null })}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (unlockDialog.period && unlockReason.trim()) {
                  unlockMutation.mutate({ period: unlockDialog.period, reason: unlockReason.trim() });
                }
              }}
              disabled={!unlockReason.trim() || unlockMutation.isPending}
              className="bg-warning hover:bg-warning/80"
            >
              {unlockMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <Unlock className="h-4 w-4 mr-1" />
              Xác nhận mở khóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
