/**
 * DASHBOARD GLOSSARY - Centralized terminology and definitions
 * 
 * WHY: Đảm bảo nhất quán ngôn ngữ, tooltips, và labels trên toàn Dashboard
 * 
 * NGUYÊN TẮC:
 * 1. Dùng tiếng Việt cho user-facing labels
 * 2. Mỗi metric có tooltip giải thích cách tính
 * 3. Phân biệt rõ: Realtime vs Locked vs Estimated
 */

// ========== DATA STABILITY LABELS ==========
export const DATA_STABILITY = {
  REALTIME: {
    label: "Realtime",
    description: "Cập nhật theo thời gian thực",
    color: "bg-success/100",
  },
  LOCKED: {
    label: "Locked",
    description: "Số liệu đã chốt, không thay đổi",
    color: "bg-info/100",
  },
  ESTIMATED: {
    label: "Estimated",
    description: "Ước tính, có thể thay đổi",
    color: "bg-warning/100",
  },
} as const;

// ========== TIME SCOPE ==========
export const TIME_SCOPE = {
  TODAY: (date: string) => `Hôm nay (${date})`,
  MTD: (from: string, to: string) => `MTD: ${from} → ${to}`,
  PERIOD: (from: string, to: string) => `${from} → ${to}`,
  NEXT_30_DAYS: (from: string, to: string) => `30 ngày tới: ${from} → ${to}`,
} as const;

// ========== LAYER TITLES ==========
export const LAYER_TITLES = {
  LAYER_1: {
    title: "Alerts & Actions",
    subtitle: "Cần xử lý ngay",
    icon: "AlertTriangle",
  },
  LAYER_2: {
    title: "Vận hành",
    subtitle: "Realtime operations",
    icon: "Activity",
  },
  LAYER_3: {
    title: "Dòng tiền",
    subtitle: "Cash snapshot",
    icon: "DollarSign",
  },
  LAYER_4: {
    title: "Phân tích & Dự báo",
    subtitle: "Analysis & Forecast",
    icon: "TrendingUp",
  },
} as const;

// ========== METRIC DEFINITIONS ==========
export const METRICS = {
  // Layer 2 - Operations
  BOOKINGS_COUNT: {
    label: "Đặt phòng",
    tooltip: "Số booking active (không bao gồm CANCELLED) có check-in trong kỳ được chọn",
    stability: "REALTIME",
  },
  IN_HOUSE: {
    label: "In-house",
    tooltip: "Khách đang lưu trú (CHECKED_IN hoặc IN_HOUSE status)",
    stability: "REALTIME",
  },
  PENDING_CHECKIN: {
    label: "Nhận phòng hôm nay",
    tooltip: "Booking có check_in_date = hôm nay và chưa nhận phòng",
    stability: "REALTIME",
  },
  PENDING_CHECKOUT: {
    label: "Trả phòng hôm nay",
    tooltip: "Booking có check_out_date = hôm nay và chưa trả phòng",
    stability: "REALTIME",
  },
  PENDING_ROOM: {
    label: "Chờ phòng",
    tooltip: "Booking chưa được assign phòng cụ thể (chưa có segment)",
    stability: "REALTIME",
  },
  OPEN_DISPUTES: {
    label: "Tranh chấp",
    tooltip: "Số disputes đang mở (dispute_status = OPEN)",
    stability: "REALTIME",
  },

  // Layer 3 - Cash
  CASH_IN: {
    label: "Thu tiền",
    tooltip: "Tổng tiền thực nhận trong kỳ (hotel_collects với payee_type = ROOMRISE, status ≠ VOIDED)",
    stability: "LOCKED",
  },
  CASH_OUT: {
    label: "Chi tiền",
    tooltip: "Tổng tiền thực chi trong kỳ (cash_outs)",
    stability: "LOCKED",
  },
  NET_CASHFLOW: {
    label: "Dòng tiền ròng",
    tooltip: "Thu tiền - Chi tiền = Net Cash",
    stability: "LOCKED",
  },
  NET_PROFIT: {
    label: "Lợi nhuận ghi nhận",
    tooltip: "P&L (accrual): Doanh thu - Giá vốn - Chi phí. Tính theo ngày checkout.",
    stability: "LOCKED",
  },
  PROFIT_CASH_GAP: {
    label: "Chênh lệch P&L vs Cash",
    tooltip: "Lợi nhuận - Dòng tiền. Dương = chưa thu hết tiền, Âm = đã thu hơn lợi nhuận.",
    stability: "LOCKED",
  },

  // Layer 4 - Forecast
  FORECAST_COMMITTED: {
    label: "Committed",
    tooltip: "Payout status = PARTIAL (đã nhận một phần, chắc chắn có)",
    stability: "ESTIMATED",
  },
  FORECAST_LIKELY: {
    label: "Likely",
    tooltip: "Payout status = PENDING (chờ về, chưa xác nhận)",
    stability: "ESTIMATED",
  },
  FORECAST_EXPECTED: {
    label: "Expected",
    tooltip: "OTA AR đủ điều kiện payout nhưng chưa tạo payout",
    stability: "ESTIMATED",
  },
  FORECAST_OUT: {
    label: "Chi (AP)",
    tooltip: "Host settlements + Service costs dự kiến phải trả",
    stability: "ESTIMATED",
  },

  // Công nợ
  OTA_RECEIVABLES: {
    label: "Công nợ OTA",
    tooltip: "Tiền OTA chưa ghi nhận về tài khoản. Bao gồm: Chờ tạo payout + Đang chuyển về.",
    stability: "REALTIME",
  },
  HOST_DEBT: {
    label: "Công nợ Host",
    tooltip: "= (Tiền phòng + Phụ phí) − Đã thanh toán. Phát sinh khi host cung cấp phòng, không cần chờ quyết toán.",
    stability: "REALTIME",
  },
} as const;

// ========== ACTION HINTS ==========
export const ACTION_HINTS = {
  HIGH_OTA_RECEIVABLES: "Tạo payout cho các booking đủ điều kiện",
  OVERDUE_PAYOUT: "Follow up với OTA về payout quá hạn",
  HIGH_HOST_DEBT: "Lên lịch thanh toán cho host",
  NEGATIVE_CASHFLOW: "Kiểm tra thu chi, đẩy nhanh collection",
  PENDING_ROOM: "Assign phòng cho booking",
  OPEN_DISPUTES: "Xử lý tranh chấp",
} as const;

// ========== DATA WARNINGS ==========
export const DATA_WARNINGS = {
  SAMPLE_DATA: "⚠️ Đang bao gồm dữ liệu mẫu (sample data)",
  EXECUTIVE_MODE: "👁 Executive View - Chi tiết ẩn",
  DATA_DELAY: "Dữ liệu có thể chậm 1-5 phút so với thực tế",
} as const;

// ========== CONTEXT MESSAGES ==========
export const CONTEXT_MESSAGES = {
  OPERATIONS: (count: number) => `${count} booking active hôm nay`,
  CASH: (net: string) => `Dòng tiền ròng: ${net}`,
  RECEIVABLES: (total: string) => `OTA nợ: ${total}`,
  FORECAST: (net: string) => `Dự kiến 30 ngày: ${net}`,
  LAST_SYNC: (time: string) => `Cập nhật: ${time}`,
} as const;
