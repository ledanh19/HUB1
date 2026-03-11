/**
 * OTA Operations - My Tasks Page
 * 
 * Phase 2 UI: Action-based task buckets with Quick View drawer
 * - ⚡ QUICK TASKS HÔM NAY (Ops Bucket - separate group)
 * - 🔥 CẦN LÀM NGAY (overdue + today)
 * - ⏳ ĐANG CHỜ REVIEW
 * - 🚫 BỊ BLOCK
 * - 🧠 CÓ THỂ LÀM SAU (upcoming)
 * 
 * Click task → Opens Quick View drawer
 * Cmd+Click → Opens full TaskDetailPage in new tab
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Flame,
  Clock,
  Ban,
  Brain,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Calendar,
  FolderKanban,
  Zap,
  Plus,
} from "lucide-react";
import { useMyOtaTasks, OtaTask, OtaTaskPriority } from "@/hooks/useOtaOperations";
import { calculateTaskBuckets, getDueDateProximity } from "@/lib/otaOps";
import { TaskSidePanel } from "@/components/ota-operations/TaskSidePanel";
import { QuickTaskDialog } from "@/components/ota-operations/QuickTaskDialog";
import { taskPanelActions } from "@/hooks/useTaskPanel";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { getPriorityVariant, getPriorityLabel } from "@/constants/status-config";

interface TaskCardProps {
  task: OtaTask;
  onClick: (taskId: string) => void;
}

function TaskCard({ task, onClick }: TaskCardProps) {
  const proximity = getDueDateProximity(task.due_date);

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

  return (
    <div onClick={handleClick}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="space-y-2">
            {/* Priority & Status */}
            <div className="flex items-center gap-2">
              <StatusBadge variant={getPriorityVariant(task.priority) as any}>
                {getPriorityLabel(task.priority)}
              </StatusBadge>
              {proximity.isOverdue && (
                <span className="text-destructive text-xs font-medium flex items-center gap-1">
                  🔴 {proximity.label}
                </span>
              )}
              {proximity.isToday && (
                <span className="text-warning text-xs font-medium flex items-center gap-1">
                  🟡 {proximity.label}
                </span>
              )}
            </div>

            {/* Task Title */}
            <h3 className="font-medium text-sm">{task.title}</h3>

            {/* Project & Due Date */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <FolderKanban className="h-3 w-3" />
                <span>{task.project_name || 'Unknown Project'}</span>
              </div>
              {task.due_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(task.due_date), 'dd/MM/yyyy', { locale: vi })}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface BucketSectionProps {
  title: string;
  icon: typeof Flame;
  count: number;
  tasks: OtaTask[];
  color: string;
  defaultExpanded?: boolean;
  onTaskClick: (taskId: string) => void;
}

