
-- Add room_line_index to host_supply_segments for multi-room booking support
ALTER TABLE public.host_supply_segments 
ADD COLUMN IF NOT EXISTS room_line_index integer DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.host_supply_segments.room_line_index IS 'Index of the room line this segment belongs to (0-based, for multi-room bookings)';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_host_supply_segments_room_line 
ON public.host_supply_segments(unified_booking_id, room_line_index);
