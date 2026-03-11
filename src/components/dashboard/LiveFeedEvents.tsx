import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useRef, useCallback, useEffect } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { vi } from "date-fns/locale";
import { Link } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useAnGiaProperties } from "@/hooks/useAnGiaProperties";

// OTA logos
import expediaLogo from "@/assets/ota-logos/expedia.png";
import agodaLogo from "@/assets/ota-logos/agoda.png";
import ctripLogo from "@/assets/ota-logos/ctrip.png";
import bookingLogo from "@/assets/ota-logos/booking.png";
import travelokaLogo from "@/assets/ota-logos/traveloka.png";

const OTA_LOGOS: Record<string, string> = {
  // Expedia variants
  EXPEDIA: expediaLogo,
  "EXPEDIA.COM": expediaLogo,
  "EXPEDIACOM": expediaLogo,
  // Agoda variants
  AGODA: agodaLogo,
  "AGODA.COM": agodaLogo,
  "AGODACOM": agodaLogo,
  // Ctrip/Trip variants
  CTRIP: ctripLogo,
  "CTRIP.COM": ctripLogo,
  "CTRIPCOM": ctripLogo,
  TRIP: ctripLogo,
  "TRIP.COM": ctripLogo,
  "TRIPCOM": ctripLogo,
  // Booking.com variants
  "BOOKING.COM": bookingLogo,
  "BOOKINGCOM": bookingLogo,
  BOOKING: bookingLogo,
  // Traveloka variants
  TRAVELOKA: travelokaLogo,
  "TRAVELOKA.COM": travelokaLogo,
  "TRAVELOKACOM": travelokaLogo,
};

// Get OTA logo by source (with fallback)
function getOtaLogo(source: string | undefined): string | null {
  if (!source) return null;
  // Normalize: uppercase, remove dots, trim
  const upper = source.toUpperCase().trim().replace(/\./g, '');
  
  // Direct match (after normalization)
  if (OTA_LOGOS[upper]) return OTA_LOGOS[upper];
  
  // Also try with dots
  const withDots = source.toUpperCase().trim();
  if (OTA_LOGOS[withDots]) return OTA_LOGOS[withDots];
  
  // Partial match - check if source contains any known OTA name
  const otaKeywords = ['EXPEDIA', 'AGODA', 'CTRIP', 'TRIP', 'BOOKING', 'TRAVELOKA'];
  for (const keyword of otaKeywords) {
    if (upper.includes(keyword)) {
      // Find matching logo
      for (const [key, logo] of Object.entries(OTA_LOGOS)) {
        if (key.includes(keyword)) {
          return logo;
        }
      }
    }
  }
  
  return null;
}

type EventType = 
  | "all" 
  | "new_booking" 
  | "modification" 
  | "cancellation" 
  | "new_message";

const formatCurrency = (amount: number) => {
  return "₫" + new Intl.NumberFormat("vi-VN").format(amount);
};

/**
 * SIMPLIFIED: Convert booking_changes + bookings_mirror directly to FeedEvents
 */
