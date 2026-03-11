import { memo } from 'react';
import { format, differenceInMinutes, differenceInHours, isToday, isTomorrow, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { MessageSquare, MessageCircle, User, Clock, AlertTriangle, Calendar, LogIn, LogOut, Home, XCircle, CheckCircle } from 'lucide-react';
import { OtaLogo } from '@/components/ui/ota-badge';
import { cn } from '@/lib/utils';
import { Conversation } from '@/hooks/useConversations';
import { Badge } from '@/components/ui/badge';

import { Skeleton } from '@/components/ui/skeleton';
import { OtaBadge } from '@/components/ui/ota-badge';

// Stay status display config - matches database values from stays table
const STAY_STATUS_CONFIG: Record<string, { label: string; icon: typeof LogIn; bgColor: string; textColor: string }> = {
  WAIT_ROOM: { label: 'Chờ nhận phòng', icon: LogIn, bgColor: 'bg-info/10', textColor: 'text-info' },
  CHECKED_IN: { label: 'Đã nhận phòng', icon: CheckCircle, bgColor: 'bg-success/10 dark:bg-success/10', textColor: 'text-success' },
  IN_HOUSE: { label: 'Đang ở', icon: Home, bgColor: 'bg-success/10', textColor: 'text-success' },
  CHECKED_OUT: { label: 'Đã trả phòng', icon: LogOut, bgColor: 'bg-muted dark:bg-muted', textColor: 'text-muted-foreground dark:text-muted-foreground' },
  NO_SHOW: { label: 'No-show', icon: XCircle, bgColor: 'bg-destructive/10', textColor: 'text-destructive' },
};

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  isLoading?: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading
}: ConversationListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm text-center">Chưa có hội thoại nào</p>
        <p className="text-xs text-center mt-1">
          Tin nhắn từ OTA và WhatsApp sẽ xuất hiện ở đây
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="divide-y divide-border w-full">
        {conversations.map((conversation) => (
          <MemoizedConversationItem
            key={conversation.id}
            conversation={conversation}
            isSelected={selectedId === conversation.id}
            onClick={() => onSelect(conversation)}
          />
        ))}
      </div>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

// Calculate SLA status based on last inbound message
function getSlaStatus(lastInboundAt: string | null, lastOutboundAt: string | null): {
  badge: 'NEW' | '>30M' | '>1H' | '>3H' | null;
  bgColor: string;
  textColor: string;
  isUnanswered: boolean;
} {
  if (!lastInboundAt) {
    return { badge: null, bgColor: '', textColor: '', isUnanswered: false };
  }

  const inboundTime = new Date(lastInboundAt).getTime();
  const outboundTime = lastOutboundAt ? new Date(lastOutboundAt).getTime() : 0;

  // If there's an outbound after the last inbound, it's answered
  if (outboundTime > inboundTime) {
    return { badge: null, bgColor: '', textColor: '', isUnanswered: false };
  }

  // Calculate minutes since last inbound
  const minutesSinceInbound = differenceInMinutes(new Date(), new Date(lastInboundAt));

  if (minutesSinceInbound < 5) {
    return { badge: 'NEW', bgColor: 'bg-info/100', textColor: 'text-white', isUnanswered: true };
  } else if (minutesSinceInbound < 30) {
    return { badge: 'NEW', bgColor: 'bg-info/100', textColor: 'text-white', isUnanswered: true };
  } else if (minutesSinceInbound < 60) {
    return { badge: '>30M', bgColor: 'bg-warning/100', textColor: 'text-white', isUnanswered: true };
  } else if (minutesSinceInbound < 180) {
    return { badge: '>1H', bgColor: 'bg-warning/100', textColor: 'text-white', isUnanswered: true };
  } else {
    return { badge: '>3H', bgColor: 'bg-destructive/100', textColor: 'text-white', isUnanswered: true };
  }
}

// Calculate near check-in status
function getNearCheckInStatus(checkInDate: string | null): {
  badge: 'Hôm nay' | '24h' | null;
  bgColor: string;
  textColor: string;
} {
  if (!checkInDate) return { badge: null, bgColor: '', textColor: '' };

  try {
    const checkIn = parseISO(checkInDate);

    if (isToday(checkIn)) {
      return { badge: 'Hôm nay', bgColor: 'bg-destructive/10', textColor: 'text-destructive' };
    }

    if (isTomorrow(checkIn)) {
      return { badge: '24h', bgColor: 'bg-warning/10', textColor: 'text-warning' };
    }

    // Check if within 24 hours
    const hoursUntilCheckIn = differenceInHours(checkIn, new Date());
    if (hoursUntilCheckIn > 0 && hoursUntilCheckIn <= 24) {
      return { badge: '24h', bgColor: 'bg-warning/10', textColor: 'text-warning' };
    }
  } catch {
    // Invalid date
  }

  return { badge: null, bgColor: '', textColor: '' };
}

