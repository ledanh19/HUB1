/**
 * usePLCalculator - Single Source of Truth for P&L and Cashflow Calculations
 * 
 * This hook provides unified calculation logic for:
 * - Report P&L page (/reports/pnl)
 * - Dashboard "Lợi nhuận vs Dòng tiền" card
 * 
 * KEY DECISIONS:
 * - Uses check_out_date + stays.stay_status='CHECKED_OUT' as time key for room revenue
 *   (check_out_date ties to booking amount; actual_check_out_at is unreliable because staff may process late)
 * - Includes BOTH bookings_mirror (OTA) AND manual_bookings in revenue/host cost
 * - Uses service_orders.service_date_time for service revenue
 * - Uses hotel_collects.collected_at for cash in
 * - Uses cash_outs.paid_at for cash out
 * 
 * @see docs/AUDIT_SOT_PL_DASHBOARD.md
 */

import { useQuery } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation, safeFrom } from "@/integrations/supabase";
import { format } from "date-fns";
import { computeBookingAmount } from "@/hooks/useBookingAmountOverrides";
import { useMemo } from "react";
import {
  PLContract,
  PLCalculatorInput,
  OpexCategory,
  EMPTY_OPEX_CATEGORIES,
  PL_CONTRACT_META,
  createEmptyPLContract,
} from "@/types/finance";

// ============================================================================
// QUERY HELPERS (avoid 1000-row cap & large IN clauses)
// ============================================================================
const QUERY_PAGE_SIZE = 1000;
const IN_BATCH_SIZE = 200;

async function fetchAllRowsPaginated<T>(
  tableName: string,
  selectQuery: string,
  applyFilters?: (query: any) => any
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += QUERY_PAGE_SIZE) {
    let q = safeFrom(tableName as any).select(selectQuery)
      .range(from, from + QUERY_PAGE_SIZE - 1);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || (data as any[]).length === 0) break;
    all.push(...(data as T[]));
    if (data.length < QUERY_PAGE_SIZE) break;
  }
  return all;
}

async function fetchWithBatchedIn<T>(
  tableName: string,
  selectQuery: string,
  columnName: string,
  ids: string[],
  applyFilters?: (query: any) => any
): Promise<T[]> {
  if (!ids.length) return [];
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += IN_BATCH_SIZE) {
    const batch = ids.slice(i, i + IN_BATCH_SIZE);
    let q = safeFrom(tableName as any).select(selectQuery)
      .in(columnName, batch);
    if (applyFilters) q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    if (data) all.push(...(data as T[]));
  }
  return all;
}

// ============================================================================
// AN GIA PROPERTY IDS (cached)
// ============================================================================
const AN_GIA_GROUP_TITLE = "An Gia Residences";

async function getAnGiaPropertyIds(): Promise<string[]> {
  const { data: groupData } = await supabase
    .from("channex_groups")
    .select("channex_group_id")
    .eq("title", AN_GIA_GROUP_TITLE)
    .maybeSingle();

  if (!groupData?.channex_group_id) return [];

  const { data: propertyGroups } = await supabase
    .from("channex_property_groups")
    .select("channex_property_id")
    .eq("channex_group_id", groupData.channex_group_id);

  return propertyGroups?.map((p) => p.channex_property_id) || [];
}

// ============================================================================
// STALE TIMES
// ============================================================================
const STALE_TIME = 5 * 60 * 1000; // 5 minutes for P&L metrics
const CASH_STALE_TIME = 2 * 60 * 1000; // 2 minutes for cash metrics

/**
 * Config: Whether OTA payout adjustments affect net profit.
 * false (default): OTA adj displayed as separate section, NOT in net_profit
 * true: net_profit = gross_profit - opex + ota_adjustments_net
 * TODO: Move to settings table (reports.include_ota_adjustments_in_net_profit)
 */
export const INCLUDE_OTA_ADJ_IN_NET_PROFIT = false;

