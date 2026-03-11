/**
 * TaskTimeline - Clean Activity Feed
 * 
 * Design Principles:
 * - NO emoji
 * - Minimal icons, muted colors
 * - Clean typography hierarchy
 */

import { formatDistanceToNow, format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { TimelineEvent } from '@/hooks/useOtaOperations';
import { Loader2, Clock, FileText } from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

export interface TaskTimelineProps {
  events: TimelineEvent[];
  isLoading?: boolean;
  className?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export function TaskTimeline({ events, isLoading, className }: TaskTimelineProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground mb-1">Chưa có hoạt động</p>
        <p className="text-xs text-muted-foreground/70 mb-4 max-w-[240px]">
          Hệ thống sẽ ghi nhận khi bạn bắt đầu, nộp kết quả, hoặc bình luận.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-0', className)}>
      {events.map((event, idx) => (
        <TimelineItem
          key={event.id}
          event={event}
          isLast={idx === events.length - 1}
        />
      ))}
    </div>
  );
}

// ============================================================
// TIMELINE ITEM
// ============================================================

interface TimelineItemProps {
  event: TimelineEvent;
  isLast: boolean;
}

function TimelineItem({ event, isLast }: TimelineItemProps) {
  const relativeTime = formatDistanceToNow(new Date(event.timestamp), {
    addSuffix: true,
    locale: vi,
  });

  const absoluteTime = format(new Date(event.timestamp), 'dd/MM/yyyy HH:mm', {
    locale: vi,
  });

  return (
    <div className="flex gap-3 pb-4 relative">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-muted" />
      )}

      {/* Dot indicator */}
      <div
        className={cn(
          'flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center z-10',
          'bg-muted border-2 border-white shadow-sm'
        )}
      >
        <div className="w-2 h-2 rounded-full bg-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm text-foreground">
          <span className="font-medium">{event.actor_name}</span>
          {' '}
          <span className="text-muted-foreground">{getActionVerb(event.action)}</span>
        </p>
        <p
          className="text-xs text-muted-foreground mt-0.5"
          title={absoluteTime}
        >
          {relativeTime}
        </p>

        {/* Reason (if any) */}
        {event.reason && (
          <div className="mt-1.5 text-xs text-muted-foreground bg-muted rounded px-2 py-1.5">
            {event.reason}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ACTION VERB HELPER
// ============================================================

function getActionVerb(action: string): string {
  const verbs: Record<string, string> = {
    'CREATE': 'đã tạo task',
    'START': 'bắt đầu task',
    'SUBMIT': 'gửi để review',
    'APPROVE': 'duyệt hoàn thành',
    'BLOCK': 'đánh dấu bị chặn',
    'UNBLOCK': 'bỏ chặn',
    'FORCE_DONE': 'force hoàn thành',
    'REOPEN': 'mở lại task',
    'ASSIGN': 'gán người thực hiện',
    'COMMENT': 'bình luận',
    'UPLOAD_EVIDENCE': 'nộp kết quả',
    'REVIEW_EVIDENCE': 'duyệt kết quả',
  };
  return verbs[action] || action.toLowerCase().replace(/_/g, ' ');
}

// ============================================================
// COMPACT TIMELINE (for card hover preview)
// ============================================================

export interface CompactTimelineProps {
  events: TimelineEvent[];
  maxItems?: number;
  className?: string;
}

export function CompactTimeline({ 
  events, 
  maxItems = 3, 
  className 
}: CompactTimelineProps) {
  const displayEvents = events.slice(0, maxItems);
  const remaining = events.length - maxItems;

  return (
    <div className={cn('space-y-1', className)}>
      {displayEvents.map(event => (
        <div key={event.id} className="flex items-center gap-2 text-xs">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <span className="truncate text-muted-foreground">
            {event.actor_name} {getActionVerb(event.action)}
          </span>
        </div>
      ))}
      {remaining > 0 && (
        <p className="text-xs text-muted-foreground pl-3">
          +{remaining} hoạt động khác
        </p>
      )}
    </div>
  );
}

export default TaskTimeline;
