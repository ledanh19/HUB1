import { Link } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OtaBadge } from "@/components/ui/ota-badge";
import {
  Globe,
  Home,
  Phone,
  Mail,
  CalendarDays,
  Banknote,
  Building2,
  Eye,
  LogIn,
  LogOut,
  FileText,
  AlertTriangle,
  Repeat,
  Camera,
  Plus,
  Plane,
} from "lucide-react";

// Types matching StaysPage
interface SegmentInfo {
  segment_id: string;
  partner_id: string | null;
  host_property_name: string | null;
  host_room_type: string | null;
  room_code: string | null;
  date_from: string | null;
  date_to: string | null;
  nights: number;
  partners: { partner_name: string } | null;
  // Segment-level check-in/check-out tracking
  actual_check_in_at: string | null;
  actual_check_out_at: string | null;
}

interface CoverageInfo {
  totalNights: number;
  assignedNights: number;
  missingNights: number;
  isComplete: boolean;
}

interface BookingInfo {
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  nationality: string | null;
  check_in_date: string;
  check_out_date: string;
  nights: number | null;
  source: string;
  payment_type: string;
  pms_property_name: string | null;
  total_amount_net: number | null;
  total_amount_gross: number | null;
  booking_status: string | null;
  ota_booking_code: string | null;
  ota_room_type_sold: string | null;
  booking_created_at?: string | null;
}

interface StayWithBooking {
  id: string;
  unified_booking_id: string;
  stay_status: string | null;
  host_room_id: string | null;
  host_room_type: string | null;
  host_property_name: string | null;
  host_cost: number | null;
  actual_check_in_at: string | null;
  actual_check_out_at: string | null;
  operation_note: string | null;
  created_at: string;
  booking: BookingInfo | null;
  segment: SegmentInfo | null;
  coverage: CoverageInfo | null;
  amount_collected: number;
  // For multi-stay tracking
  stayIndex: number;
  totalStays: number;
  segmentIndex: number;
  totalSegments: number;
  hasRoomChange: boolean;
  // Derived: only the latest stay per unified_booking_id should be treated as "current"
  isCurrent: boolean;
  segmentKey: string;
}

interface StayDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stay: StayWithBooking | null;
  // Actions - truyền stay vào để parent có thể dùng
  onCheckIn?: (stay: StayWithBooking) => void;
  onCheckOut?: (stay: StayWithBooking) => void;
  onAssignRoom?: (stay: StayWithBooking) => void;
  onCollectPayment?: (stay: StayWithBooking) => void;
  onUploadDocument?: (stay: StayWithBooking) => void;
  onAddService?: (stay: StayWithBooking) => void;
  onAddSurcharge?: (stay: StayWithBooking) => void;
  canPerformActions?: boolean;
  documentStatus?: { status: string } | null;
  ownerBadge?: React.ReactNode;
}

