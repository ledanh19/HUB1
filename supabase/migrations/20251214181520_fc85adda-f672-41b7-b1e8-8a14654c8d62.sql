
-- Create test_scenarios table
CREATE TABLE public.test_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  purpose TEXT,
  seed_key TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create booking_scenario_map for OTA bookings (read-only mapping)
CREATE TABLE public.booking_scenario_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_booking_id TEXT NOT NULL,
  scenario_id UUID NOT NULL REFERENCES public.test_scenarios(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(unified_booking_id, scenario_id)
);

-- Add scenario_id and is_sample_data to manual_bookings
ALTER TABLE public.manual_bookings 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_supply_segments
ALTER TABLE public.host_supply_segments 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to stays
ALTER TABLE public.stays 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to hotel_collects
ALTER TABLE public.hotel_collects 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_deposits
ALTER TABLE public.host_deposits 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_prepaids
ALTER TABLE public.host_prepaids 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_payables
ALTER TABLE public.host_payables 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_payments
ALTER TABLE public.host_payments 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_extra_charges
ALTER TABLE public.host_extra_charges 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_surcharges
ALTER TABLE public.host_surcharges 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to service_orders
ALTER TABLE public.service_orders 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to service_payments
ALTER TABLE public.service_payments 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to service_partner_payables
ALTER TABLE public.service_partner_payables 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to ota_disputes
ALTER TABLE public.ota_disputes 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to no_show_records
ALTER TABLE public.no_show_records 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to customers (for fake customers)
ALTER TABLE public.customers 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to partners (for test partners)
ALTER TABLE public.partners 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_rooms
ALTER TABLE public.host_rooms 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to host_properties
ALTER TABLE public.host_properties 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to guest_documents
ALTER TABLE public.guest_documents 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to audit_logs
ALTER TABLE public.audit_logs 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Add scenario_id and is_sample_data to cashflow_entries
ALTER TABLE public.cashflow_entries 
ADD COLUMN scenario_id UUID REFERENCES public.test_scenarios(id) ON DELETE SET NULL,
ADD COLUMN is_sample_data BOOLEAN NOT NULL DEFAULT false;

-- Enable RLS on test_scenarios
ALTER TABLE public.test_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_scenario_map ENABLE ROW LEVEL SECURITY;

-- RLS policies for test_scenarios
CREATE POLICY "Test scenarios viewable by authenticated"
ON public.test_scenarios FOR SELECT
USING (true);

CREATE POLICY "Test scenarios insertable by super_admin"
ON public.test_scenarios FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Test scenarios updatable by super_admin"
ON public.test_scenarios FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Test scenarios deletable by super_admin"
ON public.test_scenarios FOR DELETE
USING (has_role(auth.uid(), 'super_admin'));

-- RLS policies for booking_scenario_map
CREATE POLICY "Booking scenario map viewable by authenticated"
ON public.booking_scenario_map FOR SELECT
USING (true);

CREATE POLICY "Booking scenario map insertable by super_admin"
ON public.booking_scenario_map FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Booking scenario map deletable by super_admin"
ON public.booking_scenario_map FOR DELETE
USING (has_role(auth.uid(), 'super_admin'));

-- Create indexes for performance
CREATE INDEX idx_manual_bookings_scenario ON public.manual_bookings(scenario_id) WHERE scenario_id IS NOT NULL;
CREATE INDEX idx_manual_bookings_sample ON public.manual_bookings(is_sample_data) WHERE is_sample_data = true;
CREATE INDEX idx_host_supply_segments_scenario ON public.host_supply_segments(scenario_id) WHERE scenario_id IS NOT NULL;
CREATE INDEX idx_stays_scenario ON public.stays(scenario_id) WHERE scenario_id IS NOT NULL;
CREATE INDEX idx_hotel_collects_scenario ON public.hotel_collects(scenario_id) WHERE scenario_id IS NOT NULL;
CREATE INDEX idx_host_payables_scenario ON public.host_payables(scenario_id) WHERE scenario_id IS NOT NULL;
CREATE INDEX idx_service_orders_scenario ON public.service_orders(scenario_id) WHERE scenario_id IS NOT NULL;
CREATE INDEX idx_test_scenarios_status ON public.test_scenarios(status);
