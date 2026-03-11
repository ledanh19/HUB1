import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { DebouncedSearch } from "@/components/ui/debounced-search";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PiggyBank,
  Loader2,
  Eye,
  Wallet,
  CreditCard,
  ArrowRight,
  Download,
  FileSpreadsheet,
  Moon,
  RefreshCw,
  FileText,
  Info,
  Lock,
  Unlock,
} from "lucide-react";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDepositPrepaidSummary } from "@/hooks/useHostPayments";
import { syncAllHostPayables } from "@/hooks/useHostPayableSync";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { useTablePagination } from "@/hooks/useTablePagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

// Data structure for debt items (segment-level)
interface DebtItem {
  id: string;
  unified_booking_id: string;
  ota_booking_code: string | null; // OTA booking code for display
  host_id: string;
  host_name: string;
  segment_date_from: string;
  segment_date_to: string;
  nights: number;
  rate_per_night: number;
  amount_payable: number;
  remaining_amount: number;
  settlement_id: string | null;
  settlement_status: 'UNSETTLED' | 'SETTLED';
  source_channel: string;
  check_in_date: string;
  check_out_date: string;
  extra_charges_total: number;
  // Collection data from hotel_collects
  total_collected: number;
  roomrise_collected: number;
  host_collected: number;
  collection_status: 'NOT_COLLECTED' | 'PARTIALLY_COLLECTED' | 'FULLY_COLLECTED';
}

