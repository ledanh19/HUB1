/**
 * PHASE II: Account Mapping Rules Management Page
 * - CRUD for account_mapping_rules table
 * - Archive/restore functionality
 * - Role guard: admin, ke_toan only
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Plus, Pencil, Archive, RotateCcw, Settings2, ArrowRight } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { MAPPING_RULE_OPTIONS, LINK_PROVIDER_OPTIONS, getPaymentMethodLabel } from "@/constants/paymentMethods";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";

interface MappingRule {
  id: string;
  rule_name: string;
  direction: string | null;
  source_type: string | null;
  payment_type: string | null;
  payment_method: string | null;
  link_provider: string | null;
  counterparty_type: string | null;
  cash_account_id: string;
  priority: number;
  is_archived: boolean;
  created_at: string;
  cash_account?: { account_code: string; account_name: string };
}

interface CashAccount {
  id: string;
  account_code: string;
  account_name: string;
  bank_name: string | null;
  account_number: string | null;
  note: string | null;
  is_default: boolean;
  is_archived: boolean;
}

// Helper to mask account number
function maskAccountNumber(accountNumber: string | null): string {
  if (!accountNumber) return "";
  const cleaned = accountNumber.replace(/\s/g, "");
  if (cleaned.length <= 4) return cleaned;
  return "****" + cleaned.slice(-4);
}

// Helper to show priority as human-readable label
function getPriorityLabel(priority: number): { label: string; variant: "default" | "secondary" | "outline" } {
  if (priority <= 10) return { label: "Cao", variant: "default" };
  if (priority <= 100) return { label: "Trung bình", variant: "secondary" };
  return { label: "Thấp", variant: "outline" };
}

// Helper to format rule as human-readable string
function formatRuleHumanReadable(rule: MappingRule): string {
  const parts: string[] = [];

  // Direction
  if (rule.direction === "IN") parts.push("Thu tiền");
  else if (rule.direction === "OUT") parts.push("Chi tiền");
  else parts.push("Tất cả giao dịch");

  // Payment method
  if (rule.payment_method) {
    parts.push(getPaymentMethodLabel(rule.payment_method));
    // Show link provider if specified
    if (rule.payment_method === "PAYMENT_LINK" && rule.link_provider) {
      const providerLabel = LINK_PROVIDER_OPTIONS.find(p => p.value === rule.link_provider)?.label || rule.link_provider;
      parts.push(`(${providerLabel})`);
    }
  }

  // Source type
  if (rule.source_type) {
    const sourceLabel = SOURCE_TYPES.find((t) => t.value === rule.source_type)?.label || rule.source_type;
    parts.push(sourceLabel);
  }

  return parts.join(" • ");
}

// Format account for dropdown display
function formatAccountOption(acc: CashAccount): string {
  let display = `${acc.account_code} — ${acc.account_name}`;
  if (acc.bank_name) {
    display += ` (${acc.bank_name}`;
    if (acc.account_number) {
      display += ` ${maskAccountNumber(acc.account_number)}`;
    }
    display += ")";
  }
  if (acc.note) {
    const truncNote = acc.note.length > 20 ? acc.note.slice(0, 20) + "..." : acc.note;
    display += ` — ${truncNote}`;
  }
  return display;
}

const DIRECTIONS = [
  { value: "", label: "Tất cả" },
  { value: "IN", label: "Tiền vào (IN)" },
  { value: "OUT", label: "Tiền ra (OUT)" },
];

const SOURCE_TYPES = [
  { value: "", label: "Tất cả" },
  { value: "HOTEL_COLLECT", label: "Thu tiền (Hotel Collect)" },
  { value: "CASH_OUT", label: "Chi tiền (Cash Out)" },
  { value: "OTA_PAYOUT", label: "OTA Payout" },
  { value: "HOST_SETTLEMENT", label: "Thanh toán Host" },
];

export default function MappingRulesPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<MappingRule | null>(null);
  const [formData, setFormData] = useState({
    rule_name: "",
    direction: "",
    source_type: "",
    payment_method: "",
    link_provider: "",
    cash_account_id: "",
    priority: 100,
  });

  // Fetch accounts for select - with full info for dropdown display
  const { data: accounts } = useQuery({
    queryKey: ["cash-accounts-active"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("id, account_code, account_name, bank_name, account_number, note, is_default, is_archived")
        .eq("is_archived", false)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("account_code", { ascending: true });
      if (error) throw error;
      return data as CashAccount[];
    },
  });

  // Fetch mapping rules with account details
  const { data: rules, isLoading } = useQuery({
    queryKey: ["mapping-rules", showArchived],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("account_mapping_rules")
        .select(`
          *,
          cash_account:cash_accounts!account_mapping_rules_cash_account_id_fkey(account_code, account_name)
        `)
        .order("priority", { ascending: true })
        .order("rule_name");

      if (!showArchived) {
        query = query.eq("is_archived", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as MappingRule[];
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const todayIso = new Date().toISOString();

      const insertData = {
        org_id: "00000000-0000-0000-0000-000000000001",
        effective_from: todayIso,
        rule_name: data.rule_name,
        direction: data.direction || null,
        source_type: data.source_type || null,
        payment_method: data.payment_method || null,
        link_provider:
          data.payment_method === "PAYMENT_LINK" && data.link_provider
            ? data.link_provider
            : null,
        cash_account_id: data.cash_account_id,
        priority: data.priority,
      };
      const { error } = await safeMutation(() => supabase.from("account_mapping_rules").insert(insertData));
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thành công", { description: "Đã tạo quy tắc mapping" });
      queryClient.invalidateQueries({ queryKey: ["mapping-rules"] });
      handleCloseDialog();
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) {
        toast.error("Lỗi", { description: "Quy tắc này đã tồn tại" });
      } else {
        toast.error("Lỗi", { description: err.message });
      }
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & typeof formData) => {
      const { id, ...rest } = data;
      const updateData = {
        rule_name: rest.rule_name,
        direction: rest.direction || null,
        source_type: rest.source_type || null,
        payment_method: rest.payment_method || null,
        link_provider: rest.payment_method === "PAYMENT_LINK" && rest.link_provider ? rest.link_provider : null,
        cash_account_id: rest.cash_account_id,
        priority: rest.priority,
      };
      const { error } = await supabase
        .from("account_mapping_rules")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thành công", { description: "Đã cập nhật quy tắc" });
      queryClient.invalidateQueries({ queryKey: ["mapping-rules"] });
      handleCloseDialog();
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { error } = await supabase
        .from("account_mapping_rules")
        .update({ is_archived: archive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { archive }) => {
      toast.success("Thành công", { description: archive ? "Đã lưu trữ" : "Đã khôi phục" });
      queryClient.invalidateQueries({ queryKey: ["mapping-rules"] });
    },
    onError: (err: any) => {
      toast.error("Lỗi", { description: err.message });
    },
  });

  const rulesPagination = useTablePagination(rules || [], { defaultPageSize: 10, resetDeps: [showArchived] });

  const handleOpenCreate = () => {
    setEditingRule(null);
    setFormData({
      rule_name: "",
      direction: "",
      source_type: "",
      payment_method: "",
      link_provider: "",
      cash_account_id: accounts?.[0]?.id || "",
      priority: 100,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (rule: MappingRule) => {
    setEditingRule(rule);
    setFormData({
      rule_name: rule.rule_name,
      direction: rule.direction || "",
      source_type: rule.source_type || "",
      payment_method: rule.payment_method || "",
      link_provider: rule.link_provider || "",
      cash_account_id: rule.cash_account_id,
      priority: rule.priority,
    });
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingRule(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rule_name.trim() || !formData.cash_account_id) {
      toast.error("Lỗi", { description: "Vui lòng nhập tên quy tắc và chọn tài khoản" });
      return;
    }

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <>
      <Header title="Quy tắc Mapping Tài khoản" subtitle="Thiết lập quy tắc tự động chọn tài khoản" />
      <PageContainer><SectionCard>
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  Quy tắc Mapping Tài khoản
                </CardTitle>
                <CardDescription>
                  Thiết lập quy tắc tự động chọn tài khoản. Priority thấp = ưu tiên cao hơn.
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
                <Button onClick={handleOpenCreate} disabled={!accounts?.length}>
                  <Plus className="h-4 w-4 mr-2" />
                  Thêm quy tắc
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !rules?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chưa có quy tắc nào. Hãy tạo tài khoản tiền trước.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Tên quy tắc</TableHead>
                        <TableHead className="w-[280px]">Điều kiện</TableHead>
                        <TableHead className="w-[220px]"><ArrowRight className="h-4 w-4 inline" /> Tài khoản đích</TableHead>
                        <TableHead className="w-[100px] text-center">Ưu tiên</TableHead>
                        <TableHead className="w-[120px] text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rulesPagination.paginatedData.map((rule) => {
                        const priorityInfo = getPriorityLabel(rule.priority);
                        return (
                          <TableRow key={rule.id} className={rule.is_archived ? "opacity-60" : ""}>
                            <TableCell className="font-medium">{rule.rule_name}</TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {formatRuleHumanReadable(rule)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-sm">
                                {rule.cash_account?.account_code}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1">
                                ({rule.cash_account?.account_name})
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={priorityInfo.variant}>{priorityInfo.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEdit(rule)}
                                  disabled={rule.is_archived}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {rule.is_archived ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => archiveMutation.mutate({ id: rule.id, archive: false })}
                                    disabled={archiveMutation.isPending}
                                    title="Khôi phục"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => archiveMutation.mutate({ id: rule.id, archive: true })}
                                    disabled={archiveMutation.isPending}
                                    title="Lưu trữ"
                                  >
                                    <Archive className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <DataTablePagination
                    currentPage={rulesPagination.page}
                    totalPages={rulesPagination.totalPages}
                    totalItems={rulesPagination.totalCount}
                    displayedItems={rulesPagination.displayedCount}
                    pageSize={rulesPagination.pageSize}
                    onPageChange={rulesPagination.setPage}
                    onPageSizeChange={rulesPagination.setPageSize}
                    itemLabel="rule"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>
                {editingRule ? "Sửa quy tắc mapping" : "Thêm quy tắc mapping"}
              </DialogTitle>
              <DialogDescription>
                Thiết lập tự động ghi sổ Nợ/Có khi có giao dịch
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Tên quy tắc *</Label>
                <Input
                  value={formData.rule_name}
                  onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                  placeholder="VD: Thu tiền mặt từ khách"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hướng tiền</Label>
                  <Select
                    value={formData.direction || "ALL"}
                    onValueChange={(value) => setFormData({ ...formData, direction: value === "ALL" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECTIONS.map((d) => (
                        <SelectItem key={d.value || "ALL"} value={d.value || "ALL"}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Loại nguồn</Label>
                  <Select
                    value={formData.source_type || "ALL"}
                    onValueChange={(value) => setFormData({ ...formData, source_type: value === "ALL" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map((s) => (
                        <SelectItem key={s.value || "ALL"} value={s.value || "ALL"}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PT Thanh toán</Label>
                  <Select
                    value={formData.payment_method || "ALL"}
                    onValueChange={(value) => setFormData({
                      ...formData,
                      payment_method: value === "ALL" ? "" : value,
                      // Reset link_provider when payment method changes
                      link_provider: value === "PAYMENT_LINK" ? formData.link_provider : ""
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAPPING_RULE_OPTIONS.map((m) => (
                        <SelectItem key={m.value || "ALL"} value={m.value || "ALL"}>
                          <div className="flex items-center gap-2">{m.value && <PaymentMethodIcon code={m.value} className="h-3.5 w-3.5 text-muted-foreground" />}{m.label}</div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Mức ưu tiên (tự động)</Label>
                  <div className="rounded-md bg-muted px-3 py-2 text-sm">
                    {(() => {
                      // Calculate predicted priority based on specificity
                      const specs = [
                        formData.direction !== "",
                        formData.source_type !== "",
                        formData.payment_method !== "",
                        formData.payment_method === "PAYMENT_LINK" && formData.link_provider !== "",
                      ].filter(Boolean).length;
                      if (specs === 0) return <span className="text-muted-foreground">Thấp (catch-all)</span>;
                      if (specs === 1) return <span className="text-warning">Trung bình</span>;
                      return <span className="text-success font-medium">Cao</span>;
                    })()}
                  </div>
                </div>
              </div>

              {/* Link Provider - only show when PAYMENT_LINK is selected */}
              {formData.payment_method === "PAYMENT_LINK" && (
                <div className="space-y-2">
                  <Label>Đơn vị cung cấp link</Label>
                  <Select
                    value={formData.link_provider || "ALL"}
                    onValueChange={(value) => setFormData({ ...formData, link_provider: value === "ALL" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả (mọi link provider)</SelectItem>
                      {LINK_PROVIDER_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <div className="flex items-center gap-2"><PaymentMethodIcon code={p.value} className="h-3.5 w-3.5 text-muted-foreground" />{p.label}</div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Chọn đơn vị cụ thể để mapping riêng từng link (OnePay, 9Pay...). Để "Tất cả" nếu muốn áp dụng chung.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Tài khoản đích *</Label>
                <Select
                  value={formData.cash_account_id}
                  onValueChange={(value) => setFormData({ ...formData, cash_account_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn tài khoản" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts?.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <div className="flex items-center gap-2">
                          {acc.is_default && <Badge variant="outline" className="text-xs px-1">Mặc định</Badge>}
                          <span>{formatAccountOption(acc)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  {editingRule ? "Cập nhật" : "Tạo mới"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SectionCard></PageContainer>
    </>
  );
}
