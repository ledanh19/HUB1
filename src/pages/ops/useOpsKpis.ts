/**
 * useOpsKpis — extracted KPI computation logic from OpsOverviewPage.
 * Reusable hook, EXACT same logic as StaysPage.tsx lines 577-647.
 */

import { useMemo } from "react";
import type { StayWithBooking } from "@/lib/stays/fetchStaysOperations";

export type OpsStatusKey = "checkin_all" | "inhouse" | "checkout" | "new_booking" | "upcoming" | "overdue";

export function useOpsKpis(staysData: StayWithBooking[], today: string) {
  return useMemo(() => {
    const checkinAll: StayWithBooking[] = [];
    const inHouseList: StayWithBooking[] = [];
    const checkoutAll: StayWithBooking[] = [];
    const newBookings: StayWithBooking[] = [];
    const noRoomAll: StayWithBooking[] = [];
    const overdueAll: StayWithBooking[] = [];
    const seenNoRoom = new Set<string>();

    for (const s of staysData) {
      if (!s.booking) continue;

      if (s.booking?.booking_created_at === today) {
        newBookings.push(s);
      }

      if (s.booking.booking_status === "CANCELLED" || s.booking.booking_status === "NO_SHOW") continue;

      const hasSegment = !!s.segment;
      const checkedInAt = s.actual_check_in_at;
      const checkedOutAt = s.actual_check_out_at;

      const segmentDateFrom = s.segment?.date_from?.split("T")[0];
      if (hasSegment ? segmentDateFrom === today : s.booking.check_in_date === today) {
        checkinAll.push(s);
      }

      if (checkedInAt && !checkedOutAt) {
        inHouseList.push(s);
      }

      if (hasSegment) {
        const segmentDateTo = s.segment?.date_to?.split("T")[0];
        const checkOutDateForKpi = segmentDateTo || s.booking.check_out_date;
        if (checkOutDateForKpi === today) {
          checkoutAll.push(s);
        }
      }

      if (!seenNoRoom.has(s.unified_booking_id)) {
        const isComplete = s.coverage?.isComplete ?? false;
        if (!isComplete) {
          seenNoRoom.add(s.unified_booking_id);
          noRoomAll.push(s);
        }
      }

      if (s.booking?.payment_type === "HOTEL_COLLECT") {
        const remaining = (s.booking?.total_amount_net || 0) - s.amount_collected;
        if (remaining > 0 && s.booking?.check_out_date && s.booking.check_out_date < today) {
          overdueAll.push(s);
        }
      }
    }

    const todayMs = new Date().setHours(0, 0, 0, 0);
    const filteredNoRoom = noRoomAll.filter(s => {
      if (!s.booking?.check_in_date) return false;
      const checkInMs = new Date(s.booking.check_in_date + "T00:00:00").getTime();
      const diffDays = Math.floor((checkInMs - todayMs) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });

    return { checkinAll, inHouseList, checkoutAll, newBookings, filteredNoRoom, overdueAll };
  }, [staysData, today]);
}
