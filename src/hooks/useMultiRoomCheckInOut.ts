/**
 * MULTI-ROOM CHECK-IN/OUT HOOK
 * ============================
 * 
 * Supports partial check-in/out for multi-room bookings with:
 * - Target-based operations (room_line_id + segment_id)
 * - Partial status tracking per room line
 * - SOT: host_supply_segments.actual_check_in_at/actual_check_out_at
 * - Aggregated status at stays level
 * 
 * GOLDEN RULES:
 * - NON-BREAKING: Works alongside existing single-segment flow
 * - SOT: host_supply_segments for per-room tracking
 * - PARTIAL: Supports checking in/out subset of room lines
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createAuditLog, AuditActions } from "./useAuditLog";

// =============== TYPES ===============

export interface CheckInTarget {
  segment_id: string;
  room_line_index: number;
}

export interface CheckOutTarget {
  segment_id: string;
  room_line_index: number;
}

export interface MultiRoomCheckInPayload {
  unifiedBookingId: string;
  stayId: string;
  targets: CheckInTarget[];
  actualCheckInAt: string;
  note?: string;
  hasDocument: boolean;
}

export interface MultiRoomCheckOutPayload {
  unifiedBookingId: string;
  stayId: string;
  targets: CheckOutTarget[];
  actualCheckOutAt: string;
  note?: string;
  skipInfo?: Record<string, unknown>;
}

export interface MultiRoomCheckResult {
  unifiedBookingId: string;
  totalLines: number;
  checkedInLines: number;
  checkedOutLines: number;
  isPartial: boolean;
  timestamp: string;
}

export interface RoomLineStatus {
  roomLineIndex: number;
  segmentId: string | null;
  segmentPartnerName: string | null;
  hostPropertyName: string | null;
  hostRoomType: string | null;
  dateFrom: string;
  dateTo: string;
  nights: number;
  actualCheckInAt: string | null;
  actualCheckOutAt: string | null;
  checkedInBy: string | null;
  checkedOutBy: string | null;
  status: 'NOT_ASSIGNED' | 'ASSIGNED' | 'CHECKED_IN' | 'CHECKED_OUT';
  canCheckIn: boolean;
  canCheckOut: boolean;
  blockReason?: string;
}

// =============== HELPER FUNCTIONS ===============

/**
 * Determine aggregated stay status from segment statuses
 */
function determineAggregatedStatus(
  segments: { actual_check_in_at: string | null; actual_check_out_at: string | null }[]
): 'WAIT_ROOM' | 'CHECKED_IN' | 'IN_HOUSE' | 'CHECKED_OUT' | 'PARTIAL_IN' | 'PARTIAL_OUT' {
  if (segments.length === 0) return 'WAIT_ROOM';

  const checkedIn = segments.filter(s => s.actual_check_in_at && !s.actual_check_out_at);
  const checkedOut = segments.filter(s => s.actual_check_out_at);
  const notCheckedIn = segments.filter(s => !s.actual_check_in_at);

  // All checked out
  if (checkedOut.length === segments.length) return 'CHECKED_OUT';

  // All checked in (none checked out)
  if (checkedIn.length === segments.length) return 'CHECKED_IN';

  // Some checked out, some still in
  if (checkedOut.length > 0 && checkedIn.length > 0) return 'PARTIAL_OUT';

  // Some checked in, some not yet
  if (checkedIn.length > 0 && notCheckedIn.length > 0) return 'PARTIAL_IN';

  // All checked in
  if (checkedIn.length > 0) return 'IN_HOUSE';

  return 'WAIT_ROOM';
}

/**
 * Map segment to room line status
 */
