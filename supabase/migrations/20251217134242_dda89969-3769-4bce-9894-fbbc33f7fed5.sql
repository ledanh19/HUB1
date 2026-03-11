-- Add unified_booking_id to payment_requests for HOST_DEPOSIT/HOST_PREPAID tracking
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS unified_booking_id text;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_requests_unified_booking_id 
ON public.payment_requests(unified_booking_id) WHERE unified_booking_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.payment_requests.unified_booking_id IS 'Links payment request to booking for HOST_DEPOSIT/HOST_PREPAID purposes';