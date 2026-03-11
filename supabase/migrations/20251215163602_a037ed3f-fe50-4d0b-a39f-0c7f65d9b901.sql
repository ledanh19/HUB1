-- =====================================================
-- SETTLEMENT LOCK & ADJUSTMENT SYSTEM
-- Per user specification: Settlement = HARD LOCK
-- After settlement: Booking, Segments, Costs → READ ONLY
-- Only allow Adjustment Records for post-settlement changes
-- =====================================================

-- 1. Add settlement_locked_at to host_supply_segments
-- When not null, segment is locked and cannot be edited
ALTER TABLE public.host_supply_segments 
ADD COLUMN IF NOT EXISTS settlement_id uuid NULL REFERENCES public.host_settlements(id),
ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL;

-- 2. Add settlement_locked_at to host_extra_charges
ALTER TABLE public.host_extra_charges 
ADD COLUMN IF NOT EXISTS settlement_id uuid NULL REFERENCES public.host_settlements(id),
ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL;

-- 3. Add settlement_locked_at to host_surcharges
ALTER TABLE public.host_surcharges 
ADD COLUMN IF NOT EXISTS settlement_id uuid NULL REFERENCES public.host_settlements(id),
ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL;

-- 4. Create adjustment records table for post-settlement changes
CREATE TABLE IF NOT EXISTS public.host_settlement_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  settlement_id uuid NOT NULL REFERENCES public.host_settlements(id),
  unified_booking_id text NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  adjustment_type text NOT NULL, -- 'SEGMENT_CHANGE', 'EXTRA_CHARGE', 'SURCHARGE', 'CORRECTION', 'OTHER'
  delta_amount numeric NOT NULL, -- positive = Roomrise owes more, negative = Host owes back
  original_amount numeric NULL,
  new_amount numeric NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  approved_at timestamptz NULL,
  approved_by uuid NULL,
  status text NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
  is_sample_data boolean NOT NULL DEFAULT false,
  scenario_id uuid NULL REFERENCES public.test_scenarios(id)
);

-- Enable RLS
ALTER TABLE public.host_settlement_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Adjustments viewable by authenticated" 
ON public.host_settlement_adjustments 
FOR SELECT 
USING (true);

CREATE POLICY "Adjustments insertable by ke_toan or admin" 
ON public.host_settlement_adjustments 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'ke_toan'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Adjustments updatable by admin" 
ON public.host_settlement_adjustments 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_host_supply_segments_settlement_id ON public.host_supply_segments(settlement_id);
CREATE INDEX IF NOT EXISTS idx_host_extra_charges_settlement_id ON public.host_extra_charges(settlement_id);
CREATE INDEX IF NOT EXISTS idx_host_surcharges_settlement_id ON public.host_surcharges(settlement_id);
CREATE INDEX IF NOT EXISTS idx_host_settlement_adjustments_settlement_id ON public.host_settlement_adjustments(settlement_id);
CREATE INDEX IF NOT EXISTS idx_host_settlement_adjustments_partner_id ON public.host_settlement_adjustments(partner_id);