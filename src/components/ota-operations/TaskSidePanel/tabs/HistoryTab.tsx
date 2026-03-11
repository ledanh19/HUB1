/**
 * HistoryTab - Task state transitions and activity log
 * 
 * DISPLAYS:
 * - Timeline of all task events from ota_audit_log
 * - Who did what and when
 * - Status changes, assignments, evidence actions
 * - Grouped by date with relative timestamps
 */

import React from 'react';
import { 
  Circle, 
  CheckCircle, 
  XCircle, 
  UserPlus, 
  Upload, 
  MessageSquare,
  Clock,
  AlertTriangle,
  ArrowRight,
  Loader2,
  AlertCircle,
  Plus,
  Zap,
  Flame
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskTimeline, TimelineEvent } from '@/hooks/useOtaOperations';

interface HistoryTabProps {
  taskId: string;
}

// Action to icon mapping
const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'TASK_CREATED': Plus,
  'STATUS_CHANGED': ArrowRight,
  'ASSIGNEE_CHANGED': UserPlus,
  'EVIDENCE_SUBMITTED': Upload,
  'EVIDENCE_REVIEWED': CheckCircle,
  'COMMENT_ADDED': MessageSquare,
  'PRIORITY_CHANGED': Flame,
  'SUPER_ADMIN_OVERRIDE': Zap,
};

// Action to color mapping  
const ACTION_COLORS: Record<string, string> = {
  'TASK_CREATED': 'text-info border-info/20 bg-info/10',
  'STATUS_CHANGED': 'text-primary border-primary/20 bg-primary/10',
  'ASSIGNEE_CHANGED': 'text-info border-info/20 bg-info/10',
  'EVIDENCE_SUBMITTED': 'text-warning border-warning/20 bg-warning/10',
  'EVIDENCE_REVIEWED': 'text-success border-success/20 bg-success/10',
  'COMMENT_ADDED': 'text-muted-foreground border-border bg-muted',
  'PRIORITY_CHANGED': 'text-warning border-warning/20 bg-warning/10',
  'SUPER_ADMIN_OVERRIDE': 'text-destructive border-destructive/20 bg-destructive/10',
};

// Format time (HH:MM)
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('vi-VN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// Format date header
function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Hôm nay';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }
  return date.toLocaleDateString('vi-VN', { 
    weekday: 'long',
    day: '2-digit', 
    month: '2-digit',
    year: 'numeric'
  });
}

// Group events by date
function groupByDate(events: TimelineEvent[]): { date: string; events: TimelineEvent[] }[] {
  const groups: Record<string, TimelineEvent[]> = {};
  
  events.forEach(event => {
    const dateKey = new Date(event.timestamp).toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(event);
  });
  
  // Sort by date descending
  return Object.entries(groups)
    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
    .map(([dateKey, events]) => ({
      date: events[0].timestamp,
      events,
    }));
}

export function HistoryTab({ taskId }: HistoryTabProps) {
  const { data: timeline, isLoading, error } = useTaskTimeline(taskId);
  
  const groupedHistory = groupByDate(timeline || []);

  return (
    <div 
      id="panel-history" 
      role="tabpanel" 
      aria-labelledby="tab-history"
      className="p-4"
    >
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">
        Lịch sử thay đổi ({timeline?.length || 0})
      </h3>
      
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
          <p className="text-sm">Lỗi tải lịch sử</p>
          <p className="text-xs">{(error as Error).message}</p>
        </div>
      )}
      
      {/* Timeline */}
      {!isLoading && !error && groupedHistory.length > 0 && (
        <div className="space-y-6">
          {groupedHistory.map((group, groupIdx) => (
            <div key={groupIdx}>
              {/* Date header */}
              <div className="text-xs font-medium text-muted-foreground mb-3">
                {formatDateHeader(group.date)}
              </div>
              
              {/* Events */}
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-3 bottom-3 w-px bg-border" />
                
                {group.events.map((event, idx) => {
                  const IconComponent = ACTION_ICONS[event.action] || Circle;
                  const colorClass = ACTION_COLORS[event.action] || 'text-muted-foreground border-border bg-muted';
                  const isLast = idx === group.events.length - 1;
                  
                  return (
                    <div 
                      key={event.id} 
                      className={cn(
                        "relative flex gap-3 pb-4",
                        isLast && "pb-0"
                      )}
                    >
                      {/* Icon */}
                      <div className={cn(
                        "relative z-10 flex items-center justify-center",
                        "h-6 w-6 rounded-full border-2",
                        colorClass
                      )}>
                        <IconComponent className="h-3 w-3" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-sm leading-relaxed">{event.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatTime(event.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          
          {/* End marker */}
          <div className="flex items-center gap-3 mt-4">
            <div className="h-3 w-3 rounded-full bg-muted border ml-[5px]" />
            <span className="text-xs text-muted-foreground">Bắt đầu task</span>
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {!isLoading && !error && (!timeline || timeline.length === 0) && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Chưa có lịch sử</p>
          <p className="text-xs">Hoạt động sẽ được ghi nhận tại đây</p>
        </div>
      )}
    </div>
  );
}

export default HistoryTab;
