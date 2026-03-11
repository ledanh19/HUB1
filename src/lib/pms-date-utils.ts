/**
 * PMS Operations Date Utilities
 * 
 * Implements Date Authority Hierarchy from PMS_OPERATIONS_GOVERNANCE.md:
 * 1. Actual dates (actual_check_in_at, actual_check_out_at) - from Operations
 * 2. Updated dates (updated_check_in, updated_check_out) - from Booking changes
 * 3. Original dates (original_check_in, original_check_out) - from OTA
 * 
 * @see docs/PMS_OPERATIONS_GOVERNANCE.md for full specification
 */

import { format, parseISO, isValid, differenceInDays, isSameDay, isAfter, isBefore, startOfDay } from "date-fns";
import { vi } from "date-fns/locale";

// === Types ===

export type DateAuthorityLevel = "actual" | "updated" | "original";

export interface DateAuthorityResult {
  /** The winning date value */
  date: Date | null;
  /** Which authority level provided the date */
  authority: DateAuthorityLevel;
  /** Whether this date differs from original */
  isModified: boolean;
  /** Human-readable label for the authority */
  authorityLabel: string;
  /** Badge color class */
  badgeColor: string;
}

export interface StayDates {
  // Original from OTA
  original_check_in?: string | null;
  original_check_out?: string | null;
  // Updated from booking changes
  updated_check_in?: string | null;
  updated_check_out?: string | null;
  // Actual from operations
  actual_check_in_at?: string | null;
  actual_check_out_at?: string | null;
}

export type StayStatus = 
  | "CONFIRMED"
  | "WAIT_ROOM"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "NO_SHOW"
  | "CANCELLED";

// === Date Authority Functions ===

/**
 * Resolve check-in date using authority hierarchy
 */
export function resolveCheckInDate(dates: StayDates): DateAuthorityResult {
  // Priority 1: Actual check-in (from operations)
  if (dates.actual_check_in_at) {
    const date = parseISO(dates.actual_check_in_at);
    if (isValid(date)) {
      return {
        date,
        authority: "actual",
        isModified: true,
        authorityLabel: "Thực tế",
        badgeColor: "bg-success/10 text-success",
      };
    }
  }

  // Priority 2: Updated check-in (from booking changes)
  if (dates.updated_check_in) {
    const date = parseISO(dates.updated_check_in);
    const originalDate = dates.original_check_in ? parseISO(dates.original_check_in) : null;
    
    if (isValid(date)) {
      const isModified = !originalDate || !isSameDay(date, originalDate);
      return {
        date,
        authority: "updated",
        isModified,
        authorityLabel: isModified ? "Đã thay đổi" : "Theo kế hoạch",
        badgeColor: isModified 
          ? "bg-warning/10 text-warning"
          : "bg-info/10 text-info",
      };
    }
  }

  // Priority 3: Original check-in (from OTA)
  if (dates.original_check_in) {
    const date = parseISO(dates.original_check_in);
    if (isValid(date)) {
      return {
        date,
        authority: "original",
        isModified: false,
        authorityLabel: "Gốc (OTA)",
        badgeColor: "bg-muted text-muted-foreground",
      };
    }
  }

  return {
    date: null,
    authority: "original",
    isModified: false,
    authorityLabel: "Chưa có",
    badgeColor: "bg-muted text-muted-foreground",
  };
}

/**
 * Resolve check-out date using authority hierarchy
 */
export function resolveCheckOutDate(dates: StayDates): DateAuthorityResult {
  // Priority 1: Actual check-out (from operations)
  if (dates.actual_check_out_at) {
    const date = parseISO(dates.actual_check_out_at);
    if (isValid(date)) {
      return {
        date,
        authority: "actual",
        isModified: true,
        authorityLabel: "Thực tế",
        badgeColor: "bg-success/10 text-success",
      };
    }
  }

  // Priority 2: Updated check-out (from booking changes)
  if (dates.updated_check_out) {
    const date = parseISO(dates.updated_check_out);
    const originalDate = dates.original_check_out ? parseISO(dates.original_check_out) : null;
    
    if (isValid(date)) {
      const isModified = !originalDate || !isSameDay(date, originalDate);
      return {
        date,
        authority: "updated",
        isModified,
        authorityLabel: isModified ? "Đã thay đổi" : "Theo kế hoạch",
        badgeColor: isModified 
          ? "bg-warning/10 text-warning"
          : "bg-info/10 text-info",
      };
    }
  }

  // Priority 3: Original check-out (from OTA)
  if (dates.original_check_out) {
    const date = parseISO(dates.original_check_out);
    if (isValid(date)) {
      return {
        date,
        authority: "original",
        isModified: false,
        authorityLabel: "Gốc (OTA)",
        badgeColor: "bg-muted text-muted-foreground",
      };
    }
  }

  return {
    date: null,
    authority: "original",
    isModified: false,
    authorityLabel: "Chưa có",
    badgeColor: "bg-muted text-muted-foreground",
  };
}

// === Status Logic ===

/**
 * Determine if a stay is due for check-in today
 */
