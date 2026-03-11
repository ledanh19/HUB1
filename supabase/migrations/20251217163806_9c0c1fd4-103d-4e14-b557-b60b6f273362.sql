-- ============================================
-- SYNC STATE TABLE - Track last sync timestamps
-- ============================================
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Sync state viewable by authenticated"
  ON sync_state FOR SELECT
  USING (true);

CREATE POLICY "Sync state updatable by admin"
  ON sync_state FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sync state insertable by admin"
  ON sync_state FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- SYNC RUNS TABLE - Log each sync execution
-- ============================================
CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'channex',
  run_type TEXT NOT NULL DEFAULT 'MANUAL', -- CRON|MANUAL|BACKFILL
  entity TEXT NOT NULL, -- BOOKINGS|PROPERTIES|ROOMTYPES
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING', -- RUNNING|SUCCESS|FAILED
  since TIMESTAMPTZ NULL,
  until TIMESTAMPTZ NULL,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS sync_runs_provider_entity_idx ON sync_runs(provider, entity);
CREATE INDEX IF NOT EXISTS sync_runs_status_idx ON sync_runs(status);
CREATE INDEX IF NOT EXISTS sync_runs_started_at_idx ON sync_runs(started_at DESC);

-- Enable RLS
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Sync runs viewable by authenticated"
  ON sync_runs FOR SELECT
  USING (true);

CREATE POLICY "Sync runs insertable by admin"
  ON sync_runs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Sync runs updatable by admin"
  ON sync_runs FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================
-- CHANNEX MAPPINGS TABLE - Link Channex entities to internal
-- ============================================
CREATE TABLE IF NOT EXISTS channex_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channex_property_id TEXT NOT NULL,
  internal_property_id UUID NULL,
  channex_room_type_id TEXT NULL,
  internal_room_type_id UUID NULL,
  property_name TEXT NULL,
  room_type_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- MAPPED|PENDING
  raw_data JSONB NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on property + room type combination
CREATE UNIQUE INDEX IF NOT EXISTS channex_mappings_prop_room_uq 
  ON channex_mappings(channex_property_id, COALESCE(channex_room_type_id, ''));

-- Indexes
CREATE INDEX IF NOT EXISTS channex_mappings_prop_idx ON channex_mappings(channex_property_id);
CREATE INDEX IF NOT EXISTS channex_mappings_roomtype_idx ON channex_mappings(channex_room_type_id);
CREATE INDEX IF NOT EXISTS channex_mappings_status_idx ON channex_mappings(status);

-- Enable RLS
ALTER TABLE channex_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Channex mappings viewable by authenticated"
  ON channex_mappings FOR SELECT
  USING (true);

CREATE POLICY "Channex mappings insertable by authenticated"
  ON channex_mappings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Channex mappings updatable by authenticated"
  ON channex_mappings FOR UPDATE
  USING (true);

-- ============================================
-- PROPERTIES MIRROR TABLE - Store Channex properties
-- ============================================
CREATE TABLE IF NOT EXISTS properties_mirror (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'channex',
  provider_property_id TEXT NOT NULL,
  property_name TEXT NOT NULL,
  address TEXT NULL,
  city TEXT NULL,
  country TEXT NULL,
  timezone TEXT NULL,
  currency TEXT NULL,
  raw_data JSONB NULL,
  source_updated_at TIMESTAMPTZ NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS properties_mirror_provider_uq 
  ON properties_mirror(provider, provider_property_id);

-- Enable RLS
ALTER TABLE properties_mirror ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Properties mirror viewable by authenticated"
  ON properties_mirror FOR SELECT
  USING (true);

CREATE POLICY "Properties mirror insertable by admin"
  ON properties_mirror FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Properties mirror updatable by admin"
  ON properties_mirror FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================
-- ROOM TYPES MIRROR TABLE - Store Channex room types
-- ============================================
CREATE TABLE IF NOT EXISTS room_types_mirror (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'channex',
  provider_room_type_id TEXT NOT NULL,
  provider_property_id TEXT NOT NULL,
  room_type_name TEXT NOT NULL,
  occupancy INTEGER NULL,
  raw_data JSONB NULL,
  source_updated_at TIMESTAMPTZ NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS room_types_mirror_provider_uq 
  ON room_types_mirror(provider, provider_room_type_id);

-- Index for property lookup
CREATE INDEX IF NOT EXISTS room_types_mirror_property_idx 
  ON room_types_mirror(provider_property_id);

-- Enable RLS
ALTER TABLE room_types_mirror ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Room types mirror viewable by authenticated"
  ON room_types_mirror FOR SELECT
  USING (true);

CREATE POLICY "Room types mirror insertable by admin"
  ON room_types_mirror FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Room types mirror updatable by admin"
  ON room_types_mirror FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================
-- UPDATE BOOKINGS_MIRROR - Add Channex tracking columns
-- ============================================
ALTER TABLE bookings_mirror
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'channex',
  ADD COLUMN IF NOT EXISTS provider_booking_id TEXT,
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS channex_property_id TEXT,
  ADD COLUMN IF NOT EXISTS channex_room_type_id TEXT,
  ADD COLUMN IF NOT EXISTS mapping_status TEXT DEFAULT 'MAPPED';

-- Create unique index for idempotency (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'bookings_mirror_provider_uq'
  ) THEN
    CREATE UNIQUE INDEX bookings_mirror_provider_uq 
      ON bookings_mirror(provider, provider_booking_id)
      WHERE provider_booking_id IS NOT NULL;
  END IF;
END $$;

-- Index for mapping status
CREATE INDEX IF NOT EXISTS bookings_mirror_mapping_status_idx 
  ON bookings_mirror(mapping_status);

-- Index for channex property lookup
CREATE INDEX IF NOT EXISTS bookings_mirror_channex_property_idx 
  ON bookings_mirror(channex_property_id);