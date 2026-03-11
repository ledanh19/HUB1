/**
 * TaskContextPanel - Slide-in Context Panel for Task Details
 * 
 * Phase 3: Execution-First UX
 * Opens from right side when clicking task card (not action buttons)
 * 
 * Features:
 * - NO URL change - panel slides in over board
 * - Full task context: purpose, DoD, evidence, timeline, comments
 * - Role-aware action buttons in header
 * - Upload evidence inline
 * - Review evidence (Lead/Admin)
 * - Add comments inline
 * - Link to full page if needed
 */

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from "sonner";
import { useAuth } from '@/hooks/useAuth';
import {
  useTaskContext,
  useTaskTimeline,
  useUpdateOtaTaskStatus,
  useSuperAdminOverride,
  useSubmitEvidence,
  useReviewEvidence,
  useAddTaskComment,
  TaskEvidence,
  TimelineEvent,
  OverrideType,
} from '@/hooks/useOtaOperations';
import { OtaProjectRole, WORK_TYPE_CONFIG, OtaTaskStatus } from '@/lib/otaOps';
import { TaskTimeline } from './TaskTimeline';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  X,
  ExternalLink,
  Calendar,
  User,
  FileText,
  MessageSquare,
  Paperclip,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  RotateCcw,
  Loader2,
  Send,
  Upload,
  Eye,
  Check,
  Play,
  XCircle,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

export interface TaskContextPanelProps {
  taskId: string | null;
  isOpen: boolean;
  onClose: () => void;
  projectRole: OtaProjectRole | null;
  onRefresh: () => void;
}

// ============================================================
// STATUS CONFIG
// ============================================================

const STATUS_CONFIG: Record<OtaTaskStatus, { label: string; color: string; icon: JSX.Element }> = {
  TODO: { label: 'Chờ xử lý', color: 'bg-muted text-muted-foreground', icon: <Clock className="h-3 w-3" /> },
  IN_PROGRESS: { label: 'Đang làm', color: 'bg-info/10 text-info', icon: <Loader2 className="h-3 w-3" /> },
  REVIEW: { label: 'Chờ duyệt', color: 'bg-warning/10 text-warning', icon: <Eye className="h-3 w-3" /> },
  DONE: { label: 'Hoàn thành', color: 'bg-success/10 text-success', icon: <CheckCircle className="h-3 w-3" /> },
  BLOCKED: { label: 'Bị chặn', color: 'bg-destructive/10 text-destructive', icon: <AlertTriangle className="h-3 w-3" /> },
  CANCELLED: { label: 'Đã hủy', color: 'bg-muted text-muted-foreground', icon: <XCircle className="h-3 w-3" /> },
};

// ============================================================
// COMPONENT
// ============================================================