export function mapSegmentToRoomLineStatus(
  segment: {
    id: string;
    room_line_index: number;
    partner_id: string;
    host_property_name: string | null;
    host_room_type: string | null;
    room_code?: string | null;
    date_from: string;
    date_to: string;
    nights: number;
    actual_check_in_at: string | null;
    actual_check_out_at: string | null;
    checked_in_by: string | null;
    checked_out_by: string | null;
    host_room_id: string | null;
    partner?: { partner_name: string } | null;
  }
): RoomLineStatus {
  // FIXED: Check for room assignment using multiple indicators
  // Some workflows set room_code/host_property_name without setting host_room_id
  // A segment is considered "assigned" if it has partner_id AND (host_room_id OR room_code OR host_property_name)
  const hasRoom = !!segment.partner_id && (
    !!segment.host_room_id ||
    !!segment.room_code ||
    !!segment.host_property_name
  );
  const isCheckedIn = !!segment.actual_check_in_at;
  const isCheckedOut = !!segment.actual_check_out_at;

  let status: RoomLineStatus['status'] = 'NOT_ASSIGNED';
  if (!hasRoom) {
    status = 'NOT_ASSIGNED';
  } else if (isCheckedOut) {
    status = 'CHECKED_OUT';
  } else if (isCheckedIn) {
    status = 'CHECKED_IN';
  } else {
    status = 'ASSIGNED';
  }

  // Determine if actions are allowed
  let canCheckIn = hasRoom && !isCheckedIn;
  let canCheckOut = isCheckedIn && !isCheckedOut;
  let blockReason: string | undefined;

  if (!hasRoom) {
    canCheckIn = false;
    blockReason = 'Chưa gán phòng Host cho room line này';
  }

  return {
    roomLineIndex: segment.room_line_index,
    segmentId: segment.id,
    segmentPartnerName: segment.partner?.partner_name || null,
    hostPropertyName: segment.host_property_name,
    hostRoomType: segment.host_room_type,
    dateFrom: segment.date_from,
    dateTo: segment.date_to,
    nights: segment.nights,
    actualCheckInAt: segment.actual_check_in_at,
    actualCheckOutAt: segment.actual_check_out_at,
    checkedInBy: segment.checked_in_by,
    checkedOutBy: segment.checked_out_by,
    status,
    canCheckIn,
    canCheckOut,
    blockReason,
  };
}

// =============== HOOKS ===============

/**
 * Multi-room check-in mutation
 * Supports partial check-in for selected room lines/segments
 */
