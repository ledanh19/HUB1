
-- Add provider_payout_id to ota_payouts
ALTER TABLE public.ota_payouts ADD COLUMN IF NOT EXISTS provider_payout_id text;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_ota_payouts_provider_payout_id 
  ON public.ota_payouts (provider_payout_id) 
  WHERE provider_payout_id IS NOT NULL;

-- Comment
COMMENT ON COLUMN public.ota_payouts.provider_payout_id IS 'ID payout từ OTA provider (e.g. Booking.com payout reference)';
