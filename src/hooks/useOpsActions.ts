/**
 * OPS ACTIONS HOOK
 * ================
 * 
 * Centralized hook for all Ops actions with:
 * - Optimistic UI updates (<200ms perceived)
 * - Partial invalidation (no full list refetch)
 * - Settlement lock checking
 * - Audit logging
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "./useAuditLog";

// =============== TYPES ===============

interface OptimisticContext {
  previousData: Map<string, unknown>;
  unifiedBookingId: string;
}

interface CheckInPayload {
  unifiedBookingId: string;
  stayId: string;
  actualCheckInAt: string;
  note?: string;
  segmentId?: string;
  hasDocument: boolean;
}

interface CheckOutPayload {
  unifiedBookingId: string;
  stayId: string;
  actualCheckOutAt: string;
  note?: string;
}

interface CorrectionPayload {
  unifiedBookingId: string;
  stayId: string;
  correctionType: "UNDO_CHECK_IN" | "UNDO_CHECK_OUT";
  reason: string;
  currentStatus: string;
}

// =============== HELPER: Optimistic Update ===============

function createOptimisticContext(
  queryClient: ReturnType<typeof useQueryClient>,
  unifiedBookingId: string
): OptimisticContext {
  const queryKeys = [
    ["stays_with_bookings"],
    ["stays_operations"],
    ["stays"],
    ["stay_record", unifiedBookingId],
    ["booking_detail", unifiedBookingId],
    ["unified_bookings"],
  ];

  const previousData = new Map<string, unknown>();

  // Cancel ongoing queries and snapshot
  queryKeys.forEach(key => {
    queryClient.cancelQueries({ queryKey: key });
    const keyStr = JSON.stringify(key);
    previousData.set(keyStr, queryClient.getQueryData(key));
  });

  return { previousData, unifiedBookingId };
}

function applyOptimisticUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  unifiedBookingId: string,
  updates: Record<string, unknown>
) {
  const updateInList = (oldData: unknown) => {
    if (!oldData || !Array.isArray(oldData)) return oldData;
    return oldData.map((item: Record<string, unknown>) =>
      item.unified_booking_id === unifiedBookingId
        ? { ...item, ...updates, _isOptimistic: true, _isProcessing: true }
        : item
    );
  };

  // Apply to all list queries
  queryClient.setQueryData(["stays_with_bookings"], updateInList);
  queryClient.setQueryData(["stays_operations"], updateInList);
  queryClient.setQueryData(["stays"], updateInList);
  queryClient.setQueryData(["unified_bookings"], updateInList);

  // Apply to single record queries
  queryClient.setQueryData(["stay_record", unifiedBookingId], (old: unknown) => {
    if (!old || typeof old !== "object") return old;
    return { ...(old as Record<string, unknown>), ...updates, _isOptimistic: true };
  });

  queryClient.setQueryData(["booking_detail", unifiedBookingId], (old: unknown) => {
    if (!old || typeof old !== "object") return old;
    return { ...(old as Record<string, unknown>), ...updates, _isOptimistic: true };
  });
}

function rollbackOptimistic(
  queryClient: ReturnType<typeof useQueryClient>,
  context: OptimisticContext
) {
  context.previousData.forEach((data, keyStr) => {
    const key = JSON.parse(keyStr);
    if (data !== undefined) {
      queryClient.setQueryData(key, data);
    }
  });
}

function partialInvalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  unifiedBookingId: string
) {
  // High priority: immediate (100ms)
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
    queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
    queryClient.invalidateQueries({ queryKey: ["stays"] });
    queryClient.invalidateQueries({ queryKey: ["stay_record", unifiedBookingId] });
    queryClient.invalidateQueries({ queryKey: ["booking_detail", unifiedBookingId] });
  }, 100);

  // Low priority: delayed (500-1500ms)
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
    queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", unifiedBookingId] });
  }, 500);

  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
  }, 1500);
}

// =============== HOOKS ===============

/**
 * Optimistic Check-in mutation
 */