export default function HostPayablesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { canUsePage } = useCurrentUserPagePermissions();
  const canPerformActions = canUsePage('/host-payables');
  const [searchParams] = useSearchParams();

  const [settlementFilter, setSettlementFilter] = useState("UNSETTLED");
  const [hostFilter, setHostFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Initialize hostFilter from URL query parameter
  useEffect(() => {
    const partnerFromUrl = searchParams.get("partner");
    if (partnerFromUrl) {
      setHostFilter(partnerFromUrl);
    }
  }, [searchParams]);

  // Sync all payables mutation
  const syncMutation = useMutation({
    mutationFn: syncAllHostPayables,
    onSuccess: (result) => {
      toast.success(`Đã đồng bộ ${result.syncedCount}/${result.totalBookings} booking`);
      queryClient.invalidateQueries({ queryKey: ["host-debt-items"] });
    },
    onError: (error: Error) => {
      toast.error("Lỗi đồng bộ: " + error.message);
    },
  });

  // Fetch hosts for filter
  const { data: hosts = [] } = useQuery({
    queryKey: ["hosts-for-filter"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partners")
        .select("id, partner_name")
        .in("partner_type", ["HOST_LANDLORD", "HOST_OPERATOR"])
        .eq("status", "active")
        .order("partner_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch debt items from host_supply_segments (source of truth)
  // Shows ALL segments - no longer filtered by An Gia group
  const debtQuery = useQuery({
    queryKey: ["host-debt-items", hostFilter, settlementFilter],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      console.log("[HostPayables] Starting query with filters:", { hostFilter, settlementFilter });

      // Get segments with partner info - NO An Gia filter
      let query = supabase
        .from("host_supply_segments")
        .select(`
          id,
          unified_booking_id,
          partner_id,
          date_from,
          date_to,
          nights,
          nightly_rate,
          total_amount,
          settlement_id,
          locked_at,
          partners:partner_id (
            id,
            partner_name
          )
        `)
        .order("date_from", { ascending: false });

      if (hostFilter !== "all") {
        query = query.eq("partner_id", hostFilter);
      }

      if (settlementFilter === "UNSETTLED") {
        query = query.is("settlement_id", null);
      } else if (settlementFilter === "SETTLED") {
        query = query.not("settlement_id", "is", null);
      }

      const { data: segments, error } = await query;
      console.log("[HostPayables] Query result:", { segmentsCount: segments?.length, error });
      if (error) throw error;

      // Get extra charges for bookings - fetch by unified_booking_id AND partner_id
      // to include charges that may not have segment_id assigned
      const bookingIdsForCharges = [...new Set(segments?.map(s => s.unified_booking_id) || [])];
      const { data: extraCharges } = await supabase
        .from("host_extra_charges")
        .select("unified_booking_id, partner_id, segment_id, amount")
        .in("unified_booking_id", bookingIdsForCharges);

      // Get booking info for check-in/out dates from manual_bookings
      const bookingIds = [...new Set(segments?.map(s => s.unified_booking_id) || [])];
      const { data: manualBookings } = await supabase
        .from("manual_bookings")
        .select("unified_booking_id, source, check_in_date, check_out_date, total_amount_net")
        .in("unified_booking_id", bookingIds);

      const { data: mirrorBookings } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, ota_source, ota_booking_code, check_in_date, check_out_date, total_amount_net")
        .in("unified_booking_id", bookingIds);

      // Get host payables for remaining amounts
      // PHASE A: Only read base amount — payment truth is derived from source tables
      const { data: payables } = await supabase
        .from("host_payables")
        .select("id, unified_booking_id, partner_id, amount")
        .in("unified_booking_id", bookingIds);

      // PHASE A FIX: Fetch actual payment truth from source tables
      const payableIds = payables?.map(p => p.id) || [];
      const { fetchPayablePaymentTruth } = await import("@/hooks/useHostPayablesEnhanced");
      const paymentTruth = payableIds.length > 0
        ? await fetchPayablePaymentTruth(payableIds)
        : { paidMap: new Map<string, number>(), depositMap: new Map<string, number>(), prepaidMap: new Map<string, number>() };

      // Get collections from hotel_collects for each booking with payee_type
      const { data: collections } = await supabase
        .from("hotel_collects")
        .select("unified_booking_id, amount_collected, status, payee_type")
        .in("unified_booking_id", bookingIds)
        .neq("status", "VOIDED");

      // Group collections by booking ID with payee_type breakdown
      const collectionsMap = new Map<string, { total: number; roomrise: number; host: number }>();
      collections?.forEach(c => {
        const current = collectionsMap.get(c.unified_booking_id) || { total: 0, roomrise: 0, host: 0 };
        const amount = Number(c.amount_collected || 0);
        current.total += amount;
        if (c.payee_type === "HOST") {
          current.host += amount;
        } else {
          current.roomrise += amount;
        }
        collectionsMap.set(c.unified_booking_id, current);
      });

      // Map to debt items
      const items: DebtItem[] = (segments || []).map(seg => {
        const partner = seg.partners as { id: string; partner_name: string } | null;
        const manualBooking = manualBookings?.find(b => b.unified_booking_id === seg.unified_booking_id);
        const mirrorBooking = mirrorBookings?.find(b => b.unified_booking_id === seg.unified_booking_id);
        const payable = payables?.find(p => p.unified_booking_id === seg.unified_booking_id && p.partner_id === seg.partner_id);
        // Filter extra charges by partner_id (not just segment_id) to include charges without segment
        const segExtraCharges = extraCharges?.filter(ec =>
          ec.unified_booking_id === seg.unified_booking_id && ec.partner_id === seg.partner_id
        ) || [];
        const extraTotal = segExtraCharges.reduce((sum, ec) => sum + Number(ec.amount || 0), 0);

        // PHASE A FIX: Use computed payment truth from source tables
        const totalPayable = Number(seg.total_amount || 0) + extraTotal;
        const payableId = payable?.id;
        const totalSettled = payableId
          ? (paymentTruth.paidMap.get(payableId) || 0) +
            (paymentTruth.depositMap.get(payableId) || 0) +
            (paymentTruth.prepaidMap.get(payableId) || 0)
          : 0;
        const remaining = totalPayable - totalSettled;

        // Get source channel and dates from either manual or mirror booking
        const sourceChannel = manualBooking?.source || mirrorBooking?.ota_source || "MANUAL";
        const checkInDate = manualBooking?.check_in_date || mirrorBooking?.check_in_date || seg.date_from;
        const checkOutDate = manualBooking?.check_out_date || mirrorBooking?.check_out_date || seg.date_to;

        // Get OTA booking code for display (from mirror bookings only)
        const otaBookingCode = mirrorBooking?.ota_booking_code || null;

        // Get collection data with payee_type breakdown
        const collectionData = collectionsMap.get(seg.unified_booking_id) || { total: 0, roomrise: 0, host: 0 };
        const totalCollected = collectionData.total;
        const bookingRevenue = Number(manualBooking?.total_amount_net || mirrorBooking?.total_amount_net || 0) || Number(seg.total_amount || 0);
        let collectionStatus: 'NOT_COLLECTED' | 'PARTIALLY_COLLECTED' | 'FULLY_COLLECTED' = 'NOT_COLLECTED';
        if (totalCollected > 0) {
          collectionStatus = totalCollected >= bookingRevenue ? 'FULLY_COLLECTED' : 'PARTIALLY_COLLECTED';
        }

        return {
          id: seg.id,
          unified_booking_id: seg.unified_booking_id,
          ota_booking_code: otaBookingCode,
          host_id: seg.partner_id,
          host_name: partner?.partner_name || "Unknown",
          segment_date_from: seg.date_from,
          segment_date_to: seg.date_to,
          nights: seg.nights,
          rate_per_night: Number(seg.nightly_rate || 0),
          amount_payable: totalPayable,
          remaining_amount: Math.max(0, remaining),
          settlement_id: seg.settlement_id,
          settlement_status: seg.settlement_id ? 'SETTLED' : 'UNSETTLED',
          source_channel: sourceChannel,
          check_in_date: checkInDate,
          check_out_date: checkOutDate,
          extra_charges_total: extraTotal,
          total_collected: totalCollected,
          roomrise_collected: collectionData.roomrise,
          host_collected: collectionData.host,
          collection_status: collectionStatus,
        };
      });

      return items;
    },
  });
  const { data: debtItems = [], isLoading, error: queryError } = debtQuery;

  usePrefetchMountLog('HostPayablesPage', [
    { key: ['host-debt-items', hostFilter, settlementFilter], query: debtQuery },
  ]);

  // Debug: Log any query errors
  useEffect(() => {
    if (queryError) {
      console.error("[HostPayables] Query error:", queryError);
    }
    console.log("[HostPayables] debtItems count:", debtItems.length);
  }, [queryError, debtItems]);

  const { data: depositPrepaidSummary } = useDepositPrepaidSummary();

  // Apply search filter
  const filteredItems = useMemo(() => {
    if (!searchTerm) return debtItems;
    const term = searchTerm.toLowerCase();
    return debtItems.filter(
      (item) =>
        item.unified_booking_id.toLowerCase().includes(term) ||
        item.host_name.toLowerCase().includes(term)
    );
  }, [debtItems, searchTerm]);

  // Pagination
  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredItems, { defaultPageSize: 10, resetDeps: [searchTerm, hostFilter, settlementFilter] });

  // Calculate KPI stats
  const stats = useMemo(() => {
    const openItems = filteredItems.filter(item => item.remaining_amount > 0);
    const unsettledItems = openItems.filter(item => item.settlement_status === 'UNSETTLED');
    const settledItems = openItems.filter(item => item.settlement_status === 'SETTLED');

    // Collection stats
    const totalCollected = filteredItems.reduce((sum, item) => sum + item.total_collected, 0);
    const notCollectedCount = filteredItems.filter(item => item.collection_status === 'NOT_COLLECTED').length;
    const partiallyCollectedCount = filteredItems.filter(item => item.collection_status === 'PARTIALLY_COLLECTED').length;
    const fullyCollectedCount = filteredItems.filter(item => item.collection_status === 'FULLY_COLLECTED').length;

    return {
      totalOpenDebt: openItems.reduce((sum, item) => sum + item.remaining_amount, 0),
      unsettledDebt: unsettledItems.reduce((sum, item) => sum + item.remaining_amount, 0),
      unsettledCount: unsettledItems.length,
      settledDebt: settledItems.reduce((sum, item) => sum + item.remaining_amount, 0),
      settledCount: settledItems.length,
      // Collection stats
      totalCollected,
      notCollectedCount,
      partiallyCollectedCount,
      fullyCollectedCount,
    };
  }, [filteredItems]);

  // Selection disabled - settlements are created from Settlement page only
  // Users must go to /host-payables/settlement and select Host + date range

  // Export function
  const handleExportExcel = () => {
    const exportData = filteredItems.map((item) => ({
      "Mã Booking": item.unified_booking_id,
      "Host": item.host_name,
      "Segment": `${format(new Date(item.segment_date_from), "dd/MM")} - ${format(new Date(item.segment_date_to), "dd/MM")}`,
      "Số đêm": item.nights,
      "Đơn giá/đêm": Number(item.rate_per_night),
      "Tổng phát sinh": Number(item.amount_payable),
      "Đã thu (tổng)": Number(item.total_collected),
      "RR thu": Number(item.roomrise_collected),
      "Host thu": Number(item.host_collected),
      "TT Thu": item.collection_status === 'FULLY_COLLECTED' ? "Đã thu đủ" :
        item.collection_status === 'PARTIALLY_COLLECTED' ? "Thu 1 phần" : "Chưa thu",
      "Còn lại": Number(item.remaining_amount),
      "Trạng thái QT": item.settlement_status === 'SETTLED' ? "Đã quyết toán" : "Chưa quyết toán",
      "Nguồn": item.source_channel,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Công nợ Host");
    XLSX.writeFile(
      wb,
      `cong-no-host-${new Date().toISOString().split("T")[0]}.xlsx`
    );
    toast.success(`Đã xuất ${exportData.length} dòng`);
  };

  if (isLoading) return <><PageSkeleton cards={5} rows={6} columns={10} /></>;

  return (
    <>
      <Header
        title="Công nợ Host"
        subtitle=""
      />

      <PageContainer><SectionCard>
        {/* KPI Header - Mobile scroll, Desktop grid */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-5 md:overflow-visible scrollbar-hide">
          {/* 1. Tổng công nợ đang mở */}
          <div className="flex-shrink-0 w-[140px] md:w-auto kpi-card border-destructive/50">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="kpi-label flex items-center gap-1 text-micro md:text-xs">
                  <span className="h-2 w-2 rounded-full bg-destructive flex-shrink-0" />
                  <span className="truncate">Công nợ mở</span>
                </p>
                <p className="kpi-value text-destructive text-lg md:text-xl truncate">{formatCurrency(stats.totalOpenDebt)}</p>
                <p className="text-micro text-muted-foreground">Open</p>
              </div>
              <PiggyBank className="hidden md:block h-6 w-6 text-destructive/60 flex-shrink-0" />
            </div>
          </div>

          {/* 2. Chưa quyết toán */}
          <div className="flex-shrink-0 w-[140px] md:w-auto kpi-card border-warning/50">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="kpi-label flex items-center gap-1 text-micro md:text-xs">
                  <Unlock className="h-3 w-3 flex-shrink-0" /> <span className="truncate">Chưa QT</span>
                </p>
                <p className="kpi-value text-warning text-lg md:text-xl truncate">{formatCurrency(stats.unsettledDebt)}</p>
                <p className="text-micro text-muted-foreground">{stats.unsettledCount} khoản</p>
              </div>
              <FileText className="hidden md:block h-6 w-6 text-warning/60 flex-shrink-0" />
            </div>
          </div>

          {/* 3. Đã quyết toán */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-shrink-0 w-[140px] md:w-auto kpi-card border-dashed border-info/50">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="kpi-label flex items-center gap-1 text-micro md:text-xs">
                        <Lock className="h-3 w-3 flex-shrink-0" /> <span className="truncate">Đã QT</span>
                      </p>
                      <p className="kpi-value text-info text-lg md:text-xl truncate">{formatCurrency(stats.settledDebt)}</p>
                      <p className="text-micro text-muted-foreground">{stats.settledCount} khoản</p>
                    </div>
                    <Info className="hidden md:block h-6 w-6 text-info/60 flex-shrink-0" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Khoản đã vào quyết toán nhưng chưa xử lý hết</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* 4. Deposit đang giữ */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-shrink-0 w-[140px] md:w-auto kpi-card border-dashed">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="kpi-label flex items-center gap-1 text-micro md:text-xs">
                        <Wallet className="h-3 w-3 flex-shrink-0" /> <span className="truncate">Deposit</span>
                      </p>
                      <p className="kpi-value text-lg md:text-xl truncate">
                        {depositPrepaidSummary ? formatCurrency(depositPrepaidSummary.totalDepositsHeld) : formatCurrency(0)}
                      </p>
                      <p className="text-micro text-muted-foreground">{depositPrepaidSummary?.depositsCount || 0} khoản</p>
                    </div>
                    <Wallet className="hidden md:block h-6 w-6 text-muted-foreground/60 flex-shrink-0" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tham chiếu - số chốt ở trang Quyết toán Host</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* 5. Prepaid chờ cấn trừ */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-shrink-0 w-[140px] md:w-auto kpi-card border-dashed">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="kpi-label flex items-center gap-1 text-micro md:text-xs">
                        <CreditCard className="h-3 w-3 flex-shrink-0" /> <span className="truncate">Prepaid</span>
                      </p>
                      <p className="kpi-value text-lg md:text-xl truncate">
                        {depositPrepaidSummary ? formatCurrency(depositPrepaidSummary.totalPrepaidsOpen) : formatCurrency(0)}
                      </p>
                      <p className="text-micro text-muted-foreground">{depositPrepaidSummary?.prepaidsCount || 0} khoản</p>
                    </div>
                    <CreditCard className="hidden md:block h-6 w-6 text-muted-foreground/60 flex-shrink-0" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tham chiếu - số chốt ở trang Quyết toán Host</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Reference Note - Compact on mobile */}
        <Alert variant="default" className="border-primary/20 bg-primary/5 py-2 md:py-3">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-primary text-micro md:text-sm">
            <span className="hidden md:inline"><strong>Lưu ý:</strong> "Đã thu từ khách" là số tiền thu từ hotel_collects (Thu từ khách ≠ Trả cho Host). Deposit/Prepaid chỉ mang tính tham chiếu, số chốt và cấn trừ cuối cùng nằm ở trang </span>
            <span className="md:hidden">Chi tiết quyết toán tại </span>
            <AppLink to="/host-payables/settlement" className="underline font-medium">Quyết toán Host</AppLink>.
          </AlertDescription>
        </Alert>

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Tìm kiếm và lọc công nợ Host"
          hasActiveFilters={!!(searchTerm || hostFilter !== "all" || settlementFilter !== "all")}
          onClearFilters={() => {
            setSearchTerm("");
            setHostFilter("all");
            setSettlementFilter("all");
          }}
        >
          <FilterBar.Field label="Tìm kiếm" colSpan={2}>
            <DebouncedSearch
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Tìm booking, host..."
            />
          </FilterBar.Field>

          <FilterBar.Field label="Host">
            <Select value={hostFilter} onValueChange={setHostFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả Host" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả Host</SelectItem>
                {hosts.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.partner_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterBar.Field>

          <FilterBar.Field label="Trạng thái quyết toán">
            <Select value={settlementFilter} onValueChange={setSettlementFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="UNSETTLED">Chưa QT</SelectItem>
                <SelectItem value="SETTLED">Đã QT</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
        </FilterBar>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="h-9 px-3"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="hidden md:inline ml-2">Đồng bộ</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden md:flex h-9">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Debt Items */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <PiggyBank className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Chưa có công nợ nào</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {paginatedData.map((item) => {
                const isSettled = item.settlement_status === 'SETTLED';
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border border-border/60 bg-card p-3 active:bg-muted/50 transition-colors ${isSettled ? "bg-primary/5 border-primary/20" : ""
                      }`}
                    onClick={() => navigate(`/bookings/${item.unified_booking_id}`)}
                  >
                    {/* Row 1: Host + Amount */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{item.host_name}</p>
                        <p className="text-micro text-muted-foreground font-mono truncate">
                          {(item.ota_booking_code || item.unified_booking_id.slice(0, 16)).replace(/^[A-Za-z]+-/, "")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${item.remaining_amount > 0 ? "text-destructive" : "text-success"
                          }`}>
                          {item.remaining_amount > 0 ? '🔴' : '✅'} {formatCurrency(item.remaining_amount)}
                        </p>
                        {isSettled ? (
                          <StatusBadge variant="info" size="sm"><Lock className="h-2.5 w-2.5 mr-0.5" /> QT</StatusBadge>
                        ) : (
                          <StatusBadge variant="warning" size="sm"><Unlock className="h-2.5 w-2.5 mr-0.5" /> Chờ</StatusBadge>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Dates + Nights + Total */}
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-micro px-1.5">{item.source_channel}</Badge>
                        <span>
                          {format(new Date(item.segment_date_from), "dd/MM")} - {format(new Date(item.segment_date_to), "dd/MM")}
                        </span>
                        <Badge variant="secondary" className="text-micro">{item.nights}đ</Badge>
                      </div>
                      <span className="font-medium text-foreground">{formatCurrency(item.amount_payable)}</span>
                    </div>

                    {/* Row 3: Collection status */}
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                      <span className="text-micro text-muted-foreground">Thu từ khách:</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium ${item.collection_status === 'FULLY_COLLECTED' ? 'text-success' :
                          item.collection_status === 'PARTIALLY_COLLECTED' ? 'text-warning' : 'text-muted-foreground'
                          }`}>
                          {formatCurrency(item.total_collected)}
                        </span>
                        {item.collection_status === 'FULLY_COLLECTED' && (
                          <Badge variant="outline" className="text-micro bg-success/5 text-success border-success/20 px-1">✅</Badge>
                        )}
                        {item.collection_status === 'PARTIALLY_COLLECTED' && (
                          <Badge variant="outline" className="text-micro bg-warning/5 text-warning border-warning/20 px-1">⚠️</Badge>
                        )}
                        {item.collection_status === 'NOT_COLLECTED' && (
                          <Badge variant="outline" className="text-micro bg-destructive/5 text-destructive border-destructive/20 px-1">🔴</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="table-header w-[180px]">Booking</th>
                    <th className="table-header w-[140px]">Host</th>
                    <th className="table-header w-[120px]">Segment</th>
                    <th className="table-header text-center w-[60px]">
                      <span className="flex items-center justify-center gap-1">
                        <Moon className="h-3 w-3" /> Đêm
                      </span>
                    </th>
                    <th className="table-header-right w-[130px]">Đơn giá/đêm</th>
                    <th className="table-header-right w-[130px]">Tổng phát sinh</th>
                    <th className="table-header-right w-[140px]">Đã thu từ khách</th>
                    <th className="table-header-right w-[130px]">Còn lại</th>
                    <th className="table-header w-[100px]">Settlement</th>
                    <th className="table-header w-[60px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedData.map((item) => {
                    const isSettled = item.settlement_status === 'SETTLED';

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-muted/30 transition-colors cursor-pointer ${isSettled ? "bg-primary/5" : ""
                          }`}
                        onClick={() => navigate(`/bookings/${item.unified_booking_id}`)}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/bookings/${item.unified_booking_id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {(item.ota_booking_code || item.unified_booking_id).replace(/^[A-Za-z]+-/, "")}
                            </Link>
                            <Badge variant="outline" className="text-xs">
                              {item.source_channel}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium">{item.host_name}</td>
                        <td className="px-3 py-3 text-sm text-muted-foreground">
                          {format(new Date(item.segment_date_from), "dd/MM")} – {format(new Date(item.segment_date_to), "dd/MM")}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <Badge variant="secondary">{item.nights}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right text-sm">
                          {formatCurrency(item.rate_per_night)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="font-medium">
                            {formatCurrency(item.amount_payable)}
                          </span>
                          {item.extra_charges_total > 0 && (
                            <p className="text-xs text-muted-foreground">
                              +{formatCurrency(item.extra_charges_total)} phụ phí
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={`font-medium ${item.collection_status === 'FULLY_COLLECTED' ? 'text-success' :
                            item.collection_status === 'PARTIALLY_COLLECTED' ? 'text-warning' : 'text-muted-foreground'
                            }`}>
                            {formatCurrency(item.total_collected)}
                          </span>
                          {/* Show breakdown of who collected */}
                          {item.total_collected > 0 && (
                            <div className="text-xs mt-0.5 space-y-0.5">
                              {item.roomrise_collected > 0 && (
                                <p className="text-primary">
                                  RR: {formatCurrency(item.roomrise_collected)}
                                </p>
                              )}
                              {item.host_collected > 0 && (
                                <p className="text-primary">
                                  Host: {formatCurrency(item.host_collected)}
                                </p>
                              )}
                            </div>
                          )}
                          <div className="mt-0.5">
                            {item.collection_status === 'FULLY_COLLECTED' && (
                              <Badge variant="outline" className="text-xs bg-success/5 text-success border-success/20">✅ Đủ</Badge>
                            )}
                            {item.collection_status === 'PARTIALLY_COLLECTED' && (
                              <Badge variant="outline" className="text-xs bg-warning/5 text-warning border-warning/20">⚠️ 1 phần</Badge>
                            )}
                            {item.collection_status === 'NOT_COLLECTED' && (
                              <Badge variant="outline" className="text-xs bg-destructive/5 text-destructive border-destructive/20">🔴 Chưa</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span
                            className={`font-bold text-base ${item.remaining_amount > 0
                              ? "text-destructive"
                              : "text-success"
                              }`}
                          >
                            {item.remaining_amount > 0 ? '🔴 ' : '✅ '}
                            {formatCurrency(item.remaining_amount)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {isSettled ? (
                            <StatusBadge variant="info" dot>
                              <Lock className="h-3 w-3 mr-1" />
                              Đã QT
                            </StatusBadge>
                          ) : (
                            <StatusBadge variant="warning" dot>
                              <Unlock className="h-3 w-3 mr-1" />
                              Chưa QT
                            </StatusBadge>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link to={`/bookings/${item.unified_booking_id}`}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Xem booking
                                </Link>
                              </DropdownMenuItem>
                              {isSettled && item.settlement_id && (
                                <DropdownMenuItem asChild>
                                  <Link to={`/host-payables/settlement?settlement=${item.settlement_id}`}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Xem quyết toán
                                  </Link>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
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
              itemLabel="công nợ"
            />
          </>
        )}
      </SectionCard></PageContainer>
    </>
  );
}
