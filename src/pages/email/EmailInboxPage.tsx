import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Mail, ChevronLeft, AlertCircle, MessageCircle, CreditCard, Inbox, Building2, Sparkles, ShieldAlert, Megaphone, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/useAuth';
import { Header } from '@/components/layout/Header';
import { SectionCard } from '@/components/layout/SectionCard';
import { SmartFolderSidebarV2 } from '@/modules/email/components/v2/SmartFolderSidebarV2';
import { ThreadListV2 } from '@/modules/email/components/v2/ThreadListV2';
import { ThreadDetailV2 } from '@/modules/email/components/v2/ThreadDetailV2';
import { useOperationalThreads, useOperationalAnalytics, type OperationalFolder } from '@/modules/email/hooks/v2/useOperationalThreads';
import { useEmailRealtimeOperational } from '@/modules/email/hooks/operational/useEmailRealtimeOperational';
import { useQueryClient } from '@tanstack/react-query';
import type { EmailThreadV2 } from '@/types/email-v2';

const PAGE_SIZE = 10;
const MAX_PAGE_BUTTONS = 10;

/** Unified folder labels — no legacy entries */
const FOLDER_LABELS: Record<OperationalFolder, string> = {
  ACTION_REQUIRED: 'Cần xử lý',
  BOOKING_SYSTEM: 'Hệ thống OTA',
  GUEST_MESSAGE: 'Tin nhắn khách',
  DISPUTE_REFUND: 'Tranh chấp',
  FINANCE_PAYOUT: 'Tài chính',
  ADS_SPAM: 'QC/Spam',
  INTERNAL_OTHER: 'Nội bộ',
  AI_NEEDS_REVIEW: 'AI Cần review',
  ALL: 'Tất cả',
};

/** Mobile folder tab config — mirrors SmartFolderSidebarV2 folders */
const MOBILE_FOLDERS: { id: OperationalFolder; label: string; icon: React.ElementType; activeClass: string; tagKey: string | null }[] = [
  { id: 'ACTION_REQUIRED', label: 'Cần xử lý', icon: AlertCircle, activeClass: 'bg-rose-100 text-rose-700 border-rose-300', tagKey: null },
  { id: 'BOOKING_SYSTEM', label: 'OTA', icon: Building2, activeClass: 'bg-teal-100 text-teal-700 border-teal-300', tagKey: 'BOOKING_SYSTEM' },
  { id: 'GUEST_MESSAGE', label: 'Khách', icon: MessageCircle, activeClass: 'bg-blue-100 text-blue-700 border-blue-300', tagKey: 'GUEST_MESSAGE' },
  { id: 'DISPUTE_REFUND', label: 'Tranh chấp', icon: ShieldAlert, activeClass: 'bg-amber-100 text-amber-700 border-amber-300', tagKey: 'DISPUTE_REFUND' },
  { id: 'FINANCE_PAYOUT', label: 'Tài chính', icon: CreditCard, activeClass: 'bg-purple-100 text-purple-700 border-purple-300', tagKey: 'FINANCE_PAYOUT' },
  { id: 'ADS_SPAM', label: 'Spam', icon: Megaphone, activeClass: 'bg-slate-100 text-slate-600 border-slate-300', tagKey: 'ADS_SPAM' },
  { id: 'AI_NEEDS_REVIEW', label: 'AI Review', icon: Sparkles, activeClass: 'bg-violet-100 text-violet-700 border-violet-300', tagKey: null },
  { id: 'ALL', label: 'Tất cả', icon: Inbox, activeClass: 'bg-primary/10 text-primary border-primary/30', tagKey: null },
];

