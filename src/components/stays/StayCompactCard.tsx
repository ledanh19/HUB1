import { memo } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { OtaLogo } from "@/components/ui/ota-badge";
import {
  Building2,
  AlertTriangle,
  User,
  Moon,
  ExternalLink,
  PlaneLanding,
  PlaneTakeoff,
  UserCircle,
  BedDouble,
  Home,
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
  partner_name?: string;
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

type CardVariant = "no_segment" | "has_segment";

interface QuickActionDef {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive";
}

interface StayCompactCardProps {
  stay: StayWithBooking;
  variant: CardVariant;
  quickActions?: QuickActionDef[];
  isSelected?: boolean;
  ownerName?: string | null;
  // Legacy single action (still supported)
  onQuickAction?: () => void;
  quickActionLabel?: string;
}

const fmtDate = (date: string | null | undefined) => {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
};

const fmtMoney = (amount: number | null | undefined) => {
  if (amount == null || amount === 0) return "0 đ";
  return new Intl.NumberFormat("vi-VN", { style: "decimal", maximumFractionDigits: 0 }).format(amount) + " đ";
};

const getStatusInfo = (stay: StayWithBooking) => {
  if (!stay.segment) return { label: "Chưa phân bổ", variant: "warning" as const };
  if (stay.actual_check_out_at) return { label: "Đã trả phòng", variant: "default" as const };
  if (stay.actual_check_in_at) return { label: "Đang ở", variant: "success" as const };
  return { label: "Chưa nhận phòng", variant: "info" as const };
};

// ═══ Owner color palette — each staff member gets a unique, consistent color ═══
const OWNER_COLORS = [
  { text: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200/60" },
  { text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200/60" },
  { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200/60" },
  { text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200/60" },
  { text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200/60" },
  { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200/60" },
  { text: "text-fuchsia-700", bg: "bg-fuchsia-50", border: "border-fuchsia-200/60" },
  { text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200/60" },
] as const;

const getOwnerColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return OWNER_COLORS[Math.abs(hash) % OWNER_COLORS.length];
};

export const StayCompactCard = memo(function StayCompactCard({
  stay,
  variant,
  quickActions,
  onQuickAction,
  quickActionLabel,
  isSelected,
  ownerName,
}: StayCompactCardProps) {
  if (!stay.booking) return null;

  const b = stay.booking;
  const hasRoom = !!stay.segment;
  const remaining = (b.total_amount_net || 0) - stay.amount_collected;
  const needsPay = b.payment_type === "HOTEL_COLLECT" && remaining > 0;
  const status = getStatusInfo(stay);
  const total = b.total_amount_net || 0;
  const propertyName = variant === "has_segment"
    ? (stay.segment?.host_property_name || "—")
    : (b.pms_property_name || "—");
  const roomLine = variant === "has_segment"
    ? (stay.segment?.room_code ? `Phòng ${stay.segment.room_code}` : "")
    : (b.ota_room_type_sold || "");
  const hostName = variant === "has_segment"
    ? (stay.segment?.partners?.partner_name || stay.segment?.partner_name || null)
    : null;

  // Merge legacy single action into quickActions array
  const actions: QuickActionDef[] = quickActions || [];
  if (!quickActions && onQuickAction && quickActionLabel) {
    actions.push({ label: quickActionLabel, onClick: onQuickAction });
  }

  const detailUrl = `/bookings/${stay.unified_booking_id}`;

  // Owner badge element (reused in mobile and desktop)
  const ownerBadgeEl = ownerName ? (() => {
    const c = getOwnerColor(ownerName);
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${c.text} ${c.bg} border ${c.border} rounded-full px-2 py-0.5 truncate`}>
        <UserCircle className="h-3 w-3 shrink-0" />
        {ownerName}
      </span>
    );
  })() : null;

  return (
    <div
      className={`
        group rounded-lg border transition-all duration-150
        hover:shadow-md hover:border-primary/30
        ${!hasRoom ? "bg-warning/5 border-warning/30" : "bg-card border-border"}
        ${isSelected ? "ring-2 ring-primary border-primary shadow-md" : ""}
      `}
    >
      {/* ═══ DESKTOP LAYOUT (md+) — single horizontal row ═══ */}
      <div className="hidden md:flex items-center gap-4 px-4 h-[80px]">
        {/* OTA + Booking Code */}
        <div className="flex flex-col items-center gap-1 w-[90px] shrink-0">
          <OtaLogo source={b.source} size="xl" />
          <span className="text-[10px] font-mono font-semibold text-primary truncate max-w-[86px] leading-tight">
            {(b.ota_booking_code || stay.unified_booking_id.slice(0, 12)).replace(/^[A-Za-z]+-/, "")}
          </span>
        </div>

        {/* Guest + Property + Room */}
        <div className="flex flex-col justify-center min-w-0 w-[200px] shrink-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-foreground text-sm truncate">{b.guest_name}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{propertyName}</span>
            {hostName && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <Home className="h-3 w-3 shrink-0 text-primary/60" />
                <span className="truncate text-primary/80 font-medium">{hostName}</span>
              </>
            )}
          </div>
          {roomLine && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
              <BedDouble className="h-3 w-3 shrink-0" />
              <span className="truncate">{roomLine}</span>
            </div>
          )}
        </div>

        {/* Dates + Nights */}
        <div className="flex items-center gap-1.5 w-[220px] shrink-0">
          <PlaneLanding className="h-3.5 w-3.5 text-success/70 shrink-0" />
          <span className="inline-flex items-center text-[11px] font-medium bg-success/12 text-success px-1.5 py-0.5 rounded whitespace-nowrap">
            {fmtDate(b.check_in_date)}
          </span>
          <PlaneTakeoff className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <span className="inline-flex items-center text-[11px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded whitespace-nowrap">
            {fmtDate(b.check_out_date)}
          </span>
          {b.nights && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary whitespace-nowrap">
              <Moon className="h-2.5 w-2.5" />
              {b.nights}đ
            </span>
          )}
        </div>

        {/* Status + Owner badge */}
        <div className="flex flex-col items-center justify-center w-[110px] shrink-0 h-[48px]">
          <StatusBadge variant={status.variant} size="sm">
            {status.label}
          </StatusBadge>
          <div className="mt-1 max-w-[110px]">
            {ownerBadgeEl || <span className="h-[20px] block" />}
          </div>
        </div>

        {/* Payment */}
        <div className="flex flex-col justify-center w-[140px] shrink-0 text-right h-[36px]">
          {b.payment_type === "HOTEL_COLLECT" ? (
            needsPay ? (
              <>
                <p className="text-[11px] leading-tight">
                  <span className="text-muted-foreground">Cần thu: </span>
                  <span className="font-bold text-warning">{fmtMoney(remaining)}</span>
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">Tổng: {fmtMoney(total)}</p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-medium text-success leading-tight">Đã thu đủ</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Tổng: {fmtMoney(total)}</p>
              </>
            )
          ) : (
            <>
              <p className="text-[11px] font-medium text-info leading-tight">OTA thu</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Tổng: {fmtMoney(total)}</p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {actions.map((action, i) => (
            <Button
              key={i}
              size="sm"
              variant={action.variant || "outline"}
              className="text-[11px] h-7 px-2.5 border-primary/30 text-primary hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
              onClick={(e) => { e.stopPropagation(); action.onClick(); }}
            >
              {action.label}
            </Button>
          ))}
          <a href={detailUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] h-7 px-2.5 rounded-md border border-muted-foreground/20 text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors whitespace-nowrap">
            <ExternalLink className="h-3 w-3" />
            Chi tiết
          </a>
        </div>
      </div>

      {/* ═══ MOBILE LAYOUT (<md) — stacked rows ═══ */}
      <div className="md:hidden p-3 space-y-2.5">
        {/* Row 1: OTA logo + Guest info + Status */}
        <div className="flex items-start gap-2.5">
          {/* OTA Logo */}
          <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
            <OtaLogo source={b.source} size="xl" />
            <span className="text-[9px] font-mono font-semibold text-primary truncate max-w-[60px] leading-tight">
              {(b.ota_booking_code || stay.unified_booking_id.slice(0, 8)).replace(/^[A-Za-z]+-/, "")}
            </span>
          </div>

          {/* Guest + Property + Room */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold text-foreground text-sm truncate">{b.guest_name}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{propertyName}</span>
              {hostName && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <Home className="h-3 w-3 shrink-0 text-primary/60" />
                  <span className="truncate text-primary/80 font-medium">{hostName}</span>
                </>
              )}
            </div>
            {roomLine && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                <BedDouble className="h-3 w-3 shrink-0" />
                <span className="truncate">{roomLine}</span>
              </div>
            )}
          </div>

          {/* Status badge on right */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <StatusBadge variant={status.variant} size="sm">
              {status.label}
            </StatusBadge>
            {ownerBadgeEl}
          </div>
        </div>

        {/* Row 2: Dates + Nights */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <PlaneLanding className="h-3 w-3 text-success/70 shrink-0" />
          <span className="font-medium bg-success/12 text-success px-1.5 py-0.5 rounded whitespace-nowrap">
            {fmtDate(b.check_in_date)}
          </span>
          <PlaneTakeoff className="h-3 w-3 text-primary/70 shrink-0" />
          <span className="font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded whitespace-nowrap">
            {fmtDate(b.check_out_date)}
          </span>
          {b.nights && (
            <span className="inline-flex items-center gap-0.5 font-medium text-primary whitespace-nowrap">
              <Moon className="h-2.5 w-2.5" />
              {b.nights}đ
            </span>
          )}
        </div>

        {/* Row 3: Payment + Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          {/* Payment info */}
          <div className="text-[11px]">
            {b.payment_type === "HOTEL_COLLECT" ? (
              needsPay ? (
                <span>
                  <span className="text-muted-foreground">Cần thu: </span>
                  <span className="font-bold text-warning">{fmtMoney(remaining)}</span>
                  <span className="text-muted-foreground ml-1">/ {fmtMoney(total)}</span>
                </span>
              ) : (
                <span>
                  <span className="font-medium text-success">Đã thu đủ</span>
                  <span className="text-muted-foreground ml-1">· {fmtMoney(total)}</span>
                </span>
              )
            ) : (
              <span>
                <span className="font-medium text-info">OTA thu</span>
                <span className="text-muted-foreground ml-1">· {fmtMoney(total)}</span>
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            {actions.map((action, i) => (
              <Button
                key={i}
                size="sm"
                variant={action.variant || "outline"}
                className="text-[10px] h-6 px-2 border-primary/30 text-primary hover:bg-primary hover:text-white transition-colors whitespace-nowrap"
                onClick={(e) => { e.stopPropagation(); action.onClick(); }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Warning bar */}
      {hasRoom && !stay.coverage?.isComplete && (stay.coverage?.missingNights ?? 0) > 0 && (
        <div className="flex items-center gap-1 px-3 md:px-4 py-1 bg-warning/8 text-[11px] text-warning rounded-b-lg">
          <AlertTriangle className="h-3 w-3" />
          <span>Thiếu {stay.coverage?.missingNights} đêm</span>
        </div>
      )}
    </div>
  );
}, (prev, next) =>
  prev.stay.id === next.stay.id &&
  prev.stay.actual_check_in_at === next.stay.actual_check_in_at &&
  prev.stay.actual_check_out_at === next.stay.actual_check_out_at &&
  prev.stay.amount_collected === next.stay.amount_collected &&
  prev.stay.segment?.room_code === next.stay.segment?.room_code &&
  prev.variant === next.variant &&
  prev.isSelected === next.isSelected &&
  prev.quickActions === next.quickActions &&
  prev.quickActionLabel === next.quickActionLabel &&
  prev.ownerName === next.ownerName
);

StayCompactCard.displayName = "StayCompactCard";