export function useMultiRoomCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: MultiRoomCheckInPayload): Promise<MultiRoomCheckResult> => {
      const { unifiedBookingId, stayId, targets, actualCheckInAt, note, hasDocument } = payload;

      if (targets.length === 0) {
        throw new Error("Cần chọn ít nhất 1 room line để check-in");
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      // Get all segments for this booking to calculate total
      const { data: allSegmentsRaw, error: fetchError } = await supabase
        .from("host_supply_segments")
        .select("id, room_line_index, actual_check_in_at, actual_check_out_at, host_room_id, room_code, partner_id, host_property_name")
        .eq("unified_booking_id", unifiedBookingId);

      if (fetchError) throw fetchError;

      // Cast to bypass TypeScript strict checking (columns exist but types not updated)
      const allSegments = (allSegmentsRaw as unknown as Array<{
        id: string;
        room_line_index: number;
        actual_check_in_at: string | null;
        actual_check_out_at: string | null;
        host_room_id: string | null;
        room_code: string | null;
        partner_id: string | null;
        host_property_name: string | null;
      }>) || [];

      // Validate targets have room assigned
      // FIXED: Check multiple indicators (host_room_id OR room_code OR host_property_name with partner_id)
      const targetSegmentIds = targets.map(t => t.segment_id);
      const targetSegments = allSegments.filter(s => targetSegmentIds.includes(s.id));

      const unassignedTargets = targetSegments.filter(s =>
        !s.partner_id || (!s.host_room_id && !s.room_code && !s.host_property_name)
      );
      if (unassignedTargets.length > 0) {
        throw new Error(`${unassignedTargets.length} room line(s) chưa gán phòng Host. Không thể check-in.`);
      }

      // Update each target segment
      const updatePromises = targets.map(target =>
        supabase
          .from("host_supply_segments")
          .update({
            actual_check_in_at: actualCheckInAt,
            checked_in_by: userId,
          } as any)
          .eq("id", target.segment_id)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Lỗi check-in ${errors.length} segment(s): ${errors[0].error?.message}`);
      }

      // Calculate new aggregated status
      const updatedSegments = allSegments?.map(s => {
        if (targetSegmentIds.includes(s.id)) {
          return { ...s, actual_check_in_at: actualCheckInAt };
        }
        return s;
      }) || [];

      const aggregatedStatus = determineAggregatedStatus(updatedSegments);
      const checkedInCount = updatedSegments.filter(s => s.actual_check_in_at && !s.actual_check_out_at).length;
      const totalCount = updatedSegments.length;
      const isPartial = checkedInCount < totalCount;

      // Determine stay_status based on aggregated
      let stayStatus: "CHECKED_IN" | "CHECKED_OUT" | "WAIT_ROOM" | "IN_HOUSE" = "WAIT_ROOM";
      switch (aggregatedStatus) {
        case 'CHECKED_IN':
        case 'IN_HOUSE':
          stayStatus = 'CHECKED_IN';
          break;
        case 'PARTIAL_IN':
          stayStatus = 'CHECKED_IN'; // Use CHECKED_IN for partial (guest is in property)
          break;
        case 'PARTIAL_OUT':
          stayStatus = 'IN_HOUSE';
          break;
        case 'CHECKED_OUT':
          stayStatus = 'CHECKED_OUT';
          break;
        default:
          stayStatus = 'WAIT_ROOM';
      }

      // Map to booking_status (different enum)
      const bookingStatus = stayStatus === 'CHECKED_OUT' ? 'CHECKED_OUT'
        : stayStatus === 'CHECKED_IN' || stayStatus === 'IN_HOUSE' ? 'CHECKED_IN'
          : 'CONFIRMED';

      // Update stays table with aggregated status
      const isNewStay = stayId === unifiedBookingId;

      if (isNewStay) {
        const { error: createError } = await supabase
          .from("stays")
          .insert({
            unified_booking_id: unifiedBookingId,
            stay_status: stayStatus,
            actual_check_in_at: actualCheckInAt,
            operation_note: note || null,
          } as any);
        if (createError) throw createError;
      } else {
        const { error: updateError } = await supabase
          .from("stays")
          .update({
            stay_status: stayStatus,
            actual_check_in_at: actualCheckInAt,
            operation_note: note || null,
          })
          .eq("id", stayId);
        if (updateError) throw updateError;
      }

      // Update manual_bookings if exists
      await supabase
        .from("manual_bookings")
        .update({ booking_status: bookingStatus as any })
        .eq("unified_booking_id", unifiedBookingId);

      // Audit log
      await createAuditLog({
        action: AuditActions.CHECK_IN,
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          action_type: "MULTI_ROOM_CHECK_IN",
          targets: targets.map(t => ({ segment_id: t.segment_id, room_line_index: t.room_line_index })),
          actual_check_in_at: actualCheckInAt,
          total_lines: totalCount,
          checked_in_lines: checkedInCount,
          is_partial: isPartial,
          aggregated_status: aggregatedStatus,
          has_document: hasDocument,
        },
      }).catch(console.error);

      return {
        unifiedBookingId,
        totalLines: totalCount,
        checkedInLines: checkedInCount,
        checkedOutLines: updatedSegments.filter(s => s.actual_check_out_at).length,
        isPartial,
        timestamp: actualCheckInAt,
      };
    },

    onSuccess: (result, payload) => {
      if (result.isPartial) {
        toast.success(`Nhận phòng thành công ${result.checkedInLines}/${result.totalLines} phòng (Partial)`, {
          duration: 4000,
        });
      } else {
        toast.success("Nhận phòng tất cả phòng thành công!");
      }

      if (!payload.hasDocument) {
        toast.warning("⚠️ Nhớ tải CCCD trước khi hoàn tất lưu trú.", { duration: 5000 });
      }

      // Invalidate queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
        queryClient.invalidateQueries({ queryKey: ["stays"] });
        queryClient.invalidateQueries({ queryKey: ["stay_record", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["booking_detail", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments", result.unifiedBookingId] });
      }, 100);

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
      }, 1500);
    },

    onError: (error) => {
      toast.error("Lỗi check-in: " + (error as Error).message);
    },
  });
}

/**
 * Multi-room check-out mutation
 * Supports partial check-out for selected room lines/segments
 */
export function useMultiRoomCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: MultiRoomCheckOutPayload): Promise<MultiRoomCheckResult> => {
      const { unifiedBookingId, stayId, targets, actualCheckOutAt, note, skipInfo } = payload;

      if (targets.length === 0) {
        throw new Error("Cần chọn ít nhất 1 room line để check-out");
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      // Get all segments for this booking
      const { data: allSegmentsRaw, error: fetchError } = await supabase
        .from("host_supply_segments")
        .select("id, room_line_index, actual_check_in_at, actual_check_out_at")
        .eq("unified_booking_id", unifiedBookingId);

      if (fetchError) throw fetchError;

      // Cast to bypass TypeScript strict checking (columns exist but types not updated)
      const allSegments = (allSegmentsRaw as unknown as Array<{
        id: string;
        room_line_index: number;
        actual_check_in_at: string | null;
        actual_check_out_at: string | null;
      }>) || [];

      // Validate targets are checked in
      const targetSegmentIds = targets.map(t => t.segment_id);
      const targetSegments = allSegments.filter(s => targetSegmentIds.includes(s.id));

      const notCheckedIn = targetSegments.filter(s => !s.actual_check_in_at);
      if (notCheckedIn.length > 0) {
        throw new Error(`${notCheckedIn.length} room line(s) chưa check-in. Không thể check-out.`);
      }

      // Update each target segment
      console.log("[MultiRoomCheckOut] Updating segments:", {
        targets: targets.map(t => ({ segment_id: t.segment_id, room_line_index: t.room_line_index })),
        userId,
        actualCheckOutAt,
      });

      const updatePromises = targets.map(target =>
        supabase
          .from("host_supply_segments")
          .update({
            actual_check_out_at: actualCheckOutAt,
            checked_out_by: userId,
          } as any)
          .eq("id", target.segment_id)
      );

      const results = await Promise.all(updatePromises);
      console.log("[MultiRoomCheckOut] Segment update results:", results.map(r => ({
        error: r.error?.message,
        status: r.status,
        statusText: r.statusText
      })));

      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Lỗi check-out ${errors.length} segment(s): ${errors[0].error?.message}`);
      }

      // Calculate new aggregated status
      const updatedSegments = allSegments?.map(s => {
        if (targetSegmentIds.includes(s.id)) {
          return { ...s, actual_check_out_at: actualCheckOutAt };
        }
        return s;
      }) || [];

      const aggregatedStatus = determineAggregatedStatus(updatedSegments);
      const checkedOutCount = updatedSegments.filter(s => s.actual_check_out_at).length;
      const checkedInCount = updatedSegments.filter(s => s.actual_check_in_at && !s.actual_check_out_at).length;
      const totalCount = updatedSegments.length;
      const isPartial = checkedOutCount < totalCount;

      // Determine stay_status
      let stayStatus: "CHECKED_IN" | "CHECKED_OUT" | "WAIT_ROOM" | "IN_HOUSE" = "WAIT_ROOM";
      switch (aggregatedStatus) {
        case 'CHECKED_OUT':
          stayStatus = 'CHECKED_OUT';
          break;
        case 'PARTIAL_OUT':
          stayStatus = 'IN_HOUSE'; // Some rooms still occupied
          break;
        default:
          stayStatus = aggregatedStatus === 'CHECKED_IN' || aggregatedStatus === 'IN_HOUSE'
            ? 'CHECKED_IN'
            : 'WAIT_ROOM';
      }

      // Map to booking_status
      const bookingStatus = stayStatus === 'CHECKED_OUT' ? 'CHECKED_OUT'
        : stayStatus === 'CHECKED_IN' || stayStatus === 'IN_HOUSE' ? 'CHECKED_IN'
          : 'CONFIRMED';

      // Validate stayId is a valid UUID (not unified_booking_id)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(stayId)) {
        console.error("[MultiRoomCheckOut] Invalid stayId (not UUID):", stayId);
        throw new Error(`stayId không hợp lệ (phải là UUID): ${stayId}`);
      }

      // Update stays table
      console.log("[MultiRoomCheckOut] Updating stays table:", { stayId, stayStatus, aggregatedStatus });
      const { error: updateError } = await supabase
        .from("stays")
        .update({
          stay_status: stayStatus,
          actual_check_out_at: aggregatedStatus === 'CHECKED_OUT' ? actualCheckOutAt : null,
          operation_note: note || null,
        })
        .eq("id", stayId);

      if (updateError) {
        console.error("[MultiRoomCheckOut] Stays update error:", updateError);
        throw updateError;
      }

      // Update manual_bookings
      await supabase
        .from("manual_bookings")
        .update({ booking_status: bookingStatus as any })
        .eq("unified_booking_id", unifiedBookingId);

      // Audit log
      await createAuditLog({
        action: AuditActions.CHECK_OUT,
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          action_type: "MULTI_ROOM_CHECK_OUT",
          targets: targets.map(t => ({ segment_id: t.segment_id, room_line_index: t.room_line_index })),
          actual_check_out_at: actualCheckOutAt,
          total_lines: totalCount,
          checked_out_lines: checkedOutCount,
          still_in_lines: checkedInCount,
          is_partial: isPartial,
          aggregated_status: aggregatedStatus,
          skip_info: skipInfo,
        },
      }).catch(console.error);

      return {
        unifiedBookingId,
        totalLines: totalCount,
        checkedInLines: checkedInCount,
        checkedOutLines: checkedOutCount,
        isPartial,
        timestamp: actualCheckOutAt,
      };
    },

    onSuccess: (result) => {
      if (result.isPartial) {
        toast.success(`Trả phòng thành công ${result.checkedOutLines}/${result.totalLines} phòng (Partial)`, {
          description: `Còn ${result.checkedInLines} phòng đang lưu trú`,
          duration: 4000,
        });
      } else {
        toast.success("Trả phòng tất cả phòng thành công!");
      }

      // Invalidate queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
        queryClient.invalidateQueries({ queryKey: ["stays"] });
        queryClient.invalidateQueries({ queryKey: ["stay_record", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["booking_detail", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments", result.unifiedBookingId] });
      }, 100);

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["unified_bookings"] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      }, 1500);
    },

    onError: (error) => {
      toast.error("Lỗi check-out: " + (error as Error).message);
    },
  });
}

