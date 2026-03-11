/**
 * Shared email-related utilities — single source of truth.
 * Used by ReplyComposer, RecipientChipInput, ThreadDetailV2 bridge.
 */

/** RFC 5322–ish email regex — intentionally permissive for international TLDs. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns true if `value` looks like a valid email address. */
export function isValidEmail(value: string | null | undefined): boolean {
    return !!value && EMAIL_RE.test(value.trim());
}

/**
 * Extract email address from various formats:
 * - Plain: "user@example.com"
 * - Angle bracket: "Display Name <user@example.com>"
 * - Reversed: name in email field, email in name field
 *
 * Returns { name, email } where email is guaranteed valid or empty string.
 */
export function extractEmail(raw: string): { email: string; displayPart: string } {
    if (!raw) return { email: '', displayPart: '' };
    const trimmed = raw.trim();

    // "Display Name <email@x.com>"
    const bracketMatch = trimmed.match(/<([^>]+)>/);
    if (bracketMatch) {
        const email = bracketMatch[1].trim();
        const displayPart = trimmed.replace(/<[^>]+>/, '').trim();
        if (isValidEmail(email)) return { email, displayPart };
    }

    // Plain email
    if (isValidEmail(trimmed)) return { email: trimmed, displayPart: '' };

    // Embedded email anywhere in the string
    const anyEmailMatch = trimmed.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/);
    if (anyEmailMatch && isValidEmail(anyEmailMatch[0])) {
        const displayPart = trimmed.replace(anyEmailMatch[0], '').replace(/<|>/g, '').trim();
        return { email: anyEmailMatch[0], displayPart };
    }

    return { email: '', displayPart: trimmed };
}
