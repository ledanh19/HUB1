-- Create rate_plans_mirror table similar to room_types_mirror
CREATE TABLE IF NOT EXISTS public.rate_plans_mirror (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'channex',
  provider_property_id TEXT NOT NULL,
  provider_room_type_id TEXT NOT NULL,
  provider_rate_plan_id TEXT NOT NULL,
  rate_plan_name TEXT NOT NULL,
  rate_plan_code TEXT,
  base_rate NUMERIC,
  currency TEXT DEFAULT 'VND',
  sell_mode TEXT,
  channels TEXT[] DEFAULT '{}',
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_property_id, provider_rate_plan_id)
);

-- Enable RLS
ALTER TABLE public.rate_plans_mirror ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Rate plans mirror viewable by authenticated"
  ON public.rate_plans_mirror
  FOR SELECT
  USING (true);

CREATE POLICY "Rate plans mirror insertable by admin"
  ON public.rate_plans_mirror
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Rate plans mirror updatable by admin"
  ON public.rate_plans_mirror
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Rate plans mirror deletable by admin"
  ON public.rate_plans_mirror
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_rate_plans_mirror_property ON public.rate_plans_mirror(provider_property_id);
CREATE INDEX idx_rate_plans_mirror_room_type ON public.rate_plans_mirror(provider_room_type_id);