-- ============================================================================
-- MIGRATION: Partner & Property Catalog System
-- Date: 2026-01-01
-- Description: 
--   - Add property_type_catalog and room_type_catalog (GLOBAL dropdowns)
--   - Add property_room_types mapping table
--   - Enhance host_properties with property_type_id
--   - Add delete protection functions
--   - Seed standard catalog data
-- 
-- IMPORTANT: This migration is IDEMPOTENT - safe to run multiple times
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE CATALOG TABLES
-- ============================================================================

-- 1.1 Property Type Catalog (GLOBAL)
CREATE TABLE IF NOT EXISTS public.property_type_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  name_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uk_property_type_code UNIQUE (code)
);

-- 1.2 Room Type Catalog (GLOBAL)
CREATE TABLE IF NOT EXISTS public.room_type_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  name_en TEXT,
  applicable_property_types TEXT[], -- Optional: filter by property type codes
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uk_room_type_code UNIQUE (code)
);

-- ============================================================================
-- PART 2: CREATE MAPPING TABLE
-- ============================================================================

-- 2.1 Property Room Types Mapping (per-property customization)
CREATE TABLE IF NOT EXISTS public.property_room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.host_properties(id) ON DELETE CASCADE,
  room_type_catalog_id UUID NOT NULL REFERENCES public.room_type_catalog(id) ON DELETE RESTRICT,
  display_name_override TEXT, -- Optional: custom display name for this property
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uk_property_room_mapping UNIQUE (property_id, room_type_catalog_id)
);

-- ============================================================================
-- PART 3: ENHANCE HOST_PROPERTIES TABLE
-- ============================================================================

-- 3.1 Add property_type_id column (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'host_properties' 
    AND column_name = 'property_type_id'
  ) THEN
    ALTER TABLE public.host_properties 
    ADD COLUMN property_type_id UUID REFERENCES public.property_type_catalog(id);
  END IF;
END $$;

-- 3.2 Add address column (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'host_properties' 
    AND column_name = 'address'
  ) THEN
    ALTER TABLE public.host_properties 
    ADD COLUMN address TEXT;
  END IF;
END $$;

-- ============================================================================
-- PART 4: ENABLE RLS
-- ============================================================================

ALTER TABLE public.property_type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_room_types ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: RLS POLICIES
-- ============================================================================

-- 5.1 Property Type Catalog Policies
DROP POLICY IF EXISTS "property_type_catalog_select" ON public.property_type_catalog;
CREATE POLICY "property_type_catalog_select" ON public.property_type_catalog 
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "property_type_catalog_insert" ON public.property_type_catalog;
CREATE POLICY "property_type_catalog_insert" ON public.property_type_catalog 
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "property_type_catalog_update" ON public.property_type_catalog;
CREATE POLICY "property_type_catalog_update" ON public.property_type_catalog 
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- NO DELETE policy - catalog should NEVER be deleted

-- 5.2 Room Type Catalog Policies
DROP POLICY IF EXISTS "room_type_catalog_select" ON public.room_type_catalog;
CREATE POLICY "room_type_catalog_select" ON public.room_type_catalog 
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "room_type_catalog_insert" ON public.room_type_catalog;
CREATE POLICY "room_type_catalog_insert" ON public.room_type_catalog 
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "room_type_catalog_update" ON public.room_type_catalog;
CREATE POLICY "room_type_catalog_update" ON public.room_type_catalog 
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- NO DELETE policy - catalog should NEVER be deleted

-- 5.3 Property Room Types Mapping Policies
DROP POLICY IF EXISTS "property_room_types_select" ON public.property_room_types;
CREATE POLICY "property_room_types_select" ON public.property_room_types 
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "property_room_types_insert" ON public.property_room_types;
CREATE POLICY "property_room_types_insert" ON public.property_room_types 
FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "property_room_types_update" ON public.property_room_types;
CREATE POLICY "property_room_types_update" ON public.property_room_types 
FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "property_room_types_delete" ON public.property_room_types;
CREATE POLICY "property_room_types_delete" ON public.property_room_types 
FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- PART 6: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_property_type_catalog_code 
ON public.property_type_catalog(code);

