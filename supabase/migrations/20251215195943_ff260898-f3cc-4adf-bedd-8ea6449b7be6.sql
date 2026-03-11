-- Add service_provider_type column to service_orders
-- This distinguishes "who provides the service" from "who collects payment"
ALTER TABLE public.service_orders 
ADD COLUMN IF NOT EXISTS service_provider_type text NOT NULL DEFAULT 'ROOMRISE';

-- Add check constraint for valid provider types
ALTER TABLE public.service_orders
ADD CONSTRAINT service_provider_type_check 
CHECK (service_provider_type IN ('ROOMRISE', 'HOST', 'PARTNER'));

-- Update existing records: if partner_id is set, assume PARTNER; otherwise ROOMRISE
UPDATE public.service_orders 
SET service_provider_type = CASE 
  WHEN partner_id IS NOT NULL THEN 'PARTNER'
  ELSE 'ROOMRISE'
END;

-- Add comment for clarity
COMMENT ON COLUMN public.service_orders.service_provider_type IS 'Who provides the service: ROOMRISE (internal), HOST (property partner), PARTNER (external vendor)';