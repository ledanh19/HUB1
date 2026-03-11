import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  Calendar,
  Moon,
  CreditCard,
  Phone,
  Mail,
  ExternalLink,
  MessageSquare,
  MessageCircle,
  Check,
  X,
  Clock,
  Info,
  Building2,
  User,
  FileText,
  BedDouble,
  Tag,
  StickyNote,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Banknote,
  Link2,
  Timer,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { OtaBadge } from '@/components/ui/ota-badge';
import { Conversation } from '@/hooks/useConversations';
import { ConversationTags } from './ConversationTags';
import { ConversationOwnership } from './ConversationOwnership';
import { cn } from '@/lib/utils';
import { formatBookingCode } from '@/lib/bookingCodeFormatter';

interface ContextPanelProps {
  conversation: Conversation | null;
  lastSyncedAt: string | null;
  onLinkBooking?: (conversationId: string) => void;
}

export function ContextPanel({ conversation, lastSyncedAt, onLinkBooking }: ContextPanelProps) {
  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <Info className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-sm text-center">Chọn hội thoại để xem chi tiết</p>
      </div>
    );
  }

  const guestName = conversation.booking_guest_name || conversation.guest_name || 'Khách';
  const bookingId = conversation.real_unified_booking_id || conversation.unified_booking_id;
  const isWhatsApp = (conversation.channel_type || '').toUpperCase() === 'WHATSAPP';
  const waPhone = conversation.wa_customer_phone || conversation.guest_phone;

  // Determine stay status - prioritize actual stay_status from stays table
  const getStayStatus = () => {
    // If we have actual stay_status from stays table, use it
    if (conversation.stay_status) {
      switch (conversation.stay_status) {
        case 'IN_HOUSE':
          return { label: 'Đang ở', color: 'bg-success/10 text-success', icon: BedDouble };
        case 'CHECKED_IN':
          return { label: 'Đã nhận phòng', color: 'bg-success/10 text-success dark:bg-success/10', icon: BedDouble };
        case 'CHECKED_OUT':
          return { label: 'Đã trả phòng', color: 'bg-muted text-muted-foreground', icon: CheckCircle2 };
        case 'NO_SHOW':
          return { label: 'No-show', color: 'bg-destructive/10 text-destructive', icon: XCircle };
        case 'WAIT_ROOM':
        default:
          // Fall through to date-based logic
          break;
      }
    }

    // Fallback to date-based estimation if no stays record
    if (!conversation.check_in_date) return { label: 'Chưa xác định', color: 'bg-muted text-muted-foreground', icon: CircleDashed };

    const checkIn = parseISO(conversation.check_in_date);
    const checkOut = conversation.check_out_date ? parseISO(conversation.check_out_date) : null;
    const now = new Date();

    // If actual check-in exists, use IN_HOUSE
    if (conversation.actual_check_in_at && !conversation.actual_check_out_at) {
      return { label: 'Đang ở', color: 'bg-success/10 text-success', icon: BedDouble };
    }

    // If actual check-out exists
    if (conversation.actual_check_out_at) {
      return { label: 'Đã trả phòng', color: 'bg-muted text-muted-foreground', icon: CheckCircle2 };
    }

    // No stays record - show date-based status with "(dự kiến)" suffix
    if (checkOut && now > checkOut) {
      return { label: 'Quá ngày trả phòng', color: 'bg-destructive/10 text-destructive dark:text-destructive', icon: AlertTriangle };
    }
    if (isToday(checkIn)) {
      return { label: 'Nhận phòng hôm nay', color: 'bg-warning/10 text-warning dark:bg-warning/10', icon: Clock };
    }
    if (isTomorrow(checkIn)) {
      return { label: 'Nhận phòng ngày mai', color: 'bg-warning/10 text-warning dark:bg-warning/10', icon: Calendar };
    }
    if (now >= checkIn && (!checkOut || now <= checkOut)) {
      // Within date range but no actual check-in - show as pending
      return { label: 'Chờ nhận phòng', color: 'bg-info/10 text-info', icon: Clock };
    }
    return { label: 'Sắp đến', color: 'bg-muted text-muted-foreground dark:bg-muted/50 dark:text-muted-foreground', icon: Calendar };
  };

  const stayStatus = getStayStatus();
  const StayIcon = stayStatus.icon;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b min-h-[49px] flex items-center">
        <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
          Thông tin vận hành
        </h3>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2 space-y-2.5">
        {/* 0. WhatsApp Channel Info (only for WhatsApp conversations) */}
        {isWhatsApp && (
          <>
            <section>
              <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </h4>
              <div className="space-y-1.5">
                {/* Phone number */}
                {waPhone && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Số điện thoại</span>
                    <a
                      href={`https://wa.me/${waPhone.replace(/^\+/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      +{waPhone.replace(/^\+/, '')}
                    </a>
                  </div>
                )}

                {/* 24h messaging window indicator */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cửa sổ 24h</span>
                  {(() => {
                    const lastInbound = conversation.last_inbound_at;
                    if (!lastInbound) {
                      return (
                        <Badge variant="secondary">
                          <Timer className="h-3 w-3 mr-1" />
                          Chưa có tin nhắn đến
                        </Badge>
                      );
                    }
                    const hoursRemaining = Math.max(0, 24 - ((Date.now() - new Date(lastInbound).getTime()) / (1000 * 60 * 60)));
                    if (hoursRemaining <= 0) {
                      return (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          Đã hết hạn
                        </Badge>
                      );
                    }
                    const isLow = hoursRemaining < 4;
                    return (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "",
                          isLow
                            ? "bg-warning/10 text-warning"
                            : "bg-success/10 text-success dark:bg-success/10"
                        )}
                      >
                        <Timer className="h-3 w-3 mr-1" />
                        Còn {hoursRemaining < 1 ? `${Math.round(hoursRemaining * 60)} phút` : `${Math.round(hoursRemaining)}h`}
                      </Badge>
                    );
                  })()}
                </div>
              </div>
            </section>
            <Separator />
          </>
        )}

        {/* 1. Booking Context */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Booking
            {/* Phone-matched badge for WhatsApp */}
            {isWhatsApp && bookingId && !conversation.unified_booking_id && (
              <Badge variant="secondary" className="text-micro px-1.5 py-0 h-4 font-normal bg-info/10 text-info">
                <Link2 className="h-2.5 w-2.5 mr-0.5" />
                phone match
              </Badge>
            )}
          </h4>
          <div className="space-y-1.5">
            {/* No booking matched → show link button */}
            {!bookingId && isWhatsApp && (
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3 text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  Chưa tìm thấy booking liên kết với số điện thoại này
                </p>
                {onLinkBooking && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => onLinkBooking(conversation.id)}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Liên kết booking thủ công
                  </Button>
                )}
              </div>
            )}
            {/* Booking ID with link */}
            {bookingId && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Mã đặt phòng</span>
                <Link
                  to={`/bookings/${bookingId}`}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  #{formatBookingCode(bookingId, conversation.ota_booking_code, conversation.ota_source, conversation.check_in_date)}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            {/* OTA Source */}
            {conversation.ota_source && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Kênh</span>
                <OtaBadge source={conversation.ota_source} size="sm" />
              </div>
            )}

            {/* Property */}
            {conversation.pms_property_name && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Chỗ nghỉ</span>
                <span className="text-xs font-medium text-right max-w-[160px] truncate">
                  {conversation.pms_property_name}
                </span>
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* 2. OPS SUMMARY - Trạng thái vận hành */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
            <BedDouble className="h-3.5 w-3.5" />
            Trạng thái lưu trú
          </h4>

          {/* Stay Status Badge - Large */}
          <div className={cn(
            "rounded-md px-2 py-1 mb-1.5 inline-flex items-center gap-1 text-[11px]",
            stayStatus.color
          )}>
            <StayIcon className="h-3 w-3" />
            <span className="font-semibold">{stayStatus.label}</span>
          </div>

          <div className="space-y-1.5">
            {/* Check-in/Check-out dates */}
            {conversation.check_in_date && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ngày đến</span>
                <span className="text-xs font-medium flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5 text-muted-foreground" />
                  {format(parseISO(conversation.check_in_date), 'dd/MM/yyyy')}
                </span>
              </div>
            )}

            {conversation.check_out_date && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ngày đi</span>
                <span className="text-xs font-medium flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5 text-muted-foreground" />
                  {format(parseISO(conversation.check_out_date), 'dd/MM/yyyy')}
                </span>
              </div>
            )}

            {conversation.nights && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Số đêm</span>
                <span className="text-xs font-medium flex items-center gap-1">
                  <Moon className="h-2.5 w-2.5 text-muted-foreground" />
                  {conversation.nights} đêm
                </span>
              </div>
            )}

            {/* Room Assignment - placeholder */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Phòng</span>
              <Badge variant="secondary">
                Chưa phân bổ phòng
              </Badge>
            </div>

            {/* Payment Type */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Thanh toán</span>
              <Badge variant="outline" className="gap-0.5">
                <Banknote className="h-2.5 w-2.5" />
                OTA Collect
              </Badge>
            </div>
          </div>
        </section>

        <Separator />

        {/* 3. Guest Contact */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            Liên hệ khách
          </h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Tên khách</span>
              <span className="text-xs font-medium">{guestName}</span>
            </div>

            {conversation.guest_email && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Email</span>
                <a
                  href={`mailto:${conversation.guest_email}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1 max-w-[160px] truncate"
                >
                  <Mail className="h-3 w-3 shrink-0" />
                  {conversation.guest_email}
                </a>
              </div>
            )}

            {conversation.guest_phone && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Điện thoại</span>
                <a
                  href={`tel:${conversation.guest_phone}`}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Phone className="h-3 w-3" />
                  {conversation.guest_phone}
                </a>
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* 4. Conversation Ownership */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Phân công xử lý
          </h4>
          <ConversationOwnership conversation={conversation} />
        </section>

        <Separator />

        {/* 5. Quick Actions */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            Thao tác nhanh
          </h4>
          <div className="space-y-2">
            {/* Open Booking Detail */}
            {bookingId && (
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link to={`/bookings/${bookingId}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Mở chi tiết Booking
                </Link>
              </Button>
            )}

            {/* Tags - Functional */}
            <ConversationTags conversationId={conversation.id} />

            {/* Internal Note button */}
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
              <StickyNote className="h-4 w-4 mr-2" />
              Thêm ghi chú nội bộ
            </Button>
          </div>
        </section>

        <Separator />

        {/* 6. Channel Capability */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Khả năng kênh
          </h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Nhắn tin</span>
              {conversation.is_messaging_supported ? (
                <Badge variant="secondary" className="bg-success/10 text-success border-success/20 dark:border-success">
                  <Check className="h-3 w-3 mr-1" />
                  Hỗ trợ
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <X className="h-3 w-3 mr-1" />
                  Không hỗ trợ
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Đính kèm</span>
              <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/20 dark:bg-warning/10 dark:border-warning">
                Sắp có
              </Badge>
            </div>

          </div>
        </section>

        <Separator />

        {/* 7. Conversation Status */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Trạng thái case
          </h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Case</span>
              <Badge
                variant={conversation.status === 'OPEN' ? 'default' : 'secondary'}
                className="text-[9px] h-4 px-1 inline-flex items-center"
              >
                {conversation.status === 'OPEN' ? 'Đang mở' : 'Đã đóng'}
              </Badge>
            </div>

            {conversation.synced_at && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Đồng bộ lần cuối</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(conversation.synced_at), 'HH:mm dd/MM')}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Footer - Last sync status */}
      {lastSyncedAt && (
        <div className="border-t p-2 bg-muted/30">
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Cập nhật lần cuối: {format(new Date(lastSyncedAt), 'HH:mm')}</span>
          </div>
        </div>
      )}
    </div>
  );
}