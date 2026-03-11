-- ============================================================================
-- PRICE ADJUSTMENT TRACKING SYSTEM
-- ============================================================================
-- Purpose: Track price adjustments made through forecast mode to enable:
-- 1. Closed-loop feedback: See velocity changes AFTER adjustment
-- 2. "Needs Review" filter: Identify rows not adjusted in >14 days
-- 3. Adjustment history: View past decisions for each property/room/period
-- ============================================================================

-- Create price_adjustments table
CREATE TABLE IF NOT EXISTS price_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity: What was adjusted
  property_id TEXT NOT NULL,           -- pms_property_id
  property_name TEXT NOT NULL,         -- For display
  room_type TEXT NOT NULL,             -- Room type name
  period_key TEXT NOT NULL,            -- 'YYYY-MM' format
  day_type TEXT DEFAULT 'ALL',         -- 'WEEKDAY', 'WEEKEND', 'ALL'
  
  -- Adjustment details
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  adjustment_percent NUMERIC(5,2) NOT NULL,  -- e.g., +5.00, -3.00
  adjustment_type TEXT DEFAULT 'MANUAL',     -- 'MANUAL', 'AUTO', 'BULK'
  
  -- Context at time of adjustment (for comparison)
  pre_margin_percent NUMERIC(6,2),     -- Margin before adjustment
  pre_velocity_ratio NUMERIC(6,3),     -- Velocity before adjustment  
  pre_volume_score NUMERIC(6,3),       -- Volume score before
  pre_ota_adr NUMERIC(12,0),           -- OTA ADR at time of decision
  pre_host_adr NUMERIC(12,0),          -- Host ADR at time of decision
  
  -- User tracking
  adjusted_by UUID REFERENCES auth.users(id),
  notes TEXT,                          -- Optional notes
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_price_adj_property_room_period 
  ON price_adjustments(property_id, room_type, period_key);
CREATE INDEX IF NOT EXISTS idx_price_adj_adjusted_at 
  ON price_adjustments(adjusted_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_adj_period 
  ON price_adjustments(period_key);

-- Composite unique constraint to allow multiple adjustments but track latest
-- (No unique constraint - we want to keep ALL adjustments for history)

-- RLS Policies
ALTER TABLE price_adjustments ENABLE ROW LEVEL SECURITY;

-- View policy: Anyone authenticated can view
CREATE POLICY "Allow authenticated read price_adjustments"
  ON price_adjustments FOR SELECT
  TO authenticated
  USING (true);

-- Insert policy: Anyone authenticated can insert
CREATE POLICY "Allow authenticated insert price_adjustments"
  ON price_adjustments FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View: Latest adjustment per property/room/period
CREATE OR REPLACE VIEW latest_price_adjustments AS
SELECT DISTINCT ON (property_id, room_type, period_key)
  id,
  property_id,
  property_name,
  room_type,
  period_key,
  day_type,
  adjusted_at,
  adjustment_percent,
  adjustment_type,
  pre_margin_percent,
  pre_velocity_ratio,
  pre_volume_score,
  pre_ota_adr,
  pre_host_adr,
  adjusted_by,
  notes,
  -- Calculated: Days since last adjustment
  EXTRACT(DAY FROM (NOW() - adjusted_at))::INT AS days_since_adjustment
FROM price_adjustments
ORDER BY property_id, room_type, period_key, adjusted_at DESC;

-- ============================================================================
-- RPC: Log new price adjustment
-- ============================================================================
CREATE OR REPLACE FUNCTION log_price_adjustment(
  p_property_id TEXT,
  p_property_name TEXT,
  p_room_type TEXT,
  p_period_key TEXT,
  p_day_type TEXT DEFAULT 'ALL',
  p_adjustment_percent NUMERIC DEFAULT 0,
  p_adjustment_type TEXT DEFAULT 'MANUAL',
  p_pre_margin_percent NUMERIC DEFAULT NULL,
  p_pre_velocity_ratio NUMERIC DEFAULT NULL,
  p_pre_volume_score NUMERIC DEFAULT NULL,
  p_pre_ota_adr NUMERIC DEFAULT NULL,
  p_pre_host_adr NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO price_adjustments (
    property_id,
    property_name,
    room_type,
    period_key,
    day_type,
    adjustment_percent,
    adjustment_type,
    pre_margin_percent,
    pre_velocity_ratio,
    pre_volume_score,
    pre_ota_adr,
    pre_host_adr,
    adjusted_by,
    notes
  ) VALUES (
    p_property_id,
    p_property_name,
    p_room_type,
    p_period_key,
    p_day_type,
    p_adjustment_percent,
    p_adjustment_type,
    p_pre_margin_percent,
    p_pre_velocity_ratio,
    p_pre_volume_score,
    p_pre_ota_adr,
    p_pre_host_adr,
    auth.uid(),
    p_notes
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- ============================================================================
-- RPC: Get adjustment history for a specific property/room/period
-- ============================================================================
CREATE OR REPLACE FUNCTION get_adjustment_history(
  p_property_id TEXT,
  p_room_type TEXT,
  p_period_key TEXT
)
RETURNS TABLE (
  id UUID,
  adjusted_at TIMESTAMPTZ,
  adjustment_percent NUMERIC,
  adjustment_type TEXT,
  pre_margin_percent NUMERIC,
  pre_velocity_ratio NUMERIC,
  notes TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    id,
    adjusted_at,
    adjustment_percent,
    adjustment_type,
    pre_margin_percent,
    pre_velocity_ratio,
    notes
  FROM price_adjustments
  WHERE property_id = p_property_id
    AND room_type = p_room_type
    AND period_key = p_period_key
  ORDER BY adjusted_at DESC
  LIMIT 20;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_price_adjustment TO authenticated;
GRANT EXECUTE ON FUNCTION get_adjustment_history TO authenticated;
GRANT SELECT ON latest_price_adjustments TO authenticated;

COMMENT ON TABLE price_adjustments IS 'Tracks all price adjustments made through forecast mode for closed-loop feedback';
