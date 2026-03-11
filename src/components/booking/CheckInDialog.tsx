import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  MobileDialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
// Checkbox: Using native HTML checkbox to avoid Radix compose-refs infinite loop
import { Loader2, AlertTriangle, User, Calendar, Building2, CheckCircle, Camera, Home, Users, ArrowRight, MapPin, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { createAuditLog, AuditActions } from "@/hooks/useAuditLog";
import { StatusBadge } from "@/components/ui/status-badge";
import { GuestDocumentUpload } from "./GuestDocumentUpload";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";
import {
  useHostSupplySegments,
  getBookingDates,
  getAssignedDates,
  getMissingDates,
  findOverlaps
} from "@/hooks/useHostSupplySegments";

interface CheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stay: {
    id: string;
    unified_booking_id: string;
    host_room_id: string | null;
    host_property_name: string | null;
    host_room_type: string | null;
    stay_status: string;
    actual_check_out_at?: string | null; // For multi-segment support
  };
  booking: {
    guest_name: string;
    guest_phone: string | null;
    check_in_date: string;
    check_out_date: string;
    source: string;
    payment_type: string;
    pms_property_name: string | null;
    nights: number | null;
    total_amount_net: number | null;
    nationality?: string | null;
  };
  // Multi-segment support: when checking in for next segment after checkout
  isMultiSegmentCheckIn?: boolean;
  nextSegment?: {
    id: string;
    partner_id: string;
    host_property_name: string | null;
    host_room_type: string | null;
    date_from: string;
    date_to: string;
  } | null;
}

// FIX APPLIED: Replaced Radix Checkbox with native HTML checkbox
// to prevent compose-refs infinite loop (React error #185)

export function CheckInDialog({
  open,
  onOpenChange,
  stay,
  booking,
  isMultiSegmentCheckIn = false,
  nextSegment = null,
}: CheckInDialogProps) {
  // EARLY RETURN FIRST - before any hooks that could cause re-render loops
  // This is critical: do not call any data-fetching hooks when dialog is closed
  if (!open) {
    return null;
  }

  return (
    <CheckInDialogContent
      open={open}
      onOpenChange={onOpenChange}
      stay={stay}
      booking={booking}
      isMultiSegmentCheckIn={isMultiSegmentCheckIn}
      nextSegment={nextSegment}
    />
  );
}

