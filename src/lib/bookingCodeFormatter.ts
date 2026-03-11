/**
 * Format booking code for display based on OTA source
 * Format: AGO-xxx (Agoda), EXP-xxx (Expedia), BKG-xxx (Booking.com), etc.
 */

const OTA_PREFIXES: Record<string, string> = {
  "agoda": "AGO",
  "expedia": "EXP",
  "booking": "BKG",
  "booking.com": "BKG",
  "traveloka": "TVL",
  "ctrip": "CTP",
  "trip.com": "CTP",
  "airbnb": "AIR",
  "vrbo": "VRB",
  "direct": "DIR",
  "website": "WEB",
  "manual": "MNL",
  "walk-in": "WLK",
  "walk_in": "WLK",
};

/**
 * Get OTA prefix from source string
 */
function getOtaPrefix(source: string | null | undefined): string {
  if (!source) return "OTA";

  const normalizedSource = source.toLowerCase().trim();

  // Check exact match first
  if (OTA_PREFIXES[normalizedSource]) {
    return OTA_PREFIXES[normalizedSource];
  }

  // Check partial match
  for (const [key, prefix] of Object.entries(OTA_PREFIXES)) {
    if (normalizedSource.includes(key)) {
      return prefix;
    }
  }

  // Default: take first 3 chars uppercase
  return source.substring(0, 3).toUpperCase() || "OTA";
}

/**
 * Format booking code for display
 * Priority:
 * 1. If ota_booking_code exists: use OTA prefix + last 6 chars of ota_booking_code
 * 2. If no ota_booking_code: use OTA prefix + date + short id
 */
export function formatBookingCode(
  unifiedBookingId: string | null | undefined,
  otaBookingCode: string | null | undefined,
  otaSource: string | null | undefined,
  checkInDate?: string | null
): string {
  if (!unifiedBookingId) return "—";

  // If we have ota_booking_code, return numbers only (strip any prefix)
  if (otaBookingCode && otaBookingCode.length > 0) {
    // Strip any non-numeric prefix like "EXP-", "AGO-", etc.
    const numericPart = otaBookingCode.replace(/^[A-Za-z]+-/, "");
    return numericPart || otaBookingCode;
  }

  // Fallback: use date + short ID format (numbers only)
  let dateStr = "";
  if (checkInDate) {
    try {
      const date = new Date(checkInDate);
      const yy = date.getFullYear().toString().slice(-2);
      const mm = (date.getMonth() + 1).toString().padStart(2, "0");
      const dd = date.getDate().toString().padStart(2, "0");
      dateStr = `${yy}${mm}${dd}`;
    } catch {
      dateStr = "";
    }
  }

  // Take last 6 chars of unified_booking_id
  const idEnd = unifiedBookingId.length > 6
    ? unifiedBookingId.slice(-6).toUpperCase()
    : unifiedBookingId.toUpperCase();

  if (dateStr) {
    return `${dateStr}-${idEnd}`;
  }

  return idEnd;
}

/**
 * Format booking code with link support (returns just the code string)
 */
export function getBookingDisplayCode(booking: {
  unified_booking_id?: string | null;
  ota_booking_code?: string | null;
  source?: string | null;
  ota_source?: string | null;
  check_in_date?: string | null;
}): string {
  return formatBookingCode(
    booking.unified_booking_id,
    booking.ota_booking_code,
    booking.source || booking.ota_source,
    booking.check_in_date
  );
}
