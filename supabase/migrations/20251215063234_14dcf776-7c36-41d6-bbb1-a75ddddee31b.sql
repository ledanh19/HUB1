-- Create host_settlements table for tracking settlement statements
CREATE TABLE IF NOT EXISTS public.host_settlements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_code TEXT NOT NULL UNIQUE,
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PARTIALLY_PAID', 'SETTLED')),
  total_booking_revenue NUMERIC NOT NULL DEFAULT 0,
  total_payable_amount NUMERIC NOT NULL DEFAULT 0,
  total_host_collected NUMERIC NOT NULL DEFAULT 0,
  total_deposits_applied NUMERIC NOT NULL DEFAULT 0,
  total_prepaids_applied NUMERIC NOT NULL DEFAULT 0,
  total_paid_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  finalized_at TIMESTAMP WITH TIME ZONE,
  finalized_by UUID,
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  scenario_id UUID REFERENCES public.test_scenarios(id)
);

-- Create settlement_bookings junction table
CREATE TABLE IF NOT EXISTS public.settlement_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_id UUID NOT NULL REFERENCES public.host_settlements(id) ON DELETE CASCADE,
  unified_booking_id TEXT NOT NULL,
  payable_id UUID REFERENCES public.host_payables(id),
  payable_amount NUMERIC NOT NULL DEFAULT 0,
  host_collected_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create host_payment_batches table for batch payments
CREATE TABLE IF NOT EXISTS public.host_payment_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_code TEXT NOT NULL UNIQUE,
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  transfer_reference TEXT,
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  paid_by UUID,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  scenario_id UUID REFERENCES public.test_scenarios(id)
);

-- Create junction table for batch payment items
CREATE TABLE IF NOT EXISTS public.host_payment_batch_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.host_payment_batches(id) ON DELETE CASCADE,
  payable_id UUID NOT NULL REFERENCES public.host_payables(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.host_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_payment_batch_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for host_settlements
CREATE POLICY "Host settlements viewable by authenticated"
  ON public.host_settlements FOR SELECT
  USING (true);

CREATE POLICY "Host settlements insertable by ke_toan or admin"
  ON public.host_settlements FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Host settlements updatable by ke_toan or admin"
  ON public.host_settlements FOR UPDATE
  USING (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for settlement_bookings
CREATE POLICY "Settlement bookings viewable by authenticated"
  ON public.settlement_bookings FOR SELECT
  USING (true);

CREATE POLICY "Settlement bookings insertable by ke_toan or admin"
  ON public.settlement_bookings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for host_payment_batches
CREATE POLICY "Payment batches viewable by authenticated"
  ON public.host_payment_batches FOR SELECT
  USING (true);

CREATE POLICY "Payment batches insertable by ke_toan or admin"
  ON public.host_payment_batches FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for host_payment_batch_items
CREATE POLICY "Batch items viewable by authenticated"
  ON public.host_payment_batch_items FOR SELECT
  USING (true);

CREATE POLICY "Batch items insertable by ke_toan or admin"
  ON public.host_payment_batch_items FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create sequence function for settlement codes
CREATE OR REPLACE FUNCTION public.generate_settlement_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  year_month TEXT;
  seq_num INTEGER;
  new_code TEXT;
BEGIN
  year_month := TO_CHAR(NOW(), 'YYMM');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(settlement_code FROM 5) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.host_settlements
  WHERE settlement_code LIKE 'ST' || year_month || '%';
  
  new_code := 'ST' || year_month || LPAD(seq_num::TEXT, 4, '0');
  RETURN new_code;
END;
$$;

-- Create sequence function for batch codes
CREATE OR REPLACE FUNCTION public.generate_batch_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  year_month TEXT;
  seq_num INTEGER;
  new_code TEXT;
BEGIN
  year_month := TO_CHAR(NOW(), 'YYMM');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(batch_code FROM 5) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.host_payment_batches
  WHERE batch_code LIKE 'BP' || year_month || '%';
  
  new_code := 'BP' || year_month || LPAD(seq_num::TEXT, 4, '0');
  RETURN new_code;
END;
$$;