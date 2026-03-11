import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react';
import { queryClient } from '@/lib/queryClient';

// ── State Machine ──
export type TransitionStatus = 'IDLE' | 'PREFETCHING' | 'TIMEOUT' | 'ERROR';

export interface LastIntent {
    from: string | null;
    to: string;
    timestamp: number;
}

export interface RouteTransitionState {
    status: TransitionStatus;
    targetRoute: string | null;
    startTime: number | null;
    error: Error | null;
    requestId: number;
    retry: (() => void) | null;
    lastIntent: LastIntent | null;
    failsafeRetried: boolean; // prevent infinite retry loop
}

export interface RouteTransitionActions {
    /** Begin a transition — returns the requestId for latest-wins check */
    start: (targetRoute: string, retryFn?: () => void) => number;
    /** Mark current transition as successful */
    succeed: () => void;
    /** Mark current transition as failed */
    fail: (error: Error, retryFn?: () => void) => void;
    /** Mark current transition as timed out (does NOT auto-cancel; only changes overlay UI) */
    timeout: () => void;
    /** Cancel any in-flight transition and return to IDLE */
    cancel: () => void;
    /** Get the current requestId for staleness check */
    getRequestId: () => number;
    /** Get the AbortController for the current transition */
    getAbortController: () => AbortController | null;
    /** Retry last route intent + refetch active queries (max 1 per failsafe) */
    retryLastIntent: () => void;
}

export interface RouteTransitionContextValue {
    state: RouteTransitionState;
    actions: RouteTransitionActions;
}

const initialState: RouteTransitionState = {
    status: 'IDLE',
    targetRoute: null,
    startTime: null,
    error: null,
    requestId: 0,
    retry: null,
    lastIntent: null,
    failsafeRetried: false,
};

const RouteTransitionContext = createContext<RouteTransitionContextValue | null>(null);

export function RouteTransitionProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<RouteTransitionState>(initialState);
    const requestIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    const start = useCallback((targetRoute: string, retryFn?: () => void): number => {
        // Abort any previous in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const newId = ++requestIdRef.current;

        setState(prev => ({
            status: 'PREFETCHING',
            targetRoute,
            startTime: Date.now(),
            error: null,
            requestId: newId,
            retry: retryFn || null,
            lastIntent: {
                from: prev.targetRoute || (typeof window !== 'undefined' ? window.location.pathname : null),
                to: targetRoute,
                timestamp: Date.now(),
            },
            failsafeRetried: false,
        }));
        return newId;
    }, []);

    const succeed = useCallback(() => {
        abortControllerRef.current = null;
        setState(prev => ({
            ...initialState,
            lastIntent: prev.lastIntent, // preserve for debug
        }));
    }, []);

    const fail = useCallback((error: Error, retryFn?: () => void) => {
        abortControllerRef.current = null;
        setState(prev => ({
            ...prev,
            status: 'ERROR',
            error,
            retry: retryFn || prev.retry,
        }));
    }, []);

    const timeout = useCallback(() => {
        // Does NOT cancel the request — just changes overlay UI to show retry/cancel
        setState(prev => ({ ...prev, status: 'TIMEOUT' }));
    }, []);

    const cancel = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        requestIdRef.current++; // invalidate any in-flight completions
        setState(prev => ({
            ...initialState,
            lastIntent: prev.lastIntent,
        }));
    }, []);

    const retryLastIntent = useCallback(() => {
        setState(prev => {
            // Max 1 retry per failsafe event
            if (prev.failsafeRetried) {
                console.warn('[RouteTransition] retryLastIntent blocked — already retried');
                return prev;
            }

            console.log('[RouteTransition] retryLastIntent — refetching active queries');
            // Refetch all active queries
            queryClient.refetchQueries({ type: 'active' });

            // If there's a retry function from the original transition, call it
            if (prev.retry) {
                prev.retry();
            }

            return {
                ...initialState,
                lastIntent: prev.lastIntent,
                failsafeRetried: true,
            };
        });
    }, []);

    const getRequestId = useCallback(() => requestIdRef.current, []);
    const getAbortController = useCallback(() => abortControllerRef.current, []);

    const actions: RouteTransitionActions = {
        start, succeed, fail, timeout, cancel, getRequestId, getAbortController, retryLastIntent,
    };

    return (
        <RouteTransitionContext.Provider value={{ state, actions }}>
            {children}
        </RouteTransitionContext.Provider>
    );
}

/**
 * Hook to access route transition state + actions.
 * Must be used inside RouteTransitionProvider.
 */
export function useRouteTransition(): RouteTransitionContextValue {
    const ctx = useContext(RouteTransitionContext);
    if (!ctx) throw new Error('useRouteTransition must be inside RouteTransitionProvider');
    return ctx;
}

