-- Update service_provider_type constraint to only allow HOST and PARTNER
ALTER TABLE public.service_orders 
DROP CONSTRAINT IF EXISTS service_orders_service_provider_type_check;

ALTER TABLE public.service_orders 
ADD CONSTRAINT service_orders_service_provider_type_check 
CHECK (service_provider_type IN ('HOST', 'PARTNER'));

-- Update any existing ROOMRISE records to PARTNER
UPDATE public.service_orders 
SET service_provider_type = 'PARTNER' 
WHERE service_provider_type = 'ROOMRISE';

-- Add comment explaining the business rule
COMMENT ON COLUMN public.service_orders.service_provider_type IS 'Roomrise does NOT provide services. Only HOST or PARTNER can be service providers.';