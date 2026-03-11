-- ============================================================================
-- 🔧 FIX FOREIGN KEY - property_room_types
-- ============================================================================

-- STEP 1: Drop the old table if exists (careful - this deletes data!)
DROP TABLE IF EXISTS public.property_room_types CASCADE;

-- STEP 2: Re-create with correct foreign key to property_catalog
CREATE TABLE public.property_room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Now references property_catalog (NOT host_properties)
  property_id UUID NOT NULL REFERENCES public.property_catalog(id) ON DELETE CASCADE,
  room_type_catalog_id UUID NOT NULL REFERENCES public.room_type_catalog(id) ON DELETE RESTRICT,
  
  -- Room details
  display_name_override TEXT,
  default_capacity INTEGER DEFAULT 2,
  default_price DECIMAL(12,0),
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicate
  CONSTRAINT uk_property_room_mapping UNIQUE (property_id, room_type_catalog_id)
);

-- STEP 3: Enable RLS
ALTER TABLE public.property_room_types ENABLE ROW LEVEL SECURITY;

-- STEP 4: Create policy
DROP POLICY IF EXISTS "allow_all_property_room_types" ON public.property_room_types;
CREATE POLICY "allow_all_property_room_types" ON public.property_room_types 
  FOR ALL TO authenticated 
  USING (true) 
  WITH CHECK (true);

-- STEP 5: Create index
CREATE INDEX IF NOT EXISTS idx_property_room_types_property ON public.property_room_types(property_id);
CREATE INDEX IF NOT EXISTS idx_property_room_types_room_type ON public.property_room_types(room_type_catalog_id);