const formatDate = (date: string | null | undefined) => {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const formatCurrency = (amount: number | null | undefined) => {
  if (amount == null) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

// Get stay status
const getStayStatus = (stay: StayWithBooking) => {
  if (!stay.segment) return { label: "Chưa phân bổ phòng", variant: "warning" };
  if (stay.actual_check_out_at) return { label: "Đã trả phòng", variant: "default" };
  if (stay.actual_check_in_at) return { label: "Đang ở", variant: "success" };
  return { label: "Chờ nhận phòng", variant: "info" };
};

/**
 * Calculate multi-room check-in/out statistics from segment data
 * This is used to determine action button labels and availability
 */
interface MultiRoomStats {
  isMultiRoom: boolean;
  totalSegments: number;
  checkedInCount: number;  // segments with actual_check_in_at
  checkedOutCount: number; // segments with actual_check_out_at 
  pendingCheckIn: number;  // segments without actual_check_in_at (but have room)
  canCheckInMore: boolean; // has pending check-in segments
  canCheckOutMore: boolean; // has checked-in but not checked-out segments
  allCheckedIn: boolean;
  allCheckedOut: boolean;
  isPartialCheckIn: boolean;
  isPartialCheckOut: boolean;
}

const getMultiRoomStats = (stay: StayWithBooking): MultiRoomStats => {
  const isMultiRoom = stay.totalSegments > 1;
  const total = stay.totalSegments;

  // For single segment or segment-level data
  // We determine counts based on the current segment's status
  // Since each row represents one segment, we track at booking level
  let checkedIn = 0;
  let checkedOut = 0;
  let pending = 0;

  // This is a simplified version - actual counts come from segment data
  // The stay row has segment-level check-in/out data from the join
  if (stay.segment) {
    if (stay.segment.actual_check_out_at) {
      checkedOut = 1; // This segment is checked out
    } else if (stay.segment.actual_check_in_at) {
      checkedIn = 1; // This segment is checked in
    } else {
      pending = 1; // This segment is pending
    }
  }

  // For multi-room, we need to aggregate across all segments
  // Since we don't have all segments here, we use indicators from the stay
  // The real counts should come from useHostSupplySegments in the dialog

  return {
    isMultiRoom,
    totalSegments: total,
    checkedInCount: checkedIn,
    checkedOutCount: checkedOut,
    pendingCheckIn: pending,
    canCheckInMore: pending > 0 || (isMultiRoom && !stay.actual_check_out_at),
    canCheckOutMore: checkedIn > 0 || (stay.actual_check_in_at && !stay.actual_check_out_at),
    allCheckedIn: total > 0 && checkedIn === total,
    allCheckedOut: total > 0 && checkedOut === total,
    isPartialCheckIn: isMultiRoom && checkedIn > 0 && checkedIn < total,
    isPartialCheckOut: isMultiRoom && checkedOut > 0 && checkedOut < total,
  };
};

export function StayDetailSheet({
  open,
  onOpenChange,
  stay,
  onCheckIn,
  onCheckOut,
  onAssignRoom,
  onCollectPayment,
  onUploadDocument,
  onAddService,
  onAddSurcharge,
  canPerformActions = true,
  documentStatus,
  ownerBadge,
}: StayDetailSheetProps) {
  if (!stay || !stay.booking) return null;

  const booking = stay.booking;
  const hasRoom = !!stay.segment;
  const hasFullCoverage = stay.coverage?.isComplete ?? false;
  const missingNights = stay.coverage?.missingNights ?? 0;
  const remainingAmount = (booking.total_amount_net || 0) - stay.amount_collected;

  // Multi-room stats for action button logic
  // Note: This uses row-level data. Accurate count shown in dialog.
  const multiStats = getMultiRoomStats(stay);

  // For multi-room: show both buttons, let dialog handle the details
  // For single-room: original logic
  const canCheckIn = multiStats.isMultiRoom
    ? (hasRoom && !multiStats.allCheckedOut)
    : (!stay.actual_check_in_at && hasRoom);

  // For multi-room: show check-out if any segment checked in
  // For single-room: original logic
  const canCheckOut = multiStats.isMultiRoom
    ? (stay.actual_check_in_at || multiStats.checkedInCount > 0)
    : (stay.actual_check_in_at && !stay.actual_check_out_at);

  const status = getStayStatus(stay);
  const hasDocument = documentStatus?.status !== "NO_DOCUMENT";

  // Button labels for multi-room
  // Simplified: show "(X phòng)" indicator, dialog shows accurate progress
  const checkInLabel = multiStats.isMultiRoom
    ? `Nhận phòng (${multiStats.totalSegments} phòng)`
    : "Nhận phòng";
  const checkOutLabel = multiStats.isMultiRoom
    ? `Trả phòng (${multiStats.totalSegments} phòng)`
    : "Trả phòng";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {/* Header: Tên khách + Trạng thái */}
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-xl">{booking.guest_name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <OtaBadge source={booking.source} size="sm" />
                <StatusBadge variant={status.variant as any} size="sm">
                  {status.label}
                </StatusBadge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        {/* Action Group - Nhóm action chính */}
        {canPerformActions && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {/* Check-in */}
              {canCheckIn && onCheckIn && (
                <Button size="sm" onClick={() => onCheckIn(stay)}>
                  <LogIn className="h-4 w-4 mr-1" />
                  {checkInLabel}
                </Button>
              )}

              {/* Check-out */}
              {canCheckOut && onCheckOut && (
                <Button size="sm" variant="outline" onClick={() => onCheckOut(stay)}>
                  <LogOut className="h-4 w-4 mr-1" />
                  {checkOutLabel}
                </Button>
              )}

              {/* Phân bổ phòng */}
              {!hasFullCoverage && onAssignRoom && (
                <Button size="sm" variant="outline" onClick={() => onAssignRoom(stay)}>
                  <Building2 className="h-4 w-4 mr-1" />
                  {missingNights > 0 ? `Phân bổ (thiếu ${missingNights} đêm)` : "Phân bổ phòng"}
                </Button>
              )}

              {/* Thu tiền */}
              {onCollectPayment && (
                <Button
                  size="sm"
                  variant={remainingAmount > 0 && booking.payment_type === "HOTEL_COLLECT" ? "default" : "outline"}
                  onClick={() => onCollectPayment(stay)}
                >
                  <Banknote className="h-4 w-4 mr-1" />
                  {remainingAmount > 0 && booking.payment_type === "HOTEL_COLLECT"
                    ? `Thu ${formatCurrency(remainingAmount)}`
                    : "Thu tiền"}
                </Button>
              )}

              {/* Upload CCCD */}
              {!hasDocument && onUploadDocument && (
                <Button size="sm" variant="outline" onClick={() => onUploadDocument(stay)}>
                  <Camera className="h-4 w-4 mr-1" />
                  Tải CCCD
                </Button>
              )}

              {/* Thêm DV */}
              {onAddService && (
                <Button size="sm" variant="outline" onClick={() => onAddService(stay)}>
                  <Plane className="h-4 w-4 mr-1" />
                  Thêm DV
                </Button>
              )}

              {/* Phụ phí */}
              {hasRoom && onAddSurcharge && (
                <Button size="sm" variant="outline" onClick={() => onAddSurcharge(stay)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Phụ phí
                </Button>
              )}

              {/* Xem chi tiết */}
              <Button size="sm" variant="ghost" asChild>
                <Link to={`/bookings/${stay.unified_booking_id}`}>
                  <Eye className="h-4 w-4 mr-1" />
                  Chi tiết đầy đủ
                </Link>
              </Button>
            </div>

            <Separator className="my-4" />
          </>
        )}

        {/* Content: Chi tiết đầy đủ */}
        <div className="space-y-6">
          {/* Thông tin khách */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Thông tin khách
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{booking.guest_phone || "—"}</span>
              </div>
              {booking.guest_email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{booking.guest_email}</span>
                </div>
              )}
              {booking.nationality && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>{booking.nationality}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Thông tin OTA */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Thông tin OTA
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nguồn:</span>
                <span className="font-medium">{booking.source}</span>
              </div>
              {booking.ota_booking_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mã booking:</span>
                  <span className="font-medium">{booking.ota_booking_code}</span>
                </div>
              )}
              {booking.pms_property_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Property OTA:</span>
                  <span className="font-medium">{booking.pms_property_name}</span>
                </div>
              )}
              {booking.ota_room_type_sold && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loại phòng OTA:</span>
                  <span className="font-medium text-right max-w-[180px] truncate" title={booking.ota_room_type_sold}>
                    {booking.ota_room_type_sold}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ngày lưu trú:</span>
                <span className="font-medium">
                  {formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Số đêm:</span>
                <span className="font-medium">{booking.nights} đêm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Doanh thu:</span>
                <span className="font-semibold text-primary">{formatCurrency(booking.total_amount_net)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Thông tin Host / Segment */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Phòng Host
              {stay.totalSegments > 1 && (
                <span className="text-primary text-xs">Segment {stay.segmentIndex}/{stay.totalSegments}</span>
              )}
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Host:</span>
                <span className="font-medium">
                  {stay.segment?.partners?.partner_name || <span className="text-destructive">Chưa gán</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chỗ nghỉ:</span>
                <span className="font-medium">
                  {stay.segment?.host_property_name || <span className="text-destructive">Chưa gán</span>}
                </span>
              </div>
              {stay.segment?.host_room_type && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loại phòng:</span>
                  <span className="font-medium">{stay.segment.host_room_type}</span>
                </div>
              )}
              {stay.segment?.room_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mã phòng:</span>
                  <span className="font-bold text-primary">{stay.segment.room_code}</span>
                </div>
              )}
              {stay.totalSegments > 1 && stay.segment?.date_from && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ngày segment:</span>
                  <span className="font-medium">
                    {formatDate(stay.segment.date_from)} → {formatDate(stay.segment.date_to)}
                    <span className="text-muted-foreground ml-1">({stay.segment.nights} đêm)</span>
                  </span>
                </div>
              )}

              {/* Coverage warning */}
              {hasRoom && !hasFullCoverage && missingNights > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-warning/100/10 text-warning mt-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-xs">
                    Thiếu {missingNights}/{booking.nights} đêm - Cần gán thêm phòng
                  </span>
                </div>
              )}

              {stay.hasRoomChange && (
                <div className="flex items-center gap-2 mt-2">
                  <Repeat className="h-4 w-4 text-info" />
                  <span className="text-xs text-info">Có đổi phòng trong kỳ lưu trú</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Thông tin thanh toán */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Thanh toán
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Hình thức:</span>
                <StatusBadge
                  variant={booking.payment_type === "HOTEL_COLLECT" ? "warning" : "info"}
                  size="sm"
                >
                  {booking.payment_type === "HOTEL_COLLECT" ? "Khách sạn thu" : "OTA thu trước"}
                </StatusBadge>
              </div>
              {booking.payment_type === "HOTEL_COLLECT" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phải thu:</span>
                    <span className="font-semibold">{formatCurrency(booking.total_amount_net)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Đã thu:</span>
                    <span className={stay.amount_collected > 0 ? "text-success font-medium" : ""}>
                      {formatCurrency(stay.amount_collected)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Còn lại:</span>
                    <span className={remainingAmount > 0 ? "text-destructive font-bold" : "text-success font-bold"}>
                      {formatCurrency(remainingAmount)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tiền phòng:</span>
                  <span className="text-success font-medium">OTA đã thu</span>
                </div>
              )}
            </div>
          </div>

          {/* Người phụ trách */}
          {ownerBadge && (
            <>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Phụ trách:</span>
                {ownerBadge}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
