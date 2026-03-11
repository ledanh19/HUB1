import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "./useAuditLog";

// === HELPER: Optimistic update for stays queries ===
type StayStatus = "WAIT_ROOM" | "CHECKED_IN" | "CHECKED_OUT" | "NO_SHOW";

interface OptimisticStayContext {
  previousStays?: unknown;
  previousStaysOps?: unknown;
  previousStaysWithBookings?: unknown;
  previousStayRecord?: unknown;
  previousUnifiedBookings?: unknown;
  previousBookingDetail?: unknown;
}

function applyOptimisticStayUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  unifiedBookingId: string,
  newStatus: StayStatus,
  extraFields?: Record<string, unknown>
): OptimisticStayContext {
  // Cancel any outgoing refetches to prevent race conditions
  queryClient.cancelQueries({ queryKey: ["stays"] });
  queryClient.cancelQueries({ queryKey: ["stays_operations"] });
  queryClient.cancelQueries({ queryKey: ["stays_with_bookings"] });
  queryClient.cancelQueries({ queryKey: ["unified_bookings"] });

  // Snapshot previous values for rollback
  const previousStays = queryClient.getQueryData(["stays"]);
  const previousStaysOps = queryClient.getQueryData(["stays_operations"]);
  const previousStaysWithBookings = queryClient.getQueryData(["stays_with_bookings"]);
  const previousStayRecord = queryClient.getQueryData(["stay_record", unifiedBookingId]);
  const previousUnifiedBookings = queryClient.getQueryData(["unified_bookings"]);
  const previousBookingDetail = queryClient.getQueryData(["booking_detail", unifiedBookingId]);

  // Optimistic update helper
  const updateStayInList = (oldData: unknown) => {
    if (!oldData || !Array.isArray(oldData)) return oldData;
    return oldData.map((item: Record<string, unknown>) =>
      item.unified_booking_id === unifiedBookingId
        ? { ...item, stay_status: newStatus, _isOptimistic: true, ...extraFields }
        : item
    );
  };

  // Apply optimistic updates to all relevant queries
  queryClient.setQueryData(["stays"], updateStayInList);
  queryClient.setQueryData(["stays_with_bookings"], updateStayInList);
  queryClient.setQueryData(["unified_bookings"], updateStayInList);

  // Update stays_operations with partial match (matches any date param)
  queryClient.setQueriesData({ queryKey: ["stays_operations"], exact: false }, updateStayInList);

  // Update single record if exists
  queryClient.setQueryData(["stay_record", unifiedBookingId], (old: unknown) => {
    if (!old || typeof old !== "object") return old;
    return { ...(old as Record<string, unknown>), stay_status: newStatus, _isOptimistic: true, ...extraFields };
  });

  queryClient.setQueryData(["booking_detail", unifiedBookingId], (old: unknown) => {
    if (!old || typeof old !== "object") return old;
    return { ...(old as Record<string, unknown>), stay_status: newStatus, _isOptimistic: true, ...extraFields };
  });

  return {
    previousStays,
    previousStaysOps,
    previousStaysWithBookings,
    previousStayRecord,
    previousUnifiedBookings,
    previousBookingDetail,
  };
}

function rollbackOptimisticStayUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  unifiedBookingId: string,
  context: OptimisticStayContext
) {
  if (context.previousStays !== undefined) {
    queryClient.setQueryData(["stays"], context.previousStays);
  }
  if (context.previousStaysOps !== undefined) {
    queryClient.setQueryData(["stays_operations"], context.previousStaysOps);
  }
  if (context.previousStaysWithBookings !== undefined) {
    queryClient.setQueryData(["stays_with_bookings"], context.previousStaysWithBookings);
  }
  if (context.previousStayRecord !== undefined) {
    queryClient.setQueryData(["stay_record", unifiedBookingId], context.previousStayRecord);
  }
  if (context.previousUnifiedBookings !== undefined) {
    queryClient.setQueryData(["unified_bookings"], context.previousUnifiedBookings);
  }
  if (context.previousBookingDetail !== undefined) {
    queryClient.setQueryData(["booking_detail", unifiedBookingId], context.previousBookingDetail);
  }
}

function partialInvalidateAfterStayUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  unifiedBookingId: string
) {
  // High priority: Invalidate single-record queries immediately (no delay needed)
  queryClient.invalidateQueries({ queryKey: ["stay_record", unifiedBookingId] });
  queryClient.invalidateQueries({ queryKey: ["booking_detail", unifiedBookingId] });

  // Medium priority: Invalidate list queries after short delay (allow optimistic UI to settle)
  setTimeout(() => {
    // Use partial match to invalidate all stays_operations queries regardless of date param
    queryClient.invalidateQueries({ queryKey: ["stays"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["stays_operations"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["unified_bookings"], exact: false });
  }, 500);

  // Low priority: Invalidate dashboard/audit after longer delay
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", unifiedBookingId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
    queryClient.invalidateQueries({ queryKey: ["host_payables"] });
  }, 1500);
}

// === useCheckIn with Optimistic Update ===
export function useCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unifiedBookingId: string) => {
      // Get current status for audit (non-blocking)
      const { data: currentStay } = await supabase
        .from("stays")
        .select("stay_status")
        .eq("unified_booking_id", unifiedBookingId)
        .maybeSingle();

      const now = new Date().toISOString();

      // Update stay status
      const { error: stayError } = await supabase
        .from("stays")
        .update({
          stay_status: "CHECKED_IN",
          actual_check_in_at: now,
        })
        .eq("unified_booking_id", unifiedBookingId);

      if (stayError) throw stayError;

      // Update booking status in manual_bookings if exists
      await supabase
        .from("manual_bookings")
        .update({ booking_status: "CHECKED_IN" })
        .eq("unified_booking_id", unifiedBookingId);

      // Sync host_supply_segments for dashboard SOT consistency
      await supabase
        .from("host_supply_segments")
        .update({ actual_check_in_at: now })
        .eq("unified_booking_id", unifiedBookingId)
        .is("actual_check_in_at", null);

      // Create audit log (fire-and-forget, don't block)
      createAuditLog({
        action: AuditActions.CHECK_IN,
        entity: "booking",
        entityId: unifiedBookingId,
        beforeData: { stay_status: currentStay?.stay_status },
        afterData: { stay_status: "CHECKED_IN", actual_check_in_at: now },
      }).catch(console.error);

      return { unifiedBookingId, actual_check_in_at: now };
    },
    onMutate: async (unifiedBookingId) => {
      const context = applyOptimisticStayUpdate(queryClient, unifiedBookingId, "CHECKED_IN", {
        actual_check_in_at: new Date().toISOString(),
      });
      return { ...context, unifiedBookingId };
    },
    onSuccess: (data) => {
      toast.success("Nhận phòng thành công");
      partialInvalidateAfterStayUpdate(queryClient, data.unifiedBookingId);
    },
    onError: (error, unifiedBookingId, context) => {
      if (context) {
        rollbackOptimisticStayUpdate(queryClient, unifiedBookingId, context);
      }
      toast.error("Lỗi check-in: " + error.message);
    },
  });
}

// === useUndoCheckIn with Optimistic Update ===
export function useUndoCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unifiedBookingId: string) => {
      const { data: currentStay } = await supabase
        .from("stays")
        .select("stay_status")
        .eq("unified_booking_id", unifiedBookingId)
        .maybeSingle();

      const { error: stayError } = await supabase
        .from("stays")
        .update({
          stay_status: "WAIT_ROOM",
          actual_check_in_at: null,
        })
        .eq("unified_booking_id", unifiedBookingId);

      if (stayError) throw stayError;

      await supabase
        .from("manual_bookings")
        .update({ booking_status: "CONFIRMED" })
        .eq("unified_booking_id", unifiedBookingId);

      // Sync host_supply_segments for dashboard SOT consistency
      await supabase
        .from("host_supply_segments")
        .update({ actual_check_in_at: null })
        .eq("unified_booking_id", unifiedBookingId);

      createAuditLog({
        action: "Hoàn tác Check-in",
        entity: "booking",
        entityId: unifiedBookingId,
        beforeData: { stay_status: currentStay?.stay_status },
        afterData: { stay_status: "WAIT_ROOM" },
      }).catch(console.error);

      return { unifiedBookingId };
    },
    onMutate: async (unifiedBookingId) => {
      const context = applyOptimisticStayUpdate(queryClient, unifiedBookingId, "WAIT_ROOM", {
        actual_check_in_at: null,
      });
      return { ...context, unifiedBookingId };
    },
    onSuccess: (data) => {
      toast.success("Đã hoàn tác Check-in");
      partialInvalidateAfterStayUpdate(queryClient, data.unifiedBookingId);
    },
    onError: (error, unifiedBookingId, context) => {
      if (context) {
        rollbackOptimisticStayUpdate(queryClient, unifiedBookingId, context);
      }
      toast.error("Lỗi hoàn tác: " + error.message);
    },
  });
}

