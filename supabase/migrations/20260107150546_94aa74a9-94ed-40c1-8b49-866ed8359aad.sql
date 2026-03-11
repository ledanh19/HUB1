-- ============================================
-- Migration: Add link_provider to account_mapping_rules (SAFE VERSION)
-- Purpose: Allow mapping specific payment link providers (OnePay, 9Pay, etc.) to cash accounts
-- Note: hotel_collections part removed since table doesn't exist yet
-- ============================================

-- Add link_provider column (if not exists)
ALTER TABLE account_mapping_rules
ADD COLUMN IF NOT EXISTS link_provider TEXT;

-- Drop constraint if exists before re-adding
ALTER TABLE account_mapping_rules
DROP CONSTRAINT IF EXISTS chk_link_provider;

-- Add check constraint for valid link providers
ALTER TABLE account_mapping_rules
ADD CONSTRAINT chk_link_provider 
CHECK (link_provider IS NULL OR link_provider IN ('ONEPAY', 'NINEPAY', 'VNPAY', 'MOMO', 'ZALOPAY', 'SEPAY', 'DIRECT', 'OTHER'));

-- Add comment explaining the column
COMMENT ON COLUMN account_mapping_rules.link_provider IS 
'Specific link provider (OnePay, 9Pay, etc.) when payment_method=PAYMENT_LINK. NULL means apply to all link providers.';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_mapping_rules_link_provider 
ON account_mapping_rules(link_provider) 
WHERE link_provider IS NOT NULL;

-- Update priority calculation function to include link_provider
CREATE OR REPLACE FUNCTION calculate_mapping_rule_priority()
RETURNS TRIGGER AS $$
BEGIN
  NEW.priority := CASE
    WHEN NEW.direction IS NOT NULL AND NEW.source_type IS NOT NULL AND NEW.payment_method IS NOT NULL AND NEW.link_provider IS NOT NULL THEN 1
    WHEN NEW.direction IS NOT NULL AND NEW.source_type IS NOT NULL AND NEW.payment_method IS NOT NULL THEN 2
    WHEN NEW.direction IS NOT NULL AND NEW.source_type IS NOT NULL THEN 3
    WHEN NEW.direction IS NOT NULL AND NEW.payment_method IS NOT NULL THEN 3
    WHEN NEW.source_type IS NOT NULL AND NEW.payment_method IS NOT NULL THEN 3
    WHEN NEW.direction IS NOT NULL THEN 4
    WHEN NEW.source_type IS NOT NULL THEN 4
    WHEN NEW.payment_method IS NOT NULL THEN 4
    ELSE 5
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