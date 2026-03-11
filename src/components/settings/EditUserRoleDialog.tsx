import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield, Info, CheckCircle2, AlertCircle, Eye, MousePointerClick } from "lucide-react";
import { ALL_PAGES, useUserPagePermissions, getDefaultPagesForRole, PagePermission } from "@/hooks/useUserPagePermissions";

type AppRole = "admin" | "sale" | "cskh" | "ke_toan" | "super_admin" | "ota_lead" | "ota_staff";

// Permission state per page: { canView, canUse }
interface PagePermissionState {
  canView: boolean;
  canUse: boolean;
}

interface UserWithRole {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
}

interface EditUserRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRole | null;
}

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Chủ đầu tư",
  ke_toan: "Kế toán",
  cskh: "CSKH",
  sale: "Vận hành",
  ota_lead: "OTA Lead",
  ota_staff: "OTA Staff",
};

const roleDescriptions: Record<string, string> = {
  admin: "Toàn quyền quản lý nghiệp vụ, phân quyền user",
  ke_toan: "Tài chính, Thu/Chi, Quyết toán, Báo cáo",
  cskh: "Hỗ trợ khách hàng, Dịch vụ, Thu tiền",
  sale: "Vận hành, Nhận/Trả phòng, Thu tiền",
  ota_lead: "Quản lý đội OTA, Projects, Tasks, KPI",
  ota_staff: "Xử lý tasks OTA, Tin nhắn",
};

// Pages with sensitive actions that need can_use control
// These pages have Create, Edit, Delete, Approve, or other mutation actions
const PAGES_WITH_ACTIONS = [
  // Vận hành lưu trú
  '/stays',           // Check-in/out, Assign room, Collect payment
  '/bookings',        // Create booking, Check-in/out, Collect payment, Assign room
  '/customers',       // Create/Edit customer
  '/settings/properties', // Create/Edit property
  '/stays/declarations', // Create declaration

  // Dịch vụ
  '/services',        // Create service order
  '/services/reports', // Export

  // OTA & Đối soát
  '/ota-payouts',     // Create payout
  '/disputes',        // Create/Update dispute

  // Công nợ
  '/host-deposits',   // Create deposit request
  '/host-payables',   // Sync, Export
  '/host-payables/aging', // Export
  '/host-payables/settlement', // Approve, Reject, Mark as Paid
  '/services/payables', // Settlement actions

  // Tài chính & Dòng tiền
  '/settlements/history', // Export
  '/payments/requests', // Create, Approve, Reject
  '/collections',       // Create collection, Refund, Void
  '/payments/cashout',  // Create cash-out
  '/settings/cash-transfers', // Create transfer
  '/settings/cash-accounts', // Create/Edit account
  '/settings/mapping-rules', // Create/Edit rule
  '/settings/ledger-entries', // Manual entry
  '/settings/accounting-periods', // Close period

  // Báo cáo
  '/reports/pnl',       // Export
  '/reports/cashflow',  // Export
  '/reports/no-show',   // Export

  // Channel Manager
  '/channel-manager/channex', // Sync
  '/channel-manager/inventory', // Sync, Update

  // OTA Operations
  '/ota-operations/projects', // Create/Edit project, Manage members
  '/ota-operations/tasks',    // Create/Update task, Submit evidence
  '/ota-operations/kpi',      // Export KPI

  // Kiểm soát
  '/approvals',         // Approve/Reject

  // Đối tác
  '/partners',          // Create/Edit/Archive partner
];

// Group pages by category
const groupedPages = ALL_PAGES.reduce((acc, page) => {
  if (!acc[page.category]) {
    acc[page.category] = [];
  }
  acc[page.category].push(page);
  return acc;
}, {} as Record<string, typeof ALL_PAGES>);

// Category order matching sidebar navigation exactly
const categoryOrder = [
  'Dashboard',
  'Đối tác',
  'Vận hành lưu trú',
  'Dịch vụ',
  'Tin nhắn OTA',
  'OTA & Đối soát',
  'Công nợ',
  'Tài chính & Dòng tiền',
  'Báo cáo',
  'Channel Manager',
  'AI Smart Pricing',
  'OTA Operations',
  'Kiểm soát & Hệ thống',
  'Cài đặt',
];

