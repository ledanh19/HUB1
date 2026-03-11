-- Create service_settlements table for storing settlement snapshots
CREATE TABLE public.service_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_code text NOT NULL UNIQUE,
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  period_from date NOT NULL,
  period_to date NOT NULL,
  
  -- Snapshot financial data
  total_sale_price numeric NOT NULL DEFAULT 0,
  total_cost_price numeric NOT NULL DEFAULT 0,
  partner_collected_amount numeric NOT NULL DEFAULT 0,
  roomrise_collected_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  
  -- Direction: ROOMRISE_OWES (positive NET, Roomrise pays partner) or PARTNER_OWES (negative NET, partner pays Roomrise)
  net_direction text NOT NULL DEFAULT 'ROOMRISE_OWES',
  
  -- Accounting status
  payment_status text NOT NULL DEFAULT 'UNPAID',
  paid_at timestamp with time zone,
  paid_by uuid,
  
  -- Metadata
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  finalized_at timestamp with time zone DEFAULT now(),
  finalized_by uuid,
  
  -- Sample data flags
  is_sample_data boolean NOT NULL DEFAULT false,
  scenario_id uuid REFERENCES public.test_scenarios(id)
);

-- Create service_settlement_items table to store the orders included in each settlement
CREATE TABLE public.service_settlement_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_id uuid NOT NULL REFERENCES public.service_settlements(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL,
  unified_booking_id text,
  
  -- Snapshot of order data at settlement time
  service_name text,
  service_type text,
  guest_name text,
  service_date date,
  sale_price numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  collector_type text,
  amount_collected numeric NOT NULL DEFAULT 0,
  amount_remaining numeric NOT NULL DEFAULT 0,
  net_line numeric NOT NULL DEFAULT 0,
  
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_settlement_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_settlements
CREATE POLICY "Service settlements viewable by authenticated"
ON public.service_settlements FOR SELECT
USING (true);

CREATE POLICY "Service settlements insertable by ke_toan or admin"
ON public.service_settlements FOR INSERT
WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service settlements updatable by ke_toan or admin"
ON public.service_settlements FOR UPDATE
USING (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for service_settlement_items
CREATE POLICY "Service settlement items viewable by authenticated"
ON public.service_settlement_items FOR SELECT
USING (true);

CREATE POLICY "Service settlement items insertable by ke_toan or admin"
ON public.service_settlement_items FOR INSERT
WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create index for performance
CREATE INDEX idx_service_settlements_partner ON public.service_settlements(partner_id);
CREATE INDEX idx_service_settlements_period ON public.service_settlements(period_from, period_to);
CREATE INDEX idx_service_settlement_items_settlement ON public.service_settlement_items(settlement_id);