/**
 * Get room line statuses for a booking
 * Returns status of each room line based on segment data
 */
export function useRoomLineStatuses(unifiedBookingId: string | null) {
  const queryClient = useQueryClient();

  return {
    getRoomLineStatuses: async (): Promise<RoomLineStatus[]> => {
      if (!unifiedBookingId) return [];

      const { data: segments, error } = await supabase
        .from("host_supply_segments")
        .select(`
          id,
          room_line_index,
          partner_id,
          host_property_name,
          host_room_type,
          host_room_id,
          date_from,
          date_to,
          nights,
          actual_check_in_at,
          actual_check_out_at,
          checked_in_by,
          checked_out_by,
          partner:partners(partner_name)
        `)
        .eq("unified_booking_id", unifiedBookingId)
        .order("room_line_index")
        .order("date_from");

      if (error) throw error;

      return (segments || []).map(s => mapSegmentToRoomLineStatus(s as any));
    },
  };
}

/**
 * Calculate summary for multi-room booking
 */
export interface MultiRoomSummary {
  totalRoomLines: number;
  assignedRoomLines: number;
  checkedInRoomLines: number;
  checkedOutRoomLines: number;
  pendingRoomLines: number;
  isAllAssigned: boolean;
  isAllCheckedIn: boolean;
  isAllCheckedOut: boolean;
  isPartialCheckIn: boolean;
  isPartialCheckOut: boolean;
  aggregatedStatus: string;
}

