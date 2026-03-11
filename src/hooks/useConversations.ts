import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase, safeQuery, safeMutation, safeRpc, safeFrom } from "@/integrations/supabase";
import { toast } from 'sonner';

export type ChannelType = 'OTA' | 'EMAIL' | 'WHATSAPP' | 'WEB_CHAT';
export type ChannelProvider = 'channex' | 'gmail' | 'meta' | 'internal';
export type OutboundStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
export type AssignmentStatus = 'UNASSIGNED' | 'ASSIGNED' | 'ESCALATED' | 'RESOLVED';
export type AssignedTeam = 'CSKH' | 'OPS' | 'FINANCE' | 'TECH';
export type Priority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';

// An Gia Residences group ID - filter conversations to this group only
const AN_GIA_GROUP_ID = "72e58e1b-1e34-4678-9100-71c778ecf6d0";

export interface Conversation {
  id: string;
  channel_type: ChannelType;
  channel_provider: string;
  external_conversation_id: string;
  property_id: string;
  unified_booking_id: string | null; // This is channex booking UUID
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  unread_count: number;
  status: 'OPEN' | 'CLOSED';
  is_messaging_supported: boolean;
  metadata: Record<string, unknown>;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  // =========================================================================
  // OWNERSHIP & ASSIGNMENT (OPS-GRADE)
  // =========================================================================
  assigned_to_user_id?: string | null;
  assigned_team?: AssignedTeam | null;
  assignment_status: AssignmentStatus;
  assigned_at?: string | null;
  resolved_at?: string | null;
  resolved_by_user_id?: string | null;
  first_response_at?: string | null;
  priority?: Priority;
  // Enriched from profiles table
  assigned_to_name?: string | null;
  resolved_by_name?: string | null;
  // =========================================================================
  // Enriched from booking (mapped via provider_booking_id)
  real_unified_booking_id?: string | null; // Actual unified_booking_id from bookings_mirror
  pms_property_name?: string | null;
  ota_source?: string | null;
  ota_booking_code?: string | null;
  booking_guest_name?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  nights?: number | null;
  room_count?: number | null;
  last_message_preview?: string | null;
  // Stay status from stays table (operations)
  stay_status?: 'WAIT_ROOM' | 'CHECKED_IN' | 'IN_HOUSE' | 'CHECKED_OUT' | 'NO_SHOW' | null;
  actual_check_in_at?: string | null;
  actual_check_out_at?: string | null;
  // =========================================================================
  // WHATSAPP-SPECIFIC (nullable for non-WhatsApp conversations)
  // =========================================================================
  wa_customer_phone?: string | null;
  wa_phone_number_id?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  external_message_id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender_type: 'GUEST' | 'AGENT' | 'SYSTEM';
  body: string | null;
  attachments: unknown[];
  sent_at: string;
  synced_at: string | null;
  created_at: string;
  sender_id?: string | null;
  sender_name?: string | null;
  // WhatsApp-specific (nullable for OTA messages)
  channel_type?: ChannelType | null;
  wamid?: string | null;
  wa_status?: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | null;
}

export interface OutboundMessage {
  id: string;
  client_message_id: string;
  conversation_id: string;
  provider: string;
  body: string;
  attachments: unknown[];
  status: OutboundStatus;
  error: string | null;
  external_message_id: string | null;
  provider_delivery_id: string | null;
  linked_mirror_message_id: string | null;
  retry_count: number;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
}

// Channel display info
export const CHANNEL_INFO: Record<ChannelType, { label: string; color: string }> = {
  OTA: { label: 'OTA Messaging', color: 'bg-info/10 text-info' },
  EMAIL: { label: 'Email', color: 'bg-success/10 text-success' },
  WHATSAPP: { label: 'WhatsApp', color: 'bg-success/10 text-success' },
  WEB_CHAT: { label: 'Web Chat', color: 'bg-primary/10 text-primary' },
};

export const PROVIDER_INFO: Record<string, { label: string }> = {
  channex: { label: 'Channex' },
  gmail: { label: 'Gmail' },
  meta: { label: 'Meta' },
  internal: { label: 'Internal' },
};

