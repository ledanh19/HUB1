-- COMBINED MIGRATION FOR PARTNERS OPTIMIZATION
-- Tạo các bảng và dữ liệu cho hệ thống catalog

-- 1. Property Type Catalog
CREATE TABLE IF NOT EXISTS public.property_type_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_vi TEXT NOT NULL,
  name_en TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Room Type Catalog
CREATE TABLE IF NOT EXISTS public.room_type_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_vi TEXT NOT NULL,
  name_en TEXT,
  applicable_property_types TEXT[],
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Property Catalog (GLOBAL)
CREATE TABLE IF NOT EXISTS public.property_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name TEXT NOT NULL UNIQUE,
  property_code TEXT UNIQUE,
  property_type_id UUID REFERENCES public.property_type_catalog(id),
  address TEXT,
  district TEXT,
  city TEXT DEFAULT 'Hồ Chí Minh',
  country TEXT DEFAULT 'Việt Nam',
  description TEXT,
  total_units INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 4. Partner Property Mapping
CREATE TABLE IF NOT EXISTS public.partner_property_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.property_catalog(id) ON DELETE RESTRICT,
  role TEXT DEFAULT 'MANAGER',
  commission_rate DECIMAL(5,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (partner_id, property_id)
);

-- 5. Property Room Types
CREATE TABLE IF NOT EXISTS public.property_room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.property_catalog(id) ON DELETE CASCADE,
  room_type_catalog_id UUID NOT NULL REFERENCES public.room_type_catalog(id) ON DELETE RESTRICT,
  display_name_override TEXT,
  default_capacity INTEGER DEFAULT 2,
  default_price DECIMAL(12,0),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (property_id, room_type_catalog_id)
);

-- 6. Partner Status Enum
DO $$ BEGIN
  CREATE TYPE partner_status AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'BLACKLISTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Add columns to partners table
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS partner_status partner_status DEFAULT 'ACTIVE';
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS blacklisted_at TIMESTAMPTZ;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS blacklist_reason TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'HCM';
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2);

-- 8. Enable RLS
ALTER TABLE public.property_type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_property_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_room_types ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies (SELECT, INSERT, UPDATE, DELETE for authenticated)
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

-- 10. Seed Property Types
INSERT INTO public.property_type_catalog (code, name_vi, name_en, sort_order) VALUES
('APARTMENT', 'Căn hộ', 'Apartment', 1),
('SERVICED_APARTMENT', 'Căn hộ dịch vụ', 'Serviced Apartment', 2),
('HOMESTAY', 'Homestay', 'Homestay', 3),
('VILLA', 'Villa', 'Villa', 4),
('HOTEL', 'Khách sạn', 'Hotel', 5),
('BOUTIQUE_HOTEL', 'Khách sạn boutique', 'Boutique Hotel', 6),
('RESORT', 'Resort', 'Resort', 7),
('OTHER', 'Khác', 'Other', 99)
ON CONFLICT (code) DO NOTHING;

-- 11. Seed Room Types
INSERT INTO public.room_type_catalog (code, name_vi, name_en, applicable_property_types, sort_order) VALUES
('STUDIO', 'Studio', 'Studio', ARRAY['APARTMENT', 'SERVICED_APARTMENT'], 1),
('1BR', '1 Phòng ngủ', '1 Bedroom', ARRAY['APARTMENT', 'SERVICED_APARTMENT', 'VILLA'], 2),
('2BR', '2 Phòng ngủ', '2 Bedrooms', ARRAY['APARTMENT', 'SERVICED_APARTMENT', 'VILLA'], 3),
('3BR', '3 Phòng ngủ', '3 Bedrooms', ARRAY['APARTMENT', 'SERVICED_APARTMENT', 'VILLA'], 4),
('PENTHOUSE', 'Penthouse', 'Penthouse', ARRAY['APARTMENT'], 8),
('STANDARD', 'Standard', 'Standard', ARRAY['HOTEL', 'RESORT'], 10),
('DELUXE', 'Deluxe', 'Deluxe', ARRAY['HOTEL', 'RESORT'], 12),
('SUITE', 'Suite', 'Suite', ARRAY['HOTEL', 'RESORT'], 13),
('FAMILY', 'Phòng gia đình', 'Family Room', NULL, 20),
('ENTIRE_PROPERTY', 'Toàn bộ chỗ nghỉ', 'Entire Property', ARRAY['VILLA', 'HOMESTAY'], 30),
('OTHER', 'Khác', 'Other', NULL, 99)
ON CONFLICT (code) DO NOTHING;

-- 12. Seed Sample Properties HCM
INSERT INTO public.property_catalog (property_name, property_code, property_type_id, address, district, city)
SELECT 'Landmark 81', 'LM81', id, '720A Điện Biên Phủ', 'Bình Thạnh', 'Hồ Chí Minh'
FROM public.property_type_catalog WHERE code = 'APARTMENT'
ON CONFLICT (property_name) DO NOTHING;

INSERT INTO public.property_catalog (property_name, property_code, property_type_id, address, district, city)
SELECT 'Vinhomes Central Park', 'VCP', id, '208 Nguyễn Hữu Cảnh', 'Bình Thạnh', 'Hồ Chí Minh'
FROM public.property_type_catalog WHERE code = 'APARTMENT'
ON CONFLICT (property_name) DO NOTHING;

INSERT INTO public.property_catalog (property_name, property_code, property_type_id, address, district, city)
SELECT 'Masteri Thảo Điền', 'MTD', id, '159 Xa Lộ Hà Nội', 'Thủ Đức', 'Hồ Chí Minh'
FROM public.property_type_catalog WHERE code = 'APARTMENT'
ON CONFLICT (property_name) DO NOTHING;

-- 13. Partner Reference Summary View
CREATE OR REPLACE VIEW public.partner_reference_summary AS
SELECT 
  p.id AS partner_id,
  p.partner_name,
  p.partner_status,
  COALESCE((SELECT COUNT(*) FROM host_supply_segments WHERE partner_id = p.id), 0) AS segment_count,
  COALESCE((SELECT COUNT(*) FROM host_payables WHERE partner_id = p.id), 0) AS payable_count,
  COALESCE((SELECT COUNT(*) FROM host_payments WHERE partner_id = p.id), 0) AS payment_count,
  COALESCE((SELECT COUNT(*) FROM host_deposits WHERE partner_id = p.id), 0) AS deposit_count,
  COALESCE((SELECT COUNT(*) FROM host_properties WHERE partner_id = p.id), 0) AS property_count,
  COALESCE((SELECT COUNT(*) FROM host_rooms WHERE partner_id = p.id), 0) AS room_count
FROM public.partners p;

GRANT SELECT ON public.partner_reference_summary TO authenticated;