/**
 * STATUS CONFIG – Single Source of Truth
 * =======================================
 * All status → variant + label mappings for the entire system.
 * Import from here instead of defining inline getStatusVariant() per page.
 *
 * Variant groups (matching StatusBadge):
 *   Gray:   default | neutral | secondary | checkedOut
 *   Blue:   info | confirmed | approved | inProgress | processing
 *   Amber:  pending | warning | manual | onHold | review
 *   Green:  success | checkedIn | paid | completed
 *   Red:    danger | destructive | noShow | cancelled | blocked
 *   Special: pms | voucher
 */

// ────────────────────────────────────────────────────────────
// 1. Booking Status
// ────────────────────────────────────────────────────────────
export const BOOKING_STATUS = {
  CONFIRMED: { variant: "confirmed", label: "Đã xác nhận" },
  PENDING: { variant: "pending", label: "Chờ xác nhận" },
  MODIFIED: { variant: "warning", label: "Đã sửa" },
  CHECKED_IN: { variant: "checkedIn", label: "Đã nhận phòng" },
  IN_HOUSE: { variant: "checkedIn", label: "Đang ở" },
  CHECKED_OUT: { variant: "checkedOut", label: "Đã trả phòng" },
  CANCELLED: { variant: "cancelled", label: "Đã huỷ" },
  NO_SHOW: { variant: "noShow", label: "Không đến" },
  DONE: { variant: "success", label: "Hoàn tất" },
  WAIT_ROOM: { variant: "warning", label: "Chờ phòng" },
  NEW: { variant: "info", label: "Mới" },
} as const;

