import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  FileText,
  Image,
  Video,
  Link as LinkIcon,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Eye,
} from "lucide-react";
import { TaskEvidence, useReviewEvidence } from "@/hooks/useOtaOperations";
import { format } from "date-fns";
import { toast } from "sonner";

const EVIDENCE_TYPE_ICONS: Record<string, typeof FileText> = {
  SCREENSHOT: Image,
  DOCUMENT: FileText,
  SPREADSHEET: FileText,
  IMAGE: Image,
  VIDEO: Video,
  LINK: LinkIcon,
  NOTE: MessageSquare,
  OTHER: FileText,
};

const REVIEW_STATUS_CONFIG: Record<string, { 
  label: string; 
  variant: "default" | "success" | "warning" | "destructive" | "secondary";
  icon: typeof Clock;
}> = {
  PENDING: { label: "Chờ duyệt", variant: "warning", icon: Clock },
  APPROVED: { label: "Đã duyệt", variant: "success", icon: CheckCircle2 },
  REJECTED: { label: "Từ chối", variant: "destructive", icon: XCircle },
  NEEDS_REVISION: { label: "Cần sửa", variant: "secondary", icon: AlertCircle },
};

interface EvidenceListProps {
  evidence: TaskEvidence[];
  taskId: string;
  canReview: boolean;
  onReviewSuccess: () => void;
}

export function EvidenceList({ 
  evidence, 
  taskId, 
  canReview,
  onReviewSuccess 
}: EvidenceListProps) {
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<TaskEvidence | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | 'NEEDS_REVISION' | null>(null);
  
  const reviewMutation = useReviewEvidence();
  
  if (evidence.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Chưa có evidence nào</p>
        <p className="text-sm">Upload evidence để minh chứng hoàn thành công việc</p>
      </div>
    );
  }
  
  const handleReviewClick = (ev: TaskEvidence, action: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION') => {
    setSelectedEvidence(ev);
    setReviewAction(action);
    setReviewNotes("");
    setReviewDialogOpen(true);
  };
  
  const handleReviewSubmit = async () => {
    if (!selectedEvidence || !reviewAction) return;
    
    try {
      await reviewMutation.mutateAsync({
        evidenceId: selectedEvidence.id,
        taskId,
        reviewStatus: reviewAction,
        reviewNotes: reviewNotes || undefined,
      });
      
      toast.success(`Evidence đã được ${reviewAction === 'APPROVED' ? 'duyệt' : reviewAction === 'REJECTED' ? 'từ chối' : 'yêu cầu sửa'}`);
      setReviewDialogOpen(false);
      onReviewSuccess();
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };
  
  return (
    <>
      <div className="space-y-3">
        {evidence.map((ev) => {
          const TypeIcon = EVIDENCE_TYPE_ICONS[ev.evidence_type] || FileText;
          const statusConfig = REVIEW_STATUS_CONFIG[ev.review_status];
          const StatusIcon = statusConfig?.icon || Clock;
          const isPending = ev.review_status === 'PENDING';
          
          return (
            <Card key={ev.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <TypeIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {ev.file_name || ev.evidence_type}
                          </span>
                          <Badge 
                            variant={(statusConfig?.variant === 'destructive' ? 'danger' : statusConfig?.variant) as any}
                            className="text-xs"
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig?.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {ev.created_by_name} • {format(new Date(ev.created_at), "dd/MM/yyyy HH:mm")}
                        </p>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {ev.file_url && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            asChild
                          >
                            <a href={ev.file_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Description */}
                    {ev.description && (
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                        {ev.description}
                      </p>
                    )}
                    
                    {/* Review Notes */}
                    {ev.review_notes && (
                      <div className="mt-2 p-2 rounded bg-muted">
                        <p className="text-xs font-medium">
                          Review notes ({ev.reviewed_by_name}):
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ev.review_notes}
                        </p>
                      </div>
                    )}
                    
                    {/* Review Actions */}
                    {canReview && isPending && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="text-success hover:text-success hover:bg-success/10"
                          onClick={() => handleReviewClick(ev, 'APPROVED')}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleReviewClick(ev, 'REJECTED')}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleReviewClick(ev, 'NEEDS_REVISION')}
                        >
                          <AlertCircle className="h-4 w-4 mr-1" />
                          Cần sửa
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'APPROVED' && 'Approve Evidence'}
              {reviewAction === 'REJECTED' && 'Reject Evidence'}
              {reviewAction === 'NEEDS_REVISION' && 'Yêu cầu chỉnh sửa'}
            </DialogTitle>
            <DialogDescription>
              {selectedEvidence?.file_name || selectedEvidence?.evidence_type}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="review-notes">
                Ghi chú {reviewAction !== 'APPROVED' && '(khuyến khích)'}
              </Label>
              <Textarea
                id="review-notes"
                placeholder={
                  reviewAction === 'REJECTED' 
                    ? "Lý do từ chối..." 
                    : reviewAction === 'NEEDS_REVISION'
                      ? "Yêu cầu chỉnh sửa gì..."
                      : "Ghi chú (nếu có)..."
                }
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Hủy
            </Button>
            <Button 
              onClick={handleReviewSubmit}
              disabled={reviewMutation.isPending}
              variant={reviewAction === 'REJECTED' ? 'destructive' : 'default'}
            >
              {reviewMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
