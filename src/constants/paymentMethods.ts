/**
 * PAYMENT METHODS - SINGLE SOURCE OF TRUTH
 * 
 * ⚠️ QUAN TRỌNG:
 * - File này là nguồn DUY NHẤT cho tất cả PTTT trong hệ thống
 * - KHÔNG hardcode payment method strings ở bất kỳ đâu khác
 * - Import từ file này cho tất cả dropdowns
 * 
 * 🧩 KIẾN TRÚC 3 LỚP:
 * A) CANONICAL PAYMENT METHOD - bản chất thanh toán (dùng cho LEDGER)
 *    - CASH, BANK_TRANSFER, CARD, QR, EWALLET
 * B) PAYMENT PROVIDER - qua gateway nào (chỉ để TRACE)
 *    - SEPAY, ONEPAY, NINEPAY, MOMO, VNPAY, DIRECT...
 * C) CASH ACCOUNT - tài khoản thực (bắt buộc cho LEDGER)
 *    - Auto-resolve từ mapping rules, CSKH không cần chọn
 * 
 * @see docs/UX_PMS_GOVERNANCE_IMPLEMENTATION.md
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * CANONICAL Payment Method Code
 * 5 phương thức thanh toán chuẩn - dùng cho LEDGER
 */
export type CanonicalPaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CARD'
  | 'QR'
  | 'EWALLET';

/**
 * Payment Provider - qua gateway nào (optional, chỉ để trace)
 */
export type PaymentProvider =
  | 'SEPAY'
  | 'ONEPAY'
  | 'NINEPAY'
  | 'MOMO'
  | 'VNPAY'
  | 'ZALOPAY'
  | 'DIRECT'
  | 'OTHER';

/**
 * Legacy Payment Method Code - backward compatibility
 * @deprecated Use CanonicalPaymentMethod instead
 */
export type PaymentMethodCode =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CARD'
  | 'QR'
  | 'PAYMENT_LINK'
  | 'OTA_COLLECT';

/**
 * Direction for cash flow
 */
export type PaymentDirection = 'IN' | 'OUT';

/**
 * Payment Method Definition
 */
export interface PaymentMethodDef {
  /** Unique code - KHÔNG ĐỔI sau khi đã dùng */
  code: PaymentMethodCode;
  /** Label tiếng Việt - có thể update */
  label_vi: string;
  /** Mô tả chi tiết */
  description_vi: string;
  /** Icon emoji */
  icon: string;
  /** Hướng hỗ trợ: IN (thu), OUT (chi), hoặc cả hai */
  direction_supported: PaymentDirection[];
  /** Có thể dùng trong mapping rules không */
  allow_mapping: boolean;
  /** Còn active không (false = ẩn khỏi dropdown tạo mới) */
  is_active: boolean;
  /** Thứ tự hiển thị trong dropdown */
  sort_order: number;
}

// ============================================
// PAYMENT METHODS MASTER LIST
// ============================================

/**
 * DANH SÁCH PTTT CHUẨN
 * 
 * ⚠️ KHÔNG thêm/xóa tùy tiện
 * ⚠️ KHÔNG đổi code sau khi đã có data
 */
export const PAYMENT_METHODS: readonly PaymentMethodDef[] = [
  {
    code: 'CASH',
    label_vi: 'Tiền mặt',
    description_vi: 'Thu/chi tiền mặt trực tiếp tại quầy',
    icon: 'banknote',
    direction_supported: ['IN', 'OUT'],
    allow_mapping: true,
    is_active: true,
    sort_order: 1,
  },
  {
    code: 'BANK_TRANSFER',
    label_vi: 'Chuyển khoản ngân hàng',
    description_vi: 'Khách/đối tác chuyển khoản trực tiếp vào tài khoản ngân hàng',
    icon: 'building2',
    direction_supported: ['IN', 'OUT'],
    allow_mapping: true,
    is_active: true,
    sort_order: 2,
  },
  {
    code: 'CARD',
    label_vi: 'Thẻ (POS)',
    description_vi: 'Quẹt thẻ tín dụng/ghi nợ tại máy POS',
    icon: 'credit-card',
    direction_supported: ['IN'],
    allow_mapping: true,
    is_active: true,
    sort_order: 3,
  },
  {
    code: 'QR',
    label_vi: 'QR Code',
    description_vi: 'Khách quét mã QR thanh toán (VietQR, MoMo, ZaloPay...)',
    icon: 'qr-code',
    direction_supported: ['IN'],
    allow_mapping: true,
    is_active: true,
    sort_order: 4,
  },
  {
    code: 'PAYMENT_LINK',
    label_vi: 'Link thanh toán',
    description_vi: 'Gửi link thanh toán qua SMS/email cho khách',
    icon: 'link-2',
    direction_supported: ['IN'],
    allow_mapping: true,
    is_active: true,
    sort_order: 5,
  },
  {
    code: 'OTA_COLLECT',
    label_vi: 'OTA thu hộ',
    description_vi: 'Tiền từ OTA chuyển về (Agoda, Booking.com, Airbnb...)',
    icon: 'globe',
    direction_supported: ['IN'],
    allow_mapping: false, // OTA payout KHÔNG dùng auto-mapping
    is_active: true,
    sort_order: 6,
  },
] as const;