export function useConversations(filters?: {
  propertyId?: string;
  channelType?: ChannelType;
  status?: 'OPEN' | 'CLOSED';
}) {
  const queryClient = useQueryClient();

  const { data: conversations, isLoading, error, refetch } = useQuery({
    queryKey: ['conversations', filters],
    staleTime: 0, // Always fetch fresh on mount to catch deep-linked messages
    gcTime: 10 * 60_000, // 10min — keep cache when switching filter tabs (Active/Closed, OTA/WA)
    refetchOnMount: true, // Crucial for deep links from notifications
    refetchOnWindowFocus: false, // Background sync already handles visibility changes
    placeholderData: keepPreviousData, // Keep previous data visible while refetching
    queryFn: async () => {
      const t0 = performance.now();

      // ================================================================
      // PHASE 1: Fetch conversations + property groups IN PARALLEL
      // ================================================================
      const CONV_COLUMNS = 'id,channel_type,channel_provider,external_conversation_id,property_id,unified_booking_id,guest_name,guest_email,guest_phone,last_message_at,last_inbound_at,last_outbound_at,unread_count,status,is_messaging_supported,metadata,synced_at,created_at,updated_at,assigned_to_user_id,assigned_team,assignment_status,assigned_at,resolved_at,resolved_by_user_id,first_response_at,priority,wa_customer_phone,wa_phone_number_id';
      const RECENCY_CUTOFF = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

      const convQuery = (() => {
        let q = safeFrom('conversations' as any).select(CONV_COLUMNS)
          .not('last_message_at', 'is', null)
          .gte('last_message_at', RECENCY_CUTOFF)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(100);
        if (filters?.propertyId) q = q.eq('property_id', filters.propertyId);
        if (filters?.channelType) q = q.eq('channel_type', filters.channelType);
        if (filters?.status) q = q.eq('status', filters.status);
        return q;
      })();

      const unreadQuery = safeFrom('conversations' as any).select(CONV_COLUMNS)
        .gt('unread_count', 0)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(50);

      const [{ data: propertyLinks }, { data: propertyNames }, { data: convData, error: convError }, { data: unreadData }] = await Promise.all([
        safeFrom("channex_property_groups" as any).select("channex_property_id").eq("channex_group_id", AN_GIA_GROUP_ID),
        safeFrom('channex_user_properties' as any).select('channex_property_id, property_name'),
        convQuery,
        unreadQuery,
      ]);
      if (convError) throw convError;

      // Merge recent + unread (dedupe by ID)
      const seenIds = new Set<string>();
      const mergedConversations: any[] = [];
      [...(convData || []), ...(unreadData || [])].forEach((c: any) => {
        if (!seenIds.has(c.id)) {
          seenIds.add(c.id);
          mergedConversations.push(c);
        }
      });

      const groupPropertyIds = new Set((propertyLinks as any[])?.map((p: any) => p.channex_property_id) || []);
      const propertyNameMap = new Map<string, string>();
      (propertyNames as any[])?.forEach((p: any) => {
        if (p.channex_property_id && p.property_name) propertyNameMap.set(p.channex_property_id, p.property_name);
      });

      // Filter to An Gia properties + WhatsApp
      const filteredConversations = mergedConversations.filter((c: any) =>
        groupPropertyIds.has(c.property_id) || (c.channel_type || '').toUpperCase() === 'WHATSAPP'
      );

      // Visibility filter
      const visibleRaw = filteredConversations.filter((c: any) => {
        const hasContent = !!c.last_message_at || !!c.last_inbound_at || !!c.last_outbound_at || (c.unread_count || 0) > 0;
        const hasIdentity = !!c.guest_name || !!c.guest_email || !!c.guest_phone || !!c.unified_booking_id;
        return hasContent && hasIdentity;
      });

      console.log(`[Perf] Phase 1: ${Math.round(performance.now() - t0)}ms — ${visibleRaw.length} conversations`);

      // ================================================================
      // PHASE 2: Enrich ALL in parallel (bookings, stays, previews)
      // Everything loads before returning — NO flash, NO "Khách" bug
      // ================================================================
      const t2 = performance.now();

      const bookingIds = visibleRaw.map((c: any) => c.unified_booking_id).filter(Boolean) as string[];
      const waPhones = visibleRaw
        .filter((c: any) => (c.channel_type || '').toUpperCase() === 'WHATSAPP' && !c.unified_booking_id && c.wa_customer_phone)
        .map((c: any) => c.wa_customer_phone as string);
      const normalizedPhones = [...new Set(waPhones.flatMap(p => {
        const stripped = p.replace(/^\+/, '');
        return [p, stripped, `+${stripped}`];
      }))];
      const convIds = visibleRaw.slice(0, 30).map((c: any) => c.id);

      // ALL enrichment queries in parallel (bookings + stays-prep + previews)
      const [bookingsByProvider, bookingsByUnified, phoneBookingsResult, previewResult] = await Promise.all([
        bookingIds.length > 0
          ? safeQuery(() => supabase.from('bookings_mirror').select('unified_booking_id, provider_booking_id, pms_property_name, ota_source, ota_booking_code, guest_name, check_in_date, check_out_date, nights').in('provider_booking_id', bookingIds))
          : Promise.resolve({ data: null }),
        bookingIds.length > 0
          ? safeQuery(() => supabase.from('bookings_mirror').select('unified_booking_id, provider_booking_id, pms_property_name, ota_source, ota_booking_code, guest_name, check_in_date, check_out_date, nights').in('unified_booking_id', bookingIds))
          : Promise.resolve({ data: null }),
        normalizedPhones.length > 0
          ? safeQuery(() => supabase.from('bookings_mirror').select('unified_booking_id, provider_booking_id, pms_property_name, ota_source, ota_booking_code, guest_name, guest_phone, check_in_date, check_out_date, nights').in('guest_phone', normalizedPhones).order('check_in_date', { ascending: false }).limit(200))
          : Promise.resolve({ data: null }),
        // Message previews — fetch inline, not lazy
        convIds.length > 0
          ? supabase.from('messages').select('conversation_id, body').in('conversation_id', convIds).not('body', 'is', null).order('sent_at', { ascending: false }).limit(convIds.length * 2)
          : Promise.resolve({ data: null }),
      ]);

      // Build booking maps
      interface BookingInfo {
        unified_booking_id: string | null;
        pms_property_name: string | null;
        ota_source: string | null;
        ota_booking_code: string | null;
        guest_name: string | null;
        check_in_date: string | null;
        check_out_date: string | null;
        nights: number | null;
      }
      const bookingMap = new Map<string, BookingInfo>();
      [...(bookingsByProvider.data || []), ...(bookingsByUnified.data || [])].forEach(b => {
        const info: BookingInfo = {
          unified_booking_id: b.unified_booking_id, pms_property_name: b.pms_property_name,
          ota_source: b.ota_source, ota_booking_code: b.ota_booking_code,
          guest_name: b.guest_name, check_in_date: b.check_in_date,
          check_out_date: b.check_out_date, nights: b.nights,
        };
        if (b.provider_booking_id) bookingMap.set(b.provider_booking_id, info);
        if (b.unified_booking_id) bookingMap.set(b.unified_booking_id, info);
      });

      const waPhoneBookingMap = new Map<string, BookingInfo>();
      if (phoneBookingsResult.data) {
        const seenPh = new Set<string>();
        phoneBookingsResult.data.forEach(b => {
          const phone = (b.guest_phone || '').replace(/^\+/, '');
          if (!seenPh.has(phone)) {
            seenPh.add(phone);
            waPhoneBookingMap.set(phone, {
              unified_booking_id: b.unified_booking_id, pms_property_name: b.pms_property_name,
              ota_source: b.ota_source, ota_booking_code: b.ota_booking_code,
              guest_name: b.guest_name, check_in_date: b.check_in_date,
              check_out_date: b.check_out_date, nights: b.nights,
            });
          }
        });
      }

      // Build preview map
      const previewMap = new Map<string, string>();
      (previewResult.data || []).forEach((m: any) => {
        if (m.conversation_id && m.body && !previewMap.has(m.conversation_id)) {
          previewMap.set(m.conversation_id, m.body);
        }
      });

      // Stays query (needs resolved unified_booking_ids from bookingMap)
      const allUnifiedIds = new Set<string>();
      bookingMap.forEach(b => { if (b.unified_booking_id) allUnifiedIds.add(b.unified_booking_id); });
      waPhoneBookingMap.forEach(b => { if (b.unified_booking_id) allUnifiedIds.add(b.unified_booking_id); });
      const allUnifiedIdsArr = Array.from(allUnifiedIds);

      interface StayInfo {
        stay_status: Conversation['stay_status'];
        actual_check_in_at: string | null;
        actual_check_out_at: string | null;
      }
      const staysMap = new Map<string, StayInfo>();
      if (allUnifiedIdsArr.length > 0) {
        const { data: stays } = await supabase
          .from('stays')
          .select('unified_booking_id, stay_status, actual_check_in_at, actual_check_out_at')
          .in('unified_booking_id', allUnifiedIdsArr);
        stays?.forEach(s => {
          if (s.unified_booking_id) {
            staysMap.set(s.unified_booking_id, {
              stay_status: s.stay_status as StayInfo['stay_status'],
              actual_check_in_at: s.actual_check_in_at,
              actual_check_out_at: s.actual_check_out_at,
            });
          }
        });
      }

      console.log(`[Perf] Phase 2 (enrich): ${Math.round(performance.now() - t2)}ms — ${bookingMap.size} bookings, ${staysMap.size} stays, ${previewMap.size} previews`);

      // ================================================================
      // BUILD FINAL ENRICHED CONVERSATIONS — fully ready before render
      // ================================================================
      const enrichedConversations = visibleRaw.map((c: any) => {
        let bookingInfo = c.unified_booking_id ? bookingMap.get(c.unified_booking_id) : null;
        if (!bookingInfo && (c.channel_type || '').toUpperCase() === 'WHATSAPP' && c.wa_customer_phone) {
          const normalizedPhone = c.wa_customer_phone.replace(/^\+/, '');
          bookingInfo = waPhoneBookingMap.get(normalizedPhone) || null;
        }
        const propName = propertyNameMap.get(c.property_id) || bookingInfo?.pms_property_name || null;
        const stayInfo = bookingInfo?.unified_booking_id ? staysMap.get(bookingInfo.unified_booking_id) : null;
        const inferredStayStatus: Conversation['stay_status'] = bookingInfo?.unified_booking_id
          ? (stayInfo?.stay_status || 'WAIT_ROOM')
          : null;

        return {
          ...c,
          real_unified_booking_id: bookingInfo?.unified_booking_id || null,
          pms_property_name: propName,
          ota_source: bookingInfo?.ota_source || null,
          ota_booking_code: bookingInfo?.ota_booking_code || null,
          booking_guest_name: bookingInfo?.guest_name || null,
          check_in_date: bookingInfo?.check_in_date || null,
          check_out_date: bookingInfo?.check_out_date || null,
          nights: bookingInfo?.nights || null,
          last_message_preview: previewMap.get(c.id) || (c as any).last_message_preview || null,
          stay_status: inferredStayStatus,
          actual_check_in_at: stayInfo?.actual_check_in_at || null,
          actual_check_out_at: stayInfo?.actual_check_out_at || null,
        } as Conversation;
      });

      // === MULTI-TIER SORTING ===
      const isUnanswered = (c: Conversation): boolean => {
        const lastInbound = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : 0;
        const lastOutbound = c.last_outbound_at ? new Date(c.last_outbound_at).getTime() : 0;
        return lastInbound > 0 && (lastOutbound === 0 || lastInbound > lastOutbound);
      };
      const getSortTime = (c: Conversation): number => {
        const t = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        if (t) return t;
        if (c.last_inbound_at) return new Date(c.last_inbound_at).getTime();
        if (c.last_outbound_at) return new Date(c.last_outbound_at).getTime();
        return c.created_at ? new Date(c.created_at).getTime() : 0;
      };

      enrichedConversations.sort((a, b) => {
        const aIsNew = (a.unread_count || 0) > 0;
        const bIsNew = (b.unread_count || 0) > 0;
        if (aIsNew && !bIsNew) return -1;
        if (!aIsNew && bIsNew) return 1;
        const aUnanswered = !aIsNew && isUnanswered(a);
        const bUnanswered = !bIsNew && isUnanswered(b);
        if (aUnanswered && !bUnanswered) return -1;
        if (!aUnanswered && bUnanswered) return 1;
        return getSortTime(b) - getSortTime(a);
      });

      console.log(`[Perf] Total: ${Math.round(performance.now() - t0)}ms — ${enrichedConversations.length} fully enriched conversations`);
      return enrichedConversations;
    },
  });

  // Realtime subscription for conversations AND global messages changes
  // OPTIMIZED: Use setQueryData for instant UI updates without refetch
  useEffect(() => {
    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          const updatedConv = payload.new as Partial<Conversation>;

          console.log('[Realtime] Conversation event:', payload.eventType, updatedConv.id);

          if (payload.eventType === 'UPDATE' && updatedConv.id) {
            // CRITICAL: Only merge DB columns from realtime payload.
            // DO NOT spread the entire payload — it would overwrite enriched
            // client-side fields (booking_guest_name, ota_source, stay_status,
            // pms_property_name, etc.) with undefined, causing "Khách" bug.
            const dbFields: Partial<Conversation> = {};
            const REALTIME_SAFE_KEYS: (keyof Conversation)[] = [
              'guest_name', 'guest_email', 'guest_phone',
              'last_message_at', 'last_inbound_at', 'last_outbound_at',
              'unread_count', 'status', 'is_messaging_supported',
              'assigned_to_user_id', 'assigned_team', 'assignment_status',
              'assigned_at', 'resolved_at', 'resolved_by_user_id',
              'first_response_at', 'priority', 'synced_at', 'updated_at',
              'wa_customer_phone', 'wa_phone_number_id',
            ];
            for (const key of REALTIME_SAFE_KEYS) {
              if (key in updatedConv) {
                (dbFields as any)[key] = (updatedConv as any)[key];
              }
            }

            queryClient.setQueriesData<Conversation[]>(
              { queryKey: ['conversations'] },
              (old) => {
                if (!old) return old;
                return old.map(conv =>
                  conv.id === updatedConv.id
                    ? { ...conv, ...dbFields }
                    : conv
                );
              }
            );

            // Also invalidate current-conversation if it's the updated one
            queryClient.invalidateQueries({
              queryKey: ['current-conversation'],
              predicate: (query) => {
                const data = query.state.data as Conversation | undefined;
                return data?.id === updatedConv.id;
              }
            });
          } else {
            // For INSERT/DELETE, refetch to get enriched data
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
          }
        }
      )
      .subscribe();

    // Subscribe to ALL messages changes (for unread count, last_message updates)
    const messagesChannel = supabase
      .channel('messages-global-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          console.log('[Realtime] New message received:', payload);
          const newMessage = payload.new as {
            conversation_id?: string;
            direction?: string;
            body?: string;
            sent_at?: string;
          };

          if (newMessage?.conversation_id) {
            // CRITICAL: Update ALL conversation queries (any filters) for cross-browser sync
            queryClient.setQueriesData<Conversation[]>(
              { queryKey: ['conversations'] },
              (old) => {
                if (!old) return old;
                return old.map(conv => {
                  if (conv.id === newMessage.conversation_id) {
                    const isInbound = newMessage.direction === 'INBOUND';
                    return {
                      ...conv,
                      last_message_at: newMessage.sent_at || new Date().toISOString(),
                      last_message_preview: newMessage.body || '',
                      unread_count: isInbound ? (conv.unread_count || 0) + 1 : conv.unread_count,
                      last_inbound_at: isInbound ? (newMessage.sent_at || new Date().toISOString()) : conv.last_inbound_at,
                      last_outbound_at: !isInbound ? (newMessage.sent_at || new Date().toISOString()) : conv.last_outbound_at,
                    };
                  }
                  return conv;
                }).sort((a, b) => {
                  // Re-sort: NEW messages first, then UNANSWERED, then by time
                  const aIsNew = (a.unread_count || 0) > 0;
                  const bIsNew = (b.unread_count || 0) > 0;
                  if (aIsNew && !bIsNew) return -1;
                  if (!aIsNew && bIsNew) return 1;

                  const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                  const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                  return bTime - aTime;
                });
              }
            );

            // Also update messages query for this conversation
            queryClient.invalidateQueries({ queryKey: ['messages', newMessage.conversation_id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [queryClient, filters]);

  return { conversations, isLoading, error, refetch };
}

// Messages hook - simplified without infinite scroll for stability
export function useMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  const { data: messages, isLoading, error, refetch } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      // Fetch messages with sender profile
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          external_message_id,
          direction,
          sender_type,
          body,
          attachments,
          sent_at,
          synced_at,
          created_at,
          sender_id,
          profiles:sender_id (full_name)
        `)
        .eq('conversation_id', conversationId)
        .limit(200);

      if (error) throw error;

      // Map data to Message type with sender_name
      const messagesWithSender = (data || []).map((m: {
        id: string;
        conversation_id: string;
        external_message_id: string;
        direction: string;
        sender_type: string;
        body: string | null;
        attachments: unknown;
        sent_at: string;
        synced_at: string | null;
        created_at: string;
        sender_id: string | null;
        profiles: { full_name: string | null } | null;
      }) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        external_message_id: m.external_message_id,
        direction: m.direction as 'INBOUND' | 'OUTBOUND',
        sender_type: m.sender_type as 'GUEST' | 'AGENT' | 'SYSTEM',
        body: m.body,
        attachments: m.attachments as unknown[],
        sent_at: m.sent_at,
        synced_at: m.synced_at,
        created_at: m.created_at,
        sender_id: m.sender_id,
        sender_name: m.profiles?.full_name || null,
      }));

      // Sort using sort_time fallback: sent_at → synced_at → created_at
      const sorted = messagesWithSender.sort((a, b) => {
        const getTime = (m: Message) => {
          if (m.sent_at) return new Date(m.sent_at).getTime();
          if (m.synced_at) return new Date(m.synced_at).getTime();
          return new Date(m.created_at).getTime();
        };
        const diff = getTime(a) - getTime(b);
        if (diff !== 0) return diff;
        // Tie-break by id
        return a.id.localeCompare(b.id);
      });

      return sorted;
    },
    enabled: !!conversationId,
  });

  // Realtime subscription for new messages
  // OPTIMIZED: Use setQueryData for instant UI updates
  // NOTE: Listen to both INSERT and UPDATE because channex-webhook uses upsert
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          handleMessagePayload(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          handleMessagePayload(payload);
        }
      )
      .subscribe();

    function handleMessagePayload(payload: any) {
      const newMsg = payload.new as {
        id: string;
        conversation_id: string;
        external_message_id: string;
        direction: string;
        sender_type: string;
        body: string | null;
        attachments: unknown;
        sent_at: string;
        synced_at: string | null;
        created_at: string;
        sender_id: string | null;
      };

      console.log('[Realtime] Message event in thread:', newMsg.id, payload.eventType);

      // Optimistic update: append or update message in existing list
      queryClient.setQueryData(['messages', conversationId], (old: Message[] | undefined) => {
        if (!old) return old;

        // Check if message already exists (dedup / update)
        const existingIndex = old.findIndex(m => m.id === newMsg.id);

        const mappedMsg: Message = {
          id: newMsg.id,
          conversation_id: newMsg.conversation_id,
          external_message_id: newMsg.external_message_id,
          direction: newMsg.direction as 'INBOUND' | 'OUTBOUND',
          sender_type: newMsg.sender_type as 'GUEST' | 'AGENT' | 'SYSTEM',
          body: newMsg.body,
          attachments: newMsg.attachments as unknown[],
          sent_at: newMsg.sent_at,
          synced_at: newMsg.synced_at,
          created_at: newMsg.created_at,
          sender_id: newMsg.sender_id,
          sender_name: null, // Will be enriched on next full fetch
        };

        let updated: Message[];
        if (existingIndex >= 0) {
          // Update existing message
          updated = [...old];
          updated[existingIndex] = { ...updated[existingIndex], ...mappedMsg };
        } else {
          // For new OUTBOUND messages, remove any optimistic (pending) messages with same body
          // This prevents double display when realtime arrives before onSuccess cleans up
          if (newMsg.direction === 'OUTBOUND') {
            const filtered = old.filter(m => {
              // Keep message if it's not optimistic OR doesn't match the new message body
              const isOptimistic = m.id.startsWith('optimistic-') || (m as any)._isPending;
              const sameBody = m.body === newMsg.body;
              return !(isOptimistic && sameBody);
            });
            updated = [...filtered, mappedMsg];
          } else {
            // For INBOUND messages, just append
            updated = [...old, mappedMsg];
          }
        }

        // Sort by sent_at
        updated.sort((a, b) => {
          const getTime = (m: Message) => {
            if (m.sent_at) return new Date(m.sent_at).getTime();
            if (m.synced_at) return new Date(m.synced_at).getTime();
            return new Date(m.created_at).getTime();
          };
          return getTime(a) - getTime(b);
        });

        return updated;
      });
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return {
    messages: messages || [],
    isLoading,
    error,
    refetch,
  };
}

// Hook to track outbound message status in realtime
export function useOutboundMessageStatus(conversationId: string | null) {
  const queryClient = useQueryClient();
  const [pendingMessages, setPendingMessages] = useState<OutboundMessage[]>([]);

  useEffect(() => {
    if (!conversationId) {
      setPendingMessages([]);
      return;
    }

    // Fetch current pending messages
    const fetchPending = async () => {
      const { data } = await supabase
        .from('outbound_messages')
        .select('id, client_message_id, conversation_id, channel_provider, body, attachments, status, error, external_message_id, retry_count, created_by, created_at, sent_at')
        .eq('conversation_id', conversationId)
        .in('status', ['QUEUED', 'SENDING'])
        .order('created_at', { ascending: false });

      // Map to OutboundMessage with defaults for new fields
      const mapped = (data || []).map(d => ({
        ...d,
        provider: d.channel_provider || 'channex',
        provider_delivery_id: null,
        linked_mirror_message_id: null,
      })) as OutboundMessage[];
      setPendingMessages(mapped);
    };

    fetchPending();

    // Subscribe to outbound_messages changes
    const channel = supabase
      .channel(`outbound-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outbound_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as OutboundMessage;

          if (payload.eventType === 'INSERT') {
            setPendingMessages(prev => [msg, ...prev.filter(m => m.id !== msg.id)]);
          } else if (payload.eventType === 'UPDATE') {
            if (msg.status === 'SENT' || msg.status === 'FAILED') {
              // Remove from pending when sent or failed
              setPendingMessages(prev => prev.filter(m => m.id !== msg.id));

              // Refresh messages to show the new message in thread
              if (msg.status === 'SENT') {
                queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
              }
            } else {
              // Update status
              setPendingMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return pendingMessages;
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      conversationId,
      threadId,
      body,
      attachments = []
    }: {
      conversationId: string;
      threadId: string; // external_conversation_id from Channex
      body: string;
      attachments?: unknown[];
    }) => {
      // Generate unique client message ID for idempotency
      const clientMessageId = `${threadId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Call edge function to send (it handles creating outbound record)
      const { data, error } = await supabase.functions.invoke('channex-send-message', {
        body: {
          client_message_id: clientMessageId,
          conversation_id: conversationId,
          thread_id: threadId,
          body,
          attachments,
        },
      });

      if (error) throw error;
      return { ...data, clientMessageId };
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });

      // Snapshot previous messages
      const previousMessages = queryClient.getQueryData(['messages', variables.conversationId]);

      // Create optimistic message (pending state)
      const optimisticMessage = {
        id: `optimistic-${Date.now()}`,
        conversation_id: variables.conversationId,
        external_message_id: null,
        direction: 'OUTBOUND',
        sender_type: 'STAFF',
        body: variables.body,
        sent_at: new Date().toISOString(),
        is_read: true,
        attachments: variables.attachments || [],
        metadata: {},
        // Pending indicator
        _isPending: true,
      };

      // Add optimistic message to the list
      queryClient.setQueryData(['messages', variables.conversationId], (old: any) => {
        if (!old) return [optimisticMessage];
        return [...old, optimisticMessage].sort(
          (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        );
      });

      return { previousMessages, optimisticId: optimisticMessage.id };
    },
    onSuccess: (data, variables, context) => {
      // Replace optimistic message with real one from server if available
      if (data?.message) {
        queryClient.setQueryData(['messages', variables.conversationId], (old: any) => {
          if (!old) return old;
          return old
            .filter((msg: any) => msg.id !== context?.optimisticId)
            .concat(data.message)
            .sort((a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
        });
      } else {
        // Remove pending flag from optimistic message
        queryClient.setQueryData(['messages', variables.conversationId], (old: any) => {
          if (!old) return old;
          return old.map((msg: any) =>
            msg.id === context?.optimisticId
              ? { ...msg, _isPending: false }
              : msg
          );
        });
      }
      toast.success('Tin nhắn đã được gửi');
    },
    onError: (error: Error, variables, context) => {
      // Revert on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.conversationId], context.previousMessages);
      }
      toast.error(`Gửi tin nhắn thất bại: ${error.message}`);
    },
  });

  return mutation;
}

// =========================================================================
// WHATSAPP SEND MESSAGE HOOK
// Same optimistic UI pattern as useSendMessage, routes to whatsapp-send-message
// =========================================================================
export function useSendWhatsAppMessage() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      conversationId,
      body,
      templateName,
      templateLanguage,
      templateComponents,
    }: {
      conversationId: string;
      body: string;
      templateName?: string;
      templateLanguage?: string;
      templateComponents?: unknown[];
    }) => {
      const clientMessageId = `wa_${conversationId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          client_message_id: clientMessageId,
          conversation_id: conversationId,
          body,
          template_name: templateName,
          template_language: templateLanguage,
          template_components: templateComponents,
        },
      });

      if (error) throw error;
      return { ...data, clientMessageId };
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });
      const previousMessages = queryClient.getQueryData(['messages', variables.conversationId]);

      const optimisticMessage = {
        id: `optimistic-wa-${Date.now()}`,
        conversation_id: variables.conversationId,
        external_message_id: null,
        direction: 'OUTBOUND',
        sender_type: 'AGENT',
        body: variables.body || `[Template: ${variables.templateName}]`,
        sent_at: new Date().toISOString(),
        attachments: [],
        channel_type: 'WHATSAPP' as const,
        _isPending: true,
      };

      queryClient.setQueryData(['messages', variables.conversationId], (old: any) => {
        if (!old) return [optimisticMessage];
        return [...old, optimisticMessage].sort(
          (a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        );
      });

      return { previousMessages, optimisticId: optimisticMessage.id };
    },
    onSuccess: (_data, variables, context) => {
      queryClient.setQueryData(['messages', variables.conversationId], (old: any) => {
        if (!old) return old;
        return old.map((msg: any) =>
          msg.id === context?.optimisticId
            ? { ...msg, _isPending: false }
            : msg
        );
      });
      toast.success('Tin nhắn WhatsApp đã được gửi');
    },
    onError: (error: Error, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', variables.conversationId], context.previousMessages);
      }
      toast.error(`Gửi WhatsApp thất bại: ${error.message}`);
    },
  });

  return mutation;
}

