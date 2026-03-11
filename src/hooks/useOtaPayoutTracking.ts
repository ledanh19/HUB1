import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// === OTA PAYOUT TRACKING ===
// Theo dõi tiền OTA phải trả cho Roomrise
// Chỉ booking OTA_COLLECT + đã checkout + tiền chưa về đầy đủ

export type OtaPayoutStatus =
  | "NOT_DUE"      // Chưa tới hạn - đã checkout, chưa tới kỳ payout OTA
  | "ELIGIBLE"     // Đủ điều kiện payout - đã tới kỳ payout, tiền chưa về
  | "OVERDUE"      // Quá hạn payout - đã qua kỳ payout, tiền chưa về
  | "HAS_ISSUE"    // Có vấn đề - tiền bị giữ/trừ/đang tranh chấp
  | "RECEIVED";    // Đã nhận tiền - OTA đã thanh toán đầy đủ

export interface OtaPayoutTrackingItem {
  unified_booking_id: string;
  booking_code: string | null;
  guest_name: string;
  ota_source: string;
  check_out_date: string;
  actual_check_out_at: string | null;
  total_amount_net: number;
  expected_payout_date: string; // checkout + OTA payout cycle days
  payout_status: OtaPayoutStatus;
  days_until_due: number; // negative = overdue
  received_amount: number;
  remaining_amount: number;
  has_open_dispute: boolean;
  dispute_id: string | null;
}

// OTA payout cycles (days after checkout)
const OTA_PAYOUT_CYCLES: Record<string, number> = {
  "BOOKING": 14,
  "AGODA": 7,
  "EXPEDIA": 14,
  "AIRBNB": 1,
  "CTRIP": 14,
  "TRAVELOKA": 7,
  "OTHER": 14,
};

// Get expected payout date based on OTA and checkout date
function getExpectedPayoutDate(checkoutDate: string, otaSource: string): Date {
  const checkout = new Date(checkoutDate);
  const cycleDays = OTA_PAYOUT_CYCLES[otaSource] || OTA_PAYOUT_CYCLES["Other"];
  checkout.setDate(checkout.getDate() + cycleDays);
  return checkout;
}

// Calculate payout status
function calculatePayoutStatus(
  checkoutDate: string,
  otaSource: string,
  receivedAmount: number,
  expectedAmount: number,
  hasOpenDispute: boolean
): { status: OtaPayoutStatus; daysUntilDue: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expectedPayoutDate = getExpectedPayoutDate(checkoutDate, otaSource);
  expectedPayoutDate.setHours(0, 0, 0, 0);

  const diffTime = expectedPayoutDate.getTime() - today.getTime();
  const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Đã nhận đủ tiền
  if (receivedAmount >= expectedAmount && expectedAmount > 0) {
    return { status: "RECEIVED", daysUntilDue };
  }

  // Có vấn đề (tranh chấp đang mở)
  if (hasOpenDispute) {
    return { status: "HAS_ISSUE", daysUntilDue };
  }

  // Quá hạn (đã qua ngày dự kiến payout > 3 ngày)
  if (daysUntilDue < -3) {
    return { status: "OVERDUE", daysUntilDue };
  }

  // Đủ điều kiện payout (trong khoảng -3 đến +3 ngày)
  if (daysUntilDue <= 3) {
    return { status: "ELIGIBLE", daysUntilDue };
  }

  // Chưa tới hạn
  return { status: "NOT_DUE", daysUntilDue };
}

