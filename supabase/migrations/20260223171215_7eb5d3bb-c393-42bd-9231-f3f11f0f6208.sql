ALTER TABLE public.ota_payouts ADD COLUMN IF NOT EXISTS ota_property_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ota_payouts_source_property ON public.ota_payouts (ota_source, ota_property_id);