/**
 * TaskQuickViewDrawer - Quick view panel for tasks
 * 
 * Opens from right side (400px width) when user clicks task
 * Provides fast preview without full page navigation
 * Click "View Full Details" to navigate to TaskDetailPage
 */

import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink,
  Calendar,
  User,
  FolderKanban,
  Clock,
  AlertCircle,
  FileText,
  Loader2,
} from "lucide-react";
import {
  useOtaTaskDetail,
  useUpdateOtaTaskStatus,
  useUpdateOtaTaskPriority,
  useUpdateOtaTaskAssignee,
  OtaTaskStatus,
  OtaTaskPriority,
} from "@/hooks/useOtaOperations";
import { useAuth } from "@/hooks/useAuth";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// TYPES & CONSTANTS
// ============================================================

interface TaskQuickViewDrawerProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_CONFIG: Record<OtaTaskStatus, { label: string; color: string }> = {
  TODO: { label: "Chờ xử lý", color: "bg-muted text-muted-foreground" },
  IN_PROGRESS: { label: "Đang làm", color: "bg-info/10 text-info" },
  REVIEW: { label: "Chờ duyệt", color: "bg-primary/10 text-primary" },
  DONE: { label: "Hoàn thành", color: "bg-success/10 text-success" },
  BLOCKED: { label: "Bị chặn", color: "bg-destructive/10 text-destructive" },
  CANCELLED: { label: "Đã hủy", color: "bg-muted text-muted-foreground" },
};

const PRIORITY_CONFIG: Record<OtaTaskPriority, { label: string; color: string }> = {
  LOW: { label: "Thấp", color: "bg-muted text-muted-foreground" },
  MEDIUM: { label: "Trung bình", color: "bg-info/10 text-info" },
  HIGH: { label: "Cao", color: "bg-warning/10 text-warning" },
  URGENT: { label: "Khẩn cấp", color: "bg-destructive/10 text-destructive" },
};

const formatDateShort = (date: string | null) => {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd/MM/yyyy");
  } catch {
    return "—";
  }
};

// ============================================================
// COMPONENT
// ============================================================

export function TaskQuickViewDrawer({
  taskId,
  isOpen,
  onClose,
}: TaskQuickViewDrawerProps) {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  
  const { data: taskResponse, isLoading, error } = useOtaTaskDetail(taskId || undefined);
  
  // Extract data from response
  const task = taskResponse?.task;
  const project = taskResponse?.project;
  const evidence = taskResponse?.evidence || [];

  const updateStatusMutation = useUpdateOtaTaskStatus();
  const updatePriorityMutation = useUpdateOtaTaskPriority();
  const updateAssigneeMutation = useUpdateOtaTaskAssignee();

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleStatusChange = async (newStatus: OtaTaskStatus) => {
    if (!task) return;

    // If BLOCKED or CANCELLED, open full page for reason entry
    if (newStatus === "BLOCKED" || newStatus === "CANCELLED") {
      onClose();
      navigate(`/ota-operations/tasks/${task.id}?action=change-status&status=${newStatus}`);
      return;
    }

    try {
      await updateStatusMutation.mutateAsync({
        taskId: task.id,
        newStatus: newStatus,
      });
      toast.success(`Status changed to ${STATUS_CONFIG[newStatus].label}`);
    } catch (err) {
      toast.error("Failed to update status");
      console.error(err);
    }
  };

  const handlePriorityChange = async (newPriority: OtaTaskPriority) => {
    if (!task) return;

    try {
      await updatePriorityMutation.mutateAsync({
        taskId: task.id,
        newPriority: newPriority,
      });
      toast.success(`Priority changed to ${PRIORITY_CONFIG[newPriority].label}`);
    } catch (err) {
      toast.error("Failed to update priority");
      console.error(err);
    }
  };

  const handleViewFullDetails = () => {
    if (!task) return;
    onClose();
    navigate(`/ota-operations/tasks/${task.id}`);
  };

  // ============================================================
  // PERMISSIONS
  // ============================================================

  const canEditTask = () => {
    if (!task) return false;
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const isAssignee = task.assignee?.id === user?.id;
    return isAdmin || isAssignee;
  };

  // Assignee name from nested object
  const assigneeName = task?.assignee?.full_name || task?.assignee?.email;

  // ============================================================
  // RENDER
  // ============================================================

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className="w-[400px] sm:w-[540px] overflow-y-auto"
        onPointerDownOutside={onClose}
      >
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-sm text-muted-foreground">Failed to load task</p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {/* Task Content */}
        {task && (
          <div className="space-y-6">
            {/* Header */}
            <SheetHeader>
              <SheetTitle className="text-xl leading-tight">
                {task.title}
              </SheetTitle>
            </SheetHeader>

            {/* Status & Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Status
                </label>
                <Select
                  value={task.status}
                  onValueChange={(value) => handleStatusChange(value as OtaTaskStatus)}
                  disabled={!canEditTask()}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                      <SelectItem key={status} value={status}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", config.color.replace('bg-', 'bg-').split(' ')[0])} />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Priority
                </label>
                <Select
                  value={task.priority}
                  onValueChange={(value) => handlePriorityChange(value as OtaTaskPriority)}
                  disabled={!canEditTask()}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_CONFIG).map(([priority, config]) => (
                      <SelectItem key={priority} value={priority}>
                        <Badge className={config.color} variant="outline">
                          {config.label}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Project & Assignee Info */}
            <div className="space-y-3">
              {/* Project */}
              {project && (
                <div className="flex items-start gap-3">
                  <FolderKanban className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Project</p>
                    <Link
                      to={`/ota-operations/projects/${project.id}`}
                      className="text-sm font-medium hover:underline"
                      onClick={onClose}
                    >
                      {project.name}
                    </Link>
                  </div>
                </div>
              )}

              {/* Assignee */}
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Assignee</p>
                  {assigneeName ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${assigneeName}`} />
                        <AvatarFallback>
                          {assigneeName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{assigneeName}</span>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs text-warning">
                      Unowned
                    </Badge>
                  )}
                </div>
              </div>

              {/* Due Date */}
              {task.due_date && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm">{formatDateShort(task.due_date)}</span>
                      {isPast(new Date(task.due_date)) && task.status !== "DONE" && (
                        <Badge variant="destructive" className="text-xs">
                          Overdue
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Created Date */}
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <span className="text-sm">{formatDateShort(task.created_at)}</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Description Preview */}
            {task.description && (
              <div>
                <h4 className="text-sm font-medium mb-2">Description</h4>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {task.description}
                </p>
                {task.description.length > 150 && (
                  <Button
                    variant="link"
                    className="text-xs p-0 h-auto mt-1"
                    onClick={handleViewFullDetails}
                  >
                    Read more
                  </Button>
                )}
              </div>
            )}

            {/* Evidence Preview */}
            {evidence.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Evidence ({evidence.length})
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {evidence.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      className="border rounded p-2 hover:bg-accent transition-colors cursor-pointer"
                      onClick={handleViewFullDetails}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground mb-1" />
                      <p className="text-xs truncate">{ev.file_name}</p>
                    </div>
                  ))}
                  {evidence.length > 3 && (
                    <div
                      className="border rounded p-2 flex items-center justify-center cursor-pointer hover:bg-accent transition-colors"
                      onClick={handleViewFullDetails}
                    >
                      <p className="text-xs font-medium text-muted-foreground">
                        +{evidence.length - 3} more
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Action Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleViewFullDetails}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Full Details
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}