import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, safeQuery, safeMutation } from "@/integrations/supabase";
import { toast } from "sonner";
import { keepPrevious } from "@/lib/query-helpers";
import { createAuditLog } from "@/hooks/useAuditLog";
import { autoLinkCasesOnPayoutAssignment, autoLinkCaseOnPayoutRecord, showAutoLinkToast } from "@/hooks/useAutoLinkCases";

// An Gia Residences group ID - same as useBookings for consistency
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

export interface OtaPayout {
  id: string;
  ota_source: string;
  ota_property_id: string | null;
  payout_date: string;
  payout_period_from: string | null;
  payout_period_to: string | null;
  payout_method: string;
  receiving_bank_account: string | null;
  payment_gateway: string | null;
  gross_amount: number;
  net_payout_amount: number;
  deduction_total: number;
  total_amount: number;
  status: string;
  bank_reference: string | null;
  note: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  created_at: string;
  updated_at: string;
  provider_payout_id: string | null;
  received_at: string | null;
  bank_fee_total: number;
  adjustment_total: number;
  is_reconciled: boolean;
  is_voided: boolean;
  voided_at: string | null;
  voided_reason: string | null;
  voided_by: string | null;
}

export interface OtaPayoutDetail {
  id: string;
  payout_id: string;
  unified_booking_id: string;
  booking_code: string | null;
  guest_name: string | null;
  actual_check_out_at: string | null;
  expected_amount: number;
  actual_amount: number;
  deduction_amount: number;
  final_amount: number;
  variance: number | null;
  note: string | null;
  created_at: string;
}

export interface OtaPayoutDeduction {
  id: string;
  payout_id: string;
  payout_detail_id: string | null;
  unified_booking_id: string | null;
  deduction_type: string;
  amount: number;
  reason_note: string;
  created_by: string | null;
  created_at: string;
}

export interface EligibleBooking {
  unified_booking_id: string;
  guest_name: string;
  source: string;
  ota_booking_code: string | null;
  ota_property_id: string | null;
  check_out_date: string;
  actual_check_out_at: string | null;
  total_amount_net: number;
  booking_status: string;
  stay_status: string | null;
  payment_type: string;
}

// Status mapping for display (DB uses PENDING/RECEIVED/PARTIAL)
export const STATUS_DISPLAY = {
  PENDING: { label: "Chờ về", variant: "warning" },
  RECEIVED: { label: "Đã nhận", variant: "success" },
  PARTIAL: { label: "Về một phần", variant: "info" },
  DISPUTED: { label: "Tranh chấp", variant: "danger" },
} as const;

// Fetch all payouts
export function useOtaPayouts(filters?: { status?: string; otaSource?: string; showVoided?: boolean }) {
  return useQuery({
    queryKey: ["ota_payouts", filters],
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: keepPrevious,
    queryFn: async () => {
      let query = supabase
        .from("ota_payouts")
        .select("*")
        .order("payout_date", { ascending: false }) as any;

      if (!filters?.showVoided) {
        query = query.eq("is_voided" as any, false);
      }
      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status as "PENDING" | "RECEIVED" | "PARTIAL" | "DISPUTED");
      }
      if (filters?.otaSource && filters.otaSource !== "all") {
        const aliases = OTA_SOURCE_ALIASES[filters.otaSource] || [filters.otaSource];
        query = query.in("ota_source", aliases);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(p => ({
        ...p,
        ota_source: normalizeOtaSource(p.ota_source),
      })) as OtaPayout[];
    },
  });
}

// Fetch single payout
export function useOtaPayoutById(payoutId: string) {
  return useQuery({
    queryKey: ["ota_payout", payoutId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ota_payouts")
        .select("*")
        .eq("id", payoutId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        return { ...data, ota_source: normalizeOtaSource(data.ota_source) } as OtaPayout;
      }
      return null;
    },
    enabled: !!payoutId,
  });
}

