-- ================================================================
-- FIX: Add OTA_PAYOUT to cashflow_entries source_type constraint
-- ================================================================
-- 
-- Lỗi: "violates check constraint cashflow_entries_source_type_check"
-- Nguyên nhân: RPC create_ota_payout_cashin_atomic insert source_type='OTA_PAYOUT'
--              nhưng constraint chỉ cho phép 'OTA_PAYOUT_CASH_IN'
-- ================================================================

-- Drop and recreate constraint with OTA_PAYOUT added
ALTER TABLE public.cashflow_entries DROP CONSTRAINT IF EXISTS cashflow_entries_source_type_check;

ALTER TABLE public.cashflow_entries ADD CONSTRAINT cashflow_entries_source_type_check 
CHECK (source_type IN (
  'HOST_SETTLEMENT_PAYMENT', 
  'SERVICE_SETTLEMENT_PAYMENT', 
  'HOTEL_COLLECT', 
  'OTA_PAYOUT',           -- ADD: From create_ota_payout_cashin_atomic
  'OTA_PAYOUT_CASH_IN',   -- Legacy
  'CASH_OUT', 
  'INTERNAL_EXPENSE',     -- ADD: From create_cash_out_atomic
  'OTA_COMMISSION',       -- ADD: From create_cash_out_atomic  
  'REFUND', 
  'VOID'
));

COMMENT ON CONSTRAINT cashflow_entries_source_type_check ON public.cashflow_entries IS
  'Valid source types for cashflow entries. ADD-ONLY when new flows are created.';
