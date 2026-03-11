/**
 * TaskCard - Trello-style Task Card for OTA Operations Board
 * 
 * Design Principles:
 * - Cover image from first image evidence (like Trello)
 * - Smooth hover transitions
 * - Max 4 lucide icons: Calendar, Paperclip, MessageSquare, MoreHorizontal
 * - Urgency shown via border-left + chip
 * - Typography hierarchy: title > hint > meta
 * - Hover actions minimal and contextual
 */

import { useState, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Lock, MessageSquare, Paperclip, Calendar, CheckCircle2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isTomorrow, differenceInDays, parseISO, isBefore, startOfDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  OtaTaskStatus,
  OtaTaskPriority,
  OtaProjectRole,
  OtaWorkType,
  OtaTaskClassification,
  WORK_TYPE_CONFIG,
  CLASSIFICATION_CONFIG,
  canDragTask,
} from '@/lib/otaOps';
import { URGENCY, TYPOGRAPHY, ICON_SIZE, COMPLEXITY } from '@/lib/ui-tokens';
import { TaskCardActions } from './TaskCardActions';

// ============================================================
// TYPES
// ============================================================

export interface TaskCardData {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: OtaTaskStatus;
  priority: OtaTaskPriority;
  due_date: string | null;
  project_name?: string;
  assignee_name?: string;
  // Extended fields for card intelligence
  work_type?: OtaWorkType | null;
  evidence_count?: number;
  comment_count?: number;
  // Trello-style: cover image URL (from first image evidence)
  cover_image_url?: string | null;
  // Evidence approval stats
  approved_evidence_count?: number;
  pending_evidence_count?: number; // New: for Lead to see tasks needing review
  // Sprint 1: Classification & Issue Tag
  classification?: OtaTaskClassification | null;
  issue_tag?: string | null;
  // Sprint 2: Quick Task flag
  is_quick_task?: boolean | null;
  // Phase 2 Todo: checklist progress
  todo_count?: number;
  todo_done_count?: number;
}

export interface TaskCardProps {
  task: TaskCardData;
  onTaskClick: (taskId: string) => void;
  isDragging?: boolean;
  projectRole: OtaProjectRole | null;
  userId: string;
  // Phase 2: Inline actions callbacks
  onUploadClick?: (taskId: string) => void;
  onCommentClick?: (taskId: string) => void;
  onRefresh?: () => void;
}

// ============================================================
// URGENCY HELPERS (Clean - no emoji)
// ============================================================

type UrgencyLevel = 'overdue' | 'today' | 'soon' | 'normal';

function getUrgencyLevel(dueDate: string | null): UrgencyLevel {
  if (!dueDate) return 'normal';

  const now = new Date();
  const todayStart = startOfDay(now);
  const due = parseISO(dueDate);
  const dueStart = startOfDay(due);

  if (isBefore(dueStart, todayStart)) return 'overdue';
  if (isToday(due)) return 'today';
  
  const daysDiff = differenceInDays(dueStart, todayStart);
  if (daysDiff <= 2) return 'soon';

  return 'normal';
}

// ============================================================
// COMPLEXITY HELPERS (Clean)
// ============================================================

type ComplexityLevel = 'light' | 'medium' | 'heavy';

function getComplexityLevel(evidenceCount: number): ComplexityLevel {
  if (evidenceCount >= 4) return 'heavy';
  if (evidenceCount >= 2) return 'medium';
  return 'light';
}

function ComplexityIndicator({ level }: { level: ComplexityLevel }) {
  const config = COMPLEXITY[level];
  
  return (
    <div className="flex items-center gap-0.5" title={`Độ phức tạp: ${config.label}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'w-1.5 h-1.5 rounded-sm',
            i <= config.filled ? 'bg-muted' : 'bg-muted'
          )}
        />
      ))}
    </div>
  );
}

// ============================================================
// PURPOSE HINT HELPER
// ============================================================

function getPurposeHint(description: string | null): string {
  if (!description) return '';
  
  const cleaned = description
    .replace(/[#*_`~[\]]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + '...';
}

// ============================================================
// DUE DATE FORMATTER
// ============================================================

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return '';
  
  const due = parseISO(dueDate);
  
  if (isToday(due)) return 'Hôm nay';
  if (isTomorrow(due)) return 'Ngày mai';
  
  return format(due, 'dd/MM', { locale: vi });
}