export function calculateMultiRoomSummary(roomLineStatuses: RoomLineStatus[]): MultiRoomSummary {
  const total = roomLineStatuses.length;
  const assigned = roomLineStatuses.filter(r => r.status !== 'NOT_ASSIGNED').length;
  const checkedIn = roomLineStatuses.filter(r => r.status === 'CHECKED_IN').length;
  const checkedOut = roomLineStatuses.filter(r => r.status === 'CHECKED_OUT').length;
  const pending = roomLineStatuses.filter(r => r.status === 'ASSIGNED').length;

  const isAllAssigned = assigned === total;
  const isAllCheckedIn = checkedIn === total || (checkedIn + checkedOut === total && checkedIn > 0);
  const isAllCheckedOut = checkedOut === total;
  const isPartialCheckIn = checkedIn > 0 && checkedIn < total && checkedOut === 0;
  const isPartialCheckOut = checkedOut > 0 && checkedOut < total;

  let aggregatedStatus = 'WAIT_ROOM';
  if (isAllCheckedOut) {
    aggregatedStatus = 'CHECKED_OUT';
  } else if (isPartialCheckOut) {
    aggregatedStatus = 'PARTIAL_OUT';
  } else if (isAllCheckedIn) {
    aggregatedStatus = 'CHECKED_IN';
  } else if (isPartialCheckIn) {
    aggregatedStatus = 'PARTIAL_IN';
  } else if (assigned > 0) {
    aggregatedStatus = 'ASSIGNED';
  }

  return {
    totalRoomLines: total,
    assignedRoomLines: assigned,
    checkedInRoomLines: checkedIn,
    checkedOutRoomLines: checkedOut,
    pendingRoomLines: pending,
    isAllAssigned,
    isAllCheckedIn,
    isAllCheckedOut,
    isPartialCheckIn,
    isPartialCheckOut,
    aggregatedStatus,
  };
}

