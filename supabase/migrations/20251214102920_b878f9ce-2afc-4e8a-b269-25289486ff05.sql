
-- Update partner_type enum to include new types
ALTER TYPE partner_type RENAME TO partner_type_old;

CREATE TYPE partner_type AS ENUM (
  'HOST_LANDLORD',
  'HOST_OPERATOR', 
  'SERVICE_PICKUP',
  'SERVICE_TOUR',
  'SERVICE_OTHER'
);

-- Update existing data to new types
ALTER TABLE partners 
  ALTER COLUMN partner_type TYPE text;

UPDATE partners SET partner_type = 'HOST_LANDLORD' WHERE partner_type = 'HOST';
UPDATE partners SET partner_type = 'SERVICE_PICKUP' WHERE partner_type = 'PICKUP';
UPDATE partners SET partner_type = 'SERVICE_TOUR' WHERE partner_type = 'TOUR';
UPDATE partners SET partner_type = 'SERVICE_OTHER' WHERE partner_type = 'OTHER';

ALTER TABLE partners 
  ALTER COLUMN partner_type TYPE partner_type USING partner_type::partner_type;

DROP TYPE partner_type_old;

-- Create host_properties table (properties belonging to HOST partners)
CREATE TABLE public.host_properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partners(id),
  host_property_name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.host_properties ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Host properties viewable by authenticated" 
ON public.host_properties FOR SELECT USING (true);

CREATE POLICY "Host properties insertable by authenticated" 
ON public.host_properties FOR INSERT WITH CHECK (true);

CREATE POLICY "Host properties updatable by authenticated" 
ON public.host_properties FOR UPDATE USING (true);

-- Create host_room_types table (room types belonging to properties)
CREATE TABLE public.host_room_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_property_id UUID NOT NULL REFERENCES host_properties(id),
  room_type_name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.host_room_types ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Host room types viewable by authenticated" 
ON public.host_room_types FOR SELECT USING (true);

CREATE POLICY "Host room types insertable by authenticated" 
ON public.host_room_types FOR INSERT WITH CHECK (true);

CREATE POLICY "Host room types updatable by authenticated" 
ON public.host_room_types FOR UPDATE USING (true);

-- Create indexes
CREATE INDEX idx_host_properties_partner_id ON host_properties(partner_id);
CREATE INDEX idx_host_room_types_property_id ON host_room_types(host_property_id);

-- Add triggers for updated_at
CREATE TRIGGER update_host_properties_updated_at
BEFORE UPDATE ON public.host_properties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_host_room_types_updated_at
BEFORE UPDATE ON public.host_room_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
