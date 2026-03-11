/**
 * SESSION MANAGER — Single Source of Truth for Auth Session
 * 
 * Responsibilities:
 * - Listen to supabase auth state changes
 * - Listen to visibility/focus events for tab-resume recovery
 * - Provide refresh mutex (only 1 refresh at a time)
 * - Emit structured events for other modules (QueryClient, UI)
 * - Cooldown to prevent refresh spam
 * 
 * @author Session Reliability V1
 */

import { supabase } from '@/integrations/supabase/client';
import { SESSION_RECOVERY_V1, SESSION_RECOVERY_LOGGING } from './featureFlags';

// ── Types ──

export type SessionStatus = 'AUTHENTICATED' | 'EXPIRED' | 'REFRESHING' | 'SIGNED_OUT' | 'INITIALIZING';

export type SessionEvent = 'session:ok' | 'session:refreshing' | 'session:expired' | 'session:signed_out';

// ── Constants ──

const REFRESH_COOLDOWN_MS = 10_000; // 10 seconds between refresh attempts
const TOKEN_EXPIRY_BUFFER_S = 60;   // Refresh if token expires within 60 seconds
const MAX_REFRESH_RETRIES = 1;      // Only retry refresh once

// ── Session Manager Class ──

class SessionManagerClass extends EventTarget {
    private _status: SessionStatus = 'INITIALIZING';
    private _refreshPromise: Promise<boolean> | null = null;
    private _lastRefreshAt = 0;
    private _initialized = false;
    private _visibilityHandler: (() => void) | null = null;
    private _focusHandler: (() => void) | null = null;

    get status(): SessionStatus {
        return this._status;
    }

    isAuthenticated(): boolean {
        return this._status === 'AUTHENTICATED';
    }

