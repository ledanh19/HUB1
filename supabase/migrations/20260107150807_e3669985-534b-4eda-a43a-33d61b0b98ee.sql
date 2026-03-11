-- ============================================
-- Migration: Add link_provider to account_mapping_rules
-- Purpose: Allow mapping specific payment link providers (OnePay, 9Pay, etc.) to cash accounts
-- Date: 2026-01-07
-- ============================================

-- Add link_provider column
ALTER TABLE account_mapping_rules
ADD COLUMN IF NOT EXISTS link_provider TEXT;

-- Drop constraint if exists then recreate
ALTER TABLE account_mapping_rules DROP CONSTRAINT IF EXISTS chk_link_provider;

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

-- Create hotel_collections table if not exists (for payment_provider column)
CREATE TABLE IF NOT EXISTS hotel_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  collection_type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'VND',
  payment_method TEXT,
  payment_provider TEXT,
  collected_at TIMESTAMPTZ DEFAULT now(),
  collected_by UUID,
  note TEXT,
  is_voided BOOLEAN DEFAULT false,
  voided_at TIMESTAMPTZ,
  voided_by UUID,
  voided_reason TEXT,
  is_sample_data BOOLEAN DEFAULT false,
  scenario_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add payment_provider column if table already exists
ALTER TABLE hotel_collections
ADD COLUMN IF NOT EXISTS payment_provider TEXT;

-- Drop constraint if exists then recreate
ALTER TABLE hotel_collections DROP CONSTRAINT IF EXISTS chk_payment_provider;

-- Add check constraint for valid providers
ALTER TABLE hotel_collections
ADD CONSTRAINT chk_payment_provider 
CHECK (payment_provider IS NULL OR payment_provider IN ('ONEPAY', 'NINEPAY', 'VNPAY', 'MOMO', 'ZALOPAY', 'SEPAY', 'DIRECT', 'OTHER'));

COMMENT ON COLUMN hotel_collections.payment_provider IS 
'Payment provider/gateway used (OnePay, 9Pay, etc.). Used for mapping to correct cash account.';

-- Enable RLS on hotel_collections
ALTER TABLE hotel_collections ENABLE ROW LEVEL SECURITY;

-- RLS policies for hotel_collections
DROP POLICY IF EXISTS "Allow authenticated read hotel_collections" ON hotel_collections;
CREATE POLICY "Allow authenticated read hotel_collections" ON hotel_collections
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert hotel_collections" ON hotel_collections;
CREATE POLICY "Allow authenticated insert hotel_collections" ON hotel_collections
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update hotel_collections" ON hotel_collections;
CREATE POLICY "Allow authenticated update hotel_collections" ON hotel_collections
  FOR UPDATE TO authenticated USING (true);