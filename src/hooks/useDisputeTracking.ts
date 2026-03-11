import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// === DISPUTE TRACKING ===
// Quản lý tranh chấp cho CẢ OTA Collect và Hotel Collect
// - OTA Collect: OTA giữ tiền, trừ tiền, yêu cầu hoàn
// - Hotel Collect: khách không trả, chargeback, yêu cầu hoàn

export type DisputeStatus =
  | "NEW"           // Mới phát sinh
  | "PROCESSING"    // Đang xử lý
  | "RESOLVED_WIN"  // Kết quả - Thu được tiền
  | "RESOLVED_LOSS" // Kết quả - Không thu được
  | "CLOSED";       // Đã kết thúc

export type DisputeCategory = "OTA_COLLECT" | "HOTEL_COLLECT";

// OTA Collect dispute types
export type OtaDisputeType =
  | "OTA_WITHHOLD"      // OTA giữ tiền
  | "OTA_DEDUCTION"     // OTA trừ tiền sau checkout
  | "OTA_NO_SHOW"       // OTA báo no-show
  | "OTA_COMPLAINT"     // Khách khiếu nại qua OTA
  | "OTA_REFUND";       // OTA yêu cầu hoàn tiền

// Hotel Collect dispute types
export type HotelDisputeType =
  | "GUEST_NONPAYMENT"  // Khách không thanh toán
  | "CHARGEBACK"        // Chargeback từ ngân hàng
  | "GUEST_REFUND"      // Khách yêu cầu hoàn tiền
  | "GUEST_COMPLAINT"   // Khách khiếu nại trực tiếp
  | "PAYMENT_DISPUTE";  // Tranh chấp thanh toán khác

export type DisputeType = OtaDisputeType | HotelDisputeType;

export interface Dispute {
  id: string;
  unified_booking_id: string;
  payout_id: string | null;
  dispute_type: string;
  amount_in_dispute: number;
  status: string;
  opened_at: string;
  closed_at: string | null;
  last_activity_at: string | null;
  resolution_note: string | null;
  assigned_to: string | null;
  created_by: string | null;
  // Enriched from booking
  ota_source?: string;
  guest_name?: string;
  ota_booking_code?: string;
  payment_type?: string;
  payout_code?: string;
}

// Status display helpers
export const DISPUTE_STATUS_DISPLAY: Record<DisputeStatus, { label: string; variant: string; description: string }> = {
  NEW: {
    label: "Mới phát sinh",
    variant: "warning",
    description: "Tranh chấp vừa được ghi nhận"
  },
  PROCESSING: {
    label: "Đang xử lý",
    variant: "info",
    description: "Đang xử lý tranh chấp"
  },
  RESOLVED_WIN: {
    label: "Thu được tiền",
    variant: "success",
    description: "Đã thu được tiền tranh chấp"
  },
  RESOLVED_LOSS: {
    label: "Không thu được",
    variant: "danger",
    description: "Không thu được tiền, Roomrise chịu thiệt"
  },
  CLOSED: {
    label: "Đã kết thúc",
    variant: "default",
    description: "Tranh chấp đã được xử lý xong"
  },
};

// OTA Collect dispute types
export const OTA_DISPUTE_TYPE_DISPLAY: Record<OtaDisputeType, { label: string; description: string }> = {
  OTA_WITHHOLD: {
    label: "OTA giữ tiền",
    description: "OTA không trả tiền dự kiến"
  },
  OTA_DEDUCTION: {
    label: "OTA trừ tiền",
    description: "OTA trừ tiền sau khi check-out"
  },
  OTA_NO_SHOW: {
    label: "No-show (OTA)",
    description: "OTA báo khách không đến"
  },
  OTA_COMPLAINT: {
    label: "Khiếu nại qua OTA",
    description: "Khách khiếu nại qua kênh OTA"
  },
  OTA_REFUND: {
    label: "OTA yêu cầu hoàn",
    description: "OTA yêu cầu hoàn tiền cho khách"
  },
};