// =============== UNDO MUTATIONS ===============

/**
 * Payload for undo check-in
 */
export interface UndoCheckInPayload {
  unifiedBookingId: string;
  stayId?: string;
  targets: CheckInTarget[]; // segments to undo check-in
  note?: string;
}

/**
 * Payload for undo check-out
 */
export interface UndoCheckOutPayload {
  unifiedBookingId: string;
  stayId?: string;
  targets: CheckInTarget[]; // segments to undo check-out
  note?: string;
}

/**
 * Multi-room undo check-in mutation
 * Supports partial undo for selected room lines/segments
 */
export function useMultiRoomUndoCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UndoCheckInPayload): Promise<MultiRoomCheckResult> => {
      const { unifiedBookingId, targets, note } = payload;

      if (targets.length === 0) {
        throw new Error("Cần chọn ít nhất 1 room line để hoàn tác check-in");
      }

      // Get all segments for this booking
      const { data: allSegmentsRaw, error: fetchError } = await supabase
        .from("host_supply_segments")
        .select("id, room_line_index, actual_check_in_at, actual_check_out_at")
        .eq("unified_booking_id", unifiedBookingId);

      if (fetchError) throw fetchError;

      // Cast to bypass TypeScript strict checking (columns exist but types not updated)
      const allSegments = (allSegmentsRaw as unknown as Array<{
        id: string;
        room_line_index: number;
        actual_check_in_at: string | null;
        actual_check_out_at: string | null;
      }>) || [];

      // Validate targets are checked in but NOT checked out
      const targetSegmentIds = targets.map(t => t.segment_id);
      const targetSegments = allSegments.filter(s => targetSegmentIds.includes(s.id));

      const notCheckedIn = targetSegments.filter(s => !s.actual_check_in_at);
      if (notCheckedIn.length > 0) {
        throw new Error(`${notCheckedIn.length} room line(s) chưa check-in. Không thể hoàn tác.`);
      }

      const alreadyCheckedOut = targetSegments.filter(s => s.actual_check_out_at);
      if (alreadyCheckedOut.length > 0) {
        throw new Error(`${alreadyCheckedOut.length} room line(s) đã check-out. Cần hoàn tác check-out trước.`);
      }

      // Update each target segment - set actual_check_in_at to null
      const updatePromises = targets.map(target =>
        supabase
          .from("host_supply_segments")
          .update({
            actual_check_in_at: null,
            checked_in_by: null,
          } as any)
          .eq("id", target.segment_id)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Lỗi hoàn tác ${errors.length} segment(s): ${errors[0].error?.message}`);
      }

      // Calculate new aggregated status
      const updatedSegments = allSegments.map(s => {
        if (targetSegmentIds.includes(s.id)) {
          return { ...s, actual_check_in_at: null };
        }
        return s;
      });

      const aggregatedStatus = determineAggregatedStatus(updatedSegments);
      const checkedInCount = updatedSegments.filter(s => s.actual_check_in_at && !s.actual_check_out_at).length;
      const checkedOutCount = updatedSegments.filter(s => s.actual_check_out_at).length;
      const totalCount = updatedSegments.length;
      const isPartial = checkedInCount > 0;

      // Determine stay_status
      let stayStatus: "WAIT_ROOM" | "CHECKED_IN" = "WAIT_ROOM";
      if (checkedInCount > 0) {
        stayStatus = "CHECKED_IN"; // still has some checked-in segments
      }

      // Update stays table
      await supabase
        .from("stays")
        .update({
          stay_status: stayStatus,
          actual_check_in_at: checkedInCount > 0
            ? updatedSegments.find(s => s.actual_check_in_at)?.actual_check_in_at
            : null,
        } as any)
        .eq("unified_booking_id", unifiedBookingId);

      // Audit log
      createAuditLog({
        action: "MULTI_ROOM_UNDO_CHECK_IN",
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          action_type: "MULTI_ROOM_UNDO_CHECK_IN",
          targets: targets.map(t => ({ segment_id: t.segment_id, room_line_index: t.room_line_index })),
          undone_count: targets.length,
          total_lines: totalCount,
          remaining_checked_in: checkedInCount,
          aggregated_status: aggregatedStatus,
          note,
        },
      }).catch(console.error);

      return {
        unifiedBookingId,
        totalLines: totalCount,
        checkedInLines: checkedInCount,
        checkedOutLines: checkedOutCount,
        isPartial,
        timestamp: new Date().toISOString(),
      };
    },

    onSuccess: (result, payload) => {
      const undoneCount = payload.targets.length;
      toast.success(`Đã hoàn tác check-in ${undoneCount} phòng`, {
        duration: 4000,
      });

      // Invalidate queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
        queryClient.invalidateQueries({ queryKey: ["stays"] });
        queryClient.invalidateQueries({ queryKey: ["stay_record", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["booking_detail", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments", result.unifiedBookingId] });
      }, 100);
    },

    onError: (error) => {
      toast.error("Lỗi hoàn tác check-in: " + (error as Error).message);
    },
  });
}

/**
 * Multi-room undo check-out mutation
 * Supports partial undo for selected room lines/segments
 */
export function useMultiRoomUndoCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UndoCheckOutPayload): Promise<MultiRoomCheckResult> => {
      const { unifiedBookingId, targets, note } = payload;

      if (targets.length === 0) {
        throw new Error("Cần chọn ít nhất 1 room line để hoàn tác check-out");
      }

      // Get all segments for this booking
      const { data: allSegmentsRaw, error: fetchError } = await supabase
        .from("host_supply_segments")
        .select("id, room_line_index, actual_check_in_at, actual_check_out_at")
        .eq("unified_booking_id", unifiedBookingId);

      if (fetchError) throw fetchError;

      // Cast to bypass TypeScript strict checking (columns exist but types not updated)
      const allSegments = (allSegmentsRaw as unknown as Array<{
        id: string;
        room_line_index: number;
        actual_check_in_at: string | null;
        actual_check_out_at: string | null;
      }>) || [];

      // Validate targets are checked out
      const targetSegmentIds = targets.map(t => t.segment_id);
      const targetSegments = allSegments.filter(s => targetSegmentIds.includes(s.id));

      const notCheckedOut = targetSegments.filter(s => !s.actual_check_out_at);
      if (notCheckedOut.length > 0) {
        throw new Error(`${notCheckedOut.length} room line(s) chưa check-out. Không thể hoàn tác.`);
      }

      // Update each target segment - set actual_check_out_at to null
      const updatePromises = targets.map(target =>
        supabase
          .from("host_supply_segments")
          .update({
            actual_check_out_at: null,
            checked_out_by: null,
          } as any)
          .eq("id", target.segment_id)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error(`Lỗi hoàn tác ${errors.length} segment(s): ${errors[0].error?.message}`);
      }

      // Calculate new aggregated status
      const updatedSegments = allSegments.map(s => {
        if (targetSegmentIds.includes(s.id)) {
          return { ...s, actual_check_out_at: null };
        }
        return s;
      });

      const aggregatedStatus = determineAggregatedStatus(updatedSegments);
      const checkedInCount = updatedSegments.filter(s => s.actual_check_in_at && !s.actual_check_out_at).length;
      const checkedOutCount = updatedSegments.filter(s => s.actual_check_out_at).length;
      const totalCount = updatedSegments.length;
      const isPartial = checkedOutCount > 0;

      // Update stays table - revert to CHECKED_IN
      await supabase
        .from("stays")
        .update({
          stay_status: "CHECKED_IN" as const,
          actual_check_out_at: checkedOutCount > 0
            ? updatedSegments.find(s => s.actual_check_out_at)?.actual_check_out_at
            : null,
        })
        .eq("unified_booking_id", unifiedBookingId);

      // Audit log
      createAuditLog({
        action: "MULTI_ROOM_UNDO_CHECK_OUT",
        entity: "booking",
        entityId: unifiedBookingId,
        afterData: {
          action_type: "MULTI_ROOM_UNDO_CHECK_OUT",
          targets: targets.map(t => ({ segment_id: t.segment_id, room_line_index: t.room_line_index })),
          undone_count: targets.length,
          total_lines: totalCount,
          remaining_checked_out: checkedOutCount,
          aggregated_status: aggregatedStatus,
          note,
        },
      }).catch(console.error);

      return {
        unifiedBookingId,
        totalLines: totalCount,
        checkedInLines: checkedInCount,
        checkedOutLines: checkedOutCount,
        isPartial,
        timestamp: new Date().toISOString(),
      };
    },

    onSuccess: (result, payload) => {
      const undoneCount = payload.targets.length;
      toast.success(`Đã hoàn tác check-out ${undoneCount} phòng`, {
        duration: 4000,
      });

      // Invalidate queries
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
        queryClient.invalidateQueries({ queryKey: ["stays"] });
        queryClient.invalidateQueries({ queryKey: ["stay_record", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["booking_detail", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments", result.unifiedBookingId] });
        queryClient.invalidateQueries({ queryKey: ["enhanced-host-payables"] });
      }, 100);
    },

    onError: (error) => {
      toast.error("Lỗi hoàn tác check-out: " + (error as Error).message);
    },
  });
}
