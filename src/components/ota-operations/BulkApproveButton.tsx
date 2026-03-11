/**
 * BulkApproveButton - Bulk approve evidence for selected tasks
 * 
 * Sprint 1: Lead/Admin can select multiple REVIEW tasks and approve all PENDING evidence
 * 
 * USAGE:
 * - Only visible to Lead/Admin roles
 * - Only enabled when tasks are selected
 * - Shows confirmation dialog before action
 */

import React, { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useBulkApproveEvidence, BulkApproveResult } from '@/hooks/useOtaOperations';

interface BulkApproveButtonProps {
  selectedTaskIds: string[];
  isLeadOrAdmin: boolean;
  onSuccess?: (result: BulkApproveResult) => void;
  onClearSelection?: () => void;
}

export function BulkApproveButton({
  selectedTaskIds,
  isLeadOrAdmin,
  onSuccess,
  onClearSelection,
}: BulkApproveButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const bulkApproveMutation = useBulkApproveEvidence();
  
  // Only show to Lead/Admin
  if (!isLeadOrAdmin) return null;
  
  // Only enable when tasks selected
  const isEnabled = selectedTaskIds.length > 0;
  
  const handleBulkApprove = async () => {
    try {
      const result = await bulkApproveMutation.mutateAsync({
        taskIds: selectedTaskIds,
        comment: comment || undefined,
      });
      
      toast.success(`Đã duyệt ${result.approved_count} minh chứng`, {
        description: `${result.task_count} task đã được xử lý`,
      });
      
      onSuccess?.(result);
      onClearSelection?.();
      setIsOpen(false);
      setComment('');
    } catch (error) {
      toast.error('Lỗi duyệt minh chứng', {
        description: (error as Error).message,
      });
    }
  };
  
  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!isEnabled}
        >
          <CheckCircle2 className="h-4 w-4" />
          Duyệt hàng loạt ({selectedTaskIds.length})
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duyệt minh chứng hàng loạt</AlertDialogTitle>
          <AlertDialogDescription>
            Tất cả minh chứng đang chờ duyệt (PENDING) trong {selectedTaskIds.length} task 
            sẽ được đánh dấu là APPROVED.
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-comment">Ghi chú (không bắt buộc)</Label>
            <Textarea
              id="bulk-comment"
              placeholder="Nhập ghi chú cho việc duyệt hàng loạt..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p className="font-medium mb-1">Lưu ý:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Chỉ minh chứng PENDING được duyệt</li>
              <li>Minh chứng đã REJECTED hoặc APPROVED sẽ không thay đổi</li>
              <li>Hành động này được ghi vào audit log</li>
            </ul>
          </div>
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBulkApprove}
            disabled={bulkApproveMutation.isPending}
            className="bg-success hover:bg-success"
          >
            {bulkApproveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Xác nhận duyệt
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default BulkApproveButton;