// Fetch payout details
export function useOtaPayoutDetails(payoutId: string) {
  return useQuery({
    queryKey: ["ota_payout_details", payoutId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ota_payout_details")
        .select("*")
        .eq("payout_id", payoutId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch check_in_date + booking_status + stay_status for each booking
      const bookingIds = (data || []).map(d => d.unified_booking_id);
      const checkInMap = new Map<string, string>();
      const bookingStatusMap = new Map<string, string>();
      const stayStatusMap = new Map<string, string>();

      if (bookingIds.length > 0) {
        const [mirrorResult, bookingResult, stayResult] = await Promise.all([
          supabase
            .from("bookings_mirror")
            .select("unified_booking_id, check_in_date")
            .in("unified_booking_id", bookingIds),
          supabase
            .from("unified_bookings")
            .select("unified_booking_id, booking_status")
            .in("unified_booking_id", bookingIds),
          supabase
            .from("stays")
            .select("unified_booking_id, stay_status")
            .in("unified_booking_id", bookingIds),
        ]);

        (mirrorResult.data || []).forEach(b => {
          if (!checkInMap.has(b.unified_booking_id)) {
            checkInMap.set(b.unified_booking_id, b.check_in_date);
          }
        });

        (bookingResult.data || []).forEach(b => {
          bookingStatusMap.set(b.unified_booking_id, b.booking_status || "");
        });

        (stayResult.data || []).forEach(s => {
          const existing = stayStatusMap.get(s.unified_booking_id);
          // Prefer CHECKED_OUT over other statuses
          if (!existing || s.stay_status === "CHECKED_OUT") {
            stayStatusMap.set(s.unified_booking_id, s.stay_status);
          }
        });
      }

      return (data || []).map(d => ({
        ...d,
        check_in_date: checkInMap.get(d.unified_booking_id) || null,
        booking_status: bookingStatusMap.get(d.unified_booking_id) || (d as any).booking_status || null,
        stay_status: stayStatusMap.get(d.unified_booking_id) || null,
      })) as (OtaPayoutDetail & { check_in_date?: string | null; booking_status?: string | null; stay_status?: string | null })[];
    },
    enabled: !!payoutId,
  });
}

// Fetch payout deductions
export function useOtaPayoutDeductions(payoutId: string) {
  return useQuery({
    queryKey: ["ota_payout_deductions", payoutId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ota_payout_deductions")
        .select("*")
        .eq("payout_id", payoutId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as OtaPayoutDeduction[];
    },
    enabled: !!payoutId,
  });
}

// Fetch OTA payout cash-in for a specific booking (for OTA_COLLECT bookings)
// Cash-in = sum of actual_amount from payout details where payout status != PENDING
export function useOtaPayoutCashInForBooking(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["ota_payout_cash_in", unifiedBookingId],
    queryFn: async () => {
      if (!unifiedBookingId) return { totalCashIn: 0, details: [] };

      // Get all payout details for this booking
      const { data: payoutDetails, error } = await supabase
        .from("ota_payout_details")
        .select(`
          id,
          payout_id,
          expected_amount,
          actual_amount,
          final_amount,
          ota_payouts!inner (
            id,
            status,
            payout_date,
            ota_source
          )
        `)
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;

      // Only count cash-in from payouts that are NOT PENDING (RECEIVED, PARTIAL, etc.)
      const validDetails = (payoutDetails || []).filter(
        (d: any) => d.ota_payouts?.status !== "PENDING"
      );

      // Sum actual_amount as cash-in
      const totalCashIn = validDetails.reduce(
        (sum: number, d: any) => sum + (d.actual_amount || 0),
        0
      );

      return {
        totalCashIn,
        details: validDetails.map((d: any) => ({
          id: d.id,
          payoutId: d.payout_id,
          payoutStatus: d.ota_payouts?.status,
          payoutDate: d.ota_payouts?.payout_date,
          otaSource: d.ota_payouts?.ota_source,
          expectedAmount: d.expected_amount,
          actualAmount: d.actual_amount,
          finalAmount: d.final_amount,
        })),
        payoutCount: validDetails.length,
      };
    },
    enabled: !!unifiedBookingId,
  });
}

// Fetch eligible bookings - chỉ lọc theo check_out_date đã qua + An Gia properties
// Mapping OTA source aliases (database may have different names for same OTA)
const OTA_SOURCE_ALIASES: Record<string, string[]> = {
  "CTRIP": ["CTRIP", "Trip.com", "Ctrip"],
  "Trip.com": ["CTRIP", "Trip.com", "Ctrip"],
  "AGODA": ["AGODA", "Agoda"],
  "Agoda": ["AGODA", "Agoda"],
  "EXPEDIA": ["EXPEDIA", "Expedia"],
  "Expedia": ["EXPEDIA", "Expedia"],
  "BOOKING": ["BOOKING", "Booking.com"],
  "Booking.com": ["BOOKING", "Booking.com"],
  "AIRBNB": ["AIRBNB", "Airbnb"],
  "Airbnb": ["AIRBNB", "Airbnb"],
  "TRAVELOKA": ["TRAVELOKA", "Traveloka"],
  "Traveloka": ["TRAVELOKA", "Traveloka"],
};

// Normalize any ota_source variant to its canonical uppercase key
// e.g., "Trip.com" | "Ctrip" | "CTRIP" → "CTRIP"
export function normalizeOtaSource(source: string): string {
  if (!source) return source;
  const s = source.trim();
  // Check each canonical key's aliases
  for (const [canonical, aliases] of Object.entries(OTA_SOURCE_ALIASES)) {
    if (canonical === canonical.toUpperCase() && aliases.includes(s)) {
      return canonical;
    }
  }
  return s.toUpperCase();
}

