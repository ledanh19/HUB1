import { AlertTriangle, User, Phone, Mail, FileText } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { OtaBadge } from "@/components/ui/ota-badge";
import { getBookingStatusVariant, getBookingStatusLabel } from "@/constants/status-config";
import { resolveISO3, getFlag } from "@/lib/countryMapping";
import { BookingOwnerSection } from "@/components/ui/ResponsibleOwnerBadge";
import { BookingCaseCard } from "@/components/dispute/BookingCaseCard";
import { MobileDetailRow, MobileSection } from "../MobileDetailRow";

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
};
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
};

interface MobileOverviewTabProps {
  booking: any;
  computedAmount: { amount: number | null; status: string };
  paymentStatusInfo: { variant: string; label: string };
  noShowRecord: any;
  ownershipInfo: any;
  bookingId: string | undefined;
  onAssignOwner: () => void;
  documents: any[];
  onUploadDoc: () => void;
  isOtaCollect: boolean;
}

export function MobileOverviewTab({
  booking,
  computedAmount,
  paymentStatusInfo,
  noShowRecord,
  ownershipInfo,
  bookingId,
  onAssignOwner,
  documents,
  onUploadDoc,
  isOtaCollect,
}: MobileOverviewTabProps) {
  const amountDisplay = computedAmount.status === "CANCELLED"
    ? "0 (Đã huỷ)"
    : computedAmount.status === "UNCONFIRMED"
      ? "Cần xác nhận"
      : formatCurrency(computedAmount.amount);

  const amountColor = computedAmount.status === "CANCELLED"
    ? "text-muted-foreground"
    : computedAmount.status === "UNCONFIRMED"
      ? "text-warning"
      : "text-foreground";

  return (
    <div className="space-y-[1px] bg-muted/30">
      {/* No-Show Alert */}
      {noShowRecord && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-warning/10 border-b border-warning/30">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
          <span className="text-xs font-semibold text-warning">No-Show</span>
        </div>
      )}

      {/* Section A — Booking Details (moved before Phải thu) */}
      <MobileSection title="Thông tin đặt phòng">
        <div className="divide-y divide-border/40">
          {booking.booking_date && (
            <MobileDetailRow label="Ngày đặt" value={formatDate(booking.booking_date)} />
          )}
          <MobileDetailRow label="Trạng thái">
            <StatusBadge size="sm" variant={getBookingStatusVariant(booking.booking_status || "") as any} dot>
              {getBookingStatusLabel(booking.booking_status)}
            </StatusBadge>
          </MobileDetailRow>
          <MobileDetailRow label="Nguồn">
            <OtaBadge source={booking.source || booking.ota_source || ""} size="sm" />
          </MobileDetailRow>
          <MobileDetailRow label="Mã đặt phòng" value={(booking.ota_booking_code || booking.booking_code || "—").replace(/^[A-Za-z]+-/i, "")} />
          <MobileDetailRow label="ID chỗ nghỉ" value={booking.ota_property_id || booking.pms_property_id || "—"} />
          {(booking.booking_type === "PMS" || booking.booking_type === "IMPORTED") && (
            <>
              <MobileDetailRow label="Chỗ nghỉ" value={booking.pms_property_name || "—"} />
              <MobileDetailRow label="Loại phòng" value={booking.ota_room_type_sold || "—"} />
            </>
          )}
          <MobileDetailRow label="Nhận phòng" value={formatDate(booking.check_in_date)} />
          <MobileDetailRow label="Trả phòng" value={formatDate(booking.check_out_date)} />
          <MobileDetailRow label="Số đêm" value={`${booking.nights} đêm`} />
          <MobileDetailRow label="Hình thức thu">
            <StatusBadge variant={isOtaCollect ? "info" : "success"} size="sm">
              {isOtaCollect ? "OTA thu" : "Thu tại KS"}
            </StatusBadge>
          </MobileDetailRow>
        </div>
      </MobileSection>

      {/* Section B — Phải thu (moved after booking details) */}
      <MobileSection title="Phải thu">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-base font-bold tabular-nums ${amountColor}`}>{amountDisplay}</span>
          <StatusBadge variant={paymentStatusInfo.variant as any} size="sm">
            {paymentStatusInfo.label}
          </StatusBadge>
        </div>
      </MobileSection>

      {/* Section C — Guest Info */}
      <MobileSection title="Thông tin khách">
        <div className="flex items-center gap-2 mb-1">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{booking.guest_name || "—"}</span>
          {booking.nationality && (() => {
            const iso3 = resolveISO3(booking.nationality);
            const flagUrl = iso3 !== "UNKNOWN" ? getFlag(iso3) : null;
            return flagUrl ? <img src={flagUrl} alt={booking.nationality} className="w-4 h-auto rounded-sm" /> : null;
          })()}
        </div>
        <div className="divide-y divide-border/40">
          <MobileDetailRow label="Điện thoại">
            {booking.guest_phone ? (
              <a href={`tel:${booking.guest_phone}`} className="flex items-center gap-1 text-primary text-xs">
                <Phone className="h-3 w-3" />{booking.guest_phone}
              </a>
            ) : <span className="text-xs text-muted-foreground">—</span>}
          </MobileDetailRow>
          <MobileDetailRow label="Email">
            {booking.guest_email ? (
              <a href={`mailto:${booking.guest_email}`} className="flex items-center gap-1 text-primary text-xs truncate max-w-[200px]">
                <Mail className="h-3 w-3 shrink-0" />{booking.guest_email}
              </a>
            ) : <span className="text-xs text-muted-foreground">—</span>}
          </MobileDetailRow>
          <MobileDetailRow label="Quốc tịch" value={booking.nationality || "—"} />
        </div>
      </MobileSection>

      {/* Section D — Owner */}
      <MobileSection title="Thông tin xử lý">
        <BookingOwnerSection
          ownershipInfo={ownershipInfo}
          bookingId={bookingId}
          onAssignClick={onAssignOwner}
        />
      </MobileSection>

      {/* Case/Dispute — conditional */}
      <BookingCaseCard bookingId={booking.unified_booking_id} guestName={booking.guest_name} />

      {/* Documents — only if exist */}
      {documents.length > 0 && (
        <MobileSection title="Giấy tờ">
          {documents.map((doc: any) => (
            <div key={doc.id} className="flex items-center gap-2 py-0.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium">{doc.document_type}</span>
              {doc.document_number && (
                <span className="text-xs text-muted-foreground">• {doc.document_number}</span>
              )}
            </div>
          ))}
        </MobileSection>
      )}
    </div>
  );
}
