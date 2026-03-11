import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BookingAmountOverride {
  id: string;
  unified_booking_id: string;
  amount: number;
  commission_percent: number | null;
  note: string | null;
  confirmed_at: string;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch all amount overrides (for list views)
export function useBookingAmountOverrides() {
  return useQuery({
    queryKey: ["booking_amount_overrides"],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_amount_overrides")
        .select("*");

      if (error) throw error;
      return data as BookingAmountOverride[];
    },
  });
}

// Fetch override for a specific booking
export function useBookingAmountOverride(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking_amount_override", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!unifiedBookingId) return null;

      const { data, error } = await supabase
        .from("booking_amount_overrides")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId)
        .maybeSingle();

      if (error) throw error;
      return data as BookingAmountOverride | null;
    },
    enabled: !!unifiedBookingId,
  });
}

// Create or update amount override (confirm amount)
export function useConfirmBookingAmount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      unified_booking_id: string;
      amount: number;
      commission_percent?: number | null;
      note?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Upsert - insert if not exists, update if exists
      const { data: result, error } = await supabase
        .from("booking_amount_overrides")
        .upsert({
          unified_booking_id: data.unified_booking_id,
          amount: data.amount,
          commission_percent: data.commission_percent ?? null,
          note: data.note || null,
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "unified_booking_id",
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["booking_amount_overrides"] });
      queryClient.invalidateQueries({ queryKey: ["booking_amount_override", variables.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking_detail", variables.unified_booking_id] });
      toast.success("Đã xác nhận giá phải thu");
    },
    onError: (error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// ============================================
// COMPUTED "GIÁ PHẢI THU" LOGIC
// Single source of truth for booking amount display
// ============================================

export type AmountStatus = "CONFIRMED" | "UNCONFIRMED" | "CANCELLED" | "ZERO";

export interface ComputedBookingAmount {
  amount: number | null;
  status: AmountStatus;
  isConfirmed: boolean;
  source: "override" | "ota" | "none";
}

/**
 * Compute "Giá phải thu" based on the optimized specification:
 * 
 * Priority order:
 * 1. CANCELLED / NO_SHOW → 0 (always)
 * 2. Override CONFIRMED → override.amount
 * 3. IMPORTED booking → 0, UNCONFIRMED (needs manual confirmation)
 * 4. OTA_COLLECT with remittance (total_amount_net > 0) → use remittance as confirmed
 * 5. HOTEL_COLLECT with amount > 0 → use amount as confirmed
 * 6. Otherwise → UNCONFIRMED (needs manual confirmation)
 */
export function computeBookingAmount(
  booking: {
    booking_status?: string | null;
    payment_type?: string | null;
    total_amount_net?: number | null;
    booking_type?: string | null;
    channex_status?: string | null; // Added for Channex cancellation detection
    ota_status_label?: string | null; // For "Đã hủy" label detection from OTA
  } | null,
  override: BookingAmountOverride | null
): ComputedBookingAmount {
  // No booking data
  if (!booking) {
    return { amount: null, status: "UNCONFIRMED", isConfirmed: false, source: "none" };
  }

  // CANCELLED or NO_SHOW → always 0
  // Check booking_status, channex_status, AND ota_status_label for cancellation
  // Normalize status strings for robust comparison
  const bookingStatusUpper = (booking.booking_status || "").toUpperCase();
  const channexStatusLower = (booking.channex_status || "").toLowerCase();
  const otaStatusLabel = (booking.ota_status_label || "").toLowerCase();
  
  // Comprehensive cancellation detection:
  // 1. booking_status = CANCELLED/CANCELED/CANCELLED_BY_GUEST/NO_SHOW
  // 2. channex_status = cancelled/canceled (raw from Channex)
  // 3. ota_status_label contains 'hủy' or 'cancel' (Vietnamese/English labels)
  const isCancelled = 
    bookingStatusUpper === "CANCELLED" || 
    bookingStatusUpper === "CANCELED" ||
    bookingStatusUpper === "CANCELLED_BY_GUEST" ||
    bookingStatusUpper === "NO_SHOW" ||
    channexStatusLower === "cancelled" ||
    channexStatusLower === "canceled" ||
    otaStatusLabel.includes("hủy") ||
    otaStatusLabel.includes("cancel");
    
  if (isCancelled) {
    // For HOTEL_COLLECT cancelled bookings: Giá phải thu = 0
    // This is critical: khi Channex trả về OTA Đã hủy, phải = 0
    // DEBUG: Uncomment to trace cancellation detection
    // console.log('[computeBookingAmount] CANCELLED detected:', { bookingStatusUpper, channexStatusLower, otaStatusLabel });
    return { amount: 0, status: "CANCELLED", isConfirmed: true, source: "none" };
  }

  // Override confirmed → use override amount (highest priority after status check)
  if (override) {
    return { 
      amount: override.amount, 
      status: "CONFIRMED", 
      isConfirmed: true, 
      source: "override" 
    };
  }

  // IMPORTED booking → default 0, needs manual confirmation
  if (booking.booking_type === "IMPORTED") {
    return { 
      amount: 0, 
      status: "UNCONFIRMED", 
      isConfirmed: false, 
      source: "none" 
    };
  }

  // OTA_COLLECT with valid remittance (total_amount_net) → use as confirmed
  if (booking.payment_type === "OTA_COLLECT" && 
      booking.total_amount_net !== null && 
      booking.total_amount_net > 0) {
    return { 
      amount: booking.total_amount_net, 
      status: "CONFIRMED", 
      isConfirmed: true, 
      source: "ota" 
    };
  }

  // HOTEL_COLLECT with valid amount → use as confirmed
  // NOTE: Cancelled HOTEL_COLLECT are handled above - they return 0
  if (booking.payment_type === "HOTEL_COLLECT") {
    const totalAmount = booking.total_amount_net || (booking as any).total_amount_gross || 0;
    if (totalAmount > 0) {
      return { 
        amount: totalAmount, 
        status: "CONFIRMED", 
        isConfirmed: true, 
        source: "ota" 
      };
    }
  }

  // Default: needs manual confirmation
  return { 
    amount: null, 
    status: "UNCONFIRMED", 
    isConfirmed: false, 
    source: "none" 
  };
}

// Hook to get computed amount for a single booking
export function useComputedBookingAmount(
  booking: {
    unified_booking_id?: string;
    booking_status?: string | null;
    payment_type?: string | null;
    total_amount_net?: number | null;
    booking_type?: string | null;
  } | null
) {
  const { data: override } = useBookingAmountOverride(booking?.unified_booking_id);
  
  return computeBookingAmount(booking, override || null);
}
