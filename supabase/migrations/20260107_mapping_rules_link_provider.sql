-- ============================================
-- Migration: Add link_provider to account_mapping_rules
-- Purpose: Allow mapping specific payment link providers (OnePay, 9Pay, etc.) to cash accounts
-- Date: 2026-01-07
-- Author: Roomrise Team
-- ============================================

-- Add link_provider column
ALTER TABLE account_mapping_rules
ADD COLUMN IF NOT EXISTS link_provider TEXT;

-- Add check constraint for valid link providers
ALTER TABLE account_mapping_rules
ADD CONSTRAINT chk_link_provider 
CHECK (link_provider IS NULL OR link_provider IN ('ONEPAY', 'NINEPAY', 'VNPAY', 'MOMO', 'ZALOPAY', 'OTHER'));

-- Add comment explaining the column
COMMENT ON COLUMN account_mapping_rules.link_provider IS 
'Specific link provider (OnePay, 9Pay, etc.) when payment_method=PAYMENT_LINK. NULL means apply to all link providers.';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_mapping_rules_link_provider 
ON account_mapping_rules(link_provider) 
WHERE link_provider IS NOT NULL;

-- Update priority calculation function to include link_provider
-- Priority should be lower (higher priority) when more specific
CREATE OR REPLACE FUNCTION calculate_mapping_rule_priority()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate priority based on specificity (lower number = higher priority)
  -- Each non-null filter adds to specificity
  NEW.priority := CASE
    WHEN NEW.direction IS NOT NULL AND NEW.source_type IS NOT NULL AND NEW.payment_method IS NOT NULL AND NEW.link_provider IS NOT NULL THEN 1
    WHEN NEW.direction IS NOT NULL AND NEW.source_type IS NOT NULL AND NEW.payment_method IS NOT NULL THEN 2
    WHEN NEW.direction IS NOT NULL AND NEW.source_type IS NOT NULL THEN 3
    WHEN NEW.direction IS NOT NULL AND NEW.payment_method IS NOT NULL THEN 3
    WHEN NEW.source_type IS NOT NULL AND NEW.payment_method IS NOT NULL THEN 3
    WHEN NEW.direction IS NOT NULL THEN 4
    WHEN NEW.source_type IS NOT NULL THEN 4
    WHEN NEW.payment_method IS NOT NULL THEN 4
    ELSE 5 -- catch-all rule
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for auto-calculating priority
DROP TRIGGER IF EXISTS trg_calculate_mapping_priority ON account_mapping_rules;
CREATE TRIGGER trg_calculate_mapping_priority
BEFORE INSERT OR UPDATE ON account_mapping_rules
FOR EACH ROW
EXECUTE FUNCTION calculate_mapping_rule_priority();

-- Add payment_provider column to hotel_collections if not exists
ALTER TABLE hotel_collections
ADD COLUMN IF NOT EXISTS payment_provider TEXT;

-- Add check constraint for valid providers
ALTER TABLE hotel_collections
ADD CONSTRAINT chk_payment_provider 
CHECK (payment_provider IS NULL OR payment_provider IN ('ONEPAY', 'NINEPAY', 'VNPAY', 'MOMO', 'ZALOPAY', 'SEPAY', 'DIRECT', 'OTHER'));

COMMENT ON COLUMN hotel_collections.payment_provider IS 
'Payment provider/gateway used (OnePay, 9Pay, etc.). Used for mapping to correct cash account.';

-- ============================================
-- Example mapping rules for link providers
-- ============================================
-- INSERT INTO account_mapping_rules (rule_name, direction, source_type, payment_method, link_provider, cash_account_id)
-- VALUES 
--   ('Link OnePay → TK OnePay', 'IN', 'HOTEL_COLLECT', 'PAYMENT_LINK', 'ONEPAY', '<uuid-of-onepay-account>'),
--   ('Link 9Pay → TK 9Pay', 'IN', 'HOTEL_COLLECT', 'PAYMENT_LINK', 'NINEPAY', '<uuid-of-9pay-account>');
