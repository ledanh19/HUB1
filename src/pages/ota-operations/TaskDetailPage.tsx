import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/layout/SectionCard";
import { useCurrentUserPagePermissions } from "@/hooks/useUserPagePermissions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Calendar,
  Clock,
  User,
  FolderKanban,
  ChevronDown,
  Play,
  Eye,
  CheckCircle2,
  XCircle,
  Pause,
  Upload,
  FileText,
  Image,
  Video,
  Link as LinkIcon,
  MessageSquare,
  AlertTriangle,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import {
  useOtaTaskDetail,
  useUpdateOtaTaskStatus,
  useSuperAdminOverride,
  OtaTaskStatus,
  OtaTaskPriority,
  TaskEvidence,
  OverrideType,
} from "@/hooks/useOtaOperations";
import { SuperAdminOverrideModal } from "@/components/ota-operations/SuperAdminOverrideModal";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { toast } from "sonner";
import { getOtaTaskStatusVariant, getOtaTaskStatusLabel, getPriorityVariant, getPriorityLabel } from "@/constants/status-config";
import { EvidenceUploadDialog } from "@/components/ota-operations/EvidenceUploadDialog";
import { TaskCommentsPanel } from "@/components/ota-operations/TaskCommentsPanel";
import { EvidenceList } from "@/components/ota-operations/EvidenceList";
import { TaskTimelineView } from "@/components/ota-operations/TaskTimelineView";

const formatDate = (date: string | null) => {
  if (!date) return "—";
  return format(new Date(date), "dd/MM/yyyy HH:mm");
};

const formatDateShort = (date: string | null) => {
  if (!date) return "—";
  return format(new Date(date), "dd/MM/yyyy");
};

const STATUS_ICONS: Record<OtaTaskStatus, typeof Clock> = {
  TODO: Clock,
  IN_PROGRESS: Play,
  REVIEW: Eye,
  DONE: CheckCircle2,
  BLOCKED: Pause,
  CANCELLED: XCircle,
};

