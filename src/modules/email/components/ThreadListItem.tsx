import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Star } from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { vi } from 'date-fns/locale';
import type { EmailThread } from '@/types/email';
import { cn } from '@/lib/utils';
import { getSenderDisplayName } from '../utils/rfc2047';
import { WorkflowStatusBadge } from './WorkflowPanel';

// Gmail-style avatar colors
const AVATAR_COLORS = [
  'bg-red-500', 'bg-pink-500', 'bg-purple-500', 'bg-indigo-500',
  'bg-blue-500', 'bg-cyan-500', 'bg-teal-500', 'bg-green-500',
  'bg-lime-600', 'bg-amber-500', 'bg-orange-500', 'bg-rose-500',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface ThreadListItemProps {
  thread: EmailThread;
  isSelected?: boolean;
  isChecked?: boolean;
  onCheck?: (checked: boolean) => void;
  onClick: () => void;
}

export function ThreadListItem({ thread, isSelected, isChecked, onCheck, onClick }: ThreadListItemProps) {
  const isUnread = thread.unread_count > 0;
  const firstParticipant = thread.participants?.[0];

  const fromDisplay = useMemo(() => {
    return getSenderDisplayName(firstParticipant?.name, firstParticipant?.email);
  }, [firstParticipant]);

  const accountLabel = thread.email_accounts?.email_address?.split('@')[0] ?? '';

  // Desktop: relative time
  const timeStr = thread.last_message_at
    ? formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true, locale: vi })
    : '';

  // Mobile: Gmail-style time (HH:mm if today, "Hôm qua" if yesterday, dd/MM otherwise)
  const mobileTimeStr = useMemo(() => {
    if (!thread.last_message_at) return '';
    const d = new Date(thread.last_message_at);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Hôm qua';
    return format(d, 'dd/MM');
  }, [thread.last_message_at]);

  const avatarLetter = fromDisplay[0]?.toUpperCase() ?? '?';
  const avatarBg = useMemo(() => getAvatarColor(fromDisplay), [fromDisplay]);

  return (
    <>
      {/* ═══ DESKTOP LAYOUT (sm+) — original single horizontal row ═══ */}
      <button
        onClick={onClick}
        className={cn(
          'w-full text-left px-4 py-2 border-b transition-colors group items-center gap-2 relative hidden sm:flex',
          isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : (isUnread ? 'bg-background hover:shadow-sm' : 'bg-muted/10 hover:bg-muted/30'),
          isUnread && 'font-semibold',
        )}
      >
        {/* Sender */}
        <span className={cn(
          'text-xs truncate shrink-0 w-1/4 max-w-[200px] min-w-[120px]',
          isUnread ? 'font-bold text-foreground' : 'font-normal text-foreground'
        )}>
          {fromDisplay}
        </span>

        {/* Unread badge */}
        {isUnread && (
          <Badge variant="default" className="text-micro px-1 py-0 h-4 leading-tight shrink-0">
            {thread.unread_count}
          </Badge>
        )}

        {/* Workflow badge */}
        <WorkflowStatusBadge status={thread.email_thread_workflow?.status} />

        {/* Subject + Snippet */}
        <div className="flex-1 min-w-0 flex items-center gap-1 truncate">
          <span className={cn(
            'text-xs truncate',
            isUnread ? 'text-foreground font-semibold' : 'text-foreground'
          )}>
            {thread.subject || '(Không có tiêu đề)'}
          </span>
          {thread.snippet && (
            <>
              <span className="text-muted-foreground shrink-0">-</span>
              <span className="text-xs text-muted-foreground truncate">
                {thread.snippet}
              </span>
            </>
          )}
        </div>

        {/* Time */}
        <span className={cn(
          'text-xs whitespace-nowrap shrink-0',
          isUnread ? 'text-foreground font-semibold' : 'text-muted-foreground'
        )}>
          {timeStr}
        </span>
      </button>

      {/* ═══ MOBILE LAYOUT (<sm) — Gmail-style: avatar + stacked lines ═══ */}
      <button
        onClick={onClick}
        className={cn(
          'w-full text-left px-4 py-3 border-b transition-colors flex items-start gap-3.5 sm:hidden active:bg-muted/20',
          isSelected ? 'bg-primary/5' : (isUnread ? 'bg-background' : 'bg-muted/5'),
        )}
      >
        {/* Avatar circle — Gmail colored */}
        <div className={cn(
          'h-10 w-10 rounded-full flex items-center justify-center text-white text-base font-medium shrink-0 mt-0.5',
          avatarBg,
        )}>
          {avatarLetter}
        </div>

        {/* Stacked: sender → subject → snippet */}
        <div className="flex-1 min-w-0">
          {/* Line 1: Sender + badges + time */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className={cn(
                'text-[15px] truncate leading-tight',
                isUnread ? 'font-bold text-foreground' : 'font-normal text-foreground'
              )}>
                {fromDisplay}
              </span>
              {isUnread && (
                <Badge variant="default" className="text-micro px-1 py-0 h-4 leading-tight shrink-0">
                  {thread.unread_count}
                </Badge>
              )}
              <WorkflowStatusBadge status={thread.email_thread_workflow?.status} />
            </div>
            <span className={cn(
              'text-xs whitespace-nowrap shrink-0',
              isUnread ? 'text-foreground font-semibold' : 'text-muted-foreground'
            )}>
              {mobileTimeStr}
            </span>
          </div>

          {/* Line 2: Subject */}
          <p className={cn(
            'text-[13px] truncate leading-snug mt-0.5',
            isUnread ? 'font-semibold text-foreground' : 'text-foreground/80'
          )}>
            {thread.subject || '(Không có tiêu đề)'}
          </p>

          {/* Line 3: Snippet preview */}
          {thread.snippet && (
            <p className="text-[13px] text-muted-foreground truncate leading-snug mt-0.5">
              {thread.snippet}
            </p>
          )}
        </div>

        {/* Star icon — Gmail style */}
        <Star className="h-5 w-5 text-muted-foreground/30 shrink-0 mt-1" />
      </button>
    </>
  );
}
