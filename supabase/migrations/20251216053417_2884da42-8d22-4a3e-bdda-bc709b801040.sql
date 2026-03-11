-- Add source_payout_id to hotel_collects to link OTA payout cash-ins
ALTER TABLE public.hotel_collects 
ADD COLUMN IF NOT EXISTS source_payout_id uuid REFERENCES public.ota_payouts(id);

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_hotel_collects_source_payout_id 
ON public.hotel_collects(source_payout_id) 
WHERE source_payout_id IS NOT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN public.hotel_collects.source_payout_id IS 'Links to OTA payout when related_type=OTA_PAYOUT. Required for OTA payout cash-in tracking.';