    /**
     * Initialize the session manager (call once at app start)
     */
    initialize(): void {
        if (this._initialized || !SESSION_RECOVERY_V1) return;

        this._log('Initializing session manager...');

        // 1. Listen to Supabase auth state changes
        supabase.auth.onAuthStateChange((event, session) => {
            this._log(`Auth state change: ${event}`, { hasSession: !!session });

            switch (event) {
                case 'SIGNED_IN':
                case 'TOKEN_REFRESHED':
                case 'INITIAL_SESSION':
                    if (session) {
                        this._setStatus('AUTHENTICATED');
                        this._emit('session:ok');
                    }
                    break;
                case 'SIGNED_OUT':
                    this._setStatus('SIGNED_OUT');
                    this._emit('session:signed_out');
                    break;
            }
        });

        // 2. Listen for tab visibility change
        this._visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                this._onTabResume('visibility');
            }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);

        // 3. Listen for window focus
        this._focusHandler = () => {
            this._onTabResume('focus');
        };
        window.addEventListener('focus', this._focusHandler);

        this._initialized = true;
    }

    /**
     * Ensure the current session is valid.
     * If expired or about to expire, refresh.
     * Returns 'OK' or 'EXPIRED'.
     */
    async ensureValidSession(): Promise<'OK' | 'EXPIRED'> {
        if (!SESSION_RECOVERY_V1) return 'OK';

        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                this._log('No session found');
                this._setStatus('EXPIRED');
                this._emit('session:expired');
                return 'EXPIRED';
            }

            // Check if token is about to expire
            const expiresAt = session.expires_at ?? 0;
            const nowSeconds = Math.floor(Date.now() / 1000);
            const timeLeft = expiresAt - nowSeconds;

            if (timeLeft < TOKEN_EXPIRY_BUFFER_S) {
                this._log(`Token expires in ${timeLeft}s, refreshing...`);
                const refreshed = await this.refreshSession();
                return refreshed ? 'OK' : 'EXPIRED';
            }

            this._setStatus('AUTHENTICATED');
            return 'OK';
        } catch (err) {
            this._log('Error checking session', err);
            return 'EXPIRED';
        }
    }

    /**
     * Refresh the session — MUTEX protected.
     * If another refresh is in progress, await it instead of starting a new one.
     * Returns true if refresh succeeded.
     */
    async refreshSession(): Promise<boolean> {
        if (!SESSION_RECOVERY_V1) return true;

        // Cooldown check
        const now = Date.now();
        if (now - this._lastRefreshAt < REFRESH_COOLDOWN_MS) {
            this._log('Refresh cooldown active, skipping');
            return this._status === 'AUTHENTICATED';
        }

        // Mutex: if refresh is already in-flight, wait for it
        if (this._refreshPromise) {
            this._log('Refresh already in progress, awaiting...');
            return this._refreshPromise;
        }

        // Start the refresh
        this._refreshPromise = this._doRefresh();

        try {
            return await this._refreshPromise;
        } finally {
            this._refreshPromise = null;
        }
    }

    /**
     * Sign out and redirect to login
     */
    signOutAndRedirect(reason: string = 'expired'): void {
        this._log(`Signing out, reason: ${reason}`);
        this._setStatus('SIGNED_OUT');
        this._emit('session:signed_out');

        supabase.auth.signOut().finally(() => {
            window.location.href = `/auth?reason=${encodeURIComponent(reason)}`;
        });
    }

    /**
     * Destroy the session manager (cleanup)
     */
    destroy(): void {
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
        }
        if (this._focusHandler) {
            window.removeEventListener('focus', this._focusHandler);
        }
        this._initialized = false;
    }

    // ── Private Methods ──

    private async _doRefresh(): Promise<boolean> {
        this._setStatus('REFRESHING');
        this._emit('session:refreshing');
        this._lastRefreshAt = Date.now();

        for (let attempt = 0; attempt <= MAX_REFRESH_RETRIES; attempt++) {
            try {
                this._log(`Refresh attempt ${attempt + 1}/${MAX_REFRESH_RETRIES + 1}`);
                const { data, error } = await supabase.auth.refreshSession();

                if (error) {
                    this._log('Refresh failed', error.message);
                    if (attempt === MAX_REFRESH_RETRIES) break;
                    // Wait briefly before retry
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                if (data.session) {
                    this._log('Refresh succeeded');
                    this._setStatus('AUTHENTICATED');
                    this._emit('session:ok');
                    return true;
                }
            } catch (err) {
                this._log('Refresh error', err);
                if (attempt === MAX_REFRESH_RETRIES) break;
            }
        }

        // All retries exhausted
        this._log('All refresh attempts failed → EXPIRED');
        this._setStatus('EXPIRED');
        this._emit('session:expired');
        return false;
    }

    private _onTabResume(source: 'visibility' | 'focus'): void {
        if (this._status === 'SIGNED_OUT') return;

        // Skip session validation on public pages (no auth required)
        const publicPaths = ['/about', '/privacy-policy', '/terms', '/auth', '/docs', '/403'];
        const currentPath = window.location.pathname;
        if (publicPaths.some(p => currentPath === p || currentPath.startsWith(p + '/'))) {
            return;
        }

        this._log(`Tab resumed (${source})`);

        // Debounce: don't check if we just refreshed
        if (Date.now() - this._lastRefreshAt < REFRESH_COOLDOWN_MS) {
            this._log('Recently refreshed, skipping resume check');
            return;
        }

        // Fire-and-forget session validation
        this.ensureValidSession().catch((err) => {
            this._log('Resume session check failed', err);
        });
    }

    private _setStatus(status: SessionStatus): void {
        if (this._status !== status) {
            this._log(`Status: ${this._status} → ${status}`);
            this._status = status;
        }
    }

    private _emit(event: SessionEvent): void {
        this.dispatchEvent(new CustomEvent(event));
    }

    private _log(message: string, ...args: any[]): void {
        if (SESSION_RECOVERY_LOGGING) {
            console.log(`[SessionManager] ${message}`, ...args);
        }
    }
}

// ── Singleton Export ──

export const sessionManager = new SessionManagerClass();