export function useEligibleBookingsForPayout(otaSource: string) {
  return useQuery({
    queryKey: ["eligible_bookings_for_payout", otaSource],
    queryFn: async () => {
      // First, get property IDs belonging to An Gia Residences group
      const { data: propertyLinks } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", AN_GIA_GROUP_ID);

      const groupPropertyIds = propertyLinks?.map(p => p.channex_property_id) || [];

      // Get bookings already added to any active (non-voided) payout
      const { data: existingDetails } = await (supabase as any)
        .from("ota_payout_details")
        .select("unified_booking_id")
        .eq("is_active", true);

      const existingBookingIds = (existingDetails || []).map(d => d.unified_booking_id);

      // Get today's date for filtering
      const today = new Date().toISOString().split('T')[0];

      // Get all source aliases for this OTA
      const sourceAliases = OTA_SOURCE_ALIASES[otaSource] || [otaSource];

      // Query unified_bookings - remove strict check_out_date filter
      // We'll filter by actual checkout status from host_supply_segments later
      const { data, error } = await supabase
        .from("unified_bookings")
        .select(
          `
          unified_booking_id,
          guest_name,
          source,
          check_out_date,
          total_amount_net,
          booking_status,
          payment_type,
          pms_property_id
        `
        )
        .eq("payment_type", "OTA_COLLECT")
        .in("source", sourceAliases)
        // REMOVED: .neq("booking_status", "CANCELLED") — Agoda-like: cancelled bookings can appear in payout
        .order("check_out_date", { ascending: false })
        .limit(5000); // Override default 1000 limit - có ~2700+ OTA bookings

      if (error) throw error;

      // Filter eligible bookings:
      // 1. unified_booking_id must exist
      // 2. NOT already in a payout
      // 3. CANCELLED/NO_SHOW → always eligible (skip date check)
      // 4. Non-cancelled → check_out_date <= today
      // 5. Belongs to An Gia properties
      const baseEligible = (data || []).filter((b) => {
        if (!b.unified_booking_id) return false;
        if (existingBookingIds.includes(b.unified_booking_id)) return false;

        const isCancelled = b.booking_status === "CANCELLED";
        const isNoShow = b.booking_status === "NO_SHOW";

        // CANCELLED + NO_SHOW bypass date check (always eligible)
        if (!isCancelled && !isNoShow) {
          if (!b.check_out_date || b.check_out_date > today) return false;
        }

        // Property filter
        if (b.pms_property_id && !groupPropertyIds.includes(b.pms_property_id)) return false;

        return true;
      });

      // Enrich with OTA codes + OTA property ID + channex_property_id from mirror table
      // Batch in chunks of 200 to avoid URL length limit (Supabase 400 error)
      const bookingIds = baseEligible.map((b) => b.unified_booking_id);
      const BATCH_SIZE = 200;
      const allMirrorRows: any[] = [];
      const allStayRows: any[] = [];
      for (let i = 0; i < bookingIds.length; i += BATCH_SIZE) {
        const batch = bookingIds.slice(i, i + BATCH_SIZE);
        const [mirrorResult, stayResult] = await Promise.all([
          supabase
            .from("bookings_mirror")
            .select("unified_booking_id, ota_booking_code, ota_property_id, channex_property_id")
            .in("unified_booking_id", batch),
          supabase
            .from("stays")
            .select("unified_booking_id, stay_status, actual_check_out_at")
            .in("unified_booking_id", batch),
        ]);
        if (mirrorResult.data) allMirrorRows.push(...mirrorResult.data);
        if (stayResult.data) allStayRows.push(...stayResult.data);
      }

      const mirrorMap = new Map(
        allMirrorRows.map((m: any) => [m.unified_booking_id, m])
      );

      // Build stay status map (pick best: CHECKED_OUT > others)
      const stayMap = new Map<string, { stay_status: string; actual_check_out_at: string | null }>();
      for (const s of allStayRows) {
        const existing = stayMap.get(s.unified_booking_id);
        if (!existing || s.stay_status === "CHECKED_OUT") {
          stayMap.set(s.unified_booking_id, {
            stay_status: s.stay_status,
            actual_check_out_at: s.actual_check_out_at,
          });
        }
      }

      // Final filter: use channex_property_id from mirror for more accurate An Gia check
      const finalEligible = baseEligible
        .filter((b: any) => {
          const mirror = mirrorMap.get(b.unified_booking_id);
          // Include if: no mirror (MANUAL) OR channex_property_id is in An Gia group
          return !mirror?.channex_property_id || groupPropertyIds.includes(mirror.channex_property_id);
        });

      // Fetch booking_amount_overrides for IMPORTED bookings (confirmed amount)
      const finalIds = finalEligible.map((b: any) => b.unified_booking_id);
      const allOverrides: any[] = [];
      for (let i = 0; i < finalIds.length; i += BATCH_SIZE) {
        const batch = finalIds.slice(i, i + BATCH_SIZE);
        const { data: overrides } = await supabase
          .from("booking_amount_overrides")
          .select("unified_booking_id, amount")
          .in("unified_booking_id", batch);
        if (overrides) allOverrides.push(...overrides);
      }
      const overrideMap = new Map(allOverrides.map((o: any) => [o.unified_booking_id, o.amount]));

      return finalEligible
        .map((b: any) => {
          const mirror = mirrorMap.get(b.unified_booking_id);
          const stay = stayMap.get(b.unified_booking_id);
          // Use override amount if confirmed, otherwise use original total_amount_net
          const overrideAmount = overrideMap.get(b.unified_booking_id);
          const effectiveAmountNet = overrideAmount !== undefined ? overrideAmount : b.total_amount_net;
          return {
            ...b,
            total_amount_net: effectiveAmountNet,
            ota_booking_code: mirror?.ota_booking_code ?? null,
            ota_property_id: mirror?.ota_property_id ?? null,
            actual_check_out_at: stay?.actual_check_out_at ?? b.check_out_date ?? null,
            stay_status: stay?.stay_status ?? null,
          } as EligibleBooking;
        });
    },
    enabled: !!otaSource,
  });
}

