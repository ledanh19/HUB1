-- ============================================================================
-- STEP 1: CREATE CATALOG TABLES
-- ============================================================================

-- 1.1 Property Type Catalog (Loại chỗ nghỉ: Apartment, Villa, Hotel...)
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

-- 1.2 Room Type Catalog (Loại phòng: Studio, 1BR, 2BR, Deluxe...)
CREATE TABLE IF NOT EXISTS public.room_type_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  name_en TEXT,
  applicable_property_types TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uk_room_type_code UNIQUE (code)
);

-- ============================================================================
-- STEP 2: CREATE GLOBAL PROPERTY CATALOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.property_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  property_name TEXT NOT NULL,
  property_code TEXT,
  property_type_id UUID REFERENCES public.property_type_catalog(id),
  
  address TEXT,
  district TEXT,
  city TEXT DEFAULT 'Hồ Chí Minh',
  country TEXT DEFAULT 'Việt Nam',
  
  description TEXT,
  total_units INTEGER,
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT uk_property_catalog_name UNIQUE (property_name)
);

-- Add unique constraint on property_code
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_property_catalog_code') THEN
    ALTER TABLE public.property_catalog ADD CONSTRAINT uk_property_catalog_code UNIQUE (property_code);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- STEP 3: CREATE PARTNER-PROPERTY MAPPING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.partner_property_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.property_catalog(id) ON DELETE RESTRICT,
  
  role TEXT DEFAULT 'MANAGER',
  
  contract_start DATE,
  contract_end DATE,
  commission_rate DECIMAL(5,2),
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uk_partner_property_mapping UNIQUE (partner_id, property_id)
);

-- ============================================================================
-- STEP 4: CREATE PROPERTY ROOM TYPES MAPPING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.property_room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  property_id UUID NOT NULL REFERENCES public.property_catalog(id) ON DELETE CASCADE,
  room_type_catalog_id UUID NOT NULL REFERENCES public.room_type_catalog(id) ON DELETE RESTRICT,
  
  display_name_override TEXT,
  default_capacity INTEGER DEFAULT 2,
  default_price DECIMAL(12,0),
  
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT uk_property_room_mapping UNIQUE (property_id, room_type_catalog_id)
);

-- ============================================================================
-- STEP 5: ENABLE RLS
-- ============================================================================

ALTER TABLE public.property_type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_property_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_room_types ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 6: CREATE RLS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "allow_all_property_type_catalog" ON public.property_type_catalog;
CREATE POLICY "allow_all_property_type_catalog" ON public.property_type_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_room_type_catalog" ON public.room_type_catalog;
CREATE POLICY "allow_all_room_type_catalog" ON public.room_type_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_property_catalog" ON public.property_catalog;
CREATE POLICY "allow_all_property_catalog" ON public.property_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_partner_property_mapping" ON public.partner_property_mapping;
CREATE POLICY "allow_all_partner_property_mapping" ON public.partner_property_mapping FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_property_room_types" ON public.property_room_types;
CREATE POLICY "allow_all_property_room_types" ON public.property_room_types FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- STEP 7: INSERT SAMPLE DATA
-- ============================================================================

INSERT INTO public.property_type_catalog (code, name_vi, name_en, sort_order) VALUES
  ('APARTMENT', 'Căn hộ dịch vụ', 'Serviced Apartment', 1),
  ('VILLA', 'Biệt thự', 'Villa', 2),
  ('HOTEL', 'Khách sạn', 'Hotel', 3),
  ('HOMESTAY', 'Homestay', 'Homestay', 4),
  ('RESORT', 'Resort', 'Resort', 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.room_type_catalog (code, name_vi, name_en, sort_order) VALUES
  ('STUDIO', 'Studio', 'Studio', 1),
  ('1BR', '1 phòng ngủ', '1 Bedroom', 2),
  ('2BR', '2 phòng ngủ', '2 Bedrooms', 3),
  ('3BR', '3 phòng ngủ', '3 Bedrooms', 4),
  ('PENTHOUSE', 'Penthouse', 'Penthouse', 5),
  ('DELUXE', 'Deluxe', 'Deluxe', 6),
  ('SUPERIOR', 'Superior', 'Superior', 7),
  ('STANDARD', 'Standard', 'Standard', 8)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STEP 8: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_property_catalog_active ON public.property_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_property_catalog_city ON public.property_catalog(city);
CREATE INDEX IF NOT EXISTS idx_partner_property_mapping_partner ON public.partner_property_mapping(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_property_mapping_property ON public.partner_property_mapping(property_id);
CREATE INDEX IF NOT EXISTS idx_property_room_types_property ON public.property_room_types(property_id);