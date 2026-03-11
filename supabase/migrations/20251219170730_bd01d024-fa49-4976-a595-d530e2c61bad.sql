
-- Create mapping status enum
CREATE TYPE public.mapping_status AS ENUM ('MAPPED', 'NOT_MAPPED', 'CONFLICT', 'INVALID');

-- Property Mappings table
CREATE TABLE public.property_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  internal_property_id UUID REFERENCES public.host_properties(id) ON DELETE SET NULL,
  channex_property_id TEXT NOT NULL UNIQUE,
  property_name TEXT,
  channex_user_id TEXT,
  status mapping_status NOT NULL DEFAULT 'NOT_MAPPED',
  validation_error TEXT,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Room Type Mappings table  
CREATE TABLE public.room_type_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_mapping_id UUID REFERENCES public.property_mappings(id) ON DELETE CASCADE NOT NULL,
  internal_room_type_id UUID REFERENCES public.host_room_types(id) ON DELETE SET NULL,
  channex_room_type_id TEXT NOT NULL,
  room_type_name TEXT,
  occupancy INTEGER,
  status mapping_status NOT NULL DEFAULT 'NOT_MAPPED',
  validation_error TEXT,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_mapping_id, channex_room_type_id)
);

-- Rate Plan Mappings table
CREATE TABLE public.rate_plan_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_mapping_id UUID REFERENCES public.room_type_mappings(id) ON DELETE CASCADE NOT NULL,
  internal_rate_plan_id UUID,
  channex_rate_plan_id TEXT NOT NULL,
  rate_plan_name TEXT,
  channel_code TEXT,
  currency TEXT DEFAULT 'VND',
  sell_mode TEXT,
  status mapping_status NOT NULL DEFAULT 'NOT_MAPPED',
  validation_error TEXT,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_type_mapping_id, channex_rate_plan_id)
);

-- Sync Jobs table for tracking sync operations
CREATE TABLE public.sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL, -- 'INVENTORY_PUSH', 'INVENTORY_PULL', 'BOOKING_SYNC'
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, RUNNING, PARTIAL_FAIL, FAILED, SUCCESS
  channel_code TEXT,
  property_mapping_id UUID REFERENCES public.property_mappings(id) ON DELETE SET NULL,
  scope_type TEXT, -- 'property', 'room_type', 'rate_plan'
  scope_ids TEXT[],
  date_from DATE,
  date_to DATE,
  total_cells INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  error_summary JSONB,
  triggered_by UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sync Job Failed Cells
CREATE TABLE public.sync_job_failed_cells (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_job_id UUID REFERENCES public.sync_jobs(id) ON DELETE CASCADE NOT NULL,
  cell_key TEXT NOT NULL, -- room/rate/channel/date
  room_type_mapping_id UUID,
  rate_plan_mapping_id UUID,
  cell_date DATE,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory Snapshots for reconciliation
CREATE TABLE public.inventory_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_job_id UUID REFERENCES public.sync_jobs(id) ON DELETE SET NULL,
  property_mapping_id UUID REFERENCES public.property_mappings(id) ON DELETE CASCADE NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_type TEXT NOT NULL DEFAULT 'BEFORE', -- BEFORE, AFTER
  snapshot_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.property_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_type_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_plan_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_job_failed_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow authenticated users to manage mappings
CREATE POLICY "Allow authenticated users to view property_mappings"
ON public.property_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage property_mappings"
ON public.property_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view room_type_mappings"
ON public.room_type_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage room_type_mappings"
ON public.room_type_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view rate_plan_mappings"
ON public.rate_plan_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage rate_plan_mappings"
ON public.rate_plan_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view sync_jobs"
ON public.sync_jobs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage sync_jobs"
ON public.sync_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view sync_job_failed_cells"
ON public.sync_job_failed_cells FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage sync_job_failed_cells"
ON public.sync_job_failed_cells FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view inventory_snapshots"
ON public.inventory_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to manage inventory_snapshots"
ON public.inventory_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add triggers for updated_at
CREATE TRIGGER update_property_mappings_updated_at
BEFORE UPDATE ON public.property_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_room_type_mappings_updated_at
BEFORE UPDATE ON public.room_type_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rate_plan_mappings_updated_at
BEFORE UPDATE ON public.rate_plan_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_property_mappings_channex_id ON public.property_mappings(channex_property_id);
CREATE INDEX idx_property_mappings_status ON public.property_mappings(status);
CREATE INDEX idx_room_type_mappings_property ON public.room_type_mappings(property_mapping_id);
CREATE INDEX idx_room_type_mappings_status ON public.room_type_mappings(status);
CREATE INDEX idx_rate_plan_mappings_room_type ON public.rate_plan_mappings(room_type_mapping_id);
CREATE INDEX idx_rate_plan_mappings_channel ON public.rate_plan_mappings(channel_code);
CREATE INDEX idx_sync_jobs_status ON public.sync_jobs(status);
CREATE INDEX idx_sync_jobs_created ON public.sync_jobs(created_at DESC);
