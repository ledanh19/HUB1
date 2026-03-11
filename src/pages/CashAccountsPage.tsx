/**
 * PHASE II: Cash Accounts Management Page
 * - CRUD for cash_accounts table
 * - Archive/restore functionality
 * - Set default account
 * - Role guard: admin, ke_toan only
 * 
 * UPDATED: Auto-generate account_code via RPC
 * - User không cần nhập Mã tài khoản
 * - Thêm trường Ghi chú (note)
 * - Hiển thị: Ngân hàng, Số TK (masked), Ghi chú
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation, safeRpc } from "@/integrations/supabase";
import { toast } from "sonner";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Archive, RotateCcw, Star, Wallet, Building2, CreditCard } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";

interface CashAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  bank_name: string | null;
  account_number: string | null;
  note: string | null;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
}

// Mask account number: 123456789 -> ****6789
function maskAccountNumber(accountNumber: string | null): string {
  if (!accountNumber) return "—";
  const cleaned = accountNumber.replace(/\s/g, "");
  if (cleaned.length <= 4) return cleaned;
  return "****" + cleaned.slice(-4);
}

const ACCOUNT_TYPES = [
  { value: "CASH", label: "Tiền mặt", icon: "💵" },
  { value: "BANK", label: "Ngân hàng", icon: "🏦" },
  { value: "DIGITAL_WALLET", label: "Ví điện tử", icon: "📱" },
];

export default function CashAccountsPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CashAccount | null>(null);
  const [autoCode, setAutoCode] = useState(true); // Toggle auto/manual code
  const [formData, setFormData] = useState({
    account_name: "",
    account_type: "BANK",
    bank_name: "",
    account_number: "",
    note: "",
    is_default: false,
    manual_code: "", // For manual code input
  });

  // Get next auto code preview
  const { data: nextCodePreview } = useQuery({
    queryKey: ["cash-accounts-next-code"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("account_code")
        .order("account_code", { ascending: false })
        .limit(1);
      if (error) throw error;
      // Extract numeric part and increment
      if (data && data.length > 0) {
        const lastCode = data[0].account_code;
        // Try to extract number from end of code
        const match = lastCode.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1]) + 1;
          return num.toString().padStart(3, "0");
        }
      }
      return "001";
    },
    enabled: dialogOpen && !editingAccount && autoCode,
  });

  // Fetch accounts
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["cash-accounts", showArchived],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("cash_accounts")
        .select("id, account_code, account_name, account_type, bank_name, account_number, note, is_default, is_archived, created_at")
        .order("is_default", { ascending: false })
        .order("account_code", { ascending: true });

      if (!showArchived) {
        query = query.eq("is_archived", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CashAccount[];
    },
  });

  const accountsList = accounts || [];
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(accountsList, { defaultPageSize: 10, resetDeps: [showArchived] });

  // Create mutation - Use RPC for auto account_code OR direct insert for manual
  const createMutation = useMutation({
    mutationFn: async (data: {
      account_name: string;
      account_type: string;
      bank_name?: string;
      account_number?: string;
      note?: string;
      is_default?: boolean;
      manual_code?: string;
    }) => {
      // If manual code is provided (autoCode OFF), use direct insert
      if (!autoCode && data.manual_code) {
        // Handle default - unset others first
        if (data.is_default) {
          await safeMutation(() => supabase.from("cash_accounts").update({ is_default: false }).neq("id", ""));
        }
        const { data: newAccount, error } = await safeMutation(() => supabase.from("cash_accounts").insert({
          account_code: data.manual_code,
          account_name: data.account_name,
          account_type: data.account_type,
          bank_name: data.bank_name || null,
          account_number: data.account_number || null,
          note: data.note || null,
          is_default: data.is_default || false,
        }).select("id").single());
        if (error) throw error;
        return newAccount.id;
      }
      // Otherwise use RPC for auto code
      const { data: accountId, error } = await safeRpc(() => supabase.rpc("create_cash_account_atomic", {
        p_account_name: data.account_name,
        p_account_type: data.account_type,
        p_bank_name: data.bank_name || null,
        p_account_number: data.account_number || null,
        p_note: data.note || null,
        p_is_default: data.is_default || false,
      }));
      if (error) throw error;
      return accountId;
    },
    onSuccess: () => {
      toast.success("Thành công", { description: autoCode ? "Đã tạo tài khoản - Mã tự động sinh" : "Đã tạo tài khoản với mã tùy chỉnh" });
      queryClient.invalidateQueries({ queryKey: ["cash-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["cash-accounts-next-code"] });
      handleCloseDialog();
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  // Update mutation - Use RPC
  const updateMutation = useMutation({
    mutationFn: async (data: {
      id: string;
      account_name: string;
      account_type: string;
      bank_name?: string;
      account_number?: string;
      note?: string;
    }) => {
      const { data: success, error } = await safeRpc(() => supabase.rpc("update_cash_account_atomic", {
        p_account_id: data.id,
        p_account_name: data.account_name,
        p_account_type: data.account_type,
        p_bank_name: data.bank_name || null,
        p_account_number: data.account_number || null,
        p_note: data.note || null,
      }));
      if (error) throw error;
      return success;
    },
    onSuccess: () => {
      toast.success("Thành công", { description: "Đã cập nhật tài khoản" });
      queryClient.invalidateQueries({ queryKey: ["cash-accounts"] });
      handleCloseDialog();
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  // Archive mutation - Use RPC
  const archiveMutation = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { data, error } = await safeRpc(() => supabase.rpc("archive_cash_account", {
        p_account_id: id,
        p_archive: archive,
      }));
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { archive }) => {
      toast.success("Thành công", { description: archive ? "Đã lưu trữ" : "Đã khôi phục" });
      queryClient.invalidateQueries({ queryKey: ["cash-accounts"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  // Set default mutation - Use RPC
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await safeRpc(() => supabase.rpc("set_default_cash_account", {
        p_account_id: id,
      }));
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Thành công", { description: "Đã đặt làm mặc định" });
      queryClient.invalidateQueries({ queryKey: ["cash-accounts"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setAutoCode(true);
    setFormData({ account_name: "", account_type: "BANK", bank_name: "", account_number: "", note: "", is_default: false, manual_code: "" });
    setDialogOpen(true);
  };

  const handleOpenEdit = (account: CashAccount) => {
    setEditingAccount(account);
    setAutoCode(false); // When editing, code is fixed
    setFormData({
      account_name: account.account_name,
      account_type: account.account_type,
      bank_name: account.bank_name || "",
      account_number: account.account_number || "",
      note: account.note || "",
      is_default: account.is_default,
      manual_code: account.account_code,
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingAccount(null);
    setAutoCode(true);
    setFormData({ account_name: "", account_type: "BANK", bank_name: "", account_number: "", note: "", is_default: false, manual_code: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.account_name.trim()) {
      toast.error("Lỗi", { description: "Vui lòng nhập tên tài khoản" });
      return;
    }

    // Validate manual code if autoCode is OFF
    if (!editingAccount && !autoCode && !formData.manual_code.trim()) {
      toast.error("Lỗi", { description: "Vui lòng nhập mã tài khoản" });
      return;
    }

    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <>
      <Header title="Tài khoản tiền" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Quản lý Tài khoản Tiền
                  </CardTitle>
                  <CardDescription>
                    Thiết lập các tài khoản tiền mặt, ngân hàng cho hệ thống Finance Ledger
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="show-archived"
                      checked={showArchived}
                      onCheckedChange={setShowArchived}
                    />
                    <Label htmlFor="show-archived" className="text-sm">
                      Hiện đã lưu trữ
                    </Label>
                  </div>
                  <Button onClick={handleOpenCreate}>
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm tài khoản
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !accountsList.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Chưa có tài khoản nào
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Mã TK</TableHead>
                        <TableHead className="w-[160px]">Tên tài khoản</TableHead>
                        <TableHead className="w-[120px]">Loại</TableHead>
                        <TableHead className="w-[120px]">Ngân hàng</TableHead>
                        <TableHead className="w-[100px]">Số TK</TableHead>
                        <TableHead className="w-[150px]">Ghi chú</TableHead>
                        <TableHead className="w-[100px] text-center">Mặc định</TableHead>
                        <TableHead className="w-[100px]">Trạng thái</TableHead>
                        <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((account) => (
                        <TableRow key={account.id} className={account.is_archived ? "opacity-60" : ""}>
                          <TableCell className="font-mono text-xs">{account.account_code}</TableCell>
                          <TableCell className="font-medium">
                            {account.account_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="whitespace-nowrap">
                              {ACCOUNT_TYPES.find((t) => t.value === account.account_type)?.icon}{" "}
                              {ACCOUNT_TYPES.find((t) => t.value === account.account_type)?.label || account.account_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {account.bank_name || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {maskAccountNumber(account.account_number)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-40 truncate" title={account.note || ""}>
                            {account.note || "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {account.is_default ? (
                              <Badge variant="default" className="gap-1">
                                <Star className="h-3 w-3" />
                                Mặc định
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {account.is_archived ? (
                              <Badge variant="secondary">Lưu trữ</Badge>
                            ) : (
                              <Badge variant="outline" className="text-success">Hoạt động</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!account.is_archived && !account.is_default && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDefaultMutation.mutate(account.id)}
                                  disabled={setDefaultMutation.isPending}
                                  title="Đặt làm mặc định"
                                >
                                  <Star className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEdit(account)}
                                disabled={account.is_archived}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {account.is_archived ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => archiveMutation.mutate({ id: account.id, archive: false })}
                                  disabled={archiveMutation.isPending}
                                  title="Khôi phục"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              ) : !account.is_default ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => archiveMutation.mutate({ id: account.id, archive: true })}
                                  disabled={archiveMutation.isPending}
                                  title="Lưu trữ"
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {accountsList.length > 0 && (
                  <DataTablePagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    displayedItems={displayedCount}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    itemLabel="tài khoản"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </SectionCard>
      </PageContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "Sửa tài khoản" : "Thêm tài khoản mới"}
            </DialogTitle>
            <DialogDescription>
              {editingAccount ? "Cập nhật thông tin tài khoản tiền" : "Tạo tài khoản tiền mới cho hệ thống"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Loại tài khoản - đặt lên đầu */}
            <div className="space-y-2">
              <Label htmlFor="account_type">Loại tài khoản</Label>
              <Select
                value={formData.account_type}
                onValueChange={(value) => setFormData({ ...formData, account_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_name">Tên tài khoản <span className="text-destructive">*</span></Label>
              <Input
                id="account_name"
                value={formData.account_name}
                onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                placeholder="VD: Tiền mặt chính, Vietcombank..."
                required
              />
            </div>

            {/* Hiện thêm fields khi là BANK hoặc DIGITAL_WALLET */}
            {(formData.account_type === "BANK" || formData.account_type === "DIGITAL_WALLET") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="bank_name">
                    {formData.account_type === "BANK" ? "Tên ngân hàng" : "Nhà cung cấp (VD: Momo, ZaloPay)"}
                  </Label>
                  <Input
                    id="bank_name"
                    value={formData.bank_name}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    placeholder={formData.account_type === "BANK" ? "VD: Vietcombank, MB Bank" : "VD: Momo, ZaloPay"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account_number">Số tài khoản / ID</Label>
                  <Input
                    id="account_number"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    placeholder="VD: 123456789"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="note">Ghi chú</Label>
              <Textarea
                id="note"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="Ghi chú thêm cho tài khoản..."
                rows={2}
              />
            </div>

            {/* Checkbox set default khi tạo mới */}
            {!editingAccount && (
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <Label htmlFor="is_default">Đặt làm tài khoản mặc định</Label>
              </div>
            )}

            {/* Toggle auto/manual code khi tạo mới */}
            {!editingAccount && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto_code">Tự sinh mã tài khoản</Label>
                  <Switch
                    id="auto_code"
                    checked={autoCode}
                    onCheckedChange={setAutoCode}
                  />
                </div>
                {autoCode ? (
                  <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                    <Building2 className="inline h-4 w-4 mr-2" />
                    Mã sẽ tự sinh: <code className="font-mono font-bold text-foreground">{nextCodePreview || "..."}</code>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="manual_code">Mã tài khoản (tùy chỉnh)</Label>
                    <Input
                      id="manual_code"
                      value={formData.manual_code}
                      onChange={(e) => setFormData({ ...formData, manual_code: e.target.value.toUpperCase() })}
                      placeholder="VD: BANK_VCB, CASH_MAIN"
                      required={!autoCode}
                    />
                    <p className="text-xs text-muted-foreground">Nhập mã tùy chỉnh (chữ IN HOA, không dấu)</p>
                  </div>
                )}
              </div>
            )}

            {/* Hiển thị mã hiện tại khi edit */}
            {editingAccount && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <CreditCard className="inline h-4 w-4 mr-2" />
                Mã tài khoản: <code className="font-mono font-bold">{editingAccount.account_code}</code>
                <span className="text-muted-foreground ml-2">(không đổi)</span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Huỷ
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingAccount ? "Cập nhật" : "Tạo mới"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
