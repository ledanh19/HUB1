
-- Create host_prepaids table for prepaid tracking
CREATE TABLE public.host_prepaids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  unified_booking_id text NOT NULL,
  prepaid_amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'VND',
  prepaid_status text NOT NULL DEFAULT 'OPEN' CHECK (prepaid_status IN ('OPEN', 'APPLIED')),
  paid_at timestamp with time zone DEFAULT now(),
  applied_at timestamp with time zone,
  applied_by uuid,
  applied_to_payable_id uuid REFERENCES public.host_payables(id),
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Add applied tracking columns to host_deposits
ALTER TABLE public.host_deposits 
ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS applied_by uuid,
ADD COLUMN IF NOT EXISTS applied_to_payable_id uuid REFERENCES public.host_payables(id),
ADD COLUMN IF NOT EXISTS refunded_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS refunded_by uuid;

-- Add applied_amount tracking to host_payables
ALTER TABLE public.host_payables
ADD COLUMN IF NOT EXISTS applied_deposit_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS applied_prepaid_amount numeric DEFAULT 0;

-- Enable RLS
ALTER TABLE public.host_prepaids ENABLE ROW LEVEL SECURITY;

-- RLS policies for host_prepaids
CREATE POLICY "Host prepaids viewable by authenticated"
ON public.host_prepaids FOR SELECT
USING (true);

CREATE POLICY "Host prepaids insertable by ke_toan or admin"
ON public.host_prepaids FOR INSERT
WITH CHECK (has_role(auth.uid(), 'ke_toan') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Host prepaids updatable by ke_toan or admin"
ON public.host_prepaids FOR UPDATE
USING (has_role(auth.uid(), 'ke_toan') OR has_role(auth.uid(), 'admin'));

-- Trigger for updated_at on host_prepaids
CREATE TRIGGER update_host_prepaids_updated_at
BEFORE UPDATE ON public.host_prepaids
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
