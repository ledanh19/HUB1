-- =============================================================================
-- SEGMENT-LEVEL CHECK-IN/CHECK-OUT TRACKING
-- Purpose: Track check-in and check-out at segment level for multi-room bookings
-- Each segment can have its own check-in/check-out times independent of others
-- =============================================================================

-- 1. Add actual_check_in_at column to host_supply_segments
ALTER TABLE public.host_supply_segments 
ADD COLUMN IF NOT EXISTS actual_check_in_at TIMESTAMPTZ NULL;

-- 2. Add actual_check_out_at column to host_supply_segments
ALTER TABLE public.host_supply_segments 
ADD COLUMN IF NOT EXISTS actual_check_out_at TIMESTAMPTZ NULL;

-- 3. Add checked_in_by to track who performed check-in
ALTER TABLE public.host_supply_segments 
ADD COLUMN IF NOT EXISTS checked_in_by UUID NULL REFERENCES auth.users(id);

-- 4. Add checked_out_by to track who performed check-out
ALTER TABLE public.host_supply_segments 
ADD COLUMN IF NOT EXISTS checked_out_by UUID NULL REFERENCES auth.users(id);

-- 5. Create index for efficient querying by check-in status
CREATE INDEX IF NOT EXISTS idx_host_supply_segments_check_in 
ON public.host_supply_segments(date_from, actual_check_in_at);

-- 6. Create index for efficient querying by check-out status
CREATE INDEX IF NOT EXISTS idx_host_supply_segments_check_out 
ON public.host_supply_segments(date_to, actual_check_out_at);

-- 7. Add comments for clarity
COMMENT ON COLUMN public.host_supply_segments.actual_check_in_at IS 'Timestamp when guest actually checked in for this segment';
COMMENT ON COLUMN public.host_supply_segments.actual_check_out_at IS 'Timestamp when guest actually checked out from this segment';
COMMENT ON COLUMN public.host_supply_segments.checked_in_by IS 'User who performed the check-in action';
COMMENT ON COLUMN public.host_supply_segments.checked_out_by IS 'User who performed the check-out action';
