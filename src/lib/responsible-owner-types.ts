/**
 * Responsible Owner Types & Constants
 * 
 * Implements the Responsibility Model from UX Governance:
 * - RESPONSIBLE OWNER: Người chịu trách nhiệm chính cho booking
 * - LAST HANDLER: Người thao tác gần nhất (from audit_logs)
 * - ACTIVE HANDLER: Người đang thao tác phiên hiện tại (memory only)
 */

// === TYPES ===

export type DepartmentType = "CSKH" | "FOH" | "SALE" | "KE_TOAN" | "ADMIN" | "UNKNOWN";

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: DepartmentType;
}

export interface ResponsibleOwner {
  userId: string;
  userName: string;
  department: DepartmentType;
  assignedAt: string;
  assignedBy: "SYSTEM" | "MANUAL";
  assignmentReason: string;
}

export interface LastHandler {
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
}

export interface OwnershipInfo {
  responsibleOwner: ResponsibleOwner | null;
  lastHandler: LastHandler | null;
  isOwnerAssigned: boolean;
}

// === CONSTANTS ===

/**
 * Actions that EXPLICITLY ASSIGN owner (manual assignment only)
 * These actions are used when user intentionally assigns/transfers owner
 * 
 * IMPORTANT: Check-in, Check-out, etc. are OPERATION actions, not owner assignment!
 * They record WHO performed the action but DO NOT change the owner.
 */
export const ASSIGN_OWNER_ACTIONS = [
  // Manual assignment actions - ONLY these change owner
  "Gán thủ công",
  "Gán người phụ trách",
  "Chuyển giao trách nhiệm",
  // Legacy action names (for backward compatibility with existing audit_logs)
  "Tạo segment",
  "Segment created",
] as const;

/**
 * Actions that are OPERATIONS (record actor but don't change owner)
 * These are logged for audit purposes but the owner remains unchanged
 */
export const OPERATION_ACTIONS = [
  "Nhận phòng",
  "Trả phòng",
  "Phân bổ phòng Host",
  "Đổi phòng Host",
  "Thu tiền",
  "Xác nhận thanh toán",
  "Đánh dấu No-show",
  "No-show marked",
] as const;

/**
 * Action to REMOVE owner (unassign)
 */
export const REMOVE_OWNER_ACTION = "Gỡ người phụ trách" as const;

/**
 * Actions that KEEP current owner (no change)
 */
export const KEEP_OWNER_ACTIONS = [
  "Xem chi tiết",
  "Tải lên giấy tờ",
  "Thêm ghi chú",
  "Cập nhật booking",
  "Gửi giấy tờ cho Host",
] as const;

/**
 * Actions that TRANSFER owner (explicit user action)
 */
export const TRANSFER_OWNER_ACTIONS = [
  "Chuyển giao trách nhiệm",
  "Gán người phụ trách",
  "Gán thủ công",
] as const;

// === DEPARTMENT MAPPING ===

export const DEPARTMENT_LABELS: Record<DepartmentType, string> = {
  CSKH: "CSKH",
  FOH: "FOH",
  SALE: "Sale",
  KE_TOAN: "Kế toán",
  ADMIN: "Admin",
  UNKNOWN: "Chưa xác định",
};

export const DEPARTMENT_COLORS: Record<DepartmentType, string> = {
  CSKH: "bg-info/10 text-info",
  FOH: "bg-success/10 text-success",
  SALE: "bg-primary/10 text-primary",
  KE_TOAN: "bg-warning/10 text-warning",
  ADMIN: "bg-destructive/10 text-destructive",
  UNKNOWN: "bg-muted text-muted-foreground",
};

/**
 * Map app_role to department
 */
export function roleToDepartment(role: string | null): DepartmentType {
  switch (role) {
    case "cskh":
      return "CSKH";
    case "foh":
      return "FOH";
    case "sale":
      return "SALE";
    case "ke_toan":
      return "KE_TOAN";
    case "admin":
    case "super_admin":
      return "ADMIN";
    // OTA roles → map to FOH department (front-office operations)
    case "ota_lead":
    case "ota_staff":
      return "FOH";
    default:
      return "UNKNOWN";
  }
}

// === HELPER FUNCTIONS ===

/**
 * Check if action should trigger owner assignment
 */
export function shouldAssignOwner(action: string): boolean {
  return ASSIGN_OWNER_ACTIONS.some(a =>
    action.toLowerCase().includes(a.toLowerCase())
  );
}

/**
 * Check if action should keep current owner
 */
export function shouldKeepOwner(action: string): boolean {
  return KEEP_OWNER_ACTIONS.some(a =>
    action.toLowerCase().includes(a.toLowerCase())
  );
}

/**
 * Calculate freshness indicator (how recent the last activity was)
 */
export type FreshnessLevel = "fresh" | "recent" | "stale";

export function calculateFreshness(timestamp: string): FreshnessLevel {
  const now = new Date();
  const activityTime = new Date(timestamp);
  const hoursDiff = (now.getTime() - activityTime.getTime()) / (1000 * 60 * 60);

  if (hoursDiff < 24) return "fresh";
  if (hoursDiff < 72) return "recent";
  return "stale";
}

export const FRESHNESS_CONFIG: Record<FreshnessLevel, { label: string; color: string; icon: string }> = {
  fresh: {
    label: "< 24h",
    color: "text-success",
    icon: "🟢",
  },
  recent: {
    label: "24-72h",
    color: "text-warning",
    icon: "🟡",
  },
  stale: {
    label: "> 72h",
    color: "text-destructive",
    icon: "🔴",
  },
};

/**
 * Format relative time in Vietnamese
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;

  return then.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}
