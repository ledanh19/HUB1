/**
 * deepEqual — Deep comparison utility for filter state objects.
 * 
 * Used to prevent unnecessary state updates, URL changes, and DB writes
 * when filter values haven't actually changed (anti-loop guard).
 * 
 * Handles: primitives, arrays, plain objects, Date, null/undefined.
 * Does NOT handle: Sets, Maps, RegExp, Symbols, functions, circular refs.
 */

export function deepEqual(a: unknown, b: unknown): boolean {
    // Identity check (handles primitives, NaN === NaN via Object.is)
    if (Object.is(a, b)) return true;

    // Null/undefined mismatch
    if (a == null || b == null) return false;

    // Type mismatch
    if (typeof a !== typeof b) return false;

    // Date comparison
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }

    // Array comparison
    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }

    // Object comparison (plain objects only)
    if (typeof a === 'object' && typeof b === 'object') {
        const keysA = Object.keys(a as Record<string, unknown>);
        const keysB = Object.keys(b as Record<string, unknown>);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepEqual(
                (a as Record<string, unknown>)[key],
                (b as Record<string, unknown>)[key]
            )) return false;
        }
        return true;
    }

    return false;
}
