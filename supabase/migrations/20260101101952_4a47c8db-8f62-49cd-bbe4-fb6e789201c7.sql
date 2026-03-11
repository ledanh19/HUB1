-- ============================================================================
-- COMBINED MIGRATION FOR PARTNERS OPTIMIZATION
-- ============================================================================

-- PART 1: CREATE CATALOG TABLES
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
  applicable_property_types TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uk_room_type_code UNIQUE (code)
);

-- PART 2: CREATE GLOBAL PROPERTY CATALOG
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

-- PART 3: CREATE PARTNER-PROPERTY MAPPING TABLE
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

-- PART 4: CREATE PROPERTY ROOM TYPES MAPPING
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

-- PART 5: ADD PARTNER LIFECYCLE COLUMNS
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_status') THEN
    CREATE TYPE partner_status AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'BLACKLISTED');
  END IF;
END $$;

-- Add new lifecycle columns to partners table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'partner_status') THEN
    ALTER TABLE public.partners ADD COLUMN partner_status partner_status DEFAULT 'ACTIVE';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'archived_at') THEN
    ALTER TABLE public.partners ADD COLUMN archived_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'archived_by') THEN
    ALTER TABLE public.partners ADD COLUMN archived_by UUID REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'archive_reason') THEN
    ALTER TABLE public.partners ADD COLUMN archive_reason TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'blacklisted_at') THEN
    ALTER TABLE public.partners ADD COLUMN blacklisted_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'blacklisted_by') THEN
    ALTER TABLE public.partners ADD COLUMN blacklisted_by UUID REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'blacklist_reason') THEN
    ALTER TABLE public.partners ADD COLUMN blacklist_reason TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'last_activated_at') THEN
    ALTER TABLE public.partners ADD COLUMN last_activated_at TIMESTAMPTZ DEFAULT now();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'last_activated_by') THEN
    ALTER TABLE public.partners ADD COLUMN last_activated_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Migrate existing status to partner_status
UPDATE public.partners 
SET partner_status = CASE 
  WHEN status = 'active' THEN 'ACTIVE'::partner_status
  WHEN status = 'inactive' THEN 'INACTIVE'::partner_status
  ELSE 'ACTIVE'::partner_status
END
WHERE partner_status IS NULL;

-- PART 6: ADD ENHANCED PARTNER FIELDS
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'tax_code') THEN
    ALTER TABLE public.partners ADD COLUMN tax_code TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'business_license') THEN
    ALTER TABLE public.partners ADD COLUMN business_license TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'contract_number') THEN
    ALTER TABLE public.partners ADD COLUMN contract_number TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'contract_start_date') THEN
    ALTER TABLE public.partners ADD COLUMN contract_start_date DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'contract_end_date') THEN
    ALTER TABLE public.partners ADD COLUMN contract_end_date DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'contact_person') THEN
    ALTER TABLE public.partners ADD COLUMN contact_person TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'secondary_phone') THEN
    ALTER TABLE public.partners ADD COLUMN secondary_phone TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'address') THEN
    ALTER TABLE public.partners ADD COLUMN address TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'region') THEN
    ALTER TABLE public.partners ADD COLUMN region TEXT DEFAULT 'HCM';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'commission_rate') THEN
    ALTER TABLE public.partners ADD COLUMN commission_rate DECIMAL(5,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'payment_method') THEN
    ALTER TABLE public.partners ADD COLUMN payment_method TEXT DEFAULT 'BANK_TRANSFER';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'priority_level') THEN
    ALTER TABLE public.partners ADD COLUMN priority_level INTEGER DEFAULT 3;
  END IF;
END $$;

-- PART 7: CREATE PARTNER REFERENCE SUMMARY VIEW
DROP VIEW IF EXISTS public.partner_reference_summary;
CREATE VIEW public.partner_reference_summary WITH (security_invoker = true) AS
SELECT 
  p.id AS partner_id,
  p.partner_name,
  p.partner_status,
  COALESCE(segments.cnt, 0) AS segment_count,
  COALESCE(payables.cnt, 0) AS payable_count,
  COALESCE(payments.cnt, 0) AS payment_count,
  COALESCE(deposits.cnt, 0) AS deposit_count,
  COALESCE(prepaids.cnt, 0) AS prepaid_count,
  COALESCE(commissions.cnt, 0) AS commission_count,
  COALESCE(properties.cnt, 0) AS property_count,
  COALESCE(rooms.cnt, 0) AS room_count,
  COALESCE(surcharges.cnt, 0) AS surcharge_count,
  (COALESCE(segments.cnt, 0) + COALESCE(payables.cnt, 0) + COALESCE(payments.cnt, 0) + 
   COALESCE(deposits.cnt, 0) + COALESCE(prepaids.cnt, 0) + COALESCE(commissions.cnt, 0) + 
   COALESCE(properties.cnt, 0) + COALESCE(rooms.cnt, 0) + COALESCE(surcharges.cnt, 0)) AS total_references,
  (COALESCE(segments.cnt, 0) + COALESCE(payables.cnt, 0) + COALESCE(payments.cnt, 0) + 
   COALESCE(deposits.cnt, 0) + COALESCE(prepaids.cnt, 0) + COALESCE(commissions.cnt, 0)) = 0 AS can_hard_delete