// ============================================
// CANONICAL PAYMENT METHODS (for ledger/logic)
// ============================================

export interface CanonicalPaymentDef {
  code: CanonicalPaymentMethod;
  label_vi: string;
  description_vi: string;
  icon: string;
  direction_supported: PaymentDirection[];
}

/**
 * CANONICAL PAYMENT METHODS - BẢN CHẤT THANH TOÁN
 * 
 * ⚠️ Dùng cho LEDGER và LOGIC kế toán
 * ⚠️ KHÔNG phụ thuộc gateway/provider
 */
export const CANONICAL_PAYMENT_METHODS: readonly CanonicalPaymentDef[] = [
  {
    code: 'CASH',
    label_vi: 'Tiền mặt',
    description_vi: 'Thu/chi tiền mặt trực tiếp',
    icon: 'banknote',
    direction_supported: ['IN', 'OUT'],
  },
  {
    code: 'BANK_TRANSFER',
    label_vi: 'Chuyển khoản',
    description_vi: 'Chuyển khoản ngân hàng',
    icon: 'building2',
    direction_supported: ['IN', 'OUT'],
  },
  {
    code: 'CARD',
    label_vi: 'Thẻ (POS)',
    description_vi: 'Quẹt thẻ tại máy POS',
    icon: 'credit-card',
    direction_supported: ['IN'],
  },
  {
    code: 'QR',
    label_vi: 'QR Code',
    description_vi: 'Quét mã QR thanh toán',
    icon: 'qr-code',
    direction_supported: ['IN'],
  },
  {
    code: 'EWALLET',
    label_vi: 'Ví điện tử',
    description_vi: 'Ví điện tử (nếu khác QR)',
    icon: 'smartphone',
    direction_supported: ['IN'],
  },
] as const;

// ============================================
// PAYMENT PROVIDERS (for tracing only)
// ============================================

export interface PaymentProviderDef {
  code: PaymentProvider;
  label_vi: string;
  description_vi: string;
  icon: string;
}

/**
 * LINK PROVIDERS - Đơn vị cung cấp link thanh toán
 * 
 * ⭐ Dùng cho:
 * - Dropdown khi CSKH chọn "Link thanh toán" trong CollectPaymentDialog
 * - Mapping rules theo từng provider cụ thể
 */
export const LINK_PROVIDERS = [
  { code: 'ONEPAY', label_vi: 'OnePay', icon: 'credit-card', description_vi: 'Link thanh toán qua OnePay' },
  { code: 'NINEPAY', label_vi: '9Pay', icon: 'wallet', description_vi: 'Link thanh toán qua 9Pay' },
  { code: 'VNPAY', label_vi: 'VNPay', icon: 'qr-code', description_vi: 'Link thanh toán qua VNPay' },
  { code: 'MOMO', label_vi: 'MoMo', icon: 'smartphone', description_vi: 'Link thanh toán qua MoMo' },
  { code: 'ZALOPAY', label_vi: 'ZaloPay', icon: 'wallet', description_vi: 'Link thanh toán qua ZaloPay' },
  { code: 'OTHER', label_vi: 'Khác', icon: 'link-2', description_vi: 'Link thanh toán khác' },
] as const;

export type LinkProviderCode = typeof LINK_PROVIDERS[number]['code'];

/**
 * LINK_PROVIDER_OPTIONS - Cho dropdown chọn provider
 */
export const LINK_PROVIDER_OPTIONS = LINK_PROVIDERS.map(p => ({
  value: p.code,
  label: p.label_vi,
  icon: p.icon,
  description: p.description_vi,
}));

/**
 * PAYMENT PROVIDERS - GATEWAY/KÊNH THANH TOÁN
 * 
 * ⚠️ CHỈ dùng để TRACE và BÁO CÁO
 * ⚠️ KHÔNG quyết định ledger
 * ⚠️ KHÔNG dùng làm mapping chính
 */
