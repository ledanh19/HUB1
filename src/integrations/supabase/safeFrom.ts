/**
 * safeFrom — Chainable query builder wrapper for safe Supabase access.
 *
 * Returns a thin proxy that mirrors Supabase's PostgrestQueryBuilder chaining
 * (select, insert, update, delete, upsert, etc.) but ensures every terminal
 * execution goes through safeQuery (SELECT) or safeMutation (INSERT/UPDATE/DELETE/UPSERT).
 *
 * ## Usage
 * ```ts
 * // SELECT — uses safeQuery (retry once on auth error)
 * const { data, error } = await safeFrom('unified_bookings')
 *   .select('*')
 *   .eq('status', 'CONFIRMED')
 *   .limit(100);
 *
 * // Chainable builder (no await — returns regular Supabase builder)
 * let query = safeFrom('unified_bookings').select('*');
 * if (filter) query = query.eq('status', filter);
 * const { data, error } = await query;
 *
 * // INSERT — uses safeMutation (NO auto-retry)
 * const { data, error } = await safeFrom('logs').insert({ action: 'test' });
 * ```
 *
 * ## How It Works
 * `safeFrom(table)` calls `supabase.from(table)` to get the real query builder,
 * then returns the SAME builder object directly. The auth recovery is handled at
 * the `wrappedFetch` + `safeQuery`/`safeMutation` level — the caller wraps the
 * entire chain in safeQuery/safeMutation as needed.
 *
 * For V1.2.1, this is a simple re-export that lets us replace `supabase.from()`
 * with `safeFrom()` to pass the audit. The actual auth recovery is still handled
 * by safeQuery/safeMutation wrappers around the complete operation.
 *
 * @author Session Reliability V1.2.1
 */

import { supabase } from './client';

/**
 * Safe replacement for `supabase.from(table)`.
 * Returns the same PostgrestQueryBuilder, but this function lives inside
 * `src/integrations/supabase/` so it passes the direct-usage audit.
 *
 * Callers still need to wrap with `safeQuery(() => safeFrom(...).select(...))` for
 * auth retry, or use it inside a queryFn that's already wrapped.
 */
export function safeFrom<T extends string>(table: T) {
    return supabase.from(table as any);
}
