/**
 * PanelHeader - Task title, status, deadline, actions
 * 
 * DISPLAYS:
 * - Task title (with booking context if available)
 * - Status dropdown (change status inline)
 * - Priority dropdown (Sprint 2 - inline edit)
 * - Deadline with urgency indicator + date picker
 * - Action buttons: Complete, Reassign, More
 * 
 * DONE GUARD:
 * - Cannot set task DONE unless >=1 evidence is APPROVED
 * - Shows toast + auto-switches to Evidence tab if blocked
 * 
 * SPRINT 2:
 * - Quick Task badge + Promote action
 * - Inline priority change
 * - Inline due date change
 */

import React, { useState } from 'react';
import { Calendar, MoreHorizontal, UserPlus, CheckCircle, Clock, AlertTriangle, Loader2, Zap, ArrowRightCircle, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OtaTask, OtaTaskStatus, OtaTaskPriority, CLASSIFICATION_CONFIG, OtaTaskClassification } from '@/lib/otaOps';
import { useTaskEvidence, useUpdateOtaTaskStatus, useUpdateOtaTaskPriority, useUpdateOtaTaskDueDate, useUpdateTaskClassification } from '@/hooks/useOtaOperations';
import { taskPanelActions, PANEL_TABS } from '@/hooks/useTaskPanel';
import { PromoteTaskDialog } from '../PromoteTaskDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Status config
const STATUS_CONFIG: Record<OtaTaskStatus, { label: string; color: string }> = {
  TODO: { label: 'Chờ xử lý', color: 'text-muted-foreground' },
  IN_PROGRESS: { label: 'Đang làm', color: 'text-info' },
  REVIEW: { label: 'Chờ duyệt', color: 'text-primary' },
  DONE: { label: 'Hoàn thành', color: 'text-success' },
  BLOCKED: { label: 'Bị chặn', color: 'text-destructive' },
  CANCELLED: { label: 'Đã hủy', color: 'text-muted-foreground' },
};

// Priority config for inline edit
const PRIORITY_CONFIG: Record<OtaTaskPriority, { label: string; color: string; bgColor: string }> = {
  LOW: { label: 'Thấp', color: 'text-muted-foreground', bgColor: 'bg-muted dark:bg-muted' },
  MEDIUM: { label: 'Trung bình', color: 'text-info', bgColor: 'bg-info/10 dark:bg-info' },
  HIGH: { label: 'Cao', color: 'text-warning', bgColor: 'bg-warning/10 dark:bg-warning' },
  URGENT: { label: 'Khẩn cấp', color: 'text-destructive', bgColor: 'bg-destructive/10 dark:bg-destructive' },
};

interface PanelHeaderProps {
  task: OtaTask;
  onReassign?: () => void;
  readOnly?: boolean; // Sprint C: disable editing for completed projects
}

// Format deadline relative to now
function formatDeadline(deadline: string): { text: string; urgency: 'normal' | 'warning' | 'critical' } {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffMs < 0) {
    const overdue = Math.abs(diffHours);
    if (overdue < 24) {
      return { text: `Quá hạn ${Math.round(overdue)}h`, urgency: 'critical' };
    }
    return { text: `Quá hạn ${Math.round(Math.abs(diffDays))} ngày`, urgency: 'critical' };
  }

  if (diffHours < 2) {
    return { text: `${Math.round(diffHours * 60)} phút nữa`, urgency: 'critical' };
  }

  if (diffHours < 24) {
    return { text: `${Math.round(diffHours)}h nữa`, urgency: 'warning' };
  }

  if (diffDays < 2) {
    return { text: 'Ngày mai', urgency: 'warning' };
  }

  return {
    text: deadlineDate.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }),
    urgency: 'normal'
  };
}