// Direct server-side search for booking when not found in pre-loaded list
// Searches bookings_mirror by ota_booking_code
export function useSearchBookingDirect(searchCode: string, otaSource: string) {
  const trimmed = searchCode.trim();
  return useQuery({
    queryKey: ["search_booking_direct", trimmed, otaSource],
    queryFn: async () => {
      if (!trimmed || trimmed.length < 5) return [];

      // Get source aliases for this OTA
      const sourceAliases = OTA_SOURCE_ALIASES[otaSource] || [otaSource];

      // Check if already added to any active (non-voided) payout
      const { data: existingDetails } = await (supabase as any)
        .from("ota_payout_details")
        .select("unified_booking_id")
        .eq("is_active", true);
      const existingBookingIds = new Set((existingDetails || []).map(d => d.unified_booking_id));

      // Search bookings_mirror by ota_booking_code (partial match)
      // Don't use ilike on unified_booking_id (UUID type can error)
      const { data: mirrorResults, error: mirrorError } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, ota_booking_code, ota_property_id, channex_property_id")
        .ilike("ota_booking_code", `%${trimmed}%`)
        .limit(50);

      if (mirrorError) {
        console.error("[useSearchBookingDirect] mirror search error:", mirrorError);
      }

      // Also try direct unified_bookings search by guest_name as fallback
      const { data: directResults, error: directError } = await supabase
        .from("unified_bookings")
        .select("unified_booking_id, guest_name, source, check_out_date, total_amount_net, booking_status, payment_type, pms_property_id")
        .in("source", sourceAliases)
        .eq("payment_type", "OTA_COLLECT")
        .ilike("guest_name", `%${trimmed}%`)
        .limit(20);

      if (directError) {
        console.error("[useSearchBookingDirect] direct search error:", directError);
      }

      // Combine booking IDs from both sources
      const mirrorBookingIds = (mirrorResults || []).map(m => m.unified_booking_id).filter(Boolean);
      const directBookingIds = (directResults || []).map(b => b.unified_booking_id);
      const allBookingIds = [...new Set([...mirrorBookingIds, ...directBookingIds])];

      if (allBookingIds.length === 0) return [];

      // Get booking details for all found IDs
      const { data: bookings } = await supabase
        .from("unified_bookings")
        .select("unified_booking_id, guest_name, source, check_out_date, total_amount_net, booking_status, payment_type, pms_property_id")
        .in("unified_booking_id", allBookingIds)
        .in("source", sourceAliases)
        .eq("payment_type", "OTA_COLLECT");

      if (!bookings || bookings.length === 0) return [];

      // Get mirror data for enrichment  
      const { data: mirrorData } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, ota_booking_code, ota_property_id, channex_property_id")
        .in("unified_booking_id", bookings.map(b => b.unified_booking_id));

      // Also get stay info
      const { data: stays } = await supabase
        .from("stays")
        .select("unified_booking_id, stay_status, actual_check_out_at")
        .in("unified_booking_id", bookings.map(b => b.unified_booking_id));

      const stayMap = new Map<string, { stay_status: string; actual_check_out_at: string | null }>();
      for (const s of stays || []) {
        const existing = stayMap.get(s.unified_booking_id);
        if (!existing || s.stay_status === "CHECKED_OUT") {
          stayMap.set(s.unified_booking_id, { stay_status: s.stay_status, actual_check_out_at: s.actual_check_out_at });
        }
      }

      const mirrorMap = new Map((mirrorData || []).map(m => [m.unified_booking_id, m]));

      // Fetch booking_amount_overrides for confirmed amounts (IMPORTED bookings)
      const filteredBookings = bookings.filter(b => !existingBookingIds.has(b.unified_booking_id));
      const filteredIds = filteredBookings.map(b => b.unified_booking_id);
      const { data: overrides } = filteredIds.length > 0
        ? await supabase
          .from("booking_amount_overrides")
          .select("unified_booking_id, amount")
          .in("unified_booking_id", filteredIds)
        : { data: [] };
      const overrideMap = new Map((overrides || []).map((o: any) => [o.unified_booking_id, o.amount]));

      return filteredBookings
        .map(b => {
          const mirror = mirrorMap.get(b.unified_booking_id);
          const stay = stayMap.get(b.unified_booking_id);
          const overrideAmount = overrideMap.get(b.unified_booking_id);
          const effectiveAmountNet = overrideAmount !== undefined ? overrideAmount : b.total_amount_net;
          return {
            ...b,
            total_amount_net: effectiveAmountNet,
            ota_booking_code: mirror?.ota_booking_code ?? null,
            ota_property_id: mirror?.ota_property_id ?? null,
            actual_check_out_at: stay?.actual_check_out_at ?? b.check_out_date ?? null,
            stay_status: stay?.stay_status ?? null,
          } as EligibleBooking;
        });
    },
    enabled: !!otaSource && trimmed.length >= 5,
    staleTime: 10_000,
  });
}

