/**
 * TaskBoardDnd - Trello-style Drag & Drop Kanban Board for OTA Operations
 * Features:
 * - Smooth drag & drop with Trello-like animations
 * - PROJECT-BASED RBAC enforcement (STAFF/LEAD/ADMIN from ota_project_members)
 * - Optimistic UI with rollback on error
 * - Status transition modals for BLOCKED/CANCELLED/Revert
 * - Task Card Intelligence: work_type, urgency, evidence/comment counts, cover image
 * - Inline Quick Actions: hover action bar
 * - Context Panel: slide-in panel for task details
 */

import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverEvent,
  MeasuringStrategy,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from "sonner";
import {
  OtaTask,
  OtaTaskStatus,
  OtaProjectRole,
  groupTasksByStatus,
  getDropBehavior,
} from '@/lib/otaOps';
import { useUpdateOtaTaskStatus, useOtaProjectRoles } from '@/hooks/useOtaOperations';
import { StatusTransitionModal } from './StatusTransitionModal';
import { TaskCard } from './TaskCard';
import { taskPanelActions, PANEL_TABS } from '@/hooks/useTaskPanel';
import { 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  Ban, 
  XCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskBoardDndProps {
  tasks: OtaTask[];
  onTaskClick: (taskId: string) => void;
  onRefresh?: () => void;
  userId: string;
}

interface PendingTransition {
  taskId: string;
  fromStatus: OtaTaskStatus;
  toStatus: OtaTaskStatus;
  taskTitle: string;
  requiresConfirm: boolean;
}

export function TaskBoardDnd({
  tasks,
  onTaskClick,
  onRefresh,
  userId,
}: TaskBoardDndProps) {
  const updateTaskStatus = useUpdateOtaTaskStatus();
  
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<OtaTask[]>(tasks);

  // Fetch project roles for all projects in tasks
  const projectIds = useMemo(() => {
    return Array.from(new Set(tasks.map(t => t.project_id)));
  }, [tasks]);

  const { data: projectRoles = {} } = useOtaProjectRoles(projectIds);

  // Update optimistic tasks when props change
  useMemo(() => {
    setOptimisticTasks(tasks);
  }, [tasks]);

  const columns = useMemo(() => {
    return groupTasksByStatus(optimisticTasks);
  }, [optimisticTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Smaller distance for quicker response like Trello
      },
    })
  );

  // Track which column is being hovered during drag
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string);
    // Add slight haptic feedback feel via CSS
    document.body.style.cursor = 'grabbing';
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (over) {
      setActiveColumnId(over.id as string);
    }
  };

  const handleDragCancel = () => {
    setActiveTaskId(null);
    setActiveColumnId(null);
    document.body.style.cursor = '';
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    setActiveColumnId(null);
    document.body.style.cursor = '';

    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const toStatus = over.id as OtaTaskStatus;

    const task = optimisticTasks.find(t => t.id === taskId);
    if (!task) return;

    const fromStatus = task.status;
    if (fromStatus === toStatus) return;

    // Get project role for this task's project
    const projectRole = projectRoles[task.project_id] || null;
    const isProjectMember = !!projectRole;

    // If no project role and no project membership, deny
    if (!isProjectMember) {
      toast.error("Không có quyền", { description: "Bạn không phải thành viên của project này" });
      return;
    }

    // Check permissions (PROJECT-BASED)
    const behavior = getDropBehavior({
      projectRole: projectRole!, // We know it's not null here
      userId,
      task,
      fromStatus,
      toStatus,
      isProjectMember,
    });

    if (!behavior.allowed) {
      toast.error("Không có quyền", { description: behavior.denyMessage || "Bạn không có quyền thực hiện thao tác này" });
      return;
    }

    // If requires reason or confirm, show modal
    if (behavior.requiresReason || behavior.requiresConfirm) {
      setPendingTransition({
        taskId,
        fromStatus,
        toStatus,
        taskTitle: task.title,
        requiresConfirm: behavior.requiresConfirm,
      });
      return;
    }

    // Otherwise, proceed with update
    performStatusUpdate(taskId, fromStatus, toStatus);
  };

  const performStatusUpdate = async (
    taskId: string,
    fromStatus: OtaTaskStatus,
    toStatus: OtaTaskStatus,
    reason?: string
  ) => {
    // Optimistic update
    setOptimisticTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, status: toStatus } : t))
    );

    try {
      await updateTaskStatus.mutateAsync({
        taskId,
        newStatus: toStatus,
      });

      toast.success("Cập nhật thành công", { description: `Task đã chuyển sang ${getStatusLabel(toStatus)}` });
    } catch (error) {
      // Rollback on error
      setOptimisticTasks(prev =>
        prev.map(t => (t.id === taskId ? { ...t, status: fromStatus } : t))
      );

      toast.error("Không thể cập nhật", { description: error instanceof Error ? error.message : "Đã xảy ra lỗi" });
    }
  };

  const handleModalConfirm = (reason: string) => {
    if (!pendingTransition) return;

    const { taskId, fromStatus, toStatus } = pendingTransition;
    setPendingTransition(null);

    performStatusUpdate(taskId, fromStatus, toStatus, reason);
  };

  const handleModalClose = () => {
    setPendingTransition(null);
  };

  // Phase 3: Context Panel handlers - now uses parent's onTaskClick
  const handleTaskClick = useCallback((taskId: string) => {
    // Use the parent's onTaskClick which opens the new TaskSidePanel
    onTaskClick(taskId);
  }, [onTaskClick]);

  const handleUploadClick = useCallback((taskId: string) => {
    // Open side panel on Evidence tab
    taskPanelActions.open(taskId, PANEL_TABS.EVIDENCE);
  }, []);

  const handleCommentClick = useCallback((taskId: string) => {
    // Open side panel on Comments tab
    taskPanelActions.open(taskId, PANEL_TABS.COMMENTS);
  }, []);

  const handleRefresh = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const activeTask = activeTaskId
    ? optimisticTasks.find(t => t.id === activeTaskId)
    : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {columns
            .filter(col => col.status !== 'CANCELLED') // Hide CANCELLED column
            .map(column => (
              <BoardColumn
                key={column.status}
                column={column}
                onTaskClick={handleTaskClick}
                onUploadClick={handleUploadClick}
                onCommentClick={handleCommentClick}
                onRefresh={handleRefresh}
                projectRoles={projectRoles}
                userId={userId}
                isDropTarget={activeColumnId === column.status}
              />
            ))}
        </div>

        <DragOverlay 
          dropAnimation={{
            duration: 200,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          {activeTask && (
            <div className="transform rotate-3 scale-105">
              <TaskCard
                task={activeTask}
                isDragging
                onTaskClick={() => {}}
                projectRole={projectRoles[activeTask.project_id] || null}
                userId={userId}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {pendingTransition && (
        <StatusTransitionModal
          isOpen={!!pendingTransition}
          onClose={handleModalClose}
          onConfirm={handleModalConfirm}
          fromStatus={pendingTransition.fromStatus}
          toStatus={pendingTransition.toStatus}
          taskTitle={pendingTransition.taskTitle}
          requiresConfirm={pendingTransition.requiresConfirm}
        />
      )}
    </>
  );
}

// ============================================================
// BOARD COLUMN
// ============================================================

interface BoardColumnProps {
  column: {
    status: OtaTaskStatus;
    label: string;
    tasks: OtaTask[];
    overdueCount: number;
  };
  onTaskClick: (taskId: string) => void;
  onUploadClick: (taskId: string) => void;
  onCommentClick: (taskId: string) => void;
  onRefresh: () => void;
  projectRoles: Record<string, OtaProjectRole>;
  userId: string;
  isDropTarget?: boolean;
}

function BoardColumn({ 
  column, 
  onTaskClick, 
  onUploadClick, 
  onCommentClick, 
  onRefresh, 
  projectRoles, 
  userId,
  isDropTarget = false,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useSortable({ id: column.status });

  const columnColor = getColumnColor(column.status);
  const columnIcon = getColumnIcon(column.status);
  const showDropHighlight = isDropTarget || isOver;

  return (
    <div ref={setNodeRef} className="flex flex-col h-full">
      <Card className={cn(
        "flex flex-col h-full transition-all duration-200",
        showDropHighlight && "ring-2 ring-primary/50 bg-primary/5"
      )}>
        <CardHeader className="pb-3 px-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {columnIcon}
              <CardTitle className="text-sm font-semibold">
                {column.label}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs px-1.5">
                {column.tasks.length}
              </Badge>
              {column.overdueCount > 0 && (
                <Badge variant="destructive" className="text-xs px-1.5">
                  {column.overdueCount} trễ
                </Badge>
              )}
            </div>
          </div>
          <div className={cn('h-1 w-full rounded-full mt-2', columnColor)} />
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto space-y-2 pt-0 px-2 pb-2">
          <SortableContext
            items={column.tasks.map(t => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {column.tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onTaskClick={onTaskClick}
                onUploadClick={onUploadClick}
                onCommentClick={onCommentClick}
                onRefresh={onRefresh}
                projectRole={projectRoles[task.project_id] || null}
                userId={userId}
              />
            ))}
          </SortableContext>

          {column.tasks.length === 0 && (
            <div className={cn(
              "text-center py-8 text-muted-foreground text-sm rounded-lg border-2 border-dashed transition-colors",
              showDropHighlight ? "border-primary/50 bg-primary/5" : "border-transparent"
            )}>
              {showDropHighlight ? "Thả vào đây" : "Không có task"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// HELPERS
// ============================================================

function getColumnColor(status: OtaTaskStatus): string {
  const colors: Record<OtaTaskStatus, string> = {
    TODO: 'bg-muted-foreground',
    IN_PROGRESS: 'bg-info/100',
    REVIEW: 'bg-warning/100',
    DONE: 'bg-success/100',
    BLOCKED: 'bg-destructive/100',
    CANCELLED: 'bg-muted',
  };
  return colors[status];
}

function getColumnIcon(status: OtaTaskStatus) {
  const icons: Record<OtaTaskStatus, JSX.Element> = {
    TODO: <Clock className="h-4 w-4 text-muted-foreground" />,
    IN_PROGRESS: <Loader2 className="h-4 w-4 text-info" />,
    REVIEW: <AlertCircle className="h-4 w-4 text-warning" />,
    DONE: <CheckCircle2 className="h-4 w-4 text-success" />,
    BLOCKED: <Ban className="h-4 w-4 text-destructive" />,
    CANCELLED: <XCircle className="h-4 w-4 text-muted-foreground" />,
  };
  return icons[status];
}

function getStatusLabel(status: OtaTaskStatus): string {
  const labels: Record<OtaTaskStatus, string> = {
    TODO: 'Chờ xử lý',
    IN_PROGRESS: 'Đang làm',
    REVIEW: 'Chờ duyệt',
    DONE: 'Hoàn thành',
    BLOCKED: 'Bị chặn',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] || status;
}
