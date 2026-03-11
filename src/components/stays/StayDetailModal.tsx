import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Globe,
  Home,
  Phone,
  Mail,
  CalendarDays,
  Banknote,
  Building2,
  User,
  Eye,
  LogIn,
  LogOut,
  FileText,
  AlertTriangle,
  Repeat,
  FileWarning,
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
}

interface StayWithBooking {
  id: string;
  unified_booking_id: string;
  stay_status: string | null;
  actual_check_in_at: string | null;
  actual_check_out_at: string | null;
  booking: BookingInfo | null;
  segment: SegmentInfo | null;
  coverage: CoverageInfo | null;
  amount_collected: number;
  segmentIndex: number;
  totalSegments: number;
  hasRoomChange: boolean;
}

interface StayDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stay: StayWithBooking | null;
  viewType: "no_room" | "other"; // no_room shows OTA info, others show Host info
  onCheckIn?: () => void;
  onCheckOut?: () => void;
  onAssignRoom?: () => void;
  onCollectPayment?: () => void;
  onUploadDoc?: () => void;
  canPerformActions?: boolean;
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

export function StayDetailModal({
  open,
  onOpenChange,
  stay,
  viewType,
  onCheckIn,
  onCheckOut,
  onAssignRoom,
  onCollectPayment,
  onUploadDoc,
  canPerformActions = true,
}: StayDetailModalProps) {
  if (!stay || !stay.booking) return null;

  const booking = stay.booking;
  const hasRoom = !!stay.segment;
  const hasFullCoverage = stay.coverage?.isComplete ?? false;
  const missingNights = stay.coverage?.missingNights ?? booking.nights ?? 0;
  const remainingAmount = (booking.total_amount_net || 0) - stay.amount_collected;
  const canCheckIn = !stay.actual_check_in_at && hasRoom;
  const canCheckOut = stay.actual_check_in_at && !stay.actual_check_out_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {booking.guest_name}
            {stay.totalSegments > 1 && (
              <span className="text-xs font-normal text-muted-foreground">
                (Segment {stay.segmentIndex}/{stay.totalSegments})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Status Tags */}
        <div className="flex flex-wrap gap-2">
          {!hasRoom && (
            <StatusBadge variant="danger" size="sm">
              <Home className="h-3 w-3 mr-1" />
              Chưa phân bổ phòng
            </StatusBadge>
          )}
          {hasRoom && !hasFullCoverage && missingNights > 0 && (
            <StatusBadge variant="warning" size="sm">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Thiếu {missingNights} đêm
            </StatusBadge>
          )}
          {stay.hasRoomChange && (
            <StatusBadge variant="info" size="sm">
              <Repeat className="h-3 w-3 mr-1" />
              Đổi phòng
            </StatusBadge>
          )}
          <StatusBadge variant={booking.payment_type === "HOTEL_COLLECT" ? "warning" : "info"} size="sm">
            {booking.payment_type === "HOTEL_COLLECT" ? "KS thu" : "OTA thu trước"}
          </StatusBadge>
        </div>

        <Separator />

        {/* Content based on viewType */}
        {viewType === "no_room" ? (
          // OTA Info for no_room tab
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Globe className="h-4 w-4" />
              Thông tin OTA
            </div>
            <div className="grid gap-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nguồn OTA:</span>
                <span className="font-medium">{booking.source}</span>
              </div>
              {booking.pms_property_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Property OTA:</span>
                  <span className="font-medium">{booking.pms_property_name}</span>
                </div>
              )}
              {booking.ota_booking_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mã booking OTA:</span>
                  <span className="font-medium">{booking.ota_booking_code}</span>
                </div>
              )}
              {booking.ota_room_type_sold && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Loại phòng OTA:</span>
                  <span className="font-medium text-right max-w-[200px] truncate" title={booking.ota_room_type_sold}>
                    {booking.ota_room_type_sold}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ngày lưu trú:</span>
                <span className="font-medium">
                  {formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)}
                  <span className="text-muted-foreground ml-1">({booking.nights} đêm)</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Doanh thu OTA:</span>
                <span className="font-semibold text-primary">{formatCurrency(booking.total_amount_net)}</span>
              </div>
            </div>
          </div>
        ) : (
          // Host Info for other tabs
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Building2 className="h-4 w-4" />
              Thông tin phòng Host
            </div>
            <div className="grid gap-3 text-xs">
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
            </div>
          </div>
        )}

        <Separator />

        {/* Guest Info - Always shown */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <User className="h-4 w-4" />
            Thông tin khách
          </div>
          <div className="grid gap-3 text-xs">
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

        {/* Payment Info - Always shown */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Banknote className="h-4 w-4" />
            Thông tin thanh toán
          </div>
          <div className="grid gap-3 text-xs">
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
                  <span className={remainingAmount > 0 ? "text-warning font-bold" : "text-success font-bold"}>
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

        {/* Actions */}
        {canPerformActions && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {canCheckIn && onCheckIn && (
                <Button size="sm" onClick={onCheckIn}>
                  <LogIn className="h-4 w-4 mr-1" />
                  Nhận phòng
                </Button>
              )}
              {canCheckOut && onCheckOut && (
                <Button size="sm" variant="outline" onClick={onCheckOut}>
                  <LogOut className="h-4 w-4 mr-1" />
                  Trả phòng
                </Button>
              )}
              {!hasRoom && onAssignRoom && (
                <Button size="sm" variant="outline" onClick={onAssignRoom}>
                  <Building2 className="h-4 w-4 mr-1" />
                  Phân bổ phòng
                </Button>
              )}
              {onCollectPayment && (
                <Button
                  size="sm"
                  variant={remainingAmount > 0 ? "secondary" : "outline"}
                  className={remainingAmount > 0 ? "bg-warning/20 text-warning hover:bg-warning/30" : ""}
                  onClick={onCollectPayment}
                >
                  <Banknote className="h-4 w-4 mr-1" />
                  Thu tiền
                </Button>
              )}
              {onUploadDoc && (
                <Button size="sm" variant="outline" onClick={onUploadDoc}>
                  <FileText className="h-4 w-4 mr-1" />
                  Tải giấy tờ
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <Link to={`/bookings/${stay.unified_booking_id}`}>
                  <Eye className="h-4 w-4 mr-1" />
                  Xem chi tiết đầy đủ
                </Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
