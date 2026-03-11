/**
 * OTA Operations - Task Board View (Kanban)
 * 
 * Phase 2 UI: Board view with Quick View drawer integration
 * - Group by status (TODO / IN_PROGRESS / REVIEW / DONE / BLOCKED / CANCELLED)
 * - Show overdue count per column
 * - Visual alerts for blocked >48h, high priority, overdue in review
 * - Click task → Open Quick View drawer
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  Play,
  Eye,
  CheckCircle2,
  Pause,
  XCircle,
  Calendar,
  FolderKanban,
  AlertTriangle,
} from "lucide-react";
import { OtaTask, OtaTaskStatus, OtaTaskPriority } from "@/hooks/useOtaOperations";
import { groupTasksByStatus, getDueDateProximity, getBlockedDuration, formatBlockedDuration } from "@/lib/otaOps";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

const STATUS_CONFIG: Record<OtaTaskStatus, { 
  label: string; 
  color: string;
  icon: typeof Clock;
}> = {
  TODO: { label: "Chờ xử lý", color: "bg-muted text-muted-foreground", icon: Clock },
  IN_PROGRESS: { label: "Đang làm", color: "bg-info/10 text-info", icon: Play },
  REVIEW: { label: "Chờ duyệt", color: "bg-primary/10 text-primary", icon: Eye },
  DONE: { label: "Hoàn thành", color: "bg-success/10 text-success", icon: CheckCircle2 },
  BLOCKED: { label: "Bị chặn", color: "bg-destructive/10 text-destructive", icon: Pause },
  CANCELLED: { label: "Đã hủy", color: "bg-muted text-muted-foreground", icon: XCircle },
};

const PRIORITY_CONFIG: Record<OtaTaskPriority, { label: string; color: string; accentBar?: string }> = {
  LOW: { label: "Thấp", color: "bg-muted text-muted-foreground" },
  MEDIUM: { label: "TB", color: "bg-info/10 text-info" },
  HIGH: { label: "Cao", color: "bg-warning/10 text-warning", accentBar: "border-l-orange-500" },
  URGENT: { label: "GẤP", color: "bg-destructive/10 text-destructive", accentBar: "border-l-red-500" },
};

interface TaskCardProps {
  task: OtaTask;
  onClick: (taskId: string) => void;
}

function BoardTaskCard({ task, onClick }: TaskCardProps) {
  const proximity = getDueDateProximity(task.due_date);
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const blockedHours = task.status === 'BLOCKED' ? getBlockedDuration(task) : 0;
  const isLongBlocked = blockedHours > 48;
  
  const handleClick = (e: React.MouseEvent) => {
    // Cmd/Ctrl+Click → Open in new tab
    if (e.metaKey || e.ctrlKey) {
      window.open(`/ota-operations/tasks/${task.id}`, '_blank');
      return;
    }
    
    // Regular click → Open drawer
    e.preventDefault();
    onClick(task.id);
  };
  
  // Determine border style
  let borderClass = "border-l-4 ";
  if (isLongBlocked) {
    borderClass += "border-l-red-600";
  } else if (priorityConfig.accentBar) {
    borderClass += priorityConfig.accentBar;
  } else {
    borderClass += "border-l-transparent";
  }
  
  // Determine background alert
  let bgClass = "bg-card hover:bg-accent/50";
  if (task.status === 'REVIEW' && proximity.isOverdue) {
    bgClass = "bg-warning/10 hover:bg-warning/10 border-warning/20";
  }
  
  return (
    <div onClick={handleClick}>
      <Card className={`${borderClass} ${bgClass} transition-colors cursor-pointer mb-2 hover:shadow-md`}>
        <CardContent className="p-3">
          <div className="space-y-2">
            {/* Priority Badge */}
            <div className="flex items-center gap-2">
              <Badge className={`${priorityConfig.color} text-xs px-1.5 py-0.5`} variant="outline">
                {priorityConfig.label}
              </Badge>
              {isLongBlocked && (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              )}
            </div>
            
            {/* Task Title */}
            <h4 className="text-sm font-medium leading-tight line-clamp-2">
              {task.title}
            </h4>
            
            {/* Due Date Proximity */}
            {task.due_date && (
              <div className={`text-xs flex items-center gap-1 ${proximity.color}`}>
                {proximity.isOverdue && <span>🔴</span>}
                {proximity.isToday && <span>🟡</span>}
                <Calendar className="h-3 w-3" />
                <span>{proximity.label}</span>
              </div>
            )}
            
            {/* Blocked Reason */}
            {task.status === 'BLOCKED' && blockedHours > 0 && (
              <div className="text-xs text-destructive font-medium">
                Blocked {formatBlockedDuration(blockedHours)}
              </div>
            )}
            
            {/* Assignee */}
            {task.assignee_name && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Avatar className="h-4 w-4">
                  <AvatarFallback className="text-micro">
                    {task.assignee_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{task.assignee_name}</span>
              </div>
            )}
            
            {/* Project Name */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <FolderKanban className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{task.project_name || 'Unknown'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface BoardColumnProps {
  status: OtaTaskStatus;
  label: string;
  tasks: OtaTask[];
  overdueCount: number;
  onTaskClick: (taskId: string) => void;
}

function BoardColumn({ status, label, tasks, overdueCount, onTaskClick }: BoardColumnProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const hasAlert = overdueCount > 0 || (status === 'BLOCKED' && tasks.length > 0);
  
  return (
    <div className="flex-shrink-0 w-80">
      <Card className={hasAlert ? "border-warning/20 shadow-sm" : ""}>
        <CardHeader className="pb-3 bg-accent/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <CardTitle className="text-sm font-semibold">{label}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {tasks.length}
              </Badge>
              {overdueCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  ⚠️ {overdueCount}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-2 pr-4">
              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Không có task
                </p>
              ) : (
                tasks.map(task => <BoardTaskCard key={task.id} task={task} onClick={onTaskClick} />)
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

interface TaskBoardViewProps {
  tasks: OtaTask[];
  onTaskClick: (taskId: string) => void;
}

export function TaskBoardView({ tasks, onTaskClick }: TaskBoardViewProps) {
  const columns = groupTasksByStatus(tasks);
  
  // Filter out CANCELLED for cleaner view (optional)
  const visibleColumns = columns.filter(col => col.status !== 'CANCELLED');
  
  return (
    <div className="space-y-4">
      {/* Board Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Board View</h3>
          <p className="text-sm text-muted-foreground">
            Kanban board - kéo task để thay đổi trạng thái (coming soon)
          </p>
        </div>
      </div>
      
      {/* Board Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {visibleColumns.map(column => (
          <BoardColumn
            key={column.status}
            status={column.status}
            label={column.label}
            tasks={column.tasks}
            overdueCount={column.overdueCount}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
    </div>
  );
}
