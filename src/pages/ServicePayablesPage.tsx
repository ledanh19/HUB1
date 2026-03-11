import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { Separator } from "@/components/ui/separator";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  Filter,
  FileText,
  CheckCircle,
  AlertTriangle,
  DollarSign,
  Loader2,
  Lock,
  Info,
  Receipt,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Eye,
  Calendar,
  User,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { toast } from "sonner";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
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
    year: "numeric",
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

// Generate settlement code
const generateServiceSettlementCode = () => {
  const now = new Date();
  const yearMonth = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `SV${yearMonth}${random}`;
};

// Hook to fetch COMPLETED service orders for settlement (LIVE DATA)
const useServiceSettlementData = (filters: {
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string
}) => {
  return useQuery({
    queryKey: ["service_settlement_live_data", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!filters.partnerId) {
        return [];
      }

      // Fetch COMPLETED (DONE) service orders for selected partner
      let query = supabase
        .from("service_orders")
        .select(`
          *,
          service_catalog(service_name, service_type),
          partners(partner_name, phone)
        `)
        .eq("status", "DONE")
        .eq("partner_id", filters.partnerId)
        .order("service_date_time", { ascending: false });

      if (filters.dateFrom) {
        query = query.gte("service_date_time", filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte("service_date_time", filters.dateTo + "T23:59:59");
      }

      const { data: orders, error } = await query;
      if (error) throw error;

      // Fetch booking info
      const bookingIds = [...new Set((orders || []).filter(o => o.unified_booking_id).map(o => o.unified_booking_id))];
      let bookingsMap: Record<string, any> = {};

      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from("unified_bookings")
          .select("unified_booking_id, guest_name, check_in_date, ota_booking_code")
          .in("unified_booking_id", bookingIds);

        if (bookings) {
          bookingsMap = bookings.reduce((acc, b) => {
            acc[b.unified_booking_id] = b;
            return acc;
          }, {} as Record<string, any>);
        }
      }

      // Fetch SERVICE collections for these orders
      const orderIds = (orders || []).map(o => o.id);
      const collectionsMap: Record<string, { amount: number; collector_type: string }[]> = {};

      if (orderIds.length > 0) {
        const { data: collections } = await supabase
          .from("hotel_collects")
          .select("related_id, amount_collected, status, payee_type")
          .eq("related_type", "SERVICE")
          .neq("status", "VOIDED")
          .in("related_id", orderIds);

        if (collections) {
          collections.forEach(c => {
            if (c.related_id) {
              if (!collectionsMap[c.related_id]) {
                collectionsMap[c.related_id] = [];
              }
              collectionsMap[c.related_id].push({
                amount: c.amount_collected || 0,
                collector_type: c.payee_type || 'ROOMRISE'
              });
            }
          });
        }
      }

      // Enrich orders with derived data
      const enrichedOrders = (orders || []).map((order: any) => {
        const orderCollections = collectionsMap[order.id] || [];

        // Calculate collected by Roomrise vs Partner
        let roomriseCollected = 0;
        let partnerCollected = 0;

        orderCollections.forEach(col => {
          if (col.collector_type === 'ROOMRISE') {
            roomriseCollected += col.amount;
          } else {
            partnerCollected += col.amount;
          }
        });

        const totalCollected = roomriseCollected + partnerCollected;
        const amountRemaining = Math.max(0, (order.sale_price || 0) - totalCollected);

        // NET line = Cost - Partner collected (what Roomrise owes/receives from partner)
        const costPrice = order.cost_price || 0;
        const netLine = costPrice - partnerCollected;

        return {
          ...order,
          booking: bookingsMap[order.unified_booking_id] || null,
          roomrise_collected: roomriseCollected,
          partner_collected: partnerCollected,
          amount_collected: totalCollected,
          amount_remaining: amountRemaining,
          net_line: netLine,
        };
      });

      return enrichedOrders;
    },
    enabled: !!filters.partnerId,
  });
};

