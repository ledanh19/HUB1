import React, { useState, useEffect } from 'react';
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
import { AlertTriangle, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { OverrideType } from '@/hooks/useOtaOperations';

interface SuperAdminOverrideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overrideType: OverrideType;
  taskTitle: string;
  currentStatus: string;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
}

const OVERRIDE_CONFIG: Record<OverrideType, {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  targetStatus: string;
}> = {
  REOPEN: {
    title: 'Reopen Task',
    description: 'Return this task to REVIEW status for re-evaluation.',
    icon: <RotateCcw className="h-5 w-5" />,
    color: 'text-info',
    targetStatus: 'REVIEW',
  },
  FORCE_DONE: {
    title: 'Force Complete',
    description: 'Mark this task as DONE, bypassing evidence requirements.',
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'text-success',
    targetStatus: 'DONE',
  },
  CANCEL: {
    title: 'Cancel Task',
    description: 'Cancel this task permanently.',
    icon: <XCircle className="h-5 w-5" />,
    color: 'text-destructive',
    targetStatus: 'CANCELLED',
  },
};

const MIN_REASON_LENGTH = 5;

export function SuperAdminOverrideModal({
  open,
  onOpenChange,
  overrideType,
  taskTitle,
  currentStatus,
  onConfirm,
  isPending = false,
}: SuperAdminOverrideModalProps) {
  const [reason, setReason] = useState('');
  const config = OVERRIDE_CONFIG[overrideType];

  // Reset reason when modal opens/closes
  useEffect(() => {
    if (!open) {
      setReason('');
    }
  }, [open]);

  const isValid = reason.trim().length >= MIN_REASON_LENGTH;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(reason.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={config.color}>{config.icon}</span>
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Task Info */}
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">{taskTitle}</p>
            <p className="text-muted-foreground">
              Status: <span className="font-mono">{currentStatus}</span> →{' '}
              <span className="font-mono font-semibold">{config.targetStatus}</span>
            </p>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm text-warning dark:border-warning dark:bg-warning/10 dark:text-warning">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              This action will be logged in the audit trail with your user ID and reason.
              This is a privileged operation and should only be used when necessary.
            </p>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Explain why this override is necessary..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              {reason.trim().length < MIN_REASON_LENGTH
                ? `Minimum ${MIN_REASON_LENGTH} characters required (${reason.trim().length}/${MIN_REASON_LENGTH})`
                : `${reason.trim().length} characters`}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid || isPending}
            variant={overrideType === 'CANCEL' ? 'destructive' : 'default'}
          >
            {isPending ? 'Processing...' : `Confirm ${config.title}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SuperAdminOverrideModal;