// Fetch OTA payout tracking data
export function useOtaPayoutTracking(filters?: {
  status?: OtaPayoutStatus | "all";
  otaSource?: string;
}) {
  return useQuery({
    queryKey: ["ota_payout_tracking", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // 1. Get all OTA_COLLECT bookings that are checked out
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings_mirror")
        .select(`
          unified_booking_id,
          ota_booking_code,
          guest_name,
          ota_source,
          check_out_date,
          total_amount_net,
          payment_type,
          booking_status
        `)
        .eq("payment_type", "OTA_COLLECT")
        .not("booking_status", "eq", "CANCELLED");

      if (bookingsError) throw bookingsError;

      // 2. Get stays with actual checkout
      const bookingIds = (bookings || []).map(b => b.unified_booking_id);
      const { data: stays } = await supabase
        .from("stays")
        .select("unified_booking_id, actual_check_out_at, stay_status")
        .in("unified_booking_id", bookingIds);

      const staysMap = new Map(
        (stays || []).map(s => [s.unified_booking_id, s])
      );

      // 3. Get open disputes (using DB status values: OPEN, IN_REVIEW)
      const { data: disputes } = await supabase
        .from("ota_disputes")
        .select("id, unified_booking_id, status")
        .in("status", ["OPEN", "IN_REVIEW"]);

      const disputesMap = new Map(
        (disputes || []).map(d => [d.unified_booking_id, d])
      );

      // 4. Get received amounts from hotel_collects (OTA payout cash-in)
      const { data: collections } = await supabase
        .from("hotel_collects")
        .select("unified_booking_id, amount_collected, related_type")
        .in("unified_booking_id", bookingIds)
        .eq("related_type", "OTA_PAYOUT")
        .is("voided_at", null);

      const receivedMap = new Map<string, number>();
      (collections || []).forEach(c => {
        const current = receivedMap.get(c.unified_booking_id) || 0;
        receivedMap.set(c.unified_booking_id, current + Number(c.amount_collected));
      });

      // 5. Build tracking items
      const items: OtaPayoutTrackingItem[] = [];

      for (const booking of bookings || []) {
        const stay = staysMap.get(booking.unified_booking_id);

        // Skip if not checked out
        if (!stay?.actual_check_out_at) continue;

        const dispute = disputesMap.get(booking.unified_booking_id);
        const hasOpenDispute = !!dispute;
        const receivedAmount = receivedMap.get(booking.unified_booking_id) || 0;
        const expectedAmount = Number(booking.total_amount_net) || 0;

        const { status, daysUntilDue } = calculatePayoutStatus(
          stay.actual_check_out_at,
          booking.ota_source,
          receivedAmount,
          expectedAmount,
          hasOpenDispute
        );

        // Skip if already fully received (unless filtering for RECEIVED)
        if (status === "RECEIVED" && filters?.status !== "RECEIVED" && filters?.status !== "all") {
          continue;
        }

        const expectedPayoutDate = getExpectedPayoutDate(stay.actual_check_out_at, booking.ota_source);

        items.push({
          unified_booking_id: booking.unified_booking_id,
          booking_code: booking.ota_booking_code,
          guest_name: booking.guest_name,
          ota_source: booking.ota_source,
          check_out_date: booking.check_out_date,
          actual_check_out_at: stay.actual_check_out_at,
          total_amount_net: expectedAmount,
          expected_payout_date: expectedPayoutDate.toISOString(),
          payout_status: status,
          days_until_due: daysUntilDue,
          received_amount: receivedAmount,
          remaining_amount: Math.max(0, expectedAmount - receivedAmount),
          has_open_dispute: hasOpenDispute,
          dispute_id: dispute?.id || null,
        });
      }

      // Apply filters
      let filtered = items;
      if (filters?.status && filters.status !== "all") {
        filtered = filtered.filter(item => item.payout_status === filters.status);
      }
      if (filters?.otaSource && filters.otaSource !== "all") {
        filtered = filtered.filter(item => item.ota_source === filters.otaSource);
      }

      // Sort by priority: OVERDUE > HAS_ISSUE > ELIGIBLE > NOT_DUE > RECEIVED
      const statusPriority: Record<OtaPayoutStatus, number> = {
        OVERDUE: 1,
        HAS_ISSUE: 2,
        ELIGIBLE: 3,
        NOT_DUE: 4,
        RECEIVED: 5,
      };

      filtered.sort((a, b) => {
        const priorityDiff = statusPriority[a.payout_status] - statusPriority[b.payout_status];
        if (priorityDiff !== 0) return priorityDiff;
        // Secondary sort by days until due (most urgent first)
        return a.days_until_due - b.days_until_due;
      });

      return filtered;
    },
  });
}

// Get summary stats
export function useOtaPayoutTrackingStats() {
  const { data: items = [] } = useOtaPayoutTracking({ status: "all" });

  const stats = {
    notDue: items.filter(i => i.payout_status === "NOT_DUE"),
    eligible: items.filter(i => i.payout_status === "ELIGIBLE"),
    overdue: items.filter(i => i.payout_status === "OVERDUE"),
    hasIssue: items.filter(i => i.payout_status === "HAS_ISSUE"),
    received: items.filter(i => i.payout_status === "RECEIVED"),
  };

  return {
    notDueCount: stats.notDue.length,
    notDueAmount: stats.notDue.reduce((sum, i) => sum + i.remaining_amount, 0),
    eligibleCount: stats.eligible.length,
    eligibleAmount: stats.eligible.reduce((sum, i) => sum + i.remaining_amount, 0),
    overdueCount: stats.overdue.length,
    overdueAmount: stats.overdue.reduce((sum, i) => sum + i.remaining_amount, 0),
    hasIssueCount: stats.hasIssue.length,
    hasIssueAmount: stats.hasIssue.reduce((sum, i) => sum + i.remaining_amount, 0),
    receivedCount: stats.received.length,
    receivedAmount: stats.received.reduce((sum, i) => sum + i.received_amount, 0),
    totalPending: stats.notDue.length + stats.eligible.length + stats.overdue.length + stats.hasIssue.length,
    totalPendingAmount:
      stats.notDue.reduce((sum, i) => sum + i.remaining_amount, 0) +
      stats.eligible.reduce((sum, i) => sum + i.remaining_amount, 0) +
      stats.overdue.reduce((sum, i) => sum + i.remaining_amount, 0) +
      stats.hasIssue.reduce((sum, i) => sum + i.remaining_amount, 0),
  };
}

// Status display helpers
export const PAYOUT_STATUS_DISPLAY: Record<OtaPayoutStatus, { label: string; variant: string; description: string }> = {
  NOT_DUE: {
    label: "Chưa tới hạn",
    variant: "default",
    description: "Đã check-out, chưa tới kỳ payout OTA"
  },
  ELIGIBLE: {
    label: "Đủ điều kiện",
    variant: "info",
    description: "Đã tới kỳ payout, tiền chưa về"
  },
  OVERDUE: {
    label: "Quá hạn",
    variant: "danger",
    description: "Đã qua kỳ payout, tiền chưa về"
  },
  HAS_ISSUE: {
    label: "Có vấn đề",
    variant: "warning",
    description: "Tiền bị giữ/trừ hoặc đang có tranh chấp OTA"
  },
  RECEIVED: {
    label: "Đã nhận tiền",
    variant: "success",
    description: "OTA đã thanh toán"
  },
};

export const OTA_SOURCES = [
  { value: "BOOKING", label: "Booking.com", cycleDays: 14 },
  { value: "AGODA", label: "Agoda", cycleDays: 7 },
  { value: "EXPEDIA", label: "Expedia", cycleDays: 14 },
  { value: "AIRBNB", label: "Airbnb", cycleDays: 1 },
  { value: "CTRIP", label: "Trip.com / Ctrip", cycleDays: 14 },
  { value: "TRAVELOKA", label: "Traveloka", cycleDays: 7 },
  { value: "OTHER", label: "Khác", cycleDays: 14 },
];
