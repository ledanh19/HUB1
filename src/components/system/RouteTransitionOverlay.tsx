/**
 * RouteTransitionOverlay — Shown only when heavy route prefetch
 * takes too long (>800ms visible, >10s shows retry/cancel).
 *
 * SESSION_RECOVERY_V1: Added 15s never-stuck failsafe.
 * If overlay is active >15s, auto-cancel to prevent permanent stuck state.
 *
 * - Debounced: not shown for fast transitions
 * - After timeout: shows message + Retry + Cancel
 * - Cancel: aborts fetch, returns to IDLE (no stuck UI)
 * - Retry: calls retry function from context (re-triggers prefetch)
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouteTransition } from '@/contexts/RouteTransitionContext';
import { Loader2, RefreshCw, X } from 'lucide-react';

const SHOW_DELAY_MS = 800; // Don't show overlay for fast transitions
const NEVER_STUCK_TIMEOUT_MS = 15_000; // 15s failsafe — auto-cancel if stuck

export function RouteTransitionOverlay() {
    const { state, actions } = useRouteTransition();
    const [visible, setVisible] = useState(false);

    const isActive = state.status === 'PREFETCHING' || state.status === 'TIMEOUT' || state.status === 'ERROR';

    // Debounce: only show overlay after SHOW_DELAY_MS
    useEffect(() => {
        if (!isActive) {
            setVisible(false);
            return;
        }
        const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        return () => clearTimeout(timer);
    }, [isActive]);

    // SESSION_RECOVERY_V1: Never-stuck failsafe
    // If overlay stays active for >15s, auto-cancel it
    useEffect(() => {
        if (!isActive) return;

        const failsafe = setTimeout(() => {
            console.warn('[RouteTransitionOverlay] 15s failsafe triggered — showing recovery UI');
            // Instead of auto-cancel, transition to TIMEOUT so user sees retry option
            if (state.status === 'PREFETCHING') {
                actions.timeout();
            } else {
                // Already in TIMEOUT or ERROR — force cancel
                actions.cancel();
            }
        }, NEVER_STUCK_TIMEOUT_MS);

        return () => clearTimeout(failsafe);
    }, [isActive, state.requestId]); // Reset timer on new request

    const handleRetry = useCallback(() => {
        if (state.retry) {
            state.retry();
        }
    }, [state.retry]);

    const handleRetryLastIntent = useCallback(() => {
        actions.retryLastIntent();
    }, [actions]);

    const handleCancel = useCallback(() => {
        actions.cancel();
    }, [actions]);

    if (!visible || !isActive) return null;

    return (
        <div
            className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/5 transition-opacity duration-200"
            onClick={(e) => {
                // Only cancel if clicking the backdrop itself
                if (e.target === e.currentTarget) handleCancel();
            }}
        >
            <div className="rounded-xl bg-card border border-border shadow-xl px-6 py-5 max-w-sm mx-4 animate-fade-in">
                {/* PREFETCHING state — just spinner */}
                {state.status === 'PREFETCHING' && (
                    <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-sm font-medium text-foreground">
                            Đang tải dữ liệu…
                        </span>
                    </div>
                )}

                {/* TIMEOUT state — recovery message + retry data + cancel */}
                {state.status === 'TIMEOUT' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    Kết nối chậm
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Bạn muốn thử tải lại dữ liệu không?
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={handleCancel}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                                Hủy
                            </button>
                            <button
                                onClick={handleRetryLastIntent}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Thử lại
                            </button>
                        </div>
                    </div>
                )}

                {/* ERROR state — error message + retry + cancel */}
                {state.status === 'ERROR' && (
                    <div className="space-y-3">
                        <div>
                            <p className="text-sm font-medium text-destructive">
                                Không thể tải trang
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {state.error?.message || 'Đã xảy ra lỗi không xác định.'}
                            </p>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={handleCancel}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                                Hủy
                            </button>
                            <button
                                onClick={handleRetry}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Thử lại
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