export function useSyncMessages() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const syncMessages = useCallback(async (propertyId?: string, silent = false) => {
    setIsSyncing(true);
    try {
      // Use AbortController with 90s timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);

      const { data, error } = await supabase.functions.invoke('channex-messages-sync', {
        body: {
          filters: propertyId ? { property_id: propertyId, limit: 50 } : { limit: 50 },
        },
      });

      clearTimeout(timeoutId);

      if (error) {
        // FunctionsFetchError = network/CORS/timeout — retry once
        if (error.message?.includes('Failed to send') || error.message?.includes('Failed to fetch')) {
          console.warn('[Sync] First attempt failed, retrying...');
          const { data: retryData, error: retryError } = await supabase.functions.invoke('channex-messages-sync', {
            body: {
              filters: propertyId ? { property_id: propertyId, limit: 25 } : { limit: 25 },
            },
          });
          if (retryError) throw retryError;
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['messages'] });
          if (!silent) {
            toast.success(`Đồng bộ hoàn tất: ${retryData?.messages_synced || 0} tin nhắn`);
          }
          return retryData;
        }
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });

      if (!silent) {
        const inbound = data.inbound_count || 0;
        const outbound = data.outbound_count || 0;
        toast.success(`Đồng bộ hoàn tất: ${data.messages_synced || 0} tin nhắn (${inbound} đến, ${outbound} đi)`);
      }
      return data;
    } catch (error: unknown) {
      if (!silent) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error(`Đồng bộ thất bại: ${errorMessage}`);
      }
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient]);

  return { syncMessages, isSyncing };
}

