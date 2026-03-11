-- Add first_synced_at to channex_mappings to detect initial import bookings
ALTER TABLE public.channex_mappings 
ADD COLUMN IF NOT EXISTS first_synced_at timestamp with time zone DEFAULT now();

-- Update existing mappings to use their created_at as first_synced_at
UPDATE public.channex_mappings 
SET first_synced_at = created_at 
WHERE first_synced_at IS NULL;

-- Add comment
COMMENT ON COLUMN public.channex_mappings.first_synced_at IS 'Timestamp when this property/channel was first synced. Bookings with booking_date before this are considered initial imports.';