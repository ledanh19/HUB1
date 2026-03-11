/**
 * PMS-aligned date helpers
 * SOT: TRANSFER_SPEC_INVENTORY_RATESETUP.md §9
 *
 * Rules:
 *  - All "today" references use Asia/Ho_Chi_Minh (UTC+7)
 *  - Date format: YYYY-MM-DD everywhere
 *  - Start date: inclusive; End date: inclusive
 *  - Max future date: today + 499 days (500 total)
 */

import { format, eachDayOfInterval, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export const PMS_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const MAX_FUTURE_DAYS = 499;

/**
 * Get "today" in PMS timezone (Asia/Ho_Chi_Minh).
 * Prevents off-by-one around midnight when server/browser is in a different TZ.
 */
export function getTodayVN(): Date {
  return toZonedTime(new Date(), PMS_TIMEZONE);
}

/**
 * Format a Date to YYYY-MM-DD (PMS canonical format).
 */
export function formatDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Normalize a date range according to PMS rules:
 *  - Clamp start to today (no past dates)
 *  - Clamp end to today + 499
 *  - Both endpoints inclusive
 */
export function normalizeDateRange(
  start: Date,
  end: Date
): { start: string; end: string; clampedStart: boolean; clampedEnd: boolean } {
  const today = getTodayVN();
  today.setHours(0, 0, 0, 0);

  const maxEnd = addDays(today, MAX_FUTURE_DAYS);

  const clampedStart = start < today;
  const clampedEnd = end > maxEnd;

  return {
    start: formatDateISO(clampedStart ? today : start),
    end: formatDateISO(clampedEnd ? maxEnd : end),
    clampedStart,
    clampedEnd,
  };
}

/**
 * Expand a date range into individual YYYY-MM-DD strings (inclusive both ends).
 * Optionally filter by weekdays (JS convention: 0=Sun … 6=Sat).
 */
export function expandDateRange(
  start: Date,
  end: Date,
  weekdays?: number[]
): string[] {
  const days = eachDayOfInterval({ start, end });
  const filtered = weekdays
    ? days.filter((d) => weekdays.includes(d.getDay()))
    : days;
  return filtered.map(formatDateISO);
}

/**
 * Deterministic idempotency key.
 * Composed of property + date scope + content hash so that identical
 * payloads always produce the same key.
 */
export function generateIdempotencyKey(
  propertyId: string,
  dateRange: string,
  payloadHash: string
): string {
  return `${propertyId}:${dateRange}:${payloadHash}`;
}

/**
 * SHA-256 hex digest (first 16 chars) for use as a payload fingerprint.
 */
export async function hashPayload(payload: unknown): Promise<string> {
  const text = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
