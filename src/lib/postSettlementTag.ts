/**
 * Post-Settlement Tag Utilities
 * Parse and manage [POST_SETTLEMENT::{settlement_id}] tags in charge notes/descriptions.
 */

const POST_SETTLEMENT_REGEX = /^\[POST_SETTLEMENT::([a-f0-9-]+)\]\s*/i;

/**
 * Check if text contains a POST_SETTLEMENT tag
 */
export function isPostSettlementTag(text: string | null | undefined): boolean {
    if (!text) return false;
    return POST_SETTLEMENT_REGEX.test(text);
}

/**
 * Extract the reference settlement ID from a POST_SETTLEMENT tag
 */
export function extractRefSettlementId(text: string | null | undefined): string | null {
    if (!text) return null;
    const match = text.match(POST_SETTLEMENT_REGEX);
    return match ? match[1] : null;
}

/**
 * Strip the POST_SETTLEMENT tag prefix from text for clean display
 */
export function stripTag(text: string | null | undefined): string {
    if (!text) return '';
    return text.replace(POST_SETTLEMENT_REGEX, '').trim();
}