export function useMarkConversationRead(conversationId: string | null) {
  const queryClient = useQueryClient();

  const markAsRead = useCallback(async () => {
    if (!conversationId) return;

    // OPTIMISTIC UPDATE: Update UI immediately
    queryClient.setQueryData(['conversations', undefined], (old: Conversation[] | undefined) => {
      if (!old) return old;
      return old.map(conv =>
        conv.id === conversationId
          ? { ...conv, unread_count: 0 }
          : conv
      );
    });

    const { error } = await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);

    if (error) {
      console.error('Error marking conversation as read:', error);
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      return;
    }
  }, [conversationId, queryClient]);

  return markAsRead;
}

export function useCloseConversation() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (conversationId: string) => {
      // OPTIMISTIC UPDATE: Update UI immediately
      queryClient.setQueryData(['conversations', undefined], (old: Conversation[] | undefined) => {
        if (!old) return old;
        return old.map(conv =>
          conv.id === conversationId
            ? { ...conv, status: 'CLOSED' as const }
            : conv
        );
      });

      const { error } = await supabase
        .from('conversations')
        .update({ status: 'CLOSED' })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Đã đóng hội thoại');
    },
    onError: (error: Error) => {
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.error(`Lỗi: ${error.message}`);
    },
  });

  return mutation;
}

