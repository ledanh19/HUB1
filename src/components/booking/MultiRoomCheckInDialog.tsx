/**
 * MULTI-ROOM CHECK-IN DIALOG
 * ==========================
 * 
 * Supports partial check-in for multi-room bookings:
 * - Displays all room lines grouped by segment
 * - Allows selecting multiple room lines for check-in
 * - Shows status per room line (assigned, blocked, etc.)
 * - Validates room assignment before check-in
 * 
 * GOLDEN RULES:
 * - NON-BREAKING: Works alongside existing single-room flow
 * - SOT: Updates host_supply_segments.actual_check_in_at
 * - PARTIAL: Supports checking in subset of room lines
 */

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
import {
  Loader2,
  AlertTriangle,
  User,
  Calendar,
  Building2,
  CheckCircle,
  Camera,
  Home,
  MapPin,
  Info,
  Ban,
  CheckSquare,
  Square,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { GuestDocumentUpload } from "./GuestDocumentUpload";
import { useGuestDocuments } from "@/hooks/useGuestDocuments";
import { useHostSupplySegments } from "@/hooks/useHostSupplySegments";
import { useBookingRoomLines } from "@/hooks/useBookingRoomLines";
import {
  useMultiRoomCheckIn,
  mapSegmentToRoomLineStatus,
  calculateMultiRoomSummary,
  RoomLineStatus,
  CheckInTarget,
} from "@/hooks/useMultiRoomCheckInOut";

interface MultiRoomCheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stay: {
    id: string;
    unified_booking_id: string;
    host_room_id: string | null;
    host_property_name: string | null;
    host_room_type: string | null;
    stay_status: string;
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
}

// FIX APPLIED: Replaced Radix Checkbox with native HTML checkbox
// to prevent compose-refs infinite loop (React error #185)

export function MultiRoomCheckInDialog({
  open,
  onOpenChange,
  stay,
  booking,
}: MultiRoomCheckInDialogProps) {
  // EARLY RETURN FIRST - before any hooks that could cause re-render loops
  // This is critical: do not call any data-fetching hooks when dialog is closed
  if (!open) {
    return null;
  }

  return (
    <MultiRoomCheckInDialogContent
      open={open}
      onOpenChange={onOpenChange}
      stay={stay}
      booking={booking}
    />
  );
}

// Separate inner component that only renders when open=true
// This ensures hooks only run when dialog is visible
function MultiRoomCheckInDialogContent({
  open,
  onOpenChange,
  stay,
  booking,
}: MultiRoomCheckInDialogProps) {
  const [saving, setSaving] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [proceedWithoutCCCD, setProceedWithoutCCCD] = useState(false);

  const [formData, setFormData] = useState({
    actual_check_in_at: new Date().toISOString().slice(0, 16),
    note: "",
  });

  // Selected room lines for check-in
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());

  // Fetch data
  const { data: documents = [], refetch: refetchDocs } = useGuestDocuments(stay.unified_booking_id);
  const hasDocumentImage = documents.some(d => d.document_image);

  const { data: segments = [] } = useHostSupplySegments(stay.unified_booking_id);
  const { data: roomLines = [] } = useBookingRoomLines(stay.unified_booking_id);

  // Multi-room check-in mutation
  const checkInMutation = useMultiRoomCheckIn();

  // Map segments to room line statuses
  const roomLineStatuses: RoomLineStatus[] = useMemo(() => {
    return segments.map(seg => mapSegmentToRoomLineStatus(seg as any));
  }, [segments]);

  // Calculate summary
  const summary = useMemo(() => {
    return calculateMultiRoomSummary(roomLineStatuses);
  }, [roomLineStatuses]);

  // Get checkable targets (can check in)
  const checkableTargets = useMemo(() => {
    return roomLineStatuses.filter(r => r.canCheckIn && r.segmentId);
  }, [roomLineStatuses]);

  // Keep ref to checkableTargets for stable toggleAll callback
  const checkableTargetsRef = useRef(checkableTargets);
  checkableTargetsRef.current = checkableTargets;

  // Track if we've already initialized on open - using ref to avoid re-render cycle
  const hasInitialized = useRef(false);
  const didAutoSelectRef = useRef(false);

  // Single useEffect for ALL initialization - no refetchDocs to avoid loops
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      didAutoSelectRef.current = false;
      setShowUpload(false);
      setProceedWithoutCCCD(false);
      setSelectedTargets(new Set());
    }
    // Cleanup handled by wrapper component unmounting
  }, []);

  // Auto-select checkable targets - separate effect with stable key
  const checkableTargetIds = useMemo(
    () => checkableTargets.map(t => t.segmentId!).filter(Boolean).sort().join(','),
    [checkableTargets]
  );

  useEffect(() => {
    // Only auto-select once when targets become available
    if (checkableTargetIds && !didAutoSelectRef.current) {
      didAutoSelectRef.current = true;
      const ids = checkableTargetIds.split(',').filter(Boolean);
      if (ids.length > 0) {
        setSelectedTargets(new Set(ids));
      }
    }
  }, [checkableTargetIds]);

  // Toggle single target
  const toggleTarget = useCallback((segmentId: string) => {
    setSelectedTargets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(segmentId)) {
        newSet.delete(segmentId);
      } else {
        newSet.add(segmentId);
      }
      return newSet;
    });
  }, []);

  // Toggle all checkable targets - use ref and functional update for stability
  const toggleAll = useCallback(() => {
    const targets = checkableTargetsRef.current;
    setSelectedTargets(prev => {
      if (prev.size === targets.length) {
        return new Set();
      } else {
        return new Set(targets.map(t => t.segmentId!));
      }
    });
  }, []);

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedTargets.size === 0) {
      return;
    }

    if (!hasDocumentImage && !proceedWithoutCCCD) {
      return;
    }

    setSaving(true);

    try {
      const targets: CheckInTarget[] = Array.from(selectedTargets).map((segmentId: string) => {
        const status = roomLineStatuses.find(r => r.segmentId === segmentId);
        return {
          segment_id: segmentId,
          room_line_index: status?.roomLineIndex || 0,
        };
      });

      await checkInMutation.mutateAsync({
        unifiedBookingId: stay.unified_booking_id,
        stayId: stay.id,
        targets,
        actualCheckInAt: formData.actual_check_in_at,
        note: formData.note,
        hasDocument: hasDocumentImage,
      });

      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentUploaded = () => {
    refetchDocs();
    setShowUpload(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: RoomLineStatus) => {
    switch (status.status) {
      case 'NOT_ASSIGNED':
        return <StatusBadge variant="danger" size="sm"><Ban className="h-3 w-3 mr-1" />Chưa gán phòng</StatusBadge>;
      case 'ASSIGNED':
        return <StatusBadge variant="info" size="sm">Sẵn sàng</StatusBadge>;
      case 'CHECKED_IN':
        return <StatusBadge variant="success" size="sm"><CheckCircle className="h-3 w-3 mr-1" />Đã nhận phòng</StatusBadge>;
      case 'CHECKED_OUT':
        return <StatusBadge variant="neutral" size="sm">Đã trả phòng</StatusBadge>;
      default:
        return null;
    }
  };

  const isMultiRoom = roomLines.length > 1 || segments.length > 1;
  const canSubmit = selectedTargets.size > 0 && (hasDocumentImage || proceedWithoutCCCD);
  const formRef = useRef<HTMLFormElement>(null);
  const submitDisabled = saving || !canSubmit;
  const submitLabel = selectedTargets.size < checkableTargets.length && selectedTargets.size > 0
    ? `Nhận ${selectedTargets.size} phòng`
    : "Nhận phòng";

  // CRITICAL: Early return when closed to prevent Radix ref setup loops
  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen size="2xl" className="sm:max-h-[90vh] sm:overflow-y-auto max-sm:overflow-hidden">
        <MobileDialogHeader
          title={isMultiRoom ? "Check-in Multi-room" : "Nhận phòng"}
          onClose={() => onOpenChange(false)}
          onSubmit={() => formRef.current?.requestSubmit()}
          submitLabel={submitLabel}
          submitDisabled={submitDisabled}
          isSubmitting={saving}
        />
        <DialogHeader className="max-sm:hidden">
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Check-in {isMultiRoom ? "Multi-room" : ""}
          </DialogTitle>
          <DialogDescription>
            {isMultiRoom
              ? "Chọn các phòng cần check-in. Hỗ trợ check-in partial (một phần)."
              : "Xác nhận khách nhận phòng"}
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 max-sm:flex-1 max-sm:overflow-y-auto max-sm:p-4">
          {/* Booking Info */}
          <div className="p-4 rounded-lg bg-muted/30">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Khách:</span>
              <span className="font-medium">{booking.guest_name}{booking.guest_phone ? ` • ${booking.guest_phone}` : ''}</span>
              <span className="text-muted-foreground">Lưu trú:</span>
              <span>{formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)} ({booking.nights} đêm)</span>
              <span className="text-muted-foreground">Khách sạn:</span>
              <span>{booking.pms_property_name || booking.source}</span>
              <span className="text-muted-foreground">Thanh toán:</span>
              <span className="flex gap-2">
                <StatusBadge variant={booking.payment_type === "HOTEL_COLLECT" ? "success" : "info"} size="sm">
                  {booking.payment_type === "HOTEL_COLLECT" ? "KS thu" : "OTA thu"}
                </StatusBadge>
                {isMultiRoom && (
                  <StatusBadge variant="warning" size="sm">
                    {segments.length} phòng
                  </StatusBadge>
                )}
              </span>
            </div>
          </div>

          {/* Summary */}
          {isMultiRoom && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Trạng thái phòng</span>
                <div className="flex gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {summary.checkedInRoomLines}/{summary.totalRoomLines} đã check-in
                  </span>
                  {summary.isPartialCheckIn && (
                    <StatusBadge variant="warning" size="sm">Partial</StatusBadge>
                  )}
                </div>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>✓ Sẵn sàng: {summary.pendingRoomLines}</span>
                <span>⚠ Chưa gán: {summary.totalRoomLines - summary.assignedRoomLines}</span>
                <span>✔ Đã vào: {summary.checkedInRoomLines}</span>
              </div>
            </div>
          )}

          {/* Room Lines Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Chọn phòng check-in
              </Label>
              {checkableTargets.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  className="h-auto py-1"
                >
                  {selectedTargets.size === checkableTargets.length ? (
                    <>
                      <Square className="h-4 w-4 mr-1" />
                      Bỏ chọn tất cả
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-1" />
                      Chọn tất cả ({checkableTargets.length})
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {roomLineStatuses.map((status, idx) => {
                const isCheckable = status.canCheckIn && status.segmentId;
                const isSelected = status.segmentId ? selectedTargets.has(status.segmentId) : false;
                const segmentId = status.segmentId;

                return (
                  <div
                    key={segmentId || idx}
                    onClick={() => isCheckable && segmentId && toggleTarget(segmentId)}
                    className={`p-3 rounded-lg border transition-all ${isCheckable
                      ? isSelected
                        ? 'border-primary bg-primary/10 cursor-pointer'
                        : 'border-border hover:border-primary/50 cursor-pointer'
                      : 'border-border/50 bg-muted/30 cursor-not-allowed opacity-60'
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {isCheckable && segmentId && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTarget(segmentId)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={!isCheckable}
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                          />
                        )}
                        {!isCheckable && (
                          <div className="w-4 h-4 mt-0.5">
                            {status.status === 'CHECKED_IN' && <CheckCircle className="h-4 w-4 text-success" />}
                            {status.status === 'NOT_ASSIGNED' && <Ban className="h-4 w-4 text-destructive" />}
                            {status.status === 'CHECKED_OUT' && <CheckCircle className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              Phòng {status.roomLineIndex + 1}
                            </span>
                            {getStatusBadge(status)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {status.hostPropertyName && (
                              <span>{status.hostPropertyName}</span>
                            )}
                            {status.hostRoomType && (
                              <span> • {status.hostRoomType}</span>
                            )}
                            {status.segmentPartnerName && (
                              <span className="text-primary"> • Host: {status.segmentPartnerName}</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {formatDate(status.dateFrom)} → {formatDate(status.dateTo)}
                            <span className="ml-1">({status.nights} đêm)</span>
                          </div>
                          {status.blockReason && (
                            <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {status.blockReason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {checkableTargets.length === 0 && (
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-center">
              <AlertTriangle className="h-5 w-5 text-warning mx-auto mb-2" />
              <p className="text-sm font-medium text-warning">Không có phòng nào sẵn sàng check-in</p>
              <p className="text-xs text-muted-foreground mt-1">
                Các phòng cần được gán Host trước khi check-in
              </p>
            </div>
          )}

          {/* Selected Summary */}
          {selectedTargets.size > 0 && (
            <div className="p-3 rounded-lg bg-success/10 border border-success/20">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium text-sm">
                  Đã chọn {selectedTargets.size}/{checkableTargets.length} phòng để check-in
                </span>
              </div>
              {selectedTargets.size < checkableTargets.length && (
                <p className="text-xs text-success mt-1 ml-6">
                  <Info className="h-3 w-3 inline mr-1" />
                  Check-in partial: Các phòng còn lại có thể check-in sau
                </p>
              )}
            </div>
          )}

          {/* Document Status */}
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
                    Có thể check-in trước, nhưng <strong>BẮT BUỘC</strong> tải CCCD trước settlement.
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

          {/* Check-in Time & Note */}
          <div className="space-y-2">
            <Label>Thời gian check-in</Label>
            <Input
              type="datetime-local"
              value={formData.actual_check_in_at}
              onChange={(e) => setFormData({ ...formData, actual_check_in_at: e.target.value })}
            />
          </div>

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
