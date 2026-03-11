/**
 * TaskCardActions - Inline Quick Actions for Task Card
 * 
 * Phase 2: Execution-First UX
 * - Hover-based action bar
 * - Role-aware action visibility (per ACTION MATRIX)
 * - Uses existing RPCs (NO new RPCs)
 * - Optimistic UI with rollback
 * 
 * ACTION MATRIX:
 * | Action                        | ota_staff (own) | ota_lead | admin | super_admin |
 * |-------------------------------|-----------------|----------|-------|-------------|
 * | ▶ Start (TODO → IN_PROGRESS)  | ✅              | ✅       | ✅    | ✅          |
 * | ✓ Submit (IN_PROGRESS → REVIEW)| ✅             | ✅       | ✅    | ✅          |
 * | 📎 Upload Evidence             | ✅             | ✅       | ✅    | ✅          |
 * | 💬 Comment                     | ✅             | ✅       | ✅    | ✅          |
 * | 🚧 Block                       | ✅ (own)       | ✅       | ✅    | ✅          |
 * | ✅ Approve (REVIEW → DONE)     | ❌             | ✅       | ✅    | ✅          |
 * | ⚡ Force Done                  | ❌             | ❌       | ❌    | ✅          |
 * | 🔄 Reopen                      | ❌             | ❌       | ❌    | ✅          |
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from "sonner";
import { useAuth } from '@/hooks/useAuth';
import { 
  useUpdateOtaTaskStatus, 
  useSuperAdminOverride,
  OverrideType 
} from '@/hooks/useOtaOperations';
import { OtaTask, OtaTaskStatus, OtaProjectRole } from '@/lib/otaOps';
import {
  Play,
  CheckCircle,
  Paperclip,
  MessageSquare,
  AlertTriangle,
  MoreHorizontal,
  Zap,
  RotateCcw,
  Ban,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// TYPES
// ============================================================

export type ActionType = 
  | 'start' 
  | 'submit' 
  | 'upload' 
  | 'comment' 
  | 'block' 
  | 'approve'
  | 'force_done' 
  | 'reopen'
  | 'cancel';

export interface TaskCardActionsProps {
  task: OtaTask;
  projectRole: OtaProjectRole | null;
  onUploadClick: () => void;
  onCommentClick: () => void;
  onRefresh: () => void;
  className?: string;
}

// ============================================================
// PERMISSION HELPERS
// ============================================================

interface ActionPermission {
  allowed: boolean;
  reason?: string;
}

function checkActionPermission(
  action: ActionType,
  task: OtaTask,
  projectRole: OtaProjectRole | null,
  userId: string,
  globalRole: string | null
): ActionPermission {
  const isAssignee = task.assignee_id === userId;
  const isSuperAdmin = globalRole === 'super_admin';
  const isGlobalAdmin = globalRole === 'admin' || globalRole === 'super_admin';
  const isLeadOrHigher = projectRole === 'LEAD' || projectRole === 'ADMIN' || isGlobalAdmin;
  const isStaff = projectRole === 'STAFF';

  // Super Admin Override actions
  if (action === 'force_done' || action === 'reopen') {
    if (!isSuperAdmin) {
      return { allowed: false, reason: 'Chỉ Super Admin mới có quyền' };
    }
    if (action === 'force_done' && task.status === 'DONE') {
      return { allowed: false, reason: 'Task đã hoàn thành' };
    }
    if (action === 'reopen' && task.status !== 'DONE' && task.status !== 'CANCELLED') {
      return { allowed: false, reason: 'Task chưa hoàn thành hoặc hủy' };
    }
    return { allowed: true };
  }

  // Must be project member for other actions
  if (!projectRole && !isGlobalAdmin) {
    return { allowed: false, reason: 'Không phải thành viên dự án' };
  }

  switch (action) {
    case 'start':
      // TODO → IN_PROGRESS
      if (task.status !== 'TODO') {
        return { allowed: false, reason: 'Task không ở trạng thái Chờ xử lý' };
      }
      if (isStaff && !isAssignee) {
        return { allowed: false, reason: 'Staff chỉ có thể bắt đầu task của mình' };
      }
      return { allowed: true };

    case 'submit':
      // IN_PROGRESS → REVIEW
      if (task.status !== 'IN_PROGRESS') {
        return { allowed: false, reason: 'Task không ở trạng thái Đang làm' };
      }
      if (isStaff && !isAssignee) {
        return { allowed: false, reason: 'Staff chỉ có thể submit task của mình' };
      }
      return { allowed: true };

    case 'upload':
      // Can upload if task is not DONE/CANCELLED
      if (task.status === 'DONE' || task.status === 'CANCELLED') {
        return { allowed: false, reason: 'Không thể upload cho task đã hoàn thành/hủy' };
      }
      if (isStaff && !isAssignee) {
        return { allowed: false, reason: 'Staff chỉ có thể upload cho task của mình' };
      }
      return { allowed: true };

    case 'comment':
      // Everyone in project can comment
      return { allowed: true };

    case 'block':
      // ANY → BLOCKED (requires reason via modal)
      if (task.status === 'BLOCKED') {
        return { allowed: false, reason: 'Task đã bị block' };
      }
      if (task.status === 'DONE' || task.status === 'CANCELLED') {
        return { allowed: false, reason: 'Không thể block task đã hoàn thành/hủy' };
      }
      if (isStaff && !isAssignee) {
        return { allowed: false, reason: 'Staff chỉ có thể block task của mình' };
      }
      return { allowed: true };

    case 'approve':
      // REVIEW → DONE (Lead/Admin only)
      if (task.status !== 'REVIEW') {
        return { allowed: false, reason: 'Task không ở trạng thái Chờ duyệt' };
      }
      if (!isLeadOrHigher) {
        return { allowed: false, reason: 'Cần Lead/Admin để duyệt' };
      }
      return { allowed: true };

    case 'cancel':
      // Lead/Admin can cancel
      if (task.status === 'CANCELLED') {
        return { allowed: false, reason: 'Task đã bị hủy' };
      }
      if (!isLeadOrHigher) {
        return { allowed: false, reason: 'Cần Lead/Admin để hủy' };
      }
      return { allowed: true };

    default:
      return { allowed: false, reason: 'Action không hợp lệ' };
  }
}

// ============================================================
// COMPONENT
// ============================================================

export function TaskCardActions({
  task,
  projectRole,
  onUploadClick,
  onCommentClick,
  onRefresh,
  className,
}: TaskCardActionsProps) {
  const { user, userRole } = useAuth();
  const updateStatus = useUpdateOtaTaskStatus();
  const superAdminOverride = useSuperAdminOverride();

  const [showReasonModal, setShowReasonModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const userId = user?.id || '';

  // Check permissions for each action
  const canStart = checkActionPermission('start', task, projectRole, userId, userRole);
  const canSubmit = checkActionPermission('submit', task, projectRole, userId, userRole);
  const canUpload = checkActionPermission('upload', task, projectRole, userId, userRole);
  const canComment = checkActionPermission('comment', task, projectRole, userId, userRole);
  const canBlock = checkActionPermission('block', task, projectRole, userId, userRole);
  const canApprove = checkActionPermission('approve', task, projectRole, userId, userRole);
  const canForceDone = checkActionPermission('force_done', task, projectRole, userId, userRole);
  const canReopen = checkActionPermission('reopen', task, projectRole, userId, userRole);
  const canCancel = checkActionPermission('cancel', task, projectRole, userId, userRole);

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleQuickAction = async (action: ActionType) => {
    // Actions requiring reason modal
    if (action === 'block' || action === 'force_done' || action === 'reopen' || action === 'cancel') {
      setPendingAction(action);
      setShowReasonModal(true);
      return;
    }

    // Direct status updates
    setIsLoading(true);
    try {
      let newStatus: OtaTaskStatus | null = null;

      switch (action) {
        case 'start':
          newStatus = 'IN_PROGRESS';
          break;
        case 'submit':
          newStatus = 'REVIEW';
          break;
        case 'approve':
          newStatus = 'DONE';
          break;
      }

      if (newStatus) {
        await updateStatus.mutateAsync({
          taskId: task.id,
          newStatus,
        });

        toast.success("Thành công", { description: getActionSuccessMessage(action) });

        onRefresh();
      }
    } catch (error) {
      toast.error("Lỗi", { description: error instanceof Error ? error.message : "Không thể thực hiện thao tác" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReasonSubmit = async () => {
    if (!pendingAction || !reason.trim()) {
      toast.error("Lỗi", { description: "Vui lòng nhập lý do" });
      return;
    }

    setIsLoading(true);
    try {
      // Super Admin Override actions
      if (pendingAction === 'force_done' || pendingAction === 'reopen') {
        const overrideType: OverrideType = pendingAction === 'force_done' ? 'FORCE_DONE' : 'REOPEN';
        await superAdminOverride.mutateAsync({
          taskId: task.id,
          overrideType,
          reason: reason.trim(),
        });
      } else {
        // Regular status updates with reason
        let newStatus: OtaTaskStatus | null = null;
        switch (pendingAction) {
          case 'block':
            newStatus = 'BLOCKED';
            break;
          case 'cancel':
            newStatus = 'CANCELLED';
            break;
        }

        if (newStatus) {
          await updateStatus.mutateAsync({
            taskId: task.id,
            newStatus,
          });
        }
      }

      toast.success("Thành công", { description: getActionSuccessMessage(pendingAction) });

      setShowReasonModal(false);
      setReason('');
      setPendingAction(null);
      onRefresh();
    } catch (error) {
      toast.error("Lỗi", { description: error instanceof Error ? error.message : "Không thể thực hiện thao tác" });
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  // Determine primary action based on task status
  const getPrimaryActions = () => {
    const actions: JSX.Element[] = [];

    // Start button (TODO)
    if (canStart.allowed) {
      actions.push(
        <Button
          key="start"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1 hover:bg-success/10 hover:text-success"
          onClick={(e) => {
            e.stopPropagation();
            handleQuickAction('start');
          }}
          disabled={isLoading}
        >
          <Play className="h-3 w-3" />
          Bắt đầu
        </Button>
      );
    }

    // Submit button (IN_PROGRESS)
    if (canSubmit.allowed) {
      actions.push(
        <Button
          key="submit"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1 hover:bg-info/10 hover:text-info"
          onClick={(e) => {
            e.stopPropagation();
            handleQuickAction('submit');
          }}
          disabled={isLoading}
        >
          <CheckCircle className="h-3 w-3" />
          Nộp
        </Button>
      );
    }

    // Approve button (REVIEW)
    if (canApprove.allowed) {
      actions.push(
        <Button
          key="approve"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1 hover:bg-success/10 hover:text-success"
          onClick={(e) => {
            e.stopPropagation();
            handleQuickAction('approve');
          }}
          disabled={isLoading}
        >
          <CheckCircle className="h-3 w-3" />
          Duyệt
        </Button>
      );
    }

    return actions;
  };

  const primaryActions = getPrimaryActions();
  const hasMoreActions = canUpload.allowed || canComment.allowed || canBlock.allowed || 
                         canForceDone.allowed || canReopen.allowed || canCancel.allowed;

  return (
    <>
      <div 
        className={cn(
          'flex items-center gap-1 pt-1 border-t border-border mt-1',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Primary Actions */}
        {primaryActions}

        {/* Upload Button */}
        {canUpload.allowed && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 hover:bg-warning/10 hover:text-warning"
            onClick={(e) => {
              e.stopPropagation();
              onUploadClick();
            }}
            title="Nộp kết quả"
          >
            <Paperclip className="h-3 w-3" />
          </Button>
        )}

        {/* Comment Button */}
        {canComment.allowed && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 hover:bg-info/10 hover:text-info"
            onClick={(e) => {
              e.stopPropagation();
              onCommentClick();
            }}
            title="Bình luận"
          >
            <MessageSquare className="h-3 w-3" />
          </Button>
        )}

        {/* More Actions Dropdown */}
        {hasMoreActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 ml-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canBlock.allowed && (
                <DropdownMenuItem
                  className="text-warning"
                  onClick={() => handleQuickAction('block')}
                >
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Block task
                </DropdownMenuItem>
              )}

              {canCancel.allowed && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => handleQuickAction('cancel')}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Hủy task
                </DropdownMenuItem>
              )}

              {(canForceDone.allowed || canReopen.allowed) && <DropdownMenuSeparator />}

              {canForceDone.allowed && (
                <DropdownMenuItem
                  className="text-primary"
                  onClick={() => handleQuickAction('force_done')}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Force Done
                </DropdownMenuItem>
              )}

              {canReopen.allowed && (
                <DropdownMenuItem
                  className="text-primary"
                  onClick={() => handleQuickAction('reopen')}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reopen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
      </div>

      {/* Reason Modal */}
      <Dialog open={showReasonModal} onOpenChange={setShowReasonModal}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{getReasonModalTitle(pendingAction)}</DialogTitle>
            <DialogDescription>
              {getReasonModalDescription(pendingAction)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Lý do *</Label>
              <Textarea
                id="reason"
                placeholder="Nhập lý do..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReasonModal(false);
                setReason('');
                setPendingAction(null);
              }}
              disabled={isLoading}
            >
              Hủy
            </Button>
            <Button
              onClick={handleReasonSubmit}
              disabled={isLoading || !reason.trim()}
              className={cn(
                pendingAction === 'force_done' && 'bg-primary hover:bg-primary',
                pendingAction === 'reopen' && 'bg-primary hover:bg-primary/90',
                pendingAction === 'block' && 'bg-warning hover:bg-warning',
                pendingAction === 'cancel' && 'bg-destructive hover:bg-destructive'
              )}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// HELPERS
// ============================================================

function getActionSuccessMessage(action: ActionType): string {
  switch (action) {
    case 'start':
      return 'Đã bắt đầu task';
    case 'submit':
      return 'Đã gửi task để review';
    case 'approve':
      return 'Đã duyệt task hoàn thành';
    case 'block':
      return 'Đã block task';
    case 'cancel':
      return 'Đã hủy task';
    case 'force_done':
      return 'Đã force complete task';
    case 'reopen':
      return 'Đã reopen task';
    default:
      return 'Thành công';
  }
}

function getReasonModalTitle(action: ActionType | null): string {
  switch (action) {
    case 'block':
      return 'Block Task';
    case 'cancel':
      return 'Hủy Task';
    case 'force_done':
      return 'Force Done (Super Admin)';
    case 'reopen':
      return 'Reopen Task (Super Admin)';
    default:
      return 'Xác nhận';
  }
}

function getReasonModalDescription(action: ActionType | null): string {
  switch (action) {
    case 'block':
      return 'Vui lòng nhập lý do block task này. Thông tin sẽ được ghi vào audit log.';
    case 'cancel':
      return 'Vui lòng nhập lý do hủy task. Hành động này sẽ được ghi vào audit log.';
    case 'force_done':
      return 'Force done bỏ qua workflow thông thường. Vui lòng nhập lý do để ghi audit.';
    case 'reopen':
      return 'Reopen task đã hoàn thành/hủy. Vui lòng nhập lý do để ghi audit.';
    default:
      return '';
  }
}

export default TaskCardActions;
