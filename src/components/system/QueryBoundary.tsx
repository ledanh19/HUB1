/**
 * QueryBoundary — Unified Loading / Error / Empty state wrapper
 * 
 * Eliminates the pattern: `if (isLoading) return <Skeleton />` without error handling.
 * 
 * 3 states:
 * - Loading: spinner with 15s timeout fallback showing Retry
 * - Error: message + Retry button
 * - Empty: configurable empty state
 * 
 * @author Session Reliability V1
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw, AlertCircle, Inbox, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLastRequestId as _getLastRequestId } from '@/lib/logger';

const LOADING_TIMEOUT_MS = 15_000; // 15 seconds

interface QueryBoundaryProps {
    /** React Query isLoading / isPending state */
    isLoading: boolean;
    /** React Query error object */
    error: Error | null | undefined;
    /** Optional retry function (from React Query refetch) */
    onRetry?: () => void;
    /** Content to render when data is loaded */
    children: ReactNode;
    /** Optional: show empty state instead of children */
    isEmpty?: boolean;
    /** Optional: custom empty state message */
    emptyMessage?: string;
    /** Optional: custom empty state icon */
    emptyIcon?: ReactNode;
    /** Optional: custom loading component */
    loadingFallback?: ReactNode;
    /** Optional: loading timeout in ms (default 15s) */
    loadingTimeoutMs?: number;
}

export function QueryBoundary({
    isLoading,
    error,
    onRetry,
    children,
    isEmpty = false,
    emptyMessage = 'Không có dữ liệu',
    emptyIcon,
    loadingFallback,
    loadingTimeoutMs = LOADING_TIMEOUT_MS,
}: QueryBoundaryProps) {
    const [timedOut, setTimedOut] = useState(false);

    // Reset timeout when loading state changes
    useEffect(() => {
        if (!isLoading) {
            setTimedOut(false);
            return;
        }

        const timer = setTimeout(() => {
            setTimedOut(true);
        }, loadingTimeoutMs);

        return () => clearTimeout(timer);
    }, [isLoading, loadingTimeoutMs]);

    // ── Error State ──
    if (error) {
        const requestId = _getLastRequestId();
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div className="text-center">
                    <p className="text-sm font-medium text-destructive">
                        Đã xảy ra lỗi
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md">
                        {error.message || 'Không thể tải dữ liệu. Vui lòng thử lại.'}
                    </p>
                    {requestId && (
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(requestId).then(() => {
                                    // Simple visual feedback
                                    const btn = document.activeElement as HTMLButtonElement;
                                    if (btn) {
                                        const orig = btn.textContent;
                                        btn.textContent = 'Đã copy!';
                                        setTimeout(() => { btn.textContent = orig; }, 1500);
                                    }
                                });
                            }}
                            className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors cursor-pointer"
                            title="Copy Request ID"
                        >
                            <Copy className="h-3 w-3" />
                            {requestId}
                        </button>
                    )}
                </div>
                {onRetry && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="mt-2"
                    >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Thử lại
                    </Button>
                )}
            </div>
        );
    }

    // ── Loading State ──
    if (isLoading) {
        // Timed out: show retry option
        if (timedOut) {
            return (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                    <div className="text-center">
                        <p className="text-sm font-medium text-foreground">
                            Kết nối chậm
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Đang tải lâu hơn bình thường. Bạn có thể thử lại.
                        </p>
                    </div>
                    {onRetry && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onRetry}
                            className="mt-2"
                        >
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                            Thử lại
                        </Button>
                    )}
                </div>
            );
        }

        // Normal loading
        if (loadingFallback) return <>{loadingFallback}</>;

        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    // ── Empty State ──
    if (isEmpty) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                {emptyIcon || <Inbox className="h-8 w-8" />}
                <p className="text-sm">{emptyMessage}</p>
            </div>
        );
    }

    // ── Content ──
    return <>{children}</>;
}