FROM public.partners p
LEFT JOIN (SELECT partner_id, COUNT(*) AS cnt FROM public.host_supply_segments GROUP BY partner_id) segments ON segments.partner_id = p.id
LEFT JOIN (SELECT partner_id, COUNT(*) AS cnt FROM public.host_payables GROUP BY partner_id) payables ON payables.partner_id = p.id
LEFT JOIN (SELECT partner_id, COUNT(*) AS cnt FROM public.host_payments GROUP BY partner_id) payments ON payments.partner_id = p.id
LEFT JOIN (SELECT partner_id, COUNT(*) AS cnt FROM public.host_deposits GROUP BY partner_id) deposits ON deposits.partner_id = p.id
LEFT JOIN (SELECT partner_id, COUNT(*) AS cnt FROM public.host_prepaids GROUP BY partner_id) prepaids ON prepaids.partner_id = p.id
LEFT JOIN (SELECT partner_id, COUNT(*) AS cnt FROM public.commission_receivables GROUP BY partner_id) commissions ON commissions.partner_id = p.id
LEFT JOIN (SELECT partner_id, COUNT(*) AS cnt FROM public.host_properties GROUP BY partner_id) properties ON properties.partner_id = p.id
LEFT JOIN (SELECT partner_id, COUNT(*) AS cnt FROM public.host_rooms GROUP BY partner_id) rooms ON rooms.partner_id = p.id
LEFT JOIN (SELECT host_partner_id AS partner_id, COUNT(*) AS cnt FROM public.host_surcharges GROUP BY host_partner_id) surcharges ON surcharges.partner_id = p.id;

GRANT SELECT ON public.partner_reference_summary TO authenticated;

-- PART 8: ENABLE RLS ON NEW TABLES
ALTER TABLE public.property_type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_property_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_room_types ENABLE ROW LEVEL SECURITY;

-- PART 9: RLS POLICIES
DROP POLICY IF EXISTS "property_type_catalog_select" ON public.property_type_catalog;
CREATE POLICY "property_type_catalog_select" ON public.property_type_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "property_type_catalog_insert" ON public.property_type_catalog;
CREATE POLICY "property_type_catalog_insert" ON public.property_type_catalog FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "property_type_catalog_update" ON public.property_type_catalog;
CREATE POLICY "property_type_catalog_update" ON public.property_type_catalog FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "room_type_catalog_select" ON public.room_type_catalog;
CREATE POLICY "room_type_catalog_select" ON public.room_type_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "room_type_catalog_insert" ON public.room_type_catalog;
CREATE POLICY "room_type_catalog_insert" ON public.room_type_catalog FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "room_type_catalog_update" ON public.room_type_catalog;
CREATE POLICY "room_type_catalog_update" ON public.room_type_catalog FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "property_catalog_select" ON public.property_catalog;
CREATE POLICY "property_catalog_select" ON public.property_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "property_catalog_insert" ON public.property_catalog;
CREATE POLICY "property_catalog_insert" ON public.property_catalog FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "property_catalog_update" ON public.property_catalog;
CREATE POLICY "property_catalog_update" ON public.property_catalog FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "partner_property_mapping_select" ON public.partner_property_mapping;
CREATE POLICY "partner_property_mapping_select" ON public.partner_property_mapping FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "partner_property_mapping_insert" ON public.partner_property_mapping;
CREATE POLICY "partner_property_mapping_insert" ON public.partner_property_mapping FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "partner_property_mapping_update" ON public.partner_property_mapping;
CREATE POLICY "partner_property_mapping_update" ON public.partner_property_mapping FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "partner_property_mapping_delete" ON public.partner_property_mapping;
CREATE POLICY "partner_property_mapping_delete" ON public.partner_property_mapping FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "property_room_types_select" ON public.property_room_types;
CREATE POLICY "property_room_types_select" ON public.property_room_types FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "property_room_types_insert" ON public.property_room_types;
CREATE POLICY "property_room_types_insert" ON public.property_room_types FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "property_room_types_update" ON public.property_room_types;
CREATE POLICY "property_room_types_update" ON public.property_room_types FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "property_room_types_delete" ON public.property_room_types;
CREATE POLICY "property_room_types_delete" ON public.property_room_types FOR DELETE TO authenticated USING (true);

-- PART 10: SEED DATA
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

-- SAMPLE PROPERTIES
INSERT INTO property_catalog (property_name, property_code, property_type_id, address, district, city)
SELECT 'Landmark 81', 'LM81', id, '720A Điện Biên Phủ', 'Bình Thạnh', 'Hồ Chí Minh'
FROM property_type_catalog WHERE code = 'APARTMENT' ON CONFLICT (property_name) DO NOTHING;

INSERT INTO property_catalog (property_name, property_code, property_type_id, address, district, city)
SELECT 'Vinhomes Central Park', 'VCP', id, '208 Nguyễn Hữu Cảnh', 'Bình Thạnh', 'Hồ Chí Minh'
FROM property_type_catalog WHERE code = 'APARTMENT' ON CONFLICT (property_name) DO NOTHING;

INSERT INTO property_catalog (property_name, property_code, property_type_id, address, district, city)
SELECT 'Masteri Thảo Điền', 'MTD', id, '159 Xa Lộ Hà Nội', 'Thủ Đức', 'Hồ Chí Minh'
FROM property_type_catalog WHERE code = 'APARTMENT' ON CONFLICT (property_name) DO NOTHING;