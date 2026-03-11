/**
 * useUserScopedFilterState
 * 
 * Per-user, per-org, per-scope filter state persistence hook.
 * 
 * LOAD ORDER (strict):
 *   1. URL params (runtime override only — highest priority)
 *   2. DB state (user_filter_state table)
 *   3. localStorage per-user key
 *   4. defaults
 * 
 * SAVE RULES:
 *   - localStorage: saved immediately (UX smooth)
 *   - DB: debounced 500ms, upsert deterministic
 *   - Only saved when source = 'USER' (never on 'URL' or 'HYDRATE')
 * 
 * ANTI-LOOP GUARDS:
 *   A) Source flag — prevent persist on 'URL' or 'HYDRATE' updates
 *   B) Deep equality — skip if values unchanged
 *   C) Cancel in-flight DB writes on new user changes
 * 
 * ORG PATTERN: Uses hardcoded org_id '00000000-0000-0000-0000-000000000001'
 * matching the existing codebase pattern (no current_org_id() function exists).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { deepEqual } from '@/lib/deepEqual';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default org_id — matches existing codebase pattern (single-org) */
const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

/** localStorage key format: rr:filters:{org_id}:{user_id}:{scope_key}:v{version} */
const LS_KEY_PREFIX = 'rr:filters';

/** Legacy shared localStorage key prefix (for migration) */
const LEGACY_LS_PREFIX = 'roomrise_filter_';

/** DB write debounce interval */
const DB_DEBOUNCE_MS = 500;

// ============================================================================
// TYPES
// ============================================================================

export type FilterUpdateSource = 'URL' | 'USER' | 'HYDRATE';

export interface UserScopedFilterOptions<T> {
    /** Current schema version for this scope's filter state */
    version?: number;

    /** 
     * Migration function for version mismatches.
     * Return migrated state, or null to fallback to defaults.
     */
    migrateState?: (scopeKey: string, oldVersion: number, newVersion: number, oldState: T) => T | null;

    /**
     * Legacy localStorage key to migrate from (one-time migration).
     * e.g., "bookings" maps to legacy key "roomrise_filter_bookings"
     */
    legacyStorageKey?: string;

    /**
     * Whether to persist to DB. Set to false for URL-only filter hooks
     * that don't need cross-device sync.
     * @default true
     */
    persistToDb?: boolean;
}

interface InternalState<T> {
    state: T;
    source: FilterUpdateSource;
}

// ============================================================================
// HELPERS
// ============================================================================

function buildLsKey(orgId: string, userId: string, scopeKey: string, version: number): string {
    return `${LS_KEY_PREFIX}:${orgId}:${userId}:${scopeKey}:v${version}`;
}

function readFromLocalStorage<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeToLocalStorage<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('[useUserScopedFilterState] localStorage write failed:', e);
    }
}