export const PAYMENT_PROVIDERS: readonly PaymentProviderDef[] = [
  {
    code: 'DIRECT',
    label_vi: 'Trực tiếp',
    description_vi: 'Thanh toán trực tiếp (không qua gateway)',
    icon: 'home',
  },
  {
    code: 'SEPAY',
    label_vi: 'SePay',
    description_vi: 'Gateway SePay quản lý nhiều TK ngân hàng',
    icon: 'shield',
  },
  {
    code: 'ONEPAY',
    label_vi: 'OnePay',
    description_vi: 'Gateway OnePay',
    icon: 'credit-card',
  },
  {
    code: 'NINEPAY',
    label_vi: '9Pay',
    description_vi: 'Gateway 9Pay',
    icon: 'wallet',
  },
  {
    code: 'MOMO',
    label_vi: 'MoMo',
    description_vi: 'Ví MoMo',
    icon: 'smartphone',
  },
  {
    code: 'VNPAY',
    label_vi: 'VNPay',
    description_vi: 'Cổng thanh toán VNPay',
    icon: 'qr-code',
  },
  {
    code: 'ZALOPAY',
    label_vi: 'ZaloPay',
    description_vi: 'Ví ZaloPay',
    icon: 'wallet',
  },
  {
    code: 'OTHER',
    label_vi: 'Khác',
    description_vi: 'Gateway/kênh khác',
    icon: 'link-2',
  },
] as const;

// ============================================
// DERIVED LISTS (for different use cases)
// ============================================

/**
 * PTTT active cho dropdown tạo mới
 */
export const ACTIVE_PAYMENT_METHODS = PAYMENT_METHODS.filter(m => m.is_active);

/**
 * PTTT cho thu tiền khách tại khách sạn
 * Không bao gồm OTA_COLLECT (chỉ dùng auto từ webhook)
 */
export const HOTEL_COLLECT_METHODS = ACTIVE_PAYMENT_METHODS
  .filter(m => m.direction_supported.includes('IN') && m.code !== 'OTA_COLLECT')
  .sort((a, b) => a.sort_order - b.sort_order);

/**
 * PTTT cho chi tiền (Cash Out)
 */
export const CASH_OUT_METHODS = ACTIVE_PAYMENT_METHODS
  .filter(m => m.direction_supported.includes('OUT'))
  .sort((a, b) => a.sort_order - b.sort_order);

/**
 * PTTT cho mapping rules (bao gồm tất cả để cover legacy)
 */
export const MAPPING_RULE_METHODS = PAYMENT_METHODS
  .filter(m => m.allow_mapping)
  .sort((a, b) => a.sort_order - b.sort_order);

/**
 * Tất cả PTTT với option "Tất cả" cho filter
 */
