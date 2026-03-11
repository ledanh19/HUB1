/**
 * OTA Operations - Project Detail Page
 * 
 * Phase B: Project details with tabs for Overview, Tasks, Members, Inputs, Outputs
 * Lead/Admin can edit project and manage members
 * 
 * @updated 2026-01-10 - Conflict resolved
 */

import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Building2,
  Clock,
  Edit,
  Users,
  ListTodo,
  ChartBar,
  MoreHorizontal,
  CheckCircle,
  AlertCircle,
  Loader2,
  Plus,
  FileInput,
  FileOutput,
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { Header } from '@/components/layout/Header';
import { PageContainer } from '@/components/layout/PageContainer';
import { SectionCard } from '@/components/layout/SectionCard';

import { useOtaProjectDetail, useOtaTasks, useUpdateOtaProject, OtaProjectStatus, OtaTaskStatus } from '@/hooks/useOtaOperations';
import { OtaRoleGate } from '@/components/ui/OtaRoleGate';
import { toast } from "sonner";
import { StatusBadge } from '@/components/ui/status-badge';
import { getOtaProjectStatusVariant, getOtaProjectStatusLabel, getOtaTaskStatusVariant, getOtaTaskStatusLabel, getPriorityVariant, getPriorityLabel } from '@/constants/status-config';

import { ProjectMembersPanel } from '@/components/ota-operations/ProjectMembersPanel';
import { ProjectEditDialog } from '@/components/ota-operations/ProjectEditDialog';
import { TaskQuickViewDrawer } from '@/components/ota-operations/TaskQuickViewDrawer';
import { CreateTaskDialog } from '@/components/ota-operations/CreateTaskDialog';
import { WorkTypeBadge } from '@/components/ota-operations/WorkTypeBadge';
import { ProjectInputsTab } from '@/components/ota-operations/ProjectInputsTab';
import { ProjectOutputsTab } from '@/components/ota-operations/ProjectOutputsTab';
import { ProjectCompletionStatus } from '@/components/ota-operations/ProjectCompletionStatus'; // Sprint C