function readLegacyStorage<T>(legacyKey: string): T | null {
    try {
        const raw = localStorage.getItem(`${LEGACY_LS_PREFIX}${legacyKey}`);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

// ============================================================================
// HOOK
// ============================================================================

export function useUserScopedFilterState<T extends Record<string, unknown>>(
    scopeKey: string,
    defaults: T,
    options: UserScopedFilterOptions<T> = {}
) {
    const {
        version = 1,
        migrateState,
        legacyStorageKey,
        persistToDb = true,
    } = options;

    const { user } = useAuth();
    const userId = user?.id ?? '';
    const orgId = DEFAULT_ORG_ID;

    // ── Refs for stable identity across renders ──
    const dbDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [isHydratedState, setIsHydratedState] = useState(false);
    const isHydratedRef = useRef(false);
    const lastPersistedRef = useRef<T | null>(null);
    const prevIdentityRef = useRef({ userId, orgId });

    // ── Build per-user localStorage key ──
    const lsKey = useMemo(
        () => (userId ? buildLsKey(orgId, userId, scopeKey, version) : ''),
        [orgId, userId, scopeKey, version]
    );

    // ── Internal state with source tracking ──
    const [internal, setInternal] = useState<InternalState<T>>({
        state: defaults,
        source: 'HYDRATE',
    });

    // ────────────────────────────────────────────────────────────────────────────
    // HYDRATION (runs once on mount, or when user/org changes)
    // ────────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!userId) return;

        // Identity change → reset
        if (
            prevIdentityRef.current.userId !== userId ||
            prevIdentityRef.current.orgId !== orgId
        ) {
            isHydratedRef.current = false;
            setIsHydratedState(false);
            lastPersistedRef.current = null;
            prevIdentityRef.current = { userId, orgId };
        }

        if (isHydratedRef.current) return;

        let cancelled = false;

        const hydrate = async () => {
            let resolvedState: T = defaults;
            let resolvedFromDb = false;

            // 1. Try DB state first (cross-device sync source of truth)
            if (persistToDb) {
                try {
                    const { data, error } = await supabase.rpc('get_user_filter_state' as any, {
                        p_scope_key: scopeKey,
                    });

                    if (!error && data && !cancelled) {
                        const dbVersion = (data as any).version ?? 1;
                        const dbState = (data as any).state as T;

                        if (dbVersion === version) {
                            resolvedState = { ...defaults, ...dbState };
                            resolvedFromDb = true;
                        } else if (migrateState) {
                            const migrated = migrateState(scopeKey, dbVersion, version, dbState);
                            if (migrated) {
                                resolvedState = { ...defaults, ...migrated };
                                resolvedFromDb = true;
                            }
                            // else: version mismatch, no migration → fallback to defaults
                        }
                    }
                } catch (e) {
                    console.warn('[useUserScopedFilterState] DB hydration failed:', e);
                }
            }

            // 2. Fallback: localStorage per-user key
            if (!resolvedFromDb && lsKey) {
                const lsState = readFromLocalStorage<T>(lsKey);
                if (lsState) {
                    resolvedState = { ...defaults, ...lsState };
                }
            }

            // 3. Fallback: legacy shared localStorage (one-time migration)
            // PATCH 4: Cross-user guard — only migrate if this user "owns" the legacy key.
            // On first encounter, we stamp ownership; on subsequent loads, only the owner migrates.
            if (!resolvedFromDb && !readFromLocalStorage<T>(lsKey) && legacyStorageKey) {
                const legacyFullKey = `${LEGACY_LS_PREFIX}${legacyStorageKey}`;
                const ownerMarkerKey = `rr:filters:legacy_owner:${legacyStorageKey}`;
                const legacyState = readLegacyStorage<T>(legacyStorageKey);

                if (legacyState && lsKey) {
                    const existingOwner = localStorage.getItem(ownerMarkerKey);

                    if (!existingOwner) {
                        // First user to encounter this legacy key — claim ownership
                        // Skip migration this session to avoid race; next load will migrate.
                        try { localStorage.setItem(ownerMarkerKey, userId); } catch { /* ignore storage errors */ }
                    } else if (existingOwner === userId) {
                        // Owner match — safe to migrate
                        resolvedState = { ...defaults, ...legacyState };
                        writeToLocalStorage(lsKey, resolvedState);
                        try {
                            localStorage.removeItem(legacyFullKey);
                            localStorage.removeItem(ownerMarkerKey);
                        } catch { /* ignore storage errors */ }
                    }
                    // else: different user owns legacy → skip (do NOT migrate or delete)
                }
            }

            if (cancelled) return;

            isHydratedRef.current = true;
            setIsHydratedState(true);
            lastPersistedRef.current = resolvedState;

            setInternal({
                state: resolvedState,
                source: 'HYDRATE',
            });
        };

        hydrate();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, orgId, scopeKey, version, lsKey, persistToDb]);

    // ────────────────────────────────────────────────────────────────────────────
    // PERSIST (localStorage immediate, DB debounced)
    // ────────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        // Only persist on USER-initiated changes
        if (internal.source !== 'USER') return;
        if (!userId || !lsKey) return;

        // Deep equality guard — skip if nothing changed
        if (lastPersistedRef.current && deepEqual(internal.state, lastPersistedRef.current)) {
            return;
        }

        // 1. localStorage — immediate
        writeToLocalStorage(lsKey, internal.state);
        lastPersistedRef.current = internal.state;

        // 2. DB — debounced
        if (!persistToDb) return;

        // Cancel previous in-flight
        if (dbDebounceRef.current) {
            clearTimeout(dbDebounceRef.current);
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        dbDebounceRef.current = setTimeout(async () => {
            if (controller.signal.aborted) return;

            try {
                const { error } = await supabase.rpc('upsert_user_filter_state' as any, {
                    p_scope_key: scopeKey,
                    p_state: internal.state as any,
                    p_version: version,
                });

                if (error) {
                    console.warn('[useUserScopedFilterState] DB persist failed:', error.message);
                }
            } catch (e) {
                if ((e as Error)?.name !== 'AbortError') {
                    console.warn('[useUserScopedFilterState] DB persist error:', e);
                }
            }
        }, DB_DEBOUNCE_MS);

        return () => {
            if (dbDebounceRef.current) {
                clearTimeout(dbDebounceRef.current);
            }
        };
         
    }, [internal.state, internal.source, userId, lsKey, orgId, scopeKey, version, persistToDb]);

    // ────────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ────────────────────────────────────────────────────────────────────────────

    /** Update state from user action. Will persist to localStorage + DB. */
    const setState = useCallback((
        updater: Partial<T> | ((prev: T) => Partial<T>),
        source: FilterUpdateSource = 'USER'
    ) => {
        setInternal(prev => {
            const updates = typeof updater === 'function' ? updater(prev.state) : updater;
            const next = { ...prev.state, ...updates };

            // Deep equality guard — prevent unnecessary re-renders
            if (deepEqual(prev.state, next) && prev.source === source) {
                return prev;
            }

            return { state: next, source };
        });
    }, []);

    /** Reset to defaults (counts as USER action → persists). */
    const resetState = useCallback(() => {
        setInternal({ state: defaults, source: 'USER' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Check if state differs from defaults */
    const hasNonDefaults = useMemo(
        () => !deepEqual(internal.state, defaults),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [internal.state]
    );

    /** Whether hydration from DB/localStorage is complete */
    const isHydrated = isHydratedState;

    return {
        /** Current filter state */
        state: internal.state,
        /** Update source of last change */
        source: internal.source,
        /** Update state. Defaults to source='USER' (will persist). */
        setState,
        /** Reset state to defaults */
        resetState,
        /** Whether any non-default filters are active */
        hasNonDefaults,
        /** Whether hydration is complete */
        isHydrated,
        /** Current org_id */
        orgId,
        /** Current user_id */
        userId,
    };
}
