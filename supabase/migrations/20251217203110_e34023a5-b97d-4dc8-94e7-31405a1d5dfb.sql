-- Add booking_type column to track SYNCED vs IMPORTED bookings
ALTER TABLE public.bookings_mirror 
ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'SYNCED';

-- Add comment for documentation
COMMENT ON COLUMN public.bookings_mirror.booking_type IS 'SYNCED = normal sync, IMPORTED = initial import (requires manual amount confirmation)';

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_booking_type ON public.bookings_mirror(booking_type);