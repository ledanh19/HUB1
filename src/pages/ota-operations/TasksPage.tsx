import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { FilterBar } from "@/components/ui/filter-bar";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { PermissionGate } from "@/components/ui/PermissionGate";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { KPIGrid } from "@/components/kpi/KPIGrid";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  ListChecks,
  Loader2,
  Plus,
  MoreHorizontal,
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Pause,
  Eye,
  User,
  LayoutList,
  LayoutGrid,
  Zap,
  ChevronDown,
} from "lucide-react";
import {
  useOtaTasks,
  useMyOtaTasks,
  useOtaTasksWithAssignees,
  useUpdateOtaTaskStatus,
  OtaTask,
  OtaTaskStatus,
  OtaTaskPriority,
  OtaTaskWithAssignee,
} from "@/hooks/useOtaOperations";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { getOtaTaskStatusVariant, getOtaTaskStatusLabel, getPriorityVariant, getPriorityLabel } from "@/constants/status-config";
import { CreateTaskDialog } from "@/components/ota-operations/CreateTaskDialog";
import { QuickTaskDialog } from "@/components/ota-operations/QuickTaskDialog";
import { TaskBoardDnd } from "@/components/ota-operations/TaskBoardDnd";
import { TaskCalendarView } from "@/components/ota-operations/TaskCalendarView";
import { TaskSidePanel } from "@/components/ota-operations/TaskSidePanel";
import { taskPanelActions } from "@/hooks/useTaskPanel";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar as CalendarIcon } from "lucide-react";
import { isSameDay, startOfDay, isBefore, isToday } from "date-fns";

const formatDate = (date: string | null) => {
  if (!date) return "—";
  return format(new Date(date), "dd/MM/yyyy");
};

