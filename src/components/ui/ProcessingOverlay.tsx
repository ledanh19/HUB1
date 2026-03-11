import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ProcessingOverlayProps {
  /** Whether the item is being processed */
  isProcessing: boolean;
  /** Optional processing text */
  text?: string;
  /** Custom className */
  className?: string;
}

/**
 * Processing Overlay for Optimistic Updates
 * 
 * UX Governance Rules:
 * - Shows visual feedback during async operations
 * - Prevents interaction during processing
 * - Clear "syncing" indicator
 * 
 * Usage:
 * <div className="relative">
 *   <ProcessingOverlay isProcessing={row._isOptimistic} />
 *   {children}
 * </div>
 */
export function ProcessingOverlay({ 
  isProcessing, 
  text = "Đang đồng bộ...",
  className 
}: ProcessingOverlayProps) {
  if (!isProcessing) return null;
  
  return (
    <div 
      className={cn(
        "absolute inset-0 z-10",
        "bg-background/60",
        "flex items-center justify-center",
        "rounded-md",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{text}</span>
      </div>
    </div>
  );
}

/**
 * Processing Badge - inline indicator for row status
 */
interface ProcessingBadgeProps {
  isProcessing: boolean;
  text?: string;
  className?: string;
}

export function ProcessingBadge({ 
  isProcessing, 
  text = "Đang xử lý",
  className 
}: ProcessingBadgeProps) {
  if (!isProcessing) return null;
  
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1.5",
        "text-xs text-muted-foreground",
        "animate-pulse",
        className
      )}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      {text}
    </span>
  );
}

/**
 * Processing Row - wrapper to indicate row is being processed
 */
interface ProcessingRowProps {
  isProcessing: boolean;
  children: React.ReactNode;
  className?: string;
}

export function ProcessingRow({ 
  isProcessing, 
  children,
  className 
}: ProcessingRowProps) {
  return (
    <div 
      className={cn(
        "relative transition-all duration-150",
        isProcessing && "opacity-70 pointer-events-none",
        className
      )}
    >
      {children}
      {isProcessing && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <ProcessingBadge isProcessing />
        </div>
      )}
    </div>
  );
}

export default ProcessingOverlay;
