/**
 * StatusTransitionModal
 * Modal for confirming status transitions that require reasons
 * Used for BLOCKED, CANCELLED, and revert transitions
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { OtaTaskStatus } from '@/lib/otaOps';
import { AlertTriangle, Ban, RotateCcw, XCircle } from 'lucide-react';

interface StatusTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  fromStatus: OtaTaskStatus;
  toStatus: OtaTaskStatus;
  taskTitle: string;
  requiresConfirm: boolean;
}

/**
 * Get modal content based on transition type
 */
function getModalContent(fromStatus: OtaTaskStatus, toStatus: OtaTaskStatus) {
  if (toStatus === 'BLOCKED') {
    return {
      icon: <Ban className="h-6 w-6 text-destructive" />,
      title: 'Chặn task',
      description: 'Task sẽ bị tạm dừng. Vui lòng mô tả lý do để team có thể hỗ trợ.',
      placeholder: 'Ví dụ: Thiếu thông tin từ khách, chờ phản hồi từ OTA, vấn đề kỹ thuật...',
      confirmText: 'Chặn task',
      confirmVariant: 'destructive' as const,
    };
  }

  if (toStatus === 'CANCELLED') {
    return {
      icon: <XCircle className="h-6 w-6 text-muted-foreground" />,
      title: 'Hủy task',
      description: 'Task sẽ bị hủy và không thể khôi phục. Vui lòng mô tả lý do.',
      placeholder: 'Ví dụ: Khách hủy đặt phòng, yêu cầu không còn phù hợp, trùng lặp...',
      confirmText: 'Hủy task',
      confirmVariant: 'destructive' as const,
    };
  }

  if (fromStatus === 'IN_PROGRESS' && toStatus === 'TODO') {
    return {
      icon: <RotateCcw className="h-6 w-6 text-warning" />,
      title: 'Hoàn tác task',
      description: 'Task sẽ quay về trạng thái Chờ xử lý. Vui lòng mô tả lý do.',
      placeholder: 'Ví dụ: Cần bổ sung thông tin, phát hiện vấn đề cần xử lý trước...',
      confirmText: 'Hoàn tác',
      confirmVariant: 'default' as const,
    };
  }

  // Generic confirmation for other transitions
  return {
    icon: <AlertTriangle className="h-6 w-6 text-warning" />,
    title: 'Xác nhận thay đổi',
    description: 'Vui lòng mô tả lý do thay đổi trạng thái task.',
    placeholder: 'Mô tả lý do...',
    confirmText: 'Xác nhận',
    confirmVariant: 'default' as const,
  };
}

export function StatusTransitionModal({
  isOpen,
  onClose,
  onConfirm,
  fromStatus,
  toStatus,
  taskTitle,
  requiresConfirm,
}: StatusTransitionModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const content = getModalContent(fromStatus, toStatus);

  const handleSubmit = async () => {
    if (!reason.trim()) return;

    setIsSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {content.icon}
            <DialogTitle>{content.title}</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            {content.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task title */}
          <div>
            <Label className="text-xs text-muted-foreground">Task</Label>
            <p className="text-sm font-medium mt-1">{taskTitle}</p>
          </div>

          {/* Status change */}
          <div>
            <Label className="text-xs text-muted-foreground">Thay đổi</Label>
            <p className="text-sm mt-1">
              <span className="font-medium">{getStatusLabel(fromStatus)}</span>
              {' → '}
              <span className="font-medium">{getStatusLabel(toStatus)}</span>
            </p>
          </div>

          {/* Reason input */}
          <div>
            <Label htmlFor="reason" className="text-sm font-medium">
              Lý do <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={content.placeholder}
              className="mt-2 min-h-[100px]"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tối thiểu 10 ký tự
            </p>
          </div>

          {requiresConfirm && (
            <div className="bg-warning/10 border border-warning/20 rounded-md p-3">
              <p className="text-xs text-warning">
                ⚠️ Hành động này cần xác nhận từ Lead/Admin vì thay đổi trạng thái không theo workflow thông thường.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <Button
            variant={content.confirmVariant}
            onClick={handleSubmit}
            disabled={!reason.trim() || reason.trim().length < 10 || isSubmitting}
          >
            {isSubmitting ? 'Đang xử lý...' : content.confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Get Vietnamese label for status
 */
function getStatusLabel(status: OtaTaskStatus): string {
  const labels: Record<OtaTaskStatus, string> = {
    TODO: 'Chờ xử lý',
    IN_PROGRESS: 'Đang làm',
    REVIEW: 'Chờ duyệt',
    DONE: 'Hoàn thành',
    BLOCKED: 'Bị chặn',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] || status;
}
