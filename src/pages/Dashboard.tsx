import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { OtaBadge } from "@/components/ui/ota-badge";
import { ConnectionStatus, LastUpdatedTimestamp } from "@/components/ui/sync-indicator";
import { useRealtimeSystem } from "@/hooks/useRealtimeSystem";
import { useAuth } from "@/hooks/useAuth";
import { GlobalContextBar } from "@/components/dashboard/GlobalContextBar";
import { DataStabilityBadge, SectionHeader } from "@/components/dashboard/DataStabilityBadge";
import { getBookingStatusVariant } from "@/constants/status-config";
import { LAYER_TITLES, DATA_WARNINGS } from "@/constants/dashboard_glossary";
import {
  fetchAllRowsPaginated,
  fetchWithBatchedInClause,
  useAnGiaPropertyIds,
  DASHBOARD_STALE_TIMES,
} from "@/hooks/useDashboardData";
import {
  SectionSkeleton,
  CashSectionSkeleton,
  ProfitGapSkeleton,
  ForecastCardSkeleton,
} from "@/components/dashboard/DashboardSkeleton";
import {
  CalendarCheck,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Plus,
  Home,
  Clock,
  Users,
  Building2,
  Loader2,
  Wallet,
  Receipt,
  FileText,
  Banknote,
  Info,
  Scale,
  HelpCircle,
  Target,
  Eye,
  Activity,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AppLink } from "@/components/system/AppLink";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { useQuery } from "@tanstack/react-query";
import { usePrefetchMountLog } from "@/lib/navigation/usePrefetchMountLog";
import { supabase, safeQuery, safeMutation, safeFrom } from "@/integrations/supabase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo, useEffect } from "react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, addDays } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { BookingSourcesChart } from "@/components/dashboard/BookingSourcesChart";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
// SOT: Shared P&L + Cash calculator (same codepath as Report P&L)
import { usePLCalculator } from "@/hooks/usePLCalculator";
// SOT: Shared OTA AR hooks (same query keys = shared cache)
import { useOtaArSummary, useOtaPayoutPendingSummary } from "@/hooks/useOtaArSummary";
// SOT: Shared new booking count (same codepath as Booking Center + Stays)
import { useNewBookingCount } from "@/hooks/useNewBookingCount";
// SOT: Shared stays operations (same query/cache as Stays page)
import { fetchStaysOperations, type StayWithBooking } from "@/lib/stays/fetchStaysOperations";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

// =============================================================================
// Query helpers (avoid backend 1000-row cap + overly large IN clauses)
// =============================================================================
const QUERY_PAGE_SIZE = 1000;
const IN_BATCH_SIZE = 200;
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

async function fetchAllRows(
  tableName: string,
  selectQuery: string,
  applyFilters?: (query: any) => any
): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    let q = safeFrom(tableName as any).select(selectQuery)
      .range(from, from + QUERY_PAGE_SIZE - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < QUERY_PAGE_SIZE) break;
  }
  return all;
}

async function fetchWithBatchedIn(
  tableName: string,
  selectQuery: string,
  columnName: string,
  ids: string[],
  applyFilters?: (query: any) => any
): Promise<any[]> {
  if (!ids.length) return [];
  const all: any[] = [];
  for (let i = 0; i < ids.length; i += IN_BATCH_SIZE) {
    const batch = ids.slice(i, i + IN_BATCH_SIZE);
    let q = safeFrom(tableName as any).select(selectQuery)
      .in(columnName, batch);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (data) all.push(...data);
  }
  return all;
}


const getStatusLabel = (status: string) => {
  switch (status) {
    case "CONFIRMED":
      return "Đã xác nhận";
    case "CHECKED_IN":
      return "Đã nhận phòng";
    case "CHECKED_OUT":
      return "Đã trả phòng";
    case "CANCELLED":
      return "Đã huỷ";
    case "NO_SHOW":
      return "No-show";
    case "PENDING":
      return "Chờ xác nhận";
    default:
      return status;
  }
};

type PeriodFilter = "today" | "7days" | "30days" | "month";