function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  const hasUnread = conversation.unread_count > 0;
  const unreadCount = conversation.unread_count || 0;
  const guestName = conversation.booking_guest_name || conversation.guest_name || 'Khách';
  const propertyName = conversation.pms_property_name || 'Chưa xác định';
  const otaSource = conversation.ota_source;
  const messagePreview = conversation.last_message_preview;
  const bookingCode = conversation.ota_booking_code;
  const bookingId = conversation.real_unified_booking_id || conversation.unified_booking_id;
  const isWhatsApp = conversation.channel_type === 'WHATSAPP';
  const phoneNumber = conversation.guest_phone || conversation.wa_customer_phone;

  // Get SLA status
  const slaStatus = getSlaStatus(
    conversation.last_inbound_at || conversation.last_message_at,
    conversation.last_outbound_at
  );

  // Get near check-in status
  const checkInStatus = getNearCheckInStatus(conversation.check_in_date || null);

  // Determine attention status: unread or unanswered
  const needsAttention = hasUnread || slaStatus.isUnanswered;
  const attentionLabel = hasUnread ? 'Chưa đọc' : (slaStatus.isUnanswered ? 'Chưa trả lời' : null);

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Vừa xong';
    if (diffMin < 60) return `cách đây ${diffMin} phút`;
    if (diffHour < 24) return `cách đây ${diffHour} giờ`;
    if (diffDay < 7) return `cách đây ${diffDay} ngày`;
    return format(date, 'dd/MM');
  };

  // Truncate message preview
  const truncatePreview = (text: string | null, maxLength: number = 45) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '…' : text;
  };

  // WhatsApp-style mobile time format
  const mobileTimeStr = (() => {
    if (!conversation.last_message_at) return '';
    const date = new Date(conversation.last_message_at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffDay === 0) return format(date, 'HH:mm');
    if (diffDay === 1) return 'Hôm qua';
    if (diffDay < 7) return format(date, 'EEEE', { locale: vi });
    return format(date, 'dd/MM/yyyy');
  })();

  return (
    <>
      {/* ═══ DESKTOP layout (sm+) — original ═══ */}
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left px-3 py-4 hover:bg-muted/50 transition-colors border-l-3 border-b bg-background active:bg-muted/70 overflow-hidden hidden sm:block",
          isSelected ? "border-l-primary bg-primary/5" : "border-l-transparent",
          hasUnread && !isSelected && "!bg-primary/5 border-l-primary",
          !hasUnread && slaStatus.isUnanswered && !isSelected && "!bg-warning/10 dark:!bg-warning/20"
        )}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="shrink-0 relative">
            {isWhatsApp ? (
              <div className="h-8 w-8 rounded-full flex items-center justify-center overflow-hidden">
                <img src="/channel-icons/whatsapp.png" alt="WhatsApp" className="h-8 w-8 object-contain" />
              </div>
            ) : otaSource ? (
              <OtaLogo source={otaSource} size="lg" />
            ) : (
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                hasUnread ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                <User className="h-4 w-4" />
              </div>
            )}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center text-[9px] font-bold text-white bg-destructive rounded-full leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("font-semibold truncate flex-1 text-sm", needsAttention && "text-foreground")}>
                {guestName}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                {formatRelativeTime(conversation.last_message_at)}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {attentionLabel && (
                <span className={cn("text-[9px] font-semibold inline-flex items-center h-[14px] px-1 rounded whitespace-nowrap", hasUnread ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>{attentionLabel}</span>
              )}
              {conversation.stay_status && STAY_STATUS_CONFIG[conversation.stay_status] && (
                <span className={cn("text-[9px] font-medium inline-flex items-center h-[14px] px-1 rounded gap-0.5 whitespace-nowrap", STAY_STATUS_CONFIG[conversation.stay_status].bgColor, STAY_STATUS_CONFIG[conversation.stay_status].textColor)}>
                  {(() => { const Icon = STAY_STATUS_CONFIG[conversation.stay_status!].icon; return <Icon className="h-2 w-2" />; })()}
                  {STAY_STATUS_CONFIG[conversation.stay_status].label}
                </span>
              )}
              {checkInStatus.badge && (
                <span className={cn("text-[9px] font-medium inline-flex items-center h-[14px] px-1 rounded gap-0.5 whitespace-nowrap", checkInStatus.bgColor, checkInStatus.textColor)}>
                  <Calendar className="h-2.5 w-2.5" />{checkInStatus.badge}
                </span>
              )}
              {slaStatus.badge && (
                <span className={cn("text-[9px] font-medium inline-flex items-center h-[14px] px-1 rounded whitespace-nowrap", slaStatus.bgColor, slaStatus.textColor)}>{slaStatus.badge}</span>
              )}
            </div>
            {isWhatsApp ? (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="h-[14px] px-1 font-semibold bg-success/10 text-success dark:bg-success/10">WhatsApp</Badge>
                {phoneNumber && <span className="text-micro text-muted-foreground font-mono">+{phoneNumber}</span>}
              </div>
            ) : null}
            <p className={cn("text-xs truncate", needsAttention ? "text-foreground/70" : "text-muted-foreground")}>
              {messagePreview ? truncatePreview(messagePreview) : 'Chưa có tin nhắn'}
            </p>
          </div>
        </div>
      </button>

      {/* ═══ MOBILE layout (<sm) — WhatsApp-style ═══ */}
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left px-4 py-3 transition-colors flex items-center gap-3.5 sm:hidden active:bg-muted/30 border-b border-border/30",
          isSelected ? "bg-primary/5" : "bg-background",
        )}
      >
        {/* Avatar — larger, WhatsApp-style */}
        <div className="shrink-0 relative">
          {isWhatsApp ? (
            <div className="h-12 w-12 rounded-full flex items-center justify-center overflow-hidden">
              <img src="/channel-icons/whatsapp.png" alt="WhatsApp" className="h-12 w-12 object-contain" />
            </div>
          ) : otaSource ? (
            <div className="h-12 w-12 rounded-full overflow-hidden flex items-center justify-center bg-muted">
              <OtaLogo source={otaSource} size="lg" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Content: Name + Preview */}
        <div className="flex-1 min-w-0">
          {/* Line 1: Name + Time */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className={cn(
                "text-[15px] truncate leading-tight",
                hasUnread ? "font-bold text-foreground" : "font-normal text-foreground"
              )}>
                {guestName}
              </span>
              {/* Verified badge for WhatsApp Business */}
              {isWhatsApp && conversation.wa_customer_phone && (
                <span className="text-success shrink-0">✓</span>
              )}
            </div>
            <span className={cn(
              "text-xs whitespace-nowrap shrink-0",
              hasUnread ? "text-success font-medium" : "text-muted-foreground"
            )}>
              {mobileTimeStr}
            </span>
          </div>

          {/* Line 2: Message preview + unread badge */}
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {/* SLA / attention badge inline */}
              {slaStatus.badge && (
                <span className={cn("text-[9px] font-semibold inline-flex items-center h-[14px] px-1 rounded whitespace-nowrap shrink-0", slaStatus.bgColor, slaStatus.textColor)}>{slaStatus.badge}</span>
              )}
              <p className={cn(
                "text-[13px] truncate leading-snug",
                hasUnread ? "text-foreground/80" : "text-muted-foreground"
              )}>
                {messagePreview ? truncatePreview(messagePreview, 55) : 'Chưa có tin nhắn'}
              </p>
            </div>
            {/* Green unread count — WhatsApp style */}
            {unreadCount > 0 && (
              <span className="min-w-[20px] h-[20px] px-1 flex items-center justify-center text-[11px] font-bold text-white bg-success rounded-full leading-none shrink-0">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    </>
  );
}

// Memoize to prevent unnecessary re-renders when other conversations update
const MemoizedConversationItem = memo(ConversationItem, (prevProps, nextProps) => {
  return (
    prevProps.conversation.id === nextProps.conversation.id &&
    prevProps.conversation.channel_type === nextProps.conversation.channel_type &&
    prevProps.conversation.unread_count === nextProps.conversation.unread_count &&
    prevProps.conversation.last_message_at === nextProps.conversation.last_message_at &&
    prevProps.conversation.last_message_preview === nextProps.conversation.last_message_preview &&
    prevProps.conversation.last_inbound_at === nextProps.conversation.last_inbound_at &&
    prevProps.conversation.last_outbound_at === nextProps.conversation.last_outbound_at &&
    prevProps.conversation.stay_status === nextProps.conversation.stay_status &&
    prevProps.conversation.assignment_status === nextProps.conversation.assignment_status &&
    prevProps.conversation.booking_guest_name === nextProps.conversation.booking_guest_name &&
    prevProps.conversation.guest_name === nextProps.conversation.guest_name &&
    prevProps.conversation.ota_source === nextProps.conversation.ota_source &&
    prevProps.conversation.ota_booking_code === nextProps.conversation.ota_booking_code &&
    prevProps.conversation.pms_property_name === nextProps.conversation.pms_property_name &&
    prevProps.isSelected === nextProps.isSelected
  );
});