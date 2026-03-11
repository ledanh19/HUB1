import { useState, useMemo } from 'react';
import { format, parseISO, differenceInHours } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Calendar, Trash2, Edit, AlertTriangle, CheckCircle, XCircle, AlertCircle, Home, Lock, DollarSign } from 'lucide-react';
import {
  useHostSupplySegments,
  useHostExtraCharges,
  useDeleteSegment,
  useDeleteExtraCharge,
  calculateNights,
  findOverlaps,
  getBookingDates,
  getAssignedDates,
  getMissingDates,
  HostSupplySegment,
  HostExtraCharge
} from '@/hooks/useHostSupplySegments';
import { useBookingRoomLines, calculateMultiRoomCoverage } from '@/hooks/useBookingRoomLines';
import { AddSegmentDialog } from './AddSegmentDialog';
import { AddExtraChargeDialog } from './AddExtraChargeDialog';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from '@/components/ui/textarea';

interface Props {
  unifiedBookingId: string;
  checkInDate: string;
  checkOutDate: string;
  stayStatus?: string;
  isReadOnly?: boolean;
  isSettled?: boolean;
  /** Hide the coverage status card + alerts (used when mobile wrapper shows its own) */
  hideCoverageSummary?: boolean;
  /** Hide the "TỔNG CHI PHÍ HOST" grand total card */
  hideGrandTotal?: boolean;
  /** Hide the "Phân bổ phòng" add button inside segment list header */
  hideAddButton?: boolean;
  /** External callback for deposit — shows Cọc button in allocation list header */
  onDeposit?: () => void;
  /** External callback for extra charge — shows Phụ phí button in extra charges header */
  onAddExtraChargeExternal?: () => void;
  /** External callback for allocation — shows Phân bổ button in timeline header */
  onAddSegmentExternal?: () => void;
  /** Whether deposit button should be disabled */
  depositDisabled?: boolean;
}

const CHARGE_TYPE_LABELS: Record<string, string> = {
  EARLY_CHECKIN: 'Nhận phòng sớm',
  LATE_CHECKOUT: 'Trả phòng muộn',
  CLEANING: 'Phí dọn phòng',
  CARD_FEE: 'Phí thẻ',
  OTHER: 'Khác',
};

/** Valid settlement statuses where "Đã QT" badge should display */
const SETTLED_VALID_STATUSES = ['SETTLED', 'CLOSED', 'FINALIZED'];

/**
 * Check if a segment/charge is truly settled (defense-in-depth).
 * Requires canonical settlement status — raw settlement_id alone is NOT sufficient.
 * If settlement status is unavailable (join failed), badge is suppressed for safety.
 */
function isItemSettled(item: { settlement_id: string | null; settlement?: { status: string } | null }): boolean {
  if (!item.settlement_id) return false;
  // Require enriched settlement status — no fallback to raw linkage
  if (!item.settlement) return false;
  return SETTLED_VALID_STATUSES.includes(item.settlement.status);
}

