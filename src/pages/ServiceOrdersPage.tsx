import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { TableSkeleton } from "@/components/ui/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPaymentStatusVariant } from "@/constants/status-config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Receipt,
  Plane,
  Car,
  Sparkles,
  Eye,
  ExternalLink,
  AlertTriangle,
  Info,
  CreditCard,
  X,
} from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar";
import { useServiceOrders, useServiceOrderStats, ServiceOrder } from "@/hooks/useServiceOrders";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CreateServiceOrderDialog } from "@/components/service/CreateServiceOrderDialog";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";

const formatCurrency = (amount: number | null) => {
  if (amount === null) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const SERVICE_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  TOUR: { label: "Tour", icon: Plane, color: "bg-info/100/10 text-info" },
  PICKUP: { label: "Đưa đón", icon: Car, color: "bg-success/100/10 text-success" },
  LAUNDRY: { label: "Giặt ủi", icon: Sparkles, color: "bg-info/100/10 text-info" },
  FNB: { label: "F&B", icon: Sparkles, color: "bg-warning/100/10 text-warning" },
  ADDON: { label: "Dịch vụ thêm", icon: Sparkles, color: "bg-primary/100/10 text-primary" },
};

const SERVICE_STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: "Nháp", variant: "pending" },
  CONFIRMED: { label: "Đã xác nhận", variant: "confirmed" },
  IN_PROGRESS: { label: "Đang thực hiện", variant: "inProgress" },
  COMPLETED: { label: "Hoàn thành", variant: "checkedOut" },
  CANCELLED: { label: "Đã hủy", variant: "cancelled" },
};

const PROVIDER_CONFIG: Record<string, { label: string; color: string }> = {
  HOST: { label: "Host", color: "text-warning" },
  PARTNER: { label: "Đối tác", color: "text-muted-foreground" },
};