// Allowed status transitions
const STATUS_TRANSITIONS: Record<OtaTaskStatus, OtaTaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['REVIEW', 'BLOCKED', 'TODO'],
  REVIEW: ['DONE', 'IN_PROGRESS', 'BLOCKED'],
  DONE: [], // No transitions from DONE
  BLOCKED: ['TODO', 'IN_PROGRESS', 'CANCELLED'],
  CANCELLED: [], // No transitions from CANCELLED
};

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const { hasPageAccess, canUsePage } = useCurrentUserPagePermissions();
  const canAccess = hasPageAccess("/ota-operations/tasks");
  const canPerformActions = canUsePage("/ota-operations/tasks");

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedOverrideType, setSelectedOverrideType] = useState<OverrideType | null>(null);

  const { data: taskDetail, isLoading, error, refetch } = useOtaTaskDetail(taskId);
  const updateStatusMutation = useUpdateOtaTaskStatus();
  const superAdminOverrideMutation = useSuperAdminOverride();

  const isLeadOrAdmin = ['ota_lead', 'admin', 'super_admin'].includes(userRole as string);
  const isSuperAdmin = userRole === 'super_admin';

  const handleStatusChange = async (newStatus: OtaTaskStatus) => {
    if (!taskId) return;

    try {
      await updateStatusMutation.mutateAsync({ taskId, newStatus });
      toast.success(`Đã cập nhật trạng thái thành "${getOtaTaskStatusLabel(newStatus)}"`);
    } catch (err: any) {
      // Special handling for EVIDENCE_REQUIRED error
      if (err.message?.includes('EVIDENCE_REQUIRED') || err.message?.includes('approved evidence')) {
        toast.error('Không thể hoàn thành task! Cần có ít nhất 1 evidence được duyệt.');
      } else {
        toast.error(`Lỗi: ${err.message}`);
      }
    }
  };

  const openOverrideModal = (type: OverrideType) => {
    setSelectedOverrideType(type);
    setOverrideModalOpen(true);
  };

  const handleOverrideConfirm = async (reason: string) => {
    if (!taskId || !selectedOverrideType) return;

    try {
      await superAdminOverrideMutation.mutateAsync({
        taskId,
        overrideType: selectedOverrideType,
        reason,
      });
      toast.success(`Override thành công: ${selectedOverrideType}`);
      setOverrideModalOpen(false);
      setSelectedOverrideType(null);
    } catch (err: any) {
      toast.error(`Override thất bại: ${err.message}`);
    }
  };

  // Determine which override options are available based on current status
  const getAvailableOverrides = (status: OtaTaskStatus): OverrideType[] => {
    const overrides: OverrideType[] = [];

    // REOPEN: Only for DONE or CANCELLED
    if (status === 'DONE' || status === 'CANCELLED') {
      overrides.push('REOPEN');
    }

    // FORCE_DONE: Any status except DONE
    if (status !== 'DONE') {
      overrides.push('FORCE_DONE');
    }

    // CANCEL: Any status except CANCELLED
    if (status !== 'CANCELLED') {
      overrides.push('CANCEL');
    }

    return overrides;
  };

  if (!canAccess) {
    return (
      <>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-base font-semibold">Không có quyền truy cập</h2>
            <p className="text-muted-foreground">Bạn không có quyền xem trang này.</p>
          </div>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (error || !taskDetail?.success || !taskDetail.task) {
    return (
      <>
        <div className="p-4">
          <Link to="/ota-operations/tasks" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Quay lại danh sách tasks
          </Link>
          <div className="flex items-center justify-center h-[40vh]">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-base font-semibold">Không tìm thấy task</h2>
              <p className="text-muted-foreground">{taskDetail?.message || (error as Error)?.message}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const { task, project, evidence = [], evidence_summary, can_complete } = taskDetail;
  const currentStatus = task.status;
  const availableTransitions = STATUS_TRANSITIONS[currentStatus] || [];
  const StatusIcon = STATUS_ICONS[currentStatus] || Clock;

  return (
    <>
      <PageContainer><SectionCard>
        {/* Back link */}
        <Link to="/ota-operations/tasks" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Quay lại danh sách tasks
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusBadge variant={getPriorityVariant(task.priority) as any}>
                {getPriorityLabel(task.priority)}
              </StatusBadge>
              <StatusBadge variant={getOtaTaskStatusVariant(currentStatus) as any}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {getOtaTaskStatusLabel(currentStatus)}
              </StatusBadge>
            </div>
            <h1 className="text-hero-kpi font-bold tabular-nums tracking-tight">{task.title}</h1>
            {project && (
              <div className="flex items-center text-xs text-muted-foreground">
                <FolderKanban className="h-4 w-4 mr-1" />
                <Link
                  to={`/ota-operations/projects/${project.id}`}
                  className="hover:underline"
                >
                  {project.name}
                </Link>
                <span className="mx-2">•</span>
                <span>{project.property_name}</span>
              </div>
            )}
          </div>

          {/* Status Actions */}
          <div className="flex items-center gap-2">
            {canPerformActions && availableTransitions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={updateStatusMutation.isPending}>
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ChevronDown className="h-4 w-4 mr-2" />
                    )}
                    Chuyển trạng thái
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {availableTransitions.map((status) => {
                    const Icon = STATUS_ICONS[status] || Clock;
                    const isDone = status === 'DONE';
                    const canTransitionToDone = isDone ? can_complete : true;

                    return (
                      <DropdownMenuItem
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        disabled={!canTransitionToDone}
                        className={!canTransitionToDone ? 'opacity-50' : ''}
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {getOtaTaskStatusLabel(status)}
                        {isDone && !can_complete && (
                          <span className="ml-2 text-xs text-destructive">(cần evidence)</span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Super Admin Override - only visible to super_admin */}
            {isSuperAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-warning/20 text-warning hover:bg-warning/10"
                    disabled={superAdminOverrideMutation.isPending}
                  >
                    {superAdminOverrideMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 mr-2" />
                    )}
                    Override
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {getAvailableOverrides(currentStatus).map((type) => {
                    const icons: Record<OverrideType, React.ReactNode> = {
                      REOPEN: <RotateCcw className="h-4 w-4 mr-2" />,
                      FORCE_DONE: <CheckCircle2 className="h-4 w-4 mr-2" />,
                      CANCEL: <XCircle className="h-4 w-4 mr-2" />,
                    };
                    const labels: Record<OverrideType, string> = {
                      REOPEN: 'Reopen (→ REVIEW)',
                      FORCE_DONE: 'Force Done (bypass evidence)',
                      CANCEL: 'Cancel Task',
                    };

                    return (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => openOverrideModal(type)}
                        className={type === 'CANCEL' ? 'text-destructive focus:text-destructive' : ''}
                      >
                        {icons[type]}
                        {labels[type]}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Warning if trying to complete without evidence */}
        {currentStatus === 'REVIEW' && !can_complete && (
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-warning">Chưa thể hoàn thành task</p>
              <p className="text-xs text-warning">
                Task cần có ít nhất 1 evidence được duyệt (APPROVED) trước khi chuyển sang DONE.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mô tả</CardTitle>
              </CardHeader>
              <CardContent>
                {task.description ? (
                  <p className="text-xs whitespace-pre-wrap">{task.description}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Không có mô tả</p>
                )}
              </CardContent>
            </Card>

            {/* Evidence Section */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Evidence / Minh chứng</CardTitle>
                  <CardDescription>
                    {evidence_summary && (
                      <span className="flex items-center gap-2 mt-1">
                        <span>Tổng: {evidence_summary.total}</span>
                        {evidence_summary.approved > 0 && (
                          <Badge variant="outline" className="bg-success/10 text-success">
                            ✓ {evidence_summary.approved} approved
                          </Badge>
                        )}
                        {evidence_summary.pending > 0 && (
                          <Badge variant="outline" className="bg-warning/10 text-warning">
                            ⏳ {evidence_summary.pending} pending
                          </Badge>
                        )}
                        {evidence_summary.rejected > 0 && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive">
                            ✗ {evidence_summary.rejected} rejected
                          </Badge>
                        )}
                      </span>
                    )}
                  </CardDescription>
                </div>
                {canPerformActions && currentStatus !== 'DONE' && currentStatus !== 'CANCELLED' && (
                  <Button onClick={() => setUploadDialogOpen(true)} size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Thêm Evidence
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <EvidenceList
                  evidence={evidence}
                  taskId={taskId!}
                  canReview={isLeadOrAdmin && canPerformActions}
                  onReviewSuccess={() => refetch()}
                />
              </CardContent>
            </Card>

            {/* Comments Section */}
            <TaskCommentsPanel taskId={taskId!} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Task Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Thông tin</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-xs font-medium">Người thực hiện</p>
                    <p className="text-xs text-muted-foreground">
                      {task.assignee?.full_name || task.assignee?.email || 'Chưa gán'}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-xs font-medium">Deadline</p>
                    <p className={`text-xs ${task.due_date && new Date(task.due_date) < new Date() ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                      {formatDateShort(task.due_date)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-xs font-medium">Thời gian ước tính</p>
                    <p className="text-xs text-muted-foreground">
                      {task.expected_effort_minutes
                        ? `${Math.floor(task.expected_effort_minutes / 60)}h ${task.expected_effort_minutes % 60}m`
                        : task.estimated_hours
                          ? `${task.estimated_hours} giờ`
                          : '—'}
                    </p>
                    {(task.actual_effort_minutes || task.actual_hours) && (
                      <p className="text-xs text-muted-foreground">
                        Thực tế: {task.actual_effort_minutes
                          ? `${Math.floor(task.actual_effort_minutes / 60)}h ${task.actual_effort_minutes % 60}m`
                          : task.actual_hours
                            ? `${task.actual_hours} giờ`
                            : '—'}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Classification */}
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-xs font-medium">Phân loại tác vụ</p>
                    <Badge variant="outline" className="mt-1">
                      {task.classification === 'EXECUTION' ? '⚡ Thực thi' :
                        task.classification === 'PREP' ? '📋 Chuẩn bị' :
                          task.classification === 'AUTO' ? '🤖 Tự động' :
                            task.classification === 'OPS' ? '🔧 Vận hành' :
                              '⚡ Thực thi (mặc định)'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(task.require_evidence ?? (task.classification === 'EXECUTION' || !task.classification))
                        ? `Cần ${task.min_evidence_count || 1} minh chứng`
                        : 'Không cần minh chứng'}
                    </p>
                  </div>
                </div>

                {task.tags && task.tags.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium mb-2">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {task.tags.map((tag, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardContent className="pt-4">
                <TaskTimelineView
                  status={task.status}
                  createdAt={task.created_at}
                  startedAt={task.started_at}
                  completedAt={task.completed_at}
                  updatedAt={task.created_at}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </SectionCard></PageContainer>

      {/* Evidence Upload Dialog */}
      <EvidenceUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        taskId={taskId!}
        onSuccess={() => {
          refetch();
          setUploadDialogOpen(false);
        }}
      />

      {/* Super Admin Override Modal */}
      {selectedOverrideType && (
        <SuperAdminOverrideModal
          open={overrideModalOpen}
          onOpenChange={(open) => {
            setOverrideModalOpen(open);
            if (!open) setSelectedOverrideType(null);
          }}
          overrideType={selectedOverrideType}
          taskTitle={task.title}
          currentStatus={currentStatus}
          onConfirm={handleOverrideConfirm}
          isPending={superAdminOverrideMutation.isPending}
        />
      )}
    </>
  );
}
