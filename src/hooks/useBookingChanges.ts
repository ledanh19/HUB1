import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BookingChange {
  id: string;
  unified_booking_id: string;
  pms_booking_id: string | null;
  change_source: string;
  change_type: string;
  changed_fields: string[] | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  source_updated_at: string | null;
  sync_run_id: string | null;
  created_at: string;
}

export function useBookingChanges(unifiedBookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking_changes", unifiedBookingId],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!unifiedBookingId) return [];

      const { data, error } = await supabase
        .from("booking_changes")
        .select("*")
        .eq("unified_booking_id", unifiedBookingId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter out duplicate trigger records when webhook already recorded same change
      // This handles legacy data before the trigger fix was applied
      const changes = (data || []) as BookingChange[];
      return deduplicateChanges(changes);
    },
    enabled: !!unifiedBookingId,
  });
}

/**
 * Remove duplicate booking_changes records
 * When webhook records a change, trigger may also create a duplicate
 * Keep only the CHANNEX_WEBHOOK/CHANNEX_SYNC record, remove bookings_mirror_trigger duplicate
 */
function deduplicateChanges(changes: BookingChange[]): BookingChange[] {
  const result: BookingChange[] = [];
  const seen = new Map<string, BookingChange>();

  for (const change of changes) {
    // Create a key based on change_type and approximate time (within 5 seconds)
    const timeKey = Math.floor(new Date(change.created_at).getTime() / 5000);
    const key = `${change.change_type}_${timeKey}`;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, change);
      result.push(change);
    } else {
      // If we have a duplicate, prefer CHANNEX_WEBHOOK over bookings_mirror_trigger
      const preferredSources = ['CHANNEX_WEBHOOK', 'CHANNEX_SYNC'];
      const existingIsTrigger = existing.change_source === 'bookings_mirror_trigger';
      const currentIsPreferred = preferredSources.includes(change.change_source);

      if (existingIsTrigger && currentIsPreferred) {
        // Replace trigger record with webhook record
        const idx = result.indexOf(existing);
        if (idx !== -1) {
          result[idx] = change;
        }
        seen.set(key, change);
      }
      // Otherwise keep the existing one (first webhook wins)
    }
  }

  return result;
}

// Helper to get human-readable field labels
export const FIELD_LABELS: Record<string, string> = {
  booking_status: "Trạng thái",
  check_in_date: "Ngày nhận phòng",
  check_out_date: "Ngày trả phòng",
  nights: "Số đêm",
  guest_name: "Tên khách",
  guest_email: "Email",
  guest_phone: "Điện thoại",
  room_type: "Loại phòng",
  total_amount_gross: "Tổng tiền (Gross)",
  total_amount_net: "Tổng tiền (Net)",
  commission_amount: "Hoa hồng",
  payment_type: "Loại thanh toán",
  pms_property_name: "Tên property",
  channex_status: "Trạng thái Channex",
  channex_revision_id: "Mã phiên bản",
  ota_source: "Kênh OTA",
  ota_booking_code: "Mã đặt phòng OTA",
  rooms_count: "Số phòng",
  currency: "Tiền tệ",
  special_requests: "Yêu cầu đặc biệt",
};

// Technical fields to HIDE from operator view
export const OTA_SKIP_FIELDS = new Set([
  "channex_revision_id", "channex_status", "sync_run_id",
  "pms_booking_id", "channex_booking_id", "channex_property_id",
  "updated_at", "created_at", "id", "unified_booking_id",
]);

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  INSERT: "Đặt phòng mới",
  UPDATE: "Cập nhật thông tin",
  STATUS_CHANGE: "Thay đổi trạng thái",
  DATES_CHANGE: "Thay đổi ngày",
  AMOUNT_CHANGE: "Thay đổi số tiền",
};

export const CHANGE_SOURCE_LABELS: Record<string, string> = {
  CHANNEX_SYNC: "Đồng bộ Channex",
  CHANNEX_WEBHOOK: "Webhook Channex",
  MANUAL: "Chỉnh sửa thủ công",
};
