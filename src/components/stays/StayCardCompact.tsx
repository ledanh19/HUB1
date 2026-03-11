import { forwardRef } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Globe,
  Home,
  Phone,
  Building2,
  AlertTriangle,
  Repeat,
  Banknote,
  User,
  CalendarDays,
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
  segmentKey: string;
}

interface StayCardCompactProps {
  stay: StayWithBooking;
  viewType: "no_room" | "other"; // no_room shows OTA info, others show Host info
  onClick?: () => void;
  isSelected?: boolean;
}

const formatDate = (date: string | null | undefined) => {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};

const formatCurrency = (amount: number | null | undefined) => {
  if (amount == null) return "0 ₫";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
};

export const StayCardCompact = forwardRef<HTMLDivElement, StayCardCompactProps>(
  ({ stay, viewType, onClick, isSelected }, ref) => {
    if (!stay.booking) return null;

    const booking = stay.booking;
    const hasRoom = !!stay.segment;
    const hasFullCoverage = stay.coverage?.isComplete ?? false;
    const missingNights = stay.coverage?.missingNights ?? booking.nights ?? 0;
    const remainingAmount = (booking.total_amount_net || 0) - stay.amount_collected;
    const hasUnpaid = booking.payment_type === "HOTEL_COLLECT" && remainingAmount > 0;

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={`
          rounded-xl border bg-card p-4 cursor-pointer transition-all duration-200
          hover:shadow-lg hover:-translate-y-0.5
          ${isSelected ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary/30"}
          ${!hasRoom ? "border-warning/30 bg-warning/100/5" : ""}
        `}
      >
        {/* Header: Guest Name + Tags */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="font-medium truncate">{booking.guest_name}</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span className="truncate">{booking.guest_phone || "—"}</span>
            </div>
          </div>
          
          {/* Multi-segment badge */}
          {stay.totalSegments > 1 && (
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
              {stay.segmentIndex}/{stay.totalSegments}
            </span>
          )}
        </div>

        {/* Status Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {!hasRoom && (
            <StatusBadge variant="danger" size="sm">
              <Home className="h-3 w-3 mr-1" />
              Chưa phòng
            </StatusBadge>
          )}
          {hasRoom && !hasFullCoverage && missingNights > 0 && (
            <StatusBadge variant="warning" size="sm">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Thiếu {missingNights}đ
            </StatusBadge>
          )}
          {stay.hasRoomChange && (
            <StatusBadge variant="info" size="sm">
              <Repeat className="h-3 w-3" />
            </StatusBadge>
          )}
          {hasUnpaid && (
            <StatusBadge variant="warning" size="sm">
              <Banknote className="h-3 w-3" />
            </StatusBadge>
          )}
        </div>

        {/* Key Info based on viewType */}
        <div className="space-y-1.5 text-sm">
          {viewType === "no_room" ? (
            // OTA Info for no_room tab
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  OTA:
                </span>
                <span className="font-medium">{booking.source}</span>
              </div>
              {booking.pms_property_name && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Property:</span>
                  <span className="truncate max-w-[120px] text-right" title={booking.pms_property_name}>
                    {booking.pms_property_name}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                </span>
                <span className="text-xs">
                  {formatDate(booking.check_in_date)} → {formatDate(booking.check_out_date)}
                </span>
              </div>
            </>
          ) : (
            // Host Info for other tabs
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Host:
                </span>
                <span className="font-medium truncate max-w-[100px]">
                  {stay.segment?.partners?.partner_name || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phòng:</span>
                <span className="truncate max-w-[120px] text-right">
                  {stay.segment?.host_property_name || "—"}
                  {stay.segment?.room_code && (
                    <span className="text-primary font-bold ml-1">• {stay.segment.room_code}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                </span>
                <span className="text-xs">
                  {formatDate(stay.segment?.date_from || booking.check_in_date)} → {formatDate(stay.segment?.date_to || booking.check_out_date)}
                </span>
              </div>
            </>
          )}
          
          {/* Revenue - always shown */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <span className="text-muted-foreground">Doanh thu:</span>
            <span className="font-semibold text-primary">{formatCurrency(booking.total_amount_net)}</span>
          </div>
        </div>

        {/* Bottom indicator for unpaid */}
        {hasUnpaid && (
          <div className="mt-2 flex items-center justify-center p-1.5 rounded bg-warning/10 text-warning text-xs font-medium">
            Còn thu: {formatCurrency(remainingAmount)}
          </div>
        )}
      </div>
    );
  }
);

StayCardCompact.displayName = "StayCardCompact";