export function EditUserRoleDialog({ open, onOpenChange, user }: EditUserRoleDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("");
  // Map: path -> { canView, canUse }
  const [pagePermissions, setPagePermissions] = useState<Map<string, PagePermissionState>>(new Map());

  const { rawPermissions, loading: permissionsLoading, updatePermissionsWithCanUse } = useUserPagePermissions(user?.id);

  // Calculate default pages for current role
  const defaultPagesForRole = useMemo(() => {
    return getDefaultPagesForRole(selectedRole as AppRole);
  }, [selectedRole]);

  // Selected pages (those with canView = true)
  const selectedPages = useMemo(() => {
    return Array.from(pagePermissions.entries())
      .filter(([_, state]) => state.canView)
      .map(([path]) => path);
  }, [pagePermissions]);

  // Check if using custom permissions vs default
  const isUsingCustomPermissions = useMemo(() => {
    if (pagePermissions.size === 0) return false;
    const defaultSet = new Set<string>(defaultPagesForRole);
    const currentSet = new Set<string>(selectedPages);
    if (defaultSet.size !== currentSet.size) return true;
    for (const page of Array.from(defaultSet)) {
      if (!currentSet.has(page)) return true;
    }
    return false;
  }, [selectedPages, defaultPagesForRole, pagePermissions]);

  useEffect(() => {
    if (user) {
      setSelectedRole(user.role || "sale");
    }
  }, [user]);

  useEffect(() => {
    if (rawPermissions && rawPermissions.length > 0) {
      // Load from DB permissions
      const newMap = new Map<string, PagePermissionState>();
      const allowed = new Set(ALL_PAGES.map((p) => p.path));

      rawPermissions.forEach((p: PagePermission) => {
        const path = p.page_path;
        if (allowed.has(path)) {
          newMap.set(path, { canView: true, canUse: p.can_use });
        }
      });

      setPagePermissions(newMap);
    } else if (selectedRole) {
      // Use default pages for role if no explicit permissions
      const defaults = getDefaultPagesForRole(selectedRole as AppRole);
      const newMap = new Map<string, PagePermissionState>();
      defaults.forEach(path => {
        // By default, view-only for non-admin unless it's a non-action page
        const defaultCanUse = selectedRole === 'admin' || selectedRole === 'ke_toan' || !PAGES_WITH_ACTIONS.includes(path);
        newMap.set(path, { canView: true, canUse: defaultCanUse });
      });
      setPagePermissions(newMap);
    }
  }, [rawPermissions, selectedRole]);

  const handlePageToggle = (pagePath: string) => {
    setPagePermissions(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(pagePath);
      if (current?.canView) {
        // Remove page entirely
        newMap.delete(pagePath);
      } else {
        // Add page with default canUse
        const defaultCanUse = selectedRole === 'admin' || selectedRole === 'ke_toan' || !PAGES_WITH_ACTIONS.includes(pagePath);
        newMap.set(pagePath, { canView: true, canUse: defaultCanUse });
      }
      return newMap;
    });
  };

  const handleCanUseToggle = (pagePath: string) => {
    setPagePermissions(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(pagePath);
      if (current) {
        newMap.set(pagePath, { ...current, canUse: !current.canUse });
      }
      return newMap;
    });
  };

  const handleSelectAllCategory = (category: string) => {
    const categoryPages = groupedPages[category].map(p => p.path);
    const allSelected = categoryPages.every(p => pagePermissions.get(p)?.canView);

    setPagePermissions(prev => {
      const newMap = new Map(prev);
      if (allSelected) {
        categoryPages.forEach(p => newMap.delete(p));
      } else {
        categoryPages.forEach(p => {
          if (!newMap.get(p)?.canView) {
            const defaultCanUse = selectedRole === 'admin' || selectedRole === 'ke_toan' || !PAGES_WITH_ACTIONS.includes(p);
            newMap.set(p, { canView: true, canUse: defaultCanUse });
          }
        });
      }
      return newMap;
    });
  };

  const handleSelectAll = () => {
    if (selectedPages.length === ALL_PAGES.length) {
      setPagePermissions(new Map());
    } else {
      const newMap = new Map<string, PagePermissionState>();
      ALL_PAGES.forEach(p => {
        const defaultCanUse = selectedRole === 'admin' || selectedRole === 'ke_toan' || !PAGES_WITH_ACTIONS.includes(p.path);
        newMap.set(p.path, { canView: true, canUse: defaultCanUse });
      });
      setPagePermissions(newMap);
    }
  };

  const handleResetToDefault = () => {
    const defaults = getDefaultPagesForRole(selectedRole as AppRole);
    const newMap = new Map<string, PagePermissionState>();
    defaults.forEach(path => {
      const defaultCanUse = selectedRole === 'admin' || selectedRole === 'ke_toan' || !PAGES_WITH_ACTIONS.includes(path);
      newMap.set(path, { canView: true, canUse: defaultCanUse });
    });
    setPagePermissions(newMap);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !selectedRole) {
      toast.error("Vui lòng chọn vai trò");
      return;
    }

    if (selectedPages.length === 0) {
      toast.error("Vui lòng chọn ít nhất một trang");
      return;
    }

    setLoading(true);

    try {
      // Update role
      const { data: existingRole, error: checkError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingRole) {
        const { error: updateError } = await supabase
          .from("user_roles")
          .update({ role: selectedRole as AppRole })
          .eq("user_id", user.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("user_roles")
          .insert({
            user_id: user.id,
            role: selectedRole as AppRole,
          });

        if (insertError) throw insertError;
      }

      // Update page permissions with can_use
      const permissionsToSave = Array.from(pagePermissions.entries())
        .filter(([_, state]) => state.canView)
        .map(([path, state]) => ({ path, can_use: state.canUse }));

      const { error: permError } = await updatePermissionsWithCanUse(permissionsToSave);
      if (permError) {
        // Show warning if audit log failed but permissions saved
        if (permError.message.includes('audit log failed')) {
          toast.warning(permError.message);
        } else {
          throw permError;
        }
      } else {
        toast.success("Cập nhật phân quyền thành công");
      }

      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating permissions:", error);
      toast.error(error.message || "Lỗi khi cập nhật phân quyền");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            Phân quyền người dùng
          </DialogTitle>
          <DialogDescription>
            Cấu hình vai trò và trang được truy cập. Quyền được bảo vệ bằng RLS ở database.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* User Info */}
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">
                {user.full_name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || "U"}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-medium">{user.full_name || "—"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant={user.role === 'super_admin' ? 'destructive' : user.role === 'admin' ? 'default' : 'secondary'}>
              {roleLabels[user.role] || user.role}
            </Badge>
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">Vai trò</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(roleLabels)
                  .filter(([value]) => value !== "super_admin")
                  .map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex flex-col py-1">
                        <span>{label}</span>
                        {roleDescriptions[value] && (
                          <span className="text-xs text-muted-foreground">{roleDescriptions[value]}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page Permissions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Trang được phép truy cập</Label>
                <p className="text-xs text-muted-foreground">
                  {isUsingCustomPermissions ? (
                    <span className="flex items-center gap-1 text-warning">
                      <AlertCircle className="h-3 w-3" />
                      Đang dùng quyền tùy chỉnh (khác mặc định vai trò)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      Đang dùng quyền mặc định của vai trò
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetToDefault}
                >
                  Reset về mặc định
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedPages.length === ALL_PAGES.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </Button>
              </div>
            </div>

            {permissionsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <ScrollArea className="h-[320px] border rounded-lg">
                <div className="p-4 space-y-4">
                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pb-2 border-b">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Xem = vào trang được
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="h-3 w-3" /> Thao tác = được dùng chức năng
                    </span>
                  </div>

                  {categoryOrder
                    .filter(category => groupedPages[category])
                    .map((category) => {
                      const pages = groupedPages[category];
                      const allSelected = pages.every(p => pagePermissions.get(p.path)?.canView);

                      return (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center gap-2 pb-1 border-b border-border/50">
                            <Checkbox
                              id={`category-${category}`}
                              checked={allSelected}
                              onCheckedChange={() => handleSelectAllCategory(category)}
                            />
                            <Label
                              htmlFor={`category-${category}`}
                              className="font-medium text-sm cursor-pointer flex items-center gap-2"
                            >
                              {category}
                              <span className="text-xs font-normal text-muted-foreground">
                                ({pages.filter(p => pagePermissions.get(p.path)?.canView).length}/{pages.length})
                              </span>
                            </Label>
                          </div>

                          <div className="ml-6 space-y-1.5">
                            {pages.map(page => {
                              const hasAction = PAGES_WITH_ACTIONS.includes(page.path);
                              const state = pagePermissions.get(page.path);
                              const canView = state?.canView ?? false;
                              const canUse = state?.canUse ?? false;

                              return (
                                <div key={page.path} className="flex items-center gap-3 py-1">
                                  {/* View checkbox */}
                                  <div className="flex items-center gap-1.5">
                                    <Checkbox
                                      id={`page-view-${page.path}`}
                                      checked={canView}
                                      onCheckedChange={() => handlePageToggle(page.path)}
                                    />
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                      </TooltipTrigger>
                                      <TooltipContent>Xem trang</TooltipContent>
                                    </Tooltip>
                                  </div>

                                  {/* Use checkbox - only for pages with actions */}
                                  {hasAction ? (
                                    <div className="flex items-center gap-1.5">
                                      <Checkbox
                                        id={`page-use-${page.path}`}
                                        checked={canUse}
                                        disabled={!canView}
                                        onCheckedChange={() => handleCanUseToggle(page.path)}
                                      />
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <MousePointerClick className={`h-3.5 w-3.5 ${canView ? 'text-primary' : 'text-muted-foreground/50'}`} />
                                        </TooltipTrigger>
                                        <TooltipContent>Thao tác (approve/chi tiền/...)</TooltipContent>
                                      </Tooltip>
                                    </div>
                                  ) : (
                                    <div className="w-[42px]" /> // Spacer for alignment
                                  )}

                                  <Label
                                    htmlFor={`page-view-${page.path}`}
                                    className="text-sm font-normal cursor-pointer flex-1"
                                  >
                                    {page.label}
                                    {hasAction && (
                                      <Badge variant="outline" className="ml-2 text-micro py-0 px-1">
                                        {canView && !canUse ? 'View-only' : ''}
                                      </Badge>
                                    )}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </ScrollArea>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Đã chọn {selectedPages.length}/{ALL_PAGES.length} trang</span>
              <span>Dashboard luôn được truy cập</span>
            </div>
          </div>

          {/* Security info */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Quyền truy cập được kiểm tra ở cả frontend (Sidebar, ProtectedRoute) và backend (RLS policies).
              Thay đổi có hiệu lực ngay khi lưu.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu phân quyền
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