function BucketSection({ title, icon: Icon, count, tasks, color, defaultExpanded = false, onTaskClick }: BucketSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${color}`} />
          <h2 className="text-lg font-semibold">{title}</h2>
          <Badge variant="secondary" className="ml-2">{count}</Badge>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="space-y-2 pl-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Không có task nào</p>
          ) : (
            tasks.map(task => <TaskCard key={task.id} task={task} onClick={onTaskClick} />)
          )}
        </div>
      )}
    </div>
  );
}

export default function MyTasksPage() {
  const { hasPageAccess } = useCurrentUserPagePermissions();
  const canAccess = hasPageAccess("/ota-operations/tasks");

  const { data: myTasks, isLoading, error } = useMyOtaTasks();

  // Quick Task Dialog state
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);

  // Task Side Panel - use Zustand store
  const handleTaskClick = (taskId: string) => {
    taskPanelActions.open(taskId);
  };

  // Calculate buckets
  const buckets = myTasks ? calculateTaskBuckets(myTasks) : {
    urgent: [],
    review: [],
    blocked: [],
    later: [],
    quickTasksToday: [],
  };

  if (!canAccess) {
    return (
      <>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold">Không có quyền truy cập</h2>
            <p className="text-muted-foreground">Bạn không có quyền xem trang này.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="My Tasks"
        subtitle="Công việc của tôi - ưu tiên theo hành động"
        actions={
          <Button onClick={() => setQuickTaskOpen(true)} className="gap-2">
            <Zap className="h-4 w-4" />
            Quick Task
          </Button>
        }
      />

      <PageContainer><SectionCard>
        {/* Stats Row - 5 cards including Quick Tasks */}
        <KPIGrid columns={4}>
          <MetricCard title="⚡ Quick Today" value={buckets.quickTasksToday.length} tone="warning" className="border-l-4 border-l-yellow-500" />
          <MetricCard title="🔥 Cần làm ngay" value={buckets.urgent.length} tone="danger" className="border-l-4 border-l-red-500" />
          <MetricCard title="⏳ Chờ review" value={buckets.review.length} valueClassName="text-primary" className="border-l-4 border-l-purple-500" />
          <MetricCard title="🚫 Bị block" value={buckets.blocked.length} tone="warning" className="border-l-4 border-l-orange-500" />
          <MetricCard title="🧠 Có thể sau" value={buckets.later.length} className="border-l-4 border-l-gray-500" />
        </KPIGrid>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-2 p-4 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Lỗi tải dữ liệu: {(error as Error).message}</span>
            </CardContent>
          </Card>
        )}

        {/* Task Buckets */}
        {!isLoading && !error && (
          <div className="space-y-4">
            {/* ⚡ QUICK TASKS HÔM NAY - First section, always visible */}
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-warning" />
                  <h2 className="text-lg font-semibold text-warning">⚡ QUICK TASKS HÔM NAY</h2>
                  <Badge variant="secondary" className="bg-warning/10 text-warning">
                    {buckets.quickTasksToday.length}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuickTaskOpen(true)}
                  className="border-warning/20 text-warning hover:bg-warning/10"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Thêm
                </Button>
              </div>
              {buckets.quickTasksToday.length === 0 ? (
                <p className="text-sm text-warning/70 py-4 text-center">
                  Chưa có quick task nào hôm nay. Nhấn "Thêm" để tạo task nhanh!
                </p>
              ) : (
                <div className="space-y-2">
                  {buckets.quickTasksToday.map(task => (
                    <TaskCard key={task.id} task={task} onClick={handleTaskClick} />
                  ))}
                </div>
              )}
            </div>

            <Separator className="my-4" />

            {/* Assigned Tasks Header */}
            <div className="flex items-center gap-2 text-muted-foreground">
              <FolderKanban className="h-4 w-4" />
              <span className="text-sm font-medium uppercase tracking-wide">Tasks từ Projects</span>
            </div>

            {/* 🔥 CẦN LÀM NGAY - Always expanded */}
            <BucketSection
              title="🔥 CẦN LÀM NGAY"
              icon={Flame}
              count={buckets.urgent.length}
              tasks={buckets.urgent}
              color="text-destructive"
              defaultExpanded={true}
              onTaskClick={handleTaskClick}
            />

            <Separator />

            {/* ⏳ ĐANG CHỜ REVIEW */}
            <BucketSection
              title="⏳ ĐANG CHỜ REVIEW"
              icon={Clock}
              count={buckets.review.length}
              tasks={buckets.review}
              color="text-primary"
              defaultExpanded={buckets.review.length > 0}
              onTaskClick={handleTaskClick}
            />

            <Separator />

            {/* 🚫 BỊ BLOCK */}
            <BucketSection
              title="🚫 BỊ BLOCK"
              icon={Ban}
              count={buckets.blocked.length}
              tasks={buckets.blocked}
              color="text-warning"
              defaultExpanded={buckets.blocked.length > 0}
              onTaskClick={handleTaskClick}
            />

            <Separator />

            {/* 🧠 CÓ THỂ LÀM SAU */}
            <BucketSection
              title="🧠 CÓ THỂ LÀM SAU"
              icon={Brain}
              count={buckets.later.length}
              tasks={buckets.later}
              color="text-muted-foreground"
              defaultExpanded={false}
              onTaskClick={handleTaskClick}
            />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && myTasks && myTasks.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">Chưa có task nào được giao</p>
              <p className="text-sm">Bạn sẽ thấy công việc được giao tại đây</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setQuickTaskOpen(true)}
              >
                <Zap className="h-4 w-4 mr-2" />
                Tạo Quick Task
              </Button>
            </CardContent>
          </Card>
        )}
      </SectionCard></PageContainer>

      {/* Task Side Panel (Trello-style) */}
      <TaskSidePanel />

      {/* Quick Task Dialog */}
      <QuickTaskDialog
        open={quickTaskOpen}
        onOpenChange={setQuickTaskOpen}
      />
    </>
  );
}