export function getBookingStatusVariant(status: string | null) {
  return (BOOKING_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getBookingStatusLabel(status: string | null) {
  return (BOOKING_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 2. Payment Status
// ────────────────────────────────────────────────────────────
export const PAYMENT_STATUS = {
  UNPAID: { variant: "danger", label: "Chưa thanh toán" },
  PARTIALLY_PAID: { variant: "warning", label: "Thanh toán một phần" },
  PARTIAL: { variant: "warning", label: "Thanh toán một phần" },
  FULLY_PAID: { variant: "success", label: "Đã thanh toán" },
  PAID: { variant: "success", label: "Đã thanh toán" },
  OVERPAID: { variant: "warning", label: "Thanh toán dư" },
} as const;

export function getPaymentStatusVariant(status: string | null) {
  return (PAYMENT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getPaymentStatusLabel(status: string | null) {
  return (PAYMENT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 3. Approval / Request Status (Payment Requests, Deposits, Approvals)
// ────────────────────────────────────────────────────────────
export const APPROVAL_STATUS = {
  PENDING: { variant: "warning", label: "Chờ duyệt" },
  APPROVED: { variant: "approved", label: "Đã duyệt" },
  REJECTED: { variant: "danger", label: "Từ chối" },
  PAID: { variant: "success", label: "Đã chi" },
  CANCELLED: { variant: "cancelled", label: "Đã hủy" },
} as const;

export function getApprovalStatusVariant(status: string | null): string {
  return (APPROVAL_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getApprovalStatusLabel(status: string | null) {
  return (APPROVAL_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 4. OTA Payout Status
// ────────────────────────────────────────────────────────────
export const OTA_PAYOUT_STATUS = {
  RECEIVED: { variant: "success", label: "Đã nhận" },
  PENDING: { variant: "warning", label: "Chờ nhận" },
  PARTIAL: { variant: "info", label: "Nhận một phần" },
  DISPUTED: { variant: "danger", label: "Tranh chấp" },
} as const;

export function getOtaPayoutStatusVariant(status: string | null) {
  return (OTA_PAYOUT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getOtaPayoutStatusLabel(status: string | null) {
  return (OTA_PAYOUT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 5. Dispute Status
// ────────────────────────────────────────────────────────────
export const DISPUTE_STATUS = {
  // DisputesPage format
  NEW: { variant: "warning", label: "Mới" },
  PROCESSING: { variant: "info", label: "Đang xử lý" },
  RESOLVED_WIN: { variant: "success", label: "Thắng" },
  RESOLVED_LOSS: { variant: "danger", label: "Thua" },
  // DisputeDetailPage format
  OPEN: { variant: "warning", label: "Mở" },
  IN_REVIEW: { variant: "info", label: "Đang xem xét" },
  WON: { variant: "success", label: "Thắng" },
  LOST: { variant: "danger", label: "Thua" },
  PARTIAL: { variant: "pending", label: "Một phần" },
  CLOSED: { variant: "info", label: "Đã đóng" },
} as const;

export function getDisputeStatusVariant(status: string | null) {
  return (DISPUTE_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getDisputeStatusLabel(status: string | null) {
  return (DISPUTE_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 6. Host Deposit Status
// ────────────────────────────────────────────────────────────
export const HOST_DEPOSIT_STATUS = {
  PENDING: { variant: "warning", label: "Chờ duyệt" },
  APPROVED: { variant: "approved", label: "Đã duyệt - Chưa chi" },
  PAID: { variant: "success", label: "Đã chi tiền" },
  REJECTED: { variant: "danger", label: "Từ chối" },
} as const;

export function getHostDepositStatusVariant(status: string | null) {
  return (HOST_DEPOSIT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "neutral";
}

export function getHostDepositStatusLabel(status: string | null) {
  return (HOST_DEPOSIT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 7. Host Payable Status
// ────────────────────────────────────────────────────────────
export const HOST_PAYABLE_STATUS = {
  PAID: { variant: "success", label: "Đã thanh toán" },
  PENDING: { variant: "warning", label: "Chờ thanh toán" },
  OVERDUE: { variant: "danger", label: "Quá hạn" },
  PARTIAL: { variant: "info", label: "Thanh toán một phần" },
  UNPAID: { variant: "danger", label: "Chưa thanh toán" },
  PARTIALLY_PAID: { variant: "warning", label: "Thanh toán một phần" },
} as const;

export function getHostPayableStatusVariant(status: string | null) {
  return (HOST_PAYABLE_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

// ────────────────────────────────────────────────────────────
// 8. Service Order Status
// ────────────────────────────────────────────────────────────
export const SERVICE_ORDER_STATUS = {
  DRAFT: { variant: "pending", label: "Nháp" },
  NEW: { variant: "info", label: "Mới" },
  CONFIRMED: { variant: "confirmed", label: "Đã xác nhận" },
  ASSIGNED: { variant: "info", label: "Đã giao" },
  IN_PROGRESS: { variant: "inProgress", label: "Đang thực hiện" },
  COMPLETED: { variant: "completed", label: "Hoàn thành" },
  DONE: { variant: "completed", label: "Hoàn thành" },
  CANCELLED: { variant: "cancelled", label: "Đã huỷ" },
  NO_SHOW: { variant: "noShow", label: "Không đến" },
} as const;

export function getServiceOrderStatusVariant(status: string | null) {
  return (SERVICE_ORDER_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getServiceOrderStatusLabel(status: string | null) {
  return (SERVICE_ORDER_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 9. Partner Status
// ────────────────────────────────────────────────────────────
export const PARTNER_STATUS = {
  ACTIVE: { variant: "success", label: "Đang hoạt động" },
  INACTIVE: { variant: "warning", label: "Tạm ngưng" },
  ARCHIVED: { variant: "default", label: "Lưu trữ" },
  BLACKLISTED: { variant: "danger", label: "Cấm" },
} as const;

export function getPartnerStatusVariant(status: string | null) {
  return (PARTNER_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

// ────────────────────────────────────────────────────────────
// 10. Stay Timeline Status
// ────────────────────────────────────────────────────────────
export const STAY_TIMELINE_STATUS = {
  UPCOMING: { variant: "info", label: "Sắp đến" },
  CHECKIN_TODAY: { variant: "info", label: "Nhận phòng hôm nay" },
  IN_HOUSE: { variant: "checkedIn", label: "Đang ở" },
  CHECKOUT_TODAY: { variant: "warning", label: "Trả phòng hôm nay" },
  COMPLETED: { variant: "checkedOut", label: "Đã hoàn thành" },
} as const;

export function getStayTimelineVariant(status: string | null) {
  return (STAY_TIMELINE_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

// ────────────────────────────────────────────────────────────
// 11. Settlement Status
// ────────────────────────────────────────────────────────────
export const SETTLEMENT_STATUS = {
  DRAFT: { variant: "pending", label: "Nháp" },
  SETTLED: { variant: "success", label: "Đã quyết toán" },
  CLOSED: { variant: "info", label: "Đã đóng" },
  VOID: { variant: "cancelled", label: "Đã hủy" },
} as const;

export function getSettlementStatusVariant(status: string | null) {
  return (SETTLEMENT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getSettlementStatusLabel(status: string | null) {
  return (SETTLEMENT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 12. Data Health Severity
// ────────────────────────────────────────────────────────────
export const DATA_HEALTH_SEVERITY = {
  ERROR: { variant: "danger", label: "Lỗi" },
  WARNING: { variant: "warning", label: "Cảnh báo" },
  INFO: { variant: "info", label: "Thông tin" },
} as const;

export function getDataHealthSeverityVariant(status: string | null) {
  return (DATA_HEALTH_SEVERITY as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "info";
}

// ────────────────────────────────────────────────────────────
// 13. Sync Job Status
// ────────────────────────────────────────────────────────────
export const SYNC_JOB_STATUS = {
  PENDING: { variant: "pending", label: "Chờ" },
  RUNNING: { variant: "info", label: "Đang chạy" },
  SUCCESS: { variant: "success", label: "Thành công" },
  PARTIAL_FAIL: { variant: "warning", label: "Lỗi một phần" },
  FAILED: { variant: "danger", label: "Thất bại" },
} as const;

export function getSyncJobStatusVariant(status: string | null) {
  return (SYNC_JOB_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getSyncJobStatusLabel(status: string | null) {
  return (SYNC_JOB_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 14. OTA Task Status
// ────────────────────────────────────────────────────────────
export const OTA_TASK_STATUS = {
  TODO: { variant: "pending", label: "Chưa làm" },
  IN_PROGRESS: { variant: "inProgress", label: "Đang làm" },
  REVIEW: { variant: "review", label: "Đang review" },
  DONE: { variant: "completed", label: "Hoàn thành" },
  BLOCKED: { variant: "blocked", label: "Bị chặn" },
  CANCELLED: { variant: "cancelled", label: "Đã huỷ" },
} as const;

export function getOtaTaskStatusVariant(status: string | null) {
  return (OTA_TASK_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getOtaTaskStatusLabel(status: string | null) {
  return (OTA_TASK_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 15. OTA Project Status
// ────────────────────────────────────────────────────────────
export const OTA_PROJECT_STATUS = {
  PLANNING: { variant: "info", label: "Lên kế hoạch" },
  IN_PROGRESS: { variant: "inProgress", label: "Đang thực hiện" },
  ON_HOLD: { variant: "onHold", label: "Tạm dừng" },
  COMPLETED: { variant: "completed", label: "Hoàn thành" },
  ARCHIVED: { variant: "neutral", label: "Lưu trữ" },
} as const;

export function getOtaProjectStatusVariant(status: string | null) {
  return (OTA_PROJECT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

export function getOtaProjectStatusLabel(status: string | null) {
  return (OTA_PROJECT_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.label || status || "—";
}

// ────────────────────────────────────────────────────────────
// 16. Priority
// ────────────────────────────────────────────────────────────
export const PRIORITY_CONFIG = {
  LOW: { variant: "info", label: "Thấp" },
  MEDIUM: { variant: "info", label: "Trung bình" },
  HIGH: { variant: "warning", label: "Cao" },
  URGENT: { variant: "danger", label: "Khẩn cấp" },
} as const;

export function getPriorityVariant(priority: string | null) {
  return (PRIORITY_CONFIG as Record<string, { variant: string; label: string }>)[priority || ""]?.variant || "default";
}

export function getPriorityLabel(priority: string | null) {
  return (PRIORITY_CONFIG as Record<string, { variant: string; label: string }>)[priority || ""]?.label || priority || "—";
}

// ────────────────────────────────────────────────────────────
// 17. AI Pricing Validation Status
// ────────────────────────────────────────────────────────────
export const AI_VALIDATION_STATUS = {
  PASS: { variant: "success", label: "Đạt" },
  PASS_WITH_CONDITIONS: { variant: "warning", label: "Đạt có điều kiện" },
  FAIL: { variant: "danger", label: "Không đạt" },
} as const;

export function getAiValidationStatusVariant(status: string | null) {
  return (AI_VALIDATION_STATUS as Record<string, { variant: string; label: string }>)[status || ""]?.variant || "default";
}

// ────────────────────────────────────────────────────────────
// 18. Accounting Period Status
// ────────────────────────────────────────────────────────────
export const ACCOUNTING_PERIOD_STATUS = {
  LOCKED: { variant: "danger", label: "Đã khóa" },
  UNLOCKED: { variant: "success", label: "Đang mở" },
} as const;

// ────────────────────────────────────────────────────────────
// 19. Ledger Entry Type
// ────────────────────────────────────────────────────────────
export const LEDGER_ENTRY_TYPE = {
  ORIGINAL: { variant: "info", label: "Gốc" },
  REVERSAL: { variant: "danger", label: "Hồi" },
} as const;

// ────────────────────────────────────────────────────────────
// 20. Channex Integration Status
// ────────────────────────────────────────────────────────────
export const CHANNEX_SYNC_STATUS = {
  SUCCESS: { variant: "success", label: "Thành công" },
  FAILED: { variant: "danger", label: "Thất bại" },
  RUNNING: { variant: "info", label: "Đang chạy" },
} as const;

// ────────────────────────────────────────────────────────────
// Generic helper - map any status key to a StatusBadge variant
// ────────────────────────────────────────────────────────────
type StatusMap = Record<string, { variant: string; label: string }>;

export function resolveStatusVariant(map: StatusMap, status: string | null): string {
  return map[status || ""]?.variant || "default";
}

export function resolveStatusLabel(map: StatusMap, status: string | null): string {
  return map[status || ""]?.label || status || "—";
}
