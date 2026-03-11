import { format, parseISO } from 'date-fns';
import { Calendar, BedDouble, Building2 } from 'lucide-react';
import { Conversation } from '@/hooks/useConversations';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ContextStripProps {
  conversation: Conversation | null;
}

export function ContextStrip({ conversation }: ContextStripProps) {
  // Hidden per product decision — booking context moved to side panel
  if (!conversation) return null;
  return null;

  const bookingId = conversation.real_unified_booking_id || conversation.unified_booking_id;
  const checkInDate = conversation.check_in_date
    ? format(parseISO(conversation.check_in_date), 'dd/MM')
    : '--';
  const checkOutDate = conversation.check_out_date
    ? format(parseISO(conversation.check_out_date), 'dd/MM')
    : '--';
  const propertyName = conversation.pms_property_name || 'Chưa xác định';

  // Determine stay status - prioritize actual stay_status from stays table
  const getStayLabel = () => {
    // Use actual stay_status if available
    if (conversation.stay_status) {
      switch (conversation.stay_status) {
        case 'IN_HOUSE':
          return 'Đang ở';
        case 'CHECKED_IN':
          return 'Đã nhận phòng';
        case 'CHECKED_OUT':
          return 'Đã trả phòng';
        case 'NO_SHOW':
          return 'No-show';
        case 'WAIT_ROOM':
          return 'Chờ nhận phòng';
        default:
          return conversation.stay_status;
      }
    }

    // Fallback to date-based calculation if no stay record
    if (!conversation.check_in_date) return 'Chưa xác định';

    const checkIn = parseISO(conversation.check_in_date);
    const checkOut = conversation.check_out_date ? parseISO(conversation.check_out_date) : null;
    const now = new Date();

    if (checkOut && now > checkOut) return 'Quá ngày trả phòng';
    if (now >= checkIn && (!checkOut || now <= checkOut)) return 'Chờ nhận phòng';
    return 'Sắp đến';
  };

  const stayLabel = getStayLabel();

  return (
    <div className="bg-background border-b px-3 py-2 flex items-center gap-2 text-xs overflow-x-auto whitespace-nowrap">
      {/* Dates */}
      <span className="flex items-center gap-1 text-muted-foreground shrink-0">
        <Calendar className="h-3 w-3" />
        {checkInDate} → {checkOutDate}
      </span>

      <span className="text-muted-foreground">•</span>

      {/* Stay Status */}
      <Badge
        variant="outline"
        className={cn(
          "text-[9px] px-1 py-0 h-[14px] shrink-0",
          stayLabel === 'Đang ở' && "bg-success/10 text-success border-success/20",
          stayLabel === 'Đã nhận phòng' && "bg-success/10 text-success border-success/20",
          stayLabel === 'No-show' && "bg-destructive/10 text-destructive border-destructive/20",
          (stayLabel === 'Đã trả phòng' || stayLabel === 'Quá ngày trả phòng') && "bg-muted text-muted-foreground",
          (stayLabel === 'Sắp đến' || stayLabel === 'Chờ nhận phòng') && "bg-info/10 text-info border-info/20"
        )}
      >
        <BedDouble className="h-2 w-2 mr-0.5" />
        {stayLabel}
      </Badge>

      <span className="text-muted-foreground">•</span>

      {/* Property */}
      <span className="flex items-center gap-1 text-muted-foreground shrink-0">
        <Building2 className="h-3 w-3" />
        <span className="truncate max-w-[120px]">{propertyName}</span>
      </span>

      {/* Room */}
      <span className="text-muted-foreground">•</span>
      <span className="text-muted-foreground shrink-0">Phòng: Chưa gán</span>
    </div>
  );
}