// Hook to retry failed message
export function useRetryMessage() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (outboundId: string) => {
      // Get the failed message
      const { data: outbound, error: fetchError } = await supabase
        .from('outbound_messages')
        .select('*')
        .eq('id', outboundId)
        .single();

      if (fetchError || !outbound) {
        throw new Error('Could not find message to retry');
      }

      // Call edge function with same client_message_id (idempotency will handle it)
      const { data, error } = await supabase.functions.invoke('channex-send-message', {
        body: {
          client_message_id: outbound.client_message_id,
          conversation_id: outbound.conversation_id,
          body: outbound.body,
          attachments: outbound.attachments,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Đang gửi lại tin nhắn...');
    },
    onError: (error: Error) => {
      toast.error(`Gửi lại thất bại: ${error.message}`);
    },
  });

  return mutation;
}

// =============================================================================
// CONVERSATION OWNERSHIP HOOKS (OPS-GRADE)
// =============================================================================

/**
 * Hook to claim a conversation for handling
 * Uses atomic DB function to prevent race conditions
 * OPTIMIZED: Instant UI update
 */
export function useClaimConversation() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      conversationId,
      team
    }: {
      conversationId: string;
      team?: AssignedTeam;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // OPTIMISTIC UPDATE: Update UI immediately for all conversation queries
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: ['conversations'] },
        (old) => {
          if (!old) return old;
          return old.map(conv =>
            conv.id === conversationId
              ? {
                ...conv,
                assigned_to_user_id: user.id,
                assigned_to_name: user.email || 'Bạn',
                assignment_status: 'ASSIGNED' as AssignmentStatus,
                assigned_at: new Date().toISOString(),
                assigned_team: team || conv.assigned_team,
              }
              : conv
          );
        }
      );

      const { data, error } = await safeRpc(() => supabase.rpc('claim_conversation', {
        p_conversation_id: conversationId,
        p_user_id: user.id,
        p_team: team || null,
      }));

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        throw new Error(result?.message || 'Failed to claim conversation');
      }

      return result;
    },
    onSuccess: () => {
      // CRITICAL: Invalidate to sync with server after optimistic update
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['current-conversation'] });
      toast.success('Đã nhận xử lý hội thoại');
    },
    onError: (error: Error) => {
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.error(`Không thể nhận xử lý: ${error.message}`);
    },
  });

  return mutation;
}