// ============================================================================
// MAIN HOOK
// ============================================================================
export function usePLCalculator(input: PLCalculatorInput) {
  const {
    startDate,
    endDate,
    timezone = "+07:00",
    adjDateMode = "SETTLEMENT",
  } = input;

  // Format date range
  const dateRange = useMemo(
    () => ({
      start: format(startDate, "yyyy-MM-dd"),
      end: format(endDate, "yyyy-MM-dd"),
    }),
    [startDate, endDate]
  );

  // ========== 1. ROOM REVENUE (Accrual - by check_out_date + CHECKED_OUT) ==========
  // Includes BOTH bookings_mirror (OTA) AND manual_bookings
  const roomRevenueQuery = useQuery({
    queryKey: ["pl-calculator-room-revenue", dateRange],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const propertyIds = await getAnGiaPropertyIds();

      // --- A. OTA bookings from bookings_mirror (scoped to An Gia properties) ---
      let otaBookings: any[] = [];
      if (propertyIds.length > 0) {
        otaBookings = await fetchAllRowsPaginated<any>(
          "bookings_mirror",
          "unified_booking_id, total_amount_net, booking_type, payment_type, booking_status, channex_status",
          (q: any) =>
            q.not("booking_status", "in", '("CANCELLED","NO_SHOW")')
              .in("channex_property_id", propertyIds)
              .gte("check_out_date", dateRange.start)
              .lte("check_out_date", dateRange.end)
        );
      }

      // --- B. Manual bookings (no channex_property_id, no property scope needed) ---
      const manualBookings = await fetchAllRowsPaginated<any>(
        "manual_bookings",
        "unified_booking_id, total_amount_net, payment_type, booking_status",
        (q: any) =>
          q.not("booking_status", "in", '("CANCELLED","NO_SHOW")')
            .gte("check_out_date", dateRange.start)
            .lte("check_out_date", dateRange.end)
      );

      // --- Merge: normalize manual bookings to same shape ---
      const allBookings = [
        ...otaBookings,
        ...manualBookings.map((mb: any) => ({
          ...mb,
          booking_type: "MANUAL",
          channex_status: null, // manual bookings have no channex_status
        })),
      ];

      if (!allBookings.length) return { amount: 0, count: 0, checkedOutCount: 0, hotelCollectCount: 0 };

      const bookingIds = allBookings.map((b: any) => b.unified_booking_id);

      // Step 2: Get stays with CHECKED_OUT status (no date filter on stays)
      const staysData = await fetchWithBatchedIn<any>(
        "stays",
        "unified_booking_id",
        "unified_booking_id",
        bookingIds,
        (q: any) =>
          q.eq("stay_status", "CHECKED_OUT")
      );

      // ANTI DOUBLE-COUNT: Pick one CHECKED_OUT stay per booking
      const checkedOutBookings = new Set<string>();
      staysData?.forEach((s: any) => {
        checkedOutBookings.add(s.unified_booking_id);
      });

      // Step 3: Get overrides
      const overrides = await fetchWithBatchedIn<any>(
        "booking_amount_overrides",
        "unified_booking_id, amount",
        "unified_booking_id",
        bookingIds
      );

      const overrideMap = new Map<string, number>();
      overrides?.forEach((o: any) =>
        overrideMap.set(o.unified_booking_id, o.amount)
      );

      // Step 4: Calculate revenue using computeBookingAmount (same function as Booking Center)
      let totalAmount = 0;
      let hotelCollectCount = 0;

      allBookings.forEach((b: any) => {
        // Must have CHECKED_OUT stay
        if (!checkedOutBookings.has(b.unified_booking_id)) return;

        if (b.payment_type === "HOTEL_COLLECT") {
          hotelCollectCount++;
        }

        // Use computeBookingAmount — single source of truth for "Giá phải thu"
        const override = overrideMap.has(b.unified_booking_id)
          ? { amount: overrideMap.get(b.unified_booking_id)! }
          : null;
        const computed = computeBookingAmount(b, override as any);
        totalAmount += (computed.amount || 0);
      });

      return {
        amount: totalAmount,
        count: allBookings.length,
        checkedOutCount: checkedOutBookings.size,
        hotelCollectCount,
      };
    },
  });

  // ========== 2. SERVICE REVENUE (Accrual - by service_date_time) ==========
  const serviceRevenueQuery = useQuery({
    queryKey: ["pl-calculator-service-revenue", dateRange],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("service_orders")
        .select("sale_price")
        .gte("service_date_time", `${dateRange.start}T00:00:00`)
        .lte("service_date_time", `${dateRange.end}T23:59:59`)
        .eq("status", "DONE");

      const { data, error } = await query;
      if (error) throw error;

      const amount = data?.reduce((sum, s) => sum + Number(s.sale_price || 0), 0) || 0;
      return { amount, count: data?.length || 0 };
    },
  });

  // ========== 3. HOST COST (COGS - by check_out_date + CHECKED_OUT) ==========
  // Includes BOTH bookings_mirror (OTA) AND manual_bookings
  const hostCostQuery = useQuery({
    queryKey: ["pl-calculator-host-cost", dateRange],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const propertyIds = await getAnGiaPropertyIds();

      // --- A. OTA bookings from bookings_mirror ---
      let otaBookings: any[] = [];
      if (propertyIds.length > 0) {
        otaBookings = await fetchAllRowsPaginated<any>(
          "bookings_mirror",
          "unified_booking_id",
          (q: any) =>
            q.not("booking_status", "in", '("CANCELLED","NO_SHOW")')
              .in("channex_property_id", propertyIds)
              .gte("check_out_date", dateRange.start)
              .lte("check_out_date", dateRange.end)
        );
      }

      // --- B. Manual bookings ---
      const manualBookings = await fetchAllRowsPaginated<any>(
        "manual_bookings",
        "unified_booking_id",
        (q: any) =>
          q.not("booking_status", "in", '("CANCELLED","NO_SHOW")')
            .gte("check_out_date", dateRange.start)
            .lte("check_out_date", dateRange.end)
      );

      const allBookings = [...otaBookings, ...manualBookings];
      if (!allBookings.length) return 0;

      const bookingIds = allBookings.map((b: any) => b.unified_booking_id);

      // Step 2: Get stays with CHECKED_OUT status (no date filter on stays)
      const staysData = await fetchWithBatchedIn<any>(
        "stays",
        "unified_booking_id",
        "unified_booking_id",
        bookingIds,
        (q: any) =>
          q.eq("stay_status", "CHECKED_OUT")
      );

      const checkedOutBookings = new Set<string>();
      staysData?.forEach((s: any) => checkedOutBookings.add(s.unified_booking_id));

      if (checkedOutBookings.size === 0) return 0;

      // Step 3: Get host_supply_segments for CHECKED_OUT bookings only
      const segments = await fetchWithBatchedIn<any>(
        "host_supply_segments",
        "total_amount",
        "unified_booking_id",
        Array.from(checkedOutBookings)
      );

      return segments?.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0) || 0;
    },
  });

  // ========== 4. SERVICE COST (COGS - by service_date_time) ==========
  const serviceCostQuery = useQuery({
    queryKey: ["pl-calculator-service-cost", dateRange],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("service_orders")
        .select("cost_price")
        .gte("service_date_time", `${dateRange.start}T00:00:00`)
        .lte("service_date_time", `${dateRange.end}T23:59:59`)
        .eq("status", "DONE");

      const { data, error } = await query;
      if (error) throw error;
      return data?.reduce((sum, s) => sum + Number(s.cost_price || 0), 0) || 0;
    },
  });

  // ========== 5. OTA COMMISSION (OPEX - from HOTEL_COLLECT bookings) ==========
  const otaCommissionQuery = useQuery({
    queryKey: ["pl-calculator-ota-commission", dateRange],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const propertyIds = await getAnGiaPropertyIds();
      if (propertyIds.length === 0) return 0;

      // Get HOTEL_COLLECT bookings with check_out_date in range
      const bookingsData = await fetchAllRowsPaginated<any>(
        "bookings_mirror",
        "unified_booking_id, commission_amount, booking_type",
        (q: any) =>
          q.eq("payment_type", "HOTEL_COLLECT")
            .not("booking_status", "in", '("CANCELLED","NO_SHOW")')
            .in("channex_property_id", propertyIds)
            .gte("check_out_date", dateRange.start)
            .lte("check_out_date", dateRange.end)
      );

      if (!bookingsData || bookingsData.length === 0) return 0;

      const bookingIds = bookingsData.map((b: any) => b.unified_booking_id);

      // GUARDRAIL: Only count for CHECKED_OUT stays (date filter is on check_out_date above)
      const staysData = await fetchWithBatchedIn<any>(
        "stays",
        "unified_booking_id",
        "unified_booking_id",
        bookingIds,
        (q: any) =>
          q.eq("stay_status", "CHECKED_OUT")
      );

      const checkedOutBookings = new Set(
        staysData?.map((s: any) => s.unified_booking_id) || []
      );

      // GUARDRAIL: Only count for bookings with hotel_collects (actually collected)
      const hotelCollects = await fetchWithBatchedIn<any>(
        "hotel_collects",
        "unified_booking_id",
        "unified_booking_id",
        bookingIds,
        (q: any) => q.neq("status", "VOIDED")
      );

      const paidBookings = new Set(
        hotelCollects?.map((c: any) => c.unified_booking_id) || []
      );

      // Split into regular and IMPORTED bookings
      const eligibleBookings = bookingsData.filter(
        (b: any) =>
          checkedOutBookings.has(b.unified_booking_id) &&
          paidBookings.has(b.unified_booking_id)
      );

      const regularBookings = eligibleBookings.filter(
        (b: any) => b.booking_type !== "IMPORTED"
      );
      const importedBookings = eligibleBookings.filter(
        (b: any) => b.booking_type === "IMPORTED"
      );

      let totalCommission = 0;

      // 1. Regular bookings: sum commission_amount
      totalCommission += regularBookings.reduce(
        (sum: number, b: any) => sum + Number(b.commission_amount || 0),
        0
      );

      // 2. IMPORTED bookings: calculate from booking_amount_overrides
      if (importedBookings.length > 0) {
        const importedIds = importedBookings.map((b: any) => b.unified_booking_id);
        const { data: overrides } = await supabase
          .from("booking_amount_overrides")
          .select("amount, commission_percent")
          .in("unified_booking_id", importedIds);

        totalCommission +=
          overrides?.reduce((sum: number, o: any) => {
            const amount = Number(o.amount || 0);
            const commissionPercent = Number(o.commission_percent || 0);
            return sum + Math.round((amount * commissionPercent) / 100);
          }, 0) || 0;
      }

      return totalCommission;
    },
  });

  // ========== 6. OPEX (from payment_requests) ==========
  const opexQuery = useQuery({
    queryKey: ["pl-calculator-opex", dateRange],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_requests")
        .select("proposed_amount, expense_category, expense_period, created_at")
        .not("expense_category", "is", null)
        .eq("status", "PAID");

      if (error) throw error;
      if (!data || data.length === 0)
        return { total: 0, categories: { ...EMPTY_OPEX_CATEGORIES }, count: 0 };

      // Parse expense_period
      const parseExpensePeriod = (
        expensePeriod: string | null
      ): { month: number; year: number } | null => {
        if (!expensePeriod) return null;
        const patterns = [
          /[Tt]háng\s*(\d{1,2})\/(\d{4})/,
          /(\d{1,2})\/(\d{4})/,
          /(\d{4})-(\d{1,2})/,
        ];
        for (const pattern of patterns) {
          const match = expensePeriod.match(pattern);
          if (match) {
            if (pattern.source.startsWith("(\\d{4})")) {
              return { month: parseInt(match[2]), year: parseInt(match[1]) };
            }
            return { month: parseInt(match[1]), year: parseInt(match[2]) };
          }
        }
        return null;
      };

      const startDateObj = new Date(dateRange.start);
      const endDateObj = new Date(dateRange.end);

      const categories: Record<OpexCategory, number> = { ...EMPTY_OPEX_CATEGORIES };
      let count = 0;

      data.forEach((e) => {
        let shouldInclude = false;

        if (e.expense_period) {
          const parsed = parseExpensePeriod(e.expense_period);
          if (parsed) {
            const expenseDate = new Date(parsed.year, parsed.month - 1, 1);
            shouldInclude =
              expenseDate >=
              new Date(startDateObj.getFullYear(), startDateObj.getMonth(), 1) &&
              expenseDate <=
              new Date(endDateObj.getFullYear(), endDateObj.getMonth(), 1);
          } else {
            const createdAt = new Date(e.created_at);
            shouldInclude = createdAt >= startDateObj && createdAt <= endDateObj;
          }
        } else {
          const createdAt = new Date(e.created_at);
          shouldInclude = createdAt >= startDateObj && createdAt <= endDateObj;
        }

        // Don't include OTA_COMMISSION from payment_requests (auto-calculated)
        if (shouldInclude && e.expense_category !== "OTA_COMMISSION") {
          let cat = e.expense_category as OpexCategory;
          if (cat === ("BHXH_EMPLOYER" as any) || cat === ("BHXH_EMPLOYEE" as any)) {
            cat = "BHXH";
          }
          categories[cat] = (categories[cat] || 0) + Number(e.proposed_amount || 0);
          count++;
        }
      });

      const total = Object.values(categories).reduce((sum, val) => sum + val, 0);
      return { total, categories, count };
    },
  });

  // ========== 6b. OTA BANK FEES (from ledger_entries) ==========
  // Bank fees posted via reconciliation → ledger, must appear in P&L OPEX
  const otaBankFeeQuery = useQuery({
    queryKey: ["pl-calculator-ota-bank-fees", dateRange],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("amount, entry_date")
        .eq("source_type", "OTA_PAYOUT_BANK_FEE")
        .eq("entry_type", "ORIGINAL")
        .eq("is_reversed", false)
        .gte("entry_date", dateRange.start)
        .lte("entry_date", dateRange.end);

      if (error) throw error;
      // amount is stored as negative (expense), we want absolute value for OPEX
      return (data as any[] || []).reduce((sum: number, row: any) => sum + Math.abs(Number(row.amount || 0)), 0);
    },
  });

  // ========== 6c. NO_SHOW Revenue (from ledger_entries) ==========
  // Revenue recognized via snapshot confirmation, not booking status
  const noShowRevenueQuery = useQuery({
    queryKey: ["pl-calculator-noshow-revenue", dateRange],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("amount")
        .eq("source_type", "NO_SHOW_REVENUE")
        .eq("entry_type", "ORIGINAL")
        .eq("is_reversed", false)
        .gte("entry_date", dateRange.start)
        .lte("entry_date", dateRange.end);

      if (error) throw error;
      return (data as any[] || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    },
  });

  // ========== 6d. OTA PAYOUT ADJUSTMENTS (RPC with inline fallback) ==========
  // Try RPC first (supports SETTLEMENT/ACCRUAL); fallback to inline query if RPC not deployed
  const otaAdjustmentQuery = useQuery({
    queryKey: ["pl-calculator-ota-adjustments", dateRange, adjDateMode],
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const emptyResult = { dispute_net: 0, penalties: 0, compensation: 0, rounding_fx_net: 0, underpayment: 0, other_net: 0, total_net: 0 };

      // --- Try RPC first ---
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "rpc_get_ota_adjustments_net" as any,
        { p_start: dateRange.start, p_end: dateRange.end, p_mode: adjDateMode }
      );

      if (!rpcError && rpcData) {
        const parsed = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
        if (parsed) {
          return {
            dispute_net: Number(parsed.dispute_net || 0),
            penalties: Number(parsed.penalties || 0),
            compensation: Number(parsed.compensation || 0),
            rounding_fx_net: Number(parsed.rounding_fx_net || 0),
            underpayment: Number(parsed.underpayment || 0),
            other_net: Number(parsed.other_net || 0),
            total_net: Number(parsed.total_net || 0),
          };
        }
      }

      // --- Fallback: inline query (SETTLEMENT mode only, works without migration) ---
      console.warn("[usePLCalculator] RPC fallback: using inline ledger query", rpcError?.message);

      const { data: ledgerRows, error: ledgerErr } = await supabase
        .from("ledger_entries")
        .select("id, source_id, amount, direction")
        .eq("source_type", "OTA_PAYOUT_ADJUSTMENT")
        .eq("entry_type", "ORIGINAL")
        .eq("is_reversed", false)
        .gte("entry_date", dateRange.start)
        .lte("entry_date", dateRange.end);

      if (ledgerErr || !ledgerRows || ledgerRows.length === 0) return emptyResult;

      // Fetch adj_category from reconciliation items
      const sourceIds = (ledgerRows as any[]).map((r: any) => r.source_id);
      const { data: reconRows } = await supabase
        .from("ota_payout_reconciliation_items")
        .select("id, adj_category")
        .in("id", sourceIds);

      const categoryMap = new Map<string, string>();
      (reconRows as any[] || []).forEach((r: any) => {
        if (r.adj_category) categoryMap.set(r.id, r.adj_category);
      });

      const result = { ...emptyResult };
      for (const row of (ledgerRows as any[])) {
        const amt = Number(row.amount || 0);
        const signed = row.direction === 'DEBIT' ? amt : -amt;
        const cat = categoryMap.get(row.source_id) || 'OTA_ADJUSTMENT_OTHER';

        switch (cat) {
          case 'DISPUTE_WIN': result.dispute_net += amt; break;
          case 'DISPUTE_LOSS': result.dispute_net -= amt; break;
          case 'OTA_PENALTY': result.penalties += amt; break;
          case 'OTA_COMPENSATION': result.compensation += amt; break;
          case 'OTA_ROUNDING_FX': result.rounding_fx_net += signed; break;
          case 'OTA_UNDERPAYMENT': result.underpayment += amt; break;
          default: result.other_net += signed; break;
        }
        result.total_net += signed;
      }
      return result;
    },
  });

  // ========== 7. CASH IN (collected_at) ==========
  const cashInQuery = useQuery({
    queryKey: ["pl-calculator-cash-in", dateRange],
    staleTime: CASH_STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("hotel_collects")
        .select("amount_collected")
        .eq("payee_type", "ROOMRISE")
        .eq("collection_type", "COLLECT")
        .neq("status", "VOIDED")
        .gte("collected_at", `${dateRange.start}T00:00:00`)
        .lte("collected_at", `${dateRange.end}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      return data?.reduce((sum, c) => sum + Number(c.amount_collected), 0) || 0;
    },
  });

  // ========== 8. CASH OUT (paid_at) ==========
  const cashOutQuery = useQuery({
    queryKey: ["pl-calculator-cash-out", dateRange],
    staleTime: CASH_STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("cash_outs")
        .select("amount")
        .eq("is_sample_data", false)
        .gte("paid_at", `${dateRange.start}T00:00:00`)
        .lte("paid_at", `${dateRange.end}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      return data?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
    },
  });

  // ========== COMBINE INTO CONTRACT ==========
  const isLoading =
    roomRevenueQuery.isLoading ||
    serviceRevenueQuery.isLoading ||
    hostCostQuery.isLoading ||
    serviceCostQuery.isLoading ||
    otaCommissionQuery.isLoading ||
    opexQuery.isLoading ||
    otaBankFeeQuery.isLoading ||
    noShowRevenueQuery.isLoading ||
    otaAdjustmentQuery.isLoading ||
    cashInQuery.isLoading ||
    cashOutQuery.isLoading;

  const isError =
    roomRevenueQuery.isError ||
    serviceRevenueQuery.isError ||
    hostCostQuery.isError ||
    serviceCostQuery.isError ||
    otaCommissionQuery.isError ||
    opexQuery.isError ||
    otaBankFeeQuery.isError ||
    noShowRevenueQuery.isError ||
    otaAdjustmentQuery.isError ||
    cashInQuery.isError ||
    cashOutQuery.isError;

  const error =
    roomRevenueQuery.error ||
    serviceRevenueQuery.error ||
    hostCostQuery.error ||
    serviceCostQuery.error ||
    otaCommissionQuery.error ||
    opexQuery.error ||
    otaBankFeeQuery.error ||
    noShowRevenueQuery.error ||
    otaAdjustmentQuery.error ||
    cashInQuery.error ||
    cashOutQuery.error;

  const data = useMemo((): PLContract => {
    // Extract values
    const roomRevenue = roomRevenueQuery.data?.amount || 0;
    const serviceRevenue = serviceRevenueQuery.data?.amount || 0;
    const noShowRevenue = noShowRevenueQuery.data || 0;
    const hostCost = hostCostQuery.data || 0;
    const serviceCost = serviceCostQuery.data || 0;
    const otaCommission = otaCommissionQuery.data || 0;
    const opexFromPayments = opexQuery.data?.total || 0;
    const opexCategories = { ...(opexQuery.data?.categories || { ...EMPTY_OPEX_CATEGORIES }) };
    const otaBankFees = otaBankFeeQuery.data || 0;
    const cashIn = cashInQuery.data || 0;
    const cashOut = cashOutQuery.data || 0;
    const adjData = otaAdjustmentQuery.data || { dispute_net: 0, penalties: 0, compensation: 0, rounding_fx_net: 0, underpayment: 0, other_net: 0, total_net: 0 };

    // Merge OTA bank fees into BANK_FEE category
    opexCategories.BANK_FEE = (opexCategories.BANK_FEE || 0) + otaBankFees;

    // Calculate derived values — NO_SHOW revenue added to total revenue
    const totalRevenue = roomRevenue + serviceRevenue + noShowRevenue;
    const totalCOGS = hostCost + serviceCost;
    const grossProfit = totalRevenue - totalCOGS;
    const totalOpex = opexFromPayments + otaBankFees + otaCommission;
    const baseNetProfit = grossProfit - totalOpex;
    // Config rule: include OTA adj in net profit or not
    const netProfit = INCLUDE_OTA_ADJ_IN_NET_PROFIT
      ? baseNetProfit + adjData.total_net
      : baseNetProfit;
    const netCash = cashIn - cashOut;
    const profitMinusCash = netProfit - netCash;

    // Margin calculations
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : null;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : null;

    // Build contract
    const contract: PLContract = {
      period: {
        from: dateRange.start,
        to: dateRange.end,
        timezone,
      },
      currency: "VND",
      accrual: {
        revenue: totalRevenue,
        revenue_room: roomRevenue,
        revenue_service: serviceRevenue,
        revenue_no_show: noShowRevenue,
        cogs: totalCOGS,
        cogs_host: hostCost,
        cogs_service: serviceCost,
        opex: totalOpex,
        opex_ota_commission: otaCommission,
        opex_categories: {
          ...opexCategories,
          OTA_COMMISSION: otaCommission,
        },
        gross_profit: grossProfit,
        net_profit: netProfit,
        gross_margin: grossMargin,
        net_margin: netMargin,
        ota_adjustments_net: adjData.total_net,
        ota_dispute_net: adjData.dispute_net,
        ota_penalties: adjData.penalties,
        ota_compensation: adjData.compensation,
        ota_rounding_fx_net: adjData.rounding_fx_net,
        ota_underpayment: adjData.underpayment,
        ota_adjustments_other_net: adjData.other_net,
      },
      cash: {
        cash_in: cashIn,
        cash_out: cashOut,
        net_cash: netCash,
      },
      difference: {
        profit_minus_cash: profitMinusCash,
      },
      meta: PL_CONTRACT_META,
      debug: {
        booking_count: roomRevenueQuery.data?.count || 0,
        checked_out_count: roomRevenueQuery.data?.checkedOutCount || 0,
        hotel_collect_count: roomRevenueQuery.data?.hotelCollectCount || 0,
        service_order_count: serviceRevenueQuery.data?.count || 0,
        opex_request_count: opexQuery.data?.count || 0,
      },
    };

    return contract;
  }, [
    roomRevenueQuery.data,
    serviceRevenueQuery.data,
    hostCostQuery.data,
    serviceCostQuery.data,
    otaCommissionQuery.data,
    opexQuery.data,
    otaBankFeeQuery.data,
    noShowRevenueQuery.data,
    otaAdjustmentQuery.data,
    cashInQuery.data,
    cashOutQuery.data,
    dateRange,
    timezone,
  ]);

  // Refetch all queries
  const refetch = () => {
    roomRevenueQuery.refetch();
    serviceRevenueQuery.refetch();
    hostCostQuery.refetch();
    serviceCostQuery.refetch();
    otaCommissionQuery.refetch();
    opexQuery.refetch();
    otaBankFeeQuery.refetch();
    noShowRevenueQuery.refetch();
    otaAdjustmentQuery.refetch();
    cashInQuery.refetch();
    cashOutQuery.refetch();
  };

  return {
    data,
    isLoading,
    isError,
    error,
    refetch,
  };
}

export default usePLCalculator;
