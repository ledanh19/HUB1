import { ArrowLeft, MoreVertical, User, Users, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OtaBadge } from '@/components/ui/ota-badge';
import { Conversation } from '@/hooks/useConversations';
import { cn } from '@/lib/utils';

interface MobileThreadHeaderProps {
  conversation: Conversation;
  onBack: () => void;
  onOpenContext: () => void;
}

/**
 * WhatsApp-style sticky header for mobile thread view.
 * Shows: ← back + avatar + name/subtitle + booking + more
 */
export function MobileThreadHeader({
  conversation,
  onBack,
  onOpenContext,
}: MobileThreadHeaderProps) {
  const navigate = useNavigate();
  const guestName = conversation.booking_guest_name || conversation.guest_name || 'Khách';
  const initials = guestName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const bookingId = conversation.real_unified_booking_id || conversation.unified_booking_id;

  // SLA calculation for subtitle
  const getSlaInfo = () => {
    if (!conversation.last_inbound_at) return null;
    const inboundTime = new Date(conversation.last_inbound_at).getTime();
    const outboundTime = conversation.last_outbound_at
      ? new Date(conversation.last_outbound_at).getTime()
      : 0;
    if (outboundTime > inboundTime) return null;
    const minutesSince = Math.floor((Date.now() - inboundTime) / 60000);
    if (minutesSince < 30) return { label: 'NEW', color: 'bg-info/100 text-white' };
    if (minutesSince < 60) return { label: '>30m', color: 'bg-warning/100 text-white' };
    if (minutesSince < 180) return { label: '>1h', color: 'bg-warning/100 text-white' };
    return { label: '>3h', color: 'bg-destructive/100 text-white' };
  };

  const slaInfo = getSlaInfo();

  const subtitle = (() => {
    const parts: string[] = [];
    if (conversation.pms_property_name) parts.push(conversation.pms_property_name);
    if (conversation.ota_booking_code) parts.push(conversation.ota_booking_code);
    if (parts.length === 0 && (conversation.wa_customer_phone || conversation.guest_phone)) {
      parts.push(`+${(conversation.wa_customer_phone || conversation.guest_phone || '').replace(/^\+/, '')}`);
    }
    return parts.join(' · ') || 'Tin nhắn';
  })();

  // Assignment status
  const getAssignmentInfo = () => {
    if (conversation.assignment_status === 'ASSIGNED' && conversation.assigned_to_name) {
      return { icon: User, label: conversation.assigned_to_name, color: 'text-info' };
    }
    if (conversation.assignment_status === 'ESCALATED' && conversation.assigned_team) {
      return { icon: Users, label: conversation.assigned_team, color: 'text-warning' };
    }
    return null;
  };

  const assignmentInfo = getAssignmentInfo();

  return (
    <header
      className="sticky top-0 z-30 bg-primary/95 dark:bg-primary/90 text-primary-foreground flex items-center px-1 gap-1.5 py-2"
    >
      {/* Back button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack}
        className="h-10 w-10 shrink-0 text-primary-foreground hover:bg-white/10"
        aria-label="Quay lại danh sách"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {/* Avatar */}
      <div
        className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold shrink-0 cursor-pointer"
        onClick={onOpenContext}
      >
        {initials}
      </div>

      {/* Name + subtitle — tappable to open context */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenContext}>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate">{guestName}</span>
          {slaInfo && (
            <Badge className={cn("text-micro px-1.5 py-0 h-4", slaInfo.color)}>
              {slaInfo.label}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-primary-foreground/70">
          {conversation.ota_source && !(conversation.channel_type || '').toUpperCase().includes('WHATSAPP') && (
            <OtaBadge source={conversation.ota_source} showLabel={false} size="sm" />
          )}
          <span className="truncate">{subtitle}</span>
          {assignmentInfo && (
            <span className={cn("flex items-center gap-0.5 shrink-0", assignmentInfo.color)}>
              <assignmentInfo.icon className="h-3 w-3" />
              <span className="truncate max-w-[50px] text-primary-foreground/70">{assignmentInfo.label}</span>
            </span>
          )}
        </div>
      </div>


      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenContext}
        className="h-10 w-10 shrink-0 text-primary-foreground hover:bg-white/10"
        aria-label="Xem chi tiết"
      >
        <MoreVertical className="h-5 w-5" />
      </Button>
    </header>
  );
}