export const ALL_METHODS_WITH_ANY = [
  { code: '', label_vi: 'Tất cả', icon: '' } as const,
  ...PAYMENT_METHODS,
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get payment method by code
 */
export function getPaymentMethod(code: string): PaymentMethodDef | undefined {
  return PAYMENT_METHODS.find(m => m.code === code);
}

/**
 * Get label từ code (fallback to code nếu không tìm thấy)
 */
export function getPaymentMethodLabel(code: string): string {
  const method = getPaymentMethod(code);
  return method?.label_vi ?? code;
}

/**
 * Get icon từ code
 */
export function getPaymentMethodIcon(code: string): string {
  const method = getPaymentMethod(code);
  return method?.icon ?? 'banknote';
}

/**
 * Check if code is valid
 */
export function isValidPaymentMethodCode(code: string): code is PaymentMethodCode {
  return PAYMENT_METHODS.some(m => m.code === code);
}

/**
 * Check if method is active
 */
export function isActivePaymentMethod(code: string): boolean {
  const method = getPaymentMethod(code);
  return method?.is_active ?? false;
}

// ============================================
// LEGACY MAPPING (backward compatibility)
// ============================================

/**
 * Map legacy codes to standard codes
 * Dùng khi đọc dữ liệu cũ từ DB
 */
export const LEGACY_CODE_MAP: Record<string, PaymentMethodCode> = {
  // Old → New
  'TRANSFER': 'BANK_TRANSFER',
  'POS': 'CARD',
  'CREDIT_CARD': 'CARD',
  'DEBIT_CARD': 'CARD',
  'EWALLET': 'QR',
  'MOMO': 'QR',
  'ZALOPAY': 'QR',
  'VNPAY': 'QR',
};

/**
 * Normalize legacy code to standard code
 */
export function normalizePaymentCode(code: string): PaymentMethodCode | string {
  // If already standard, return as is
  if (isValidPaymentMethodCode(code)) {
    return code;
  }
  // If legacy, map to standard
  return LEGACY_CODE_MAP[code] ?? code;
}

/**
 * Check if code is legacy (non-standard)
 */
export function isLegacyPaymentCode(code: string): boolean {
  return code in LEGACY_CODE_MAP;
}

// ============================================
// DROPDOWN OPTIONS (ready for Select components)
// ============================================

/**
 * Options cho dropdown thu tiền khách
 * Format: { value, label, icon }
 */
export const HOTEL_COLLECT_OPTIONS = HOTEL_COLLECT_METHODS.map(m => ({
  value: m.code,
  label: m.label_vi,
  icon: m.icon,
  description: m.description_vi,
}));

/**
 * Options cho dropdown chi tiền
 */
export const CASH_OUT_OPTIONS = CASH_OUT_METHODS.map(m => ({
  value: m.code,
  label: m.label_vi,
  icon: m.icon,
  description: m.description_vi,
}));

/**
 * Options cho dropdown mapping rules (với "Tất cả")
 */
export const MAPPING_RULE_OPTIONS = [
  { value: '', label: 'Tất cả', icon: '', description: 'Áp dụng cho mọi PTTT' },
  ...MAPPING_RULE_METHODS.map(m => ({
    value: m.code,
    label: m.label_vi,
    icon: m.icon,
    description: m.description_vi,
  })),
];

/**
 * Options cho filter (với "Tất cả")
 */
export const FILTER_OPTIONS = [
  { value: '', label: 'Tất cả', icon: '' },
  ...PAYMENT_METHODS.map(m => ({
    value: m.code,
    label: m.label_vi,
    icon: m.icon,
  })),
];

// ============================================
// CANONICAL OPTIONS (for new UI)
// ============================================

/**
 * CANONICAL PAYMENT OPTIONS cho CSKH
 * 
 * ⭐ DÙNG CHO DROPDOWN THU/CHI TIỀN
 * - CSKH chỉ cần chọn bản chất thanh toán
 * - Tài khoản được auto-resolve
 */
export const CANONICAL_COLLECT_OPTIONS = CANONICAL_PAYMENT_METHODS
  .filter(m => m.direction_supported.includes('IN'))
  .map(m => ({
    value: m.code,
    label: m.label_vi,
    icon: m.icon,
    description: m.description_vi,
  }));

export const CANONICAL_CASHOUT_OPTIONS = CANONICAL_PAYMENT_METHODS
  .filter(m => m.direction_supported.includes('OUT'))
  .map(m => ({
    value: m.code,
    label: m.label_vi,
    icon: m.icon,
    description: m.description_vi,
  }));

/**
 * PAYMENT PROVIDER OPTIONS (optional)
 * 
 * ⭐ CHỈ để trace, không ảnh hưởng ledger
 */
export const PROVIDER_OPTIONS = [
  { value: '', label: 'Không qua gateway', icon: '' },
  ...PAYMENT_PROVIDERS.map(p => ({
    value: p.code,
    label: p.label_vi,
    icon: p.icon,
    description: p.description_vi,
  })),
];

// ============================================
// HELPER FUNCTIONS FOR CANONICAL
// ============================================

/**
 * Get canonical payment method by code
 */
export function getCanonicalPaymentMethod(code: string): CanonicalPaymentDef | undefined {
  return CANONICAL_PAYMENT_METHODS.find(m => m.code === code);
}

/**
 * Get canonical label
 */
export function getCanonicalPaymentLabel(code: string): string {
  const method = getCanonicalPaymentMethod(code);
  return method?.label_vi ?? code;
}

/**
 * Get canonical icon
 */
export function getCanonicalPaymentIcon(code: string): string {
  const method = getCanonicalPaymentMethod(code);
  return method?.icon ?? 'banknote';
}

/**
 * Check if code is valid canonical payment method
 */
export function isValidCanonicalPayment(code: string): code is CanonicalPaymentMethod {
  return CANONICAL_PAYMENT_METHODS.some(m => m.code === code);
}

/**
 * Get provider by code
 */
export function getPaymentProvider(code: string): PaymentProviderDef | undefined {
  return PAYMENT_PROVIDERS.find(p => p.code === code);
}

/**
 * Get provider label
 */
export function getProviderLabel(code: string): string {
  const provider = getPaymentProvider(code);
  return provider?.label_vi ?? code ?? 'Trực tiếp';
}

/**
 * Get provider icon
 */
export function getProviderIcon(code: string): string {
  const provider = getPaymentProvider(code);
  return provider?.icon ?? 'home';
}
