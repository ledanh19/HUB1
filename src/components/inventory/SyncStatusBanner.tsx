import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SyncStatusCounts {
  pending: number;
  synced: number;
  failed: number;
}

interface SyncStatusBannerProps {
  counts: SyncStatusCounts;
  isRetrying?: boolean;
  onRetryFailed?: () => void;
}

export function SyncStatusBanner({ counts, isRetrying, onRetryFailed }: SyncStatusBannerProps) {
  const { pending, synced, failed } = counts;
  const total = pending + synced + failed;
  
  if (total === 0) return null;
  
  // All synced - success state
  if (pending === 0 && failed === 0 && synced > 0) {
    return (
      <Alert className="bg-success/10 border-success/20 dark:bg-success/10 dark:border-success">
        <CheckCircle2 className="h-4 w-4 text-success" />
        <AlertDescription className="flex items-center justify-between w-full">
          <span className="text-success dark:text-success">
            Tất cả {synced} cells đã đồng bộ thành công (trong khung ngày đang xem)
          </span>
        </AlertDescription>
      </Alert>
    );
  }
  
  // Has pending - syncing state
  if (pending > 0) {
    return (
      <Alert className="bg-info/10 border-info/20 dark:bg-info/10 dark:border-info">
        <Loader2 className="h-4 w-4 text-info animate-spin" />
        <AlertDescription className="flex items-center justify-between w-full">
          <span className="text-info dark:text-info">
            Đã lưu thay đổi. Đang đồng bộ {pending} cells...
            {synced > 0 && ` (${synced} đã đồng bộ)`}
          </span>
        </AlertDescription>
      </Alert>
    );
  }
  
  // Has failed - error state
  if (failed > 0) {
    return (
      <Alert className="bg-destructive/10 border-destructive/20 dark:bg-destructive/10 ">
        <AlertCircle className="h-4 w-4 text-destructive dark:text-destructive" />
        <AlertDescription className="flex items-center justify-between w-full">
          <span className="text-destructive dark:text-destructive">
            {failed} cells đồng bộ thất bại
            {synced > 0 && ` (${synced} đã đồng bộ)`}
          </span>
          {onRetryFailed && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetryFailed}
              disabled={isRetrying}
              className="ml-4 border-destructive/20 text-destructive hover:bg-destructive/10 dark:border-destructive dark:text-destructive dark:hover:bg-destructive"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Retry Failed
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  
  return null;
}