// Create new payout
export function useCreateOtaPayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      ota_source: string;
      payout_date: string;
      payout_period_from?: string;
      payout_period_to?: string;
      payout_method: string;
      receiving_bank_account?: string;
      payment_gateway?: string;
      ota_property_id?: string;
      provider_payout_id?: string;
    }) => {
      const { data: payout, error } = await supabase
        .from("ota_payouts")
        .insert({
          ota_source: data.ota_source,
          payout_date: data.payout_date,
          payout_period_from: data.payout_period_from || null,
          payout_period_to: data.payout_period_to || null,
          payout_method: data.payout_method,
          receiving_bank_account: data.receiving_bank_account || null,
          payment_gateway: data.payment_gateway || null,
          ota_property_id: data.ota_property_id || null,
          provider_payout_id: data.provider_payout_id || null,
          total_amount: 0,
          gross_amount: 0,
          net_payout_amount: 0,
          deduction_total: 0,
          status: "PENDING",
        })
        .select()
        .single();

      if (error) throw error;
      return payout;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      toast.success("Đã tạo payout mới");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// Add booking to payout (Sprint 4: atomic RPC — detail + NO_SHOW revenue in one txn)
export function useAddBookingToPayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      payout_id: string;
      unified_booking_id: string;
      booking_code: string;
      guest_name: string;
      actual_check_out_at: string;
      expected_amount: number;
      booking_status?: string;
    }) => {
      const { data: result, error } = await supabase.rpc(
        "add_booking_to_payout_atomic" as any,
        {
          p_payout_id: data.payout_id,
          p_unified_booking_id: data.unified_booking_id,
          p_booking_code: data.booking_code,
          p_guest_name: data.guest_name,
          p_expected_amount: data.expected_amount,
          p_actual_check_out_at: data.actual_check_out_at || null,
        }
      );

      if (error) {
        const msg = error.message || "";
        if (msg.includes("AUTH_REQUIRED")) {
          throw new Error("Vui lòng đăng nhập lại để thực hiện thao tác này.");
        }
        if (msg.includes("PERMISSION_DENIED")) {
          throw new Error("Bạn không có quyền thêm booking vào payout (yêu cầu admin/kế toán).");
        }
        if (msg.includes("BOOKING_ALREADY_ALLOCATED")) {
          throw new Error("Booking này đã thuộc payout khác đang active. Hãy void payout cũ trước khi thêm lại.");
        }
        if (msg.includes("VOIDED")) {
          throw new Error("Payout đã bị hủy, không thể thêm booking.");
        }
        if (msg.includes("STATUS_INVALID")) {
          throw new Error("Payout không ở trạng thái cho phép thêm booking (chỉ PENDING).");
        }
        if (msg.includes("CHECKOUT_REQUIRED")) {
          throw new Error("Booking chưa check-out, không thể thêm vào payout.");
        }
        if (msg.includes("NO_SHOW_ALREADY_POSTED")) {
          throw new Error("Doanh thu NO_SHOW cho booking này đã được hạch toán. Không thể thêm vào payout khác.");
        }
        if (msg.includes("NO_DEFAULT_ACCOUNT")) {
          throw new Error("Không tìm thấy tài khoản mặc định để hạch toán NO_SHOW. Liên hệ admin.");
        }
        if (msg.includes("is_period_locked") || msg.includes("PERIOD_LOCK")) {
          throw new Error("Kỳ kế toán đã đóng, không thể hạch toán.");
        }
        throw error;
      }

      const res = result as unknown as Record<string, any>;
      if (res?.no_show_revenue_posted === true) {
        toast.success("Đã hạch toán doanh thu NO_SHOW vào sổ cái.", { duration: 5000 });
      }

      return res;
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ota_payout_details", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["eligible_bookings_for_payout"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_cashin_status", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["no_show_snapshot", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["no_show_kpis"] });
      queryClient.invalidateQueries({ queryKey: ["pl-calculator-noshow-revenue"] });

      const res = result as Record<string, any>;
      if (res?.status === "already_exists") {
        toast.info("Booking đã tồn tại trong payout này.");
        return;
      }

      toast.success("Đã thêm booking vào payout");

      autoLinkCasesOnPayoutAssignment(variables.payout_id, variables.unified_booking_id)
        .then(linkResult => {
          showAutoLinkToast(linkResult);
          if (linkResult.linked > 0) {
            queryClient.invalidateQueries({ queryKey: ["dispute_tracking"] });
            queryClient.invalidateQueries({ queryKey: ["case_center"] });
          }
        })
        .catch(() => { });
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// Error message mapping for atomic RPC errors
function mapAdjustmentError(msg: string): string {
  if (msg.includes("AUTH_REQUIRED")) return "Vui lòng đăng nhập lại.";
  if (msg.includes("PERMISSION_DENIED")) return "Bạn không có quyền tạo điều chỉnh.";
  if (msg.includes("PERIOD_LOCK")) return "Kỳ kế toán đang khóa, không thể hạch toán.";
  if (msg.includes("STATUS_INVALID") || msg.includes("VOIDED")) return "Trạng thái payout không hợp lệ.";
  if (msg.includes("DUPLICATE")) return "Dữ liệu đã tồn tại.";
  if (msg.includes("REASON_REQUIRED")) return "Vui lòng nhập lý do.";
  if (msg.includes("INVALID_AMOUNT")) return "Số tiền phải khác 0.";
  if (msg.includes("PAYOUT_NOT_FOUND")) return "Không tìm thấy payout.";
  return "Lỗi: " + msg;
}

