-- Create host_supply_segments table for split supply
CREATE TABLE public.host_supply_segments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unified_booking_id TEXT NOT NULL,
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  host_room_id UUID REFERENCES public.host_rooms(id),
  host_property_name TEXT,
  host_room_type TEXT,
  room_code TEXT,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  nights INTEGER NOT NULL,
  nightly_rate NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT date_range_valid CHECK (date_to > date_from),
  CONSTRAINT nights_positive CHECK (nights > 0),
  CONSTRAINT nightly_rate_positive CHECK (nightly_rate > 0)
);

-- Create host_extra_charges table
CREATE TABLE public.host_extra_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unified_booking_id TEXT NOT NULL,
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  segment_id UUID REFERENCES public.host_supply_segments(id),
  charge_type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT amount_positive CHECK (amount > 0)
);

-- Enable RLS
ALTER TABLE public.host_supply_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_extra_charges ENABLE ROW LEVEL SECURITY;

-- RLS policies for host_supply_segments
CREATE POLICY "Host supply segments viewable by authenticated" 
ON public.host_supply_segments 
FOR SELECT 
USING (true);

CREATE POLICY "Host supply segments insertable by authenticated" 
ON public.host_supply_segments 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Host supply segments updatable by authenticated" 
ON public.host_supply_segments 
FOR UPDATE 
USING (true);

CREATE POLICY "Host supply segments deletable by authenticated" 
ON public.host_supply_segments 
FOR DELETE 
USING (true);

-- RLS policies for host_extra_charges
CREATE POLICY "Host extra charges viewable by authenticated" 
ON public.host_extra_charges 
FOR SELECT 
USING (true);

CREATE POLICY "Host extra charges insertable by authenticated" 
ON public.host_extra_charges 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Host extra charges deletable by admin" 
ON public.host_extra_charges 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_host_supply_segments_booking ON public.host_supply_segments(unified_booking_id);
CREATE INDEX idx_host_supply_segments_partner ON public.host_supply_segments(partner_id);
CREATE INDEX idx_host_extra_charges_booking ON public.host_extra_charges(unified_booking_id);
CREATE INDEX idx_host_extra_charges_segment ON public.host_extra_charges(segment_id);

-- Add trigger for updated_at
CREATE TRIGGER update_host_supply_segments_updated_at
BEFORE UPDATE ON public.host_supply_segments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();