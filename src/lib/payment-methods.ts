/**
 * PAYMENT METHODS - RE-EXPORT FOR BACKWARD COMPATIBILITY
 * 
 * ⚠️ DEPRECATED: Import từ @/constants/paymentMethods thay vì file này
 * 
 * File này được giữ lại để không break imports cũ.
 * Tất cả logic đã chuyển sang @/constants/paymentMethods.ts
 */

// Re-export everything from the new single source of truth
export {
  // Types - Legacy
  type PaymentMethodCode,
  type PaymentMethodCode as PaymentMethod, // Alias for backward compatibility
  type PaymentDirection,
  type PaymentMethodDef,
  
  // Types - Canonical (NEW)
  type CanonicalPaymentMethod,
  type PaymentProvider,
  type CanonicalPaymentDef,
  type PaymentProviderDef,
  
  // Master list - Legacy
  PAYMENT_METHODS as STANDARD_PAYMENT_METHODS,
  
  // Master list - Canonical (NEW)
  CANONICAL_PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  
  // Derived lists
  HOTEL_COLLECT_METHODS as HOTEL_COLLECT_PAYMENT_METHODS,
  MAPPING_RULE_METHODS as MAPPING_RULE_PAYMENT_METHODS,
  
  // Options for dropdowns - Legacy
  HOTEL_COLLECT_OPTIONS,
  CASH_OUT_OPTIONS,
  MAPPING_RULE_OPTIONS,
  
  // Options for dropdowns - Canonical (NEW)
  CANONICAL_COLLECT_OPTIONS,
  CANONICAL_CASHOUT_OPTIONS,
  PROVIDER_OPTIONS,
  
  // Helper functions - Legacy
  getPaymentMethodLabel,
  getPaymentMethodIcon,
  isValidPaymentMethodCode as isValidPaymentMethod,
  isActivePaymentMethod,
  normalizePaymentCode as normalizePaymentMethod,
  isLegacyPaymentCode as isLegacyPaymentMethod,
  
  // Helper functions - Canonical (NEW)
  getCanonicalPaymentMethod,
  getCanonicalPaymentLabel,
  getCanonicalPaymentIcon,
  isValidCanonicalPayment,
  getPaymentProvider,
  getProviderLabel,
  getProviderIcon,
  
  // Legacy mapping
  LEGACY_CODE_MAP as LEGACY_PAYMENT_METHOD_MAP,
} from '@/constants/paymentMethods';