// ============================================================
// COMPONENTS
// ============================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function TaskProgress({ stats }: { stats: { total: number; done: number; in_progress: number; todo: number; blocked: number; review: number } }) {
  if (stats.total === 0) return null;

  const donePercent = (stats.done / stats.total) * 100;
  const inProgressPercent = (stats.in_progress / stats.total) * 100;
  const reviewPercent = (stats.review / stats.total) * 100;
  const blockedPercent = (stats.blocked / stats.total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Tiến độ task</span>
        <span className="font-medium">{stats.done}/{stats.total} hoàn thành</span>
      </div>
      <div className="h-3 flex rounded-full overflow-hidden bg-muted">
        <div className="bg-success/100" style={{ width: `${donePercent}%` }} title={`Done: ${stats.done}`} />
        <div className="bg-primary/100" style={{ width: `${reviewPercent}%` }} title={`Review: ${stats.review}`} />
        <div className="bg-info/100" style={{ width: `${inProgressPercent}%` }} title={`In Progress: ${stats.in_progress}`} />
        <div className="bg-destructive/100" style={{ width: `${blockedPercent}%` }} title={`Blocked: ${stats.blocked}`} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success/100" /> Done: {stats.done}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-primary/100" /> Review: {stats.review}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-info/100" /> In Progress: {stats.in_progress}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-destructive/100" /> Blocked: {stats.blocked}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-muted-foreground" /> Todo: {stats.todo}
        </span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);

  // Sprint C: HANDOVER task dialog state
  const [createHandoverDialogOpen, setCreateHandoverDialogOpen] = useState(false);

  // Quick View Drawer state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedTaskId(null), 200);
  };

  // Fetch project detail
  const {
    data: projectData,
    isLoading: projectLoading,
    error: projectError
  } = useOtaProjectDetail(projectId);

  // Fetch tasks for this project
  const {
    data: tasks = [],
    isLoading: tasksLoading,
  } = useOtaTasks({ projectId });

  // Mutations
  const updateProject = useUpdateOtaProject();

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleStatusChange = async (newStatus: OtaProjectStatus) => {
    if (!projectId) return;

    try {
      await updateProject.mutateAsync({
        projectId,
        status: newStatus,
      });
      toast.success('Đã cập nhật trạng thái', {
        description: `Project đã chuyển sang ${getOtaProjectStatusLabel(newStatus)}`,
      });
    } catch (err: any) {
      toast.error('Lỗi', {
        description: err.message || 'Không thể cập nhật trạng thái',
      });
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (projectLoading) {
    return (
      <>
        <Header title="Chi tiết dự án" />
        <PageContainer>
          <SectionCard>
            <LoadingSkeleton />
          </SectionCard>
        </PageContainer>
      </>
    );
  }

  if (projectError || !projectData?.success || !projectData.project) {
    return (
      <>
        <Header title="Chi tiết dự án" />
        <PageContainer>
          <SectionCard>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Lỗi tải project</AlertTitle>
              <AlertDescription>
                {projectData?.message || (projectError as Error)?.message || 'Không thể tải thông tin project'}
              </AlertDescription>
            </Alert>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => navigate('/ota-operations/projects')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Quay lại danh sách
            </Button>
          </SectionCard>
        </PageContainer>
      </>
    );
  }

  const { project, task_stats, member_stats } = projectData;

  return (
    <>
      <Header title="Chi tiết dự án" />
      <PageContainer>
        <SectionCard>
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/ota-operations/projects">
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Projects
                    </Link>
                  </Button>
                  <span>/</span>
                  <span className="truncate max-w-xs">{project.name}</span>
                </div>
                <h1 className="text-hero-kpi font-bold tabular-nums tracking-tight flex items-center gap-3">
                  {project.name}
                  <StatusBadge variant={getOtaProjectStatusVariant(project.status) as any}>
                    {getOtaProjectStatusLabel(project.status)}
                  </StatusBadge>
                  {project.work_type && (
                    <WorkTypeBadge workType={project.work_type} />
                  )}
                </h1>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {project.property_name && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {project.property_name}
                    </span>
                  )}
                  {project.due_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Due: {format(new Date(project.due_date), 'dd/MM/yyyy', { locale: vi })}
                    </span>
                  )}
                  {member_stats && (
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {member_stats.active} thành viên
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <OtaRoleGate requireRole={["ota_lead", "admin", "super_admin"]}>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Chỉnh sửa
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={project.status === 'IN_PROGRESS'}
                        onClick={() => handleStatusChange('IN_PROGRESS')}
                      >
                        Bắt đầu dự án
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={project.status === 'ON_HOLD'}
                        onClick={() => handleStatusChange('ON_HOLD')}
                      >
                        Tạm dừng
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={project.status === 'COMPLETED'}
                        onClick={() => handleStatusChange('COMPLETED')}
                      >
                        <CheckCircle className="mr-2 h-4 w-4 text-success" />
                        Hoàn thành
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={project.status === 'ARCHIVED'}
                        onClick={() => handleStatusChange('ARCHIVED')}
                        className="text-destructive"
                      >
                        Lưu trữ
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </OtaRoleGate>
            </div>

            {/* Description */}
            {project.description && (
              <Card>
                <CardContent className="pt-4">
                  <p className="text-muted-foreground whitespace-pre-wrap">{project.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Sprint C: Enhanced Project Completion Indicator with HANDOVER check */}
            {task_stats && (
              <ProjectCompletionStatus
                tasks={tasks}
                taskStats={task_stats}
                projectStatus={project.status}
                onMarkComplete={() => handleStatusChange('COMPLETED')}
                onCreateHandover={() => setCreateHandoverDialogOpen(true)}
              />
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview" className="flex items-center gap-2">
                  <ChartBar className="h-4 w-4" />
                  Tổng quan
                </TabsTrigger>
                <TabsTrigger value="tasks" className="flex items-center gap-2">
                  <ListTodo className="h-4 w-4" />
                  Tasks ({task_stats?.total || 0})
                </TabsTrigger>
                <TabsTrigger value="members" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Thành viên ({member_stats?.active || 0})
                </TabsTrigger>
                <TabsTrigger value="inputs" className="flex items-center gap-2">
                  <FileInput className="h-4 w-4" />
                  Đầu vào
                </TabsTrigger>
                <TabsTrigger value="outputs" className="flex items-center gap-2">
                  <FileOutput className="h-4 w-4" />
                  Đầu ra
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Task Stats Card */}
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Tiến độ Tasks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {task_stats && (
                        <TaskProgress stats={task_stats} />
                      )}

                      {task_stats?.overdue && task_stats.overdue > 0 && (
                        <Alert variant="destructive" className="mt-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Cảnh báo</AlertTitle>
                          <AlertDescription>
                            Có {task_stats.overdue} task quá hạn cần được xử lý
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>

                  {/* Info Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Thông tin</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ngày bắt đầu</span>
                        <span>{project.start_date ? format(new Date(project.start_date), 'dd/MM/yyyy') : '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deadline</span>
                        <span>{project.due_date ? format(new Date(project.due_date), 'dd/MM/yyyy') : '-'}</span>
                      </div>
                      {project.completed_at && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Hoàn thành</span>
                          <span>{format(new Date(project.completed_at), 'dd/MM/yyyy')}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tạo lúc</span>
                        <span>{format(new Date(project.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Tasks */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Tasks gần đây</CardTitle>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/ota-operations/tasks?projectId=${projectId}`}>
                        Xem tất cả
                      </Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {tasksLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : tasks.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">Chưa có task nào</p>
                    ) : (
                      <div className="space-y-2">
                        {tasks.slice(0, 5).map((task) => (
                          <Link
                            key={task.id}
                            to={`/ota-operations/tasks/${task.id}`}
                            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <StatusBadge variant={getOtaTaskStatusVariant(task.status) as any}>
                                {getOtaTaskStatusLabel(task.status)}
                              </StatusBadge>
                              <span className="font-medium">{task.title}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {task.due_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(task.due_date), 'dd/MM')}
                                </span>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    <OtaRoleGate requireRole={["ota_lead", "admin", "super_admin"]}>
                      <Button variant="outline" className="w-full mt-4" onClick={() => setCreateTaskDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Tạo task mới
                      </Button>
                    </OtaRoleGate>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tasks Tab */}
              <TabsContent value="tasks" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Danh sách Tasks</CardTitle>
                      <CardDescription>Tất cả tasks trong project này</CardDescription>
                    </div>
                    <OtaRoleGate requireRole={["ota_lead", "admin", "super_admin"]}>
                      <Button onClick={() => setCreateTaskDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Tạo task
                      </Button>
                    </OtaRoleGate>
                  </CardHeader>
                  <CardContent>
                    {tasksLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : tasks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <ListTodo className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Chưa có task nào trong project này</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tasks.map((task) => {
                          const handleClick = (e: React.MouseEvent) => {
                            // Cmd/Ctrl+Click → Open in new tab
                            if (e.metaKey || e.ctrlKey) {
                              window.open(`/ota-operations/tasks/${task.id}`, '_blank');
                              return;
                            }

                            // Regular click → Open drawer
                            e.preventDefault();
                            handleTaskClick(task.id);
                          };

                          return (
                            <div
                              key={task.id}
                              onClick={handleClick}
                              className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <StatusBadge variant={getOtaTaskStatusVariant(task.status) as any}>
                                  {getOtaTaskStatusLabel(task.status)}
                                </StatusBadge>
                                <div>
                                  <p className="font-medium">{task.title}</p>
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <StatusBadge variant={getPriorityVariant(task.priority) as any}>
                                  {getPriorityLabel(task.priority)}
                                </StatusBadge>
                                {task.due_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(task.due_date), 'dd/MM/yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Members Tab */}
              <TabsContent value="members" className="mt-4">
                <ProjectMembersPanel projectId={projectId!} />
              </TabsContent>

              {/* Inputs Tab */}
              <TabsContent value="inputs" className="mt-4">
                <ProjectInputsTab projectId={projectId!} workType={project.work_type || 'OPTIMIZATION'} />
              </TabsContent>

              {/* Outputs Tab */}
              <TabsContent value="outputs" className="mt-4">
                <ProjectOutputsTab projectId={projectId!} />
              </TabsContent>
            </Tabs>

            {/* Edit Dialog */}
            {projectData.project && (
              <ProjectEditDialog
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                project={projectData.project}
              />
            )}

            {/* Create Task Dialog */}
            <CreateTaskDialog
              open={createTaskDialogOpen}
              onOpenChange={setCreateTaskDialogOpen}
              defaultProjectId={projectId}
            />

            {/* Sprint C: Create HANDOVER Task Dialog */}
            <CreateTaskDialog
              open={createHandoverDialogOpen}
              onOpenChange={setCreateHandoverDialogOpen}
              defaultProjectId={projectId}
              mode="handover"
              projectName={project.name}
            />

            {/* Quick View Drawer */}
            <TaskQuickViewDrawer
              taskId={selectedTaskId}
              isOpen={isDrawerOpen}
              onClose={handleDrawerClose}
            />
          </div>
        </SectionCard>
      </PageContainer>
    </>
  );
}