// Add deduction — uses atomic RPC that writes to ota_payout_deductions
// and recalculates deduction_total + net_payout_amount on ota_payouts.
// Does NOT create ledger/reconciliation entries (that's "Phân loại" flow).
export function useAddPayoutDeduction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      payout_id: string;
      payout_detail_id?: string;
      unified_booking_id?: string;
      deduction_type: string;
      amount: number;
      reason_note: string;
    }) => {
      if (!data.reason_note.trim()) {
        throw new Error("REASON_REQUIRED");
      }

      // amount is already signed from AddAdjustmentDialog:
      // positive = INCREASE, negative = DECREASE
      const { data: result, error } = await (supabase.rpc as any)(
        "create_ota_payout_deduction_atomic",
        {
          p_payout_id: data.payout_id,
          p_amount: data.amount,
          p_deduction_type: data.deduction_type,
          p_reason_note: data.reason_note,
          p_unified_booking_id: data.unified_booking_id || null,
          p_payout_detail_id: data.payout_detail_id || null,
        }
      );

      if (error) throw error;
      return result;
    },
    onSuccess: (result, variables) => {
      if (result?.already_exists) {
        toast.info("Điều chỉnh đã tồn tại (idempotent)");
        return;
      }
      // Invalidate all related queries for fresh UI
      queryClient.invalidateQueries({ queryKey: ["ota_payout_deductions", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_details", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_cashin_status", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts_for_cashin"] });
      toast.success("Đã thêm điều chỉnh payout");

      // Auto-link: if adjustment has a booking, link it to matching case
      if (variables.unified_booking_id) {
        const deductionId = result?.deduction_id;
        if (deductionId) {
          autoLinkCaseOnPayoutRecord(
            "ADJUSTMENT",
            deductionId,
            variables.payout_id,
            variables.unified_booking_id
          )
            .then(linkResult => {
              showAutoLinkToast(linkResult);
              if (linkResult.linked > 0) {
                queryClient.invalidateQueries({ queryKey: ["dispute_tracking"] });
                queryClient.invalidateQueries({ queryKey: ["case_center"] });
              }
            })
            .catch(() => { }); // Non-blocking
        }
      }
    },
    onError: (error: Error) => {
      toast.error(mapAdjustmentError(error.message));
    },
  });
}

// Soft-delete deduction via secure RPC (Sprint 11: replaces hard .delete())
export function useDeletePayoutDeduction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { deduction_id: string; payout_id: string; payout_detail_id: string | null; amount: number; reason?: string }) => {
      const { data: result, error } = await (supabase.rpc as any)('delete_payout_deduction_secure', {
        p_deduction_id: data.deduction_id,
        p_reason: data.reason || 'Xóa điều chỉnh bởi người dùng',
      });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("AUTH_REQUIRED")) {
          throw new Error("Vui lòng đăng nhập lại.");
        }
        if (msg.includes("PERMISSION_DENIED")) {
          throw new Error("Bạn không có quyền xóa điều chỉnh.");
        }
        if (msg.includes("DEDUCTION_NOT_FOUND")) {
          throw new Error("Không tìm thấy điều chỉnh.");
        }
        if (msg.includes("VOIDED")) {
          throw new Error("Không thể chỉnh sửa payout đã hủy.");
        }
        throw new Error(error.message || "Lỗi xóa điều chỉnh");
      }

      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ota_payout_deductions", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_details", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_cashin_status", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_reconciliation"] });
      toast.success("Đã xóa điều chỉnh và dữ liệu đối soát liên quan");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// Deactivate (soft-delete) a booking from payout