// === useCheckOut with Optimistic Update ===
export function useCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unifiedBookingId: string) => {
      // Get current status for audit
      const { data: currentStay } = await supabase
        .from("stays")
        .select("stay_status")
        .eq("unified_booking_id", unifiedBookingId)
        .maybeSingle();

      const now = new Date().toISOString();

      // Update stay status
      const { error: stayError } = await supabase
        .from("stays")
        .update({
          stay_status: "CHECKED_OUT",
          actual_check_out_at: now,
        })
        .eq("unified_booking_id", unifiedBookingId);

      if (stayError) throw stayError;

      // Update booking status in manual_bookings if exists
      await supabase
        .from("manual_bookings")
        .update({ booking_status: "CHECKED_OUT" })
        .eq("unified_booking_id", unifiedBookingId);

      // Sync host_supply_segments for dashboard SOT consistency
      await supabase
        .from("host_supply_segments")
        .update({ actual_check_out_at: now })
        .eq("unified_booking_id", unifiedBookingId)
        .is("actual_check_out_at", null);

      // Create audit log (fire-and-forget)
      createAuditLog({
        action: AuditActions.CHECK_OUT,
        entity: "booking",
        entityId: unifiedBookingId,
        beforeData: { stay_status: currentStay?.stay_status },
        afterData: { stay_status: "CHECKED_OUT", actual_check_out_at: now },
      }).catch(console.error);

      return { unifiedBookingId, actual_check_out_at: now };
    },
    onMutate: async (unifiedBookingId) => {
      const context = applyOptimisticStayUpdate(queryClient, unifiedBookingId, "CHECKED_OUT", {
        actual_check_out_at: new Date().toISOString(),
      });
      return { ...context, unifiedBookingId };
    },
    onSuccess: (data) => {
      toast.success("Trả phòng thành công");
      partialInvalidateAfterStayUpdate(queryClient, data.unifiedBookingId);
    },
    onError: (error, unifiedBookingId, context) => {
      if (context) {
        rollbackOptimisticStayUpdate(queryClient, unifiedBookingId, context);
      }
      toast.error("Lỗi check-out: " + error.message);
    },
  });
}

// === useUndoCheckOut with Optimistic Update ===
export function useUndoCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unifiedBookingId: string) => {
      const { data: currentStay } = await supabase
        .from("stays")
        .select("stay_status")
        .eq("unified_booking_id", unifiedBookingId)
        .maybeSingle();

      const { error: stayError } = await supabase
        .from("stays")
        .update({
          stay_status: "CHECKED_IN",
          actual_check_out_at: null,
        })
        .eq("unified_booking_id", unifiedBookingId);

      if (stayError) throw stayError;

      await supabase
        .from("manual_bookings")
        .update({ booking_status: "CHECKED_IN" })
        .eq("unified_booking_id", unifiedBookingId);

      // Sync host_supply_segments for dashboard SOT consistency
      await supabase
        .from("host_supply_segments")
        .update({ actual_check_out_at: null })
        .eq("unified_booking_id", unifiedBookingId);

      createAuditLog({
        action: "Hoàn tác Check-out",
        entity: "booking",
        entityId: unifiedBookingId,
        beforeData: { stay_status: currentStay?.stay_status },
        afterData: { stay_status: "CHECKED_IN" },
      }).catch(console.error);

      return { unifiedBookingId };
    },
    onMutate: async (unifiedBookingId) => {
      const context = applyOptimisticStayUpdate(queryClient, unifiedBookingId, "CHECKED_IN", {
        actual_check_out_at: null,
      });
      return { ...context, unifiedBookingId };
    },
    onSuccess: (data) => {
      toast.success("Đã hoàn tác Check-out");
      partialInvalidateAfterStayUpdate(queryClient, data.unifiedBookingId);
    },
    onError: (error, unifiedBookingId, context) => {
      if (context) {
        rollbackOptimisticStayUpdate(queryClient, unifiedBookingId, context);
      }
      toast.error("Lỗi hoàn tác: " + error.message);
    },
  });
}

