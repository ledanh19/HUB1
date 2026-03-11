import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Button } from "./button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "default" | "destructive" | "warning";

interface ConfirmDialogProps {
  /** Control dialog open state */
  open: boolean;
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Dialog description/message */
  description: string;
  /** Confirm button text. Default: "Xác nhận" */
  confirmText?: string;
  /** Cancel button text. Default: "Huỷ" */
  cancelText?: string;
  /** Variant affects confirm button style */
  variant?: ConfirmVariant;
  /** Whether confirm action is in progress */
  isLoading?: boolean;
  /** Callback when user confirms */
  onConfirm: () => void | Promise<void>;
  /** Optional callback when user cancels */
  onCancel?: () => void;
  /** Additional content below description */
  children?: React.ReactNode;
}

/**
 * Standardized Confirm Dialog
 * 
 * UX Governance Rules:
 * - Used for all destructive/important actions
 * - Loading state prevents double-click
 * - Consistent button positioning (Cancel left, Confirm right)
 * - Escape key closes dialog
 * 
 * Usage:
 * <ConfirmDialog
 *   open={showConfirm}
 *   onOpenChange={setShowConfirm}
 *   title="Xác nhận phê duyệt?"
 *   description="Hành động này không thể hoàn tác."
 *   onConfirm={handleApprove}
 *   isLoading={isApproving}
 * />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Xác nhận",
  cancelText = "Huỷ",
  variant = "default",
  isLoading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="animate-scale-in">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        
        {children && (
          <div className="py-4">
            {children}
          </div>
        )}
        
        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              variant === "warning" && "bg-warning text-warning-foreground hover:bg-warning/90"
            )}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmDialog;