export default function Dashboard() {
  const navigate = useNavigate();
  const { appNavigate } = useAppNavigate();
  const location = useLocation();
  const { userRole } = useAuth();
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Executive mode: hide drilldown links via query param only
  const searchParams = new URLSearchParams(location.search);
  const isExecutiveMode = searchParams.get("view") === "executive";

  // Show access denied toast if redirected
  useEffect(() => {
    if (location.state?.accessDenied) {
      toast.error("Bạn không có quyền truy cập trang đó", {
        description: "Vui lòng liên hệ quản trị viên nếu cần cấp quyền",
      });
      // Clear the state so it doesn't show again on refresh
      navigate("/", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  // Use useMemo to prevent re-renders causing new date string each time
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  // Calculate date range based on period
  // IMPORTANT: "month" = MTD (Month-to-Date) to match P&L and Cashflow pages
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "today":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "7days":
        return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
      case "30days":
        return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
      case "month":
        // MTD: từ đầu tháng đến hôm nay (không phải cuối tháng)
        return { from: startOfMonth(now), to: endOfDay(now) };
      default:
        return { from: startOfDay(now), to: endOfDay(now) };
    }
  }, [period]);

  // ========== A. VẬN HÀNH ==========
  // SOT: Use shared fetchStaysOperations (same query as Stays page)
  // Cache key: ["stays_operations", today] — shared with Stays page for instant data
  const staysQuery = useQuery<StayWithBooking[]>({
    queryKey: ["stays_operations", today],
    staleTime: DASHBOARD_STALE_TIMES.operations,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchStaysOperations(today),
  });
  const { data: staysData = [], isLoading: staysLoading, refetch: refetchStays } = staysQuery;

  // NEW BOOKINGS TODAY — SOT shared hook (same codepath as Booking Center + Stays)
  const { data: bookingsCountData, isLoading: bookingsCountLoading } = useNewBookingCount({
    from: today,
    staleTime: DASHBOARD_STALE_TIMES.operations,
    queryKeySuffix: "dashboard",
  });

  // ── Compute operational KPIs from shared SOT data (segment-aware, same logic as Stays) ──
  const opsKpis = useMemo(() => {
    const checkinAll: StayWithBooking[] = [];
    const inHouseList: StayWithBooking[] = [];
    const checkoutAll: StayWithBooking[] = [];
    const noRoomAll: StayWithBooking[] = [];
    const seenNoRoom = new Set<string>();

    for (const s of staysData) {
      if (!s.booking) continue;
      // Skip CANCELLED/NO_SHOW for operational KPIs
      if (s.booking.booking_status === "CANCELLED" || s.booking.booking_status === "NO_SHOW") continue;

      const hasSegment = !!s.segment;
      const checkedInAt = s.actual_check_in_at;
      const checkedOutAt = s.actual_check_out_at;

      // NHẬN PHÒNG: segment date_from = today (or booking check_in_date if no segment)
      const segmentDateFrom = s.segment?.date_from?.split("T")[0];
      if (hasSegment ? segmentDateFrom === today : s.booking.check_in_date === today) {
        checkinAll.push(s);
      }

      // ĐANG Ở: checked in, not checked out
      if (checkedInAt && !checkedOutAt) {
        inHouseList.push(s);
      }

      // TRẢ PHÒNG KPI: allocated + checkout date = today (SOT: Booking Center)
      if (hasSegment) {
        const segmentDateTo = s.segment?.date_to?.split("T")[0];
        const checkOutDateForKpi = segmentDateTo || s.booking.check_out_date;
        if (checkOutDateForKpi === today) {
          checkoutAll.push(s);
        }
      }

      // CHƯA PHÂN BỔ: coverage not complete (dedupe by booking)
      if (!seenNoRoom.has(s.unified_booking_id)) {
        const isComplete = s.coverage?.isComplete ?? false;
        if (!isComplete) {
          seenNoRoom.add(s.unified_booking_id);
          noRoomAll.push(s);
        }
      }
    }

    return { checkinAll, inHouseList, checkoutAll, noRoomAll };
  }, [staysData, today]);

  // "Chưa phân bổ" — filtered by 7 days (synced with Stays page default "7 ngày")
  // Shows bookings with check-in within 7 days ahead (0 <= diffDays <= 7)
  const pendingRooms = useMemo(() => {
    const todayMs = new Date().setHours(0, 0, 0, 0);
    return opsKpis.noRoomAll.filter(s => {
      if (!s.booking?.check_in_date) return false;
      const checkInMs = new Date(s.booking.check_in_date + "T00:00:00").getTime();
      const diffDays = Math.floor((checkInMs - todayMs) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    }).length;
  }, [opsKpis.noRoomAll]);

  // Convenience destructuring for KPI rendering
  const todayCheckIns = opsKpis.checkinAll.length;
  const inHouse = opsKpis.inHouseList.length;
  const todayCheckOuts = opsKpis.checkoutAll.length;

  // Breakdown for tooltips
  const noRoomToday = opsKpis.checkinAll.filter(s => !s.segment && !s.actual_check_in_at).length;
  const readyToCheckIn = opsKpis.checkinAll.filter(s => !!s.segment && !s.actual_check_in_at).length;
  const pendingCheckOuts = opsKpis.checkoutAll.filter(s => !!s.actual_check_in_at && !s.actual_check_out_at).length;
  const checkedOutToday = opsKpis.checkoutAll.filter(s => !!s.actual_check_out_at).length;

  // ========== B. CASH + P&L (Shared SOT Calculator) ==========
  // SOT: Use shared P&L calculator (same codepath as Report P&L)
  // Uses stays.actual_check_out_at as time key for room revenue (PMS standard)
  // Includes Cash In/Out queries for Profit vs Cash Gap
  const { data: pl, isLoading: plLoading, refetch: plRefetch } = usePLCalculator({
    startDate: dateRange.from,
    endDate: dateRange.to,
  });

  // Derive values for rendering compatibility (avoid JSX changes)
  const cashInData = pl.cash.cash_in;
  const cashOutData = pl.cash.cash_out;
  const netCashflow = pl.cash.net_cash;
  const roomRevenue = pl.accrual.revenue_room;
  const serviceRevenue = pl.accrual.revenue_service;
  const hostCost = pl.accrual.cogs_host;
  const serviceCost = pl.accrual.cogs_service;
  const totalRevenue = pl.accrual.revenue;
  const totalCOGS = pl.accrual.cogs;
  const grossProfit = pl.accrual.gross_profit;
  const opex = pl.accrual.opex;
  const otaCommission = pl.accrual.opex_ota_commission;
  const netProfit = pl.accrual.net_profit;
  const profitCashGap = pl.difference.profit_minus_cash;

  // ========== C. CÔNG NỢ OTA (OTA Receivables) ==========
  // SOT: Shared hook — same query key = shared cache with OTA Payout Dashboard tab
  const otaReceivablesQuery = useOtaArSummary();
  const { data: otaReceivablesData, isLoading: otaReceivablesLoading, refetch: refetchOtaReceivables } = otaReceivablesQuery;

  // ========== OTA PAYOUT SNAPSHOT (Đã tạo payout - đang chờ tiền về) ==========
  // SOT: Shared hook — same query key = shared cache with OTA Payout Dashboard tab
  const { data: otaPayoutData, refetch: refetchOtaPayout } = useOtaPayoutPendingSummary();

  // ========== D. CÔNG NỢ HOST (SPLIT: LEGACY / ACTUAL / EXPECTED) ==========
  // WHY: Công nợ Host = tổng phát sinh từ segments - đã thanh toán
  // SPLIT: Actual = booking đã check-in (SOT: stays.actual_check_in_at IS NOT NULL)
  //        Expected = booking chưa check-in (segment tương lai)
  //        Legacy = tổng tất cả (backward-compatible, không thay đổi)
  const { data: hostDebtData, refetch: refetchHostDebt } = useQuery({
    queryKey: ["dashboard-host-debt"],
    staleTime: DASHBOARD_STALE_TIMES.receivables,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const emptyResult = {
        // Legacy (unchanged)
        totalPayable: 0, totalPaid: 0, remaining: 0, unpaidCount: 0, unsettledCount: 0,
        // Actual (checked-in only)
        actualPayable: 0, actualUnsettled: 0, actualRemaining: 0, actualCount: 0,
        // Expected (not checked-in)
        expectedPayable: 0, expectedRemaining: 0, expectedCount: 0,
        // Meta
        checkinBasis: 'STAYS_ACTUAL_CHECK_IN_AT' as const,
      };

      // 1. Get all host supply segments (source of debt)
      // Include date_from for PMS-standard accrual check (segment supply period must have started)
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const { data: segments, error: segError } = await supabase
        .from("host_supply_segments")
        .select("id, unified_booking_id, partner_id, total_amount, settlement_id, date_from");

      if (segError) throw segError;
      if (!segments || segments.length === 0) return emptyResult;

      // 2. Get extra charges for these bookings
      const bookingIds = [...new Set(segments.map(s => s.unified_booking_id))];
      const { data: extraCharges } = await supabase
        .from("host_extra_charges")
        .select("unified_booking_id, partner_id, amount")
        .in("unified_booking_id", bookingIds);

      // Group extra charges by booking + partner
      const extraChargeMap = new Map<string, number>();
      extraCharges?.forEach(ec => {
        const key = `${ec.unified_booking_id}|${ec.partner_id}`;
        extraChargeMap.set(key, (extraChargeMap.get(key) || 0) + Number(ec.amount || 0));
      });

      // 3. Get total paid from cashflow_entries (HOST_SETTLEMENT_PAYMENT)
      const { data: cashflows } = await supabase
        .from("cashflow_entries")
        .select("amount, direction")
        .eq("source_type", "HOST_SETTLEMENT_PAYMENT")
        .eq("direction", "OUT");

      const totalPaid = cashflows?.reduce((sum, cf) => sum + Number(cf.amount || 0), 0) || 0;

      // 4. Get stays check-in data (SOT for Actual vs Expected split)
      // Fetch stays for all booking_ids from segments, pick best status per booking
      const staysRaw = await fetchWithBatchedIn(
        "stays",
        "unified_booking_id, stay_status, actual_check_in_at",
        "unified_booking_id",
        bookingIds
      );

      // Build check-in map: booking_id → is_checked_in
      // A booking is "checked-in" if ANY stay has actual_check_in_at set
      // OR stay_status IN ('CHECKED_IN', 'IN_HOUSE', 'CHECKED_OUT')
      const checkedInBookings = new Set<string>();
      const noShowBookings = new Set<string>();
      staysRaw?.forEach((s: any) => {
        if (s.actual_check_in_at || ['CHECKED_IN', 'IN_HOUSE', 'CHECKED_OUT'].includes(s.stay_status)) {
          checkedInBookings.add(s.unified_booking_id);
        }
        if (s.stay_status === 'NO_SHOW') {
          noShowBookings.add(s.unified_booking_id);
        }
      });

      // PMS SaaS Standard: "Incurred" (Đã phát sinh) requires BOTH:
      //   1) Booking has checked-in (operational SOT: stays.actual_check_in_at)
      //   2) Segment supply period has started (segment.date_from <= today)
      // Prevents early check-in button press from prematurely recognizing host debt.

      // 5. Calculate totals (LEGACY unchanged + ACTUAL/EXPECTED split)
      let totalPayable = 0;
      let unsettledCount = 0;
      let actualPayable = 0;
      let actualUnsettled = 0;
      let actualCount = 0;
      let expectedPayable = 0;
      let expectedCount = 0;

      for (const seg of segments) {
        const key = `${seg.unified_booking_id}|${seg.partner_id}`;
        const extraAmount = extraChargeMap.get(key) || 0;
        const segmentTotal = Number(seg.total_amount || 0) + extraAmount;

        // LEGACY (unchanged)
        totalPayable += segmentTotal;
        if (!seg.settlement_id) unsettledCount++;

        // ACTUAL vs EXPECTED split (PMS SaaS standard accrual)
        const isCheckedIn = checkedInBookings.has(seg.unified_booking_id);
        const isNoShow = noShowBookings.has(seg.unified_booking_id) && !isCheckedIn;
        // Supply period started? (date_from <= today)
        const supplyStarted = seg.date_from && seg.date_from <= todayStr;

        if (isNoShow) {
          // NO_SHOW: exclude from Actual/Expected (Legacy still includes)
          continue;
        }

        // Incurred = checked-in AND supply period started
        if (isCheckedIn && supplyStarted) {
          actualPayable += segmentTotal;
          actualCount++;
          if (!seg.settlement_id) actualUnsettled++;
        } else {
          // Expected includes: not checked-in, OR checked-in but supply not started yet
          expectedPayable += segmentTotal;
          expectedCount++;
        }
      }

      // LEGACY remaining (unchanged)
      const remaining = Math.max(0, totalPayable - totalPaid);
      const unpaidCount = remaining > 0 ? segments.length : 0;

      // ACTUAL remaining: payments applied to actual first
      const paidAppliedToActual = Math.min(totalPaid, actualPayable);
      const actualRemaining = Math.max(0, actualPayable - paidAppliedToActual);

      // EXPECTED remaining: do NOT subtract paid (cannot prove allocation)
      const expectedRemaining = expectedPayable;

      return {
        // Legacy
        totalPayable, totalPaid, remaining, unpaidCount, unsettledCount,
        // Actual
        actualPayable, actualUnsettled, actualRemaining, actualCount,
        // Expected
        expectedPayable, expectedRemaining, expectedCount,
        // Meta
        checkinBasis: 'STAYS_CHECKIN_AND_SEGMENT_DATE' as const,
      };
    },
  });

  // ========== E. CÔNG NỢ DỊCH VỤ ==========
  // WHY: Service nợ = dịch vụ đã finalize nhưng CHƯA chi tiền
  // FIX: Tính paid_amount từ cashflow_entries (source of truth), chỉ tính settlement đã finalize
  const { data: serviceDebtData, refetch: refetchServiceDebt } = useQuery({
    queryKey: ["dashboard-service-debt"],
    staleTime: DASHBOARD_STALE_TIMES.receivables,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // 1. Get finalized service settlements only
      const query = supabase
        .from("service_settlements")
        .select("id, net_amount, net_direction")
        .not("finalized_at", "is", null);

      const { data: settlements, error } = await query;
      if (error) throw error;

      if (!settlements || settlements.length === 0) {
        return { totalPayable: 0, totalPaid: 0, remaining: 0, unpaidCount: 0 };
      }

      // 2. Get paid amounts from cashflow_entries (source of truth)
      const settlementIds = settlements.map(s => s.id);
      const { data: cashflows, error: cfError } = await supabase
        .from("cashflow_entries")
        .select("source_id, amount, direction")
        .eq("source_type", "SERVICE_SETTLEMENT_PAYMENT")
        .in("source_id", settlementIds);

      if (cfError) throw cfError;

      // Group payments by settlement
      const paidBySettlement = new Map<string, { in: number; out: number }>();
      cashflows?.forEach((cf) => {
        const current = paidBySettlement.get(cf.source_id || "") || { in: 0, out: 0 };
        if (cf.direction === "IN") {
          current.in += Number(cf.amount || 0);
        } else {
          current.out += Number(cf.amount || 0);
        }
        paidBySettlement.set(cf.source_id || "", current);
      });

      // 3. Calculate totals
      let totalPayable = 0;
      let totalPaid = 0;
      let totalRemaining = 0;
      let unpaidCount = 0;

      for (const s of settlements) {
        const netAmount = Number(s.net_amount || 0);
        // For service: positive = RS pays partner (PAY), negative = Partner pays RS (RECEIVE)
        const netDirection = netAmount >= 0 ? "PAY" : "RECEIVE";
        const absNet = Math.abs(netAmount);

        // Get paid amount based on direction
        const payments = paidBySettlement.get(s.id) || { in: 0, out: 0 };
        const paidAmount = netDirection === "RECEIVE" ? payments.in : payments.out;
        const remaining = Math.max(0, absNet - paidAmount);

        totalPayable += absNet;
        totalPaid += paidAmount;
        totalRemaining += remaining;
        if (remaining > 0) unpaidCount++;
      }

      return { totalPayable, totalPaid, remaining: totalRemaining, unpaidCount };
    },
  });

  // ========== F. CẢNH BÁO ==========
  const { data: openDisputes } = useQuery({
    queryKey: ["dashboard-open-disputes"],
    staleTime: DASHBOARD_STALE_TIMES.operations,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const query = supabase
        .from("ota_disputes")
        .select("amount_in_dispute")
        .in("status", ["OPEN", "IN_REVIEW"]);

      const { data, error } = await query;
      if (error) throw error;
      return {
        amount: data?.reduce((sum, d) => sum + Number(d.amount_in_dispute), 0) || 0,
        count: data?.length || 0,
      };
    },
  });

  // ========== G. 30-DAY FORECAST (Committed vs Likely vs Expected) ==========
  // PMS SaaS Standard: Forecast reuses Host Debt split (Actual/Expected)
  // instead of duplicating segment queries
  const forecast30d = useMemo(() => format(addDays(new Date(), 30), "yyyy-MM-dd"), []);

  const forecastQuery = useQuery({
    queryKey: ["dashboard-30d-forecast", today, forecast30d],
    staleTime: DASHBOARD_STALE_TIMES.forecast,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // 1. Committed Cash In = OTA payouts with PARTIAL status (already received part)
      //    PARTIAL means "đã nhận một phần" - confirmed partial collection
      const { data: partialPayouts } = await supabase
        .from("ota_payouts")
        .select("net_payout_amount, total_amount, status")
        .eq("status", "PARTIAL")
        .eq("is_voided", false)
        .gte("payout_date", today)
        .lte("payout_date", forecast30d);

      const committedIn = partialPayouts?.reduce((sum, p) => sum + Number(p.net_payout_amount ?? p.total_amount ?? 0), 0) || 0;

      // 2. Likely Cash In = OTA payouts with PENDING status (payout created, awaiting collection)
      //    PENDING means "chờ về" - payout record exists but no collection yet
      const { data: pendingPayouts } = await supabase
        .from("ota_payouts")
        .select("net_payout_amount, total_amount, status")
        .eq("status", "PENDING")
        .eq("is_voided", false)
        .gte("payout_date", today)
        .lte("payout_date", forecast30d);

      const likelyIn = pendingPayouts?.reduce((sum, p) => sum + Number(p.net_payout_amount ?? p.total_amount ?? 0), 0) || 0;
      const pendingCount = pendingPayouts?.length || 0;
      const partialCount = partialPayouts?.length || 0;

      // 3. Expected Cash Out — Service settlements (finalized, remaining)
      // Host AP is reused from hostDebtData split (actual/expected) — see below
      const serviceQuery = supabase
        .from("service_settlements")
        .select("id, net_amount")
        .not("finalized_at", "is", null);

      const { data: serviceSettlements } = await serviceQuery;
      let expectedServiceOut = 0;

      if (serviceSettlements && serviceSettlements.length > 0) {
        const serviceIds = serviceSettlements.map(s => s.id);
        const { data: serviceCashflows } = await supabase
          .from("cashflow_entries")
          .select("source_id, amount, direction")
          .eq("source_type", "SERVICE_SETTLEMENT_PAYMENT")
          .in("source_id", serviceIds);

        const servicePaidMap = new Map<string, { in: number; out: number }>();
        serviceCashflows?.forEach(cf => {
          const current = servicePaidMap.get(cf.source_id || "") || { in: 0, out: 0 };
          if (cf.direction === "IN") current.in += Number(cf.amount || 0);
          else current.out += Number(cf.amount || 0);
          servicePaidMap.set(cf.source_id || "", current);
        });

        for (const s of serviceSettlements) {
          const netAmount = Number(s.net_amount || 0);
          const netDirection = netAmount >= 0 ? "PAY" : "RECEIVE";
          const absNet = Math.abs(netAmount);
          const payments = servicePaidMap.get(s.id) || { in: 0, out: 0 };
          const paidAmount = netDirection === "RECEIVE" ? payments.in : payments.out;
          const remaining = Math.max(0, absNet - paidAmount);
          expectedServiceOut += remaining;
        }
      }

      return {
        committedIn,
        likelyIn,
        pendingCount,
        partialCount,
        expectedServiceOut,
      };
    },
  });
  const { data: forecastData, isLoading: forecastLoading, refetch: refetchForecast } = forecastQuery;

  usePrefetchMountLog('Dashboard', [
    { key: ['dashboard-stays', today], query: staysQuery },
    { key: ['dashboard-ota-receivables', today], query: otaReceivablesQuery },
    { key: ['dashboard-30d-forecast', today, forecast30d], query: forecastQuery },
  ]);

  // Expected In = Outstanding OTA AR (reuse existing query, no 30d filter available)
  // Label it as "Outstanding AR" instead of "30d"
  const expectedIn = otaReceivablesData?.total || 0;

  // PMS SaaS Standard: Host AP split from hostDebtData (reuse, no duplicate query)
  // "Incurred AP" = actualRemaining (checked-in + supply started)
  // "Projected AP" = expectedRemaining (future segments)
  const hostIncurredAP = hostDebtData?.actualRemaining || 0;
  const hostProjectedAP = hostDebtData?.expectedRemaining || 0;
  const expectedHostOut = hostIncurredAP + hostProjectedAP;
  const expectedServiceOut = forecastData?.expectedServiceOut || 0;
  const expectedOut = expectedHostOut + expectedServiceOut;

  // Net forecasts
  // Total potential income = committed (partial) + likely (pending) + expected (AR)
  const totalPotentialIn = (forecastData?.committedIn || 0) + (forecastData?.likelyIn || 0) + expectedIn;
  const netExpected = totalPotentialIn - expectedOut;
  // Worst-case: 30% delay of Expected+Likely (not Committed which is already partially received)
  const uncertainIn = (forecastData?.likelyIn || 0) + expectedIn;
  const worstCaseDelay = uncertainIn * 0.3;
  const netWorstCase = (forecastData?.committedIn || 0) + (uncertainIn - worstCaseDelay) - expectedOut;



  // Recent Bookings - get from bookings_mirror filtered by An Gia group (SAME as Booking Center)
  // Skip this query in Executive Mode (not displayed anyway)
  const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

  const { data: recentBookings, isLoading: bookingsLoading, refetch: refetchBookings } = useQuery({
    queryKey: ["dashboard-recent-bookings", isExecutiveMode],
    enabled: !isExecutiveMode,
    staleTime: DASHBOARD_STALE_TIMES.operations,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Step 1: Get An Gia property IDs (SAME as useBookings.ts)
      const { data: propertyLinks } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", AN_GIA_GROUP_ID);
      const groupPropertyIds = new Set(propertyLinks?.map(p => p.channex_property_id) || []);

      // Step 2: Query recent bookings - use SAME columns as useBookings.ts
      // Removed: ota_status_label, mapping_status (may not exist)
      const { data, error } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, ota_booking_code, pms_booking_id, guest_name, ota_source, booking_status, channex_status, check_in_date, check_out_date, total_amount_gross, total_amount_net, payment_type, booking_type, channex_property_id")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Step 3: Filter by An Gia properties in JavaScript (avoids 400 error)
      const filteredData = groupPropertyIds.size > 0
        ? (data || []).filter(b => groupPropertyIds.has(b.channex_property_id))
        : (data || []);

      // Take only first 10 after filtering
      const limitedData = filteredData.slice(0, 10);

      if (!limitedData.length) return [];

      // Get overrides for these bookings
      const bookingIds = limitedData.map(b => b.unified_booking_id);
      const { data: overrides } = await supabase
        .from("booking_amount_overrides")
        .select("unified_booking_id, amount")
        .in("unified_booking_id", bookingIds);

      const overrideMap = new Map<string, number>();
      overrides?.forEach(o => overrideMap.set(o.unified_booking_id, o.amount));

      // Process data to get clean display values + computed amount (SAME as Booking Center)
      return limitedData.map(booking => {
        // Detect actual source from ota_booking_code prefix if source is OTHER
        let displaySource = booking.ota_source || "Direct";
        if (displaySource === "OTHER" && booking.ota_booking_code) {
          const code = booking.ota_booking_code.toUpperCase();
          if (code.startsWith("BDC-") || code.startsWith("BOOKING")) {
            displaySource = "BOOKING.COM";
          } else if (code.startsWith("AGO-") || code.startsWith("AGODA")) {
            displaySource = "AGODA";
          } else if (code.startsWith("EXP-") || code.startsWith("EXPEDIA")) {
            displaySource = "EXPEDIA";
          } else if (code.startsWith("TVL-") || code.startsWith("TRAVELOKA")) {
            displaySource = "TRAVELOKA";
          } else if (code.startsWith("CTP-") || code.startsWith("CTRIP")) {
            displaySource = "CTRIP";
          }
        }

        // Use ota_booking_code as display ID, fallback to cleaned unified_booking_id
        const rawDisplayId = booking.ota_booking_code ||
          (booking.unified_booking_id?.startsWith("channex_")
            ? booking.unified_booking_id.replace("channex_", "").substring(0, 8).toUpperCase()
            : booking.unified_booking_id);
        const displayId = rawDisplayId?.replace(/^[A-Za-z]+-/, "") || rawDisplayId;

        // Apply computeBookingAmount logic (SAME as Booking Center)
        let computedAmount = 0;
        const bookingType = booking.booking_type || "SYNCED";

        // Step 1: Check cancellation
        const bookingStatusUpper = (booking.booking_status || "").toUpperCase();
        const channexStatusLower = (booking.channex_status || "").toLowerCase();

        const isCancelled =
          bookingStatusUpper === "CANCELLED" ||
          bookingStatusUpper === "CANCELED" ||
          bookingStatusUpper === "CANCELLED_BY_GUEST" ||
          bookingStatusUpper === "NO_SHOW" ||
          channexStatusLower === "cancelled" ||
          channexStatusLower === "canceled";

        if (!isCancelled) {
          // Step 2: Check override
          if (overrideMap.has(booking.unified_booking_id)) {
            computedAmount = overrideMap.get(booking.unified_booking_id)!;
          }
          // Step 3: IMPORTED → 0
          else if (bookingType === "IMPORTED") {
            computedAmount = 0;
          }
          // Step 4: OTA_COLLECT with valid remittance
          else if (booking.payment_type === "OTA_COLLECT" &&
            booking.total_amount_net !== null &&
            Number(booking.total_amount_net) > 0) {
            computedAmount = Number(booking.total_amount_net);
          }
          // Step 5: HOTEL_COLLECT
          else if (booking.payment_type === "HOTEL_COLLECT") {
            computedAmount = Number(booking.total_amount_net || 0) || Number(booking.total_amount_gross || 0);
          }
          // Step 6: Default
          else {
            computedAmount = Number(booking.total_amount_net || 0);
          }
        }

        return {
          ...booking,
          displayId,
          displaySource,
          booking_type: bookingType,
          computed_amount: computedAmount,
        };
      }) || [];
    },
  });

  // ── Overdue check-outs (for alerts) ──
  const overdueCheckOuts = useMemo(() => {
    return opsKpis.inHouseList.filter(s => {
      return s.booking?.check_out_date && s.booking.check_out_date < today;
    });
  }, [opsKpis.inHouseList, today]);

  // Generate alerts
  const alerts: { type: "danger" | "warning" | "info"; message: string; action?: string }[] = [];

  if (overdueCheckOuts.length > 0) {
    alerts.push({
      type: "danger",
      message: `⚠️ ${overdueCheckOuts.length} booking quá hạn check-out (vẫn IN-HOUSE)`,
      action: "/stays"
    });
  }

  if ((pendingRooms || 0) > 0) {
    alerts.push({ type: "warning", message: `${pendingRooms} booking chưa phân bổ phòng/host`, action: "/stays" });
  }

  if ((openDisputes?.count || 0) > 0) {
    alerts.push({ type: "danger", message: `${openDisputes?.count} tranh chấp OTA cần xử lý`, action: "/disputes" });
  }

  if ((otaPayoutData?.overdueCount || 0) > 0) {
    alerts.push({ type: "warning", message: `${otaPayoutData?.overdueCount} OTA payout đã tạo nhưng chưa có Thu tiền`, action: "/ota-payouts" });
  }

  if ((hostDebtData?.unpaidCount || 0) > 0) {
    alerts.push({ type: "info", message: `${hostDebtData?.unpaidCount} phiếu quyết toán Host chưa thanh toán`, action: "/host-payables/settlement" });
  }

  if (netCashflow < 0) {
    alerts.push({ type: "warning", message: `Cashflow âm trong kỳ: ${formatCurrency(netCashflow)}`, action: "/reports/cashflow" });
  }

  // NEW: Alert for OTA receivables
  if ((otaReceivablesData?.count || 0) > 0) {
    alerts.push({
      type: "warning",
      message: `${otaReceivablesData?.count} booking OTA đủ điều kiện payout nhưng chưa tạo payout (${formatCurrency(otaReceivablesData?.total || 0)})`,
      action: "/ota-payouts"
    });
  }

  const handleRefresh = () => {
    setLastUpdated(new Date());
    refetchStays();
    refetchBookings();
    refetchOtaReceivables();
    refetchOtaPayout();
    refetchHostDebt();
    refetchServiceDebt();
    // P&L + Cash (shared SOT calculator)
    plRefetch();
    // Forecast
    refetchForecast();
  };

  const isLoading = staysLoading || bookingsLoading;

  const periodLabels: Record<PeriodFilter, string> = {
    today: "Hôm nay",
    "7days": "7 ngày qua",
    "30days": "30 ngày qua",
    month: "Tháng này",
  };

  // Format date range for display
  const dateRangeDisplay = useMemo(() => {
    const fromStr = format(dateRange.from, "dd/MM/yyyy");
    const toStr = format(dateRange.to, "dd/MM/yyyy");
    return fromStr === toStr ? fromStr : `${fromStr} → ${toStr}`;
  }, [dateRange]);

  return (
    <>
      <Header
        title="Dashboard"
        subtitle={`${periodLabels[period]} · ${dateRangeDisplay}`}
        icon={BarChart3}
        actions={
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={(v: string) => setPeriod(v as PeriodFilter)}>
              <SelectTrigger className="w-[130px] h-8 !bg-white/15 !border-white/30 !text-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hôm nay</SelectItem>
                <SelectItem value="7days">7 ngày qua</SelectItem>
                <SelectItem value="30days">30 ngày qua</SelectItem>
                <SelectItem value="month">Tháng này</SelectItem>
              </SelectContent>
            </Select>
            <LastUpdatedTimestamp date={lastUpdated} prefix="" />
            <ConnectionStatus showLabel={false} />
          </div>
        }
      />

      <PageContainer>
        {/* Global Context Bar */}
        <GlobalContextBar
          operationsCount={bookingsCountData?.total || 0}
          netCashflow={netCashflow}
          otaReceivables={otaReceivablesData?.total || 0}
          forecast30Days={netExpected}
          lastUpdated={lastUpdated}
          isExecutiveMode={isExecutiveMode}
        />

        {/* LAYER 1: ALERTS & ACTIONS */}
        {alerts.length > 0 && (
          <SectionCard
            title={
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span>Cần xử lý</span>
                <DataStabilityBadge type="realtime" size="sm" />
              </div>
            }
            className="border-warning/30 bg-warning/5"
          >
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
              {alerts.map((alert, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-full bg-background px-3 py-2 md:py-1.5 text-xs cursor-pointer hover:bg-muted active:bg-muted/70 transition-colors border border-border whitespace-nowrap flex-shrink-0 min-h-[36px] md:min-h-0"
                  onClick={() => alert.action && appNavigate(alert.action)}
                >
                  <span
                    className={`h-2 w-2 md:h-1.5 md:w-1.5 rounded-full flex-shrink-0 ${alert.type === "danger"
                      ? "bg-destructive"
                      : alert.type === "warning"
                        ? "bg-warning"
                        : "bg-primary"
                      }`}
                  />
                  <span className="text-micro md:text-xs">{alert.message}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* LAYER 2: VẬN HÀNH (REALTIME) */}
        <SectionCard
          title={
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span>Vận hành</span>
              <DataStabilityBadge type="realtime" size="sm" />
            </div>
          }
        >
          {/* Show skeleton while loading operations data */}
          {staysLoading ? (
            <SectionSkeleton cards={6} />
          ) : (
            /* KPI Cards — Stays-style: unified grid, icon right, stagger animation */
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-0 rounded-xl border border-border bg-card overflow-hidden">
              {[
                { label: "NHẬN PHÒNG", value: todayCheckIns, sub: "Hôm nay", icon: ArrowDownToLine, color: "text-primary", bgColor: "bg-primary/8", href: "/stays", tooltip: "Booking lịch nhận phòng hôm nay. Bao gồm cả chưa phân bổ và đã sẵn sàng." },
                { label: "ĐANG Ở", value: inHouse, sub: "In-house", icon: Users, color: "text-success", bgColor: "bg-success/8", href: "/stays", tooltip: "Số khách đang ở. Đã check-in thực tế nhưng chưa trả phòng." },
                { label: "TRẢ PHÒNG", value: todayCheckOuts, sub: "Hôm nay", icon: ArrowUpFromLine, color: "text-warning", bgColor: "bg-warning/8", href: "/stays", tooltip: "Booking lịch trả phòng hôm nay. Bao gồm đang ở chờ trả và đã trả xong." },
                { label: "ĐẶT MỚI", value: bookingsCountData?.total || 0, sub: "Hôm nay", icon: Plus, color: "text-info", bgColor: "bg-info/8", href: "/bookings", tooltip: "Số booking mới trong ngày. Tính theo booking_date từ tất cả nguồn." },
                { label: "CHƯA PHÂN BỔ", value: pendingRooms || 0, sub: "7 ngày tới", icon: Home, color: "text-destructive", bgColor: "bg-destructive/8", href: "/stays", tooltip: "Booking chưa assign đủ host/phòng, check-in trong 7 ngày tới." },
                { label: "TRANH CHẤP", value: openDisputes?.count || 0, sub: "Đang mở", icon: AlertTriangle, color: "text-warning", bgColor: "bg-warning/8", href: "/disputes", tooltip: "Số dispute đang mở hoặc đang review." },
              ].map((kpi, idx, arr) => {
                const Icon = kpi.icon;
                return (
                  <TooltipProvider key={kpi.label}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          onClick={() => !isExecutiveMode && appNavigate(kpi.href)}
                          className={`stagger-item relative flex items-center justify-between px-2 sm:px-4 transition-all duration-200 box-border h-[68px] sm:h-[88px]
                            ${isExecutiveMode ? "" : "cursor-pointer hover:bg-muted/40 hover:shadow-inner"}
                            ${idx < arr.length - 1 ? "lg:border-r lg:border-border" : ""}
                            ${idx % 3 !== 2 ? "max-lg:border-r max-lg:border-border" : ""}
                            ${idx < 3 ? "max-lg:border-b max-lg:border-border" : ""}
                          `}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className={`text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${kpi.color}`}>
                              {kpi.label}
                            </span>
                            <span className={`text-lg sm:text-2xl font-bold tabular-nums leading-tight ${kpi.color}`}>
                              {kpi.value}
                            </span>
                            <span className={`text-[9px] sm:text-[11px] mt-0.5 hidden sm:block ${kpi.color} opacity-70`}>
                              {kpi.sub}
                            </span>
                          </div>
                          <div className={`p-1.5 sm:p-2 rounded-xl ${kpi.bgColor} shrink-0 ml-1 sm:ml-3`}>
                            <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${kpi.color}`} />
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-72">
                        <p className="text-xs">{kpi.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* LAYER 3: DÒNG TIỀN (LOCKED) */}
        <SectionCard
          title={
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <span>Dòng tiền</span>
              <DataStabilityBadge type="locked" size="sm" />
            </div>
          }
        >

          {/* Show skeleton while loading cash data */}
          {plLoading ? (
            <CashSectionSkeleton />
          ) : (
            /* Cash Snapshot - Mobile 3 column compact */
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => !isExecutiveMode && appNavigate("/collections")}
                      className={`rounded-lg border border-success/30 bg-success/5 p-2.5 md:p-4 ${isExecutiveMode ? "" : "cursor-pointer hover:border-success/50 active:bg-success/10"
                        } transition-all`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                        <div className="min-w-0">
                          <p className="text-micro md:text-xs text-muted-foreground font-medium mb-0.5 md:mb-1 truncate">Thu tiền</p>
                          <p className="\-semibold tracking-tight tabular-nums text-success truncate">{formatCurrency(cashInData || 0)}</p>
                        </div>
                        <div className="hidden md:block p-2 rounded-lg bg-success/10">
                          <TrendingUp className="h-5 w-5 text-success" />
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    <p className="text-xs">Tiền thực thu từ khách trong kỳ {dateRangeDisplay}. Bao gồm: tiền phòng, phụ phí, dịch vụ. Chỉ tính khoản đã thu thành công (không tính voided).</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => !isExecutiveMode && appNavigate("/payments/cashout")}
                      className={`rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 md:p-4 ${isExecutiveMode ? "" : "cursor-pointer hover:border-destructive/50 active:bg-destructive/10"
                        } transition-all`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                        <div className="min-w-0">
                          <p className="text-micro md:text-xs text-muted-foreground font-medium mb-0.5 md:mb-1 truncate">Chi tiền</p>
                          <p className="\-semibold tracking-tight tabular-nums text-destructive truncate">{formatCurrency(cashOutData || 0)}</p>
                        </div>
                        <div className="hidden md:block p-2 rounded-lg bg-destructive/10">
                          <TrendingDown className="h-5 w-5 text-destructive" />
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    <p className="text-xs">Tiền thực chi trong kỳ {dateRangeDisplay}. Bao gồm: trả nợ host, nợ NCC dịch vụ, hoàn tiền khách. Chỉ tính khoản đã chi thực tế.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => !isExecutiveMode && appNavigate("/reports/cashflow")}
                      className={`rounded-lg border p-2.5 md:p-4 ${isExecutiveMode ? "" : "cursor-pointer active:opacity-80"
                        } transition-all ${netCashflow >= 0
                          ? "border-success/30 bg-success/5 hover:border-success/50"
                          : "border-destructive/30 bg-destructive/5 hover:border-destructive/50"
                        }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1">
                        <div className="min-w-0">
                          <p className="text-micro md:text-xs text-muted-foreground font-medium mb-0.5 md:mb-1 truncate">Dòng tiền ròng</p>
                          <p className={`font-semibold tracking-tight tabular-nums truncate ${netCashflow >= 0 ? "text-success" : "text-destructive"}`}>
                            {formatCurrency(netCashflow)}
                          </p>
                        </div>
                        <div className={`hidden md:block p-2 rounded-lg ${netCashflow >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                          <DollarSign className={`h-5 w-5 ${netCashflow >= 0 ? "text-success" : "text-destructive"}`} />
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    <p className="text-xs font-medium mb-1">Dòng tiền ròng = Thu tiền khách − Chi tiền ra</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(cashInData || 0)} − {formatCurrency(cashOutData || 0)} = {formatCurrency(netCashflow)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{netCashflow >= 0 ? "Dương = tiền vào nhiều hơn tiền ra." : "Âm = chi nhiều hơn thu, cần theo dõi."}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Profit vs Cash Gap Card */}
          {plLoading ? (
            <ProfitGapSkeleton />
          ) : (
            <TooltipProvider>
              <div className="rounded-lg border border-border bg-card p-3 md:p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary" />
                    <h3 className="text-sm md:text-base font-medium">Lợi nhuận vs Dòng tiền</h3>
                    <DataStabilityBadge type="locked" size="sm" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-96">
                        <p className="text-xs">
                          <strong>Lợi nhuận (P&L)</strong> = Doanh thu phòng − Giá vốn host − Chi phí vận hành (tính theo phát sinh, chưa chắc đã thu đủ tiền)<br />
                          <strong>Dòng tiền (Cash)</strong> = Tiền thực thu từ khách − Tiền thực chi cho host/NCC (tiền mặt thực tế vào ra)<br />
                          <strong>Chênh lệch</strong> = Khoản chênh giữa lợi nhuận trên sổ sách và tiền thực tế. Dương = lợi nhuận &gt; tiền mặt (chưa thu đủ). Hơn &gt; dòng tiền tốt hơn sổ sách.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {!isExecutiveMode && (
                    <Button variant="ghost" size="sm" asChild className="h-7 text-xs px-2">
                      <AppLink to="/reports/pnl">P&L</AppLink>
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {/* Net Profit */}
                  <div className="rounded-md bg-muted/50 p-2.5 md:p-3">
                    <p className="text-micro md:text-xs text-muted-foreground">Lợi nhuận</p>
                    <p className={`font-semibold tracking-tight tabular-nums truncate ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(netProfit)}
                    </p>
                    <p className="text-micro text-muted-foreground">P&L (accrual)</p>
                  </div>

                  {/* Net Cashflow */}
                  <div className="rounded-md bg-muted/50 p-2.5 md:p-3">
                    <p className="text-micro md:text-xs text-muted-foreground">Dòng tiền</p>
                    <p className={`font-semibold tracking-tight tabular-nums truncate ${netCashflow >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(netCashflow)}
                    </p>
                    <p className="text-micro text-muted-foreground">Cash (thực)</p>
                  </div>

                  {/* Gap */}
                  <div className={`rounded-md p-2.5 md:p-3 ${profitCashGap > 0
                    ? "bg-warning/10 border border-warning/30"
                    : profitCashGap < 0
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-muted/50"
                    }`}>
                    <p className="text-micro md:text-xs text-muted-foreground">Chênh lệch</p>
                    <p className={`font-semibold tracking-tight tabular-nums truncate ${profitCashGap > 0
                      ? "text-warning"
                      : profitCashGap < 0
                        ? "text-info"
                        : ""
                      }`}>
                      {profitCashGap >= 0 ? "+" : ""}{formatCurrency(profitCashGap)}
                    </p>
                    <p className="text-micro text-muted-foreground truncate">
                      {profitCashGap > 0 ? "Chưa thu hết" : profitCashGap < 0 ? "Thu hơn LN" : "Cân bằng"}
                    </p>
                  </div>
                </div>
              </div>
            </TooltipProvider>
          )}
        </SectionCard>

        {/* LAYER 4: DỰ BÁO (ESTIMATED) */}
        <SectionCard
          title={
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span>Dự báo thu chi</span>
              <DataStabilityBadge type="estimated" size="sm" />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={8} avoidCollisions collisionPadding={8} className="max-w-[28rem] whitespace-normal break-words leading-5">
                    <p className="text-xs font-semibold mb-1.5">Dự báo thu chi — trong 30 ngày tới</p>
                    <div className="text-xs space-y-1.5 text-muted-foreground">
                      <p><strong className="text-success">THU:</strong> Committed = tiền OTA đã nhận 1 phần, chắc chắn về thêm. Likely = payout OTA chờ tiền về. Expected = booking OTA đủ ĐK nhưng chưa tạo payout.</p>
                      <p><strong className="text-destructive">CHI:</strong> Chắc chắn = nợ host đã check-in + NCC dịch vụ đã quyết toán, phải trả. Dự kiến = nợ host từ booking tương lai, có thể thay đổi nếu hủy.</p>
                      <p><strong className="text-foreground">Net</strong> = Thu − Chi. <strong className="text-foreground">Worst</strong> = giả định mất 30% khoản Likely + Expected.</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          }
        >
          {/* ========== 30-DAY FORECAST CARD ========== */}
          {forecastLoading ? (
            <ForecastCardSkeleton />
          ) : (
            <TooltipProvider>
              <div className="space-y-3">

                {/* Row 1: THU (Income) — 3 cards */}
                <p className="text-micro text-muted-foreground font-medium uppercase tracking-wide">Thu dự kiến</p>
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {/* Committed In (PARTIAL status) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="rounded-md bg-success/10 p-2.5 md:p-3 cursor-help">
                        <p className="text-micro md:text-xs text-muted-foreground">Committed</p>
                        <p className="font-semibold tracking-tight tabular-nums text-success truncate">
                          {formatCurrency(forecastData?.committedIn || 0)}
                        </p>
                        <p className="text-micro text-muted-foreground">
                          {forecastData?.partialCount || 0} PARTIAL
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64">
                      <p className="text-xs">Payout OTA đã nhận một phần (PARTIAL) trong 30 ngày tới. Chắc chắn sẽ về thêm.</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Likely In (PENDING status) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="rounded-md bg-primary/10 p-2.5 md:p-3 cursor-help">
                        <p className="text-micro md:text-xs text-muted-foreground">Likely</p>
                        <p className="font-semibold tracking-tight tabular-nums truncate">
                          {formatCurrency(forecastData?.likelyIn || 0)}
                        </p>
                        <p className="text-micro text-muted-foreground">
                          {forecastData?.pendingCount || 0} PENDING
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64">
                      <p className="text-xs">Payout OTA đã tạo nhưng chưa thu tiền (PENDING). Có khả năng cao sẽ thu được trong 30 ngày.</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Expected In (AR) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="rounded-md bg-muted/50 p-2.5 md:p-3 cursor-help">
                        <p className="text-micro md:text-xs text-muted-foreground">Expected</p>
                        <p className="font-semibold tracking-tight tabular-nums text-primary truncate">
                          {formatCurrency(expectedIn)}
                        </p>
                        <p className="text-micro text-muted-foreground">OTA AR chờ</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64">
                      <p className="text-xs">Booking OTA đủ điều kiện payout nhưng chưa tạo. Cần theo dõi để tạo payout kịp thời.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Row 2: CHI (Expenses) — 2 cards split */}
                <p className="text-micro text-muted-foreground font-medium uppercase tracking-wide">Chi dự kiến</p>
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  {/* Chi chắc chắn = Host Incurred AP + Service finalized */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 md:p-3 cursor-help">
                        <p className="text-micro md:text-xs text-destructive font-medium">Chi chắc chắn</p>
                        <p className="font-semibold tracking-tight tabular-nums truncate">
                          {formatCurrency(hostIncurredAP + expectedServiceOut)}
                        </p>
                        <p className="text-micro text-muted-foreground truncate">
                          Host {formatCurrency(hostIncurredAP)} + SVC {formatCurrency(expectedServiceOut)}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-72">
                      <p className="text-xs font-semibold mb-1">Chi chắc chắn phải trả</p>
                      <p className="text-xs text-muted-foreground">Host: Nợ từ booking đã check-in + ngày supply đã bắt đầu. SVC: Nợ dịch vụ đã quyết toán. Không thể tránh.</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Chi dự kiến = Host Projected AP (future bookings) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="rounded-md bg-warning/10 border border-warning/20 p-2.5 md:p-3 cursor-help">
                        <p className="text-micro md:text-xs text-warning font-medium">Chi dự kiến</p>
                        <p className="font-semibold tracking-tight tabular-nums truncate">
                          {formatCurrency(hostProjectedAP)}
                        </p>
                        <p className="text-micro text-muted-foreground truncate">
                          {hostDebtData?.expectedCount || 0} seg tương lai
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-72">
                      <p className="text-xs font-semibold mb-1">Chi dự kiến — có thể thay đổi</p>
                      <p className="text-xs text-muted-foreground">Nợ host từ segment tạo rồi nhưng booking chưa check-in hoặc ngày supply chưa tới. Sẽ thay đổi nếu booking bị hủy.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Row 3: Summary — Tổng + Net + Worst */}
                <div className="grid grid-cols-3 gap-2 md:gap-3 border-t border-border pt-3">
                  {/* Tổng chi */}
                  <div className="rounded-md bg-destructive/5 p-2.5 md:p-3">
                    <p className="text-micro md:text-xs text-muted-foreground">Tổng chi (AP)</p>
                    <p className="font-semibold tracking-tight tabular-nums text-destructive truncate">
                      {formatCurrency(expectedOut)}
                    </p>
                    <p className="text-micro text-muted-foreground">Host + SVC</p>
                  </div>

                  {/* Net Expected */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`rounded-md p-2.5 md:p-3 cursor-help ${netExpected >= 0
                        ? "bg-success/10 border border-success/30"
                        : "bg-destructive/10 border border-destructive/30"
                        }`}>
                        <p className="text-micro md:text-xs text-muted-foreground">Net Expected</p>
                        <p className={`font-semibold tracking-tight tabular-nums truncate ${netExpected >= 0 ? "text-success" : "text-destructive"
                          }`}>
                          {formatCurrency(netExpected)}
                        </p>
                        <p className="text-micro text-muted-foreground">Thu − Chi</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-64">
                      <p className="text-xs">{netExpected >= 0 ? "Dư tiền — dòng tiền tích cực." : "Thiếu tiền — cần theo dõi nguồn thu và kiểm soát chi."}</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Worst Case */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`rounded-md p-2.5 md:p-3 cursor-help ${netWorstCase >= 0
                        ? "bg-muted/50"
                        : "bg-destructive/5 border border-destructive/20"
                        }`}>
                        <p className="text-micro md:text-xs text-muted-foreground">Worst Case</p>
                        <p className={`font-semibold tracking-tight tabular-nums truncate ${netWorstCase >= 0 ? "text-muted-foreground" : "text-destructive"
                          }`}>
                          {formatCurrency(netWorstCase)}
                        </p>
                        <p className="text-micro text-muted-foreground">−30% rủi ro</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-72">
                      <p className="text-xs">Kịch bản xấu: 30% khoản Likely + Expected bị chậm hoặc không thu được. Dùng để chuẩn bị dòng tiền an toàn.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

              </div>
            </TooltipProvider>
          )}
        </SectionCard>



        {/* Booking Sources Chart */}
        <SectionCard>
          <BookingSourcesChart />
        </SectionCard>

        {/* Debt Overview - Mobile optimized */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* OTA Receivables with Aging */}
          <SectionCard>
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <h3 className="text-sm md:text-base font-medium">Công nợ OTA</h3>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-96">
                      <p className="text-xs font-semibold mb-1">Công nợ OTA — tiền OTA đang giữ</p>
                      <p className="text-xs text-muted-foreground mb-1">
                        • <strong>Chờ payout:</strong> Booking OTA đã checkout nhưng chưa tạo payout để thu — OTA chưa xử lý
                      </p>
                      <p className="text-xs text-muted-foreground">
                        • <strong>Đang chuyển:</strong> Đã tạo payout, OTA đang chuyển tiền, chờ nhận
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {!isExecutiveMode && (
                <Button variant="ghost" size="sm" asChild className="h-7 text-xs px-2">
                  <AppLink to="/ota-payouts?tab=dashboard">Chi tiết</AppLink>
                </Button>
              )}
            </div>

            {/* Summary Row - 2 trạng thái rõ ràng */}
            <div className="grid grid-cols-2 gap-2 md:gap-3 mb-3">
              {/* A. Chờ tạo payout */}
              <div className="rounded-md bg-warning/10 border border-warning/20 p-2.5 md:p-3">
                <p className="text-micro md:text-xs text-warning font-medium">Chờ tạo payout</p>
                <p className="\-semibold tracking-tight tabular-nums truncate">{formatCurrency(otaReceivablesData?.total || 0)}</p>
                <p className="text-micro md:text-xs text-muted-foreground">{otaReceivablesData?.count || 0} booking đủ ĐK</p>
              </div>
              {/* B. Đang chuyển về */}
              <div className="rounded-md bg-primary/10 border border-primary/20 p-2.5 md:p-3">
                <p className="text-micro md:text-xs text-info font-medium">Đang chuyển về</p>
                <p className="\-semibold tracking-tight tabular-nums truncate">{formatCurrency(otaPayoutData?.pending || 0)}</p>
                <p className="text-micro md:text-xs text-muted-foreground">
                  {otaPayoutData?.pendingCount || 0} payout{otaPayoutData?.overdueCount ? ` (${otaPayoutData.overdueCount} quá hạn)` : ""}
                </p>
              </div>
            </div>

            {/* Aging Buckets - chỉ cho "Chờ tạo payout" */}
            <div className="border-t border-border pt-3">
              <p className="text-micro md:text-xs text-muted-foreground mb-2">Tuổi nợ chờ payout (từ checkout)</p>
              <div className="grid grid-cols-4 gap-1.5 md:gap-2">
                <div className="rounded-md bg-success/10 p-2 text-center">
                  <p className="text-micro text-muted-foreground">0-7</p>
                  <p className="text-micro md:text-sm font-semibold text-success truncate">
                    {formatCurrency(otaReceivablesData?.aging?.bucket0_7?.amount || 0)}
                  </p>
                  <p className="text-micro text-muted-foreground">{otaReceivablesData?.aging?.bucket0_7?.count || 0}</p>
                </div>
                <div className="rounded-md bg-warning/10 p-2 text-center">
                  <p className="text-micro text-muted-foreground">8-14</p>
                  <p className="text-micro md:text-sm font-semibold text-warning truncate">
                    {formatCurrency(otaReceivablesData?.aging?.bucket8_14?.amount || 0)}
                  </p>
                  <p className="text-micro text-muted-foreground">{otaReceivablesData?.aging?.bucket8_14?.count || 0}</p>
                </div>
                <div className="rounded-md bg-warning/10 p-2 text-center">
                  <p className="text-micro text-muted-foreground">15-30</p>
                  <p className="text-micro md:text-sm font-semibold text-warning truncate">
                    {formatCurrency(otaReceivablesData?.aging?.bucket15_30?.amount || 0)}
                  </p>
                  <p className="text-micro text-muted-foreground">{otaReceivablesData?.aging?.bucket15_30?.count || 0}</p>
                </div>
                <div className="rounded-md bg-destructive/10 p-2 text-center">
                  <p className="text-micro text-muted-foreground">&gt;30</p>
                  <p className="text-micro md:text-sm font-semibold text-destructive dark:text-destructive truncate">
                    {formatCurrency(otaReceivablesData?.aging?.bucket30Plus?.amount || 0)}
                  </p>
                  <p className="text-micro text-muted-foreground">{otaReceivablesData?.aging?.bucket30Plus?.count || 0}</p>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Host Debt — Split: Actual / Expected / Legacy */}
          <SectionCard>
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <h3 className="text-sm md:text-base font-medium">Công nợ Host</h3>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-96">
                      <p className="text-xs font-semibold mb-1">Công nợ Host</p>
                      <p className="text-xs mb-2">= (Tiền phòng + Phụ phí) − Đã thanh toán</p>
                      <ul className="text-xs space-y-1.5 text-muted-foreground">
                        <li>• <strong className="text-foreground">Đã phát sinh</strong>: Booking đã check-in thực tế <strong>VÀ</strong> ngày cung cấp phòng đã bắt đầu (date_from ≤ hôm nay). Check-in sớm không tính trước.</li>
                        <li>• <strong className="text-foreground">Dự kiến</strong>: Segment đã tạo nhưng chưa đủ điều kiện (chưa check-in hoặc ngày supply chưa tới).</li>
                        <li>• <strong className="text-foreground">Tổng (Legacy)</strong>: Tổng tất cả segment + phụ phí − đã trả. Bao gồm cả tương lai.</li>
                        <li>• <strong className="text-foreground">Chưa QT</strong>: Segment chưa quyết toán − host có thể yêu cầu thanh toán bất kỳ lúc nào.</li>
                        <li>• <strong className="text-foreground">Quyết toán</strong>: Chốt số để khóa điều chỉnh và tạo đề xuất chi.</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {!isExecutiveMode && (
                <Button variant="ghost" size="sm" asChild className="h-7 text-xs px-2">
                  <AppLink to="/host-payables">Chi tiết</AppLink>
                </Button>
              )}
            </div>

            {/* 3-column grid: Actual / Expected / Legacy+Paid */}
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {/* Actual (Đã phát sinh) */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-md bg-warning/10 border border-warning/20 p-2.5 md:p-3 cursor-help">
                      <p className="text-micro md:text-xs text-warning font-medium">Đã phát sinh</p>
                      <p className="font-semibold tracking-tight tabular-nums truncate">{formatCurrency(hostDebtData?.actualRemaining || 0)}</p>
                      <p className="text-micro text-muted-foreground">{hostDebtData?.actualUnsettled || 0} chưa QT</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    <p className="text-xs">Nợ host từ booking đã nhận phòng (check-in thực tế) + ngày cung cấp phòng đã bắt đầu. {hostDebtData?.actualCount || 0} segments, phát sinh {formatCurrency(hostDebtData?.actualPayable || 0)}, trừ đã trả.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Expected (Dự kiến) */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-md bg-primary/10 border border-primary/20 p-2.5 md:p-3 cursor-help">
                      <p className="text-micro md:text-xs text-primary font-medium">Dự kiến</p>
                      <p className="font-semibold tracking-tight tabular-nums truncate">{formatCurrency(hostDebtData?.expectedRemaining || 0)}</p>
                      <p className="text-micro text-muted-foreground">{hostDebtData?.expectedCount || 0} seg chờ</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    <p className="text-xs">Nợ host tương lai — booking chưa check-in hoặc ngày supply chưa tới. Con số này sẽ thay đổi nếu booking bị hủy hoặc sửa. Thanh toán KHÔNG được trừ vào đây.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Legacy total + Paid */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-md bg-success/10 border border-success/20 p-2.5 md:p-3 cursor-help">
                      <p className="text-micro md:text-xs text-success font-medium">Đã trả</p>
                      <p className="font-semibold tracking-tight tabular-nums text-success truncate">{formatCurrency(hostDebtData?.totalPaid || 0)}</p>
                      <p className="text-micro text-muted-foreground truncate">/ {formatCurrency(hostDebtData?.totalPayable || 0)}</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    <p className="text-xs">Đã thanh toán {formatCurrency(hostDebtData?.totalPaid || 0)} / tổng phát sinh {formatCurrency(hostDebtData?.totalPayable || 0)} (Legacy all-time). Còn nợ {formatCurrency(hostDebtData?.remaining || 0)}. {hostDebtData?.unsettledCount || 0} segment chưa quyết toán.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </SectionCard>
        </div>

        {/* Recent Bookings Table - Mobile card view (hidden in Executive mode) */}
        {!isExecutiveMode && (
          <SectionCard noPadding>
            <div className="flex items-center justify-between p-3 md:p-4 border-b border-border">
              <h3 className="text-sm md:text-base font-medium">Booking gần đây</h3>
              <Button variant="ghost" size="sm" asChild className="h-7 text-xs px-2">
                <AppLink to="/bookings" className="gap-1">
                  Tất cả
                  <ArrowUpRight className="h-3 w-3" />
                </AppLink>
              </Button>
            </div>

            {bookingsLoading ? (
              <div className="flex items-center justify-center py-8 md:py-12">
                <Loader2 className="h-5 w-5 md:h-6 md:w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-border">
                  {recentBookings?.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Chưa có booking nào
                    </div>
                  ) : (
                    recentBookings?.slice(0, 5).map((booking) => (
                      <div
                        key={booking.unified_booking_id}
                        className="p-3 active:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/bookings/${booking.unified_booking_id}`)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{booking.guest_name}</p>
                            <p className="text-xs text-muted-foreground">{booking.displayId}</p>
                          </div>
                          <span className="text-sm font-semibold text-right">
                            {formatCurrency(booking.computed_amount || 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <OtaBadge source={booking.displaySource} />
                            <span className="text-xs text-muted-foreground">
                              {booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : "-"}
                            </span>
                          </div>
                          <StatusBadge
                            variant={getBookingStatusVariant(booking.booking_status || "PENDING") as any}
                            dot
                            size="sm"
                          >
                            {getStatusLabel(booking.booking_status || "PENDING")}
                          </StatusBadge>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">ID</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Khách</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Nguồn</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Nhận phòng</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Trạng thái</th>
                        <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentBookings?.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                            Chưa có booking nào
                          </td>
                        </tr>
                      ) : (
                        recentBookings?.slice(0, 8).map((booking) => (
                          <tr
                            key={booking.unified_booking_id}
                            className="hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => navigate(`/bookings/${booking.unified_booking_id}`)}
                          >
                            <td className="px-4 py-2.5">
                              <span className="font-medium text-xs">{booking.displayId}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs">{booking.guest_name}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <OtaBadge source={booking.displaySource} />
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="text-xs text-muted-foreground">
                                {booking.check_in_date ? new Date(booking.check_in_date).toLocaleDateString("vi-VN") : "-"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusBadge
                                variant={getBookingStatusVariant(booking.booking_status || "PENDING") as any}
                                dot
                                size="sm"
                              >
                                {getStatusLabel(booking.booking_status || "PENDING")}
                              </StatusBadge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-xs font-medium">
                                {formatCurrency(booking.computed_amount || 0)}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionCard>
        )}

        {/* Disclaimer */}
        <p className="text-micro md:text-xs text-muted-foreground text-center px-4">
          Dashboard phản ánh trạng thái tổng hợp. Công nợ OTA là các khoản đã đủ điều kiện payout nhưng chưa thực hiện payout.
          {isExecutiveMode && " (Executive View - Chi tiết bị ẩn)"}
        </p>
      </PageContainer>
    </>
  );
}
