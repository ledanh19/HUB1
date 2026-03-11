import { useEffect, useRef, useState, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { User, AlertCircle, Loader2, MessageSquare, Check, CheckCheck, RefreshCw, Clock, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Conversation, Message, OutboundMessage } from '@/hooks/useConversations';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import roomriseLogo from '@/assets/roomrise-logo-navy.png';
import { useIsMobile } from '@/hooks/use-mobile';

// Threshold for "near bottom" detection (in pixels)
const SCROLL_THRESHOLD = 150;

interface MessageThreadProps {
  messages: Message[];
  conversation: Conversation | null;
  isLoading?: boolean;
  pendingMessage?: string | null;
  pendingOutboundMessages?: OutboundMessage[];
  onRetry?: (outboundId: string) => void;
}

export function MessageThread({
  messages,
  conversation,
  isLoading,
  pendingMessage,
  pendingOutboundMessages = [],
  onRetry
}: MessageThreadProps) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const lastMessageCountRef = useRef(messages.length);

  // Check if user is near bottom of scroll
  const checkIfNearBottom = useCallback(() => {
    const scrollEl = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!scrollEl) return true;

    const { scrollTop, scrollHeight, clientHeight } = scrollEl;
    return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  }, []);

  // Handle scroll events
  useEffect(() => {
    const scrollEl = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!scrollEl) return;

    const handleScroll = () => {
      const nearBottom = checkIfNearBottom();
      setIsNearBottom(nearBottom);

      // Clear new message count when user scrolls to bottom
      if (nearBottom) {
        setNewMessageCount(0);
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [checkIfNearBottom]);

  // Handle new messages
  useEffect(() => {
    const currentCount = messages.length;
    const previousCount = lastMessageCountRef.current;

    if (currentCount > previousCount) {
      const newMsgCount = currentCount - previousCount;

      if (isNearBottom) {
        // Auto-scroll to bottom
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        // User is reading old messages, show floating badge
        setNewMessageCount(prev => prev + newMsgCount);
      }
    }

    lastMessageCountRef.current = currentCount;
  }, [messages.length, isNearBottom]);

  // Initial scroll to bottom and on pending message
  useEffect(() => {
    if (pendingMessage) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [pendingMessage]);

  // Scroll to bottom on conversation change
  useEffect(() => {
    if (conversation?.id) {
      // Reset state for new conversation
      setNewMessageCount(0);
      setIsNearBottom(true);
      lastMessageCountRef.current = messages.length;

      // Scroll to bottom after content renders — double scroll for reliability
      const t1 = setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 150);
      const t2 = setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 500);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [conversation?.id]);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewMessageCount(0);
  };

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-center font-medium">Chọn một hội thoại để xem tin nhắn</p>
        <p className="text-xs text-center mt-2 max-w-[300px]">
          Đây là inbox vận hành. Chọn hội thoại từ danh sách bên trái để bắt đầu xử lý.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-3",
              i % 2 === 0 ? "justify-start" : "justify-end"
            )}
          >
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-16 w-64 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0 && !pendingMessage && pendingOutboundMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-center">Chưa có tin nhắn trong hội thoại này</p>
        {!conversation.is_messaging_supported && (
          <Alert className="mt-4 max-w-md" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              OTA này không hỗ trợ nhắn tin. Vui lòng liên hệ khách qua email hoặc điện thoại.
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  // Group messages by date
  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="relative h-full overflow-hidden">
      <ScrollArea className="h-full" ref={scrollRef}>
        <div className={cn("p-3 space-y-4 w-full", isMobile && "px-2 py-3")}>
          {Object.entries(groupedMessages).map(([date, dateMessages]) => (
            <div key={date}>
              {/* Date separator — WhatsApp-style rounded pill */}
              <div className="flex items-center justify-center mb-3">
                <div className={cn(
                  "text-xs px-3 py-1 rounded-full shadow-sm",
                  isMobile
                    ? "bg-muted/60 text-muted-foreground font-medium"
                    : "bg-background text-muted-foreground border"
                )}>
                  {date}
                </div>
              </div>

              {/* Messages for this date */}
              <div className="space-y-1">
                {dateMessages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    guestName={conversation.booking_guest_name || conversation.guest_name || 'Khách'}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Pending outbound messages (from queue) */}
          {pendingOutboundMessages.map((outbound) => (
            <PendingMessageBubble
              key={outbound.id}
              outbound={outbound}
              onRetry={onRetry}
              isMobile={isMobile}
            />
          ))}

          {/* Immediate pending message (optimistic UI) */}
          {pendingMessage && (
            <div className="flex justify-end gap-2">
              <div className={cn("flex flex-col", isMobile ? "max-w-[80%]" : "max-w-[70%]")}>
                <div className={cn(
                  "rounded-lg px-3 py-1.5 opacity-70 shadow-sm",
                  isMobile
                    ? "bg-[#DCF8C6] dark:bg-[#005C4B] text-foreground rounded-tr-none"
                    : "bg-[#DBEAFE] dark:bg-[#1E3A5F] border border-[#BFDBFE] dark:border-[#2D4A6F] text-foreground"
                )}>
                  <p className="text-sm whitespace-pre-wrap">{pendingMessage}</p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-[10px] text-muted-foreground">Đang gửi...</span>
                  </div>
                </div>
                {!isMobile && <span className="text-xs text-muted-foreground mt-1 text-right">Roomrise</span>}
              </div>
              {!isMobile && (
                <div className="h-8 w-8 rounded-full bg-background border flex items-center justify-center shrink-0 overflow-hidden">
                  <img src={roomriseLogo} alt="Roomrise" className="h-5 w-5 object-contain" />
                </div>
              )}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* New messages floating button */}
      {newMessageCount > 0 && !isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors animate-in slide-in-from-bottom-4"
        >
          <ChevronDown className="h-4 w-4" />
          <span className="text-sm font-medium">
            {newMessageCount} tin nhắn mới
          </span>
        </button>
      )}
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  guestName: string;
  isMobile: boolean;
}

function MessageBubble({ message, guestName, isMobile }: MessageBubbleProps) {
  const isOutbound = message.direction === 'OUTBOUND';
  const isSystem = message.sender_type === 'SYSTEM';
  const isGuest = message.sender_type === 'GUEST' || message.direction === 'INBOUND';

  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <div className={cn(
          "text-xs px-3 py-1 rounded-full max-w-[80%]",
          isMobile
            ? "bg-muted/50 text-muted-foreground italic"
            : "bg-muted text-muted-foreground"
        )}>
          {message.body}
        </div>
      </div>
    );
  }

  // Get sender label
  const senderLabel = isGuest
    ? guestName
    : (message.sender_name || 'Roomrise');

  // Guest initials
  const guestInitials = guestName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // WhatsApp-style time (compact)
  const timeStr = message.sent_at
    ? format(new Date(message.sent_at), 'HH:mm')
    : '';

  // Desktop-style time
  const desktopTimeStr = message.sent_at
    ? formatDistanceToNow(new Date(message.sent_at), { addSuffix: true, locale: vi })
    : '';

  // ═══ MOBILE: WhatsApp-style bubbles ═══
  if (isMobile) {
    return (
      <div className={cn(
        "flex mb-0.5",
        isOutbound ? "justify-end pr-1 pl-10" : "justify-start pl-1 pr-10"
      )}>
        <div className={cn(
          "relative max-w-[80%] rounded-lg px-3 py-1.5 shadow-sm",
          isOutbound
            ? "bg-[#DCF8C6] dark:bg-[#005C4B] rounded-tr-none"
            : "bg-white dark:bg-muted rounded-tl-none"
        )}>
          {/* Message body */}
          <p className="text-[14px] whitespace-pre-wrap break-words text-foreground leading-relaxed">
            {message.body || '(Không có nội dung)'}
          </p>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {message.attachments.map((attachment: unknown, i: number) => {
                const att = attachment as { name?: string; url?: string };
                return (
                  <a
                    key={i}
                    href={typeof attachment === 'string' ? attachment : att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline flex items-center gap-1 text-primary"
                  >
                    📎 {att.name || `Tệp đính kèm ${i + 1}`}
                  </a>
                );
              })}
            </div>
          )}

          {/* Time + delivery status — bottom-right inside bubble (WhatsApp style) */}
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className="text-[10px] text-muted-foreground/70">{timeStr}</span>
            {isOutbound && (
              <>
                {(message as any)._isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : message.channel_type === 'WHATSAPP' ? (
                  message.wa_status === 'READ' ? (
                    <CheckCheck className="h-3.5 w-3.5 text-info" />
                  ) : message.wa_status === 'DELIVERED' ? (
                    <CheckCheck className="h-3.5 w-3.5 text-muted-foreground/60" />
                  ) : message.wa_status === 'FAILED' ? (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-muted-foreground/60" />
                  )
                ) : (
                  <Check className="h-3.5 w-3.5 text-muted-foreground/60" />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══ DESKTOP: Original layout ═══
  return (
    <div className={cn(
      "flex gap-2",
      isOutbound ? "justify-end" : "justify-start"
    )}>
      {/* Guest avatar - left side */}
      {!isOutbound && (
        <div className="h-7 w-7 rounded-full bg-info/100 flex items-center justify-center shrink-0 text-white text-xs font-semibold">
          {guestInitials || 'KH'}
        </div>
      )}

      <div className="flex flex-col max-w-[75%]">
        {/* Time label */}
        <span className={cn(
          "text-xs text-muted-foreground mb-1",
          isOutbound ? "text-right" : "text-left"
        )}>
          {desktopTimeStr}
        </span>

        {/* Message bubble */}
        <div className={cn(
          "rounded-lg px-3 py-1.5 shadow-sm border",
          isOutbound
            ? "bg-[#DBEAFE] dark:bg-[#1E3A5F] border-[#BFDBFE] dark:border-[#2D4A6F]"
            : "bg-white dark:bg-muted border-border dark:border-border",
          (message as any)._isPending && "opacity-70"
        )}>
          <p className="text-sm whitespace-pre-wrap break-words text-foreground">{message.body || '(Không có nội dung)'}</p>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.attachments.map((attachment: unknown, i: number) => {
                const att = attachment as { name?: string; url?: string };
                return (
                  <a
                    key={i}
                    href={typeof attachment === 'string' ? attachment : att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline flex items-center gap-1 text-primary"
                  >
                    📎 {att.name || `Tệp đính kèm ${i + 1}`}
                  </a>
                );
              })}
            </div>
          )}

          {/* Sent / delivery status indicator for outbound */}
          {isOutbound && (
            <div className="flex items-center justify-end gap-1 mt-1">
              {(message as any)._isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Đang gửi...</span>
                </>
              ) : message.channel_type === 'WHATSAPP' ? (
                message.wa_status === 'READ' ? (
                  <CheckCheck className="h-3 w-3 text-info" />
                ) : message.wa_status === 'DELIVERED' ? (
                  <CheckCheck className="h-3 w-3 text-muted-foreground" />
                ) : message.wa_status === 'FAILED' ? (
                  <AlertCircle className="h-3 w-3 text-destructive" />
                ) : (
                  <Check className="h-3 w-3 text-muted-foreground" />
                )
              ) : (
                <Check className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        {/* Sender name below message */}
        <span className={cn(
          "text-xs text-muted-foreground mt-1",
          isOutbound ? "text-right" : "text-left"
        )}>
          {senderLabel}
        </span>
      </div>

      {/* Roomrise logo - right side for outbound */}
      {isOutbound && (
        <div className="h-7 w-7 rounded-full bg-background border flex items-center justify-center shrink-0 overflow-hidden">
          <img src={roomriseLogo} alt="Roomrise" className="h-4 w-4 object-contain" />
        </div>
      )}
    </div>
  );
}

interface PendingMessageBubbleProps {
  outbound: OutboundMessage;
  onRetry?: (outboundId: string) => void;
  isMobile: boolean;
}

function PendingMessageBubble({ outbound, onRetry, isMobile }: PendingMessageBubbleProps) {
  const isSending = outbound.status === 'SENDING' || outbound.status === 'QUEUED';
  const isFailed = outbound.status === 'FAILED';

  // ═══ Mobile: WhatsApp-style ═══
  if (isMobile) {
    return (
      <div className="flex justify-end pl-12 mb-0.5">
        <div className={cn(
          "relative max-w-[85%] rounded-lg px-3 py-1.5 shadow-sm rounded-tr-none",
          isFailed
            ? "bg-destructive/10 border border-destructive/30"
            : "bg-[#DCF8C6] dark:bg-[#005C4B]"
        )}>
          <p className="text-[14px] whitespace-pre-wrap text-foreground">{outbound.body}</p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            {isSending ? (
              <>
                <span className="text-[10px] text-muted-foreground/70">
                  {outbound.status === 'QUEUED' ? 'Đang chờ' : 'Đang gửi'}
                </span>
                <Clock className="h-3 w-3 text-muted-foreground/60" />
              </>
            ) : isFailed ? (
              <>
                <span className="text-[10px] text-destructive">Thất bại</span>
                <AlertCircle className="h-3 w-3 text-destructive" />
                {onRetry && (
                  <button
                    onClick={() => onRetry(outbound.id)}
                    className="text-[10px] text-primary underline ml-1"
                  >
                    Thử lại
                  </button>
                )}
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 text-success" />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══ Desktop: Original ═══
  return (
    <div className="flex justify-end gap-2">
      <div className="flex flex-col max-w-[75%]">
        <div className={cn(
          "rounded-lg px-3 py-1.5 shadow-sm border",
          isFailed
            ? "bg-destructive/10 border-destructive/30"
            : "bg-[#DBEAFE] dark:bg-[#1E3A5F] border-[#BFDBFE] dark:border-[#2D4A6F]"
        )}>
          <p className="text-sm whitespace-pre-wrap text-foreground">{outbound.body}</p>

          <div className="flex items-center justify-end gap-1.5 mt-1">
            {isSending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {outbound.status === 'QUEUED' ? 'Đang chờ...' : 'Đang gửi...'}
                </span>
              </>
            ) : isFailed ? (
              <>
                <AlertCircle className="h-3 w-3 text-destructive" />
                <span className="text-xs text-destructive">Gửi thất bại</span>
                {onRetry && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs"
                    onClick={() => onRetry(outbound.id)}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Thử lại
                  </Button>
                )}
              </>
            ) : (
              <>
                <Check className="h-3 w-3 text-success" />
                <span className="text-xs text-success">Đã gửi</span>
              </>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground mt-1 text-right">Roomrise</span>
      </div>
      <div className="h-7 w-7 rounded-full bg-background border flex items-center justify-center shrink-0 overflow-hidden">
        <img src={roomriseLogo} alt="Roomrise" className="h-4 w-4 object-contain" />
      </div>
    </div>
  );
}

function groupMessagesByDate(messages: Message[]): Record<string, Message[]> {
  const groups: Record<string, Message[]> = {};

  for (const message of messages) {
    const date = format(new Date(message.sent_at), 'dd/MM/yyyy', { locale: vi });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
  }

  return groups;
}
