import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { RefreshCw, Search, MessageSquare, X, Info, Building2, Clock, AlertCircle, Mail, MailOpen, LogIn, Home, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ConversationList } from '@/components/messages/ConversationList';
import { MessageThread } from '@/components/messages/MessageThread';
import { ReplyInput } from '@/components/messages/ReplyInput';
import { ContextPanel } from '@/components/messages/ContextPanel';
import { ContextStrip } from '@/components/messages/ContextStrip';
import { ConversationOwnership } from '@/components/messages/ConversationOwnership';
import { MobileThreadHeader } from '@/components/messages/MobileThreadHeader';
import { LinkBookingDialog } from '@/components/messages/LinkBookingDialog';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useSendWhatsAppMessage,
  useSyncMessages,
  useMarkConversationRead,
  useOutboundMessageStatus,
  useRetryMessage,
  useCloseConversation,
  Conversation,
  ChannelType,
} from '@/hooks/useConversations';
import { useMobileMessagesNav } from '@/hooks/useMobileMessagesNav';
import { cn } from '@/lib/utils';
import { usePrefetchMountLog } from '@/lib/navigation/usePrefetchMountLog';

// Memoized filter chip for mobile horizontal scroll
const FilterChip = memo(function FilterChip({
  label,
  count,
  isActive,
  onClick,
  icon: Icon,
  color,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors min-h-[36px]",
        isActive
          ? "bg-primary text-primary-foreground"
          : "bg-muted hover:bg-muted/80"
      )}
    >
      {Icon && <Icon className={cn("h-3.5 w-3.5", color)} />}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <Badge variant={isActive ? "secondary" : "default"} className="h-5 px-1.5 text-xs">
          {count}
        </Badge>
      )}
    </button>
  );
});