export function TaskContextPanel({
  taskId,
  isOpen,
  onClose,
  projectRole,
  onRefresh,
}: TaskContextPanelProps) {
  const { user, userRole } = useAuth();

  // Data hooks
  const { task, project, evidence, comments, isLoading, error } = useTaskContext(taskId);
  const { data: timeline = [], isLoading: timelineLoading } = useTaskTimeline(taskId);

  // Mutation hooks
  const updateStatus = useUpdateOtaTaskStatus();
  const superAdminOverride = useSuperAdminOverride();
  const submitEvidence = useSubmitEvidence();
  const reviewEvidence = useReviewEvidence();
  const addComment = useAddTaskComment();

  // Local state
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [pendingOverride, setPendingOverride] = useState<OverrideType | null>(null);

  // Permission checks
  const userId = user?.id || '';
  const isSuperAdmin = userRole === 'super_admin';
  const isGlobalAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isLeadOrHigher = projectRole === 'LEAD' || projectRole === 'ADMIN' || isGlobalAdmin;
  const isAssignee = task?.assignee_id === userId;
  const canReview = isLeadOrHigher && task?.status === 'REVIEW';
  const canBlock = task?.status !== 'BLOCKED' && task?.status !== 'DONE' && task?.status !== 'CANCELLED';

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleStatusChange = async (newStatus: OtaTaskStatus) => {
    if (!task) return;
    try {
      await updateStatus.mutateAsync({ taskId: task.id, newStatus });
      toast.success("Thành công", { description: "Đã cập nhật trạng thái" });
      onRefresh();
    } catch (err) {
      toast.error("Lỗi", { description: (err as Error).message });
    }
  };

  const handleOverride = async () => {
    if (!task || !pendingOverride || !overrideReason.trim()) return;
    try {
      await superAdminOverride.mutateAsync({
        taskId: task.id,
        overrideType: pendingOverride,
        reason: overrideReason.trim(),
      });
      toast.success("Thành công", { description: `Override ${pendingOverride} thành công` });
      setPendingOverride(null);
      setOverrideReason('');
      onRefresh();
    } catch (err) {
      toast.error("Lỗi", { description: (err as Error).message });
    }
  };

  const handleSubmitComment = async () => {
    if (!task || !commentText.trim()) return;
    setIsSubmittingComment(true);
    try {
      await addComment.mutateAsync({ taskId: task.id, content: commentText.trim() });
      setCommentText('');
      toast.success("Đã gửi bình luận");
    } catch (err) {
      toast.error("Lỗi", { description: (err as Error).message });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleUploadEvidence = async () => {
    if (!task || !uploadUrl.trim()) return;
    setIsUploading(true);
    try {
      await submitEvidence.mutateAsync({
        taskId: task.id,
        evidenceType: 'FILE',
        fileUrl: uploadUrl.trim(),
        description: uploadDescription.trim() || undefined,
      });
      setUploadUrl('');
      setUploadDescription('');
      toast.success("Đã nộp kết quả");
      onRefresh();
    } catch (err) {
      toast.error("Lỗi", { description: (err as Error).message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReviewEvidence = async (evidenceId: string, status: 'APPROVED' | 'REJECTED') => {
    if (!task) return;
    try {
      await reviewEvidence.mutateAsync({
        evidenceId,
        taskId: task.id,
        reviewStatus: status,
      });
      toast.success(status === 'APPROVED' ? "Đã duyệt" : "Đã từ chối");
      onRefresh();
    } catch (err) {
      toast.error("Lỗi", { description: (err as Error).message });
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (!taskId) return null;

  const statusConfig = task ? STATUS_CONFIG[task.status] : null;
  const workTypeConfig = task?.work_type ? WORK_TYPE_CONFIG[task.work_type] : null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <SheetTitle className="text-lg font-semibold line-clamp-2 pr-8">
                {task?.title || 'Đang tải...'}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 flex-wrap">
                {statusConfig && (
                  <Badge className={cn('gap-1', statusConfig.color)}>
                    {statusConfig.icon}
                    {statusConfig.label}
                  </Badge>
                )}
                {workTypeConfig && (
                  <Badge variant="outline" className="gap-1">
                    {workTypeConfig.icon} {workTypeConfig.labelVi}
                  </Badge>
                )}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Quick Info */}
          {task && (
            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
              {task.assignee_name && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{task.assignee_name}</span>
                </div>
              )}
              {task.due_date && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(task.due_date), 'dd/MM/yyyy', { locale: vi })}</span>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {task && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {task.status === 'TODO' && (isAssignee || isLeadOrHigher) && (
                <Button
                  size="sm"
                  onClick={() => handleStatusChange('IN_PROGRESS')}
                  className="bg-success hover:bg-success"
                >
                  <Play className="h-3 w-3 mr-1" />
                  Bắt đầu
                </Button>
              )}
              {task.status === 'IN_PROGRESS' && (isAssignee || isLeadOrHigher) && (
                <Button
                  size="sm"
                  onClick={() => handleStatusChange('REVIEW')}
                  className="bg-info hover:bg-info"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Gửi Review
                </Button>
              )}
              {canReview && (
                <Button
                  size="sm"
                  onClick={() => handleStatusChange('DONE')}
                  className="bg-success hover:bg-success"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Duyệt hoàn thành
                </Button>
              )}
              {canBlock && (isAssignee || isLeadOrHigher) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-warning border-warning/20"
                  onClick={() => handleStatusChange('BLOCKED')}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Block
                </Button>
              )}
              {isSuperAdmin && task.status !== 'DONE' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-primary border-primary/20"
                  onClick={() => setPendingOverride('FORCE_DONE')}
                >
                  <Zap className="h-3 w-3 mr-1" />
                  Force Done
                </Button>
              )}
              {isSuperAdmin && (task.status === 'DONE' || task.status === 'CANCELLED') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-primary border-primary/20"
                  onClick={() => setPendingOverride('REOPEN')}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reopen
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => window.open(`/ota-operations/tasks/${task.id}`, '_blank')}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Mở trang đầy đủ
              </Button>
            </div>
          )}
        </SheetHeader>

        {/* Override Modal */}
        {pendingOverride && (
          <div className="px-6 py-4 bg-primary/10 border-b">
            <p className="text-sm font-medium text-primary mb-2">
              {pendingOverride === 'FORCE_DONE' ? 'Force Done' : 'Reopen'} - Nhập lý do
            </p>
            <Textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Lý do override (bắt buộc)..."
              rows={2}
              className="mb-2"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleOverride} disabled={!overrideReason.trim()}>
                Xác nhận
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPendingOverride(null)}>
                Hủy
              </Button>
            </div>
          </div>
        )}

        {/* Content Tabs */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="px-6 border-b rounded-none h-auto py-0 bg-transparent shrink-0">
            <TabsTrigger value="overview" className="py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <FileText className="h-4 w-4 mr-1" />
              Tổng quan
            </TabsTrigger>
            <TabsTrigger value="evidence" className="py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Paperclip className="h-4 w-4 mr-1" />
              Kết quả ({evidence.length})
            </TabsTrigger>
            <TabsTrigger value="timeline" className="py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Clock className="h-4 w-4 mr-1" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="comments" className="py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <MessageSquare className="h-4 w-4 mr-1" />
              Bình luận ({comments.length})
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            {/* Overview Tab */}
            <TabsContent value="overview" className="p-6 mt-0 space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Purpose */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Mục đích công việc</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {task?.description || 'Không có mô tả'}
                    </p>
                  </div>

                  <Separator />

                  {/* Project Info */}
                  {project && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">Thuộc Project</h3>
                      <div className="bg-muted rounded-lg p-3 text-sm">
                        <p className="font-medium">{project.name}</p>
                        {project.description && (
                          <p className="text-muted-foreground mt-1">{project.description}</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* Evidence Tab */}
            <TabsContent value="evidence" className="p-6 mt-0 space-y-4">
              {/* Upload Form */}
              {(isAssignee || isLeadOrHigher) && task?.status !== 'DONE' && task?.status !== 'CANCELLED' && (
                <div className="bg-muted rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-medium">Nộp kết quả mới</h4>
                  <div className="space-y-2">
                    <Input
                      placeholder="URL file (Google Drive, Dropbox, etc.)"
                      value={uploadUrl}
                      onChange={(e) => setUploadUrl(e.target.value)}
                    />
                    <Input
                      placeholder="Mô tả (tùy chọn)"
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={handleUploadEvidence}
                      disabled={!uploadUrl.trim() || isUploading}
                    >
                      {isUploading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      <Upload className="h-3 w-3 mr-1" />
                      Nộp
                    </Button>
                  </div>
                </div>
              )}

              {/* Evidence List */}
              {evidence.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Paperclip className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">Chưa có kết quả nào</p>
                  <p className="text-xs text-muted-foreground/70 mb-4 max-w-[240px]">
                    Nộp kết quả để chuyển sang Review và được người duyệt kiểm tra.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {evidence.map((ev) => (
                    <EvidenceCard
                      key={ev.id}
                      evidence={ev}
                      canReview={isLeadOrHigher}
                      onApprove={() => handleReviewEvidence(ev.id, 'APPROVED')}
                      onReject={() => handleReviewEvidence(ev.id, 'REJECTED')}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Timeline Tab */}
            <TabsContent value="timeline" className="p-6 mt-0">
              <TaskTimeline events={timeline} isLoading={timelineLoading} />
            </TabsContent>

            {/* Comments Tab */}
            <TabsContent value="comments" className="p-6 mt-0 space-y-4">
              {/* Comment Input */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Viết bình luận..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={2}
                  className="flex-1"
                />
                <Button
                  size="icon"
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || isSubmittingComment}
                >
                  {isSubmittingComment ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Comments List */}
              {comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">Chưa có trao đổi</p>
                  <p className="text-xs text-muted-foreground/70 mb-4 max-w-[240px]">
                    Dùng bình luận để phối hợp và xin xác nhận từ người duyệt.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <CommentCard key={comment.id} comment={comment} />
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// EVIDENCE CARD
// ============================================================

interface EvidenceCardProps {
  evidence: TaskEvidence;
  canReview: boolean;
  onApprove: () => void;
  onReject: () => void;
}

function EvidenceCard({ evidence, canReview, onApprove, onReject }: EvidenceCardProps) {
  const statusColors = {
    PENDING: 'bg-warning/10 text-warning',
    APPROVED: 'bg-success/10 text-success',
    REJECTED: 'bg-destructive/10 text-destructive',
    NEEDS_REVISION: 'bg-warning/10 text-warning',
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
          <a
            href={evidence.file_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-info hover:underline truncate"
          >
            {evidence.file_name || evidence.file_url || 'File'}
          </a>
        </div>
        <Badge className={cn('text-xs shrink-0', statusColors[evidence.review_status])}>
          {evidence.review_status}
        </Badge>
      </div>

      {evidence.description && (
        <p className="text-xs text-muted-foreground">{evidence.description}</p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {format(new Date(evidence.created_at), 'dd/MM HH:mm', { locale: vi })}
        </span>
        
        {canReview && evidence.review_status === 'PENDING' && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-success" onClick={onApprove}>
              <Check className="h-3 w-3 mr-1" />
              Duyệt
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={onReject}>
              <X className="h-3 w-3 mr-1" />
              Từ chối
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// COMMENT CARD
// ============================================================

interface CommentCardProps {
  comment: {
    id: string;
    content: string;
    author_id: string;
    author_name?: string;
    created_at: string;
    is_edited?: boolean;
  };
}

function CommentCard({ comment }: CommentCardProps) {
  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs bg-muted">
          {getInitials(comment.author_name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{comment.author_name || 'Unknown'}</span>
          <span className="text-muted-foreground">
            {format(new Date(comment.created_at), 'dd/MM HH:mm', { locale: vi })}
          </span>
          {comment.is_edited && (
            <span className="text-muted-foreground">(đã sửa)</span>
          )}
        </div>
        <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
      </div>
    </div>
  );
}

export default TaskContextPanel;