export function PanelHeader({ task, onReassign, readOnly = false }: PanelHeaderProps) {
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const deadline = task.due_date ? formatDeadline(task.due_date) : { text: 'Chưa đặt', urgency: 'normal' as const };
  const statusConfig = STATUS_CONFIG[task.status];
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.MEDIUM;

  // Fetch evidence to check if can complete
  const { data: evidenceData } = useTaskEvidence(task.id);
  const approvedCount = evidenceData?.summary?.approved || 0;

  // Sprint 2: Quick Task check
  const isQuickTask = task.is_quick_task ?? false;

  // ============================================================
  // DONE GUARD: Sync with DB logic (require_evidence + min_evidence_count)
  // EXECUTION: require_evidence = true, min_evidence_count >= 1
  // PREP/AUTO/OPS: require_evidence = false, min_evidence_count = 0
  // ============================================================
  const requireEvidence = task.require_evidence ?? (task.classification === 'EXECUTION' || !task.classification);
  const minEvidenceCount = task.min_evidence_count ?? (requireEvidence ? 1 : 0);

  // Can complete if:
  // - Not already DONE/CANCELLED
  // - AND (require_evidence = false OR approvedCount >= minEvidenceCount)
  const evidenceSatisfied = !requireEvidence || approvedCount >= minEvidenceCount;
  const canComplete = task.status !== 'DONE' && task.status !== 'CANCELLED' && evidenceSatisfied;
  const isAlreadyDone = task.status === 'DONE';

  // State for classification change dialog
  const [showClassificationDialog, setShowClassificationDialog] = useState(false);

  // Mutations
  const updateStatusMutation = useUpdateOtaTaskStatus();
  const updatePriorityMutation = useUpdateOtaTaskPriority();
  const updateDueDateMutation = useUpdateOtaTaskDueDate();
  const updateClassificationMutation = useUpdateTaskClassification();

  // Handle classification change to bypass evidence requirement
  const handleChangeToOps = async () => {
    try {
      await updateClassificationMutation.mutateAsync({
        taskId: task.id,
        newClassification: 'OPS',
        reason: 'User changed from EXECUTION to bypass evidence requirement',
      });
      toast.success('Đã đổi phân loại sang OPS - Không cần minh chứng', {
        description: 'Bây giờ có thể hoàn thành task',
      });
      setShowClassificationDialog(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  // Handle status change with DONE guard + actionable EVIDENCE_REQUIRED dialog
  const handleStatusChange = async (newStatus: OtaTaskStatus) => {
    // DONE GUARD: Check evidence based on require_evidence flag
    if (newStatus === 'DONE' && requireEvidence && approvedCount < minEvidenceCount) {
      // Show actionable toast with 2 options
      toast.error(`Cần ít nhất ${minEvidenceCount} minh chứng được duyệt để hoàn thành task`, {
        description: `Hiện có ${approvedCount} minh chứng được duyệt. Chọn hành động:`,
        duration: 10000, // Show longer
        action: {
          label: 'Tải minh chứng',
          onClick: () => taskPanelActions.setTab(PANEL_TABS.EVIDENCE),
        },
      });

      // For Quick Tasks, also offer to change classification
      if (isQuickTask) {
        setShowClassificationDialog(true);
      } else {
        taskPanelActions.setTab(PANEL_TABS.EVIDENCE);
      }
      return;
    }

    try {
      await updateStatusMutation.mutateAsync({
        taskId: task.id,
        newStatus,
      });
      toast.success(`Đã chuyển sang "${STATUS_CONFIG[newStatus].label}"`);
    } catch (err) {
      const errorMsg = (err as Error).message;
      // Handle EVIDENCE_REQUIRED from backend (backup)
      if (errorMsg.includes('EVIDENCE_REQUIRED') || errorMsg.includes('approved evidence')) {
        if (isQuickTask) {
          setShowClassificationDialog(true);
        } else {
          taskPanelActions.setTab(PANEL_TABS.EVIDENCE);
        }
      }
      toast.error(`Không thể cập nhật`, { description: errorMsg });
    }
  };

  // Handle priority change
  const handlePriorityChange = async (newPriority: OtaTaskPriority) => {
    try {
      await updatePriorityMutation.mutateAsync({
        taskId: task.id,
        newPriority,
      });
      toast.success(`Đã đổi ưu tiên sang "${PRIORITY_CONFIG[newPriority].label}"`);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  // Handle due date change
  const handleDueDateChange = async (newDate: string) => {
    try {
      await updateDueDateMutation.mutateAsync({
        taskId: task.id,
        dueDate: newDate || null,
      });
      setShowDatePicker(false);
      toast.success(newDate ? 'Đã cập nhật deadline' : 'Đã xóa deadline');
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  // Handle complete button
  const handleComplete = async () => {
    // DONE GUARD: Check evidence based on require_evidence flag
    if (requireEvidence && approvedCount < minEvidenceCount) {
      toast.error(`Cần ít nhất ${minEvidenceCount} minh chứng được duyệt để hoàn thành task`, {
        description: `Hiện có ${approvedCount} minh chứng được duyệt`,
      });
      taskPanelActions.setTab(PANEL_TABS.EVIDENCE);
      return;
    }

    await handleStatusChange('DONE');
  };

  return (
    <div className="space-y-4">
      {/* Title - Trello style big title */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Sprint 2: Quick Task Badge */}
          {isQuickTask && (
            <Badge variant="outline" className="mb-2 bg-warning/10 text-warning border-warning/20">
              <Zap className="h-3 w-3 mr-1" />
              Quick Task
            </Badge>
          )}

          <h2 id="modal-title" className="text-xl font-semibold leading-tight text-foreground">
            {task.title}
          </h2>

          {/* Project badge + ID */}
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            {task.project_name && (
              <span className="text-info hover:underline cursor-pointer">
                {task.project_name}
              </span>
            )}
            <span className="text-xs">#{task.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      {/* Status & Priority & Deadline & Actions - compact row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status dropdown - Trello style */}
        <Select
          value={task.status}
          onValueChange={(v) => handleStatusChange(v as OtaTaskStatus)}
          disabled={updateStatusMutation.isPending || readOnly}
        >
          <SelectTrigger className={cn(
            "h-8 w-auto px-3 border-0 font-medium rounded-md",
            task.status === 'TODO' && "bg-muted text-muted-foreground dark:text-muted-foreground",
            task.status === 'IN_PROGRESS' && "bg-info/10 dark:bg-info text-info dark:text-info",
            task.status === 'REVIEW' && "bg-primary/10 dark:bg-primary text-primary dark:text-primary",
            task.status === 'DONE' && "bg-success/10 dark:bg-success text-success dark:text-success",
            task.status === 'BLOCKED' && "bg-destructive/10 dark:bg-destructive text-destructive dark:text-destructive",
            task.status === 'CANCELLED' && "bg-muted dark:bg-muted text-muted-foreground"
          )}>
            <SelectValue>
              <span className="text-sm">
                {updateStatusMutation.isPending && (
                  <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                )}
                {statusConfig.label}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => {
              const isDone = key === 'DONE';
              // Only disable DONE if requireEvidence=true AND approvedCount < minEvidenceCount
              const isDisabled = isDone && requireEvidence && approvedCount < minEvidenceCount;

              return (
                <SelectItem
                  key={key}
                  value={key}
                  disabled={isDisabled}
                  className={cn(isDisabled && "opacity-50")}
                >
                  <span className={config.color}>{config.label}</span>
                  {isDone && requireEvidence && approvedCount < minEvidenceCount && (
                    <span className="text-xs text-muted-foreground ml-1">(cần {minEvidenceCount} evidence)</span>
                  )}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Priority dropdown - Sprint 2 inline edit */}
        <Select
          value={task.priority}
          onValueChange={(v) => handlePriorityChange(v as OtaTaskPriority)}
          disabled={updatePriorityMutation.isPending || readOnly}
        >
          <SelectTrigger className={cn(
            "h-8 w-auto px-3 border-0 font-medium rounded-md",
            priorityConfig.bgColor
          )}>
            <SelectValue>
              <span className={cn("text-sm flex items-center gap-1", priorityConfig.color)}>
                {updatePriorityMutation.isPending && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                <Flag className="h-3 w-3" />
                {priorityConfig.label}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <span className={cn("flex items-center gap-2", config.color)}>
                  <Flag className="h-3 w-3" />
                  {config.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Deadline badge with inline date picker - Sprint 2 */}
        {!readOnly && (
          <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md cursor-pointer hover:ring-2 hover:ring-offset-1 transition-all",
                  deadline.urgency === 'critical' && "bg-destructive/10 text-destructive dark:text-destructive hover:ring-destructive",
                  deadline.urgency === 'warning' && "bg-warning/10 text-warning hover:ring-warning",
                  deadline.urgency === 'normal' && "bg-muted dark:bg-muted text-muted-foreground hover:ring-border"
                )}
              >
                {updateDueDateMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : deadline.urgency === 'critical' ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : deadline.urgency === 'warning' ? (
                  <Clock className="h-3.5 w-3.5" />
                ) : (
                  <Calendar className="h-3.5 w-3.5" />
                )}
                <span>{deadline.text}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              <div className="space-y-2">
                <p className="text-sm font-medium">Đổi deadline</p>
                <Input
                  type="datetime-local"
                  defaultValue={task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : ''}
                  onChange={(e) => handleDueDateChange(e.target.value ? new Date(e.target.value).toISOString() : '')}
                  className="w-full"
                />
                {task.due_date && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive"
                    onClick={() => handleDueDateChange('')}
                  >
                    Xóa deadline
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Read-only deadline badge */}
        {readOnly && task.due_date && (
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md",
              deadline.urgency === 'critical' && "bg-destructive/10 text-destructive dark:text-destructive",
              deadline.urgency === 'warning' && "bg-warning/10 text-warning",
              deadline.urgency === 'normal' && "bg-muted dark:bg-muted text-muted-foreground"
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            {deadline.text}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions - compact - hidden in readOnly mode */}
        {!isAlreadyDone && !readOnly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  onClick={handleComplete}
                  disabled={!canComplete || updateStatusMutation.isPending}
                  className={cn(
                    "h-8 gap-1.5 bg-success hover:bg-success text-white",
                    !canComplete && "opacity-50"
                  )}
                >
                  {updateStatusMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3.5 w-3.5" />
                  )}
                  Hoàn thành
                </Button>
              </span>
            </TooltipTrigger>
            {!canComplete && approvedCount === 0 && (
              <TooltipContent>
                <p>Cần ít nhất 1 minh chứng được duyệt</p>
              </TooltipContent>
            )}
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md hover:bg-muted dark:hover:bg-muted-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Sprint 2: Promote Quick Task action */}
            {isQuickTask && (
              <>
                <DropdownMenuItem onClick={() => setShowPromoteDialog(true)}>
                  <ArrowRightCircle className="h-4 w-4 mr-2" />
                  Chuyển vào Project...
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={onReassign}>
              <UserPlus className="h-4 w-4 mr-2" />
              Gán lại
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleStatusChange('CANCELLED')}
            >
              Hủy task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sprint 2: Promote Task Dialog */}
      <PromoteTaskDialog
        open={showPromoteDialog}
        onOpenChange={setShowPromoteDialog}
        taskId={task.id}
        taskTitle={task.title}
      />

      {/* EVIDENCE_REQUIRED Dialog - Option to change classification */}
      {showClassificationDialog && isQuickTask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-muted rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Cần minh chứng để hoàn thành
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Task phân loại <strong>EXECUTION</strong> yêu cầu ít nhất {minEvidenceCount} minh chứng được duyệt.
              <br /><br />
              Bạn có thể:
            </p>
            <div className="space-y-3">
              <Button
                variant="default"
                className="w-full justify-start gap-2"
                onClick={() => {
                  taskPanelActions.setTab(PANEL_TABS.EVIDENCE);
                  setShowClassificationDialog(false);
                }}
              >
                📎 Tải minh chứng lên
                <span className="text-xs text-muted-foreground ml-auto">Upload file/ảnh</span>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleChangeToOps}
                disabled={updateClassificationMutation.isPending}
              >
                {updateClassificationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>📊</span>
                )}
                Đổi sang OPS (không cần minh chứng)
                <span className="text-xs text-muted-foreground ml-auto">Quick fix</span>
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowClassificationDialog(false)}
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PanelHeader;