export default function OtaMessagesPage() {
  // Mobile navigation hook
  const {
    currentView,
    isMobile,
    selectedConversationId,
    isContextOpen,
    goToList,
    goToThread,
    openContext,
    closeContext,
  } = useMobileMessagesNav();

  // Local state
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [attentionFilter, setAttentionFilter] = useState<string>('all');
  const [opsFilter, setOpsFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [linkBookingConvId, setLinkBookingConvId] = useState<string | null>(null);

  // Data hooks
  const {
    conversations,
    isLoading: isLoadingConversations,
    refetch: refetchConversations
  } = useConversations({
    // propertyId filtering done CLIENT-SIDE (line ~230) to keep full property list in dropdown
    status: statusFilter,
  });

  usePrefetchMountLog('OtaMessagesPage', [
    { key: ['conversations'], query: { status: isLoadingConversations ? 'loading' : 'success', isFetching: isLoadingConversations, dataUpdatedAt: Date.now() } },
  ]);

  const {
    messages,
    isLoading: isLoadingMessages
  } = useMessages(selectedConversation?.id || null);

  // Outbound message status tracking
  const pendingOutboundMessages = useOutboundMessageStatus(selectedConversation?.id || null);

  const sendMessage = useSendMessage();
  const sendWhatsAppMessage = useSendWhatsAppMessage();
  const retryMessage = useRetryMessage();
  const closeConversation = useCloseConversation();
  const { syncMessages, isSyncing } = useSyncMessages();
  const markAsRead = useMarkConversationRead(selectedConversation?.id || null);

  // Sync selected conversation with conversations data when it changes
  // This ensures UI updates after claim/release/escalate without F5
  // CRITICAL: This handles realtime updates from other browsers
  useEffect(() => {
    if (selectedConversation && conversations) {
      const updatedConv = conversations.find(c => c.id === selectedConversation.id);
      if (updatedConv) {
        // Check for any relevant changes
        const hasChanges =
          updatedConv.assignment_status !== selectedConversation.assignment_status ||
          updatedConv.assigned_to_user_id !== selectedConversation.assigned_to_user_id ||
          updatedConv.assigned_to_name !== selectedConversation.assigned_to_name ||
          updatedConv.assigned_team !== selectedConversation.assigned_team ||
          updatedConv.assigned_at !== selectedConversation.assigned_at ||
          updatedConv.resolved_at !== selectedConversation.resolved_at ||
          updatedConv.resolved_by_user_id !== selectedConversation.resolved_by_user_id ||
          updatedConv.resolved_by_name !== selectedConversation.resolved_by_name ||
          updatedConv.unread_count !== selectedConversation.unread_count ||
          updatedConv.last_message_at !== selectedConversation.last_message_at ||
          updatedConv.last_message_preview !== selectedConversation.last_message_preview;

        if (hasChanges) {
          console.log('[OtaMessages] Syncing selectedConversation from realtime update');
          setSelectedConversation(updatedConv);
        }
      }
    }
  }, [conversations, selectedConversation]);

  // Sync selected conversation with URL on mobile
  useEffect(() => {
    if (selectedConversationId && conversations) {
      const found = conversations.find(c => c.id === selectedConversationId);
      if (found) {
        setSelectedConversation(found);
      }
    } else if (!selectedConversationId && isMobile) {
      setSelectedConversation(null);
    }
  }, [selectedConversationId, conversations, isMobile]);

  // Mark conversation as read when selected
  useEffect(() => {
    if (selectedConversation && selectedConversation.unread_count > 0) {
      markAsRead();
    }
  }, [selectedConversation, markAsRead]);

  // PERF: Auto-sync on mount removed — useBackgroundMessagesSync (app-level)
  // already handles initial sync (2s delay), 60s polling, visibility-change sync,
  // and realtime subscription. Page-level sync was redundant.

  // Get unique properties with names for filter
  const propertiesWithNames = useMemo(() => {
    const propertyMap = new Map<string, string>();
    (conversations || []).forEach(c => {
      if (!propertyMap.has(c.property_id)) {
        propertyMap.set(c.property_id, c.pms_property_name || c.property_id);
      }
    });
    return Array.from(propertyMap.entries()).map(([id, name]) => ({ id, name }));
  }, [conversations]);

  // Helper function to check if conversation needs attention
  const getAttentionStatus = (conv: Conversation): 'unread' | 'unanswered' | null => {
    if (conv.unread_count > 0) return 'unread';

    // Check if unanswered
    const lastInbound = conv.last_inbound_at || conv.last_message_at;
    if (!lastInbound) return null;

    const inboundTime = new Date(lastInbound).getTime();
    const outboundTime = conv.last_outbound_at ? new Date(conv.last_outbound_at).getTime() : 0;

    if (outboundTime > inboundTime) return null;
    return 'unanswered';
  };

  // Filter conversations by search query, property, attention, and ops status
  const filteredConversations = useMemo(() => {
    let filtered = conversations || [];

    // Filter by channel type (case-insensitive to prevent casing mismatches)
    if (channelFilter !== 'all') {
      filtered = filtered.filter(c => (c.channel_type || '').toUpperCase() === channelFilter.toUpperCase());
    }

    // Filter by property if selected
    if (propertyFilter !== 'all') {
      filtered = filtered.filter(c => c.property_id === propertyFilter);
    }

    // Filter by attention status
    if (attentionFilter !== 'all') {
      filtered = filtered.filter(c => {
        const status = getAttentionStatus(c);
        if (attentionFilter === 'unread') return status === 'unread';
        if (attentionFilter === 'unanswered') return status === 'unanswered';
        if (attentionFilter === 'needs_attention') return status !== null;
        return true;
      });
    }

    // Filter by ops status (stay status)
    if (opsFilter !== 'all') {
      filtered = filtered.filter(c => {
        if (opsFilter === 'WAIT_ROOM') return c.stay_status === 'WAIT_ROOM';
        if (opsFilter === 'CHECKED_IN') return c.stay_status === 'CHECKED_IN';
        if (opsFilter === 'IN_HOUSE') return c.stay_status === 'IN_HOUSE';
        if (opsFilter === 'CHECKED_OUT') return c.stay_status === 'CHECKED_OUT';
        if (opsFilter === 'NO_SHOW') return c.stay_status === 'NO_SHOW';
        if (opsFilter === 'NO_STAY') return !c.real_unified_booking_id; // no mapped booking
        return true;
      });
    }

    // Filter by search (guest name, phone, booking code, message preview)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(conv =>
        conv.guest_name?.toLowerCase().includes(query) ||
        conv.booking_guest_name?.toLowerCase().includes(query) ||
        conv.guest_email?.toLowerCase().includes(query) ||
        conv.guest_phone?.toLowerCase().includes(query) ||
        conv.unified_booking_id?.toLowerCase().includes(query) ||
        conv.real_unified_booking_id?.toLowerCase().includes(query) ||
        conv.ota_booking_code?.toLowerCase().includes(query) ||
        conv.pms_property_name?.toLowerCase().includes(query) ||
        conv.external_conversation_id.toLowerCase().includes(query) ||
        conv.wa_customer_phone?.toLowerCase().includes(query) ||
        conv.last_message_preview?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [conversations, searchQuery, propertyFilter, channelFilter, attentionFilter, opsFilter]);

  // Calculate counts for filters
  const filterCounts = useMemo(() => {
    const all = conversations || [];
    let unread = 0;
    let unanswered = 0;

    all.forEach(c => {
      const status = getAttentionStatus(c);
      if (status === 'unread') unread++;
      else if (status === 'unanswered') unanswered++;
    });

    return { unread, unanswered, needsAttention: unread + unanswered };
  }, [conversations]);

  // Calculate ops status counts
  const opsCounts = useMemo(() => {
    const all = conversations || [];
    let waitRoom = 0;
    let checkedIn = 0;
    let inHouse = 0;
    let checkedOut = 0;
    let noShow = 0;
    let noStay = 0;

    all.forEach(c => {
      if (!c.real_unified_booking_id) {
        noStay++;
        return;
      }

      if (c.stay_status === 'WAIT_ROOM') waitRoom++;
      else if (c.stay_status === 'CHECKED_IN') checkedIn++;
      else if (c.stay_status === 'IN_HOUSE') inHouse++;
      else if (c.stay_status === 'CHECKED_OUT') checkedOut++;
      else if (c.stay_status === 'NO_SHOW') noShow++;
    });

    return { waitRoom, checkedIn, inHouse, checkedOut, noShow, noStay };
  }, [conversations]);

  // Calculate unread count
  const totalUnread = (conversations || []).reduce((sum, c) => sum + c.unread_count, 0);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
    if (isMobile) {
      goToThread(conversation.id);
    }
  }, [isMobile, goToThread]);

  const handleSendMessage = useCallback(async (body: string, attachments?: File[]) => {
    if (!selectedConversation) return;

    const isWhatsApp = selectedConversation.channel_type === 'WHATSAPP';

    // Only set pendingMessage for non-WhatsApp channels.
    // WhatsApp send already does optimistic cache update in useSendWhatsAppMessage.onMutate,
    // so setting pendingMessage would cause a duplicate bubble.
    if (!isWhatsApp) {
      setPendingMessage(body);
    }

    try {
      if (isWhatsApp) {
        // Route to WhatsApp send API (optimistic update handled by mutation)
        await sendWhatsAppMessage.mutateAsync({
          conversationId: selectedConversation.id,
          body,
        });
      } else {
        // Route to Channex/OTA send API
        if (attachments && attachments.length > 0) {
          toast.warning('Kênh OTA chưa hỗ trợ đính kèm ảnh. Chỉ gửi tin nhắn văn bản.');
        }
        await sendMessage.mutateAsync({
          conversationId: selectedConversation.id,
          threadId: selectedConversation.external_conversation_id,
          body,
        });
      }
    } finally {
      setPendingMessage(null);
    }
  }, [selectedConversation, sendMessage, sendWhatsAppMessage]);

  const handleRetryMessage = useCallback(async (outboundId: string) => {
    try {
      await retryMessage.mutateAsync(outboundId);
    } catch {
      // Error handled in hook
    }
  }, [retryMessage]);

  const handleCloseConversation = useCallback(async () => {
    if (!selectedConversation) return;
    await closeConversation.mutateAsync(selectedConversation.id);
    setSelectedConversation(null);
    if (isMobile) {
      goToList();
    }
  }, [selectedConversation, closeConversation, isMobile, goToList]);

  const handleSync = useCallback(async () => {
    await syncMessages(propertyFilter !== 'all' ? propertyFilter : undefined);
    setLastSyncedAt(new Date().toISOString());
    refetchConversations();
  }, [syncMessages, propertyFilter, refetchConversations]);

  const handleBackToList = useCallback(() => {
    if (isMobile) {
      goToList();
    }
    setSelectedConversation(null);
  }, [isMobile, goToList]);

  // ============ MOBILE LAYOUT ============
  if (isMobile) {
    return (
      <>
        {/* List view: within MainLayout shell (header+bottom-nav visible).
             Thread view: MainLayout hides header+bottom-nav via isFullBleedMobilePage,
             so we just use full height without fixed positioning. */}
        <div className={cn(
          "flex flex-col bg-background overflow-hidden",
          currentView === 'list'
            ? "h-full -mx-3 -mb-4 w-[calc(100%+1.5rem)]"
            : "h-full"
        )}>
          {/* Mobile: Conversation List View */}
          {currentView === 'list' && (
            <>
              {/* Mobile Header — search + filters (Roomrise header visible above) */}
              <header className="sticky top-0 z-30">
                {/* Top bar — primary colored */}
                <div className="bg-primary text-primary-foreground px-4 pt-2 pb-2">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h1 className="text-base font-bold tracking-tight text-primary-foreground">Tin nhắn</h1>
                    </div>
                    <div className="flex items-center gap-1">
                      {totalUnread > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 bg-white/20 text-primary-foreground border-0">
                          {totalUnread}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="h-10 w-10 text-primary-foreground hover:bg-white/10"
                      >
                        <RefreshCw className={cn("h-5 w-5", isSyncing && "animate-spin")} />
                      </Button>
                    </div>
                  </div>

                  {/* Search — rounded pill style */}
                  <div className="relative mb-2">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Tìm khách, booking..."
                      className="pl-10 h-9 text-sm rounded-full bg-background border-0 shadow-sm text-foreground placeholder:text-muted-foreground"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter chips — horizontal scroll on light bg */}
                <div className="bg-background px-3 py-2 overflow-x-auto scrollbar-hide border-b">
                  <div className="flex gap-2">
                    <FilterChip
                      label="OTA"
                      isActive={channelFilter === 'OTA'}
                      onClick={() => setChannelFilter(channelFilter === 'OTA' ? 'all' : 'OTA')}
                      icon={MessageSquare}
                      color="text-info"
                    />
                    <FilterChip
                      label="WhatsApp"
                      isActive={channelFilter === 'WHATSAPP'}
                      onClick={() => setChannelFilter(channelFilter === 'WHATSAPP' ? 'all' : 'WHATSAPP')}
                      icon={MessageSquare}
                      color="text-success"
                    />
                    <FilterChip
                      label="Cần xử lý"
                      count={filterCounts.needsAttention}
                      isActive={attentionFilter === 'needs_attention'}
                      onClick={() => setAttentionFilter(attentionFilter === 'needs_attention' ? 'all' : 'needs_attention')}
                      icon={AlertCircle}
                      color="text-warning"
                    />
                    <FilterChip
                      label="Chưa đọc"
                      count={filterCounts.unread}
                      isActive={attentionFilter === 'unread'}
                      onClick={() => setAttentionFilter(attentionFilter === 'unread' ? 'all' : 'unread')}
                      icon={Mail}
                      color="text-destructive"
                    />
                    <FilterChip
                      label="Chờ nhận phòng"
                      count={opsCounts.waitRoom}
                      isActive={opsFilter === 'WAIT_ROOM'}
                      onClick={() => setOpsFilter(opsFilter === 'WAIT_ROOM' ? 'all' : 'WAIT_ROOM')}
                      icon={LogIn}
                      color="text-primary"
                    />
                    <FilterChip
                      label="Đang ở"
                      count={opsCounts.inHouse}
                      isActive={opsFilter === 'IN_HOUSE'}
                      onClick={() => setOpsFilter(opsFilter === 'IN_HOUSE' ? 'all' : 'IN_HOUSE')}
                      icon={Home}
                      color="text-success"
                    />
                  </div>
                </div>

                {/* Status tabs */}
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'OPEN' | 'CLOSED')} className="w-full bg-background">
                  <TabsList className="w-full grid grid-cols-2 h-11 rounded-none bg-transparent p-0 border-b">
                    <TabsTrigger
                      value="OPEN"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-11"
                    >
                      Active
                    </TabsTrigger>
                    <TabsTrigger
                      value="CLOSED"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-11"
                    >
                      Closed
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </header>

              {/* Conversation List */}
              <div className="flex-1 overflow-hidden">
                <ConversationList
                  conversations={filteredConversations}
                  selectedId={selectedConversation?.id || null}
                  onSelect={handleSelectConversation}
                  isLoading={isLoadingConversations}
                />
              </div>
            </>
          )}

          {/* Mobile: Thread View — full screen (MobileThreadHeader owns top, ReplyInput owns bottom) */}
          {currentView === 'thread' && selectedConversation && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Thread Header */}
              <MobileThreadHeader
                conversation={selectedConversation}
                onBack={handleBackToList}
                onOpenContext={openContext}
              />

              {/* Messages */}
              <div className="flex-1 overflow-hidden bg-white dark:bg-background">
                <MessageThread
                  messages={messages || []}
                  conversation={selectedConversation}
                  isLoading={isLoadingMessages}
                  pendingMessage={pendingMessage}
                  pendingOutboundMessages={pendingOutboundMessages}
                  onRetry={handleRetryMessage}
                />
              </div>

              {/* Reply Input */}
              <ReplyInput
                conversation={selectedConversation}
                onSend={handleSendMessage}
                isSending={sendMessage.isPending || sendWhatsAppMessage.isPending || !!pendingMessage}
                hasPendingMessages={pendingOutboundMessages.length > 0}
              />
            </div>
          )}

          {/* Mobile: Context Panel as Bottom Sheet */}
          <Drawer open={isContextOpen} onOpenChange={(open) => !open && closeContext()}>
            <DrawerContent className="max-h-[85dvh] bg-white dark:bg-background">
              <DrawerHeader className="border-b">
                <DrawerTitle>Chi tiết hội thoại</DrawerTitle>
              </DrawerHeader>
              <div className="overflow-auto flex-1">
                <ContextPanel
                  conversation={selectedConversation}
                  lastSyncedAt={lastSyncedAt}
                  onLinkBooking={setLinkBookingConvId}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </>
    );
  }

  // ============ DESKTOP LAYOUT ============
  return (
    <>
      <Header title="Tin nhắn" subtitle="Tin nhắn từ OTA & WhatsApp" compact />
      <PageContainer>
        <SectionCard noPadding className="overflow-hidden">
          <div className="flex flex-col h-[calc(100vh-8rem)]">
            {/* Toolbar: filters + search + sync */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-xs font-medium mb-1">Lưu ý quan trọng:</p>
                    <ul className="text-xs space-y-1 list-disc list-inside">
                      <li>Tin nhắn từ OTA có thể trễ vài phút tùy kênh</li>
                      <li>Gửi thành công ≠ khách đã nhận</li>
                      <li>SLA OTA mang tính tham khảo</li>
                      <li>Không hỗ trợ typing/seen/online status</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {totalUnread > 0 && (
                <Badge variant="default" className="shrink-0 h-5 text-xs">
                  {totalUnread}
                </Badge>
              )}

              {/* 3 filters inline */}
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger className="h-7 text-xs px-2 w-auto min-w-[100px] max-w-40">
                  <Building2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Chỗ nghỉ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả chỗ nghỉ</SelectItem>
                  {propertiesWithNames.map(({ id, name }) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={attentionFilter} onValueChange={setAttentionFilter}>
                <SelectTrigger className="h-7 text-xs px-2 w-auto min-w-[100px] max-w-40">
                  <AlertCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái</SelectItem>
                  <SelectItem value="needs_attention">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-warning/100" />
                      Cần xử lý ({filterCounts.needsAttention})
                    </span>
                  </SelectItem>
                  <SelectItem value="unread">
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-destructive" />
                      Chưa đọc ({filterCounts.unread})
                    </span>
                  </SelectItem>
                  <SelectItem value="unanswered">
                    <span className="flex items-center gap-1.5">
                      <MailOpen className="h-3 w-3 text-warning" />
                      Chưa trả lời ({filterCounts.unanswered})
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Select value={opsFilter} onValueChange={setOpsFilter}>
                <SelectTrigger className="h-7 text-xs px-2 w-auto min-w-[80px] max-w-36">
                  <Home className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Lưu trú" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả lưu trú</SelectItem>
                  <SelectItem value="WAIT_ROOM">
                    <span className="flex items-center gap-1.5">
                      <LogIn className="h-3 w-3 text-primary" />
                      Chờ nhận phòng ({opsCounts.waitRoom})
                    </span>
                  </SelectItem>
                  <SelectItem value="CHECKED_IN">
                    <span className="flex items-center gap-1.5">
                      <LogIn className="h-3 w-3 text-success" />
                      Đã nhận phòng ({opsCounts.checkedIn})
                    </span>
                  </SelectItem>
                  <SelectItem value="IN_HOUSE">
                    <span className="flex items-center gap-1.5">
                      <Home className="h-3 w-3 text-success" />
                      Đang ở ({opsCounts.inHouse})
                    </span>
                  </SelectItem>
                  <SelectItem value="CHECKED_OUT">
                    <span className="flex items-center gap-1.5">
                      <LogOut className="h-3 w-3 text-muted-foreground" />
                      Đã trả phòng ({opsCounts.checkedOut})
                    </span>
                  </SelectItem>
                  <SelectItem value="NO_SHOW">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                      No-show ({opsCounts.noShow})
                    </span>
                  </SelectItem>
                  <SelectItem value="NO_STAY">
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full border border-muted-foreground/50" />
                      Chưa map ({opsCounts.noStay})
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Search */}
              <div className="relative w-48 shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm khách, booking..."
                  className="pl-8 h-7 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Spacer */}
              <span className="flex-1" />

              {lastSyncedAt && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                  <Clock className="h-3 w-3" />
                  {format(new Date(lastSyncedAt), 'HH:mm')}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs shrink-0"
                onClick={handleSync}
                disabled={isSyncing}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isSyncing && "animate-spin")} />
                {isSyncing ? "Đồng bộ..." : "Đồng bộ"}
              </Button>
            </div>

            {/* Main content - 3 column layout */}
            <div className="flex flex-1 overflow-hidden">
              {/* Column 1: Inbox / Task List */}
              <div className="w-[320px] shrink-0 border-r flex flex-col">
                {/* Status tabs */}
                <div className="border-b">
                  <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'OPEN' | 'CLOSED')} className="w-full">
                    <TabsList className="w-full grid grid-cols-2 h-[49px] rounded-none bg-transparent p-0">
                      <TabsTrigger
                        value="OPEN"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Active
                        {statusFilter !== 'OPEN' && totalUnread > 0 && (
                          <Badge variant="destructive" className="ml-1.5 h-5 px-1.5 text-xs">
                            {totalUnread}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger
                        value="CLOSED"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Closed
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Search and channel filter only */}
                <div className="px-2.5 py-1.5 space-y-1.5 border-b">
                  {/* Channel filter */}
                  <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg">
                    {[
                      { value: 'all', label: 'Tất cả' },
                      { value: 'OTA', label: 'OTA' },
                      { value: 'WHATSAPP', label: 'WhatsApp' },
                    ].map(ch => (
                      <button
                        key={ch.value}
                        onClick={() => setChannelFilter(ch.value)}
                        className={cn(
                          "flex-1 text-xs font-medium py-1 rounded-md transition-colors",
                          channelFilter === ch.value
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-hidden">
                  <ConversationList
                    conversations={filteredConversations}
                    selectedId={selectedConversation?.id || null}
                    onSelect={handleSelectConversation}
                    isLoading={isLoadingConversations}
                  />
                </div>
              </div>

              {/* Column 2: Conversation Thread */}
              <div className="flex-1 flex flex-col bg-card">
                {/* Conversation header */}
                {selectedConversation && (
                  <div className="px-3 py-2 border-b bg-card min-h-[49px] flex items-center">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Avatar with initials */}
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {(selectedConversation.booking_guest_name || selectedConversation.guest_name || 'K')
                            .split(' ')
                            .map(n => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <h2 className="font-semibold text-sm">
                            {selectedConversation.booking_guest_name || selectedConversation.guest_name || 'Khách'}
                          </h2>
                          {selectedConversation.channel_type === 'WHATSAPP' && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                                WhatsApp
                              </Badge>
                              {selectedConversation.guest_phone && (
                                <span className="text-xs font-mono">
                                  +{selectedConversation.guest_phone}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Ownership Status */}
                        <ConversationOwnership conversation={selectedConversation} compact />

                        {selectedConversation.status === 'CLOSED' ? (
                          <Badge variant="secondary">Đã đóng</Badge>
                        ) : !selectedConversation.is_messaging_supported ? (
                          <Badge variant="destructive">Không hỗ trợ nhắn tin</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                            onClick={handleCloseConversation}
                            disabled={closeConversation.isPending}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Đóng case
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Context Strip */}
                <ContextStrip conversation={selectedConversation} />

                {/* Messages */}
                <div className="flex-1 overflow-hidden bg-white dark:bg-background">
                  <MessageThread
                    messages={messages || []}
                    conversation={selectedConversation}
                    isLoading={isLoadingMessages}
                    pendingMessage={pendingMessage}
                    pendingOutboundMessages={pendingOutboundMessages}
                    onRetry={handleRetryMessage}
                  />
                </div>

                {/* Reply input */}
                <ReplyInput
                  conversation={selectedConversation}
                  onSend={handleSendMessage}
                  isSending={sendMessage.isPending || sendWhatsAppMessage.isPending || !!pendingMessage}
                  hasPendingMessages={pendingOutboundMessages.length > 0}
                />
              </div>

              {/* Column 3: Context & Operations Panel */}
              <div className="w-[260px] shrink-0 border-l bg-card overflow-y-auto hidden xl:block">
                <ContextPanel
                  conversation={selectedConversation}
                  lastSyncedAt={lastSyncedAt}
                  onLinkBooking={setLinkBookingConvId}
                />
              </div>
            </div>
          </div>
        </SectionCard>
      </PageContainer>

      {/* Link Booking Dialog (for WhatsApp conversations without booking) */}
      <LinkBookingDialog
        open={!!linkBookingConvId}
        onOpenChange={(open) => !open && setLinkBookingConvId(null)}
        conversationId={linkBookingConvId || ''}
        waCustomerPhone={selectedConversation?.wa_customer_phone}
      />
    </>
  );
}