export function useOptimisticCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CheckInPayload) => {
      const { unifiedBookingId, stayId, actualCheckInAt, note, segmentId, hasDocument } = payload;
      const isNewStay = stayId === unifiedBookingId;

      if (isNewStay) {
        const { error } = await supabase
          .from("stays")
          .insert({
            unified_booking_id: unifiedBookingId,
            stay_status: "CHECKED_IN",
            actual_check_in_at: actualCheckInAt,
            operation_note: note || null,
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("stays")
          .update({
            stay_status: "CHECKED_IN",
            actual_check_in_at: actualCheckInAt,
            operation_note: note || null,
          })
          .eq("id", stayId);
        if (error) throw error;
      }

      // Update manual_bookings if exists
      await supabase
        .from("manual_bookings")
        .update({ booking_status: "CHECKED_IN" })
        .eq("unified_booking_id", unifiedBookingId);

      // Sync host_supply_segments for dashboard SOT consistency
      if (segmentId) {
        await supabase
          .from("host_supply_segments")
          .update({ actual_check_in_at: actualCheckInAt } as any)
          .eq("id", segmentId);
      } else {
        await supabase
          .from("host_supply_segments")
          .update({ actual_check_in_at: actualCheckInAt } as any)
          .eq("unified_booking_id", unifiedBookingId)
          .is("actual_check_in_at", null);
      }

      // Audit log (fire-and-forget)
      createAuditLog({
        action: AuditActions.CHECK_IN,
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          stay_status: "CHECKED_IN",
          actual_check_in_at: actualCheckInAt,
          segment_id: segmentId,
          has_document: hasDocument,
          docs_missing: !hasDocument,
        },
      }).catch(console.error);

      return { unifiedBookingId, actualCheckInAt, hasDocument };
    },

    onMutate: async (payload) => {
      const context = createOptimisticContext(queryClient, payload.unifiedBookingId);

      applyOptimisticUpdate(queryClient, payload.unifiedBookingId, {
        stay_status: "CHECKED_IN",
        actual_check_in_at: payload.actualCheckInAt,
      });

      return context;
    },

    onSuccess: (result) => {
      if (result.hasDocument) {
        toast.success("Nhận phòng thành công!");
      } else {
        toast.warning("Nhận phòng thành công! ⚠️ Nhớ tải CCCD trước khi hoàn tất lưu trú.", {
          duration: 5000,
        });
      }
      partialInvalidate(queryClient, result.unifiedBookingId);
    },

    onError: (error, payload, context) => {
      if (context) {
        rollbackOptimistic(queryClient, context);
      }
      toast.error("Lỗi check-in: " + (error as Error).message);
    },
  });
}

/**
 * Optimistic Check-out mutation
 */
export function useOptimisticCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CheckOutPayload) => {
      const { unifiedBookingId, stayId, actualCheckOutAt, note } = payload;

      const { error } = await supabase
        .from("stays")
        .update({
          stay_status: "CHECKED_OUT",
          actual_check_out_at: actualCheckOutAt,
          operation_note: note || null,
        })
        .eq("id", stayId);

      if (error) throw error;

      await supabase
        .from("manual_bookings")
        .update({ booking_status: "CHECKED_OUT" })
        .eq("unified_booking_id", unifiedBookingId);

      // Sync host_supply_segments for dashboard SOT consistency
      await supabase
        .from("host_supply_segments")
        .update({ actual_check_out_at: actualCheckOutAt } as any)
        .eq("unified_booking_id", unifiedBookingId)
        .is("actual_check_out_at", null);

      createAuditLog({
        action: AuditActions.CHECK_OUT,
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          stay_status: "CHECKED_OUT",
          actual_check_out_at: actualCheckOutAt,
        },
      }).catch(console.error);

      return { unifiedBookingId, actualCheckOutAt };
    },

    onMutate: async (payload) => {
      const context = createOptimisticContext(queryClient, payload.unifiedBookingId);

      applyOptimisticUpdate(queryClient, payload.unifiedBookingId, {
        stay_status: "CHECKED_OUT",
        actual_check_out_at: payload.actualCheckOutAt,
      });

      return context;
    },

    onSuccess: (result) => {
      toast.success("Trả phòng thành công!");
      partialInvalidate(queryClient, result.unifiedBookingId);
    },

    onError: (error, payload, context) => {
      if (context) {
        rollbackOptimistic(queryClient, context);
      }
      toast.error("Lỗi check-out: " + (error as Error).message);
    },
  });
}