export function isDueForCheckIn(dates: StayDates, status: StayStatus): boolean {
  if (status !== "CONFIRMED" && status !== "WAIT_ROOM") return false;
  
  const checkInResult = resolveCheckInDate(dates);
  if (!checkInResult.date) return false;
  
  const today = startOfDay(new Date());
  const checkInDay = startOfDay(checkInResult.date);
  
  return isSameDay(checkInDay, today) || isBefore(checkInDay, today);
}

/**
 * Determine if a stay is due for check-out today
 */
export function isDueForCheckOut(dates: StayDates, status: StayStatus): boolean {
  if (status !== "CHECKED_IN") return false;
  
  const checkOutResult = resolveCheckOutDate(dates);
  if (!checkOutResult.date) return false;
  
  const today = startOfDay(new Date());
  const checkOutDay = startOfDay(checkOutResult.date);
  
  return isSameDay(checkOutDay, today) || isBefore(checkOutDay, today);
}

/**
 * Determine if check-in is overdue (past expected date)
 */
export function isCheckInOverdue(dates: StayDates, status: StayStatus): boolean {
  if (status !== "CONFIRMED" && status !== "WAIT_ROOM") return false;
  
  const checkInResult = resolveCheckInDate(dates);
  if (!checkInResult.date) return false;
  
  const today = startOfDay(new Date());
  return isBefore(startOfDay(checkInResult.date), today);
}

/**
 * Determine if check-out is overdue (past expected date)
 */
export function isCheckOutOverdue(dates: StayDates, status: StayStatus): boolean {
  if (status !== "CHECKED_IN") return false;
  
  const checkOutResult = resolveCheckOutDate(dates);
  if (!checkOutResult.date) return false;
  
  const today = startOfDay(new Date());
  return isBefore(startOfDay(checkOutResult.date), today);
}

/**
 * Calculate nights between check-in and check-out
 */
export function calculateNights(dates: StayDates): number {
  const checkIn = resolveCheckInDate(dates).date;
  const checkOut = resolveCheckOutDate(dates).date;
  
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, differenceInDays(checkOut, checkIn));
}

// === Date Comparison ===

/**
 * Check if dates have been modified from original
 */
export function hasDateChanges(dates: StayDates): {
  checkInChanged: boolean;
  checkOutChanged: boolean;
  hasAnyChange: boolean;
} {
  const checkInResult = resolveCheckInDate(dates);
  const checkOutResult = resolveCheckOutDate(dates);
  
  return {
    checkInChanged: checkInResult.isModified && checkInResult.authority !== "original",
    checkOutChanged: checkOutResult.isModified && checkOutResult.authority !== "original",
    hasAnyChange: 
      (checkInResult.isModified && checkInResult.authority !== "original") ||
      (checkOutResult.isModified && checkOutResult.authority !== "original"),
  };
}

/**
 * Get date change summary for display
 */
export function getDateChangeSummary(dates: StayDates): string | null {
  const changes = hasDateChanges(dates);
  
  if (!changes.hasAnyChange) return null;
  
  const parts: string[] = [];
  
  if (changes.checkInChanged) {
    const checkIn = resolveCheckInDate(dates);
    parts.push(`Nhận phòng: ${checkIn.authorityLabel}`);
  }
  
  if (changes.checkOutChanged) {
    const checkOut = resolveCheckOutDate(dates);
    parts.push(`Trả phòng: ${checkOut.authorityLabel}`);
  }
  
  return parts.join(" • ");
}

// === Formatting ===

/**
 * Format date for display with locale
 */
export function formatDisplayDate(
  date: Date | null,
  formatStr: string = "dd/MM/yyyy"
): string {
  if (!date || !isValid(date)) return "—";
  return format(date, formatStr, { locale: vi });
}

/**
 * Format date with time
 */
export function formatDisplayDateTime(
  date: Date | null,
  formatStr: string = "dd/MM/yyyy HH:mm"
): string {
  if (!date || !isValid(date)) return "—";
  return format(date, formatStr, { locale: vi });
}

/**
 * Format check-in/out date with authority info
 */
export function formatDateWithAuthority(
  result: DateAuthorityResult,
  includeTime: boolean = false
): string {
  if (!result.date) return "—";
  
  const dateStr = includeTime
    ? formatDisplayDateTime(result.date)
    : formatDisplayDate(result.date);
  
  return dateStr;
}

// === Stay Status Helpers ===

export const STAY_STATUS_CONFIG: Record<StayStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  CONFIRMED: {
    label: "Đã xác nhận",
    color: "text-info",
    bgColor: "bg-info/10",
    icon: "CheckCircle",
  },
  WAIT_ROOM: {
    label: "Chờ phòng",
    color: "text-warning",
    bgColor: "bg-warning/10",
    icon: "Clock",
  },
  CHECKED_IN: {
    label: "Đã nhận phòng",
    color: "text-success",
    bgColor: "bg-success/10",
    icon: "LogIn",
  },
  CHECKED_OUT: {
    label: "Đã trả phòng",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    icon: "LogOut",
  },
  NO_SHOW: {
    label: "Không đến",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    icon: "XCircle",
  },
  CANCELLED: {
    label: "Đã hủy",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    icon: "Ban",
  },
};

export function getStayStatusConfig(status: StayStatus) {
  return STAY_STATUS_CONFIG[status] || STAY_STATUS_CONFIG.CONFIRMED;
}