CREATE INDEX IF NOT EXISTS idx_property_type_catalog_active 
ON public.property_type_catalog(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_room_type_catalog_code 
ON public.room_type_catalog(code);

CREATE INDEX IF NOT EXISTS idx_room_type_catalog_active 
ON public.room_type_catalog(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_property_room_types_property 
ON public.property_room_types(property_id);

CREATE INDEX IF NOT EXISTS idx_property_room_types_catalog 
ON public.property_room_types(room_type_catalog_id);

CREATE INDEX IF NOT EXISTS idx_host_properties_property_type 
ON public.host_properties(property_type_id);

-- ============================================================================
-- PART 7: TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE TRIGGER update_property_type_catalog_updated_at
BEFORE UPDATE ON public.property_type_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_room_type_catalog_updated_at
BEFORE UPDATE ON public.room_type_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_property_room_types_updated_at
BEFORE UPDATE ON public.property_room_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 8: DELETE PROTECTION FUNCTION
-- ============================================================================

-- Function to check if property is referenced in segments
CREATE OR REPLACE FUNCTION public.check_property_delete_reference()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if property name is used in any segment
  IF EXISTS (
    SELECT 1 FROM public.host_supply_segments 
    WHERE host_property_name = OLD.host_property_name
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Cannot delete property "%" - it is referenced in booking segments. Please deactivate instead.', OLD.host_property_name;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for delete protection
DROP TRIGGER IF EXISTS trg_check_property_delete ON public.host_properties;
CREATE TRIGGER trg_check_property_delete
BEFORE DELETE ON public.host_properties
FOR EACH ROW EXECUTE FUNCTION public.check_property_delete_reference();

-- ============================================================================
-- PART 9: SEED CATALOG DATA
-- ============================================================================

-- 9.1 Seed Property Types
INSERT INTO public.property_type_catalog (code, name_vi, name_en, sort_order, is_active)
VALUES 
  ('APARTMENT', 'Căn hộ', 'Apartment', 1, true),
  ('SERVICED_APARTMENT', 'Căn hộ dịch vụ', 'Serviced Apartment', 2, true),
  ('HOMESTAY', 'Homestay', 'Homestay', 3, true),
  ('VILLA', 'Villa', 'Villa', 4, true),
  ('HOTEL', 'Khách sạn', 'Hotel', 5, true),
  ('BOUTIQUE_HOTEL', 'Khách sạn boutique', 'Boutique Hotel', 6, true),
  ('RESORT', 'Resort', 'Resort', 7, true),
  ('RETREAT', 'Retreat', 'Retreat', 8, true),
  ('OTHER', 'Khác', 'Other', 99, true)
ON CONFLICT (code) DO UPDATE SET
  name_vi = EXCLUDED.name_vi,
  name_en = EXCLUDED.name_en,
  sort_order = EXCLUDED.sort_order;

-- 9.2 Seed Room Types
INSERT INTO public.room_type_catalog (code, name_vi, name_en, applicable_property_types, sort_order, is_active)
VALUES 
  ('STUDIO', 'Studio', 'Studio', ARRAY['APARTMENT', 'SERVICED_APARTMENT'], 1, true),
  ('1BR', '1 Phòng ngủ', '1 Bedroom', ARRAY['APARTMENT', 'SERVICED_APARTMENT', 'VILLA'], 2, true),
  ('2BR', '2 Phòng ngủ', '2 Bedrooms', ARRAY['APARTMENT', 'SERVICED_APARTMENT', 'VILLA'], 3, true),
  ('3BR', '3 Phòng ngủ', '3 Bedrooms', ARRAY['APARTMENT', 'SERVICED_APARTMENT', 'VILLA'], 4, true),
  ('4BR', '4 Phòng ngủ', '4 Bedrooms', ARRAY['VILLA'], 5, true),
  ('5BR', '5 Phòng ngủ', '5 Bedrooms', ARRAY['VILLA'], 6, true),
  ('6BR', '6 Phòng ngủ', '6 Bedrooms', ARRAY['VILLA'], 7, true),
  ('PENTHOUSE', 'Penthouse', 'Penthouse', ARRAY['APARTMENT', 'SERVICED_APARTMENT'], 8, true),
  ('STANDARD', 'Standard', 'Standard', ARRAY['HOTEL', 'BOUTIQUE_HOTEL', 'RESORT'], 10, true),
  ('SUPERIOR', 'Superior', 'Superior', ARRAY['HOTEL', 'BOUTIQUE_HOTEL', 'RESORT'], 11, true),
  ('DELUXE', 'Deluxe', 'Deluxe', ARRAY['HOTEL', 'BOUTIQUE_HOTEL', 'RESORT'], 12, true),
  ('SUITE', 'Suite', 'Suite', ARRAY['HOTEL', 'BOUTIQUE_HOTEL', 'RESORT'], 13, true),
  ('FAMILY', 'Phòng gia đình', 'Family Room', NULL, 20, true),
  ('DORM', 'Phòng tập thể', 'Dormitory', ARRAY['HOMESTAY'], 21, true),
  ('SINGLE', 'Phòng đơn', 'Single Room', NULL, 22, true),
  ('DOUBLE', 'Phòng đôi', 'Double Room', NULL, 23, true),
  ('TWIN', 'Phòng 2 giường đơn', 'Twin Room', NULL, 24, true),
  ('TRIPLE', 'Phòng 3 người', 'Triple Room', NULL, 25, true),
  ('ENTIRE_PROPERTY', 'Toàn bộ chỗ nghỉ', 'Entire Property', ARRAY['VILLA', 'HOMESTAY'], 30, true),
  ('OTHER', 'Khác', 'Other', NULL, 99, true)
ON CONFLICT (code) DO UPDATE SET
  name_vi = EXCLUDED.name_vi,
  name_en = EXCLUDED.name_en,
  applicable_property_types = EXCLUDED.applicable_property_types,
  sort_order = EXCLUDED.sort_order;

-- ============================================================================
-- PART 10: AUDIT LOG FOR CATALOG CHANGES
-- ============================================================================

-- Function to audit catalog changes
CREATE OR REPLACE FUNCTION public.audit_catalog_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      action,
      entity,
      entity_id,
      before_data,
      after_data
    ) VALUES (
      'UPDATE_CATALOG',
      TG_TABLE_NAME,
      NEW.id::text,
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      action,
      entity,
      entity_id,
      after_data
    ) VALUES (
      'CREATE_CATALOG',
      TG_TABLE_NAME,
      NEW.id::text,
      to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Audit triggers for catalogs
DROP TRIGGER IF EXISTS trg_audit_property_type_catalog ON public.property_type_catalog;
CREATE TRIGGER trg_audit_property_type_catalog
AFTER INSERT OR UPDATE ON public.property_type_catalog
FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();

DROP TRIGGER IF EXISTS trg_audit_room_type_catalog ON public.room_type_catalog;
CREATE TRIGGER trg_audit_room_type_catalog
AFTER INSERT OR UPDATE ON public.room_type_catalog
FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_change();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE public.property_type_catalog IS 'Global catalog of property types (Apartment, Villa, Hotel, etc.)';
COMMENT ON TABLE public.room_type_catalog IS 'Global catalog of room types (Studio, 1BR, Deluxe, etc.)';
COMMENT ON TABLE public.property_room_types IS 'Mapping of available room types per property';