/**
 * Hook to release or reassign a conversation
 */
export function useReleaseConversation() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      conversationId,
      newAssigneeId
    }: {
      conversationId: string;
      newAssigneeId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await safeRpc(() => supabase.rpc('release_conversation', {
        p_conversation_id: conversationId,
        p_user_id: user.id,
        p_new_assignee: newAssigneeId || null,
      }));

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        throw new Error(result?.message || 'Failed to release conversation');
      }

      return result;
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['conversations'] });

      // Optimistic update - release or reassign (all conversation queries)
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: ['conversations'] },
        (old) => {
          if (!old) return old;
          return old.map((conv) =>
            conv.id === variables.conversationId
              ? {
                ...conv,
                assigned_to_user_id: variables.newAssigneeId || null,
                assigned_to_name: null,
                assignment_status: variables.newAssigneeId ? 'ASSIGNED' as AssignmentStatus : 'UNASSIGNED' as AssignmentStatus,
                assigned_at: variables.newAssigneeId ? new Date().toISOString() : null,
              }
              : conv
          );
        }
      );
    },
    onSuccess: (_, variables) => {
      // CRITICAL: Invalidate to sync with server after optimistic update
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['current-conversation'] });
      toast.success(variables.newAssigneeId ? 'Đã chuyển giao hội thoại' : 'Đã nhả hội thoại');
    },
    onError: (error: Error) => {
      // Revert on error by refetching
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.error(`Lỗi: ${error.message}`);
    },
  });

  return mutation;
}

