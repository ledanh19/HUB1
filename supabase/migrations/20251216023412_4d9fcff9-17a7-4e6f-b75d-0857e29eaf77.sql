-- Create internal_expenses table for non-settlement expenses
CREATE TABLE public.internal_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_category text NOT NULL CHECK (expense_category IN ('SALARY', 'OFFICE', 'MARKETING', 'TECHNOLOGY', 'OTHER')),
  recipient_name text,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'VND',
  payment_method text NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (payment_method IN ('BANK_TRANSFER', 'CASH', 'UPC')),
  payment_gateway text CHECK (payment_gateway IN ('ONEPAY', '9PAY', 'VPBANK', 'OTHER')),
  bank_name text,
  bank_account_number text,
  bank_account_name text,
  transfer_reference text,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  paid_by uuid,
  note text,
  attachment_url text,
  is_sample_data boolean NOT NULL DEFAULT false,
  scenario_id uuid REFERENCES public.test_scenarios(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.internal_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Internal expenses viewable by ke_toan or admin" 
ON public.internal_expenses 
FOR SELECT 
USING (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Internal expenses insertable by ke_toan or admin" 
ON public.internal_expenses 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add settlement_id to service_payments if not exists (for linking payments to settlements)
ALTER TABLE public.service_payments ADD COLUMN IF NOT EXISTS service_settlement_id uuid REFERENCES public.service_settlements(id);

-- Add payment tracking fields to service_settlements
ALTER TABLE public.service_settlements ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT 0;
ALTER TABLE public.service_settlements ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PARTIAL', 'PAID'));