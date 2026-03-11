/**
 * ProjectOutputsTab - Manage project output data with review workflow
 * Features:
 * - Versioned outputs (DRAFT → SUBMITTED → APPROVED | REJECTED)
 * - Review panel for LEAD/ADMIN
 * - History viewer
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Save,
  Send,
  CheckCircle2,
  XCircle,
  Plus,
  X,
  Loader2,
  Clock,
  FileText,
  Link as LinkIcon,
  History,
  Eye,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useProjectIO,
  useCreateOutputDraft,
  useUpdateOutputDraft,
  useSubmitOutput,
  useReviewOutput,
  ProjectOutputData,
  ProjectOutputRecord,
  ProjectOutputSummary,
  OutputStatus,
} from '@/hooks/useOtaOperations';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface ProjectOutputsTabProps {
  projectId: string;
}

const outputSchema = z.object({
  summary: z.string().min(10, 'Tóm tắt phải có ít nhất 10 ký tự').optional().or(z.literal('')),
  before_links: z.array(z.string()).optional(),
  after_links: z.array(z.string()).optional(),
  kpi_notes: z.string().optional(),
  final_checklist: z.array(z.string()).optional(),
  handover_notes: z.string().optional(),
});

type OutputFormData = z.infer<typeof outputSchema>;

const STATUS_CONFIG: Record<OutputStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: 'Bản nháp', color: 'bg-muted text-muted-foreground', icon: <FileText className="h-3 w-3" /> },
  SUBMITTED: { label: 'Chờ duyệt', color: 'bg-warning/10 text-warning', icon: <Clock className="h-3 w-3" /> },
  APPROVED: { label: 'Đã duyệt', color: 'bg-success/10 text-success', icon: <CheckCircle2 className="h-3 w-3" /> },
  REJECTED: { label: 'Từ chối', color: 'bg-destructive/10 text-destructive', icon: <XCircle className="h-3 w-3" /> },
};

export function ProjectOutputsTab({ projectId }: ProjectOutputsTabProps) {
  const { user, userRole } = useAuth();
  const { data: projectIO, isLoading, error, refetch } = useProjectIO(projectId);
  
  const createDraftMutation = useCreateOutputDraft();
  const updateDraftMutation = useUpdateOutputDraft();
  const submitMutation = useSubmitOutput();
  const reviewMutation = useReviewOutput();
  
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [historyViewerOpen, setHistoryViewerOpen] = useState(false);
  const [selectedHistoryOutput, setSelectedHistoryOutput] = useState<ProjectOutputSummary | null>(null);
  
  const [newBeforeLink, setNewBeforeLink] = useState('');
  const [newAfterLink, setNewAfterLink] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  
  const isReviewer = ['ota_lead', 'admin', 'super_admin'].includes(userRole as string);
  
  const latestOutput = projectIO?.latest_output;
  const outputsList = projectIO?.outputs_list || [];
  
  const canEdit = latestOutput?.status === 'DRAFT' && 
    (latestOutput.created_by === user?.id || ['admin', 'super_admin'].includes(userRole as string));
  const canSubmit = latestOutput?.status === 'DRAFT' && latestOutput.created_by === user?.id;
  const canReview = latestOutput?.status === 'SUBMITTED' && isReviewer;
  const canCreateRevision = latestOutput?.status === 'REJECTED';
  const showCreateDraft = !latestOutput || latestOutput.status === 'APPROVED' || latestOutput.status === 'REJECTED';
  
  const form = useForm<OutputFormData>({
    resolver: zodResolver(outputSchema),
    defaultValues: {
      summary: '',
      before_links: [],
      after_links: [],
      kpi_notes: '',
      final_checklist: [],
      handover_notes: '',
    },
  });
  
  // Load data into form
  useState(() => {
    if (latestOutput?.status === 'DRAFT' && canEdit) {
      const data = latestOutput.data as ProjectOutputData;
      form.reset({
        summary: data.summary || '',
        before_links: data.before_links || [],
        after_links: data.after_links || [],
        kpi_notes: data.kpi_notes || '',
        final_checklist: data.final_checklist || [],
        handover_notes: data.handover_notes || '',
      });
    }
  });
  
  const handleCreateDraft = async () => {
    try {
      await createDraftMutation.mutateAsync(projectId);
      toast.success('Đã tạo bản nháp mới');
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };
  
  const handleSaveDraft = async (data: OutputFormData) => {
    if (!latestOutput?.id) return;
    
    try {
      await updateDraftMutation.mutateAsync({
        outputId: latestOutput.id,
        data: data as ProjectOutputData,
        projectId,
      });
      toast.success('Đã lưu bản nháp');
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };
  
  const handleSubmit = async () => {
    if (!latestOutput?.id) return;
    
    try {
      await submitMutation.mutateAsync({
        outputId: latestOutput.id,
        projectId,
      });
      toast.success('Đã gửi output để duyệt');
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };
  
  const openReviewDialog = (decision: 'APPROVE' | 'REJECT') => {
    setReviewDecision(decision);
    setReviewReason('');
    setReviewDialogOpen(true);
  };
  
  const handleReview = async () => {
    if (!latestOutput?.id || !reviewDecision) return;
    
    try {
      await reviewMutation.mutateAsync({
        outputId: latestOutput.id,
        projectId,
        decision: reviewDecision,
        reason: reviewReason,
      });
      toast.success(reviewDecision === 'APPROVE' ? 'Đã duyệt output' : 'Đã từ chối output');
      setReviewDialogOpen(false);
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };
  
  // Helper functions for array fields
  const addToArray = (field: keyof OutputFormData, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const current = (form.getValues(field) as string[]) || [];
    form.setValue(field, [...current, value.trim()]);
    setter('');
  };
  
  const removeFromArray = (field: keyof OutputFormData, index: number) => {
    const current = (form.getValues(field) as string[]) || [];
    form.setValue(field, current.filter((_, i) => i !== index));
  };
  
  const viewHistory = (output: ProjectOutputSummary) => {
    setSelectedHistoryOutput(output);
    setHistoryViewerOpen(true);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Lỗi</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Dữ liệu đầu ra</h3>
          <p className="text-sm text-muted-foreground">
            Kết quả và báo cáo của project
          </p>
        </div>
        {showCreateDraft && (
          <Button onClick={handleCreateDraft} disabled={createDraftMutation.isPending}>
            {createDraftMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {canCreateRevision ? 'Tạo bản chỉnh sửa' : 'Tạo Output'}
          </Button>
        )}
      </div>
      
      {/* Latest Output Status */}
      {latestOutput && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                Output Version {latestOutput.version}
                <Badge className={STATUS_CONFIG[latestOutput.status].color}>
                  {STATUS_CONFIG[latestOutput.status].icon}
                  <span className="ml-1">{STATUS_CONFIG[latestOutput.status].label}</span>
                </Badge>
              </CardTitle>
            </div>
            <CardDescription>
              Tạo: {format(new Date(latestOutput.created_at), 'HH:mm dd/MM/yyyy', { locale: vi })}
              {latestOutput.submitted_at && (
                <> • Gửi: {format(new Date(latestOutput.submitted_at), 'HH:mm dd/MM/yyyy', { locale: vi })}</>
              )}
              {latestOutput.reviewed_at && (
                <> • Duyệt: {format(new Date(latestOutput.reviewed_at), 'HH:mm dd/MM/yyyy', { locale: vi })}</>
              )}
            </CardDescription>
          </CardHeader>
          
          {/* Review Reason if rejected */}
          {latestOutput.status === 'REJECTED' && latestOutput.review_reason && (
            <CardContent className="pt-0">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Lý do từ chối</AlertTitle>
                <AlertDescription>{latestOutput.review_reason}</AlertDescription>
              </Alert>
            </CardContent>
          )}
          
          {/* Approval Reason */}
          {latestOutput.status === 'APPROVED' && latestOutput.review_reason && (
            <CardContent className="pt-0">
              <Alert className="border-success/20 bg-success/10">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <AlertTitle className="text-success">Ghi chú duyệt</AlertTitle>
                <AlertDescription className="text-success">{latestOutput.review_reason}</AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>
      )}
      
      {/* Review Panel - for LEAD/ADMIN when SUBMITTED */}
      {canReview && (
        <Card className="border-warning/20 bg-warning/10">
          <CardHeader>
            <CardTitle className="text-base text-warning">Duyệt Output</CardTitle>
            <CardDescription className="text-warning">
              Output đang chờ duyệt. Vui lòng xem xét và phê duyệt hoặc từ chối.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => openReviewDialog('APPROVE')} className="bg-success hover:bg-success">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Duyệt
            </Button>
            <Button variant="destructive" onClick={() => openReviewDialog('REJECT')}>
              <XCircle className="h-4 w-4 mr-2" />
              Từ chối
            </Button>
          </CardContent>
        </Card>
      )}
      
      {/* Output Editor - for DRAFT */}
      {canEdit && latestOutput?.status === 'DRAFT' && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSaveDraft)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Chỉnh sửa Output</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="summary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tóm tắt kết quả</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Mô tả tổng quan kết quả đạt được..."
                          rows={4}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Before Links */}
                <div className="space-y-2">
                  <FormLabel>Links trước khi tối ưu</FormLabel>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={newBeforeLink}
                      onChange={(e) => setNewBeforeLink(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('before_links', newBeforeLink, setNewBeforeLink))}
                    />
                    <Button type="button" variant="outline" onClick={() => addToArray('before_links', newBeforeLink, setNewBeforeLink)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(form.watch('before_links') || []).map((link, i) => (
                      <Badge key={i} variant="secondary" className="flex items-center gap-1">
                        <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline max-w-[150px] truncate">{link}</a>
                        <button type="button" onClick={() => removeFromArray('before_links', i)}><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {/* After Links */}
                <div className="space-y-2">
                  <FormLabel>Links sau khi tối ưu</FormLabel>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://..."
                      value={newAfterLink}
                      onChange={(e) => setNewAfterLink(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('after_links', newAfterLink, setNewAfterLink))}
                    />
                    <Button type="button" variant="outline" onClick={() => addToArray('after_links', newAfterLink, setNewAfterLink)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(form.watch('after_links') || []).map((link, i) => (
                      <Badge key={i} variant="secondary" className="flex items-center gap-1">
                        <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline max-w-[150px] truncate">{link}</a>
                        <button type="button" onClick={() => removeFromArray('after_links', i)}><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <FormField
                  control={form.control}
                  name="kpi_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ghi chú KPI</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Các chỉ số đạt được..." rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Checklist */}
                <div className="space-y-2">
                  <FormLabel>Checklist hoàn thành</FormLabel>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Mục kiểm tra..."
                      value={newChecklistItem}
                      onChange={(e) => setNewChecklistItem(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToArray('final_checklist', newChecklistItem, setNewChecklistItem))}
                    />
                    <Button type="button" variant="outline" onClick={() => addToArray('final_checklist', newChecklistItem, setNewChecklistItem)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {(form.watch('final_checklist') || []).map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <span className="flex-1">{item}</span>
                        <button type="button" onClick={() => removeFromArray('final_checklist', i)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                
                <FormField
                  control={form.control}
                  name="handover_notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ghi chú bàn giao</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Hướng dẫn bàn giao, lưu ý tiếp theo..." rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
            
            <div className="flex justify-end gap-2">
              <Button type="submit" variant="outline" disabled={updateDraftMutation.isPending}>
                {updateDraftMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Lưu nháp
              </Button>
              {canSubmit && (
                <Button type="button" onClick={handleSubmit} disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Gửi để duyệt
                </Button>
              )}
            </div>
          </form>
        </Form>
      )}
      
      {/* Read-only view for non-DRAFT */}
      {latestOutput && latestOutput.status !== 'DRAFT' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nội dung Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestOutput.data.summary && (
              <div>
                <h4 className="text-sm font-medium mb-1">Tóm tắt</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{latestOutput.data.summary}</p>
              </div>
            )}
            {latestOutput.data.kpi_notes && (
              <div>
                <h4 className="text-sm font-medium mb-1">KPI Notes</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{latestOutput.data.kpi_notes}</p>
              </div>
            )}
            {latestOutput.data.handover_notes && (
              <div>
                <h4 className="text-sm font-medium mb-1">Handover Notes</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{latestOutput.data.handover_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* History */}
      {outputsList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Lịch sử Versions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Tạo</TableHead>
                  <TableHead>Gửi</TableHead>
                  <TableHead>Duyệt</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outputsList.map((output) => (
                  <TableRow key={output.id}>
                    <TableCell className="font-medium">v{output.version}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_CONFIG[output.status].color}>
                        {STATUS_CONFIG[output.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(output.created_at), 'dd/MM/yyyy', { locale: vi })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {output.submitted_at ? format(new Date(output.submitted_at), 'dd/MM/yyyy', { locale: vi }) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {output.reviewed_at ? format(new Date(output.reviewed_at), 'dd/MM/yyyy', { locale: vi }) : '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => viewHistory(output)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDecision === 'APPROVE' ? 'Duyệt Output' : 'Từ chối Output'}
            </DialogTitle>
            <DialogDescription>
              {reviewDecision === 'APPROVE' 
                ? 'Xác nhận duyệt output này. Vui lòng nhập ghi chú (nếu có).'
                : 'Từ chối output này. Vui lòng nhập lý do để người tạo biết cần chỉnh sửa gì.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder={reviewDecision === 'APPROVE' ? 'Ghi chú duyệt...' : 'Lý do từ chối...'}
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Tối thiểu 5 ký tự ({reviewReason.length}/5)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleReview}
              disabled={reviewReason.length < 5 || reviewMutation.isPending}
              variant={reviewDecision === 'REJECT' ? 'destructive' : 'default'}
            >
              {reviewMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : reviewDecision === 'APPROVE' ? (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              {reviewDecision === 'APPROVE' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* History Viewer Dialog */}
      <Dialog open={historyViewerOpen} onOpenChange={setHistoryViewerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Output Version {selectedHistoryOutput?.version}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96">
              {JSON.stringify(selectedHistoryOutput, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProjectOutputsTab;
