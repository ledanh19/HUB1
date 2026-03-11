-- ============================================
-- PAYMENT METHOD STANDARDIZATION (RE-RUN SAFE)
-- ============================================

-- PART A: DATA MIGRATION - hotel_collects
UPDATE public.hotel_collects
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'TRANSFER';

UPDATE public.hotel_collects
SET payment_method = 'CARD'
WHERE payment_method = 'POS';

UPDATE public.hotel_collects
SET payment_method = 'CARD'
WHERE payment_method IN ('CREDIT_CARD', 'DEBIT_CARD');

-- PART B: DATA MIGRATION - account_mapping_rules
UPDATE public.account_mapping_rules
SET payment_method = 'BANK_TRANSFER'
WHERE payment_method = 'TRANSFER';

UPDATE public.account_mapping_rules
SET payment_method = 'CARD'
WHERE payment_method = 'POS';

-- PART C: COMMENTS
COMMENT ON COLUMN public.hotel_collects.payment_method IS 
'Standard payment methods: CASH, BANK_TRANSFER, CARD, QR, PAYMENT_LINK, OTA_COLLECT. Legacy values (TRANSFER, POS) auto-migrated.';

COMMENT ON COLUMN public.account_mapping_rules.payment_method IS 
'Standard payment methods for mapping: CASH, BANK_TRANSFER, CARD, QR, PAYMENT_LINK, OTA_COLLECT. NULL = match any.';