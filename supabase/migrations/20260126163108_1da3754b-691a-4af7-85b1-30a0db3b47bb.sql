-- Add check-in/check-out tracking columns to host_supply_segments
ALTER TABLE public.host_supply_segments 
ADD COLUMN IF NOT EXISTS actual_check_in_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS actual_check_out_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS checked_in_by UUID,
ADD COLUMN IF NOT EXISTS checked_out_by UUID;

-- Add comments for documentation
COMMENT ON COLUMN public.host_supply_segments.actual_check_in_at IS 'Timestamp when this room segment was checked in';
COMMENT ON COLUMN public.host_supply_segments.actual_check_out_at IS 'Timestamp when this room segment was checked out';
COMMENT ON COLUMN public.host_supply_segments.checked_in_by IS 'User ID who performed the check-in';
COMMENT ON COLUMN public.host_supply_segments.checked_out_by IS 'User ID who performed the check-out';

-- Create index for faster queries on check-in status
CREATE INDEX IF NOT EXISTS idx_host_supply_segments_check_in_status 
ON public.host_supply_segments (actual_check_in_at, actual_check_out_at);