// Separate inner component that only renders when open=true
// This ensures hooks only run when dialog is visible
function CheckInDialogContent({
  open,
  onOpenChange,
  stay,
  booking,
  isMultiSegmentCheckIn = false,
  nextSegment = null,
}: CheckInDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const [formData, setFormData] = useState({
    actual_check_in_at: new Date().toISOString().slice(0, 16),
    note: "",
  });

  // NOTE: Check-in is an OPERATION action that does NOT change owner
  // The audit_log records who performed the action for tracking purposes

  // Check if documents exist
  const { data: documents = [], refetch: refetchDocs } = useGuestDocuments(stay.unified_booking_id);
  const hasDocumentImage = documents.some(d => d.document_image);

  // Check host supply segments coverage
  const { data: segments = [] } = useHostSupplySegments(stay.unified_booking_id);

  const coverageStatus = useMemo(() => {
    const bookingDates = getBookingDates(booking.check_in_date, booking.check_out_date);

    // Multi-room: segments on different room_line_index can share the same dates.
    // Overlap must be checked PER room line, not across the whole booking.
    const roomIndexes = Array.from(
      new Set((segments || []).map((s: any) => s.room_line_index ?? 0))
    ).sort((a, b) => a - b);

    const isMultiRoom = roomIndexes.length > 1;

    let totalMissing = 0;
    const overlappingDatesSet = new Set<string>();

    if (isMultiRoom) {
      for (const roomIdx of roomIndexes) {
        const roomSegs = (segments || []).filter((s: any) => (s.room_line_index ?? 0) === roomIdx);
        const assignedDates = getAssignedDates(roomSegs);
        const missingDates = getMissingDates(bookingDates, assignedDates);
        totalMissing += missingDates.length;

        const overlaps = findOverlaps(roomSegs);
        overlaps.forEach((d) => overlappingDatesSet.add(d));
      }
    } else {
      const assignedDates = getAssignedDates(segments);
      const missingDates = getMissingDates(bookingDates, assignedDates);
      totalMissing = missingDates.length;

      const overlaps = findOverlaps(segments);
      overlaps.forEach((d) => overlappingDatesSet.add(d));
    }

    const overlappingDates = Array.from(overlappingDatesSet).sort();
    const roomsCount = isMultiRoom ? roomIndexes.length : 1;
    const totalRequired = bookingDates.length * roomsCount;
    const assignedNights = Math.max(0, totalRequired - totalMissing);

    return {
      totalNights: totalRequired,
      assignedNights,
      missingNights: totalMissing,
      missingDates: [] as string[],
      overlappingDates,
      isComplete: totalMissing === 0 && overlappingDates.length === 0,
      hasOverlap: overlappingDates.length > 0,
      hasSegments: segments.length > 0,
    };
  }, [segments, booking.check_in_date, booking.check_out_date]);

  // State for proceeding without CCCD (C3 - allow check-in, block finalize)
  const [proceedWithoutCCCD, setProceedWithoutCCCD] = useState(false);

  // Segment selection state (for multi-segment bookings)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Find the segment to check-in for based on today's date
  const currentSegment = useMemo(() => {
    if (segments.length === 0) return null;
    const today = new Date().toISOString().split('T')[0];
    // Find segment where today is within date_from (inclusive) to date_to (exclusive)
    return segments.find(seg => {
      const from = seg.date_from.split('T')[0];
      const to = seg.date_to.split('T')[0];
      return today >= from && today < to;
    }) || segments[0]; // Fallback to first segment
  }, [segments]);

  // Use currentSegment directly if no selection made yet
  // This avoids the need to set state on dialog open
  const effectiveSelectedSegment = selectedSegmentId
    ? segments.find(s => s.id === selectedSegmentId)
    : currentSegment;

  // Track previous open state for cleanup only
  const prevOpenRef = useRef(open);

  // Only reset state when dialog CLOSES - no state setting on open
  useEffect(() => {
    // Dialog just closed - reset state for next open
    if (prevOpenRef.current && !open) {
      setShowUpload(false);
      setProceedWithoutCCCD(false);
      setSelectedSegmentId(null);
    }
    prevOpenRef.current = open;
  }, [open]);

  // === OPTIMISTIC UPDATE HELPER ===
  const applyOptimisticUpdate = useCallback((updates: Record<string, unknown>) => {
    const updateInList = (oldData: unknown) => {
      if (!oldData || !Array.isArray(oldData)) return oldData;
      return oldData.map((item: Record<string, unknown>) =>
        item.unified_booking_id === stay.unified_booking_id
          ? { ...item, ...updates, _isOptimistic: true }
          : item
      );
    };

    // Apply to all list queries immediately
    queryClient.setQueryData(["stays_with_bookings"], updateInList);
    queryClient.setQueryData(["stays"], updateInList);
    queryClient.setQueryData(["unified_bookings"], updateInList);

    // Update stays_operations with partial match (matches any date param)
    queryClient.setQueriesData({ queryKey: ["stays_operations"], exact: false }, updateInList);

    // Update single stay record - CREATE if null (for new stay)
    queryClient.setQueryData(["stay_record", stay.unified_booking_id], (old: unknown) => {
      if (old) {
        return { ...(old as Record<string, unknown>), ...updates, _isOptimistic: true };
      }
      // Create optimistic stay record if doesn't exist
      return {
        id: stay.id,
        unified_booking_id: stay.unified_booking_id,
        host_room_id: stay.host_room_id,
        host_property_name: stay.host_property_name,
        host_room_type: stay.host_room_type,
        ...updates,
        _isOptimistic: true,
      };
    });

    // Also update booking_detail query (for BookingDetailPage action buttons)
    queryClient.setQueryData(["booking_detail", stay.unified_booking_id], (old: unknown) =>
      old ? { ...(old as Record<string, unknown>), ...updates, _isOptimistic: true } : old
    );
  }, [queryClient, stay.unified_booking_id, stay.id, stay.host_room_id, stay.host_property_name, stay.host_room_type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check coverage is complete
    if (!coverageStatus.isComplete) {
      toast.error("Chưa gán đủ phòng Host cho tất cả các đêm");
      return;
    }

    // C3: Allow check-in without CCCD, but require explicit confirmation
    if (!hasDocumentImage && !proceedWithoutCCCD) {
      toast.warning("Chưa có CCCD/Passport. Tick vào ô xác nhận để tiếp tục nhận phòng.");
      return;
    }

    if (saving) return;

    // === OPTIMISTIC UPDATE: Apply immediately (<100ms) ===
    // NOTE: For multi-segment check-in, we keep stay_status as "IN_HOUSE" to indicate 
    // guest is still staying (just moved to different host room), 
    // NOT resetting actual_check_out_at to preserve P&L reporting integrity.
    // P&L doanh thu chỉ được ghi nhận khi stay_status = 'CHECKED_OUT', 
    // nên multi-segment sẽ ghi nhận doanh thu toàn bộ booking khi checkout segment cuối cùng.
    const optimisticUpdates: Record<string, unknown> = {
      stay_status: isMultiSegmentCheckIn ? "IN_HOUSE" : "CHECKED_IN",
      actual_check_in_at: formData.actual_check_in_at,
    };
    // NOTE: Do NOT reset actual_check_out_at for multi-segment - keeps P&L tracking intact
    // The actual_check_out_at stores the LAST checkout time, will be updated on final checkout
    applyOptimisticUpdate(optimisticUpdates);

    // Close dialog immediately for perceived speed
    onOpenChange(false);

    // Show immediate feedback
    const loadingMsg = isMultiSegmentCheckIn
      ? "Đang ghi nhận nhận phòng segment tiếp theo..."
      : "Đang ghi nhận nhận phòng...";
    toast.loading(loadingMsg, { id: "checkin-toast" });

    setSaving(true);
    try {
      // Check if stay record exists (if id === unified_booking_id, it's a fallback and needs to be created)
      const isNewStay = stay.id === stay.unified_booking_id;

      // Use next segment info if multi-segment check-in
      const segmentToUse = isMultiSegmentCheckIn && nextSegment ? nextSegment : effectiveSelectedSegment;

      if (isNewStay) {
        // Create new stay record
        const { error: createError } = await supabase
          .from("stays")
          .insert({
            unified_booking_id: stay.unified_booking_id,
            stay_status: "CHECKED_IN",
            actual_check_in_at: formData.actual_check_in_at,
            operation_note: formData.note || null,
            host_room_id: stay.host_room_id,
            host_property_name: segmentToUse?.host_property_name || stay.host_property_name,
            host_room_type: segmentToUse?.host_room_type || stay.host_room_type,
          });

        if (createError) throw createError;
      } else {
        // Update existing stay status
        // For multi-segment check-in: use "IN_HOUSE" status, do NOT reset actual_check_out_at
        // This preserves P&L integrity - revenue is recognized only on final checkout
        const updateData: Record<string, unknown> = {
          stay_status: isMultiSegmentCheckIn ? "IN_HOUSE" : "CHECKED_IN",
          actual_check_in_at: formData.actual_check_in_at,
          operation_note: formData.note || null,
        };
        // Update host info from next segment (but keep actual_check_out_at intact)
        if (isMultiSegmentCheckIn && nextSegment) {
          updateData.host_property_name = nextSegment.host_property_name;
          updateData.host_room_type = nextSegment.host_room_type;
        }

        const { error: stayError } = await supabase
          .from("stays")
          .update(updateData)
          .eq("id", stay.id);

        if (stayError) throw stayError;
      }

      // Update booking status if manual (fire-and-forget)
      // Note: "IN_HOUSE" is used for stay_status, but booking_status uses "CHECKED_IN" for both cases
      supabase
        .from("manual_bookings")
        .update({ booking_status: "CHECKED_IN" as const })
        .eq("unified_booking_id", stay.unified_booking_id)
        .then(() => { });

      // === SEGMENT-LEVEL CHECK-IN TRACKING (SOT sync) ===
      // MUST sync host_supply_segments to keep dashboard in sync with stays (SOT)
      const segmentToUpdate = isMultiSegmentCheckIn && nextSegment ? nextSegment : effectiveSelectedSegment;
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (segmentToUpdate?.id) {
          // Update specific segment being checked in
          await supabase
            .from("host_supply_segments")
            .update({
              actual_check_in_at: formData.actual_check_in_at,
              checked_in_by: userData?.user?.id || null,
            } as any)
            .eq("id", segmentToUpdate.id);
        } else {
          // No specific segment found - update ALL segments that haven't been checked-in yet
          // This ensures dashboard stays in sync with stays SOT
          await supabase
            .from("host_supply_segments")
            .update({
              actual_check_in_at: formData.actual_check_in_at,
              checked_in_by: userData?.user?.id || null,
            } as any)
            .eq("unified_booking_id", stay.unified_booking_id)
            .is("actual_check_in_at", null);
        }
        queryClient.invalidateQueries({ queryKey: ["host-supply-segments", stay.unified_booking_id] });
      } catch (err) {
        console.error("[CheckIn] Error syncing segment check-in (non-blocking):", err);
      }

      // Determine which segment to use for audit log
      const segmentForAudit = isMultiSegmentCheckIn && nextSegment ? nextSegment : effectiveSelectedSegment;

      // Create audit log (fire-and-forget)
      createAuditLog({
        action: AuditActions.CHECK_IN,
        entity: "booking",
        entityId: stay.unified_booking_id,
        afterData: {
          stay_status: "CHECKED_IN",
          actual_check_in_at: formData.actual_check_in_at,
          has_document: hasDocumentImage,
          docs_missing: !hasDocumentImage,
          has_host_room: !!stay.host_room_id,
          segment_id: segmentForAudit?.id || null,
          segment_partner_id: segmentForAudit?.partner_id || null,
          segment_date_from: segmentForAudit?.date_from || null,
          segment_date_to: segmentForAudit?.date_to || null,
          is_multi_segment_checkin: isMultiSegmentCheckIn,
        },
      }).catch(console.error);

      // NOTE: Check-in is an OPERATION action - it logs the actor but does NOT change the owner
      // Owner is only assigned via manual assignment (Gán thủ công, Gán người phụ trách)
      // The audit log above already records who performed this action for tracking purposes

      // Show success toast (replace loading)
      const successMsg = isMultiSegmentCheckIn
        ? "Nhận phòng segment tiếp theo thành công!"
        : "Nhận phòng thành công!";
      if (!hasDocumentImage) {
        toast.warning(`${successMsg} ⚠️ Nhớ tải CCCD trước khi hoàn tất lưu trú.`, {
          id: "checkin-toast",
          duration: 5000,
        });
      } else {
        toast.success(successMsg, { id: "checkin-toast" });
      }

      // IMMEDIATE: Invalidate stay_record to refresh BookingDetailPage action buttons
      queryClient.invalidateQueries({ queryKey: ["stay_record", stay.unified_booking_id] });
      queryClient.invalidateQueries({ queryKey: ["booking_detail", stay.unified_booking_id] });

      // Background sync: delayed invalidation for dashboard/totals only
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
        queryClient.invalidateQueries({ queryKey: ["booking_audit_logs", stay.unified_booking_id] });
        queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
        queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
      }, 1500);

      // Reset form
      setFormData({
        actual_check_in_at: new Date().toISOString().slice(0, 16),
        note: "",
      });
      setProceedWithoutCCCD(false);
      setSelectedSegmentId(null);
    } catch (err: any) {
      // === ROLLBACK on error ===
      applyOptimisticUpdate({
        stay_status: stay.stay_status, // Revert to original
        actual_check_in_at: null,
      });
      toast.error("Lỗi nhận phòng: " + err.message, { id: "checkin-toast" });

      // Force refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["stays_with_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["stays_operations"] });
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentUploaded = () => {
    refetchDocs();
    setShowUpload(false);
    toast.success("Đã tải ảnh giấy tờ - Bạn có thể hoàn tất nhận phòng");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const submitDisabled = saving || !coverageStatus.isComplete || (!hasDocumentImage && !proceedWithoutCCCD);
  const submitLabel = !hasDocumentImage && proceedWithoutCCCD
    ? "Nhận phòng (Thiếu CCCD)"
    : "Xác nhận Nhận phòng";

  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="sm:max-w-lg sm:max-h-[90vh] sm:overflow-y-auto max-sm:overflow-hidden">
        <MobileDialogHeader
          title={isMultiSegmentCheckIn ? "Nhận phòng segment tiếp theo" : "Nhận phòng khách"}
          onClose={() => onOpenChange(false)}
          onSubmit={() => formRef.current?.requestSubmit()}
          submitLabel="Nhận phòng"
          submitDisabled={submitDisabled}
          isSubmitting={saving}
        />
        <DialogHeader className="max-sm:hidden">
          <DialogTitle>
            {isMultiSegmentCheckIn ? "Nhận phòng segment tiếp theo" : "Nhận phòng khách"}
          </DialogTitle>
          <DialogDescription>
            {isMultiSegmentCheckIn && nextSegment ? (
              <>
                Khách chuyển sang phòng/host mới: <strong>{nextSegment.host_property_name}</strong>
                <br />
                Từ {formatDate(nextSegment.date_from)} → {formatDate(nextSegment.date_to)}
              </>
            ) : (
              "Xác nhận khách nhận phòng"
            )}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 max-sm:flex-1 max-sm:overflow-y-auto max-sm:p-4">
          {/* Booking Info - Read Only */}
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Khách:</span>
              <span className="font-medium">{booking.guest_name}{booking.guest_phone ? ` • ${booking.guest_phone}` : ''}</span>
              <span className="text-muted-foreground">Lưu trú:</span>
              <span>{formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)} ({booking.nights} đêm)</span>
              <span className="text-muted-foreground">Khách sạn:</span>
              <span>{booking.pms_property_name || booking.source}</span>
              <span className="text-muted-foreground">Thanh toán:</span>
              <span>
                <StatusBadge variant={booking.payment_type === "HOTEL_COLLECT" ? "success" : "info"} size="sm">
                  {booking.payment_type === "HOTEL_COLLECT" ? "KS thu" : "OTA thu"}
                </StatusBadge>
              </span>
            </div>
          </div>

          {/* Coverage Status Warning */}
          {!coverageStatus.isComplete && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">
                  {coverageStatus.hasOverlap ? "Có ngày bị chồng lấn" : "Chưa gán đủ phòng Host"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {coverageStatus.hasOverlap
                    ? `Ngày chồng: ${coverageStatus.overlappingDates.slice(0, 3).join(', ')}${coverageStatus.overlappingDates.length > 3 ? '...' : ''}`
                    : `Thiếu ${coverageStatus.missingNights} đêm. Không thể nhận phòng khi chưa phân bổ phòng.`
                  }
                </p>
              </div>
            </div>
          )}

          {/* Coverage Summary */}
          {coverageStatus.hasSegments && (
            <div className="p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-2">
                <Home className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Host Supply Coverage</span>
                {coverageStatus.isComplete ? (
                  <StatusBadge variant="success" size="sm">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Đủ đêm
                  </StatusBadge>
                ) : (
                  <StatusBadge variant="danger" size="sm">
                    Thiếu {coverageStatus.missingNights} đêm
                  </StatusBadge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {coverageStatus.assignedNights}/{coverageStatus.totalNights} đêm đã phân bổ
              </div>
            </div>
          )}

          {/* Warning if no segments at all */}
          {!coverageStatus.hasSegments && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
              <Home className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">Chưa có Host Supply Segment</p>
                <p className="text-xs text-muted-foreground">
                  Cần phân bổ phòng Host trước khi nhận phòng.
                </p>
              </div>
            </div>
          )}

          {/* Segment Selection - REQUIRED (C2) */}
          {segments.length > 0 && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Home className="h-4 w-4 text-primary" />
                Segment Check-in (Bắt buộc chọn)
              </h4>
              <div className="space-y-2">
                {segments.map((seg, idx) => {
                  const isMultiHost = segments.length > 1 && new Set(segments.map(s => s.partner_id)).size > 1;
                  const prevSeg = idx > 0 ? segments[idx - 1] : null;
                  const isHostChange = prevSeg && prevSeg.partner_id !== seg.partner_id;
                  const hasGap = prevSeg && prevSeg.date_to !== seg.date_from;
                  const isSelected = effectiveSelectedSegment?.id === seg.id;

                  return (
                    <div
                      key={seg.id}
                      onClick={() => setSelectedSegmentId(seg.id)}
                      className={`p-3 rounded-md border cursor-pointer transition-all ${isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-border hover:border-primary/50'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                            }`}>
                            {isSelected && (
                              <CheckCircle className="h-3 w-3 text-white" />
                            )}
                          </div>
                          <span className="font-medium text-sm">
                            {seg.partner?.partner_name || 'Host'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isHostChange && (
                            <StatusBadge variant="warning" size="sm">
                              <Users className="h-3 w-3 mr-1" />Đổi Host
                            </StatusBadge>
                          )}
                          {hasGap && (
                            <StatusBadge variant="danger" size="sm">
                              Gián đoạn
                            </StatusBadge>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground pl-6">
                        {seg.host_property_name} • {seg.host_room_type}
                        <br />
                        <MapPin className="h-3 w-3 inline mr-1" />{formatDate(seg.date_from)} <ArrowRight className="h-3 w-3 inline mx-1" /> {formatDate(seg.date_to)}
                        <span className="ml-2">({seg.nights} đêm)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {segments.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  <Info className="h-3 w-3 inline mr-1" />Multi-segment: Chọn đúng segment đang check-in. Đổi host = cần check-in lại.
                </p>
              )}
            </div>
          )}

          {/* Document Status - C3: Optional but tracked */}
          <div className="p-4 rounded-lg border space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Giấy tờ lưu trú
              </h4>
              {hasDocumentImage ? (
                <StatusBadge variant="success" size="sm">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Đã có ảnh
                </StatusBadge>
              ) : (
                <StatusBadge variant="warning" size="sm">
                  Chưa có ảnh
                </StatusBadge>
              )}
            </div>

            {!hasDocumentImage && !showUpload && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
                <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-warning">Chưa có CCCD / Passport</p>
                  <p className="text-xs text-muted-foreground">
                    Có thể check-in trước, nhưng <strong>BẮT BUỘC</strong> tải CCCD trước khi hoàn tất lưu trú / settlement.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setShowUpload(true)}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Tải CCCD ngay
                  </Button>
                  {/* C3: Checkbox to proceed without CCCD - using native HTML to avoid Radix loop */}
                  <div className="flex items-center gap-2 mt-3 p-2 rounded bg-muted/50">
                    <input
                      type="checkbox"
                      id="proceedWithoutCCCD"
                      checked={proceedWithoutCCCD}
                      onChange={(e) => setProceedWithoutCCCD(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                    />
                    <label htmlFor="proceedWithoutCCCD" className="text-xs cursor-pointer">
                      Xác nhận check-in trước, tải CCCD sau
                    </label>
                  </div>
                </div>
              </div>
            )}

            {showUpload && (
              <GuestDocumentUpload
                unifiedBookingId={stay.unified_booking_id}
                guestName={booking.guest_name}
                nationality={booking.nationality || undefined}
                onUploadComplete={handleDocumentUploaded}
                onCancel={() => setShowUpload(false)}
                required
              />
            )}

            {hasDocumentImage && (
              <div className="text-sm text-muted-foreground">
                Đã có {documents.filter(d => d.document_image).length} ảnh giấy tờ
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="ml-2 p-0 h-auto"
                  onClick={() => setShowUpload(true)}
                >
                  + Thêm ảnh
                </Button>
              </div>
            )}
          </div>

          {/* Check-in Time */}
          <div className="space-y-2">
            <Label>Thời gian check-in</Label>
            <Input
              type="datetime-local"
              value={formData.actual_check_in_at}
              onChange={(e) => setFormData({ ...formData, actual_check_in_at: e.target.value })}
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label>Ghi chú</Label>
            <Textarea
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Ghi chú khi check-in..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 max-sm:hidden">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={submitDisabled}
              variant={!hasDocumentImage && proceedWithoutCCCD ? "destructive" : "default"}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
