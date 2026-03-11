-- Add channex_user_id to bookings_mirror to link bookings to Channex user
ALTER TABLE public.bookings_mirror 
ADD COLUMN IF NOT EXISTS channex_user_id text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_channex_user_id 
ON public.bookings_mirror(channex_user_id);

-- Add comment for documentation
COMMENT ON COLUMN public.bookings_mirror.channex_user_id IS 'Links booking to Channex user who owns the property';