export default function ServiceOrdersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [serviceType, setServiceType] = useState<string>("all");
  const [serviceProvider, setServiceProvider] = useState<string>("all");
  const [serviceStatus, setServiceStatus] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const serviceOrdersQuery = useServiceOrders({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    serviceType: serviceType !== "all" ? serviceType : undefined,
    serviceProvider: serviceProvider !== "all" ? serviceProvider : undefined,
    serviceStatus: serviceStatus !== "all" ? serviceStatus : undefined,
    paymentStatus: paymentStatus !== "all" ? paymentStatus : undefined,
    search: search || undefined,
  });
  const { data: orders = [], isLoading, refetch } = serviceOrdersQuery;

  usePrefetchMountLog('ServiceOrdersPage', [
    { key: ['service-orders'], query: serviceOrdersQuery },
  ]);

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(orders, { defaultPageSize: 10, resetDeps: [search, dateFrom, dateTo, serviceType, serviceProvider, serviceStatus, paymentStatus] });

  const { data: stats } = useServiceOrderStats({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined
  });

  const hasActiveFilters = search || dateFrom || dateTo ||
    serviceType !== "all" || serviceProvider !== "all" ||
    serviceStatus !== "all" || paymentStatus !== "all";

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setServiceType("all");
    setServiceProvider("all");
    setServiceStatus("all");
    setPaymentStatus("all");
  };

  const getPaymentStatusBadge = (order: ServiceOrder) => {
    const labels: Record<string, string> = {
      PAID: 'Đã thu đủ',
      PARTIAL: 'Thu 1 phần',
      UNPAID: 'Chưa thu',
    };
    const status = order.payment_status || 'UNPAID';
    return (
      <StatusBadge variant={getPaymentStatusVariant(status) as any} size="sm">
        {labels[status] || 'Chưa thu'}
      </StatusBadge>
    );
  };

  const getServiceStatusBadge = (status: string) => {
    const config = SERVICE_STATUS_CONFIG[status] || SERVICE_STATUS_CONFIG.DRAFT;
    return <StatusBadge variant={config.variant as any} size="sm">{config.label}</StatusBadge>;
  };

  const getProviderDisplay = (order: ServiceOrder) => {
    const providerType = order.service_provider_type || 'PARTNER';

    if (order.partners?.partner_name) {
      const color = providerType === 'HOST' ? 'text-warning' : 'text-muted-foreground';
      return (
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${color}`}>{order.partners.partner_name}</span>
          <span className="text-xs text-muted-foreground">
            {providerType === 'HOST' ? '(Host)' : '(Đối tác)'}
          </span>
        </div>
      );
    }

    const config = PROVIDER_CONFIG[providerType] || PROVIDER_CONFIG.PARTNER;
    return <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>;
  };

  const hasCompletedWithDebt = (order: ServiceOrder) => {
    return order.status === 'COMPLETED' && (order.amount_remaining || 0) > 0;
  };

  const handleCollectPayment = (order: ServiceOrder) => {
    navigate(`/bookings/${order.unified_booking_id}?action=collectService`);
  };

  return (
    <>
      <Header
        title="Đơn Dịch Vụ"
        subtitle="Quản lý đơn dịch vụ Tour, Pickup, Laundry, F&B và dịch vụ thêm"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="gap-2"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Tạo đơn DV
            </Button>
          </div>
        }
      />

      <PageContainer><SectionCard>
        {/* Info Banner */}
        <Alert className="border-primary/30 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            <strong>Roomrise không phải NCC dịch vụ</strong> - chỉ điều phối và thu hộ.
            Để thu tiền → <AppLink to="/collections" className="text-primary hover:underline font-medium">Trang Thu tiền</AppLink>.
          </AlertDescription>
        </Alert>

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Tìm kiếm và lọc đơn dịch vụ"
          hasActiveFilters={!!hasActiveFilters}
          onClearFilters={clearFilters}
        >
          <FilterBar.Field label="Tìm kiếm" colSpan={2}>
            <DebouncedSearch
              value={search}
              onChange={setSearch}
              placeholder="Tìm booking, khách, dịch vụ..."
            />
          </FilterBar.Field>

          <FilterBar.Field label="Loại dịch vụ">
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả loại" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả loại</SelectItem>
                <SelectItem value="TOUR">Tour</SelectItem>
                <SelectItem value="PICKUP">Đưa đón</SelectItem>
                <SelectItem value="LAUNDRY">Giặt ủi</SelectItem>
                <SelectItem value="FNB">F&B</SelectItem>
                <SelectItem value="ADDON">DV thêm</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>

          <FilterBar.Field label="Trạng thái">
            <Select value={serviceStatus} onValueChange={setServiceStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả TT" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả TT</SelectItem>
                <SelectItem value="DRAFT">Nháp</SelectItem>
                <SelectItem value="CONFIRMED">Đã xác nhận</SelectItem>
                <SelectItem value="IN_PROGRESS">Đang TH</SelectItem>
                <SelectItem value="COMPLETED">Hoàn thành</SelectItem>
                <SelectItem value="CANCELLED">Đã hủy</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>

          <FilterBar.Field label="Thanh toán">
            <Select value={paymentStatus} onValueChange={setPaymentStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="UNPAID">Chưa thu</SelectItem>
                <SelectItem value="PARTIAL">Thu 1 phần</SelectItem>
                <SelectItem value="PAID">Đã thu đủ</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>

          <FilterBar.Field label="Nhà cung cấp">
            <Select value={serviceProvider} onValueChange={setServiceProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả NCC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả NCC</SelectItem>
                <SelectItem value="HOST">Host</SelectItem>
                <SelectItem value="PARTNER">Đối tác</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>

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
        </FilterBar>

        {/* Stats - Inline like Booking Center */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            Hiển thị{" "}
            <span className="text-foreground font-medium">{orders.length}</span>{" "}
            đơn dịch vụ
          </span>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              Phải thu: <span className="font-semibold text-foreground">{formatCurrency(stats?.totalPhaiThu || 0)}</span>
            </span>
            <span className="text-muted-foreground">
              Đã thu: <span className="font-semibold text-success">{formatCurrency(stats?.totalDaThu || 0)}</span>
            </span>
            <span className="text-muted-foreground">
              Còn lại: <span className="font-semibold text-destructive">{formatCurrency(stats?.totalConLai || 0)}</span>
            </span>
            {(stats?.completedWithDebt || 0) > 0 && (
              <>
                <div className="h-4 w-px bg-border" />
                <span className="text-warning flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {stats?.completedWithDebt} đơn hoàn thành chưa thu đủ
                </span>
              </>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <TableSkeleton columns={12} rows={6} />
        )}

        {/* Table - Native table like Booking Center */}
        {!isLoading && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2 p-2">
              {orders.length === 0 ? (
                <div className="px-4 py-12 text-center text-muted-foreground">
                  Không có đơn dịch vụ nào
                </div>
              ) : (
                paginatedData.map((order: ServiceOrder) => {
                  const typeConfig = SERVICE_TYPE_CONFIG[order.service_catalog?.service_type || ''] || {
                    label: "Khác", icon: Sparkles, color: "bg-muted text-muted-foreground",
                  };
                  const TypeIcon = typeConfig.icon;
                  const isWarning = hasCompletedWithDebt(order);

                  return (
                    <div
                      key={order.id}
                      className={`rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors ${isWarning ? "border-warning/50 bg-warning/5" : ""}`}
                      onClick={() => navigate(`/services/orders/${order.id}`)}
                    >
                      {/* Row 1: Type badge + Status */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <Badge className={`${typeConfig.color} gap-1 text-[10px]`}>
                          <TypeIcon className="h-3 w-3" />
                          {typeConfig.label}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {getServiceStatusBadge(order.status)}
                          {isWarning && <AlertTriangle className="h-3 w-3 text-warning" />}
                        </div>
                      </div>
                      {/* Row 2: Guest + Property */}
                      <div className="text-xs mb-1">
                        <span className="font-medium text-foreground">{order.unified_bookings?.guest_name || "—"}</span>
                        <span className="text-muted-foreground"> · {order.unified_bookings?.host_property_name || "—"}</span>
                      </div>
                      {/* Row 3: Service name */}
                      {order.service_catalog?.service_name && (
                        <div className="text-xs text-muted-foreground mb-1">{order.service_catalog.service_name}</div>
                      )}
                      {/* Row 4: Amounts */}
                      <div className="grid grid-cols-3 gap-1 text-xs mt-1">
                        <div>
                          <span className="text-muted-foreground">Phải thu</span>
                          <div className="font-medium tabular-nums">{formatCurrency(order.sale_price)}</div>
                        </div>
                        <div>
                          <span className="text-success">Đã thu</span>
                          <div className="font-medium tabular-nums text-success">{formatCurrency(order.amount_collected || 0)}</div>
                        </div>
                        <div>
                          <span className="text-destructive">Còn lại</span>
                          <div className={`font-medium tabular-nums ${(order.amount_remaining || 0) > 0 ? 'text-destructive' : ''}`}>
                            {formatCurrency(order.amount_remaining || 0)}
                          </div>
                        </div>
                      </div>
                      {/* Row 5: Actions */}
                      <div className="flex items-center justify-between gap-1 mt-2 pt-2 border-t border-border/30">
                        <div className="flex items-center gap-1">
                          {getPaymentStatusBadge(order)}
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {order.payment_status !== 'PAID' && order.unified_booking_id && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                              onClick={() => handleCollectPayment(order)}>
                              <CreditCard className="h-3 w-3" /> Thu
                            </Button>
                          )}
                          <Link to={`/services/orders/${order.id}`}>
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                              <Eye className="h-3 w-3" /> Xem
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="table-header w-[100px]">Mã đơn</th>
                    <th className="table-header w-[110px]">Booking</th>
                    <th className="table-header w-[180px]">Khách / Chỗ nghỉ</th>
                    <th className="table-header w-[100px]">Loại DV</th>
                    <th className="table-header w-[120px]">NCC</th>
                    <th className="table-header w-[100px]">TT Dịch vụ</th>
                    <th className="table-header-right w-[110px]">Phải thu</th>
                    <th className="table-header-right w-[100px]">Đã thu</th>
                    <th className="table-header-right w-[100px]">Còn lại</th>
                    <th className="table-header w-[90px]">TT Thu</th>
                    <th className="table-header w-[90px]">Ngày tạo</th>
                    <th className="table-header w-[60px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                        Không có đơn dịch vụ nào
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((order: ServiceOrder) => {
                      const typeConfig = SERVICE_TYPE_CONFIG[order.service_catalog?.service_type || ''] || {
                        label: "Khác",
                        icon: Sparkles,
                        color: "bg-muted text-muted-foreground",
                      };
                      const TypeIcon = typeConfig.icon;
                      const isWarning = hasCompletedWithDebt(order);

                      // Get OTA booking code from unified_bookings
                      const bookingCode = (order as any).unified_bookings?.ota_booking_code || null;

                      return (
                        <tr
                          key={order.id}
                          className={`table-row-hover cursor-pointer ${isWarning ? "bg-warning/100/5" : ""}`}
                          onClick={() => navigate(`/services/orders/${order.id}`)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-xs text-muted-foreground">
                                {order.id.slice(0, 8)}...
                              </span>
                              {isWarning && (
                                <AlertTriangle className="h-3 w-3 text-warning" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {order.unified_booking_id ? (
                              <Link
                                to={`/bookings/${order.unified_booking_id}`}
                                className="text-primary hover:underline flex items-center gap-1 text-xs font-medium"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {(bookingCode || order.unified_booking_id.slice(0, 12) + "...").replace(/^[A-Za-z]+[-_]/, "")}
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">Đơn lẻ</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {order.unified_bookings?.guest_name || "—"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {order.unified_bookings?.host_property_name || "—"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`${typeConfig.color} gap-1`}>
                              <TypeIcon className="h-3 w-3" />
                              {typeConfig.label}
                            </Badge>
                            {order.service_catalog?.service_name && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {order.service_catalog.service_name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">{getProviderDisplay(order)}</td>
                          <td className="px-4 py-3">{getServiceStatusBadge(order.status)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-medium">
                              {formatCurrency(order.sale_price)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-medium text-success">
                              {formatCurrency(order.amount_collected || 0)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-medium ${(order.amount_remaining || 0) > 0 ? 'text-destructive' : ''}`}>
                              {formatCurrency(order.amount_remaining || 0)}
                            </span>
                          </td>
                          <td className="px-4 py-3">{getPaymentStatusBadge(order)}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">
                              {formatDate(order.created_at)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {order.payment_status !== 'PAID' && order.unified_booking_id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => { e.stopPropagation(); handleCollectPayment(order); }}
                                  className="text-xs h-7 px-2 gap-1"
                                  title="Thu tiền dịch vụ"
                                >
                                  <CreditCard className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                asChild
                                className="h-7 w-7 p-0"
                              >
                                <Link to={`/services/orders/${order.id}`} onClick={(e) => e.stopPropagation()}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalCount}
              displayedItems={displayedCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="đơn DV"
            />
          </div>
        )}
      </SectionCard></PageContainer>

      <CreateServiceOrderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}
