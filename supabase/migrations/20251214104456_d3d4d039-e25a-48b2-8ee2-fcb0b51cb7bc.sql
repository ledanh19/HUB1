-- Create host_surcharges table for Host-related surcharges
CREATE TABLE public.host_surcharges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unified_booking_id text NOT NULL,
  host_partner_id uuid NOT NULL REFERENCES public.partners(id),
  surcharge_type text NOT NULL CHECK (surcharge_type IN ('CLEANING', 'EARLY_CHECKIN', 'LATE_CHECKOUT', 'UTILITY', 'OTHER')),
  description text,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'VND',
  collector_type text NOT NULL DEFAULT 'ROOMRISE' CHECK (collector_type IN ('ROOMRISE', 'HOST')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COLLECTED', 'PAID')),
  collected_at timestamp with time zone,
  collected_by uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.host_surcharges ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Host surcharges viewable by authenticated" 
ON public.host_surcharges FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Host surcharges insertable by authenticated" 
ON public.host_surcharges FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Host surcharges updatable by authenticated" 
ON public.host_surcharges FOR UPDATE
TO authenticated
USING (true);

-- Add collector_type to service_orders if not exists
ALTER TABLE public.service_orders 
ADD COLUMN IF NOT EXISTS collector_type text NOT NULL DEFAULT 'ROOMRISE' CHECK (collector_type IN ('ROOMRISE', 'SERVICE_PARTNER'));

ALTER TABLE public.service_orders 
ADD COLUMN IF NOT EXISTS collected_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS collected_by uuid;

-- Create trigger for updated_at
CREATE TRIGGER update_host_surcharges_updated_at
BEFORE UPDATE ON public.host_surcharges
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();