// Hook to fetch existing settlements (QUICK VIEW) - synced with Settlement History
const useServiceSettlements = (partnerId?: string) => {
  return useQuery({
    queryKey: ["service_settlements_list", partnerId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("service_settlements")
        .select(`
          *,
          partners(partner_name)
        `)
        .not("finalized_at", "is", null)
        .order("finalized_at", { ascending: false })
        .limit(30);

      if (partnerId) {
        query = query.eq("partner_id", partnerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const settlementIds = (data || []).map(s => s.id);

      // Compute paid_amount from cashflow_entries (single source of truth)
      const paidBySettlement = new Map<string, number>();
      if (settlementIds.length > 0) {
        const { data: cashflows, error: cfError } = await supabase
          .from("cashflow_entries")
          .select("source_id, amount")
          .eq("source_type", "SERVICE_SETTLEMENT_PAYMENT")
          .eq("direction", "OUT")
          .in("source_id", settlementIds);

        if (!cfError && cashflows) {
          cashflows.forEach((cf) => {
            const current = paidBySettlement.get(cf.source_id || "") || 0;
            paidBySettlement.set(cf.source_id || "", current + Number(cf.amount || 0));
          });
        }
      }

      return (data || []).map((s: any) => {
        const netAmount = Number(s.net_amount) || 0;
        const paidAmount = paidBySettlement.get(s.id) || 0;
        const absNet = Math.abs(netAmount);
        const remaining = Math.max(0, absNet - paidAmount);

        // Compute payment status
        let paymentStatus = "UNPAID";
        if (paidAmount > 0 && paidAmount < absNet) paymentStatus = "PARTIAL";
        else if (paidAmount >= absNet && absNet > 0) paymentStatus = "PAID";
        else if (paidAmount > absNet) paymentStatus = "OVERPAID";

        return {
          ...s,
          computed_paid_amount: paidAmount,
          computed_remaining_amount: remaining,
          computed_payment_status: paymentStatus,
        };
      });
    },
  });
};

const useServicePartners = () => {
  return useQuery({
    queryKey: ["partners_service"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name, partner_type")
        .in("partner_type", ["SERVICE_PICKUP", "SERVICE_TOUR", "SERVICE_OTHER"])
        .eq("status", "active")
        .order("partner_name");
      if (error) throw error;
      return data;
    },
  });
};

export default function ServicePayablesPage() {
  const queryClient = useQueryClient();
  const [partnerId, setPartnerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const { data: orders = [], isLoading, refetch } = useServiceSettlementData({
    partnerId,
    dateFrom,
    dateTo,
  });

  const { data: settlements = [], isLoading: settlementsLoading } = useServiceSettlements(partnerId);
  const { data: partners = [] } = useServicePartners();

  // Get selected orders
  const selectedOrders = orders.filter((o: any) => selectedOrderIds.has(o.id));
  const hasSelection = selectedOrders.length > 0;

  // Stats based on selected orders (or all if none selected)
  const ordersToCalculate = hasSelection ? selectedOrders : orders;
  const totalOrders = ordersToCalculate.length;
  const totalSalePrice = ordersToCalculate.reduce((sum, o: any) => sum + (o.sale_price || 0), 0);
  const totalCostPrice = ordersToCalculate.reduce((sum, o: any) => sum + (o.cost_price || 0), 0);
  const totalPartnerCollected = ordersToCalculate.reduce((sum, o: any) => sum + (o.partner_collected || 0), 0);
  const totalRoomriseCollected = ordersToCalculate.reduce((sum, o: any) => sum + (o.roomrise_collected || 0), 0);

  // NET = Total Cost - Total Partner Collected
  const netAmount = totalCostPrice - totalPartnerCollected;
  const netDirection = netAmount >= 0 ? 'ROOMRISE_OWES' : 'PARTNER_OWES';

  const selectedPartner = partners.find(p => p.id === partnerId);

  const livePagination = useTablePagination(orders, { defaultPageSize: 10, resetDeps: [partnerId, dateFrom, dateTo] });
  const settlementPagination = useTablePagination(settlements, { defaultPageSize: 10, resetDeps: [partnerId] });

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrderIds(new Set(orders.map((o: any) => o.id)));
    } else {
      setSelectedOrderIds(new Set());
    }
  };

  // Handle individual selection
  const handleSelectOrder = (orderId: string, checked: boolean) => {
    const newSet = new Set(selectedOrderIds);
    if (checked) {
      newSet.add(orderId);
    } else {
      newSet.delete(orderId);
    }
    setSelectedOrderIds(newSet);
  };

  const isAllSelected = orders.length > 0 && selectedOrderIds.size === orders.length;

  const handleCreateSettlement = async () => {
    const ordersToSettle = hasSelection ? selectedOrders : orders;

    if (ordersToSettle.length === 0) {
      toast.error("Không có dịch vụ nào để quyết toán");
      return;
    }

    if (!partnerId) {
      toast.error("Vui lòng chọn đối tác dịch vụ");
      return;
    }

    if (!dateFrom || !dateTo) {
      toast.error("Vui lòng chọn kỳ quyết toán (từ ngày - đến ngày)");
      return;
    }

    setIsProcessing(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const settlementCode = generateServiceSettlementCode();

      // Recalculate stats for orders being settled
      const settleTotal = ordersToSettle.length;
      const settleSalePrice = ordersToSettle.reduce((sum: number, o: any) => sum + (o.sale_price || 0), 0);
      const settleCostPrice = ordersToSettle.reduce((sum: number, o: any) => sum + (o.cost_price || 0), 0);
      const settlePartnerCollected = ordersToSettle.reduce((sum: number, o: any) => sum + (o.partner_collected || 0), 0);
      const settleRoomriseCollected = ordersToSettle.reduce((sum: number, o: any) => sum + (o.roomrise_collected || 0), 0);
      const settleNetAmount = settleCostPrice - settlePartnerCollected;
      const settleNetDirection = settleNetAmount >= 0 ? 'ROOMRISE_OWES' : 'PARTNER_OWES';

      // Create settlement record
      const { data: settlement, error: settlementError } = await supabase
        .from("service_settlements")
        .insert({
          settlement_code: settlementCode,
          partner_id: partnerId,
          period_from: dateFrom,
          period_to: dateTo,
          total_sale_price: settleSalePrice,
          total_cost_price: settleCostPrice,
          partner_collected_amount: settlePartnerCollected,
          roomrise_collected_amount: settleRoomriseCollected,
          net_amount: Math.abs(settleNetAmount),
          net_direction: settleNetDirection,
          payment_status: 'UNPAID',
          created_by: user?.user?.id,
          finalized_by: user?.user?.id,
        })
        .select()
        .single();

      if (settlementError) throw settlementError;

      // Create settlement items (snapshot)
      const items = ordersToSettle.map((order: any) => ({
        settlement_id: settlement.id,
        service_order_id: order.id,
        unified_booking_id: order.unified_booking_id,
        service_name: order.service_catalog?.service_name || '',
        service_type: order.service_catalog?.service_type || '',
        guest_name: order.booking?.guest_name || '',
        service_date: order.service_date_time ? new Date(order.service_date_time).toISOString().split('T')[0] : null,
        sale_price: order.sale_price || 0,
        cost_price: order.cost_price || 0,
        collector_type: order.collector_type || '',
        amount_collected: order.amount_collected || 0,
        amount_remaining: order.amount_remaining || 0,
        net_line: order.net_line || 0,
      }));

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from("service_settlement_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }

      // Create audit log
      await safeMutation(() => supabase.from("audit_logs").insert({
        entity: "service_settlement",
        entity_id: settlement.id,
        action: "CREATE_SETTLEMENT",
        user_id: user?.user?.id,
        after_data: {
          settlement_code: settlementCode,
          partner_id: partnerId,
          period_from: dateFrom,
          period_to: dateTo,
          total_orders: settleTotal,
          total_sale_price: settleSalePrice,
          total_cost_price: settleCostPrice,
          net_amount: settleNetAmount,
          net_direction: settleNetDirection,
        },
      }));

      toast.success(`Đã chốt quyết toán ${settleTotal} đơn dịch vụ - Mã: ${settlementCode}`);
      setSettlementDialogOpen(false);
      setSelectedOrderIds(new Set()); // Clear selection
      queryClient.invalidateQueries({ queryKey: ["service_settlements_list"] });
      queryClient.invalidateQueries({ queryKey: ["service_settlement_live_data"] });
    } catch (error: any) {
      toast.error("Lỗi: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewSettlement = async (settlement: any) => {
    // Fetch settlement items
    const { data: items } = await supabase
      .from("service_settlement_items")
      .select("*")
      .eq("settlement_id", settlement.id)
      .order("service_date", { ascending: false });

    setSelectedSettlement({ ...settlement, items: items || [] });
    setDetailDialogOpen(true);
  };

  return (
    <>
      <Header
        title="Quyết toán dịch vụ"
        subtitle="Đối soát và chốt công nợ giữa Roomrise ↔ Đối tác cung cấp dịch vụ"
      />

      <PageContainer><SectionCard>

        {/* Info Banner */}
        <Alert className="border-primary/20 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-primary">
            <strong>Trang Quyết toán dịch vụ</strong> chỉ dùng để đối soát & chốt số liệu.
            Không phát sinh thu/chi tiền thực tế. Thu tiền dịch vụ thực hiện tại{" "}
            <AppLink to="/collections" className="underline font-medium">Trang Thu tiền</AppLink>.
          </AlertDescription>
        </Alert>

        {/* ================ SECTION A: CREATE/FINALIZE SETTLEMENT (LIVE DATA) ================ */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 bg-primary rounded-full" />
            <h2 className="text-lg font-semibold">Tạo / Chốt quyết toán (Dữ liệu live)</h2>
          </div>

          {/* Filters */}
          <FilterBar
            title="Bộ lọc kỳ quyết toán"
            subtitle="Chọn đối tác và khoảng thời gian"
            hasActiveFilters={!!partnerId || !!dateFrom || !!dateTo}
            onClearFilters={() => { setPartnerId(""); setDateFrom(""); setDateTo(""); }}
          >
            <FilterBar.Field label="Đối tác cung cấp dịch vụ">
              <Select value={partnerId || "_select"} onValueChange={(v) => setPartnerId(v === "_select" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn đối tác" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_select" disabled>Chọn đối tác...</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterBar.Field>
            <FilterBar.Field label="Từ ngày">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </FilterBar.Field>
            <FilterBar.Field label="Đến ngày">
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </FilterBar.Field>
          </FilterBar>

          {/* Action Bar - Always visible */}
          <div className="flex items-center justify-between pt-3">
            <div className="text-sm text-muted-foreground">
              {!partnerId && "Chọn đối tác để xem dữ liệu"}
              {partnerId && orders.length === 0 && !isLoading && "Không có đơn dịch vụ hoàn thành"}
              {partnerId && orders.length > 0 && (
                <span>
                  Tìm thấy <strong>{orders.length}</strong> đơn dịch vụ
                  {hasSelection && <span className="ml-2 text-primary">• Đã chọn {selectedOrderIds.size} đơn</span>}
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => setSettlementDialogOpen(true)}
              disabled={!partnerId || !dateFrom || !dateTo || (orders.length === 0 && !hasSelection)}
            >
              <Lock className="mr-2 h-4 w-4" />
              Chốt quyết toán {hasSelection ? `(${selectedOrderIds.size})` : orders.length > 0 ? `(${orders.length})` : ''}
            </Button>
          </div>

          {/* Live KPI Stats */}
          {partnerId && (
            <>
              <KPIGrid columns={4}>
                <MetricCard title="Tổng giá bán" value={formatCurrency(totalSalePrice)} icon={Receipt} />
                <MetricCard title="Tổng giá vốn" value={formatCurrency(totalCostPrice)} icon={DollarSign} />
                <MetricCard title="Đối tác đã thu" value={formatCurrency(totalPartnerCollected)} icon={ArrowDownLeft} tone="warning" />
                <MetricCard title="Roomrise đã thu" value={formatCurrency(totalRoomriseCollected)} icon={ArrowUpRight} tone="success" />
                <MetricCard
                  title="NET kỳ"
                  value={formatCurrency(Math.abs(netAmount))}
                  icon={netAmount >= 0 ? TrendingUp : TrendingDown}
                  tone={netAmount >= 0 ? 'danger' : 'success'}
                  subtitle={netAmount >= 0 ? '→ Roomrise phải trả' : '→ Roomrise phải nhận'}
                  className={netAmount >= 0 ? 'border-destructive/50 bg-destructive/5' : 'border-success/50 bg-success/5'}
                />
              </KPIGrid>


              {/* Detail Table (LIVE - with selection) */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm">Chi tiết đơn dịch vụ ({orders.length} đơn)</span>
                    {hasSelection && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                        Đã chọn {selectedOrderIds.size}
                      </span>
                    )}
                  </div>
                  {orders.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAll(!isAllSelected)}
                    >
                      {isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </Button>
                  )}
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mb-2 opacity-50" />
                    <p>Không có dịch vụ hoàn thành nào trong kỳ này</p>
                    <p className="text-xs mt-1">Vui lòng chọn đối tác và khoảng thời gian</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Card View - Live Data */}
                    <div className="md:hidden space-y-2 p-2">
                      {livePagination.paginatedData.map((order: any) => (
                        <div
                          key={order.id}
                          className={`rounded-xl border border-border/60 bg-card p-3 transition-colors ${selectedOrderIds.has(order.id) ? 'border-primary/50 bg-primary/5' : ''}`}
                        >
                          {/* Row 1: Checkbox + Service name + Type */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <Checkbox
                              checked={selectedOrderIds.has(order.id)}
                              onCheckedChange={(checked) => handleSelectOrder(order.id, checked as boolean)}
                            />
                            <span className="text-xs font-medium text-foreground flex-1 truncate">{order.service_catalog?.service_name || "—"}</span>
                            <span className="text-[10px] text-muted-foreground">{order.service_catalog?.service_type || "—"}</span>
                          </div>
                          {/* Row 2: Guest + Date */}
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1 ml-6">
                            <span className="truncate">{order.booking?.guest_name || "—"}</span>
                            <span>{formatDate(order.service_date_time)}</span>
                          </div>
                          {/* Row 3: Sale / Cost / NET */}
                          <div className="grid grid-cols-3 gap-1 text-xs mt-1 ml-6">
                            <div>
                              <span className="text-muted-foreground">Giá bán</span>
                              <div className="font-medium tabular-nums">{formatCurrency(order.sale_price)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Giá vốn</span>
                              <div className="font-medium tabular-nums">{formatCurrency(order.cost_price)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">NET</span>
                              <div className={`font-medium tabular-nums ${order.net_line >= 0 ? 'text-destructive' : 'text-success'}`}>
                                {formatCurrency(Math.abs(order.net_line))} {order.net_line >= 0 ? '↑' : '↓'}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table View - Live Data */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={isAllSelected}
                                onCheckedChange={handleSelectAll}
                              />
                            </TableHead>
                            <TableHead className="w-[100px]">Mã đơn</TableHead>
                            <TableHead className="w-[120px]">Dịch vụ</TableHead>
                            <TableHead className="w-[80px]">Loại</TableHead>
                            <TableHead className="w-[130px]">Mã booking</TableHead>
                            <TableHead className="w-[130px]">Khách</TableHead>
                            <TableHead className="w-[100px]">Ngày DV</TableHead>
                            <TableHead className="w-[110px] text-right">Giá bán</TableHead>
                            <TableHead className="w-[110px] text-right">Giá vốn</TableHead>
                            <TableHead className="w-[80px] text-right">Ai thu</TableHead>
                            <TableHead className="w-[110px] text-right">Đã thu</TableHead>
                            <TableHead className="w-[110px] text-right">Còn lại</TableHead>
                            <TableHead className="w-[110px] text-right">NET dòng</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {livePagination.paginatedData.map((order: any) => (
                            <TableRow
                              key={order.id}
                              className={selectedOrderIds.has(order.id) ? "bg-primary/5" : ""}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedOrderIds.has(order.id)}
                                  onCheckedChange={(checked) => handleSelectOrder(order.id, checked as boolean)}
                                />
                              </TableCell>
                              <TableCell>
                                <Link
                                  to={`/services/orders/${order.id}`}
                                  className="text-primary hover:underline font-mono text-sm"
                                >
                                  {order.id.slice(0, 8)}
                                </Link>
                              </TableCell>
                              <TableCell>
                                <p className="font-medium text-sm">{order.service_catalog?.service_name || "—"}</p>
                              </TableCell>
                              <TableCell>
                                <span className="text-xs text-muted-foreground">{order.service_catalog?.service_type || "—"}</span>
                              </TableCell>
                              <TableCell>
                                {order.unified_booking_id ? (
                                  <Link
                                    to={`/bookings/${order.unified_booking_id}`}
                                    className="text-primary hover:underline text-sm"
                                  >
                                    {(order.booking?.ota_booking_code || order.unified_booking_id.slice(0, 12) + "...").replace(/^[A-Za-z]+[-_]/, "")}
                                  </Link>
                                ) : (
                                  <span className="text-muted-foreground text-sm">Dịch vụ lẻ</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">{order.booking?.guest_name || "—"}</span>
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(order.service_date_time)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(order.sale_price)}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(order.cost_price)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {order.partner_collected > 0 && order.roomrise_collected > 0 ? (
                                  <span className="text-muted-foreground">Cả hai</span>
                                ) : order.partner_collected > 0 ? (
                                  <span className="text-warning">Đối tác</span>
                                ) : order.roomrise_collected > 0 ? (
                                  <span className="text-success">Roomrise</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium text-success">
                                {formatCurrency(order.amount_collected)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-warning">
                                {order.amount_remaining > 0 ? formatCurrency(order.amount_remaining) : "—"}
                              </TableCell>
                              <TableCell className={`text-right font-medium ${order.net_line >= 0 ? 'text-destructive' : 'text-success'}`}>
                                {formatCurrency(Math.abs(order.net_line))}
                                <span className="text-xs ml-1">
                                  {order.net_line >= 0 ? '↑' : '↓'}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <DataTablePagination
                      currentPage={livePagination.page}
                      totalPages={livePagination.totalPages}
                      totalItems={livePagination.totalCount}
                      displayedItems={livePagination.displayedCount}
                      pageSize={livePagination.pageSize}
                      onPageChange={livePagination.setPage}
                      onPageSizeChange={livePagination.setPageSize}
                      itemLabel="dòng"
                    />
                  </>
                )}
              </div>
            </>
          )}

          {!partnerId && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
              <Filter className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Vui lòng chọn đối tác cung cấp dịch vụ để xem dữ liệu</p>
            </div>
          )}
        </div >

        <Separator />

        {/* ================ SECTION B: SETTLEMENT LIST (QUICK VIEW - SNAPSHOT) ================ */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-1 bg-muted-foreground rounded-full" />
            <h2 className="text-lg font-semibold">Danh sách phiếu quyết toán (Quick View)</h2>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {settlementsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : settlements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mb-2 opacity-50" />
                <p>Chưa có phiếu quyết toán nào</p>
              </div>
            ) : (
              <>
                {/* Mobile Card View - Settlements */}
                <div className="md:hidden space-y-2 p-2">
                  {settlementPagination.paginatedData.map((settlement: any) => (
                    <div
                      key={settlement.id}
                      className="rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors"
                      onClick={() => handleViewSettlement(settlement)}
                    >
                      {/* Row 1: Code + Payment Status */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-mono font-medium">{settlement.settlement_code}</span>
                        {settlement.computed_payment_status === 'PAID' ? (
                          <StatusBadge variant="success" size="sm">Đã TT</StatusBadge>
                        ) : settlement.computed_payment_status === 'PARTIAL' ? (
                          <StatusBadge variant="warning" size="sm">TT một phần</StatusBadge>
                        ) : (
                          <StatusBadge variant="danger" size="sm">Chưa TT</StatusBadge>
                        )}
                      </div>
                      {/* Row 2: Partner */}
                      <div className="text-xs font-medium text-foreground mb-1">{settlement.partners?.partner_name || "—"}</div>
                      {/* Row 3: Period */}
                      <div className="text-xs text-muted-foreground mb-1">
                        {formatDate(settlement.period_from)} → {formatDate(settlement.period_to)}
                      </div>
                      {/* Row 4: NET + Direction + Remaining */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm tabular-nums">{formatCurrency(settlement.net_amount)}</span>
                          {settlement.net_direction === 'ROOMRISE_OWES' ? (
                            <StatusBadge variant="danger" size="sm">RR trả</StatusBadge>
                          ) : (
                            <StatusBadge variant="success" size="sm">RR nhận</StatusBadge>
                          )}
                        </div>
                        {(settlement.computed_remaining_amount || 0) > 0 && (
                          <span className="text-xs font-semibold text-destructive tabular-nums">
                            Còn: {formatCurrency(settlement.computed_remaining_amount)}
                          </span>
                        )}
                      </div>
                      {/* Row 5: Actions */}
                      <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/30">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); handleViewSettlement(settlement); }}>
                          <Eye className="h-3 w-3" /> Xem
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View - Settlements */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[110px]">Mã phiếu</TableHead>
                        <TableHead className="w-[140px]">Đối tác</TableHead>
                        <TableHead className="w-[180px]">Kỳ quyết toán</TableHead>
                        <TableHead className="w-[110px] text-right">NET</TableHead>
                        <TableHead className="w-[100px]">Hướng NET</TableHead>
                        <TableHead className="w-[110px] text-right">Đã TT</TableHead>
                        <TableHead className="w-[110px] text-right">Còn lại</TableHead>
                        <TableHead className="w-[110px]">Trạng thái TT</TableHead>
                        <TableHead className="w-[140px]">Ngày chốt</TableHead>
                        <TableHead className="w-[80px]">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settlementPagination.paginatedData.map((settlement: any) => (
                        <TableRow key={settlement.id}>
                          <TableCell className="font-mono font-medium">
                            {settlement.settlement_code}
                          </TableCell>
                          <TableCell>
                            {settlement.partners?.partner_name || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(settlement.period_from)} - {formatDate(settlement.period_to)}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${settlement.net_direction === 'ROOMRISE_OWES' ? 'text-destructive' : 'text-success'}`}>
                            {formatCurrency(settlement.net_amount)}
                          </TableCell>
                          <TableCell>
                            {settlement.net_direction === 'ROOMRISE_OWES' ? (
                              <StatusBadge variant="danger" size="sm">
                                <ArrowUpRight className="h-3 w-3 mr-1" />
                                RR trả
                              </StatusBadge>
                            ) : (
                              <StatusBadge variant="success" size="sm">
                                <ArrowDownLeft className="h-3 w-3 mr-1" />
                                RR nhận
                              </StatusBadge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-success font-medium">
                            {formatCurrency(settlement.computed_paid_amount || 0)}
                          </TableCell>
                          <TableCell className="text-right text-destructive font-medium">
                            {formatCurrency(settlement.computed_remaining_amount || 0)}
                          </TableCell>
                          <TableCell>
                            {settlement.computed_payment_status === 'PAID' ? (
                              <StatusBadge variant="success" size="sm">Đã TT</StatusBadge>
                            ) : settlement.computed_payment_status === 'PARTIAL' ? (
                              <StatusBadge variant="warning" size="sm">TT một phần</StatusBadge>
                            ) : (
                              <StatusBadge variant="danger" size="sm">Chưa TT</StatusBadge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDateTime(settlement.finalized_at)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewSettlement(settlement)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Xem
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <DataTablePagination
                  currentPage={settlementPagination.page}
                  totalPages={settlementPagination.totalPages}
                  totalItems={settlementPagination.totalCount}
                  displayedItems={settlementPagination.displayedCount}
                  pageSize={settlementPagination.pageSize}
                  onPageChange={settlementPagination.setPage}
                  onPageSizeChange={settlementPagination.setPageSize}
                  itemLabel="dòng"
                />
              </>
            )}
          </div>
        </div>
      </SectionCard ></PageContainer >

      {/* Settlement Confirmation Dialog */}
      < Dialog open={settlementDialogOpen} onOpenChange={setSettlementDialogOpen} >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Xác nhận quyết toán
            </DialogTitle>
            <DialogDescription>
              Sau khi chốt, dữ liệu sẽ được lưu snapshot và không thay đổi theo dữ liệu mới.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {hasSelection && (
              <Alert className="border-primary/20 bg-primary/5">
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription className="text-primary">
                  Bạn đang chốt quyết toán cho <strong>{selectedOrderIds.size}</strong> đơn dịch vụ đã chọn (không phải tất cả).
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Đối tác:</span>
                <span className="font-medium">{selectedPartner?.partner_name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kỳ quyết toán:</span>
                <span className="font-medium">
                  {formatDate(dateFrom)} - {formatDate(dateTo)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số đơn dịch vụ:</span>
                <span className="font-medium">{totalOrders}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng giá bán:</span>
                <span className="font-medium">{formatCurrency(totalSalePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng giá vốn:</span>
                <span className="font-medium">{formatCurrency(totalCostPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Đối tác đã thu:</span>
                <span className="font-medium text-warning">{formatCurrency(totalPartnerCollected)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Roomrise đã thu:</span>
                <span className="font-medium text-success">{formatCurrency(totalRoomriseCollected)}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-medium">NET kỳ:</span>
                <div className="text-right">
                  <span className={`text-kpi font-semibold tabular-nums tracking-tight ${netAmount >= 0 ? 'text-destructive' : 'text-success'}`}>
                    {formatCurrency(Math.abs(netAmount))}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {netAmount >= 0 ? '→ Roomrise phải trả cho đối tác' : '→ Đối tác phải trả cho Roomrise'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettlementDialogOpen(false)}>
              Hủy
            </Button>
            <Button onClick={handleCreateSettlement} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận quyết toán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Settlement Detail Dialog */}
      < Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen} >
        <DialogContent size="4xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Chi tiết phiếu quyết toán
            </DialogTitle>
            <DialogDescription>
              Dữ liệu snapshot tại thời điểm chốt - Không thể chỉnh sửa
            </DialogDescription>
          </DialogHeader>

          {selectedSettlement && (
            <div className="space-y-4 py-4">
              {/* Settlement Info */}
              <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Mã phiếu</span>
                    <p className="font-mono font-bold">{selectedSettlement.settlement_code}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Đối tác</span>
                    <p className="font-medium">{selectedSettlement.partners?.partner_name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Kỳ quyết toán</span>
                    <p className="text-sm">{formatDate(selectedSettlement.period_from)} - {formatDate(selectedSettlement.period_to)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Ngày chốt</span>
                    <p className="text-sm">{formatDateTime(selectedSettlement.finalized_at)}</p>
                  </div>
                </div>
              </div>

              {/* KPI Summary */}
              <div className="grid grid-cols-5 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Tổng giá bán</p>
                  <p className="font-bold">{formatCurrency(selectedSettlement.total_sale_price)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Tổng giá vốn</p>
                  <p className="font-bold">{formatCurrency(selectedSettlement.total_cost_price)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Đối tác đã thu</p>
                  <p className="font-bold text-warning">{formatCurrency(selectedSettlement.partner_collected_amount)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Roomrise đã thu</p>
                  <p className="font-bold text-success">{formatCurrency(selectedSettlement.roomrise_collected_amount)}</p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${selectedSettlement.net_direction === 'ROOMRISE_OWES' ? 'bg-destructive/10 border-destructive/30' : 'bg-success/10 border-success/30'}`}>
                  <p className="text-xs text-muted-foreground">NET</p>
                  <p className={`font-bold ${selectedSettlement.net_direction === 'ROOMRISE_OWES' ? 'text-destructive' : 'text-success'}`}>
                    {formatCurrency(selectedSettlement.net_amount)}
                  </p>
                  <p className="text-xs mt-1">
                    {selectedSettlement.net_direction === 'ROOMRISE_OWES' ? 'RR phải trả' : 'RR phải nhận'}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dịch vụ</TableHead>
                      <TableHead>Khách</TableHead>
                      <TableHead>Ngày DV</TableHead>
                      <TableHead className="text-right">Giá bán</TableHead>
                      <TableHead className="text-right">Giá vốn</TableHead>
                      <TableHead className="text-right">Đã thu</TableHead>
                      <TableHead className="text-right">NET dòng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSettlement.items?.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium">{item.service_name}</p>
                          <p className="text-xs text-muted-foreground">{item.service_type}</p>
                        </TableCell>
                        <TableCell className="text-sm">{item.guest_name || "—"}</TableCell>
                        <TableCell className="text-sm">{formatDate(item.service_date)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.sale_price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.cost_price)}</TableCell>
                        <TableCell className="text-right text-success">{formatCurrency(item.amount_collected)}</TableCell>
                        <TableCell className={`text-right font-medium ${item.net_line >= 0 ? 'text-destructive' : 'text-success'}`}>
                          {formatCurrency(Math.abs(item.net_line))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >
    </>
  );
}