export function useDeactivatePayoutDetail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { detail_id: string; payout_id: string; reason: string }) => {
      const { data: result, error } = await (supabase.rpc as any)('deactivate_payout_detail_secure', {
        p_detail_id: data.detail_id,
        p_reason: data.reason,
      });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("AUTH_REQUIRED")) throw new Error("Vui lòng đăng nhập lại.");
        if (msg.includes("PERMISSION_DENIED")) throw new Error("Bạn không có quyền xóa booking.");
        if (msg.includes("DETAIL_NOT_FOUND")) throw new Error("Không tìm thấy booking.");
        if (msg.includes("ALREADY_DEACTIVATED")) throw new Error("Booking đã được xóa trước đó.");
        if (msg.includes("PAYOUT_VOIDED")) throw new Error("Không thể chỉnh sửa payout đã hủy.");
        if (msg.includes("PAYOUT_NOT_PENDING")) throw new Error("Chỉ có thể xóa booking khi payout ở trạng thái PENDING.");
        throw new Error(error.message || "Lỗi xóa booking khỏi payout");
      }

      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ota_payout_details", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_cashin_status", variables.payout_id] });
      toast.success("Đã xóa booking khỏi payout");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// Update deduction (only when payout has no cash-in)
export function useUpdatePayoutDeduction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      deduction_id: string;
      payout_id: string;
      payout_detail_id: string | null;
      old_amount: number;
      new_amount: number;
      deduction_type: string;
      reason_note: string;
    }) => {
      if (!data.reason_note.trim()) {
        throw new Error("Lý do bắt buộc");
      }

      const { error } = await supabase
        .from("ota_payout_deductions")
        .update({
          amount: data.new_amount,
          deduction_type: data.deduction_type,
          reason_note: data.reason_note,
        })
        .eq("id", data.deduction_id);

      if (error) throw error;

      // NOTE: No longer updating ota_payout_details.deduction_amount / final_amount

      await recalculatePayoutTotals(data.payout_id);

      // Audit log
      await createAuditLog({
        action: "UPDATE_ADJUSTMENT",
        entity: "ota_payout_deductions",
        entityId: data.deduction_id,
        beforeData: {
          amount: data.old_amount,
        },
        afterData: {
          payout_id: data.payout_id,
          amount: data.new_amount,
          deduction_type: data.deduction_type,
          reason_note: data.reason_note,
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ota_payout_deductions", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_details", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout", variables.payout_id] });
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_cashin_status", variables.payout_id] });
      toast.success("Đã cập nhật điều chỉnh");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// Void payout (soft-delete via RPC — no data destruction)
export function useVoidPayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { payout_id: string; reason: string }) => {
      if (!data.reason.trim()) {
        throw new Error("Lý do hủy bắt buộc");
      }

      const { data: result, error } = await supabase.rpc("void_ota_payout_secure" as any, {
        p_payout_id: data.payout_id,
        p_reason: data.reason,
      });

      if (error) {
        const msg = error.message || "";
        if (msg.includes("VOID_BLOCKED")) {
          throw new Error("Không thể hủy phiếu đã ghi nhận tiền về. Vui lòng đảo bút toán thu tiền trước.");
        }
        if (msg.includes("PERMISSION_DENIED")) {
          throw new Error("Bạn không có quyền hủy phiếu payout.");
        }
        throw new Error("Lỗi hủy phiếu: " + msg);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota_payouts"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout"] });
      queryClient.invalidateQueries({ queryKey: ["eligible_bookings_for_payout"] });
      toast.success("Đã hủy phiếu payout (dữ liệu được giữ lại cho kiểm toán)");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE ENTRY POINT ENFORCEMENT (2026-02-27):
// OTA payout cash-in → useRecordMultiPayoutCashIn (useOtaPayoutCashIn.ts)
//   → RPC: create_multi_payout_cashin_atomic
//   → DB: recalculate_ota_payout_status_v2(payout_id, received_at)
//
// DO NOT re-enable direct writes to ota_payouts.status / reconciled_at / received_at.
// EditPayoutDialog.tsx is the only allowed direct .update() path (metadata only).
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated REMOVED — use useRecordMultiPayoutCashIn from useOtaPayoutCashIn.ts */
export function useRecordCashIn(): never { throw new Error("LEGACY_REMOVED: use useRecordMultiPayoutCashIn"); }
/** @deprecated REMOVED — status managed by recalculate_ota_payout_status_v2 */
export function useUpdatePayoutStatus(): never { throw new Error("LEGACY_REMOVED: status managed by DB RPC"); }

// Permission helpers
export type PayoutRole = 'admin' | 'ke_toan' | 'cskh' | 'sale' | 'super_admin' | 'ota_staff' | 'ota_lead';
export function canEditPayout(role: PayoutRole | null): boolean {
  return role === 'admin' || role === 'ke_toan' || role === 'super_admin';
}
export function canViewPayout(role: PayoutRole | null): boolean {
  return role === 'admin' || role === 'ke_toan' || role === 'cskh' || role === 'super_admin';
}

// Recalculate payout totals (SIGNED MODEL — amounts in DB are already signed)
async function recalculatePayoutTotals(payoutId: string) {
  const { data: details } = await supabase
    .from("ota_payout_details")
    .select("expected_amount")
    .eq("payout_id", payoutId);

  // Read ALL active adjustments — amounts are already signed in DB
  const { data: adjustments } = await (supabase as any)
    .from("ota_payout_deductions")
    .select("amount")
    .eq("payout_id", payoutId)
    .eq("is_deleted", false);

  const grossAmount = (details || []).reduce((sum, d) => sum + Number(d.expected_amount || 0), 0);

  // Direct sum — no conversion needed, DB stores signed values
  const adjustmentsTotal = (adjustments || []).reduce(
    (sum, d) => sum + Number(d.amount || 0),
    0,
  );

  const netAmount = grossAmount + adjustmentsTotal;

  await safeMutation(() => supabase.from("ota_payouts").update({
    gross_amount: grossAmount,
    deduction_total: adjustmentsTotal,
    net_payout_amount: netAmount,
    total_amount: netAmount,
  }).eq("id", payoutId));
}

// Payout-level adjustment directions (3 types only — no booking-level items)
export const ADJUSTMENT_TYPES = [
  {
    value: "DECREASE",
    label: "Trừ thêm từ OTA",
    defaultSign: "negative" as const,
    hint: "Relocation fee, Penalty, Chargeback, Deduction không rõ lý do",
    reasons: [
      { value: "relocation_fee", label: "Relocation fee" },
      { value: "penalty", label: "Penalty" },
      { value: "chargeback", label: "Chargeback" },
      { value: "no_show", label: "No-show" },
      { value: "overbooking", label: "Overbooking" },
      { value: "ota_fee", label: "OTA fee" },
      { value: "other_decrease", label: "Khác (trừ)" },
    ],
  },
  {
    value: "INCREASE",
    label: "Bù thêm từ OTA",
    defaultSign: "positive" as const,
    hint: "Bù thiếu kỳ trước, Credit, Incentive, Compensation",
    reasons: [
      { value: "shortfall_prev", label: "Bù thiếu kỳ trước" },
      { value: "credit", label: "Credit" },
      { value: "incentive", label: "Incentive / Bonus" },
      { value: "compensation", label: "Compensation" },
      { value: "other_increase", label: "Khác (cộng)" },
    ],
  },
  {
    value: "CORRECTION",
    label: "Điều chỉnh kế toán",
    defaultSign: "any" as const,
    hint: "Sai lệch nội bộ, Làm tròn số, Correction manual",
    reasons: [
      { value: "internal_diff", label: "Sai lệch nội bộ" },
      { value: "rounding", label: "Làm tròn số" },
      { value: "manual_correction", label: "Correction manual" },
      { value: "other_correction", label: "Khác" },
    ],
  },
];

export const PAYMENT_GATEWAYS = [
  { value: "9PAY", label: "9Pay" },
  { value: "ONEPAY", label: "OnePay" },
  { value: "VPBANK", label: "VPBank" },
  { value: "OTHER", label: "Khác" },
] as const;

export const OTA_SOURCES = [
  { value: "AGODA", label: "Agoda" },
  { value: "BOOKING", label: "Booking.com" },
  { value: "EXPEDIA", label: "Expedia" },
  { value: "AIRBNB", label: "Airbnb" },
  { value: "TRAVELOKA", label: "Traveloka" },
  { value: "CTRIP", label: "Trip.com / Ctrip" },
  { value: "OTHER", label: "Khác" },
] as const;

// Fetch distinct ota_property_id values for a given OTA source from bookings_mirror
export function useOtaPropertyIdsBySource(otaSource: string) {
  const sourceAliases = OTA_SOURCE_ALIASES[otaSource] || [otaSource];
  return useQuery({
    queryKey: ["ota_property_ids_by_source", otaSource],
    queryFn: async () => {
      // Get property IDs belonging to An Gia Residences group
      const { data: propertyLinks } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", AN_GIA_GROUP_ID);
      const groupPropertyIds = propertyLinks?.map(p => p.channex_property_id) || [];

      const { data, error } = await supabase
        .from("bookings_mirror")
        .select("ota_property_id, channex_property_id")
        .in("ota_source", sourceAliases)
        .not("ota_property_id", "is", null);

      if (error) throw error;

      // Filter to An Gia properties and get distinct ota_property_ids
      const filtered = (data || []).filter(
        (r: any) => !r.channex_property_id || groupPropertyIds.includes(r.channex_property_id)
      );
      const uniqueIds = Array.from(new Set(filtered.map((r: any) => r.ota_property_id as string).filter(Boolean)));
      return uniqueIds.sort();
    },
    enabled: !!otaSource,
  });
}
