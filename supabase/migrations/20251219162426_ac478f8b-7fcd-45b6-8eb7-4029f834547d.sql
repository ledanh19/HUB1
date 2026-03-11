-- Inventory Cells table - stores rate/availability per room type × rate plan × channel × date
CREATE TABLE public.inventory_cells (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL,
  room_type_id UUID NOT NULL,
  rate_plan_id UUID,
  channel_id TEXT, -- NULL = base/master
  cell_date DATE NOT NULL,
  availability INTEGER DEFAULT 0,
  rate NUMERIC(12,2),
  stop_sell BOOLEAN DEFAULT FALSE,
  closed_to_arrival BOOLEAN DEFAULT FALSE,
  closed_to_departure BOOLEAN DEFAULT FALSE,
  min_stay_arrival INTEGER,
  min_stay_through INTEGER,
  max_stay INTEGER,
  max_availability INTEGER,
  availability_offset INTEGER,
  source TEXT DEFAULT 'manual', -- manual | sync | rule | override
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(property_id, room_type_id, rate_plan_id, channel_id, cell_date)
);

-- Rate Plans table
CREATE TABLE public.rate_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL,
  room_type_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  is_base BOOLEAN DEFAULT FALSE,
  base_rate NUMERIC(12,2),
  channels TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Channels table
CREATE TABLE public.channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  color TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default channels
INSERT INTO public.channels (id, name, color) VALUES
  ('agoda', 'Agoda', '#E91E63'),
  ('booking', 'Booking.com', '#003580'),
  ('ctrip', 'Ctrip', '#0066CC'),
  ('expedia', 'Expedia', '#FFCC00'),
  ('traveloka', 'Traveloka', '#0064D2'),
  ('direct', 'Direct', '#10B981');

-- Availability Rules table
CREATE TABLE public.availability_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL,
  title TEXT NOT NULL,
  rule_type TEXT NOT NULL, -- min_stay | stop_sell | rate_modifier | etc.
  start_date DATE,
  end_date DATE,
  days_of_week INTEGER[] DEFAULT '{0,1,2,3,4,5,6}', -- 0=Sun, 6=Sat
  channels TEXT[] DEFAULT '{}',
  room_type_ids UUID[] DEFAULT '{}',
  rate_plan_ids UUID[] DEFAULT '{}',
  rule_value JSONB, -- flexible config per rule type
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inventory Logs table (audit)
CREATE TABLE public.inventory_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cell_id UUID,
  property_id UUID NOT NULL,
  action TEXT NOT NULL, -- update | bulk_update | rule_apply | sync
  before_data JSONB,
  after_data JSONB,
  changed_by UUID,
  batch_id UUID, -- groups bulk updates
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inventory Room Order (for grid display)
CREATE TABLE public.inventory_room_order (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL,
  room_type_id UUID NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(property_id, room_type_id)
);

-- Enable RLS
ALTER TABLE public.inventory_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_room_order ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for authenticated users for now)
CREATE POLICY "Authenticated users can view inventory_cells" ON public.inventory_cells FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify inventory_cells" ON public.inventory_cells FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view rate_plans" ON public.rate_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify rate_plans" ON public.rate_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view channels" ON public.channels FOR SELECT USING (true);

CREATE POLICY "Authenticated users can view availability_rules" ON public.availability_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify availability_rules" ON public.availability_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view inventory_logs" ON public.inventory_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert inventory_logs" ON public.inventory_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view inventory_room_order" ON public.inventory_room_order FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify inventory_room_order" ON public.inventory_room_order FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime for inventory_cells
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_cells;

-- Create indexes for performance
CREATE INDEX idx_inventory_cells_lookup ON public.inventory_cells(property_id, cell_date);
CREATE INDEX idx_inventory_cells_room ON public.inventory_cells(room_type_id, cell_date);
CREATE INDEX idx_rate_plans_property ON public.rate_plans(property_id);
CREATE INDEX idx_availability_rules_property ON public.availability_rules(property_id);
CREATE INDEX idx_inventory_logs_cell ON public.inventory_logs(cell_id);

-- Function to update version on inventory_cells update
CREATE OR REPLACE FUNCTION public.increment_inventory_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventory_version
BEFORE UPDATE ON public.inventory_cells
FOR EACH ROW
EXECUTE FUNCTION public.increment_inventory_version();