/**
 * Hook to resolve a conversation
 */
export function useResolveConversation() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await safeRpc(() => supabase.rpc('resolve_conversation', {
        p_conversation_id: conversationId,
        p_user_id: user.id,
      }));

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        throw new Error(result?.message || 'Failed to resolve conversation');
      }

      return result;
    },
    onMutate: async (conversationId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['conversations'] });

      // Optimistic update - mark as resolved (all conversation queries)
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: ['conversations'] },
        (old) => {
          if (!old) return old;
          return old.map((conv) =>
            conv.id === conversationId
              ? {
                ...conv,
                assignment_status: 'RESOLVED' as AssignmentStatus,
                resolved_at: new Date().toISOString(),
              }
              : conv
          );
        }
      );
    },
    onSuccess: () => {
      // CRITICAL: Invalidate to sync with server after optimistic update
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['current-conversation'] });
      toast.success('Đã giải quyết xong hội thoại');
    },
    onError: (error: Error) => {
      // Revert on error by refetching
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.error(`Lỗi: ${error.message}`);
    },
  });

  return mutation;
}

/**
 * Hook to escalate a conversation
 */
export function useEscalateConversation() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      conversationId,
      toTeam,
      reason
    }: {
      conversationId: string;
      toTeam: AssignedTeam;
      reason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Update conversation status to escalated
      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          assignment_status: 'ESCALATED',
          assigned_team: toTeam,
          assigned_to_user_id: null, // Clear current assignee
          assigned_at: null,
        })
        .eq('id', conversationId);

      if (updateError) throw updateError;

      // Log escalation event
      await safeMutation(() => supabase.from('message_events').insert({
        request_id: crypto.randomUUID(),
        conversation_id: conversationId,
        event_type: 'ASSIGNMENT_ESCALATED',
        payload: {
          escalated_by: user.id,
          to_team: toTeam,
          reason
        },
      }));

      return { success: true };
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['conversations'] });

      // Optimistic update - escalate (all conversation queries)
      queryClient.setQueriesData<Conversation[]>(
        { queryKey: ['conversations'] },
        (old) => {
          if (!old) return old;
          return old.map((conv) =>
            conv.id === variables.conversationId
              ? {
                ...conv,
                assignment_status: 'ESCALATED' as AssignmentStatus,
                assigned_team: variables.toTeam,
                assigned_to_user_id: null,
                assigned_to_name: null,
                assigned_at: null,
              }
              : conv
          );
        }
      );
    },
    onSuccess: (_, variables) => {
      // CRITICAL: Invalidate to sync with server after optimistic update
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['current-conversation'] });
      toast.success(`Đã chuyển lên ${variables.toTeam}`);
    },
    onError: (error: Error) => {
      // Revert on error by refetching
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.error(`Lỗi: ${error.message}`);
    },
  });

  return mutation;
}

// =============================================================================
// CURSOR-BASED PAGINATION FOR MESSAGES (SCALE 1000+ MESSAGES)
// =============================================================================

interface MessagePage {
  messages: Message[];
  nextCursor: { sent_at: string; id: string } | null;
  hasMore: boolean;
}

/**
 * Hook for cursor-based message pagination
 * Supports scale to 1000+ messages per conversation
 */
