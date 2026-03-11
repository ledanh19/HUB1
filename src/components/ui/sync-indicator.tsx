import { RefreshCw, Check, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLastSyncedAt } from "@/hooks/useMutationWrapper";
import { useRealtimeSystem } from "@/hooks/useRealtimeSystem";

interface SyncIndicatorProps {
  isSyncing?: boolean;
  lastSyncedAt?: Date | null;
  error?: string | null;
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
}

/**
 * SyncIndicator - Shows real-time sync status
 * 
 * States:
 * - Syncing: Spinning icon
 * - Synced: Green check with timestamp
 * - Error: Red alert icon
 * - Disconnected: No wifi icon
 */
export function SyncIndicator({
  isSyncing = false,
  lastSyncedAt,
  error,
  className,
  showLabel = true,
  size = "sm",
}: SyncIndicatorProps) {
  const { isConnected } = useRealtimeSystem();
  
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";
  
  if (error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1.5 text-destructive", className)}>
            <AlertCircle className={iconSize} />
            {showLabel && <span className={textSize}>Lỗi đồng bộ</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{error}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  if (!isConnected) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1.5 text-muted-foreground", className)}>
            <WifiOff className={iconSize} />
            {showLabel && <span className={textSize}>Mất kết nối</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Kết nối realtime bị gián đoạn. Đang thử kết nối lại...</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  if (isSyncing) {
    return (
      <div className={cn("flex items-center gap-1.5 text-primary", className)}>
        <RefreshCw className={cn(iconSize, "animate-spin")} />
        {showLabel && <span className={textSize}>Đang đồng bộ...</span>}
      </div>
    );
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-1.5 text-muted-foreground", className)}>
          <Wifi className={cn(iconSize, "text-success")} />
          {showLabel && (
            <span className={textSize}>
              Cập nhật: {formatLastSyncedAt(lastSyncedAt ?? null)}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Kết nối realtime hoạt động</p>
        {lastSyncedAt && (
          <p className="text-xs text-muted-foreground">
            Lần cuối: {lastSyncedAt.toLocaleString("vi-VN")}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * RowSyncingDot - Small indicator for table rows
 */
export function RowSyncingDot({ isSyncing }: { isSyncing: boolean }) {
  if (!isSyncing) return null;
  
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
    </span>
  );
}

/**
 * LastUpdatedTimestamp - Simple timestamp display
 */
export function LastUpdatedTimestamp({ 
  date, 
  prefix = "Cập nhật lúc",
  className,
}: { 
  date: Date | null;
  prefix?: string;
  className?: string;
}) {
  if (!date) return null;
  
  return (
    <span className={cn("text-xs text-muted-foreground", className)}>
      {prefix}: {date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
    </span>
  );
}

/**
 * ConnectionStatus - Shows realtime connection status
 */
export function ConnectionStatus({ showLabel = true }: { showLabel?: boolean }) {
  const { isConnected, lastUpdateAt } = useRealtimeSystem();
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success/100"></span>
              </span>
              {showLabel && <span className="text-xs text-success">Live</span>}
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-warning/100"></span>
              </span>
              {showLabel && <span className="text-xs text-warning">Đang kết nối...</span>}
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{isConnected ? "Kết nối realtime hoạt động" : "Đang thiết lập kết nối..."}</p>
        {lastUpdateAt && (
          <p className="text-xs text-muted-foreground">
            Dữ liệu mới nhất: {new Date(lastUpdateAt).toLocaleTimeString("vi-VN")}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
