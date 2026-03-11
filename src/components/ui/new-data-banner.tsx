import * as React from "react";
import { RefreshCw, X, AlertCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * New Data Banner
 * 
 * Displays when new data is available from realtime updates.
 * User can click to refresh or dismiss.
 * 
 * DOES NOT auto-insert rows when user is scrolling - 
 * shows this banner instead to avoid "UI jumping"
 */
interface NewDataBannerProps {
  count: number;
  onRefresh: () => void;
  onDismiss?: () => void;
  className?: string;
  message?: string;
}

export function NewDataBanner({
  count,
  onRefresh,
  onDismiss,
  className,
  message,
}: NewDataBannerProps) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2",
        "bg-primary/10 border border-primary/20 rounded-lg",
        "animate-in slide-in-from-top-2 duration-motion-panel",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        <RefreshCw className="h-4 w-4 text-primary animate-spin-slow" />
        <span className="font-medium text-primary">
          {message || `Có ${count} cập nhật mới`}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-7 px-3 text-xs font-medium text-primary hover:bg-primary/20"
        >
          Tải mới
        </Button>
        
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Conflict Banner
 * 
 * Shows when data has been modified by another user
 * Provides options to reload, compare, or force overwrite (admin only)
 */
interface ConflictBannerProps {
  modifiedBy?: string;
  modifiedAt?: string;
  onReload: () => void;
  onCompare?: () => void;
  onForceOverwrite?: () => void;
  canForceOverwrite?: boolean;
  className?: string;
}

export function ConflictBanner({
  modifiedBy,
  modifiedAt,
  onReload,
  onCompare,
  onForceOverwrite,
  canForceOverwrite = false,
  className,
}: ConflictBannerProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-4",
        "bg-destructive/10 border border-destructive/30 rounded-lg",
        "animate-in slide-in-from-top-2 duration-motion-fast",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-destructive">
            Dữ liệu đã được cập nhật bởi người khác
          </p>
          <p className="text-sm text-muted-foreground">
            {modifiedBy && `Người thay đổi: ${modifiedBy}`}
            {modifiedAt && ` • ${new Date(modifiedAt).toLocaleString("vi-VN")}`}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 ml-8">
        <Button
          variant="outline"
          size="sm"
          onClick={onReload}
          className="h-8"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Tải bản mới
        </Button>
        
        {onCompare && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCompare}
            className="h-8"
          >
            So sánh
          </Button>
        )}
        
        {canForceOverwrite && onForceOverwrite && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onForceOverwrite}
            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            Ghi đè
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Editing Indicator
 * 
 * Shows when another user is currently editing this record
 */
interface EditingIndicatorProps {
  editors: { userId: string; userName: string; startedAt: string }[];
  onTakeOver?: () => void;
  canTakeOver?: boolean;
  className?: string;
}

export function EditingIndicator({
  editors,
  onTakeOver,
  canTakeOver = false,
  className,
}: EditingIndicatorProps) {
  if (editors.length === 0) return null;

  const primaryEditor = editors[0];
  const editingDuration = primaryEditor.startedAt
    ? Math.floor((Date.now() - new Date(primaryEditor.startedAt).getTime()) / 60000)
    : 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2",
        "bg-warning/100/10 border border-warning/30 rounded-lg",
        "animate-in fade-in duration-motion-fast",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        <div className="relative">
          <Users className="h-4 w-4 text-warning" />
          <span className="absolute -top-1 -right-1 h-2 w-2 bg-warning/100 rounded-full animate-pulse" />
        </div>
        <span className="text-warning">
          Đang được chỉnh sửa bởi <strong>{primaryEditor.userName}</strong>
          {editingDuration > 0 && ` (${editingDuration} phút)`}
        </span>
      </div>
      
      {canTakeOver && onTakeOver && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onTakeOver}
          className="h-7 px-3 text-xs text-warning hover:bg-warning/100/20"
        >
          Take over
        </Button>
      )}
    </div>
  );
}

/**
 * Viewers Count Badge
 * 
 * Shows how many users are currently viewing this record
 */
interface ViewersCountProps {
  count: number;
  className?: string;
}

export function ViewersCount({ count, className }: ViewersCountProps) {
  if (count <= 1) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full",
        "bg-muted/50 text-muted-foreground text-xs",
        className
      )}
    >
      <Users className="h-3 w-3" />
      <span>{count} người đang xem</span>
    </div>
  );
}

/**
 * Processing Overlay
 * 
 * Shows during API calls to prevent double-actions
 * Used for financial transactions (pessimistic UI)
 */
interface ProcessingOverlayProps {
  isProcessing: boolean;
  message?: string;
  className?: string;
}

export function ProcessingOverlay({
  isProcessing,
  message = "Đang xử lý...",
  className,
}: ProcessingOverlayProps) {
  if (!isProcessing) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center",
        "bg-background/90 rounded-lg z-50",
        "animate-in fade-in duration-motion-micro",
        className
      )}
    >
      <div className="flex items-center gap-3 px-4 py-2 bg-card rounded-lg shadow-lg border">
        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
