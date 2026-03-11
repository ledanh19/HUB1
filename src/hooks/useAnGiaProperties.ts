import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// An Gia Residences group ID - hardcoded for performance
export const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

/**
 * Hook để lấy danh sách property IDs thuộc group "An Gia Residences"
 * Sử dụng hook này để filter dữ liệu theo group An Gia trong toàn bộ hệ thống
 * 
 * Usage:
 * const { propertyIds, isLoading } = useAnGiaProperties();
 * 
 * // Trong query
 * if (propertyIds.length > 0) {
 *   query = query.in("channex_property_id", propertyIds);
 * }
 */
export function useAnGiaProperties() {
  const { data: propertyIds = [], isLoading, error } = useQuery({
    queryKey: ["an-gia-property-ids"],
    queryFn: async () => {
      const { data: propertyGroups } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", AN_GIA_GROUP_ID);

      return propertyGroups?.map(p => p.channex_property_id) || [];
    },
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes - property list rarely changes
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
  });

  return { propertyIds, isLoading, error };
}

/**
 * Hook để lấy tất cả unified_booking_id thuộc An Gia group
 * Sử dụng khi cần filter các table liên quan đến booking (hotel_collects, disputes, etc.)
 */
export function useAnGiaBookingIds() {
  const { data: bookingIds = [], isLoading, error } = useQuery({
    queryKey: ["an-gia-booking-ids", "v2"],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Get property IDs first
      const { data: propertyGroups } = await supabase
        .from("channex_property_groups")
        .select("channex_property_id")
        .eq("channex_group_id", AN_GIA_GROUP_ID);

      const propertyIds = propertyGroups?.map((p) => p.channex_property_id) || [];

      const ids = new Set<string>();

      // 1) Known property-linked bookings (via mirror)
      if (propertyIds.length > 0) {
        const { data: bookings } = await supabase
          .from("bookings_mirror")
          .select("unified_booking_id")
          .in("channex_property_id", propertyIds);

        bookings?.forEach((b) => b.unified_booking_id && ids.add(b.unified_booking_id));
      }

      // 2) Failsafe to match Booking Center behavior:
      // - MANUAL bookings have no mirror rows
      // - OTA-* bookings may not have mirror rows but are still shown in Booking Center
      // - channex_* bookings from PMS sync
      const { data: fallbackBookings } = await supabase
        .from("unified_bookings")
        .select("unified_booking_id")
        .or("booking_type.eq.MANUAL,unified_booking_id.ilike.OTA-%,unified_booking_id.ilike.channex_%");

      fallbackBookings?.forEach((b) => b.unified_booking_id && ids.add(b.unified_booking_id));

      return Array.from(ids);
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    gcTime: 1000 * 60 * 15,
  });

  return { bookingIds, isLoading, error };
}

/**
 * Helper function để fetch An Gia property IDs (dùng trong queryFn)
 */
export async function fetchAnGiaPropertyIds(): Promise<string[]> {
  const { data: propertyGroups } = await supabase
    .from("channex_property_groups")
    .select("channex_property_id")
    .eq("channex_group_id", AN_GIA_GROUP_ID);

  return propertyGroups?.map(p => p.channex_property_id) || [];
}

/**
 * Helper: paginated fetch to bypass Supabase 1000-row default limit.
 * Fetches ALL rows by iterating in pages of `pageSize`.
 */
async function fetchAllRows<T extends Record<string, any>>(
  queryBuilder: () => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break; // last page
    from += pageSize;
  }
  return all;
}

/**
 * Helper function để fetch An Gia booking IDs (dùng trong queryFn)
 * Uses pagination to avoid the Supabase 1000-row default limit.
 */
export async function fetchAnGiaBookingIds(): Promise<string[]> {
  const propertyIds = await fetchAnGiaPropertyIds();

  const ids = new Set<string>();

  // 1) Known property-linked bookings (via mirror) — paginated
  if (propertyIds.length > 0) {
    const bookings = await fetchAllRows<{ unified_booking_id: string }>(() =>
      supabase
        .from("bookings_mirror")
        .select("unified_booking_id")
        .in("channex_property_id", propertyIds)
    );
    bookings.forEach((b) => b.unified_booking_id && ids.add(b.unified_booking_id));
  }

  // 2) Failsafe to match Booking Center behavior — paginated
  const fallbackBookings = await fetchAllRows<{ unified_booking_id: string }>(() =>
    supabase
      .from("unified_bookings")
      .select("unified_booking_id")
      .or("booking_type.eq.MANUAL,unified_booking_id.ilike.OTA-%,unified_booking_id.ilike.channex_%")
  );
  fallbackBookings.forEach((b) => b.unified_booking_id && ids.add(b.unified_booking_id));

  return Array.from(ids);
}

/**
 * Helper function to detect actual OTA from booking code prefix
 * Dùng khi ota_source là "OTHER" để detect đúng nguồn OTA
 */
export function detectOtaFromCode(otaSource: string, otaBookingCode: string | null): string {
  let source = (otaSource || "OTHER").toUpperCase();
  if (source === "OTHER" && otaBookingCode) {
    const code = otaBookingCode.toUpperCase();
    if (code.startsWith("BDC-") || code.includes("BOOKING")) {
      source = "BOOKING.COM";
    } else if (code.startsWith("AGO-") || code.includes("AGODA")) {
      source = "AGODA";
    } else if (code.startsWith("EXP-") || code.includes("EXPEDIA")) {
      source = "EXPEDIA";
    } else if (code.startsWith("TVL-") || code.includes("TRAVELOKA")) {
      source = "TRAVELOKA";
    } else if (code.startsWith("CTP-") || code.includes("CTRIP")) {
      source = "CTRIP";
    }
  }
  return source;
}
