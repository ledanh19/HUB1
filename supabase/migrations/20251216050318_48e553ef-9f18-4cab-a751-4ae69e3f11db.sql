
-- Create payment_requests table for payment proposals
CREATE TABLE public.payment_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_code TEXT NOT NULL UNIQUE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('HOST_PAYMENT', 'SERVICE_PARTNER_PAYMENT', 'INTERNAL_EXPENSE', 'OTA_COMMISSION')),
  
  -- Source reference (settlement or expense category)
  settlement_id UUID,
  settlement_type TEXT CHECK (settlement_type IN ('HOST', 'SERVICE')),
  expense_category TEXT,
  
  -- Partner info (for HOST/SERVICE payments)
  partner_id UUID,
  
  -- Amount comparison
  source_amount NUMERIC NOT NULL DEFAULT 0,
  proposed_amount NUMERIC NOT NULL DEFAULT 0,
  difference_amount NUMERIC GENERATED ALWAYS AS (proposed_amount - source_amount) STORED,
  difference_reason TEXT,
  
  -- Period tracking
  expense_period TEXT,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  
  -- Recipient info (for internal expense)
  recipient_name TEXT,
  recipient_unit TEXT,
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID')),
  
  -- Audit fields
  requested_by UUID,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID,
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- Flags
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  scenario_id UUID,
  
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT fk_partner FOREIGN KEY (partner_id) REFERENCES partners(id),
  CONSTRAINT fk_host_settlement FOREIGN KEY (settlement_id) REFERENCES host_settlements(id),
  CONSTRAINT fk_scenario FOREIGN KEY (scenario_id) REFERENCES test_scenarios(id)
);

-- Create payment_request_attachments table for file attachments
CREATE TABLE public.payment_request_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT DEFAULT 'OTHER',
  uploaded_by UUID,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create cash_outs table for actual cash-out records
CREATE TABLE public.cash_outs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Must link to approved payment request
  payment_request_id UUID NOT NULL REFERENCES payment_requests(id),
  
  -- Transaction details
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Payment method
  payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER' CHECK (payment_method IN ('BANK_TRANSFER', 'CASH', 'UPC', 'ONEPAY', '9PAY', 'VPBANK')),
  payment_gateway TEXT,
  
  -- Bank details
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  transfer_reference TEXT,
  
  -- Recipient
  recipient_name TEXT,
  
  -- Flags
  is_out_of_process BOOLEAN NOT NULL DEFAULT false,
  out_of_process_reason TEXT,
  
  -- Audit
  paid_by UUID,
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  scenario_id UUID,
  
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT fk_scenario FOREIGN KEY (scenario_id) REFERENCES test_scenarios(id)
);

-- Enable RLS
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_request_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_outs ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_requests
CREATE POLICY "Payment requests viewable by authenticated" 
ON public.payment_requests FOR SELECT 
USING (true);

CREATE POLICY "Payment requests insertable by authenticated" 
ON public.payment_requests FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Payment requests updatable by admin/ketoan" 
ON public.payment_requests FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ke_toan'::app_role));

-- RLS policies for payment_request_attachments
CREATE POLICY "Payment request attachments viewable by authenticated" 
ON public.payment_request_attachments FOR SELECT 
USING (true);

CREATE POLICY "Payment request attachments insertable by authenticated" 
ON public.payment_request_attachments FOR INSERT 
WITH CHECK (true);

-- RLS policies for cash_outs
CREATE POLICY "Cash outs viewable by authenticated" 
ON public.cash_outs FOR SELECT 
USING (true);

CREATE POLICY "Cash outs insertable by admin/ketoan" 
ON public.cash_outs FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'ke_toan'::app_role));

-- Indexes for performance
CREATE INDEX idx_payment_requests_status ON public.payment_requests(status);
CREATE INDEX idx_payment_requests_payment_type ON public.payment_requests(payment_type);
CREATE INDEX idx_payment_requests_partner_id ON public.payment_requests(partner_id);
CREATE INDEX idx_payment_requests_settlement_id ON public.payment_requests(settlement_id);
CREATE INDEX idx_cash_outs_payment_request_id ON public.cash_outs(payment_request_id);
CREATE INDEX idx_cash_outs_paid_at ON public.cash_outs(paid_at);

-- Trigger to update updated_at
CREATE TRIGGER update_payment_requests_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