// Hotel Collect dispute types
export const HOTEL_DISPUTE_TYPE_DISPLAY: Record<HotelDisputeType, { label: string; description: string }> = {
  GUEST_NONPAYMENT: {
    label: "Khách không thanh toán",
    description: "Khách không trả tiền khi check-out"
  },
  CHARGEBACK: {
    label: "Chargeback",
    description: "Ngân hàng yêu cầu hoàn tiền"
  },
  GUEST_REFUND: {
    label: "Khách yêu cầu hoàn",
    description: "Khách yêu cầu hoàn tiền trực tiếp"
  },
  GUEST_COMPLAINT: {
    label: "Khiếu nại trực tiếp",
    description: "Khách khiếu nại trực tiếp với Roomrise"
  },
  PAYMENT_DISPUTE: {
    label: "Tranh chấp khác",
    description: "Các vấn đề thanh toán khác"
  },
};

// Combined display
export const ALL_DISPUTE_TYPE_DISPLAY: Record<DisputeType, { label: string; description: string; category: DisputeCategory }> = {
  OTA_WITHHOLD: { ...OTA_DISPUTE_TYPE_DISPLAY.OTA_WITHHOLD, category: "OTA_COLLECT" },
  OTA_DEDUCTION: { ...OTA_DISPUTE_TYPE_DISPLAY.OTA_DEDUCTION, category: "OTA_COLLECT" },
  OTA_NO_SHOW: { ...OTA_DISPUTE_TYPE_DISPLAY.OTA_NO_SHOW, category: "OTA_COLLECT" },
  OTA_COMPLAINT: { ...OTA_DISPUTE_TYPE_DISPLAY.OTA_COMPLAINT, category: "OTA_COLLECT" },
  OTA_REFUND: { ...OTA_DISPUTE_TYPE_DISPLAY.OTA_REFUND, category: "OTA_COLLECT" },
  GUEST_NONPAYMENT: { ...HOTEL_DISPUTE_TYPE_DISPLAY.GUEST_NONPAYMENT, category: "HOTEL_COLLECT" },
  CHARGEBACK: { ...HOTEL_DISPUTE_TYPE_DISPLAY.CHARGEBACK, category: "HOTEL_COLLECT" },
  GUEST_REFUND: { ...HOTEL_DISPUTE_TYPE_DISPLAY.GUEST_REFUND, category: "HOTEL_COLLECT" },
  GUEST_COMPLAINT: { ...HOTEL_DISPUTE_TYPE_DISPLAY.GUEST_COMPLAINT, category: "HOTEL_COLLECT" },
  PAYMENT_DISPUTE: { ...HOTEL_DISPUTE_TYPE_DISPLAY.PAYMENT_DISPUTE, category: "HOTEL_COLLECT" },
};

// Mapping from old status to new status
const mapOldStatusToNew = (oldStatus: string): DisputeStatus => {
  switch (oldStatus) {
    case "OPEN":
    case "NEW":
      return "NEW";
    case "IN_REVIEW":
    case "PROCESSING":
      return "PROCESSING";
    case "WON":
    case "OTA_ACCEPTED":
    case "RESOLVED_WIN":
      return "RESOLVED_WIN";
    case "LOST":
    case "PARTIAL":
    case "OTA_REJECTED":
    case "RESOLVED_LOSS":
      return "RESOLVED_LOSS";
    case "CLOSED":
    case "CANCELLED":
      return "CLOSED";
    default:
      return oldStatus as DisputeStatus;
  }
};

// Mapping from old type to new type
const mapOldTypeToNew = (oldType: string): DisputeType => {
  switch (oldType) {
    case "WITHHOLD":
    case "OTA_WITHHOLD":
      return "OTA_WITHHOLD";
    case "DEDUCTION":
    case "OTA_DEDUCTION":
    case "OTHER":
      return "OTA_DEDUCTION";
    case "NO_SHOW":
    case "OTA_NO_SHOW":
      return "OTA_NO_SHOW";
    case "COMPLAINT":
    case "OTA_COMPLAINT":
      return "OTA_COMPLAINT";
    case "REFUND_REQUEST":
    case "CANCELLATION":
    case "OTA_REFUND":
      return "OTA_REFUND";
    case "GUEST_NONPAYMENT":
    case "CHARGEBACK":
    case "GUEST_REFUND":
    case "GUEST_COMPLAINT":
    case "PAYMENT_DISPUTE":
      return oldType as DisputeType;
    default:
      return "OTA_DEDUCTION";
  }
};

