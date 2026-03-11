import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Bell, CheckCheck, Mail, CalendarDays, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format } from "date-fns";
import { vi } from "date-fns/locale";
import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import {
  bookingChangeToEvent,
  mergeBookingChangeEvent,
  type FeedEvent,
  type BookingChangeRecord,
  type BookingInfo,
} from "@/lib/bookingChangeEventHelper";
import {
  processBookingChangesToFeedEvents,
  type BookingChangeRecordWithSource,
} from "@/lib/bookingChangeDeduper";
import {
  useRealtimeSubscription,
  realtimeManager,
  type RealtimeEvent
} from "@/lib/realtimeManager";
import {
  filterBookingChanges,
  type BookingChangeRecord as FilterableBookingChange,
} from "@/modules/notifications/utils/filterNotifications";
import {
  EVENT_CONFIG,
  formatCheckInDate as sharedFormatCheckInDate,
  formatCurrency as sharedFormatCurrency,
  normalizeOtaSource as sharedNormalizeOtaSource,
  TECH_FIELDS,
  OPS_FIELDS,
  type NotificationEventType,
} from "@/modules/notifications/renderNotification";
import { useAnGiaProperties } from "@/hooks/useAnGiaProperties";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications, type NotificationRow } from "@/hooks/useNotifications";

// OTA logos
import expediaLogo from "@/assets/ota-logos/expedia.png";
import agodaLogo from "@/assets/ota-logos/agoda.png";
import ctripLogo from "@/assets/ota-logos/ctrip.png";
import bookingLogo from "@/assets/ota-logos/booking.png";
import travelokaLogo from "@/assets/ota-logos/traveloka.png";

const OTA_LOGOS: Record<string, string> = {
  EXPEDIA: expediaLogo, "EXPEDIA.COM": expediaLogo, "EXPEDIACOM": expediaLogo,
  AGODA: agodaLogo, "AGODA.COM": agodaLogo, "AGODACOM": agodaLogo,
  CTRIP: ctripLogo, "CTRIP.COM": ctripLogo, "CTRIPCOM": ctripLogo,
  TRIP: ctripLogo, "TRIP.COM": ctripLogo, "TRIPCOM": ctripLogo,
  "BOOKING.COM": bookingLogo, "BOOKINGCOM": bookingLogo, BOOKING: bookingLogo,
  TRAVELOKA: travelokaLogo, "TRAVELOKA.COM": travelokaLogo, "TRAVELOKACOM": travelokaLogo,
};

function getOtaLogo(source: string | undefined): string | null {
  if (!source) return null;
  const upper = source.toUpperCase().trim().replace(/\./g, '');
  if (OTA_LOGOS[upper]) return OTA_LOGOS[upper];
  const withDots = source.toUpperCase().trim();
  if (OTA_LOGOS[withDots]) return OTA_LOGOS[withDots];
  const otaKeywords = ['EXPEDIA', 'AGODA', 'CTRIP', 'TRIP', 'BOOKING', 'TRAVELOKA'];
  for (const keyword of otaKeywords) {
    if (upper.includes(keyword)) {
      for (const [key, logo] of Object.entries(OTA_LOGOS)) {
        if (key.includes(keyword)) return logo;
      }
    }
  }
  return null;
}