export default function TasksPage() {
  const { user, userRole } = useAuth();
  const { hasPageAccess, canUsePage } = useCurrentUserPagePermissions();
  const queryClient = useQueryClient();
  const canAccess = hasPageAccess("/ota-operations/tasks");
  const canPerformActions = canUsePage("/ota-operations/tasks");

  const [searchParams, setSearchParams] = useSearchParams();
  // Support both "project" and "projectId" params for backwards compatibility
  const projectFilter = searchParams.get("project") || searchParams.get("projectId") || "all";
  const shouldOpenCreateDialog = searchParams.get("new") === "true";

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "board" | "calendar">("board");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [overdueFilter, setOverdueFilter] = useState<boolean>(false); // Quick filter for overdue tasks
  const [taskTypeFilter, setTaskTypeFilter] = useState<"all" | "project" | "quick">("all"); // Quick/Project filter
  const [createDialogOpen, setCreateDialogOpen] = useState(shouldOpenCreateDialog);
  const [quickTaskDialogOpen, setQuickTaskDialogOpen] = useState(false);
  const [calendarDateFilter, setCalendarDateFilter] = useState<Date | null>(null);

  // Task Side Panel - use Zustand store
  const handleTaskClick = (taskId: string) => {
    taskPanelActions.open(taskId);
  };

  // Handle dialog close - clear "new" param from URL
  const handleCreateDialogChange = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open && shouldOpenCreateDialog) {
      // Remove the "new" param from URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("new");
      setSearchParams(newParams, { replace: true });
    }
  };

  // Determine if user is OTA_STAFF (should only see own tasks)
  // NOTE: ota_staff can only see their own tasks via RPC
  // admin/super_admin/ota_lead can see all tasks
  const isOtaStaff = (userRole as string) === 'ota_staff';
  const isLeadOrAdmin = ['ota_lead', 'admin', 'super_admin'].includes(userRole as string);

  // Use new hook with assignee names for Lead/Admin
  const { data: tasksWithAssignees, isLoading: loadingWithAssignees, error: errorWithAssignees } = useOtaTasksWithAssignees(
    isLeadOrAdmin ? (projectFilter !== "all" ? { projectId: projectFilter } : undefined) : undefined
  );

  // Use regular hook for staff (my tasks)
  const { data: allTasks, isLoading: loadingAll, error: errorAll } = useOtaTasks(
    projectFilter !== "all" ? { projectId: projectFilter } : undefined
  );
  const { data: myTasks, isLoading: loadingMy, error: errorMy } = useMyOtaTasks();

  // For staff, filter to only their tasks
  const tasks = useMemo(() => {
    if (isOtaStaff) {
      return myTasks || [];
    }
    // Lead/Admin: Prefer tasks with assignees if available
    if (isLeadOrAdmin && tasksWithAssignees && tasksWithAssignees.length > 0) {
      return tasksWithAssignees;
    }
    // Fallback to all tasks
    return allTasks || [];
  }, [isOtaStaff, isLeadOrAdmin, myTasks, allTasks, tasksWithAssignees]);

  const isLoading = isOtaStaff ? loadingMy : (loadingWithAssignees || loadingAll);
  const error = isOtaStaff ? errorMy : (errorWithAssignees || errorAll);

  const updateStatusMutation = useUpdateOtaTaskStatus();

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.project_name || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;

    // Task type filter: All / Project Tasks / Quick Tasks
    const matchesTaskType =
      taskTypeFilter === "all" ||
      (taskTypeFilter === "quick" && task.is_quick_task === true) ||
      (taskTypeFilter === "project" && task.is_quick_task !== true);

    // Calendar date filter
    const matchesDate = !calendarDateFilter ||
      (task.due_date && isSameDay(startOfDay(new Date(task.due_date)), startOfDay(calendarDateFilter)));

    // Overdue quick filter
    const matchesOverdue = !overdueFilter || (
      task.status !== "DONE" &&
      task.status !== "CANCELLED" &&
      task.due_date &&
      isBefore(new Date(task.due_date), new Date()) &&
      !isToday(new Date(task.due_date))
    );

    return matchesSearch && matchesStatus && matchesPriority && matchesDate && matchesOverdue && matchesTaskType;
  });

  const { page, pageSize, setPage, setPageSize, paginatedData, totalPages, displayedCount, totalCount } =
    useTablePagination(filteredTasks, { defaultPageSize: 10, resetDeps: [searchTerm, statusFilter, priorityFilter, overdueFilter, taskTypeFilter, calendarDateFilter] });

  // Stats
  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === "TODO").length,
    inProgress: tasks.filter(t => t.status === "IN_PROGRESS").length,
    review: tasks.filter(t => t.status === "REVIEW").length,
    done: tasks.filter(t => t.status === "DONE").length,
    blocked: tasks.filter(t => t.status === "BLOCKED").length,
    overdue: tasks.filter(t => {
      if (t.status === "DONE" || t.status === "CANCELLED") return false;
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      return isBefore(due, new Date()) && !isToday(due);
    }).length,
  };

  const handleStatusChange = async (taskId: string, newStatus: OtaTaskStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ taskId, newStatus });
      toast.success(`Đã cập nhật trạng thái task`);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
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
        title={isOtaStaff ? "My Tasks" : "All Tasks"}
        subtitle={isOtaStaff ? "Danh sách công việc được giao cho bạn" : "Quản lý tất cả tasks trong OTA Operations"}
      />

      <PageContainer><SectionCard>
        {/* Stats Cards - Show alerts first for Lead/Admin */}
        {isLeadOrAdmin && (stats.overdue > 0 || stats.blocked > 0) && (
          <div className="grid grid-cols-2 gap-4 mb-2">
            <MetricCard
              title="🔥 Trễ hạn"
              value={stats.overdue}
              icon={AlertCircle}
              tone={stats.overdue > 0 ? 'danger' : 'neutral'}
              subtitle={overdueFilter ? 'Click để bỏ lọc' : stats.overdue > 0 ? 'Click để lọc' : undefined}
              className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${overdueFilter
                ? 'border-l-red-600 bg-destructive/10 ring-2 ring-destructive'
                : stats.overdue > 0
                  ? 'border-l-red-500 bg-destructive/10/50'
                  : 'border-l-gray-200'
                }`}
              onClick={() => {
                setOverdueFilter(!overdueFilter);
                setStatusFilter("all");
              }}
            />

            <MetricCard
              title="🚫 Bị chặn"
              value={stats.blocked}
              icon={Pause}
              tone={stats.blocked > 0 ? 'warning' : 'neutral'}
              subtitle={statusFilter === 'BLOCKED' ? 'Click để bỏ lọc' : stats.blocked > 0 ? 'Click để lọc' : undefined}
              className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${statusFilter === 'BLOCKED'
                ? 'border-l-orange-600 bg-warning/10 ring-2 ring-warning'
                : stats.blocked > 0
                  ? 'border-l-orange-500 bg-warning/10/50'
                  : 'border-l-gray-200'
                }`}
              onClick={() => {
                setOverdueFilter(false);
                setStatusFilter(statusFilter === 'BLOCKED' ? 'all' : 'BLOCKED');
              }}
            />
          </div>
        )}

        {/* Regular Stats Cards */}
        <KPIGrid columns={4}>
          <MetricCard title="Tổng Tasks" value={stats.total} icon={ListChecks} />
          <MetricCard title="Chờ xử lý" value={stats.todo} icon={Clock} />
          <MetricCard title="Đang làm" value={stats.inProgress} icon={Play} tone="info" />
          <MetricCard title="Chờ duyệt" value={stats.review} icon={Eye} tone="warning" />
          <MetricCard title="Hoàn thành" value={stats.done} icon={CheckCircle2} tone="success" />
        </KPIGrid>

        {/* View Toggle & Actions */}
        <div className="flex items-center justify-between gap-4">
          <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as "list" | "board" | "calendar")}>
            <ToggleGroupItem value="list" aria-label="List view">
              <LayoutList className="h-4 w-4 mr-2" />
              List
            </ToggleGroupItem>
            <ToggleGroupItem value="board" aria-label="Board view">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Board
            </ToggleGroupItem>
            <ToggleGroupItem value="calendar" aria-label="Calendar view">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Calendar
            </ToggleGroupItem>
          </ToggleGroup>

          <PermissionGate
            page="/ota-operations/tasks"
            require="can_use"
            fallback="disable"
            disabledMessage="Bạn cần quyền can_use để tạo task"
          >
            {/* Sprint 2: Create Task Dropdown with Quick Task option */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Tạo Task
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Tạo Task (full)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setQuickTaskDialogOpen(true)}>
                  <Zap className="h-4 w-4 mr-2 text-warning" />
                  Quick Task ⚡
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </PermissionGate>
        </div>

        {/* Filters */}
        <FilterBar
          title="Bộ lọc"
          subtitle="Tìm kiếm và lọc công việc"
          hasActiveFilters={!!(searchTerm || statusFilter !== 'all' || priorityFilter !== 'all' || taskTypeFilter !== 'all' || overdueFilter || calendarDateFilter)}
          onClearFilters={() => { setSearchTerm(''); setStatusFilter('all'); setPriorityFilter('all'); setTaskTypeFilter('all'); setOverdueFilter(false); setCalendarDateFilter(null); }}
        >
          <FilterBar.Field label="Tìm kiếm" colSpan={2}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên task hoặc project..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </FilterBar.Field>

          <FilterBar.Field label="Trạng thái">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="TODO">Chờ xử lý</SelectItem>
                <SelectItem value="IN_PROGRESS">Đang làm</SelectItem>
                <SelectItem value="REVIEW">Chờ duyệt</SelectItem>
                <SelectItem value="DONE">Hoàn thành</SelectItem>
                <SelectItem value="BLOCKED">Bị chặn</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>

          <FilterBar.Field label="Độ ưu tiên">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Độ ưu tiên" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="URGENT">Khẩn cấp</SelectItem>
                <SelectItem value="HIGH">Cao</SelectItem>
                <SelectItem value="MEDIUM">Trung bình</SelectItem>
                <SelectItem value="LOW">Thấp</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>

          <FilterBar.Field label="Loại Task">
            <Select value={taskTypeFilter} onValueChange={(v) => setTaskTypeFilter(v as "all" | "project" | "quick")}>
              <SelectTrigger>
                <SelectValue placeholder="Loại Task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="project">Project Tasks</SelectItem>
                <SelectItem value="quick">⚡ Quick Tasks</SelectItem>
              </SelectContent>
            </Select>
          </FilterBar.Field>
        </FilterBar>

        {/* Create Task Dialog */}
        <CreateTaskDialog
          open={createDialogOpen}
          onOpenChange={handleCreateDialogChange}
          defaultProjectId={projectFilter !== "all" ? projectFilter : undefined}
        />

        {/* Sprint 2: Quick Task Dialog */}
        <QuickTaskDialog
          open={quickTaskDialogOpen}
          onOpenChange={setQuickTaskDialogOpen}
        />

        {/* Board View with Drag & Drop */}
        {viewMode === "board" && !isLoading && !error && (
          <TaskBoardDnd
            tasks={filteredTasks}
            onTaskClick={handleTaskClick}
            onRefresh={() => {
              // Invalidate all task-related queries to trigger refetch
              queryClient.invalidateQueries({ queryKey: ['ota-tasks'] });
              queryClient.invalidateQueries({ queryKey: ['ota-my-tasks'] });
              queryClient.invalidateQueries({ queryKey: ['ota-tasks-with-assignees'] });
            }}
            userId={user?.id || ''}
          />
        )}

        {/* Calendar View with Click-to-Filter */}
        {viewMode === "calendar" && !isLoading && !error && (
          <Card>
            <CardContent className="p-4">
              <TaskCalendarView
                tasks={tasks}
                onTaskClick={handleTaskClick}
                onDateFilter={setCalendarDateFilter}
              />
            </CardContent>
          </Card>
        )}

        {/* List View (Table) */}
        {viewMode === "list" && (
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="flex items-center justify-center py-12 text-destructive">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Lỗi tải dữ liệu: {(error as Error).message}
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ListChecks className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Không có task nào</p>
                  <p className="text-sm">
                    {searchTerm || statusFilter !== "all" || priorityFilter !== "all"
                      ? "Thử thay đổi bộ lọc"
                      : isOtaStaff ? "Bạn chưa được giao task nào" : "Chưa có task trong hệ thống"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Task</TableHead>
                      <TableHead className="w-[180px]">Project</TableHead>
                      {!isOtaStaff && <TableHead className="w-[150px]">Assignee</TableHead>}
                      <TableHead className="w-[120px]">Độ ưu tiên</TableHead>
                      <TableHead className="w-[120px]">Trạng thái</TableHead>
                      <TableHead className="w-[110px]">Deadline</TableHead>
                      <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((task) => (
                      <TableRow
                        key={task.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleTaskClick(task.id)}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{task.title}</p>
                            {task.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {task.description}
                              </p>
                            )}
                          </div>
                          {task.tags && task.tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {task.tags.slice(0, 3).map((tag, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{task.project_name}</p>
                            <p className="text-xs text-muted-foreground">{task.property_name}</p>
                          </div>
                        </TableCell>
                        {!isOtaStaff && (
                          <TableCell>
                            {(task as OtaTaskWithAssignee).assignee_name ? (
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                </div>
                                <span className="text-sm">{(task as OtaTaskWithAssignee).assignee_name}</span>
                              </div>
                            ) : task.assignee_email ? (
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                </div>
                                <span className="text-sm text-muted-foreground">{task.assignee_email}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">Chưa giao</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <StatusBadge variant={getPriorityVariant(task.priority) as any}>
                            {getPriorityLabel(task.priority)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge variant={getOtaTaskStatusVariant(task.status) as any}>
                            {getOtaTaskStatusLabel(task.status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          <span className={task.due_date && new Date(task.due_date) < new Date() && task.status !== 'DONE' ? 'text-destructive font-medium' : ''}>
                            {formatDate(task.due_date)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {canPerformActions ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleTaskClick(task.id)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Xem chi tiết
                                </DropdownMenuItem>
                                {task.status === "TODO" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(task.id, "IN_PROGRESS")}>
                                    <Play className="h-4 w-4 mr-2" />
                                    Bắt đầu làm
                                  </DropdownMenuItem>
                                )}
                                {task.status === "IN_PROGRESS" && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleStatusChange(task.id, "REVIEW")}>
                                      <ArrowRight className="h-4 w-4 mr-2" />
                                      Gửi duyệt
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusChange(task.id, "BLOCKED")}>
                                      <Pause className="h-4 w-4 mr-2" />
                                      Đánh dấu bị chặn
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {task.status === "REVIEW" && !isOtaStaff && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleStatusChange(task.id, "DONE")}>
                                      <CheckCircle2 className="h-4 w-4 mr-2" />
                                      Duyệt hoàn thành
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleStatusChange(task.id, "IN_PROGRESS")}>
                                      <ArrowRight className="h-4 w-4 mr-2" />
                                      Yêu cầu chỉnh sửa
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {task.status === "BLOCKED" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(task.id, "IN_PROGRESS")}>
                                    <Play className="h-4 w-4 mr-2" />
                                    Tiếp tục làm
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <Button variant="ghost" size="sm" disabled className="opacity-50">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Bạn không có quyền can_use cho trang này</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {filteredTasks.length > 0 && (
                <DataTablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  displayedItems={displayedCount}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  itemLabel="task"
                />
              )}
            </CardContent>
          </Card>
        )}
      </SectionCard></PageContainer>

      {/* Task Side Panel (Trello-style) */}
      <TaskSidePanel />
    </>
  );
}
