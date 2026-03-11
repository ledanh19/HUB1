-- ============================================
-- PAYMENT METHOD STANDARDIZATION
-- Migration: 20260105_standardize_payment_methods.sql
-- 
-- MỤC TIÊU:
-- - Chuẩn hóa payment_method sang 6 giá trị: CASH, BANK_TRANSFER, CARD, QR, PAYMENT_LINK, OTA_COLLECT
-- - Migrate legacy values: TRANSFER → BANK_TRANSFER, POS → CARD
-- - ADD-ONLY: Không xóa dữ liệu, chỉ update values
-- 
-- QUAN TRỌNG:
-- - Không thay đổi schema
-- - Không drop columns
-- - Backward compatible với code mới
-- ============================================

-- ============================================
-- PART A: DATA MIGRATION - hotel_collects
-- ============================================

-- Migrate TRANSFER → BANK_TRANSFER
UPDATE public.hotel_collects
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'TRANSFER';

-- Migrate POS → CARD
UPDATE public.hotel_collects
SET payment_method = 'CARD'
WHERE payment_method = 'POS';

-- Migrate CREDIT_CARD/DEBIT_CARD → CARD
UPDATE public.hotel_collects
SET payment_method = 'CARD'
WHERE payment_method IN ('CREDIT_CARD', 'DEBIT_CARD');

-- Log migration count
DO $$
DECLARE
  v_transfer_count INT;
  v_pos_count INT;
BEGIN
  SELECT COUNT(*) INTO v_transfer_count 
  FROM hotel_collects 
  WHERE payment_method = 'TRANSFER';
  
  SELECT COUNT(*) INTO v_pos_count 
  FROM hotel_collects 
  WHERE payment_method = 'POS';
  
  RAISE NOTICE 'hotel_collects: TRANSFER remaining: %, POS remaining: %', v_transfer_count, v_pos_count;
END $$;


-- ============================================
-- PART B: DATA MIGRATION - ledger_entries
-- ============================================

-- Migrate via metadata JSON if payment_method is stored there
UPDATE public.ledger_entries
SET metadata = jsonb_set(
  metadata,
  '{payment_method}',
  '"BANK_TRANSFER"'
)
WHERE metadata->>'payment_method' = 'TRANSFER';

UPDATE public.ledger_entries
SET metadata = jsonb_set(
  metadata,
  '{payment_method}',
  '"CARD"'
)
WHERE metadata->>'payment_method' = 'POS';


-- ============================================
-- PART C: DATA MIGRATION - account_mapping_rules
-- ============================================

-- Migrate TRANSFER → BANK_TRANSFER
UPDATE public.account_mapping_rules
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'TRANSFER';

-- Migrate POS → CARD
UPDATE public.account_mapping_rules
SET payment_method = 'CARD'
WHERE payment_method = 'POS';


-- ============================================
-- PART D: COMMENT FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN public.hotel_collects.payment_method IS 
'Standard payment methods: CASH, BANK_TRANSFER, CARD, QR, PAYMENT_LINK, OTA_COLLECT. 
Legacy values (TRANSFER, POS) auto-migrated.';

COMMENT ON COLUMN public.account_mapping_rules.payment_method IS 
'Standard payment methods for mapping: CASH, BANK_TRANSFER, CARD, QR, PAYMENT_LINK, OTA_COLLECT. NULL = match any.';


-- ============================================
-- PART E: VALIDATION QUERY (for manual check)
-- ============================================

/*
SELECT payment_method, COUNT(*) 
FROM hotel_collects 
GROUP BY payment_method 
ORDER BY COUNT(*) DESC;

SELECT payment_method, COUNT(*) 
FROM account_mapping_rules 
WHERE payment_method IS NOT NULL
GROUP BY payment_method 
ORDER BY COUNT(*) DESC;
*/