// ── Booking change → FeedEvent (unchanged) ──
function simpleChangesToEvents(
  changes: BookingChangeRecord[],
  bookingsById: Record<string, BookingInfo>,
  lastReadAt?: number
): FeedEvent[] {
  const seen = new Map<string, FeedEvent>();
  for (const change of changes) {
    if (!change.unified_booking_id) continue;
    const booking = bookingsById[change.unified_booking_id];
    if (!booking) continue;

    const afterData = change.after_data || {};
    const statusRaw = ((afterData.booking_status as string) || (afterData.status as string) || (afterData.channex_status as string) || (booking?.booking_status as string) || '');
    const status = statusRaw.toUpperCase();

    let type: FeedEvent['type'];
    if (status === 'CANCELLED' || status === 'CANCELED') {
      type = 'CANCELLATION';
    } else if (change.change_type === 'INSERT') {
      type = 'NEW_BOOKING';
    } else {
      type = 'MODIFICATION';
    }

    const dedupeKey = `${change.unified_booking_id}:${type}`;
    const existing = seen.get(dedupeKey);
    if (existing && new Date(existing.timestamp) > new Date(change.created_at)) continue;

    const eventTime = new Date(change.created_at);
    const timeStr = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh', hour12: false,
    }).format(eventTime);

    const checkInFormatted = booking.check_in_date
      ? new Date(booking.check_in_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';

    const amount = type === 'CANCELLATION' ? 0 : (booking.total_amount_gross || booking.total_amount_net || 0);
    const nights = booking.nights || 1;
    const normalizedSource = normalizeOtaSourceSimple(booking.ota_source);

    const event: FeedEvent = {
      id: `bc:${change.id}`, type,
      title: `${booking.guest_name || 'Unknown'}${checkInFormatted ? ` - CI: ${checkInFormatted}` : ''}`,
      subtitle: type === 'NEW_BOOKING' ? `${nights} đêm | Đặt lúc ${timeStr}` : type === 'CANCELLATION' ? `${nights} đêm | Hủy lúc ${timeStr}` : `Cập nhật lúc ${timeStr}`,
      timestamp: change.created_at,
      source: normalizedSource, amount,
      link: `/bookings/${change.unified_booking_id}`,
      isNew: lastReadAt !== undefined ? eventTime.getTime() > lastReadAt : false,
      hasBookingJoin: true,
      guestName: booking.guest_name || 'Unknown',
      checkInDate: checkInFormatted, nights, bookedAt: timeStr,
    };
    seen.set(dedupeKey, event);
  }
  return Array.from(seen.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function normalizeOtaSourceSimple(source: string | null | undefined): string | undefined {
  if (!source) return undefined;
  const upper = source.toUpperCase().trim();
  if (upper.includes('CTRIP') || upper.includes('TRIP')) return 'CTRIP';
  if (upper.includes('AGODA')) return 'AGODA';
  if (upper.includes('BOOKING')) return 'BOOKING.COM';
  if (upper.includes('EXPEDIA')) return 'EXPEDIA';
  if (upper.includes('TRAVELOKA')) return 'TRAVELOKA';
  return upper;
}

const formatCurrency = (amount: number) => sharedFormatCurrency(amount);

const FEED_TO_NOTIFICATION_TYPE: Record<FeedEvent["type"], NotificationEventType> = {
  NEW_MESSAGE: 'MESSAGE_INBOUND',
  NEW_BOOKING: 'BOOKING_NEW',
  MODIFICATION: 'BOOKING_MODIFIED',
  CANCELLATION: 'BOOKING_CANCELLED',
};

const EVENT_TYPE_CONFIG: Record<FeedEvent["type"], { label: string; className: string }> = {
  NEW_MESSAGE: { label: EVENT_CONFIG.MESSAGE_INBOUND.labelVi, className: EVENT_CONFIG.MESSAGE_INBOUND.badgeClass },
  NEW_BOOKING: { label: EVENT_CONFIG.BOOKING_NEW.labelVi, className: EVENT_CONFIG.BOOKING_NEW.badgeClass },
  MODIFICATION: { label: EVENT_CONFIG.BOOKING_MODIFIED.labelVi, className: EVENT_CONFIG.BOOKING_MODIFIED.badgeClass },
  CANCELLATION: { label: EVENT_CONFIG.BOOKING_CANCELLED.labelVi, className: EVENT_CONFIG.BOOKING_CANCELLED.badgeClass },
};

// Email event type config
const EMAIL_EVENT_CONFIG: Record<string, { label: string; className: string }> = {
  EMAIL_NEW_THREAD: { label: "Email mới", className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300" },
  EMAIL_NEW_MESSAGE: { label: "Email mới", className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300" },
  EMAIL_ACTIONABLE: { label: "Cần xử lý", className: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300" },
  EMAIL_NEEDS_REVIEW: { label: "Cần review", className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300" },
};

// ── Tab types ──
type BellTab = 'all' | 'action' | 'booking' | 'email';

const TAB_CONFIG: { key: BellTab; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'Tất cả', icon: null },
  { key: 'action', label: 'Cần xử lý', icon: <AlertCircle className="h-3 w-3" /> },
  { key: 'booking', label: 'Đặt phòng', icon: <CalendarDays className="h-3 w-3" /> },
  { key: 'email', label: 'Email', icon: <Mail className="h-3 w-3" /> },
];

// ── NAMESPACING ──
const NS = 'rrch:v1';

function parseLastReadAt(v: string | null | undefined): number {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

function migrateLegacyKey(oldKey: string, newKey: string): void {
  const oldVal = localStorage.getItem(oldKey);
  if (oldVal !== null && localStorage.getItem(newKey) === null) {
    localStorage.setItem(newKey, oldVal);
  }
  localStorage.removeItem(oldKey);
}

// ── Unified item type for rendering ──
interface UnifiedBellItem {
  id: string;
  module: 'booking' | 'email' | 'message';
  isNew: boolean;
  timestamp: string;
  // Booking fields
  feedEvent?: FeedEvent;
  // Email fields
  notification?: NotificationRow;
}

export function NotificationBell() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [activeTab, setActiveTab] = useState<BellTab>('all');

  const lastReadKey = useMemo(
    () => userId ? `${NS}:notification_last_read_at:${userId}` : null,
    [userId]
  );

  const [open, setOpen] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<number>(() => {
    if (!userId) return 0;
    return parseLastReadAt(localStorage.getItem(`${NS}:notification_last_read_at:${userId}`));
  });

  useEffect(() => {
    if (userId) {
      migrateLegacyKey(`notification_last_read_at_${userId}`, `${NS}:notification_last_read_at:${userId}`);
      localStorage.removeItem('notification_last_read_at');
      localStorage.removeItem('notification_last_read_at_anon');
      setLastReadAt(parseLastReadAt(localStorage.getItem(`${NS}:notification_last_read_at:${userId}`)));
    } else {
      setLastReadAt(0);
      setBookingEvents([]);
    }
  }, [userId]);

  const storageHandlerRef = useRef<((e: StorageEvent) => void) | null>(null);
  useEffect(() => {
    if (storageHandlerRef.current) {
      window.removeEventListener('storage', storageHandlerRef.current);
      storageHandlerRef.current = null;
    }
    if (!lastReadKey) return;
    const handler = (e: StorageEvent) => {
      if (e.key === lastReadKey && e.newValue) setLastReadAt(parseLastReadAt(e.newValue));
    };
    storageHandlerRef.current = handler;
    window.addEventListener('storage', handler);
    return () => { window.removeEventListener('storage', handler); storageHandlerRef.current = null; };
  }, [lastReadKey]);

  const [bookingEvents, setBookingEvents] = useState<FeedEvent[]>([]);
  const processedChangeIds = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const invalidateNotifications = () => {
      queryClient.invalidateQueries({ queryKey: ["notification-booking-changes", userId] });
      queryClient.invalidateQueries({ queryKey: ["notification-messages", userId] });
    };
    const handleVisibility = () => { if (document.visibilityState === 'visible') invalidateNotifications(); };
    const handleOnline = () => invalidateNotifications();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    return () => { document.removeEventListener('visibilitychange', handleVisibility); window.removeEventListener('online', handleOnline); };
  }, [userId, queryClient]);

  const { propertyIds: anGiaPropertyIds } = useAnGiaProperties();

  // ── Existing: messages (OTA) query ──
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ["notification-messages", userId],
    enabled: !!userId,
    refetchOnMount: false,
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase.from("messages")
        .select("id, sent_at, direction, conversation_id")
        .eq("direction", "INBOUND")
        .gte("sent_at", sinceIso)
        .order("sent_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000, staleTime: 15000,
  });

  // ── Existing: booking_changes query ──
  const { data: bookingChangesData, isLoading: changesLoading } = useQuery({
    queryKey: ["notification-booking-changes", userId],
    enabled: !!userId,
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await supabase.from("booking_changes")
        .select("id, change_type, change_source, created_at, unified_booking_id, changed_fields, after_data, before_data")
        .in("change_type", ["INSERT", "UPDATE", "STATUS_CHANGE", "AMOUNT_CHANGE", "DATES_CHANGE", "GUESTS_CHANGE", "ROOM_LINE_ADDED", "ROOM_LINE_MODIFIED", "ROOM_LINE_REMOVED"])
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000, staleTime: 3000,
  });

  const { data: bookingsData } = useQuery({
    queryKey: ["notification-bookings-info", userId, bookingChangesData?.map(c => c.unified_booking_id).join(','), anGiaPropertyIds.join(',')],
    staleTime: 30_000, refetchOnMount: false, refetchOnWindowFocus: false,
    queryFn: async () => {
      const changeBookingIds = bookingChangesData?.map((c) => c.unified_booking_id) || [];
      const uniqueIds = Array.from(new Set(changeBookingIds)).filter(Boolean);
      if (uniqueIds.length === 0) return {} as Record<string, BookingInfo>;
      const { data: mirrorData, error } = await supabase.from("bookings_mirror")
        .select("unified_booking_id, guest_name, ota_source, booking_status, total_amount_net, total_amount_gross, check_in_date, nights, channex_property_id")
        .in("unified_booking_id", uniqueIds);
      if (error) throw error;
      const anGiaSet = new Set(anGiaPropertyIds);
      const bookingsMap: Record<string, BookingInfo> = {};
      mirrorData?.forEach((b: any) => {
        if (anGiaSet.size === 0 || anGiaSet.has(b.channex_property_id)) {
          bookingsMap[b.unified_booking_id] = b;
        }
      });
      return bookingsMap;
    },
    enabled: !!userId && !!bookingChangesData && bookingChangesData.length > 0,
  });

  useEffect(() => {
    if (!bookingChangesData) return;
    const bookingsById = bookingsData || {};
    const filteredChanges = filterBookingChanges(bookingChangesData as FilterableBookingChange[]);
    const events = simpleChangesToEvents(filteredChanges as BookingChangeRecord[], bookingsById, lastReadAt);
    setBookingEvents(events);
    bookingChangesData.forEach(c => {
      processedChangeIds.current.add(c.id);
      realtimeManager.markEventProcessed('booking_changes', c.id, c.created_at);
    });
  }, [bookingChangesData, bookingsData, lastReadAt]);

  // Realtime handler for booking_changes
  const handleBookingChangeEvent = useCallback((event: RealtimeEvent) => {
    const newChange = event.payload.new as BookingChangeRecord;
    if (processedChangeIds.current.has(newChange.id)) return;
    processedChangeIds.current.add(newChange.id);

    const changeType = (newChange.change_type || '').toUpperCase();
    if (changeType !== 'INSERT') {
      const changedFields = Array.isArray(newChange.changed_fields) ? newChange.changed_fields : [];
      const isAllTechFields = changedFields.length === 0 || changedFields.every((f: string) => TECH_FIELDS.has(f.toLowerCase()));
      const hasOpsFields = changedFields.some((f: string) => OPS_FIELDS.has(f.toLowerCase()));
      if (isAllTechFields && !hasOpsFields) {
        queryClient.invalidateQueries({ queryKey: ["notification-booking-changes", userId] });
        return;
      }
    }

    supabase.from("bookings_mirror")
      .select("unified_booking_id, guest_name, ota_source, booking_status, total_amount_net, total_amount_gross, check_in_date, nights")
      .eq("unified_booking_id", newChange.unified_booking_id)
      .maybeSingle()
      .then(({ data: bookingInfo }) => {
        const bookingsById: Record<string, BookingInfo> = {};
        if (bookingInfo) bookingsById[bookingInfo.unified_booking_id] = bookingInfo;
        const feedEvent = bookingChangeToEvent(newChange, bookingsById, lastReadAt ? new Date(lastReadAt) : undefined, true);
        if (feedEvent) {
          setBookingEvents(prev => {
            const merged = mergeBookingChangeEvent(prev, feedEvent, 'realtime_insert');
            return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          });
        }
      });
  }, [lastReadAt, queryClient, userId]);

  useRealtimeSubscription('booking_changes', handleBookingChangeEvent, { eventTypes: ['INSERT'] });

  const handleMessageEvent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notification-messages", userId] });
  }, [queryClient, userId]);
  useRealtimeSubscription('messages', handleMessageEvent, { eventTypes: ['INSERT', 'UPDATE'] });

  // ── NEW: Email notifications from unified notifications table ──
  const { emailNotifications, unreadEmailCount, markRead: markEmailRead, markAllRead: markAllEmailRead } = useNotifications();

  // ── Build unified items list ──
  const unifiedItems = useMemo((): UnifiedBellItem[] => {
    const items: UnifiedBellItem[] = [];

    // OTA messages
    messagesData?.forEach((msg) => {
      const eventTime = new Date(msg.sent_at);
      items.push({
        id: `msg-${msg.id}`,
        module: 'message',
        isNew: eventTime.getTime() > lastReadAt,
        timestamp: msg.sent_at,
        feedEvent: {
          id: `msg-${msg.id}`,
          type: "NEW_MESSAGE",
          title: "Tin nhắn mới",
          subtitle: format(eventTime, "HH:mm dd/MM", { locale: vi }),
          timestamp: msg.sent_at,
          link: `/ota-messages?conversation=${msg.conversation_id}`,
          isNew: eventTime.getTime() > lastReadAt,
        },
      });
    });

    // Booking events
    bookingEvents.forEach(event => {
      items.push({
        id: event.id,
        module: 'booking',
        isNew: event.isNew ?? false,
        timestamp: event.timestamp,
        feedEvent: event,
      });
    });

    // Email notifications from unified table (per-user read state)
    emailNotifications.forEach(notif => {
      items.push({
        id: `email-${notif.id}`,
        module: 'email',
        isNew: !notif.user_read_at,
        timestamp: notif.created_at,
        notification: notif,
      });
    });

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items;
  }, [messagesData, bookingEvents, emailNotifications, lastReadAt]);

  // ── Filter by active tab ──
  const filteredItems = useMemo(() => {
    switch (activeTab) {
      case 'booking':
        return unifiedItems.filter(i => i.module === 'booking' || i.module === 'message');
      case 'email':
        return unifiedItems.filter(i => i.module === 'email');
      case 'action':
        return unifiedItems.filter(i => {
          if (i.module === 'email' && i.notification) {
            return i.notification.event_type === 'EMAIL_ACTIONABLE' || i.notification.event_type === 'EMAIL_NEEDS_REVIEW';
          }
          if (i.module === 'booking' && i.feedEvent) {
            return i.feedEvent.type === 'NEW_BOOKING' || i.feedEvent.type === 'CANCELLATION';
          }
          return false;
        });
      default:
        return unifiedItems;
    }
  }, [unifiedItems, activeTab]);

  // ── Counts ──
  const bookingUnreadCount = useMemo(() => {
    return unifiedItems.filter(i => (i.module === 'booking' || i.module === 'message') && i.isNew).length;
  }, [unifiedItems]);

  const totalUnreadCount = useMemo(() => {
    return bookingUnreadCount + unreadEmailCount;
  }, [bookingUnreadCount, unreadEmailCount]);

  const actionCount = useMemo(() => {
    return unifiedItems.filter(i => {
      if (i.module === 'email' && i.notification) {
        return !i.notification.user_read_at && (i.notification.event_type === 'EMAIL_ACTIONABLE' || i.notification.event_type === 'EMAIL_NEEDS_REVIEW');
      }
      if (i.module === 'booking' && i.feedEvent) {
        return i.isNew && (i.feedEvent.type === 'NEW_BOOKING' || i.feedEvent.type === 'CANCELLATION');
      }
      return false;
    }).length;
  }, [unifiedItems]);

  const isLoading = messagesLoading && changesLoading;

  const handleMarkAllAsRead = useCallback(() => {
    if (!userId || !lastReadKey) return;
    const now = new Date();
    localStorage.setItem(lastReadKey, now.toISOString());
    setLastReadAt(now.getTime());
    // Also mark all email notifications as read (per-user)
    markAllEmailRead();
  }, [userId, lastReadKey, markAllEmailRead]);

  const handleOpenChange = (isOpen: boolean) => setOpen(isOpen);

  const handleItemClick = useCallback((item: UnifiedBellItem) => {
    setOpen(false);
    if (!userId || !lastReadKey) return;

    // Mark booking/message read via timestamp cursor
    if (item.module !== 'email') {
      const timeMs = new Date(item.timestamp).getTime();
      if (timeMs > lastReadAt) {
        localStorage.setItem(lastReadKey, new Date(timeMs).toISOString());
        setLastReadAt(timeMs);
      }
    }

    // Mark email notification as read via per-user state
    if (item.module === 'email' && item.notification && !item.notification.user_read_at) {
      markEmailRead(item.notification.id);
    }
  }, [userId, lastReadKey, lastReadAt, markEmailRead]);

  // ── Render a single bell item ──
  const renderItem = (item: UnifiedBellItem) => {
    // Email notification
    if (item.module === 'email' && item.notification) {
      const notif = item.notification;
      const emailConfig = EMAIL_EVENT_CONFIG[notif.event_type] || EMAIL_EVENT_CONFIG.EMAIL_NEW_MESSAGE;
      const meta = notif.metadata as Record<string, unknown> | null;
      const emailTag = (meta?.tag as string) || '';

      return (
        <Link
          key={item.id}
          to={notif.deep_link || "/email/inbox"}
          onClick={() => handleItemClick(item)}
          className={`flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors relative ${
            item.isNew ? "bg-primary/5 dark:bg-primary/15 border-l-4 border-l-primary" : ""
          }`}
        >
          <div className="flex-shrink-0 mt-0.5">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
              notif.event_type === 'EMAIL_ACTIONABLE' ? 'bg-orange-100 dark:bg-orange-900/30' :
              notif.event_type === 'EMAIL_NEEDS_REVIEW' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
              'bg-blue-100 dark:bg-blue-900/30'
            }`}>
              <Mail className={`h-4 w-4 ${
                notif.event_type === 'EMAIL_ACTIONABLE' ? 'text-orange-600 dark:text-orange-400' :
                notif.event_type === 'EMAIL_NEEDS_REVIEW' ? 'text-yellow-600 dark:text-yellow-400' :
                'text-blue-600 dark:text-blue-400'
              }`} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={`${emailConfig.className} text-micro px-1.5 py-0`}>
                {emailConfig.label}
              </Badge>
              {emailTag && emailTag !== 'UNKNOWN' && (
                <Badge variant="outline" className="text-micro px-1.5 py-0 text-muted-foreground">
                  {emailTag.replace(/_/g, ' ')}
                </Badge>
              )}
              {item.isNew && (
                <Badge className="bg-primary text-primary-foreground border-primary text-micro px-1.5 py-0 font-bold">MỚI</Badge>
              )}
              <span className="text-micro text-muted-foreground">
                {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: vi })}
              </span>
            </div>
            <p className={`text-sm truncate ${item.isNew ? "font-bold text-foreground" : "font-medium"}`}>
              {notif.title}
            </p>
            {notif.body && (
              <p className="text-micro text-muted-foreground truncate">{notif.body}</p>
            )}
          </div>
        </Link>
      );
    }

    // Booking / OTA message (existing rendering — preserved exactly)
    if (item.feedEvent) {
      const event = item.feedEvent;
      const config = EVENT_TYPE_CONFIG[event.type];
      const isBookingEvent = event.type !== "NEW_MESSAGE";

      return (
        <Link
          key={item.id}
          to={event.link || "#"}
          onClick={() => handleItemClick(item)}
          className={`flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors relative ${
            event.isNew ? "bg-primary/5 dark:bg-primary/15 border-l-4 border-l-primary" : ""
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={`${config.className} text-micro px-1.5 py-0`}>{config.label}</Badge>
              {event.isNew && (
                <Badge className="bg-primary text-primary-foreground border-primary text-micro px-1.5 py-0 font-bold">MỚI</Badge>
              )}
              <span className="text-micro text-muted-foreground">
                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true, locale: vi })}
              </span>
            </div>
            {isBookingEvent && event.guestName ? (
              <>
                <p className={`text-sm ${event.isNew ? "font-bold text-foreground" : "font-semibold"}`}>
                  {event.guestName}{event.checkInDate && <span className="font-normal"> - CI: {event.checkInDate}</span>}
                </p>
                <p className="text-micro text-muted-foreground">
                  {event.nights && event.nights > 0 && `${event.nights} đêm`}
                  {event.type === "NEW_BOOKING" && event.amount !== undefined && event.amount > 0 && (
                    <span className="font-semibold text-primary"> • {formatCurrency(event.amount)}</span>
                  )}
                  {event.type === "CANCELLATION" && event.amount !== undefined && event.amount > 0 && (
                    <span className="font-semibold text-destructive"> • {formatCurrency(event.amount)}</span>
                  )}
                  {event.type === "NEW_BOOKING" && ` | Đặt lúc ${event.bookedAt || event.subtitle}`}
                  {event.type === "CANCELLATION" && ` | Huỷ lúc ${event.bookedAt || event.subtitle}`}
                  {event.type === "MODIFICATION" && ` | ${event.subtitle}`}
                </p>
              </>
            ) : (
              <>
                <p className={`text-xs truncate ${event.isNew ? "font-bold text-foreground" : "font-medium"}`}>{event.title}</p>
                <p className="text-micro text-muted-foreground">{event.subtitle}</p>
              </>
            )}
          </div>
          {isBookingEvent && (
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {(() => {
                const logo = getOtaLogo(event.source);
                return logo ? (
                  <img src={logo} alt={event.source || 'OTA'} className="w-6 h-6 object-contain" />
                ) : event.source ? (
                  <span className="text-micro px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium">{event.source.substring(0, 3).toUpperCase()}</span>
                ) : null;
              })()}
              {event.amount !== undefined && event.amount > 0 && (
                <span className="text-xs font-semibold text-primary">{formatCurrency(event.amount)}</span>
              )}
              {event.type === "CANCELLATION" && (
                <span className="text-xs font-semibold text-destructive">{formatCurrency(event.amount || 0)}</span>
              )}
            </div>
          )}
        </Link>
      );
    }

    return null;
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 relative text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
        >
          <Bell className={`h-4 w-4 ${totalUnreadCount > 0 ? "text-warning" : ""}`} />
          {totalUnreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-micro font-bold text-destructive-foreground flex items-center justify-center">
              {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
            </span>
          )}
          <span className="sr-only">Thông báo</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-16px)] sm:w-[420px] max-w-[420px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <h4 className="font-semibold text-sm">Thông báo</h4>
          <span className={`text-xs font-medium ${totalUnreadCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {totalUnreadCount > 0 ? `${totalUnreadCount} thông báo mới` : "Đã xem tất cả"}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-muted/10 px-1">
          {TAB_CONFIG.map(tab => {
            const isActive = activeTab === tab.key;
            const tabCount = tab.key === 'all' ? totalUnreadCount
              : tab.key === 'booking' ? bookingUnreadCount
              : tab.key === 'email' ? unreadEmailCount
              : tab.key === 'action' ? actionCount
              : 0;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tabCount > 0 && (
                  <span className={`ml-0.5 h-4 min-w-4 px-1 rounded-full text-micro font-bold flex items-center justify-center ${
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-muted-foreground"
                  }`}>
                    {tabCount > 99 ? "99+" : tabCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[380px]">
            <div className="divide-y divide-border">
              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Không có thông báo nào
                </div>
              ) : (
                filteredItems.map(item => renderItem(item))
              )}
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        <div className="border-t border-border p-2 flex gap-1">
          {totalUnreadCount > 0 && (
            <Button variant="ghost" size="sm" className="flex-1 text-xs h-8 gap-1 text-primary hover:text-primary" onClick={handleMarkAllAsRead}>
              <CheckCheck className="h-3.5 w-3.5" />
              Đã xem tất cả
            </Button>
          )}
          <Button variant="ghost" size="sm" className="flex-1 text-xs h-8" onClick={() => setOpen(false)} asChild>
            <Link to="/">Xem Dashboard</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