/** Windowed page buttons (max MAX_PAGE_BUTTONS centered around current) */
function getPageWindow(currentPage: number, totalPages: number): number[] {
  if (totalPages <= MAX_PAGE_BUTTONS) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(MAX_PAGE_BUTTONS / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + MAX_PAGE_BUTTONS - 1);
  start = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * EmailInboxPage — uses the same Header + SectionCard pattern
 * as every other page in the system for consistent styling.
 *
 * Mobile: layered navigation (folder tabs + thread list → thread detail overlay)
 * Desktop: 3-column layout (sidebar + thread list + thread detail)
 *
 * Thread click only changes local state. Zero global side effects.
 */
export default function EmailInboxPage() {
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const [currentFolder, setCurrentFolder] = useState<OperationalFolder>('ACTION_REQUIRED');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedThread, setSelectedThread] = useState<EmailThreadV2 | null>(null);
  const [isReclassifying, setIsReclassifying] = useState(false);

  const handleReclassify = useCallback(async () => {
    if (isReclassifying) return;
    setIsReclassifying(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('email-reclassify-batch', {
        body: { dryRun: false, limit: 1000 },
      });
      if (error) throw error;
      toast.success(`Đã phân loại lại ${result.updated} threads (bỏ qua ${result.skipped_manual} thủ công)`);
      queryClient.invalidateQueries({ queryKey: ['email-raw-threads-v2'] });
      queryClient.invalidateQueries({ queryKey: ['email-operational-threads'] });
      queryClient.invalidateQueries({ queryKey: ['email-operational-analytics'] });
    } catch (err) {
      console.error('[RECLASSIFY]', err);
      toast.error('Không thể phân loại lại');
    } finally {
      setIsReclassifying(false);
    }
  }, [isReclassifying, queryClient]);

  const { data, isLoading } = useOperationalThreads({
    folder: currentFolder,
    page: currentPage,
    pageSize: PAGE_SIZE,
  });
  const { data: analytics } = useOperationalAnalytics();

  useEmailRealtimeOperational({ activeThreadId: selectedThread?.id ?? null });

  const handleSelectFolder = useCallback((folder: OperationalFolder) => {
    setCurrentFolder(folder);
    setCurrentPage(1);
    setSelectedThread(null);
  }, []);

  const handleSelectThread = useCallback((thread: EmailThreadV2) => {
    setSelectedThread(thread);
  }, []);

  /** Mobile back button — clear selected thread to return to list */
  const handleMobileBack = useCallback(() => {
    setSelectedThread(null);
  }, []);

  const handleThreadUpdated = useCallback((updated: Partial<EmailThreadV2> & { id: string }) => {
    setSelectedThread((prev) => {
      if (!prev || prev.id !== updated.id) return prev;
      return { ...prev, ...updated };
    });
  }, []);

  const actionRequiredCount = analytics?.total_action_required;
  const perTag = analytics?.threads_per_tag ?? {};
  const folderLabel = FOLDER_LABELS[currentFolder] || currentFolder;

  // Auto-clear selected thread if it's not in current page data
  const currentThreadIds = useMemo(
    () => new Set((data?.threads ?? []).map(t => t.id)),
    [data?.threads]
  );
  useEffect(() => {
    if (selectedThread && currentThreadIds.size > 0 && !currentThreadIds.has(selectedThread.id)) {
      setSelectedThread(null);
    }
  }, [selectedThread, currentThreadIds]);

  // Pagination
  const totalItems = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const pageWindow = useMemo(() => getPageWindow(currentPage, totalPages), [currentPage, totalPages]);
  const showPagination = totalPages > 1;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/*
       * ══════════════════════════════════════════════════════════
       * HEADER — same navy gradient banner as all other pages
       * ══════════════════════════════════════════════════════════
       */}
      <div className="shrink-0">
        <Header
          title="Email"
          subtitle="Operational Hub"
          icon={Mail}
          compact
          actions={isAdmin ? (
            <TooltipProvider>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                      onClick={handleReclassify} disabled={isReclassifying}>
                      <RefreshCw className={cn("h-4 w-4", isReclassifying && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Phân loại lại tất cả email</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                      onClick={() => navigate('/email/accounts')}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Quản lý tài khoản email</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : undefined}
        />
      </div>

      {/*
       * ══════════════════════════════════════════════════════════
       * MOBILE: Folder tabs (horizontal scroll pills)
       * Visible only on < md breakpoint
       * ══════════════════════════════════════════════════════════
       */}
      <div className="md:hidden shrink-0 border-b border-border/30 bg-white">
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {MOBILE_FOLDERS.map((folder) => {
            const isActive = currentFolder === folder.id;
            const Icon = folder.icon;
            let count: number | undefined;
            if (folder.id === 'ACTION_REQUIRED') {
              count = actionRequiredCount;
            } else if (folder.tagKey) {
              count = perTag[folder.tagKey];
            }
            return (
              <button
                key={folder.id}
                onClick={() => handleSelectFolder(folder.id)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap border transition-colors shrink-0",
                  isActive
                    ? folder.activeClass
                    : "bg-white text-muted-foreground border-border/40 hover:bg-muted/50"
                )}
              >
                <Icon className="h-3 w-3 shrink-0" />
                {folder.label}
                {count != null && count > 0 && (
                  <span className={cn(
                    "ml-0.5 text-[9px] font-bold min-w-[14px] text-center px-1 rounded-full leading-relaxed",
                    folder.id === 'ACTION_REQUIRED' && isActive
                      ? "bg-rose-500 text-white"
                      : isActive ? "bg-white/50" : "bg-muted"
                  )}>
                    {count > 999 ? '999+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/*
       * ══════════════════════════════════════════════════════════
       * CONTENT AREA
       * Desktop: 3-column SectionCard
       * Mobile: Thread list (Layer 1) + Thread detail overlay (Layer 2)
       * ══════════════════════════════════════════════════════════
       */}
      <SectionCard noPadding className="flex-1 min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 overflow-hidden">

          {/* ── Col 1: Folders (desktop only — hidden on mobile) ── */}
          <div className="hidden md:block">
            <SmartFolderSidebarV2
              currentFolder={currentFolder}
              onSelectFolder={handleSelectFolder}
              analytics={{ actionRequiredCount, perTag }}
            />
          </div>

          {/* ── Col 2: Thread list ── */}
          {/* Mobile: full width; Desktop: fixed 320px */}
          <div className={cn(
            "flex flex-col shrink-0 border-r border-border/30 bg-white min-h-0 overflow-hidden",
            "w-full md:w-[320px]",
            // Mobile: hide when thread is selected (layer 2 takes over)
            selectedThread ? "hidden md:flex" : "flex"
          )}>
            {/* Header — pinned top */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                <span className="font-semibold text-sm truncate">{folderLabel}</span>
              </div>
              {totalItems > 0 && (
                <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                  {totalItems}
                </span>
              )}
            </div>

            {/* Scrollable list — fills remaining space */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ThreadListV2
                threads={data?.threads ?? []}
                isLoading={isLoading}
                selectedThreadId={selectedThread?.id ?? null}
                onSelectThread={handleSelectThread}
              />
            </div>

            {/* Pagination — pinned bottom */}
            {showPagination && (
              <div className="flex items-center justify-center gap-0.5 px-2 py-1 border-t border-border/30 shrink-0 bg-white">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[11px]"
                  disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>‹</Button>

                {pageWindow[0] > 1 && (
                  <>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[11px]"
                      onClick={() => setCurrentPage(1)}>1</Button>
                    {pageWindow[0] > 2 && <span className="text-[10px] text-muted-foreground/40 px-0.5">…</span>}
                  </>
                )}

                {pageWindow.map(p => (
                  <Button key={p} variant={p === currentPage ? 'default' : 'ghost'} size="sm"
                    className={p === currentPage
                      ? "h-6 w-6 p-0 text-[11px] bg-primary text-primary-foreground"
                      : "h-6 w-6 p-0 text-[11px]"}
                    onClick={() => setCurrentPage(p)}>{p}</Button>
                ))}

                {pageWindow[pageWindow.length - 1] < totalPages && (
                  <>
                    {pageWindow[pageWindow.length - 1] < totalPages - 1 &&
                      <span className="text-[10px] text-muted-foreground/40 px-0.5">…</span>}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[11px]"
                      onClick={() => setCurrentPage(totalPages)}>{totalPages}</Button>
                  </>
                )}

                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[11px]"
                  disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>›</Button>
              </div>
            )}
          </div>

          {/* ── Col 3: Thread detail ── */}
          {/* Desktop: normal flex column */}
          <div className="hidden md:flex flex-1 min-w-0 min-h-0 overflow-hidden">
            <ThreadDetailV2
              thread={selectedThread}
              onThreadUpdated={handleThreadUpdated}
            />
          </div>

          {/* Mobile: full-screen overlay when thread is selected */}
          {selectedThread && (
            <div className="md:hidden flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden bg-white">
              {/* Mobile back bar */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 shrink-0 bg-white">
                <button
                  onClick={handleMobileBack}
                  className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Quay lại
                </button>
                <span className="text-xs text-muted-foreground truncate flex-1">{selectedThread.subject}</span>
              </div>
              {/* Thread detail content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <ThreadDetailV2
                  thread={selectedThread}
                  onThreadUpdated={handleThreadUpdated}
                />
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