function simpleChangesToEvents(
  changes: BookingChangeRecord[],
  bookingsById: Record<string, BookingInfo>,
): FeedEvent[] {
  const seen = new Map<string, FeedEvent>();
  
  for (const change of changes) {
    if (!change.unified_booking_id) continue;
    
    const booking = bookingsById[change.unified_booking_id];
    if (!booking) continue;
    
    let type: FeedEvent['type'];
    if (change.change_type === 'INSERT') {
      type = 'NEW_BOOKING';
    } else {
      const afterData = change.after_data || {};
      const status = ((afterData.booking_status as string) || '').toUpperCase();
      type = status === 'CANCELLED' || status === 'CANCELED' ? 'CANCELLATION' : 'MODIFICATION';
    }
    
    const dedupeKey = `${change.unified_booking_id}:${type}`;
    const existing = seen.get(dedupeKey);
    if (existing && new Date(existing.timestamp) > new Date(change.created_at)) {
      continue;
    }
    
    const eventTime = new Date(change.created_at);
    const timeStr = new Intl.DateTimeFormat('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
    }).format(eventTime);
    
    const checkInFormatted = booking.check_in_date 
      ? new Date(booking.check_in_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    
    const amount = type === 'CANCELLATION' ? 0 : (booking.total_amount_gross || booking.total_amount_net || 0);
    const nights = booking.nights || 1;
    
    const normalizedSource = normalizeOtaSourceSimple(booking.ota_source);
    
    const event: FeedEvent = {
      id: `bc:${change.id}`,
      type,
      title: `${booking.guest_name || 'Unknown'}${checkInFormatted ? ` - CI: ${checkInFormatted}` : ''}`,
      subtitle: type === 'NEW_BOOKING' 
        ? `${nights} đêm | Đặt lúc ${timeStr}`
        : type === 'CANCELLATION'
          ? `${nights} đêm | Hủy lúc ${timeStr}`
          : `Cập nhật lúc ${timeStr}`,
      timestamp: change.created_at,
      source: normalizedSource,
      amount,
      link: `/bookings/${change.unified_booking_id}`,
      hasBookingJoin: true,
      guestName: booking.guest_name || 'Unknown',
      checkInDate: checkInFormatted,
      nights,
      bookedAt: timeStr,
    };
    
    seen.set(dedupeKey, event);
  }
  
  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
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

const EVENT_TYPE_CONFIG: Record<FeedEvent["type"], { label: string; className: string }> = {
  NEW_MESSAGE: { label: "NEW MESSAGE", className: "bg-primary/100/20 text-primary border-primary/20" },
  NEW_BOOKING: { label: "NEW BOOKING", className: "bg-success/100/20 text-success border-success/30" },
  MODIFICATION: { label: "MODIFICATION", className: "bg-info/100/20 text-info border-info/30" },
  CANCELLATION: { label: "CANCELLATION", className: "bg-destructive/100/20 text-destructive border-destructive/30" },
};

export function LiveFeedEvents() {
  const [filter, setFilter] = useState<EventType>("all");
  const [bookingEvents, setBookingEvents] = useState<FeedEvent[]>([]);
  const processedChangeIds = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();
  
  // Get An Gia property IDs for filtering (same as Booking Center)
  const { propertyIds: anGiaPropertyIds } = useAnGiaProperties();

  // Realtime handler for booking_changes - using centralized manager
  const handleBookingChangeEvent = useCallback((event: RealtimeEvent) => {
    const newChange = event.payload.new as BookingChangeRecord;
    
    // Log realtime latency
    const dbCreatedAt = newChange.created_at ? new Date(newChange.created_at).getTime() : Date.now();
    const latencyMs = Date.now() - dbCreatedAt;
    console.log('[LiveFeed] Realtime event latency:', latencyMs, 'ms', {
      id: newChange.id,
      change_type: newChange.change_type,
      created_at: newChange.created_at,
    });
    
    // ANTI-DOUBLE: Skip if already processed locally
    if (processedChangeIds.current.has(newChange.id)) {
      console.log('[LiveFeed] SKIP realtime: already processed locally', newChange.id);
      return;
    }
    
    // Add to processed set
    processedChangeIds.current.add(newChange.id);
    
    console.log('[LiveFeed] Processing realtime event:', {
      id: newChange.id,
      change_type: newChange.change_type,
    });
    
    // PHASE 2: Also invalidate query to ensure data consistency
    queryClient.invalidateQueries({ queryKey: ["live-feed-booking-changes"] });
    
    // Fetch booking info for this change
    supabase
      .from("bookings_mirror")
      .select("unified_booking_id, guest_name, ota_source, booking_status, total_amount_net, check_in_date, nights")
      .eq("unified_booking_id", newChange.unified_booking_id)
      .single()
      .then(({ data: bookingInfo }) => {
        const bookingsById: Record<string, BookingInfo> = {};
        if (bookingInfo) {
          bookingsById[bookingInfo.unified_booking_id] = bookingInfo;
        }
        
        const feedEvent = bookingChangeToEvent(
          newChange,
          bookingsById,
          undefined,
          false // English labels for LiveFeed
        );
        
        if (feedEvent) {
          setBookingEvents(prev => {
            const merged = mergeBookingChangeEvent(prev, feedEvent, 'realtime_insert');
            return merged.sort((a, b) => 
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
          });
        }
      });
  }, [queryClient]);

  // Subscribe to booking_changes via centralized manager
  useRealtimeSubscription('booking_changes', handleBookingChangeEvent, {
    eventTypes: ['INSERT'],
  });

  // Realtime handler for messages
  const handleMessageEvent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["live-feed-messages"] });
  }, [queryClient]);

  // Subscribe to messages via centralized manager
  // NOTE: Include UPDATE because channex-messages-webhook uses upsert
  useRealtimeSubscription('messages', handleMessageEvent, {
    eventTypes: ['INSERT', 'UPDATE'],
  });
  
  // Fetch recent messages (INBOUND only)
  const { data: messagesData } = useQuery({
    queryKey: ["live-feed-messages"],
    refetchOnMount: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, sent_at, direction, conversation_id")
        .eq("direction", "INBOUND")
        .order("sent_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    // PHASE 2: Aggressive polling for faster updates
    refetchInterval: 10000, // 10 seconds
    staleTime: 5000, // Consider stale after 5 seconds
  });

  // Fetch booking changes (new bookings, modifications)
  const { data: bookingChangesData } = useQuery({
    queryKey: ["live-feed-booking-changes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_changes")
        .select(`
          id, 
          change_type, 
          change_source, 
          created_at, 
          unified_booking_id,
          changed_fields,
          after_data,
          before_data
        `)
        .in("change_type", [
          "INSERT", "UPDATE", "STATUS_CHANGE", "AMOUNT_CHANGE", "DATES_CHANGE",
          "GUESTS_CHANGE", "ROOM_LINE_ADDED", "ROOM_LINE_MODIFIED", "ROOM_LINE_REMOVED"
        ])
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      
      console.log('[LiveFeed] Fetched booking_changes at:', new Date().toISOString(), 'count:', data?.length);
      
      // AUDIT LOG: Distribution of change_types
      const changeTypeDistribution = (data || []).reduce((acc, c) => {
        acc[c.change_type] = (acc[c.change_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('[AUDIT LiveFeed] booking_changes distribution:', {
        total: data?.length,
        byChangeType: changeTypeDistribution,
        distinctChangeTypes: Object.keys(changeTypeDistribution),
        // Log 3 most recent non-INSERT records (potential MODIFICATION source)
        recentNonInsert: data?.filter(c => c.change_type !== 'INSERT').slice(0, 3).map(c => ({
          id: c.id,
          change_type: c.change_type,
          changed_fields: c.changed_fields,
          created_at: c.created_at,
        })),
      });
      
      return data || [];
    },
    // PHASE 2: Aggressive polling for faster updates from Channex
    refetchInterval: 5000, // 5 seconds - faster for booking changes
    staleTime: 3000, // Consider stale after 3 seconds
  });

  // Fetch bookings for additional info - filtered by An Gia properties (same as Booking Center)
  const { data: bookingsData } = useQuery({
    queryKey: ["live-feed-bookings-info", bookingChangesData?.map(c => c.unified_booking_id).join(','), anGiaPropertyIds.join(',')],
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const changeBookingIds = bookingChangesData?.map(c => c.unified_booking_id) || [];
      const uniqueIds = Array.from(new Set(changeBookingIds)).filter(Boolean);
      
      if (uniqueIds.length === 0) return {} as Record<string, BookingInfo>;
      
      // Fetch bookings with channex_property_id for filtering
      const { data: mirrorData, error: mirrorError } = await supabase
        .from("bookings_mirror")
        .select("unified_booking_id, guest_name, ota_source, booking_status, total_amount_net, total_amount_gross, check_in_date, nights, channex_property_id")
        .in("unified_booking_id", uniqueIds);

      if (mirrorError) throw mirrorError;
      
      // Filter by An Gia properties (same logic as useBookings.ts)
      const anGiaSet = new Set(anGiaPropertyIds);
      const bookingsMap: Record<string, BookingInfo> = {};
      mirrorData?.forEach((b: any) => {
        // Only include bookings from An Gia properties
        if (anGiaSet.size === 0 || anGiaSet.has(b.channex_property_id)) {
          bookingsMap[b.unified_booking_id] = b;
        }
      });
      
      return bookingsMap;
    },
    enabled: !!bookingChangesData && bookingChangesData.length > 0,
  });

  // Process booking changes into events - SIMPLIFIED
  useEffect(() => {
    if (!bookingChangesData) return;
    
    const bookingsById = bookingsData || {};
    
    console.log('[LiveFeed] Processing with SIMPLE mapper:', {
      changesCount: bookingChangesData.length,
      bookingsCount: Object.keys(bookingsById).length,
    });
    
    // SIMPLIFIED: Direct mapping from bookings_mirror
    const events = simpleChangesToEvents(
      bookingChangesData as BookingChangeRecord[],
      bookingsById
    );
    
    setBookingEvents(events);
    
    // Track processed IDs
    bookingChangesData.forEach(c => {
      processedChangeIds.current.add(c.id);
      realtimeManager.markEventProcessed('booking_changes', c.id, c.created_at);
    });
    
  }, [bookingChangesData, bookingsData]);

  // Combine message events with booking events
  const allEvents: FeedEvent[] = [];

  // Add message events
  messagesData?.forEach((msg) => {
    const bodyText = msg.body || "";
    allEvents.push({
      id: `msg-${msg.id}`,
      type: "NEW_MESSAGE",
      title: bodyText.substring(0, 60) + (bodyText.length > 60 ? "..." : ""),
      subtitle: format(new Date(msg.sent_at), "EEE, MMM dd, yyyy | HH:mm:ss", { locale: vi }),
      timestamp: msg.sent_at,
      link: `/ota-messages?conversation=${msg.conversation_id}`,
    });
  });

  // Add booking events (deduplicated by new deduper)
  allEvents.push(...bookingEvents);

  // Sort by timestamp
  allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Filter events
  const filteredEvents = allEvents.filter((event) => {
    if (filter === "all") return true;
    if (filter === "new_message") return event.type === "NEW_MESSAGE";
    if (filter === "new_booking") return event.type === "NEW_BOOKING";
    if (filter === "modification") return event.type === "MODIFICATION";
    if (filter === "cancellation") return event.type === "CANCELLATION";
    return true;
  });

  const isLoading = !messagesData && !bookingChangesData;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-lg font-semibold">Live Feed Events</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter:</span>
          <Select value={filter} onValueChange={(v) => setFilter(v as EventType)}>
            <SelectTrigger className="w-[160px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="new_booking">New Booking</SelectItem>
              <SelectItem value="modification">Modification</SelectItem>
              <SelectItem value="cancellation">Cancellation</SelectItem>
              <SelectItem value="new_message">New Message</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="divide-y divide-border">
            {filteredEvents.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Không có sự kiện nào
              </div>
            ) : (
              filteredEvents.map((event) => {
                const config = EVENT_TYPE_CONFIG[event.type];
                const isBookingEvent = event.type !== "NEW_MESSAGE";
                
                return (
                  <Link
                    key={event.id}
                    to={event.link || "#"}
                    className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors"
                  >
                    {/* Time */}
                    <div className="w-24 flex-shrink-0 text-right">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: false, locale: vi })}
                      </span>
                    </div>

                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                      <div className="w-px flex-1 bg-border" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`${config.className} text-xs`}>
                          {config.label}
                        </Badge>
                      </div>
                      
                      {/* Rich display for booking events */}
                      {isBookingEvent && event.guestName ? (
                        <>
                          <p className="font-semibold text-sm">
                            {event.guestName}
                            {event.checkInDate && (
                              <span className="font-normal text-muted-foreground"> - CI: {event.checkInDate}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.nights && event.nights > 0 && `${event.nights} đêm | `}
                            {event.type === "NEW_BOOKING" && `Đặt lúc ${event.bookedAt || event.subtitle}`}
                            {event.type === "CANCELLATION" && `Huỷ lúc ${event.bookedAt || event.subtitle}`}
                            {event.type === "MODIFICATION" && event.subtitle}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-sm truncate">{event.title}</p>
                          <p className="text-xs text-muted-foreground">{event.subtitle}</p>
                        </>
                      )}
                    </div>

                    {/* Right side - OTA logo & amount */}
                    {isBookingEvent && (
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {(() => {
                          const logo = getOtaLogo(event.source);
                          return logo ? (
                            <img 
                              src={logo} 
                              alt={event.source || 'OTA'} 
                              className="w-6 h-6 object-contain"
                            />
                          ) : event.source ? (
                            <span className="text-micro px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                              {event.source.substring(0, 3).toUpperCase()}
                            </span>
                          ) : null;
                        })()}
                        {event.amount !== undefined && event.amount > 0 && (
                          <span className="text-sm font-semibold text-primary">
                            {formatCurrency(event.amount)}
                          </span>
                        )}
                        {event.type === "CANCELLATION" && (
                          <span className="text-sm font-semibold text-destructive">
                            {formatCurrency(event.amount || 0)}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
