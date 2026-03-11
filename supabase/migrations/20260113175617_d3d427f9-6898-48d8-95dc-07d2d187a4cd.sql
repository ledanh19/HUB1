-- Add commission_percent column to booking_amount_overrides for imported bookings
ALTER TABLE public.booking_amount_overrides 
ADD COLUMN commission_percent numeric DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.booking_amount_overrides.commission_percent IS 'Commission percentage for imported bookings (e.g., 15 for 15%)';