-- Add columns to track Channex revision and status for modification detection
ALTER TABLE public.bookings_mirror 
ADD COLUMN IF NOT EXISTS channex_revision_id TEXT,
ADD COLUMN IF NOT EXISTS channex_status TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_revision ON public.bookings_mirror(channex_revision_id);

-- Add comment for documentation
COMMENT ON COLUMN public.bookings_mirror.channex_revision_id IS 'Channex revision ID - changes when booking is modified';
COMMENT ON COLUMN public.bookings_mirror.channex_status IS 'Channex booking status (new, modified, cancelled, etc.)';