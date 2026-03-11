
-- Create host_payments table for tracking actual payments to hosts
CREATE TABLE public.host_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id uuid NOT NULL REFERENCES public.host_payables(id),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  unified_booking_id text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'VND',
  payment_method text NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (payment_method IN ('BANK_TRANSFER', 'CASH', 'OTHER')),
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  transfer_reference text,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  paid_by uuid,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.host_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Host payments viewable by authenticated"
ON public.host_payments FOR SELECT
USING (true);

CREATE POLICY "Host payments insertable by ke_toan or admin"
ON public.host_payments FOR INSERT
WITH CHECK (has_role(auth.uid(), 'ke_toan') OR has_role(auth.uid(), 'admin'));

-- Add paid_amount tracking to host_payables
ALTER TABLE public.host_payables
ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
