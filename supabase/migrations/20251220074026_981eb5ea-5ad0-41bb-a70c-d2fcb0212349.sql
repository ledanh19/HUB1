-- Add source_id column to payment_requests to link to host_deposits/host_prepaids
ALTER TABLE public.payment_requests
ADD COLUMN IF NOT EXISTS source_id uuid NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_requests_source_id ON public.payment_requests(source_id);

-- Comment for documentation
COMMENT ON COLUMN public.payment_requests.source_id IS 'Links to host_deposits.id or host_prepaids.id based on payment_type';