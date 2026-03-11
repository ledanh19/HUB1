/**
 * EvidenceTab - Upload and review evidence/proof of work
 * 
 * FEATURES:
 * - List evidence with status badges
 * - Inline file preview (image lightbox, PDF embed, link preview)
 * - Upload new evidence (file + URL)
 * - Approve/Reject workflow (Lead/Admin only)
 * 
 * RULES:
 * - Task can only be "Done" when >=1 evidence is Approved
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  AlertTriangle, FileText, Image, Upload, CheckCircle, XCircle, 
  Link2, Trash2, ExternalLink, Loader2, X, ZoomIn, Paperclip, Clipboard
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { 
  useTaskEvidence, 
  useUploadEvidence, 
  useReviewEvidence, 
  useDeleteEvidence,
  TaskEvidenceDetail 
} from '@/hooks/useOtaOperations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EvidenceTabProps {
  taskId: string;
  readOnly?: boolean; // Sprint C: disable upload for completed projects
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'outline' | 'default' | 'destructive'; color: string }> = {
  PENDING: { label: 'Chờ duyệt', variant: 'outline', color: 'text-warning' },
  APPROVED: { label: 'Đã duyệt', variant: 'default', color: 'text-success' },
  REJECTED: { label: 'Từ chối', variant: 'destructive', color: 'text-destructive' },
  NEEDS_REVISION: { label: 'Cần sửa', variant: 'destructive', color: 'text-warning' },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getFileIcon(mimeType: string | null): typeof Image | typeof FileText | typeof Link2 {
  if (mimeType?.startsWith('image/')) return Image;
  if (mimeType === 'application/pdf') return FileText;
  return Link2;
}

function isImageFile(mimeType: string | null): boolean {
  return mimeType?.startsWith('image/') || false;
}

function isPdfFile(mimeType: string | null): boolean {
  return mimeType === 'application/pdf';
}

export function EvidenceTab({ taskId, readOnly = false }: EvidenceTabProps) {
  const { data: evidenceData, isLoading, error } = useTaskEvidence(taskId);
  const uploadMutation = useUploadEvidence();
  const reviewMutation = useReviewEvidence();
  const deleteMutation = useDeleteEvidence();
  
  const [uploadMode, setUploadMode] = useState<'file' | 'url' | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewEvidence, setPreviewEvidence] = useState<TaskEvidenceDetail | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{ evidence: TaskEvidenceDetail; action: 'approve' | 'reject' } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const evidenceList = evidenceData?.evidence || [];
  const summary = evidenceData?.summary || { total: 0, approved: 0, pending: 0, rejected: 0 };
  const hasApproved = summary.approved > 0;
  
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File quá lớn. Tối đa 10MB');
        return;
      }
      setSelectedFile(file);
      setUploadMode('file');
    }
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File quá lớn. Tối đa 10MB');
        return;
      }
      setSelectedFile(file);
      setUploadMode('file');
    }
  }, []);
  
  // Handle Ctrl+V paste
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          if (file.size > 10 * 1024 * 1024) {
            toast.error('File quá lớn. Tối đa 10MB');
            return;
          }
          setSelectedFile(file);
          setUploadMode('file');
          toast.info('Đã dán ảnh từ clipboard');
        }
        break;
      }
    }
  }, []);
  
  // Listen for paste events
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);
  
  const handleUpload = async () => {
    try {
      if (uploadMode === 'file' && selectedFile) {
        await uploadMutation.mutateAsync({
          taskId,
          file: selectedFile,
          description: description || undefined,
        });
        toast.success('Đã tải lên minh chứng');
      } else if (uploadMode === 'url' && urlInput) {
        await uploadMutation.mutateAsync({
          taskId,
          externalUrl: urlInput,
          description: description || undefined,
        });
        toast.success('Đã thêm link minh chứng');
      }
      setUploadMode(null);
      setSelectedFile(null);
      setUrlInput('');
      setDescription('');
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };
  
  const handleReview = async () => {
    if (!reviewDialog) return;
    try {
      await reviewMutation.mutateAsync({
        evidenceId: reviewDialog.evidence.id,
        taskId,
        reviewStatus: reviewDialog.action === 'approve' ? 'APPROVED' : 'REJECTED',
        reviewNotes: reviewNotes || undefined,
      });
      
      if (reviewDialog.action === 'approve') {
        // Show success toast with option to mark task as DONE
        toast.success('Đã duyệt minh chứng', {
          description: 'Task có thể đánh dấu DONE khi có đủ evidence được duyệt.',
          action: {
            label: 'Xem task',
            onClick: () => {
              // Already in side panel, just close review dialog
            },
          },
          duration: 5000,
        });
      } else {
        toast.success('Đã từ chối minh chứng');
      }
      
      setReviewDialog(null);
      setReviewNotes('');
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };
  
  const handleDelete = async (evidence: TaskEvidenceDetail) => {
    if (!confirm('Bạn có chắc muốn xóa minh chứng này?')) return;
    try {
      await deleteMutation.mutateAsync({
        evidenceId: evidence.id,
        taskId,
        fileUrl: evidence.file_url || undefined,
      });
      toast.success('Đã xóa minh chứng');
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };
  
  const renderPreview = (evidence: TaskEvidenceDetail) => {
    const url = evidence.file_url || evidence.external_url;
    if (!url) return null;
    
    if (isImageFile(evidence.mime_type)) {
      return (
        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
          <img 
            src={url} 
            alt={evidence.file_name || 'Evidence'} 
            className="w-full h-full object-cover cursor-pointer transition-transform hover:scale-105"
            onClick={() => setPreviewEvidence(evidence)}
          />
          {/* Trello-style hover overlay */}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" />
        </div>
      );
    }
    
    if (isPdfFile(evidence.mime_type)) {
      return (
        <div 
          className="aspect-[4/3] bg-gradient-to-br from-destructive/10 to-destructive/10 rounded-lg border flex items-center justify-center cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => window.open(url, '_blank')}
        >
          <div className="text-center">
            <FileText className="h-10 w-10 mx-auto mb-2 text-destructive" />
            <p className="text-sm font-medium text-destructive">PDF</p>
            <p className="text-xs text-destructive">Click để xem</p>
          </div>
        </div>
      );
    }
    
    if (evidence.evidence_type === 'URL' || evidence.external_url) {
      return (
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="block p-4 bg-gradient-to-br from-info/10 to-info/10 rounded-lg border border-info/20 hover:shadow-md transition-all"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-info/10 rounded-lg">
              <Link2 className="h-5 w-5 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-info truncate">{new URL(url).hostname}</p>
              <p className="text-xs text-info truncate">{url}</p>
            </div>
            <ExternalLink className="h-4 w-4 text-info shrink-0" />
          </div>
        </a>
      );
    }
    
    return (
      <div className="aspect-video bg-muted rounded-lg border flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-1 opacity-50" />
          <p className="text-xs">File không hỗ trợ preview</p>
        </div>
      </div>
    );
  };
  
  return (
    <div id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence" className="p-4 space-y-4">
      {!hasApproved && evidenceList.length > 0 && (
        <Alert variant="destructive" className="border-warning/20 bg-warning/10 text-warning dark:bg-warning/10 dark:text-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Cần ít nhất 1 minh chứng được duyệt để hoàn thành task</AlertDescription>
        </Alert>
      )}
      
      {summary.total > 0 && (
        <div className="flex gap-2 text-xs">
          <Badge variant="secondary">{summary.total} tổng</Badge>
          {summary.approved > 0 && <Badge className="bg-success/10 text-success">{summary.approved} duyệt</Badge>}
          {summary.pending > 0 && <Badge variant="outline">{summary.pending} chờ</Badge>}
          {summary.rejected > 0 && <Badge variant="destructive">{summary.rejected} từ chối</Badge>}
        </div>
      )}
      
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Lỗi: {(error as Error).message}</AlertDescription>
        </Alert>
      )}
      
      {!isLoading && !error && (
        <div className="space-y-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5" />
            Tập tin đính kèm ({evidenceList.length})
          </h3>
          
          {/* Trello-style attachment grid for images */}
          {evidenceList.filter(e => isImageFile(e.mime_type)).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {evidenceList.filter(e => isImageFile(e.mime_type)).map((evidence) => {
                const statusConfig = STATUS_CONFIG[evidence.review_status] || STATUS_CONFIG.PENDING;
                const url = evidence.file_url || evidence.external_url;
                
                return (
                  <div key={evidence.id} className="group relative aspect-video rounded-lg overflow-hidden border bg-muted">
                    <img 
                      src={url || ''} 
                      alt={evidence.file_name || ''} 
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setPreviewEvidence(evidence)}
                    />
                    {/* Status badge */}
                    <div className="absolute top-1.5 right-1.5">
                      <Badge 
                        variant={statusConfig.variant} 
                        className={cn(
                          "text-micro px-1.5 py-0 shadow-sm",
                          statusConfig.variant === 'default' && "bg-success text-white"
                        )}
                      >
                        {statusConfig.label}
                      </Badge>
                    </div>
                    {/* Hover overlay with actions */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={() => setPreviewEvidence(evidence)}
                      >
                        <ZoomIn className="h-3 w-3 mr-1" />
                        Xem lớn
                      </Button>
                      {evidence.review_status === 'PENDING' && (
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs bg-success/10 text-success hover:bg-success/20"
                            onClick={() => setReviewDialog({ evidence, action: 'approve' })}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Duyệt
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs bg-destructive/10 text-destructive hover:bg-destructive/10"
                            onClick={() => setReviewDialog({ evidence, action: 'reject' })}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Từ chối
                          </Button>
                        </div>
                      )}
                    </div>
                    {/* File name */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-micro text-white truncate">{evidence.file_name || 'image.png'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Non-image attachments list */}
          {evidenceList.filter(e => !isImageFile(e.mime_type)).map((evidence) => {
            const statusConfig = STATUS_CONFIG[evidence.review_status] || STATUS_CONFIG.PENDING;
            const FileIcon = getFileIcon(evidence.mime_type);
            
            return (
              <div key={evidence.id} className="border rounded-lg p-3 space-y-3 hover:border-primary/30 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "p-1.5 rounded",
                      evidence.mime_type === 'application/pdf' ? "bg-destructive/10" : "bg-info/10"
                    )}>
                      <FileIcon className={cn(
                        "h-4 w-4 shrink-0",
                        evidence.mime_type === 'application/pdf' ? "text-destructive" : "text-info"
                      )} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate block">
                        {evidence.file_name || evidence.external_url || 'Minh chứng'}
                      </span>
                      <span className="text-micro text-muted-foreground">
                        {formatRelativeTime(evidence.created_at)}
                      </span>
                    </div>
                  </div>
                  <Badge variant={statusConfig.variant} className={cn("shrink-0", statusConfig.variant === 'default' && "bg-success/10 text-success")}>
                    {statusConfig.label}
                  </Badge>
                </div>
                
                {evidence.description && <p className="text-sm text-muted-foreground">{evidence.description}</p>}
                
                <div className="relative group">
                  {renderPreview(evidence)}
                </div>
                
                {evidence.review_notes && (
                  <div className="text-xs bg-muted p-2 rounded">
                    <span className="font-medium">Ghi chú: </span>{evidence.review_notes}
                  </div>
                )}
                
                <div className="text-xs text-muted-foreground">
                  Upload bởi {evidence.author_name || evidence.author_email || 'Unknown'}
                  {evidence.reviewed_at && evidence.reviewer_name && (
                    <span className="flex items-center gap-1 mt-0.5">
                      {evidence.review_status === 'APPROVED' ? <CheckCircle className="h-3 w-3 text-success" /> : <XCircle className="h-3 w-3 text-destructive" />}
                      {evidence.review_status === 'APPROVED' ? 'Duyệt' : 'Từ chối'} bởi {evidence.reviewer_name}
                    </span>
                  )}
                </div>
                
                {evidence.review_status === 'PENDING' && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" className="flex-1 text-success hover:bg-success/10 hover:border-success/20" onClick={() => setReviewDialog({ evidence, action: 'approve' })} disabled={reviewMutation.isPending}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />Duyệt
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-destructive hover:bg-destructive/10 hover:border-destructive/20" onClick={() => setReviewDialog({ evidence, action: 'reject' })} disabled={reviewMutation.isPending}>
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />Từ chối
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(evidence)} disabled={deleteMutation.isPending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          
          {evidenceList.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Chưa có minh chứng nào</p>
              <p className="text-xs">Tải lên file hoặc thêm link</p>
            </div>
          )}
        </div>
      )}
      
      {uploadMode && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{uploadMode === 'file' ? 'Tải lên file' : 'Thêm link'}</h4>
            <Button variant="ghost" size="sm" onClick={() => { setUploadMode(null); setSelectedFile(null); setUrlInput(''); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {uploadMode === 'file' && selectedFile && (
            <div className="flex items-center gap-2 p-2 bg-background rounded border">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm truncate flex-1">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          )}
          
          {uploadMode === 'url' && <Input placeholder="https://..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />}
          
          <Textarea placeholder="Mô tả (tùy chọn)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          
          <Button onClick={handleUpload} disabled={uploadMutation.isPending || (uploadMode === 'file' && !selectedFile) || (uploadMode === 'url' && !urlInput)} className="w-full">
            {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {uploadMutation.isPending ? 'Đang tải...' : 'Xác nhận'}
          </Button>
        </div>
      )}
      
      {!uploadMode && !readOnly && (
        <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 hover:bg-muted/30 transition-colors" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleFileSelect} />
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Tải lên minh chứng</p>
          <p className="text-xs text-muted-foreground mt-1 mb-3">Kéo thả file hoặc chọn bên dưới</p>
          <div className="flex gap-2 justify-center">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileText className="h-4 w-4 mr-1.5" />Chọn file
            </Button>
            <Button size="sm" variant="outline" onClick={() => setUploadMode('url')}>
              <Link2 className="h-4 w-4 mr-1.5" />Thêm link
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">JPG, PNG, PDF (tối đa 10MB)</p>
        </div>
      )}
      
      {/* Sprint C: Read-only notice */}
      {readOnly && (
        <div className="border-2 border-dashed rounded-lg p-6 text-center bg-muted/30">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2 opacity-50" />
          <p className="text-sm font-medium text-muted-foreground">Chế độ chỉ xem</p>
          <p className="text-xs text-muted-foreground mt-1">Project đã hoàn thành, không thể upload thêm</p>
        </div>
      )}
      
      <Dialog open={!!previewEvidence} onOpenChange={() => setPreviewEvidence(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black/95">
          {previewEvidence && <img src={previewEvidence.file_url || ''} alt={previewEvidence.file_name || ''} className="w-full h-auto max-h-[80vh] object-contain" />}
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!reviewDialog} onOpenChange={() => { setReviewDialog(null); setReviewNotes(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewDialog?.action === 'approve' ? 'Duyệt minh chứng' : 'Từ chối minh chứng'}</DialogTitle>
            <DialogDescription>{reviewDialog?.evidence.file_name || reviewDialog?.evidence.external_url || 'Minh chứng'}</DialogDescription>
          </DialogHeader>
          <Textarea placeholder={reviewDialog?.action === 'approve' ? 'Ghi chú (tùy chọn)' : 'Lý do từ chối (bắt buộc)'} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewDialog(null); setReviewNotes(''); }}>Hủy</Button>
            <Button onClick={handleReview} disabled={reviewMutation.isPending || (reviewDialog?.action === 'reject' && !reviewNotes)} variant={reviewDialog?.action === 'approve' ? 'default' : 'destructive'}>
              {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : reviewDialog?.action === 'approve' ? <CheckCircle className="h-4 w-4 mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              {reviewDialog?.action === 'approve' ? 'Duyệt' : 'Từ chối'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EvidenceTab;
