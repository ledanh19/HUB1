-- Add ota_booking_code column to bookings_mirror
ALTER TABLE public.bookings_mirror 
ADD COLUMN IF NOT EXISTS ota_booking_code text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_ota_booking_code 
ON public.bookings_mirror(ota_booking_code);

-- Add comment for documentation
COMMENT ON COLUMN public.bookings_mirror.ota_booking_code IS 'OTA booking code from Channex (attributes.unique_id) - user-facing booking reference';