import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Settings,
  Users,
  Building2,
  CreditCard,
  BarChart3,
  BookOpen,
  Bell,
  Info,
  Plus,
  Pencil,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { AddUserDialog } from "@/components/settings/AddUserDialog";
import { EditUserRoleDialog } from "@/components/settings/EditUserRoleDialog";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { PaymentMethodIcon } from "@/components/ui/payment-method-icon";

interface UserWithRole {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
}

export default function SettingsPage() {
  const { userRole } = useAuth();
  const location = useLocation();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  // Determine default tab based on route
  const defaultTab = location.pathname === "/settings/permissions" ? "users" : "system";

  // Dialog states
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);

  // Fetch system config
  const { data: systemConfig } = useQuery({
    queryKey: ["system-config"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("*");
      if (error) throw error;
      return data?.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {} as Record<string, any>) || {};
    },
  });

  // Fetch users with roles
  const { data: usersWithRoles } = useQuery({
    queryKey: ["users-with-roles"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name");
      if (profilesError) throw profilesError;

      // Role priority: super_admin > admin > ke_toan > cskh > sale > user
      const rolePriority: Record<string, number> = {
        super_admin: 0,
        admin: 1,
        ke_toan: 2,
        cskh: 3,
        sale: 4,
        user: 5,
      };

      return profiles?.map(profile => {
        // Find all roles for this user and pick the highest priority one
        const userRoles = roles?.filter(r => r.user_id === profile.id) || [];
        const highestRole = userRoles.sort((a, b) =>
          (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99)
        )[0]?.role || "user";

        return {
          ...profile,
          role: highestRole,
        };
      }) || [];
    },
  });

  // Fetch partners (hosts, service partners)
  const { data: partners } = useQuery({
    queryKey: ["partners-list"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name, partner_type, status")
        .order("partner_name");
      if (error) throw error;
      return data || [];
    },
  });

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Chủ đầu tư",
    ke_toan: "Kế toán",
    cskh: "CSKH",
    sale: "Vận hành",
    user: "User",
  };

  const roleBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    super_admin: "destructive",
    admin: "default",
    ke_toan: "secondary",
    cskh: "outline",
    sale: "outline",
    user: "outline",
  };

  return (
    <>
      <Header
        title="Cài đặt"
        subtitle=""
      />

      <PageContainer><SectionCard>
        {/* Warning Banner - Compact on mobile */}
        <Alert className="bg-warning/10 border-warning/30 py-2 md:py-3">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs md:text-sm">
            <span className="hidden md:inline">Thay đổi cài đặt chỉ áp dụng cho dữ liệu mới. Dữ liệu đã phát sinh trước đó không bị thay đổi.</span>
            <span className="md:hidden">Chỉ áp dụng cho dữ liệu mới</span>
          </AlertDescription>
        </Alert>

        <Tabs defaultValue={defaultTab} className="space-y-4 md:space-y-4">
          {/* Tabs - Horizontal scroll on mobile */}
          <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scrollbar-hide">
            <TabsList className="inline-flex w-max md:w-auto md:grid md:grid-cols-7 gap-1">
              <TabsTrigger value="system" className="gap-1 md:gap-2 px-3 md:px-4">
                <Settings className="h-4 w-4" />
                <span className="text-xs md:text-sm">Hệ thống</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1 md:gap-2 px-3 md:px-4">
                <Bell className="h-4 w-4" />
                <span className="text-xs md:text-sm">Thông báo</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1 md:gap-2 px-3 md:px-4">
                <Users className="h-4 w-4" />
                <span className="text-xs md:text-sm">User</span>
              </TabsTrigger>
              <TabsTrigger value="objects" className="gap-1 md:gap-2 px-3 md:px-4">
                <Building2 className="h-4 w-4" />
                <span className="text-xs md:text-sm">Danh mục</span>
              </TabsTrigger>
              <TabsTrigger value="payments" className="gap-1 md:gap-2 px-3 md:px-4">
                <CreditCard className="h-4 w-4" />
                <span className="text-xs md:text-sm">TT</span>
              </TabsTrigger>
              <TabsTrigger value="categories" className="gap-1 md:gap-2 px-3 md:px-4">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs md:text-sm">Loại</span>
              </TabsTrigger>
              <TabsTrigger value="guide" className="gap-1 md:gap-2 px-3 md:px-4">
                <BookOpen className="h-4 w-4" />
                <span className="text-xs md:text-sm">HD</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* A. CÀI ĐẶT CHUNG (SYSTEM) */}
          <TabsContent value="system" className="space-y-4 md:space-y-4">
            <SectionCard
              title={
                <span className="flex items-center gap-2 text-base md:text-lg">
                  <Settings className="h-4 w-4 md:h-5 md:w-5" />
                  Cài đặt chung
                </span>
              }
              subtitle={<span className="text-xs md:text-sm">Thiết lập thông tin hiển thị và quy ước</span>}
              className="space-y-4 md:space-y-4"
            >
              <div className="space-y-4">
                <div className="grid gap-4 md:gap-4 grid-cols-1 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="company-name" className="text-xs md:text-sm">Tên công ty</Label>
                    <Input
                      id="company-name"
                      defaultValue="Roomrise Vietnam"
                      disabled={!isAdmin}
                      className="h-9 md:h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone" className="text-xs md:text-sm">Múi giờ</Label>
                    <Select defaultValue="Asia/Ho_Chi_Minh" disabled={!isAdmin}>
                      <SelectTrigger className="h-9 md:h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</SelectItem>
                        <SelectItem value="Asia/Bangkok">Thái Lan (UTC+7)</SelectItem>
                        <SelectItem value="Asia/Singapore">Singapore (UTC+8)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency" className="text-xs md:text-sm">Đơn vị tiền tệ</Label>
                    <Select defaultValue="VND" disabled={!isAdmin}>
                      <SelectTrigger className="h-9 md:h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VND">VND</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-format" className="text-xs md:text-sm">Định dạng ngày</Label>
                    <Select defaultValue="dd/MM/yyyy" disabled={!isAdmin}>
                      <SelectTrigger className="h-9 md:h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dd/MM/yyyy">DD/MM/YYYY</SelectItem>
                        <SelectItem value="MM/dd/yyyy">MM/DD/YYYY</SelectItem>
                        <SelectItem value="yyyy-MM-dd">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="report-period" className="text-xs md:text-sm">Kỳ báo cáo</Label>
                    <Select defaultValue="month" disabled={!isAdmin}>
                      <SelectTrigger className="h-9 md:h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">Tuần</SelectItem>
                        <SelectItem value="month">Tháng</SelectItem>
                        <SelectItem value="quarter">Quý</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => toast.success("Đã lưu cài đặt")}>
                      Lưu
                    </Button>
                  </div>
                )}
              </div>
            </SectionCard>
          </TabsContent>

          {/* NOTIFICATIONS TAB */}
          <TabsContent value="notifications" className="space-y-4 md:space-y-4">
            <NotificationSettings />
          </TabsContent>

          {/* B. NGƯỜI DÙNG & PHÂN QUYỀN */}
          <TabsContent value="users" className="space-y-4 md:space-y-4">
            <SectionCard
              title={
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
                  <div>
                    <span className="flex items-center gap-2 text-base md:text-lg font-semibold text-foreground">
                      <Users className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                      Phân quyền
                    </span>
                    <p className="mt-1 text-xs md:text-sm text-muted-foreground">
                      Quản lý quyền truy cập
                    </p>
                  </div>
                  {isAdmin && (
                    <Button size="sm" className="h-9" onClick={() => setAddUserOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Thêm
                    </Button>
                  )}
                </div>
              }
              className="space-y-4 md:space-y-4"
            >
              <div className="space-y-4 md:space-y-4">
                {/* Security Notice - Hidden on mobile */}
                <div className="hidden md:flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-sm text-muted-foreground">
                    <p>Vai trò được lưu trữ riêng biệt, bảo mật bằng RLS. Super Admin có toàn quyền.</p>
                  </div>
                </div>

                {/* Users - Mobile card view */}
                <div className="md:hidden space-y-2">
                  {usersWithRoles?.map((user) => {
                    const isProtected = user.role === "super_admin";
                    return (
                      <div key={user.id} className="rounded-lg border p-3 active:bg-muted/50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{user.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <Badge
                            variant={roleBadgeVariants[user.role] || "outline"}
                            className="text-xs flex-shrink-0"
                          >
                            {roleLabels[user.role] || user.role}
                          </Badge>
                        </div>
                        {isAdmin && !isProtected && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-8 text-xs w-full"
                            onClick={() => {
                              setSelectedUser(user);
                              setEditUserOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Phân quyền
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Users Table - Desktop */}
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="font-semibold">Người dùng</TableHead>
                        <TableHead className="font-semibold">Vai trò</TableHead>
                        <TableHead className="font-semibold">Trạng thái</TableHead>
                        <TableHead className="text-right font-semibold">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersWithRoles?.map((user) => {
                        const isProtected = user.role === "super_admin";
                        return (
                          <TableRow key={user.id} className="group">
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{user.full_name || "—"}</span>
                                <span className="text-xs text-muted-foreground">{user.email}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={roleBadgeVariants[user.role] || "outline"}
                                  className="text-xs"
                                >
                                  {roleLabels[user.role] || user.role}
                                </Badge>
                                {isProtected && (
                                  <span className="text-xs text-muted-foreground">(Protected)</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-success" />
                                <span className="text-sm text-muted-foreground">Active</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {isAdmin && !isProtected && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setEditUserOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4 mr-1" />
                                  <span className="text-xs">Phân quyền</span>
                                </Button>
                              )}
                              {isProtected && (
                                <span className="text-xs text-muted-foreground">Không thể sửa</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!usersWithRoles?.length && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            Chưa có người dùng nào trong hệ thống
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Role Hierarchy */}
                <div className="p-4 rounded-lg bg-muted/20 border border-border/50">
                  <h4 className="font-medium mb-4 text-sm">Phân cấp vai trò & Quyền hạn</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 pb-3 border-b border-border/50">
                      <Badge variant="destructive" className="shrink-0">Super Admin</Badge>
                      <div className="text-sm">
                        <p className="text-foreground">Toàn quyền hệ thống</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Không thể bị hạ cấp hoặc xóa. Truy cập mọi trang và tính năng.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 pb-3 border-b border-border/50">
                      <Badge variant="default" className="shrink-0">Chủ đầu tư</Badge>
                      <div className="text-sm">
                        <p className="text-foreground">Quản lý toàn bộ nghiệp vụ</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Booking, Thu/Chi, Quyết toán, Báo cáo, Phân quyền user</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 pb-3 border-b border-border/50">
                      <Badge variant="secondary" className="shrink-0">Kế toán</Badge>
                      <div className="text-sm">
                        <p className="text-foreground">Tài chính & Báo cáo</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Thu tiền, Chi tiền, Quyết toán Host/DV, P&L, Cashflow</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 pb-3 border-b border-border/50">
                      <Badge variant="outline" className="shrink-0">CSKH</Badge>
                      <div className="text-sm">
                        <p className="text-foreground">Hỗ trợ khách hàng</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Booking, Khách hàng, Dịch vụ, Thu tiền, Tranh chấp</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="shrink-0">Vận hành</Badge>
                      <div className="text-sm">
                        <p className="text-foreground">Operations front-line</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Booking, Nhận/Trả phòng, Host & Phòng, Thu tiền</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          {/* C. DANH MỤC ĐỐI TƯỢNG */}
          <TabsContent value="objects" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Hosts */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Host (Chủ nhà)</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => window.location.href = "/partners/hosts"}>
                      Quản lý
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {partners?.filter(p => p.partner_type?.startsWith("HOST")).map((partner) => (
                      <div key={partner.id} className="flex items-center justify-between py-1">
                        <span className="text-sm">{partner.partner_name}</span>
                        <Badge variant={partner.status === "active" ? "default" : "secondary"} className="text-xs">
                          {partner.status === "active" ? "Hoạt động" : "Ngừng"}
                        </Badge>
                      </div>
                    ))}
                    {!partners?.filter(p => p.partner_type?.startsWith("HOST")).length && (
                      <p className="text-sm text-muted-foreground">Chưa có Host</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Service Partners */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Đối tác Dịch vụ</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => window.location.href = "/partners/hosts"}>
                      Quản lý
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {partners?.filter(p => p.partner_type?.startsWith("SERVICE")).map((partner) => (
                      <div key={partner.id} className="flex items-center justify-between py-1">
                        <span className="text-sm">{partner.partner_name}</span>
                        <Badge variant={partner.status === "active" ? "default" : "secondary"} className="text-xs">
                          {partner.status === "active" ? "Hoạt động" : "Ngừng"}
                        </Badge>
                      </div>
                    ))}
                    {!partners?.filter(p => p.partner_type?.startsWith("SERVICE")).length && (
                      <p className="text-sm text-muted-foreground">Chưa có đối tác dịch vụ</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* OTA Sources */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Nguồn OTA</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {["Agoda", "Booking.com", "Airbnb", "Expedia", "Traveloka", "Direct"].map((ota) => (
                      <Badge key={ota} variant="outline">{ota}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Nguồn OTA được đồng bộ từ PMS, không chỉnh sửa tại đây.
                  </p>
                </CardContent>
              </Card>

              {/* Properties */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Chỗ nghỉ / Căn hộ</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => window.location.href = "/partners/hosts"}>
                      Quản lý
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Chỗ nghỉ được quản lý trong trang Host & Phòng.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* D. DANH MỤC THANH TOÁN */}
          <TabsContent value="payments" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Payment Methods */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Phương thức thanh toán</CardTitle>
                  <CardDescription>Các phương thức dùng khi ghi nhận Thu/Chi</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { code: "CASH", name: "Tiền mặt", icon: "💵" },
                      { code: "BANK_TRANSFER", name: "Chuyển khoản", icon: "🏦" },
                      { code: "ONEPAY", name: "OnePay", icon: "💳" },
                      { code: "9PAY", name: "9Pay", icon: "💳" },
                      { code: "VPBANK", name: "VPBank", icon: "💳" },
                    ].map((method) => (
                      <div key={method.code} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <PaymentMethodIcon code={method.code} className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{method.name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">{method.code}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Bank Accounts */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tài khoản nhận / chi</CardTitle>
                  <CardDescription>Ngân hàng và ví điện tử</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { name: "Vietcombank - 1234567890", type: "bank" },
                      { name: "Techcombank - 9876543210", type: "bank" },
                      { name: "OnePay Wallet", type: "ewallet" },
                      { name: "9Pay Wallet", type: "ewallet" },
                    ].map((account, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                        <span className="text-sm">{account.name}</span>
                        <Badge variant={account.type === "bank" ? "default" : "secondary"} className="text-xs">
                          {account.type === "bank" ? "Ngân hàng" : "Ví"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    ⚠️ Danh sách tài khoản chỉ để chọn khi ghi nhận, không có số dư.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* E. DANH MỤC DOANH THU & CHI PHÍ */}
          <TabsContent value="categories" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Revenue Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-success" />
                    Nhóm doanh thu
                  </CardTitle>
                  <CardDescription>Phân loại cho báo cáo P&L</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { code: "ROOM", name: "Doanh thu phòng", desc: "Tiền phòng từ booking" },
                      { code: "SERVICE", name: "Doanh thu dịch vụ", desc: "Tour, pickup, laundry..." },
                    ].map((cat) => (
                      <div key={cat.code} className="p-3 rounded-lg bg-success/5 border border-success/20">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{cat.name}</span>
                          <Badge variant="outline" className="text-xs">{cat.code}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{cat.desc}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Expense Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-danger" />
                    Nhóm chi phí
                  </CardTitle>
                  <CardDescription>Phân loại cho báo cáo P&L & Chi phí nội bộ</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { code: "COGS_ROOM", name: "Giá vốn phòng", desc: "Chi phí trả Host" },
                      { code: "COGS_SERVICE", name: "Giá vốn dịch vụ", desc: "Chi phí trả đối tác DV" },
                      { code: "SALARY", name: "Lương", desc: "Lương nhân viên" },
                      { code: "BHXH", name: "BHXH", desc: "Bảo hiểm xã hội" },
                      { code: "OFFICE", name: "Văn phòng", desc: "Thuê VP, điện nước..." },
                      { code: "MARKETING", name: "Marketing", desc: "Quảng cáo, PR" },
                      { code: "OTA_FEE", name: "Phí OTA", desc: "Commission OTA" },
                      { code: "OTHER", name: "Chi phí khác", desc: "Các chi phí khác" },
                    ].map((cat) => (
                      <div key={cat.code} className="p-2 rounded-lg bg-danger/5 border border-danger/20">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{cat.name}</span>
                          <Badge variant="outline" className="text-xs">{cat.code}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{cat.desc}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* F. QUY ƯỚC VẬN HÀNH (READ-ONLY) */}
          <TabsContent value="guide" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Quy ước vận hành
                </CardTitle>
                <CardDescription>
                  Hiểu đúng cách vận hành hệ thống Roomrise
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-warning/10">
                        <AlertTriangle className="h-5 w-5 text-warning" />
                      </div>
                      <div>
                        <h4 className="font-medium">OTA Payout ≠ Thu tiền</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          OTA Payout chỉ là báo từ OTA. Tiền chỉ được coi là "đã thu" khi ghi nhận tại trang Thu tiền.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-info/10">
                        <Info className="h-5 w-5 text-info" />
                      </div>
                      <div>
                        <h4 className="font-medium">Thu tiền ≠ Quyết toán</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Thu tiền ghi nhận dòng tiền thực. Quyết toán là snapshot để tính toán và thanh toán với Host/DV.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <BarChart3 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">P&L ≠ Cashflow</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          P&L phản ánh lợi nhuận theo kỳ check-out. Cashflow phản ánh tiền thực đã thu/chi theo ngày giao dịch.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-success/10">
                        <Check className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <h4 className="font-medium">Quyết toán là snapshot</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Khi chốt quyết toán, số liệu được chốt cứng (snapshot). Thay đổi dữ liệu gốc không ảnh hưởng phiếu đã chốt.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border bg-muted/30 sm:col-span-2">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-secondary">
                        <Settings className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium">Dashboard chỉ để xem</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Dashboard tổng hợp dữ liệu từ các module. Không tạo, không sửa, không ghi nhận giao dịch.
                          Để thao tác, vào trang nghiệp vụ tương ứng.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Reference */}
                <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <h4 className="font-medium mb-3">📌 Tham khảo nhanh: Trang nào dùng cài đặt nào?</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Trang</TableHead>
                        <TableHead>Sử dụng danh mục</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Booking</TableCell>
                        <TableCell>Host, OTA, Chỗ nghỉ</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Thu tiền</TableCell>
                        <TableCell>Phương thức, Tài khoản, Đối tượng</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Chi tiền</TableCell>
                        <TableCell>Phương thức, Tài khoản, Nhóm chi phí</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>P&L</TableCell>
                        <TableCell>Nhóm doanh thu, Nhóm chi phí</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Cashflow</TableCell>
                        <TableCell>Phương thức, Tài khoản</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </SectionCard></PageContainer>

      {/* Dialogs */}
      <AddUserDialog open={addUserOpen} onOpenChange={setAddUserOpen} />
      <EditUserRoleDialog
        open={editUserOpen}
        onOpenChange={setEditUserOpen}
        user={selectedUser}
      />
    </>
  );
}
