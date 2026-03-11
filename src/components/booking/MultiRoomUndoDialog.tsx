/**
 * MULTI-ROOM UNDO DIALOG
 * ==========================
 * 
 * Supports partial undo for multi-room bookings:
 * - Undo Check-in: Revert checked-in segments back to waiting
 * - Undo Check-out: Revert checked-out segments back to checked-in
 * 
 * GOLDEN RULES:
 * - NON-BREAKING: Works alongside existing single-room flow
 * - SOT: Updates host_supply_segments
 * - PARTIAL: Supports undoing subset of segments
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  MobileDialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// FIX: Using native HTML checkbox to avoid Radix compose-refs infinite loop (React error #185)
import {
  Loader2,
  AlertTriangle,
  Undo2,
  CheckCircle,
  Home,
  MapPin,
  CheckSquare,
  Square,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useHostSupplySegments } from "@/hooks/useHostSupplySegments";
import {
  useMultiRoomUndoCheckIn,
  useMultiRoomUndoCheckOut,
  mapSegmentToRoomLineStatus,
  RoomLineStatus,
  CheckInTarget,
} from "@/hooks/useMultiRoomCheckInOut";

type UndoType = "CHECK_IN" | "CHECK_OUT";

interface MultiRoomUndoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  undoType: UndoType;
  stay: {
    id: string;
    unified_booking_id: string;
    host_property_name: string | null;
    host_room_type: string | null;
  };
  booking: {
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    source: string;
  };
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};

export function MultiRoomUndoDialog({
  open,
  onOpenChange,
  undoType,
  stay,
  booking,
}: MultiRoomUndoDialogProps) {
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());

  // Fetch segments
  const { data: segments = [] } = useHostSupplySegments(stay.unified_booking_id);

  // Mutations
  const undoCheckInMutation = useMultiRoomUndoCheckIn();
  const undoCheckOutMutation = useMultiRoomUndoCheckOut();

  // Map segments to statuses
  const roomLineStatuses: RoomLineStatus[] = useMemo(() => {
    return segments.map(seg => mapSegmentToRoomLineStatus(seg as any));
  }, [segments]);

  // Get undoable targets based on type
  const undoableTargets = useMemo(() => {
    if (undoType === "CHECK_IN") {
      // Can undo check-in for segments that are CHECKED_IN (not yet checked out)
      return roomLineStatuses.filter(r => r.status === 'CHECKED_IN' && r.segmentId);
    } else {
      // Can undo check-out for segments that are CHECKED_OUT
      return roomLineStatuses.filter(r => r.status === 'CHECKED_OUT' && r.segmentId);
    }
  }, [roomLineStatuses, undoType]);

  // Create stable key from undoable segment IDs to avoid infinite loop.
  // IMPORTANT: sort() to avoid loops when backend returns the same items in a different order across renders.
  const undoableSegmentIdsKey = useMemo(() => {
    return undoableTargets
      .map((t) => t.segmentId)
      .filter(Boolean)
      .sort()
      .join(",");
  }, [undoableTargets]);

  // CRITICAL FIX: Only reset state on dialog open transition (false → true)
  // Dependencies: ONLY 'open' - capture undoableSegmentIdsKey value when dialog opens
  const prevOpenRef = useRef(false);
  const undoableTargetsRef = useRef(undoableTargets);
  useEffect(() => {
    // Only run when dialog transitions from closed to open
    if (open && !prevOpenRef.current) {
      setNote("");
      // Auto-select all undoable targets using computed list
      const ids = undoableSegmentIdsKey.split(',').filter(Boolean);
      setSelectedTargets(new Set(ids));
    }
    prevOpenRef.current = open;
  }, [open]);

  // Keep ref in sync with undoableTargets
  useEffect(() => {
    undoableTargetsRef.current = undoableTargets;
  }, [undoableTargets]);

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

  // Toggle all
  const toggleAll = useCallback(() => {
    const targets = undoableTargetsRef.current;
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

    setSaving(true);

    try {
      const targets: CheckInTarget[] = Array.from(selectedTargets).map((segmentId: string) => {
        const status = roomLineStatuses.find(r => r.segmentId === segmentId);
        return {
          segment_id: segmentId,
          room_line_index: status?.roomLineIndex || 0,
        };
      });

      if (undoType === "CHECK_IN") {
        await undoCheckInMutation.mutateAsync({
          unifiedBookingId: stay.unified_booking_id,
          stayId: stay.id,
          targets,
          note,
        });
      } else {
        await undoCheckOutMutation.mutateAsync({
          unifiedBookingId: stay.unified_booking_id,
          stayId: stay.id,
          targets,
          note,
        });
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Undo error:", error);
    } finally {
      setSaving(false);
    }
  };

  const isMultiRoom = segments.length > 1;
  const title = undoType === "CHECK_IN"
    ? "Hoàn tác Check-in"
    : "Hoàn tác Check-out";
  const description = undoType === "CHECK_IN"
    ? "Chọn các phòng cần hoàn tác check-in (đưa về trạng thái chờ nhận phòng)"
    : "Chọn các phòng cần hoàn tác check-out (đưa về trạng thái đang ở)";

  const formRef = useRef<HTMLFormElement>(null);
  const submitDisabled = saving || selectedTargets.size === 0;

  // CRITICAL: Early return when closed to prevent Radix ref setup loops
  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="sm:max-w-lg sm:max-h-[90vh] sm:overflow-y-auto max-sm:overflow-hidden">
        <MobileDialogHeader
          title={title}
          onClose={() => onOpenChange(false)}
          onSubmit={() => formRef.current?.requestSubmit()}
          submitLabel={`Hoàn tác ${selectedTargets.size}`}
          submitDisabled={submitDisabled}
          isSubmitting={saving}
        />
        <DialogHeader className="max-sm:hidden">
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-warning" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 max-sm:flex-1 max-sm:overflow-y-auto max-sm:p-4">
          {/* Guest Info */}
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Khách:</span>
              <span className="font-medium">{booking.guest_name}</span>
              <span className="text-muted-foreground">Lưu trú:</span>
              <span>{formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)}</span>
              {isMultiRoom && (
                <>
                  <span className="text-muted-foreground">Số phòng:</span>
                  <span>
                    <StatusBadge variant="warning" size="sm">
                      {segments.length} phòng
                    </StatusBadge>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">Cảnh báo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {undoType === "CHECK_IN"
                    ? "Hoàn tác check-in sẽ xóa thời gian nhận phòng. Khách sẽ được đưa về trạng thái chờ nhận phòng."
                    : "Hoàn tác check-out sẽ xóa thời gian trả phòng. Khách sẽ được đưa về trạng thái đang ở."}
                </p>
              </div>
            </div>
          </div>

          {/* Room Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Home className="h-4 w-4" />
                Chọn phòng cần hoàn tác
              </Label>
              {undoableTargets.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  className="text-xs"
                >
                  {selectedTargets.size === undoableTargets.length ? (
                    <>
                      <Square className="h-3 w-3 mr-1" />
                      Bỏ chọn tất cả
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-3 w-3 mr-1" />
                      Chọn tất cả
                    </>
                  )}
                </Button>
              )}
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {roomLineStatuses.map((status) => {
                const isUndoable = undoableTargets.some(t => t.segmentId === status.segmentId);
                const isSelected = selectedTargets.has(status.segmentId || "");

                return (
                  <div
                    key={status.segmentId}
                    className={`p-3 rounded-lg border ${isUndoable
                        ? isSelected
                          ? "border-warning bg-warning/5"
                          : "border-border hover:border-warning/50 cursor-pointer"
                        : "border-border/50 bg-muted/30 opacity-60"
                      }`}
                    onClick={() => isUndoable && toggleTarget(status.segmentId!)}
                  >
                    <div className="flex items-start gap-3">
                      {isUndoable && status.segmentId && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleTarget(status.segmentId!)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                        />
                      )}
                      {!isUndoable && (
                        <div className="w-4 h-4 mt-0.5">
                          {status.status === 'ASSIGNED' && <Home className="h-4 w-4 text-muted-foreground" />}
                          {status.status === 'CHECKED_IN' && undoType === "CHECK_OUT" && (
                            <CheckCircle className="h-4 w-4 text-success" />
                          )}
                          {status.status === 'CHECKED_OUT' && undoType === "CHECK_IN" && (
                            <CheckCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            Phòng {status.roomLineIndex + 1}
                          </span>
                          <StatusBadge
                            variant={
                              status.status === 'CHECKED_IN' ? 'success' :
                                status.status === 'CHECKED_OUT' ? 'neutral' :
                                  'warning'
                            }
                            size="sm"
                          >
                            {status.status === 'CHECKED_IN' ? 'Đang ở' :
                              status.status === 'CHECKED_OUT' ? 'Đã trả' :
                                status.status === 'ASSIGNED' ? 'Chờ nhận' :
                                  'Chưa gán'}
                          </StatusBadge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {status.hostPropertyName && <span>{status.hostPropertyName}</span>}
                          {status.hostRoomType && <span> • {status.hostRoomType}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {formatDate(status.dateFrom)} → {formatDate(status.dateTo)}
                        </div>
                        {!isUndoable && (
                          <div className="text-xs text-muted-foreground mt-1 italic">
                            {undoType === "CHECK_IN"
                              ? (status.status === 'CHECKED_OUT'
                                ? "Đã check-out, cần hoàn tác check-out trước"
                                : "Chưa check-in")
                              : "Chưa check-out"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {undoableTargets.length === 0 && (
              <div className="p-4 rounded-lg bg-muted/50 border text-center">
                <Undo2 className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Không có phòng nào có thể hoàn tác {undoType === "CHECK_IN" ? "nhận phòng" : "trả phòng"}
                </p>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú (tùy chọn)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lý do hoàn tác..."
              rows={2}
            />
          </div>

          {/* Selected Summary */}
          {selectedTargets.size > 0 && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-center gap-2 text-warning">
                <Undo2 className="h-4 w-4" />
                <span className="font-medium text-sm">
                  Sẽ hoàn tác {selectedTargets.size}/{undoableTargets.length} phòng
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="max-sm:hidden">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={submitDisabled}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <Undo2 className="h-4 w-4 mr-2" />
                  Hoàn tác {selectedTargets.size} phòng
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