// ============================================================
// WORK TYPE PILL (Clean, no emoji)
// ============================================================

function WorkTypePill({ workType }: { workType: OtaWorkType | null | undefined }) {
  if (!workType) return null;
  
  const config = WORK_TYPE_CONFIG[workType];
  if (!config) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-micro font-medium',
        config.badgeColor
      )}
    >
      {config.labelVi}
    </span>
  );
}

// ============================================================
// CLASSIFICATION PILL (Sprint 1)
// ============================================================

function ClassificationPill({ classification }: { classification: OtaTaskClassification | null | undefined }) {
  if (!classification) return null;
  
  const config = CLASSIFICATION_CONFIG[classification];
  if (!config) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-micro font-medium border',
        config.badgeColor
      )}
      title={config.description}
    >
      {config.icon} {config.labelVi}
    </span>
  );
}

// ============================================================
// URGENCY CHIP (Clean, no emoji)
// ============================================================

function UrgencyChip({ level }: { level: UrgencyLevel }) {
  if (level === 'normal') return null;
  
  const config = URGENCY[level];
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-micro font-medium',
        config.chip
      )}
    >
      {config.chipLabel}
    </span>
  );
}

// ============================================================
// TASK CARD COMPONENT
// ============================================================

export function TaskCard({
  task,
  onTaskClick,
  isDragging,
  projectRole,
  userId,
  onUploadClick,
  onCommentClick,
  onRefresh,
}: TaskCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const isProjectMember = !!projectRole;
  const isDraggable = canDragTask(projectRole, userId, task as any, isProjectMember);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
    disabled: !isDraggable,
  });

  // Smoother transform animation like Trello
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
  };

  const urgencyLevel = getUrgencyLevel(task.due_date);
  const complexityLevel = getComplexityLevel(task.evidence_count || 0);
  const purposeHint = getPurposeHint(task.description);
  const formattedDueDate = formatDueDate(task.due_date);
  const hasCoverImage = task.cover_image_url && task.cover_image_url.length > 0;
  const hasApprovedEvidence = (task.approved_evidence_count || 0) > 0;
  const isDone = task.status === 'DONE';

  const handleClick = (e: React.MouseEvent) => {
    if (isSortableDragging) return;
    
    if (e.metaKey || e.ctrlKey) {
      window.open(`/ota-operations/tasks/${task.id}`, '_blank');
    } else {
      onTaskClick(task.id);
    }
  };

  const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        // Prevent layout shift - transform only, no layout change
        willChange: 'transform, box-shadow',
      }}
      className={cn(
        'bg-white rounded-lg overflow-hidden',
        // Smooth transition for shadow only (no transform transition to avoid layout shift)
        'transition-shadow duration-200',
        // Urgency border-left
        urgencyLevel !== 'normal' && URGENCY[urgencyLevel].border,
        // Base border
        'border border-border',
        // Draggable states
        isDraggable && 'cursor-grab active:cursor-grabbing',
        !isDraggable && 'opacity-70 cursor-not-allowed',
        // Hover: shadow only, NO translate/scale to prevent layout shift
        !isDragging && !isSortableDragging && 'hover:shadow-lg hover:border-border',
        // Drag state - transform applied via DnD, just add visual feedback
        (isDragging || isSortableDragging) && 'shadow-2xl opacity-95 ring-2 ring-primary/30 z-50',
        // Done state
        isDone && 'border-success/20 bg-success/10/30'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...attributes}
      {...listeners}
    >
      {/* Cover Image - Trello style */}
      {hasCoverImage && (
        <div 
          className={cn(
            "relative w-full h-32 bg-muted overflow-hidden",
            !imageLoaded && "animate-pulse"
          )}
        >
          <img
            src={task.cover_image_url!}
            alt=""
            className={cn(
              "w-full h-full object-cover transition-opacity duration-300",
              imageLoaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
          />
          {/* Overlay gradient for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      )}

      {/* Header Row: Classification + Work Type + Project + Urgency + Lock */}
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Sprint 2: Quick Task Badge with text */}
          {task.is_quick_task && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-micro font-medium bg-warning/10 text-warning border border-warning/20" title="Quick Task từ Ops Bucket">
              <Zap className="h-3 w-3" />
              Quick
            </span>
          )}
          <ClassificationPill classification={task.classification} />
          <WorkTypePill workType={task.work_type} />
          <span className="text-micro text-muted-foreground truncate">
            {task.project_name || 'No Project'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <UrgencyChip level={urgencyLevel} />
          {isDone && hasApprovedEvidence && (
            <CheckCircle2 className={cn(ICON_SIZE.xs, 'text-success')} />
          )}
          {!isDraggable && (
            <Lock className={cn(ICON_SIZE.xs, 'text-muted-foreground')} />
          )}
        </div>
      </div>

      {/* Body: Title + Purpose */}
      <div
        className="px-3 py-1.5 cursor-pointer"
        onClick={handleClick}
      >
        <h3 className={cn(
          TYPOGRAPHY.cardTitle, 
          'line-clamp-2 hover:text-primary transition-colors',
          isDone && 'text-success'
        )}>
          {task.title}
        </h3>
        {purposeHint && (
          <p className={cn(TYPOGRAPHY.cardHint, 'mt-1 line-clamp-1')}>
            {purposeHint}
          </p>
        )}
      </div>

      {/* Meta Row: Complexity + Evidence + Comments + Todo + Pending */}
      <div className="px-3 py-1.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <ComplexityIndicator level={complexityLevel} />
        
        <div className="flex items-center gap-1" title="Kết quả">
          <Paperclip className={ICON_SIZE.xs} />
          <span>{task.evidence_count || 0}</span>
          {(task.evidence_count || 0) === 0 && task.status !== 'DONE' && (
            <span className="text-warning text-micro font-medium">cần</span>
          )}
        </div>

        <div className="flex items-center gap-1" title="Bình luận">
          <MessageSquare className={ICON_SIZE.xs} />
          <span>{task.comment_count || 0}</span>
        </div>
        
        {/* Todo progress badge */}
        {(task.todo_count ?? 0) > 0 && (
          <div 
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-medium",
              task.todo_done_count === task.todo_count 
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
            )}
            title="Việc cần làm"
          >
            <CheckCircle2 className="h-3 w-3" />
            {task.todo_done_count || 0}/{task.todo_count}
          </div>
        )}
        
        {/* Pending evidence badge - for Lead/Admin to see tasks needing review */}
        {(task.pending_evidence_count ?? 0) > 0 && task.status !== 'DONE' && (
          <div 
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-medium bg-warning/10 text-warning border border-warning/20"
            title="Minh chứng chờ duyệt"
          >
            ⏳ {task.pending_evidence_count} chờ duyệt
          </div>
        )}
      </div>

      {/* Footer: Assignee + Due Date */}
      <div className="px-3 pb-2.5 pt-1.5 flex items-center justify-between border-t border-border">
        <div className="flex items-center gap-1.5">
          {task.assignee_name ? (
            <>
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-micro bg-muted text-muted-foreground">
                  {getInitials(task.assignee_name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground truncate max-w-[90px]">
                {task.assignee_name}
              </span>
            </>
          ) : (
            /* Sprint 2: Unassigned task warning badge */
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium border border-warning/20">
              ⚠️ Chưa gán
            </span>
          )}
        </div>

        {formattedDueDate && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs px-1.5 py-0.5 rounded',
              urgencyLevel === 'overdue' && 'bg-destructive/10 text-destructive font-medium',
              urgencyLevel === 'today' && 'bg-warning/10 text-warning font-medium',
              urgencyLevel === 'soon' && 'bg-warning/10 text-warning',
              urgencyLevel === 'normal' && 'text-muted-foreground'
            )}
          >
            <Calendar className={ICON_SIZE.xs} />
            <span>{formattedDueDate}</span>
          </div>
        )}
      </div>

      {/* Hover Action Bar - Trello style fade in */}
      <div 
        className={cn(
          "px-3 pb-2.5 border-t border-border pt-2 transition-all duration-200",
          isHovered && !isDragging && !isSortableDragging 
            ? "opacity-100 max-h-20" 
            : "opacity-0 max-h-0 overflow-hidden py-0 border-t-0"
        )}
      >
        <TaskCardActions
          task={task as any}
          projectRole={projectRole}
          onUploadClick={() => onUploadClick?.(task.id)}
          onCommentClick={() => onCommentClick?.(task.id)}
          onRefresh={() => onRefresh?.()}
        />
      </div>
    </div>
  );
}

export default TaskCard;
