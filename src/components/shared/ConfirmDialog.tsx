import * as React from "react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  /** Trigger element (button/link) */
  trigger: React.ReactNode;
  /** Dialog title */
  title: string;
  /** Dialog description */
  description?: string;
  /** Confirm button label (default: "Xác nhận") */
  confirmLabel?: string;
  /** Cancel button label (default: "Huỷ") */
  cancelLabel?: string;
  /** Confirm callback */
  onConfirm: () => void;
  /** Destructive style for confirm button */
  destructive?: boolean;
  /** Control open state externally */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * ConfirmDialog – standard confirmation pattern.
 *
 * Wraps AlertDialog with sensible defaults.
 *
 * Usage:
 * ```tsx
 * <ConfirmDialog
 *   trigger={<Button variant="destructive">Xoá</Button>}
 *   title="Xoá booking?"
 *   description="Thao tác này không thể hoàn tác."
 *   onConfirm={handleDelete}
 *   destructive
 * />
 * ```
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  onConfirm,
  destructive = false,
  open,
  onOpenChange,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