export function HostSupplySegments({
  unifiedBookingId,
  checkInDate,
  checkOutDate,
  stayStatus,
  isReadOnly = false,
  isSettled = false,
  hideCoverageSummary = false,
  hideGrandTotal = false,
  hideAddButton = false,
  onDeposit,
  onAddExtraChargeExternal,
  onAddSegmentExternal,
  depositDisabled = false,
}: Props) {
  const { userRole } = useAuth();
  const { data: segments = [], isLoading: segmentsLoading } = useHostSupplySegments(unifiedBookingId);
  const { data: extraCharges = [], isLoading: chargesLoading } = useHostExtraCharges(unifiedBookingId);
  const { data: roomLines = [], isLoading: roomLinesLoading } = useBookingRoomLines(unifiedBookingId);
  const deleteSegment = useDeleteSegment();
  const deleteExtraCharge = useDeleteExtraCharge();

  const [addSegmentOpen, setAddSegmentOpen] = useState(false);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [editSegment, setEditSegment] = useState<HostSupplySegment | null>(null);
  const [editCharge, setEditCharge] = useState<HostExtraCharge | null>(null); // NEW: for editing extra charges
  const [deleteConfirmSegment, setDeleteConfirmSegment] = useState<HostSupplySegment | null>(null);
  const [deleteConfirmCharge, setDeleteConfirmCharge] = useState<HostExtraCharge | null>(null);
  const [selectedRoomLineIndex, setSelectedRoomLineIndex] = useState<number>(0);

  // Check if this is a multi-room booking
  const isMultiRoom = roomLines.length > 1;
  const roomCount = isMultiRoom ? roomLines.length : 1;

  // Multi-room coverage calculation
  const multiRoomCoverage = useMemo(() => {
    if (!isMultiRoom) return null;
    return calculateMultiRoomCoverage(roomLines, segments);
  }, [roomLines, segments, isMultiRoom]);

  // Single-room coverage status (original logic)
  const coverageStatus = useMemo(() => {
    if (isMultiRoom && multiRoomCoverage) {
      return {
        totalNights: multiRoomCoverage.totalRequired,
        assignedNights: multiRoomCoverage.totalCovered,
        missingNights: multiRoomCoverage.totalMissing,
        missingDates: [] as string[],
        overlappingDates: [] as string[],
        isComplete: multiRoomCoverage.allComplete,
        hasOverlap: false,
      };
    }

    const bookingDates = getBookingDates(checkInDate, checkOutDate);
    const assignedDates = getAssignedDates(segments);
    const missingDates = getMissingDates(bookingDates, assignedDates);
    const overlappingDates = findOverlaps(segments);

    return {
      totalNights: bookingDates.length,
      assignedNights: assignedDates.length,
      missingNights: missingDates.length,
      missingDates,
      overlappingDates,
      isComplete: missingDates.length === 0 && overlappingDates.length === 0,
      hasOverlap: overlappingDates.length > 0,
    };
  }, [segments, checkInDate, checkOutDate, isMultiRoom, multiRoomCoverage]);

  // Check if booking is approaching (< 24h)
  const isApproaching = useMemo(() => {
    const checkIn = parseISO(checkInDate);
    const now = new Date();
    const hoursUntilCheckIn = differenceInHours(checkIn, now);
    return hoursUntilCheckIn > 0 && hoursUntilCheckIn < 24;
  }, [checkInDate]);

  // Editing policy per latest user requirement:
  // - Allow segment edits whenever booking is not settled
  // - Do not force reason-note in UI
  const isCheckedIn = stayStatus === 'CHECKED_IN' || stayStatus === 'IN_HOUSE';
  const canEdit = !isReadOnly && !isSettled;
  const requiresReason = false;

  // Generate timeline dates
  const timelineDates = useMemo(() => {
    return getBookingDates(checkInDate, checkOutDate);
  }, [checkInDate, checkOutDate]);

  // Get segment for a specific date and room line
  const getSegmentForDate = (date: string, roomLineIndex: number = 0) => {
    return segments.find(seg => {
      const segFrom = new Date(seg.date_from);
      const segTo = new Date(seg.date_to);
      const checkDate = new Date(date);
      const matchesRoom = seg.room_line_index === roomLineIndex;
      return checkDate >= segFrom && checkDate < segTo && matchesRoom;
    });
  };

  // Get unique color for each partner
  const partnerColors = useMemo(() => {
    const colors = [
      'bg-info/100/20 border-info/50 text-info',
      'bg-success/100/20 border-success/50 text-success',
      'bg-primary/100/20 border-primary/20 text-primary',
      'bg-warning/100/20 border-warning/30 text-warning',
      'bg-primary/10 border-primary/20 text-primary',
      'bg-info/100/20 border-info/20 text-info',
    ];
    const map: Record<string, string> = {};
    const uniquePartners = [...new Set(segments.map(s => s.partner_id))];
    uniquePartners.forEach((partnerId, index) => {
      map[partnerId] = colors[index % colors.length];
    });
    return map;
  }, [segments]);

  const handleAddSegmentForRoom = (roomLineIndex: number) => {
    setSelectedRoomLineIndex(roomLineIndex);
    setAddSegmentOpen(true);
  };

  // handleCopySegment removed - copy feature disabled per user request

  const handleDeleteSegment = (segment: HostSupplySegment) => {
    setDeleteConfirmSegment(segment);
  };

  const confirmDeleteSegment = () => {
    if (deleteConfirmSegment) {
      deleteSegment.mutate({
        segmentId: deleteConfirmSegment.id,
        unifiedBookingId,
      });
      setDeleteConfirmSegment(null);
    }
  };

  const handleDeleteCharge = (charge: HostExtraCharge) => {
    setDeleteConfirmCharge(charge);
  };

  const confirmDeleteCharge = () => {
    if (deleteConfirmCharge) {
      deleteExtraCharge.mutate({
        chargeId: deleteConfirmCharge.id,
        unifiedBookingId,
      });
      setDeleteConfirmCharge(null);
    }
  };

  // Get segments for a specific room line
  const getSegmentsForRoom = (roomLineIndex: number) => {
    return segments.filter(s => s.room_line_index === roomLineIndex);
  };

  if (segmentsLoading || chargesLoading || roomLinesLoading) {
    return <div className="text-muted-foreground">Đang tải...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Multi-room indicator */}
      {!hideCoverageSummary && isMultiRoom && (
        <Alert className="border-info/50 bg-info/100/10">
          <Home className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Booking nhiều phòng:</span> {roomCount} phòng cần được phân bổ riêng
          </AlertDescription>
        </Alert>
      )}

      {/* Coverage Status Alert */}
      {!hideCoverageSummary && !coverageStatus.isComplete && (
        <Alert variant={coverageStatus.hasOverlap ? 'destructive' : 'default'} className={coverageStatus.hasOverlap ? '' : 'border-warning/50 bg-warning/100/10'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {coverageStatus.hasOverlap && (
              <div className="text-destructive font-medium">
                ⚠️ Có ngày bị chồng lấn: {coverageStatus.overlappingDates.join(', ')}
              </div>
            )}
            {coverageStatus.missingNights > 0 && (
              <div className="text-warning">
                ⚠️ Thiếu {coverageStatus.missingNights} đêm{isMultiRoom ? ` (${roomCount} phòng × ${roomLines[0]?.nights || 0} đêm)` : ''}
              </div>
            )}
            {!isCheckedIn && coverageStatus.missingNights > 0 && (
              <div className="text-sm mt-1 text-muted-foreground">
                Không thể check-in khi chưa phân bổ phòng
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Approaching Check-in Warning */}
      {!hideCoverageSummary && isApproaching && !coverageStatus.isComplete && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            🚨 Booking sắp check-in (trong 24h) nhưng chưa đủ phòng Host!
          </AlertDescription>
        </Alert>
      )}

      {/* Coverage Summary */}
      {!hideCoverageSummary && (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Trạng thái đảm bảo phòng</span>
            {coverageStatus.isComplete ? (
              <Badge variant="default" className="bg-success text-white w-fit">
                <CheckCircle className="h-3 w-3 mr-1" />
                Đủ đêm
              </Badge>
            ) : coverageStatus.hasOverlap ? (
              <Badge variant="destructive" className="w-fit">
                <XCircle className="h-3 w-3 mr-1" />
                Có chồng lấn
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-warning/10 text-warning w-fit">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Thiếu đêm
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-center">
            {isMultiRoom && (
              <div>
                <div className="text-xl sm:text-2xl font-bold text-info">{roomCount}</div>
                <div className="text-xs text-muted-foreground">Số phòng</div>
              </div>
            )}
            <div>
              <div className="text-xl sm:text-2xl font-bold">{coverageStatus.totalNights}</div>
              <div className="text-xs text-muted-foreground">Tổng đêm cần</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-success">{coverageStatus.assignedNights}</div>
              <div className="text-xs text-muted-foreground">Đã phân bổ</div>
            </div>
            <div>
              <div className={`text-xl sm:text-2xl font-bold ${coverageStatus.missingNights > 0 ? 'text-destructive' : 'text-success'}`}>
                {coverageStatus.missingNights}
              </div>
              <div className="text-xs text-muted-foreground">Còn thiếu</div>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Multi-room Segments by Room Line */}
      {isMultiRoom ? (
        <div className="space-y-4">
          {roomLines.map((roomLine, index) => {
            const roomSegments = getSegmentsForRoom(index);
            const roomCoverage = multiRoomCoverage?.roomCoverages[index];
            const isRoomComplete = roomCoverage?.isComplete ?? false;

            return (
              <Card key={roomLine.id}>
                <CardHeader className="pb-2">
                  {/* Mobile-friendly stacked layout */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="text-base flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <Badge variant="outline" className="text-xs shrink-0">Phòng {index + 1}</Badge>
                      <span className="text-sm text-muted-foreground truncate max-w-[140px] sm:max-w-none">
                        {roomLine.room_type || 'Chưa xác định'}
                      </span>
                      {isRoomComplete ? (
                        <Badge variant="default" className="bg-success text-white text-xs shrink-0">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {roomCoverage?.coveredNights}/{roomCoverage?.totalNights} đêm
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-warning/10 text-warning text-xs shrink-0">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {roomCoverage?.coveredNights || 0}/{roomCoverage?.totalNights || roomLine.nights} đêm
                        </Badge>
                      )}
                    </CardTitle>
                    {canEdit && (
                      <Button size="sm" onClick={() => handleAddSegmentForRoom(index)} className="w-full sm:w-auto shrink-0">
                        <Plus className="h-4 w-4 mr-1" />
                        <span className="sm:inline">Thêm</span>
                        <span className="hidden sm:inline ml-1">Phân bổ</span>
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(parseISO(roomLine.check_in_date), 'dd/MM/yyyy')} → {format(parseISO(roomLine.check_out_date), 'dd/MM/yyyy')}
                    {roomLine.amount && ` • ${roomLine.amount.toLocaleString()}đ`}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Timeline for this room */}
                  <div className="flex gap-1 flex-wrap mb-3">
                    {timelineDates.map((date) => {
                      const segment = getSegmentForDate(date, index);
                      const isMissing = !segment;

                      return (
                        <div
                          key={date}
                          className={`
                            px-2 py-1 text-xs rounded border
                            ${isMissing ? 'bg-muted/50 border-dashed border-muted-foreground/30 text-muted-foreground' :
                              segment ? partnerColors[segment.partner_id] : 'bg-muted/50 text-muted-foreground'}
                          `}
                          title={segment ? `${segment.partner?.partner_name || 'Host'} - ${segment.nightly_rate.toLocaleString()}đ` : 'Chưa gán'}
                        >
                          {format(parseISO(date), 'dd/MM')}
                        </div>
                      );
                    })}
                  </div>

                  {/* Segments for this room - hidden in timeline, shown in allocation list */}
                </CardContent>
              </Card>
            );
          })}

          {/* Total Summary for all rooms */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col sm:flex-row sm:justify-between gap-1 font-semibold text-base sm:text-lg">
                <span className="text-muted-foreground sm:text-foreground">Tổng cộng ({segments.reduce((sum, s) => sum + s.nights, 0)} đêm × {roomCount} phòng)</span>
                <span className="text-primary">{segments.reduce((sum, s) => sum + s.total_amount, 0).toLocaleString()}đ</span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Single-room layout (original) */
        <>
          {/* Timeline Visualization */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Timeline theo đêm
                </CardTitle>
                {onAddSegmentExternal && (
                  <Button variant="outline" size="sm" onClick={onAddSegmentExternal} className="h-6 px-2 text-[11px] gap-1">
                    <Plus className="h-3 w-3" />Phân bổ
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-1 flex-wrap">
                {timelineDates.map((date) => {
                  const segment = getSegmentForDate(date, 0);
                  const isOverlap = coverageStatus.overlappingDates.includes(date);
                  const isMissing = coverageStatus.missingDates.includes(date);

                  return (
                    <div
                      key={date}
                      className={`
                        px-2 py-1 text-xs rounded border
                        ${isOverlap ? 'bg-destructive/30 border-destructive text-destructive' :
                          isMissing ? 'bg-muted/50 border-dashed border-muted-foreground/30 text-muted-foreground' :
                            segment ? partnerColors[segment.partner_id] : 'bg-muted/50 text-muted-foreground'}
                      `}
                      title={segment ? `${segment.partner?.partner_name || 'Host'} - ${segment.nightly_rate.toLocaleString()}đ` : 'Chưa gán'}
                    >
                      {format(parseISO(date), 'dd/MM')}
                    </div>
                  );
                })}
              </div>

              {/* Legend hidden on mobile for cleaner layout */}
            </CardContent>
          </Card>

          {/* Segments List */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base whitespace-nowrap">Danh sách Phân bổ phòng</CardTitle>
                <div className="flex gap-1.5">
                  {canEdit && !hideAddButton && (
                    <Button size="sm" onClick={() => handleAddSegmentForRoom(0)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Phân bổ phòng
                    </Button>
                  )}
                  {onDeposit && (
                    <Button variant="outline" size="sm" disabled={depositDisabled} onClick={onDeposit} className="h-6 px-2 text-[11px] gap-1">
                      <DollarSign className="h-3 w-3" />Cọc
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {segments.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  Hiện chưa có phòng được phân bổ. Nhấn "Phân bổ phòng" để bắt đầu.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {segments.map((segment) => (
                    <div key={segment.id} className="py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-foreground">
                          {segment.partner?.partner_name || 'Host'}
                          {segment.host_property_name && ` - ${segment.host_property_name}`}
                        </span>
                        <div className="flex items-center gap-1">
                          {canEdit && !isItemSettled(segment) && !segment.settlement_id && (
                            <>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => {
                                setSelectedRoomLineIndex(segment.room_line_index ?? 0);
                                setEditSegment(segment);
                              }} title="Sửa">
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteSegment(segment)} title="Xóa">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {isItemSettled(segment) && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground h-5">Đã QT</Badge>
                          )}
                        </div>
                      </div>
                      <div className="divide-y divide-border/20">
                        {segment.host_room_type && (
                          <div className="flex items-center justify-between py-[4px]">
                            <span className="text-xs text-muted-foreground">Loại phòng</span>
                            <span className="text-xs font-medium text-foreground">{segment.host_room_type}</span>
                          </div>
                        )}
                        {segment.room_code && (
                          <div className="flex items-center justify-between py-[4px]">
                            <span className="text-xs text-muted-foreground">Mã căn hộ</span>
                            <span className="text-xs font-medium text-foreground">{segment.room_code}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between py-[4px]">
                          <span className="text-xs text-muted-foreground">Nhận phòng</span>
                          <span className="text-xs font-medium text-foreground">{format(parseISO(segment.date_from), 'dd/MM/yyyy')}</span>
                        </div>
                        <div className="flex items-center justify-between py-[4px]">
                          <span className="text-xs text-muted-foreground">Trả phòng</span>
                          <span className="text-xs font-medium text-foreground">{format(parseISO(segment.date_to), 'dd/MM/yyyy')}</span>
                        </div>
                        <div className="flex items-center justify-between py-[4px]">
                          <span className="text-xs text-muted-foreground">Số đêm</span>
                          <span className="text-xs font-medium text-foreground">{segment.nights} đêm</span>
                        </div>
                        <div className="flex items-center justify-between py-[4px]">
                          <span className="text-xs text-muted-foreground">Đơn giá</span>
                          <span className="text-xs font-medium text-foreground">{segment.nightly_rate.toLocaleString()}đ</span>
                        </div>
                        <div className="flex items-center justify-between py-[4px]">
                          <span className="text-xs text-muted-foreground">Thành tiền</span>
                          <span className="text-xs font-bold text-primary tabular-nums">{segment.total_amount.toLocaleString()}đ</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Totals */}
                  <div className="pt-3 border-t border-border">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Tổng cộng ({segments.reduce((sum, s) => sum + s.nights, 0)} đêm)</span>
                      <span className="text-primary">{segments.reduce((sum, s) => sum + s.total_amount, 0).toLocaleString()}đ</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Extra Charges */}
      <Card data-section="host-extra-charges">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Phụ phí Host</CardTitle>
            {onAddExtraChargeExternal && (
              <Button variant="outline" size="sm" onClick={onAddExtraChargeExternal} className="h-6 px-2 text-[11px] gap-1">
                <Plus className="h-3 w-3" />Phụ phí
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {extraCharges.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              Chưa có phụ phí
            </div>
          ) : (
            <div className="space-y-2">
              {extraCharges.map((charge) => (
                <div
                  key={charge.id}
                  className="p-3 rounded-lg border bg-muted/30 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">
                      {CHARGE_TYPE_LABELS[charge.charge_type] || charge.charge_type}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {charge.partner?.partner_name}
                      {charge.note && ` - ${charge.note}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{charge.amount.toLocaleString()}đ</span>
                    {isItemSettled(charge) ? (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        <Lock className="h-3 w-3 mr-1" />
                        Đã QT
                      </Badge>
                    ) : canEdit && !charge.settlement_id && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setEditCharge(charge)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteCharge(charge)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Extra charges total */}
              <div className="pt-2 border-t border-border">
                <div className="flex justify-between font-medium">
                  <span>Tổng phụ phí</span>
                  <span className="text-primary">{extraCharges.reduce((sum, c) => sum + c.amount, 0).toLocaleString()}đ</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grand Total */}
      {!hideGrandTotal && (
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-4">
          <div className="flex justify-between font-bold text-xl">
            <span>TỔNG CHI PHÍ HOST</span>
            <span className="text-primary">
              {(segments.reduce((sum, s) => sum + s.total_amount, 0) + extraCharges.reduce((sum, c) => sum + c.amount, 0)).toLocaleString()}đ
            </span>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Dialogs */}
      <AddSegmentDialog
        open={addSegmentOpen || !!editSegment}
        onOpenChange={(open) => {
          setAddSegmentOpen(open);
          if (!open) {
            setEditSegment(null);
          }
        }}
        unifiedBookingId={unifiedBookingId}
        checkInDate={checkInDate}
        checkOutDate={checkOutDate}
        existingSegments={isMultiRoom ? getSegmentsForRoom(selectedRoomLineIndex) : segments}
        editSegment={editSegment}
        requiresReason={requiresReason}
        roomLineIndex={selectedRoomLineIndex}
        isMultiRoom={isMultiRoom}
      />

      <AddExtraChargeDialog
        open={addChargeOpen || !!editCharge}
        onOpenChange={(open) => {
          setAddChargeOpen(open);
          if (!open) {
            setEditCharge(null);
          }
        }}
        unifiedBookingId={unifiedBookingId}
        segments={segments}
        editCharge={editCharge}
      />

      {/* Delete Segment Confirmation */}
      <AlertDialog open={!!deleteConfirmSegment} onOpenChange={(open) => !open && setDeleteConfirmSegment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa Segment</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa segment này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            {/* shadcn AlertDialogAction: no variant prop — inline destructive style required */}
            <AlertDialogAction onClick={confirmDeleteSegment} className="bg-destructive text-destructive-foreground">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Charge Confirmation */}
      <AlertDialog open={!!deleteConfirmCharge} onOpenChange={(open) => !open && setDeleteConfirmCharge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa phụ phí</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa phụ phí này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            {/* shadcn AlertDialogAction: no variant prop — inline destructive style required */}
            <AlertDialogAction onClick={confirmDeleteCharge} className="bg-destructive text-destructive-foreground">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