/**
 * Correction mutation (undo with audit)
 */
export function useOpsCorrection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CorrectionPayload) => {
      const { unifiedBookingId, stayId, correctionType, reason, currentStatus } = payload;
      const isUndoCheckIn = correctionType === "UNDO_CHECK_IN";

      // Check for settlement lock first
      const { data: segments } = await supabase
        .from("host_supply_segments")
        .select("settlement_id, locked_at")
        .eq("unified_booking_id", unifiedBookingId);

      if (segments?.some(s => s.settlement_id || s.locked_at)) {
        throw new Error("Không thể correction - Segment đã được settlement. Liên hệ Admin.");
      }

      const newStatus = isUndoCheckIn ? "WAIT_ROOM" as const : "CHECKED_IN" as const;
      const updateData = isUndoCheckIn
        ? { stay_status: "WAIT_ROOM" as const, actual_check_in_at: null }
        : { stay_status: "CHECKED_IN" as const, actual_check_out_at: null };

      const { error } = await supabase
        .from("stays")
        .update(updateData)
        .eq("id", stayId);

      if (error) throw error;

      const bookingStatus = isUndoCheckIn ? "CONFIRMED" : "CHECKED_IN";
      await supabase
        .from("manual_bookings")
        .update({ booking_status: bookingStatus })
        .eq("unified_booking_id", unifiedBookingId);

      // Sync host_supply_segments for dashboard SOT consistency
      if (isUndoCheckIn) {
        await supabase
          .from("host_supply_segments")
          .update({ actual_check_in_at: null, checked_in_by: null } as any)
          .eq("unified_booking_id", unifiedBookingId);
      } else {
        await supabase
          .from("host_supply_segments")
          .update({ actual_check_out_at: null, checked_out_by: null } as any)
          .eq("unified_booking_id", unifiedBookingId);
      }

      // Critical: Audit log with reason
      await createAuditLog({
        action: correctionType,
        entity: "booking",
        entityId: unifiedBookingId,
        beforeData: { stay_status: currentStatus },
        afterData: {
          stay_status: newStatus,
          correction_reason: reason,
          corrected_at: new Date().toISOString(),
        },
      });

      return { unifiedBookingId, newStatus, correctionType };
    },

    onMutate: async (payload) => {
      const context = createOptimisticContext(queryClient, payload.unifiedBookingId);

      const newStatus = payload.correctionType === "UNDO_CHECK_IN" ? "WAIT_ROOM" : "CHECKED_IN";
      applyOptimisticUpdate(queryClient, payload.unifiedBookingId, {
        stay_status: newStatus,
        ...(payload.correctionType === "UNDO_CHECK_IN"
          ? { actual_check_in_at: null }
          : { actual_check_out_at: null }
        ),
      });

      return context;
    },

    onSuccess: (result) => {
      const actionLabel = result.correctionType === "UNDO_CHECK_IN"
        ? "Huỷ Check-in"
        : "Huỷ Check-out";
      toast.success(`${actionLabel} thành công. Lý do đã được ghi nhận.`);
      partialInvalidate(queryClient, result.unifiedBookingId);
    },

    onError: (error, payload, context) => {
      if (context) {
        rollbackOptimistic(queryClient, context);
      }
      toast.error("Lỗi correction: " + (error as Error).message);
    },
  });
}

/**
 * Check if any segment for a booking is settlement-locked
 */
export function useCheckSettlementLock(unifiedBookingId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("host_supply_segments")
        .select("id, settlement_id, locked_at")
        .eq("unified_booking_id", unifiedBookingId);

      if (error) throw error;

      const lockedSegments = data?.filter(s => s.settlement_id || s.locked_at) || [];
      return {
        isLocked: lockedSegments.length > 0,
        lockedCount: lockedSegments.length,
        lockedIds: lockedSegments.map(s => s.id),
      };
    },
  });
}