// === useMarkNoShow with Optimistic Update ===
export function useMarkNoShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unifiedBookingId: string) => {
      // Get current status for audit
      const { data: currentStay } = await supabase
        .from("stays")
        .select("stay_status")
        .eq("unified_booking_id", unifiedBookingId)
        .maybeSingle();

      // Update stay status
      const { error: stayError } = await supabase
        .from("stays")
        .update({ stay_status: "NO_SHOW" })
        .eq("unified_booking_id", unifiedBookingId);

      if (stayError) throw stayError;

      // Update booking status in manual_bookings if exists
      await supabase
        .from("manual_bookings")
        .update({ booking_status: "NO_SHOW" })
        .eq("unified_booking_id", unifiedBookingId);

      // Create audit log (fire-and-forget)
      createAuditLog({
        action: AuditActions.NO_SHOW,
        entity: "booking",
        entityId: unifiedBookingId,
        beforeData: { stay_status: currentStay?.stay_status },
        afterData: { stay_status: "NO_SHOW" },
      }).catch(console.error);

      return { unifiedBookingId };
    },
    onMutate: async (unifiedBookingId) => {
      const context = applyOptimisticStayUpdate(queryClient, unifiedBookingId, "NO_SHOW");
      return { ...context, unifiedBookingId };
    },
    onSuccess: (data) => {
      toast.success("Đã đánh dấu No-show");
      partialInvalidateAfterStayUpdate(queryClient, data.unifiedBookingId);
    },
    onError: (error, unifiedBookingId, context) => {
      if (context) {
        rollbackOptimisticStayUpdate(queryClient, unifiedBookingId, context);
      }
      toast.error("Lỗi: " + error.message);
    },
  });
}

// === useUndoNoShow with Optimistic Update ===
export function useUndoNoShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (unifiedBookingId: string) => {
      const { data: currentStay } = await supabase
        .from("stays")
        .select("stay_status, host_room_id")
        .eq("unified_booking_id", unifiedBookingId)
        .maybeSingle();

      // Restore to WAIT_ROOM or CONFIRMED based on room assignment
      const newStatus = currentStay?.host_room_id ? "WAIT_ROOM" : "WAIT_ROOM";

      const { error: stayError } = await supabase
        .from("stays")
        .update({ stay_status: newStatus })
        .eq("unified_booking_id", unifiedBookingId);

      if (stayError) throw stayError;

      await supabase
        .from("manual_bookings")
        .update({ booking_status: "CONFIRMED" })
        .eq("unified_booking_id", unifiedBookingId);

      createAuditLog({
        action: "Hoàn tác No-show",
        entity: "booking",
        entityId: unifiedBookingId,
        beforeData: { stay_status: currentStay?.stay_status },
        afterData: { stay_status: newStatus },
      }).catch(console.error);

      return { unifiedBookingId };
    },
    onMutate: async (unifiedBookingId) => {
      const context = applyOptimisticStayUpdate(queryClient, unifiedBookingId, "WAIT_ROOM");
      return { ...context, unifiedBookingId };
    },
    onSuccess: (data) => {
      toast.success("Đã hoàn tác No-show");
      partialInvalidateAfterStayUpdate(queryClient, data.unifiedBookingId);
    },
    onError: (error, unifiedBookingId, context) => {
      if (context) {
        rollbackOptimisticStayUpdate(queryClient, unifiedBookingId, context);
      }
      toast.error("Lỗi hoàn tác: " + error.message);
    },
  });
}
