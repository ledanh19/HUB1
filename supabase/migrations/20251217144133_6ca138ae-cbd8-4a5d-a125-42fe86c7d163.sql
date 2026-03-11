-- Add payout_id column to ota_disputes for linking disputes to OTA Payouts
ALTER TABLE public.ota_disputes 
ADD COLUMN payout_id uuid REFERENCES public.ota_payouts(id);

-- Create index for better query performance
CREATE INDEX idx_ota_disputes_payout_id ON public.ota_disputes(payout_id);