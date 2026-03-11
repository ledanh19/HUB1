/**
 * SAFE QUERY / MUTATION WRAPPERS — Global Auth Interceptor for Supabase
 * 
 * safeQuery: Executes query → if auth error → refresh → retry once → or expire
 * safeRpc: Same as safeQuery for RPC calls
 * safeMutation: Executes mutation → if auth error → refresh ONLY, NO retry
 *   (prevents double-execution of financial operations)
 * 
 * @author Session Reliability V1 + V1.1
 */

import { sessionManager } from '@/auth/sessionManager';
import { SESSION_RECOVERY_V1 } from '@/auth/featureFlags';
import { createLogger, setLastRequestId } from '@/lib/logger';

const log = createLogger('SafeQuery');

// ── Auth Error Detection ──

const AUTH_ERROR_MESSAGES = [
    'jwt expired',
    'invalid claim',
    'session not found',
    'refresh_token',
    'not authenticated',
    'invalid token',
    'token is expired',
    'no session found',
    'session_not_found',
    'auth session missing',
];

const AUTH_ERROR_CODES = [
    'PGRST301', // PostgREST auth error
    'session_not_found',
    'refresh_token_not_found',
];

/**
 * Check if an error indicates an auth/session problem.
 * 
 * IMPORTANT: 403 (Forbidden/RLS) is NOT an auth error.
 * 403 = user is authenticated but lacks permission (RLS deny).
 * 401 = user is not authenticated (token expired/missing).
 * Treating 403 as auth would cause refresh loops on RLS errors.
 */
export function isAuthError(error: any): boolean {
    if (!error) return false;

    // Check error name
    if (error.name === 'AuthSessionMissingError' || error.name === 'AuthApiError') {
        return true;
    }

    // Check status code — only 401 (Unauthorized) and 419 (Session Expired)
    // NOT 403 — that's RLS/permission, not auth expiry
    const status = error.status ?? error.statusCode;
    if (status === 401 || status === 419) {
        return true;
    }

    // Check error message
    const message = (error.message || error.msg || String(error)).toLowerCase();
    if (AUTH_ERROR_MESSAGES.some(m => message.includes(m))) {
        return true;
    }

    // Check error code
    const code = error.code || error.error_code || '';
    if (AUTH_ERROR_CODES.includes(code)) {
        return true;
    }

    return false;
}

/**
 * Execute a Supabase query with automatic auth recovery
 * 
 * Retries ONCE on auth error after refreshing session.
 */
export async function safeQuery<T>(
    queryFn: () => PromiseLike<{ data: T; error: any }>
): Promise<{ data: T; error: any }> {
    if (!SESSION_RECOVERY_V1) {
        return queryFn();
    }

    const result = await queryFn();

    if (!result.error || !isAuthError(result.error)) {
        return result;
    }

    log.warn('Auth error detected, attempting recovery...', {
        data: { error: result.error.message || result.error },
    });

    const refreshed = await sessionManager.refreshSession();

    if (!refreshed) {
        log.error('Refresh failed, session expired');
        return result;
    }

    // Retry the query once
    log.info('Session refreshed, retrying query...');
    const retryResult = await queryFn();

    if (retryResult.error && isAuthError(retryResult.error)) {
        log.error('Retry still failed with auth error — giving up');
        sessionManager.signOutAndRedirect('expired');
    }

    return retryResult;
}

/**
 * Execute a Supabase RPC call with automatic auth recovery
 */
export async function safeRpc<T>(
    rpcFn: () => PromiseLike<{ data: T; error: any }>
): Promise<{ data: T; error: any }> {
    return safeQuery(rpcFn);
}

/**
 * Execute a Supabase MUTATION with auth error detection.
 * 
 * IMPORTANT: Does NOT auto-retry to prevent double-execution
 * of financial operations (insert/update/delete).
 * 
 * If auth error is detected:
 * 1. Refreshes the session
 * 2. Returns the ORIGINAL error to the caller
 * 3. Caller is responsible for deciding whether to retry
 * 
 * Usage:
 * ```ts
 * const { data, error, wasAuthError } = await safeMutation(() =>
 *   supabase.from('table').insert({ ... })
 * );
 * if (wasAuthError) {
 *   // Session was refreshed, you may retry if safe
 * }
 * ```
 */
export async function safeMutation<T>(
    mutationFn: () => PromiseLike<{ data: T; error: any }>
): Promise<{ data: T; error: any; wasAuthError: boolean }> {
    if (!SESSION_RECOVERY_V1) {
        const result = await mutationFn();
        return { ...result, wasAuthError: false };
    }

    const result = await mutationFn();

    if (!result.error || !isAuthError(result.error)) {
        return { ...result, wasAuthError: false };
    }

    // Auth error detected — refresh session but DO NOT retry mutation
    log.warn('Mutation auth error detected, refreshing session (no auto-retry)...', {
        data: { error: result.error.message || result.error },
    });

    const refreshed = await sessionManager.refreshSession();

    if (!refreshed) {
        log.error('Mutation: refresh failed, session expired');
        // sessionManager already emits session:expired
    }

    // Return original error + flag so caller can decide to retry
    return { ...result, wasAuthError: true };
}