export function useMessagesPaginated(conversationId: string | null, pageSize: number = 50) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['messages-paginated', conversationId],
    queryFn: async ({ pageParam }): Promise<MessagePage> => {
      if (!conversationId) return { messages: [], nextCursor: null, hasMore: false };

      const cursor = pageParam as { sent_at: string; id: string } | undefined;

      // Try to use RPC for optimized pagination
      const { data: rpcData, error: rpcError } = await safeRpc(() => supabase.rpc('get_messages_paginated', {
        p_conversation_id: conversationId,
        p_cursor_sent_at: cursor?.sent_at || null,
        p_cursor_id: cursor?.id || null,
        p_limit: pageSize + 1, // Fetch one extra to check hasMore
      }));

      if (!rpcError && rpcData) {
        const hasMore = rpcData.length > pageSize;
        const messages = (hasMore ? rpcData.slice(0, pageSize) : rpcData) as Message[];
        const lastMessage = messages[messages.length - 1];

        return {
          messages,
          nextCursor: hasMore && lastMessage ? { sent_at: lastMessage.sent_at, id: lastMessage.id } : null,
          hasMore,
        };
      }

      // Fallback to direct query if RPC not available
      console.warn('RPC get_messages_paginated not available, using fallback query');

      let query = supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          external_message_id,
          direction,
          sender_type,
          body,
          attachments,
          sent_at,
          synced_at,
          created_at,
          sender_id,
          sender_display_name,
          profiles:sender_id (full_name)
        `)
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(pageSize + 1);

      if (cursor) {
        query = query.or(`sent_at.lt.${cursor.sent_at},and(sent_at.eq.${cursor.sent_at},id.lt.${cursor.id})`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const hasMore = (data?.length || 0) > pageSize;
      const messages = (hasMore ? data?.slice(0, pageSize) : data) || [];
      const lastMessage = messages[messages.length - 1];

      // Map to Message type
      const mappedMessages: Message[] = messages.map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        external_message_id: m.external_message_id,
        direction: m.direction,
        sender_type: m.sender_type,
        body: m.body,
        attachments: m.attachments || [],
        sent_at: m.sent_at,
        synced_at: m.synced_at,
        created_at: m.created_at,
        sender_id: m.sender_id,
        sender_name: m.sender_display_name || m.profiles?.full_name || null,
      }));

      return {
        messages: mappedMessages,
        nextCursor: hasMore && lastMessage ? { sent_at: lastMessage.sent_at, id: lastMessage.id } : null,
        hasMore,
      };
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!conversationId,
  });

  // Flatten all pages into single array (newest first, then reverse for display)
  const allMessages = query.data?.pages.flatMap(page => page.messages) || [];

  // Reverse to show oldest first (for chat display)
  const messagesForDisplay = [...allMessages].reverse();

  // Realtime subscription for new messages
  // NOTE: Listen to both INSERT and UPDATE because channex-webhook uses upsert
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-paginated-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Invalidate to refetch first page (new messages)
          queryClient.invalidateQueries({ queryKey: ['messages-paginated', conversationId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Invalidate to refetch (updated message from upsert)
          queryClient.invalidateQueries({ queryKey: ['messages-paginated', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return {
    messages: messagesForDisplay,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  };
}

// =============================================================================
// CONVERSATION CASES HOOKS
// =============================================================================

export type CaseCategory = 'DISPUTE' | 'RELOCATE' | 'REFUND' | 'NO_SHOW' | 'OVERBOOK' |
  'COMPLAINT' | 'SPECIAL_REQUEST' | 'MODIFICATION' | 'CANCELLATION' | 'OTHER';
export type CaseStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';

export interface ConversationCase {
  id: string;
  conversation_id: string;
  booking_id: string | null;
  category: CaseCategory;
  summary: string;
  description: string | null;
  status: CaseStatus;
  priority: Priority;
  created_by: string;
  assigned_to: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  // Enriched
  created_by_name?: string;
  assigned_to_name?: string;
  resolved_by_name?: string;
}

/**
 * Hook to get cases for a conversation
 */
export function useConversationCases(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation-cases', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('conversation_cases')
        .select(`
          *,
          created_by_profile:created_by (full_name),
          assigned_to_profile:assigned_to (full_name),
          resolved_by_profile:resolved_by (full_name)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map((c: any) => ({
        ...c,
        created_by_name: c.created_by_profile?.full_name,
        assigned_to_name: c.assigned_to_profile?.full_name,
        resolved_by_name: c.resolved_by_profile?.full_name,
      })) as ConversationCase[];
    },
    enabled: !!conversationId,
  });
}

/**
 * Hook to create a new case
 */
export function useCreateCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      bookingId,
      category,
      summary,
      description,
      priority,
    }: {
      conversationId: string;
      bookingId?: string;
      category: CaseCategory;
      summary: string;
      description?: string;
      priority?: Priority;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('conversation_cases')
        .insert({
          conversation_id: conversationId,
          booking_id: bookingId || null,
          category,
          summary,
          description: description || null,
          priority: priority || 'NORMAL',
          created_by: user.id,
          status: 'OPEN',
        })
        .select()
        .single();

      if (error) throw error;

      // Log event
      await safeMutation(() => supabase.from('message_events').insert({
        request_id: crypto.randomUUID(),
        conversation_id: conversationId,
        event_type: 'CASE_CREATED',
        payload: { case_id: data.id, category, summary },
      }));

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-cases', variables.conversationId] });
      toast.success('Đã tạo case mới');
    },
    onError: (error: Error) => {
      toast.error(`Lỗi: ${error.message}`);
    },
  });
}

/**
 * Hook to resolve a case
 */
export function useResolveCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      caseId,
      conversationId,
      resolutionNotes,
    }: {
      caseId: string;
      conversationId: string;
      resolutionNotes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('conversation_cases')
        .update({
          status: 'RESOLVED',
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes || null,
        })
        .eq('id', caseId)
        .select()
        .single();

      if (error) throw error;

      // Log event
      await safeMutation(() => supabase.from('message_events').insert({
        request_id: crypto.randomUUID(),
        conversation_id: conversationId,
        event_type: 'CASE_RESOLVED',
        payload: { case_id: caseId, resolved_by: user.id },
      }));

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversation-cases', variables.conversationId] });
      toast.success('Đã giải quyết case');
    },
    onError: (error: Error) => {
      toast.error(`Lỗi: ${error.message}`);
    },
  });
}
