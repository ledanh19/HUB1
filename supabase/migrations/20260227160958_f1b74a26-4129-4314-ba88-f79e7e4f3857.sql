-- 1) Trim existing data (idempotent)
UPDATE ota_payouts
SET provider_payout_id = btrim(provider_payout_id)
WHERE provider_payout_id IS NOT NULL
  AND provider_payout_id <> btrim(provider_payout_id);

-- 2) Guardrail: reject future inserts/updates with leading/trailing spaces
ALTER TABLE ota_payouts
ADD CONSTRAINT ota_payouts_provider_payout_id_trim_chk
CHECK (provider_payout_id IS NULL OR provider_payout_id = btrim(provider_payout_id));

-- 3) Index for search by provider_payout_id
CREATE INDEX IF NOT EXISTS idx_ota_payouts_provider_payout_id
ON ota_payouts (provider_payout_id);