// Get category from booking payment_type
export const getCategoryFromPaymentType = (paymentType: string | undefined): DisputeCategory => {
  return paymentType === "HOTEL_COLLECT" ? "HOTEL_COLLECT" : "OTA_COLLECT";
};

// Fetch all disputes with booking info and payout info
// Filtered by An Gia Residences group
export function useDisputeTracking(filters?: {
  status?: DisputeStatus | "all";
  type?: DisputeType | "all";
  category?: DisputeCategory | "all";
  payoutId?: string;
  bookingId?: string;
}) {
  return useQuery({
    queryKey: ["dispute_tracking", filters],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let query = supabase
        .from("ota_disputes")
        .select("*")
        .order("opened_at", { ascending: false });

      if (filters?.payoutId) {
        query = query.eq("payout_id", filters.payoutId);
      }

      if (filters?.bookingId) {
        query = query.eq("unified_booking_id", filters.bookingId);
      }

      const { data: disputes, error } = await query;

      if (error) throw error;
      if (!disputes || disputes.length === 0) return [] as Dispute[];

      // Enrich with booking + payout info IN PARALLEL
      const bookingIds = [...new Set(disputes.map(d => d.unified_booking_id))];
      const payoutIds = [...new Set(disputes.filter(d => d.payout_id).map(d => d.payout_id))];

      const [{ data: bookings }, { data: payouts }] = await Promise.all([
        supabase
          .from("bookings_mirror")
          .select("unified_booking_id, ota_source, guest_name, ota_booking_code, payment_type")
          .in("unified_booking_id", bookingIds),
        payoutIds.length > 0
          ? supabase
            .from("ota_payouts")
            .select("id, ota_source, payout_period_from, payout_period_to")
            .in("id", payoutIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const bookingsMap = new Map(
        (bookings || []).map(b => [b.unified_booking_id, b])
      );

      const payoutsMap = new Map(
        (payouts || []).map(p => [p.id, p])
      );

      // Transform and filter
      let items = (disputes || []).map(d => {
        const booking = bookingsMap.get(d.unified_booking_id);
        const payout = d.payout_id ? payoutsMap.get(d.payout_id) : null;
        return {
          ...d,
          status: mapOldStatusToNew(d.status),
          dispute_type: mapOldTypeToNew(d.dispute_type),
          ota_source: booking?.ota_source,
          guest_name: booking?.guest_name,
          ota_booking_code: booking?.ota_booking_code,
          payment_type: booking?.payment_type,
          payout_code: payout ? `${payout.ota_source} ${payout.payout_period_from || ''}-${payout.payout_period_to || ''}` : null,
        };
      });

      // Apply filters
      if (filters?.status && filters.status !== "all") {
        items = items.filter(d => d.status === filters.status);
      }
      if (filters?.type && filters.type !== "all") {
        items = items.filter(d => d.dispute_type === filters.type);
      }
      if (filters?.category && filters.category !== "all") {
        items = items.filter(d => {
          const disputeType = ALL_DISPUTE_TYPE_DISPLAY[d.dispute_type as DisputeType];
          return disputeType?.category === filters.category;
        });
      }

      // Sort: open disputes first, then by last activity
      items.sort((a, b) => {
        const isAOpen = a.status === "NEW" || a.status === "PROCESSING";
        const isBOpen = b.status === "NEW" || b.status === "PROCESSING";
        if (isAOpen && !isBOpen) return -1;
        if (!isAOpen && isBOpen) return 1;
        return new Date(b.last_activity_at || b.opened_at).getTime() -
          new Date(a.last_activity_at || a.opened_at).getTime();
      });

      return items as Dispute[];
    },
  });
}

// Get stats
export function useDisputeStats() {
  const { data: disputes = [] } = useDisputeTracking({ status: "all" });

  const stats = {
    new: disputes.filter(d => d.status === "NEW"),
    processing: disputes.filter(d => d.status === "PROCESSING"),
    resolvedWin: disputes.filter(d => d.status === "RESOLVED_WIN"),
    resolvedLoss: disputes.filter(d => d.status === "RESOLVED_LOSS"),
    closed: disputes.filter(d => d.status === "CLOSED"),
  };

  // Category breakdown
  const otaDisputes = disputes.filter(d => {
    const typeInfo = ALL_DISPUTE_TYPE_DISPLAY[d.dispute_type as DisputeType];
    return typeInfo?.category === "OTA_COLLECT";
  });
  const hotelDisputes = disputes.filter(d => {
    const typeInfo = ALL_DISPUTE_TYPE_DISPLAY[d.dispute_type as DisputeType];
    return typeInfo?.category === "HOTEL_COLLECT";
  });

  return {
    openCount: stats.new.length + stats.processing.length,
    openAmount: [...stats.new, ...stats.processing].reduce((sum, d) => sum + Number(d.amount_in_dispute), 0),
    newCount: stats.new.length,
    processingCount: stats.processing.length,
    winCount: stats.resolvedWin.length,
    winAmount: stats.resolvedWin.reduce((sum, d) => sum + Number(d.amount_in_dispute), 0),
    lossCount: stats.resolvedLoss.length,
    lossAmount: stats.resolvedLoss.reduce((sum, d) => sum + Number(d.amount_in_dispute), 0),
    closedCount: stats.closed.length,
    totalLost: stats.resolvedLoss.reduce((sum, d) => sum + Number(d.amount_in_dispute), 0),
    // Category stats
    otaCount: otaDisputes.length,
    otaOpenCount: otaDisputes.filter(d => d.status === "NEW" || d.status === "PROCESSING").length,
    hotelCount: hotelDisputes.length,
    hotelOpenCount: hotelDisputes.filter(d => d.status === "NEW" || d.status === "PROCESSING").length,
  };
}

// Create dispute
export function useCreateDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      unified_booking_id: string;
      dispute_type: DisputeType;
      amount_in_dispute: number;
      note?: string;
      payout_id?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();

      const { data: dispute, error } = await supabase
        .from("ota_disputes")
        .insert({
          unified_booking_id: data.unified_booking_id,
          dispute_type: data.dispute_type,
          amount_in_dispute: data.amount_in_dispute,
          status: "OPEN", // Maps to NEW
          created_by: user?.user?.id,
          opened_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          resolution_note: data.note || null,
          payout_id: data.payout_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return dispute;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispute_tracking"] });
      queryClient.invalidateQueries({ queryKey: ["ota_disputes"] });
      queryClient.invalidateQueries({ queryKey: ["ota_dispute_tracking"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_tracking"] });
      toast.success("Đã tạo tranh chấp");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// Update dispute status
export function useUpdateDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      status: DisputeStatus;
      resolution_note?: string;
    }) => {
      // Map new status to old status for DB compatibility
      const dbStatus = data.status === "NEW" ? "OPEN" :
        data.status === "PROCESSING" ? "IN_REVIEW" :
          data.status === "RESOLVED_WIN" ? "WON" :
            data.status === "RESOLVED_LOSS" ? "LOST" :
              "CLOSED";

      const updateData: Record<string, unknown> = {
        status: dbStatus,
        resolution_note: data.resolution_note || null,
        last_activity_at: new Date().toISOString(),
      };

      if (data.status === "RESOLVED_WIN" || data.status === "RESOLVED_LOSS" || data.status === "CLOSED") {
        updateData.closed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("ota_disputes")
        .update(updateData)
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dispute_tracking"] });
      queryClient.invalidateQueries({ queryKey: ["ota_disputes"] });
      queryClient.invalidateQueries({ queryKey: ["ota_dispute_tracking"] });
      queryClient.invalidateQueries({ queryKey: ["ota_payout_tracking"] });
      toast.success("Đã cập nhật tranh chấp");
    },
    onError: (error: Error) => {
      toast.error("Lỗi: " + error.message);
    },
  });
}

// Re-export old hooks for backward compatibility
export {
  useDisputeTracking as useOtaDisputeTracking,
  useDisputeStats as useOtaDisputeStats,
  useCreateDispute as useCreateOtaDispute,
  useUpdateDispute as useUpdateOtaDispute,
};
export type { DisputeStatus as OtaDisputeStatus };
export type { Dispute as OtaDispute };
