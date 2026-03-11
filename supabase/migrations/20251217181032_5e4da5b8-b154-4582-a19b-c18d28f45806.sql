-- Add ota_property_id column to store the actual OTA property ID (e.g., Expedia hotel ID "60723416")
-- This is different from channex_property_id which is Channex's internal UUID

ALTER TABLE public.bookings_mirror 
ADD COLUMN IF NOT EXISTS ota_property_id text;

-- Add comment to clarify the difference
COMMENT ON COLUMN public.bookings_mirror.ota_property_id IS 'OTA-specific property ID (e.g., Expedia hotel ID "60723416"), extracted from raw booking data';
COMMENT ON COLUMN public.bookings_mirror.channex_property_id IS 'Channex internal property UUID';
COMMENT ON COLUMN public.bookings_mirror.ota_booking_code IS 'OTA reservation code (e.g., "EXP-123456")';
COMMENT ON COLUMN public.bookings_mirror.pms_booking_id IS 'Provider booking ID (Channex UUID for bookings from Channex)';