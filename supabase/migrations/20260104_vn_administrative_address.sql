-- =============================================
-- VIETNAM ADMINISTRATIVE ADDRESS SYSTEM
-- Phase: VN Address Cascade Dropdown
-- Date: 2026-01-04
-- Purpose: 63 provinces, ~700 districts, ~11,000 wards
-- ADD-ONLY - backward compatible with existing data
-- =============================================

-- 1. PROVINCES (Tỉnh/Thành phố)
CREATE TABLE IF NOT EXISTS public.vn_provinces (
  code TEXT PRIMARY KEY,           -- Mã hành chính: "01" = Hà Nội, "79" = TPHCM
  name TEXT NOT NULL,              -- "Thành phố Hà Nội", "Thành phố Hồ Chí Minh"
  name_en TEXT,                    -- "Hanoi", "Ho Chi Minh City"
  region TEXT,                     -- "Bắc", "Trung", "Nam"
  is_active BOOLEAN DEFAULT true,
  effective_from TIMESTAMPTZ DEFAULT now(),
  effective_to TIMESTAMPTZ,        -- NULL = still active
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. DISTRICTS (Quận/Huyện/Thị xã)
CREATE TABLE IF NOT EXISTS public.vn_districts (
  code TEXT PRIMARY KEY,           -- Mã hành chính: "760" = Quận 1
  province_code TEXT NOT NULL REFERENCES public.vn_provinces(code),
  name TEXT NOT NULL,              -- "Quận 1", "Huyện Củ Chi"
  name_en TEXT,
  district_type TEXT,              -- "QUAN", "HUYEN", "THI_XA", "THANH_PHO"
  is_active BOOLEAN DEFAULT true,
  effective_from TIMESTAMPTZ DEFAULT now(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. WARDS (Phường/Xã/Thị trấn)
CREATE TABLE IF NOT EXISTS public.vn_wards (
  code TEXT PRIMARY KEY,           -- Mã hành chính: "26734" = Phường Bến Nghé
  district_code TEXT NOT NULL REFERENCES public.vn_districts(code),
  name TEXT NOT NULL,              -- "Phường Bến Nghé", "Xã Tân Thông Hội"
  name_en TEXT,
  ward_type TEXT,                  -- "PHUONG", "XA", "THI_TRAN"
  is_active BOOLEAN DEFAULT true,
  effective_from TIMESTAMPTZ DEFAULT now(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. INDEXES for fast lookup
CREATE INDEX IF NOT EXISTS idx_vn_provinces_active ON public.vn_provinces(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vn_districts_province ON public.vn_districts(province_code);
CREATE INDEX IF NOT EXISTS idx_vn_districts_active ON public.vn_districts(province_code, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vn_wards_district ON public.vn_wards(district_code);
CREATE INDEX IF NOT EXISTS idx_vn_wards_active ON public.vn_wards(district_code, is_active) WHERE is_active = true;

-- Full text search indexes
CREATE INDEX IF NOT EXISTS idx_vn_provinces_name ON public.vn_provinces USING GIN (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_vn_districts_name ON public.vn_districts USING GIN (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_vn_wards_name ON public.vn_wards USING GIN (to_tsvector('simple', name));

-- 5. ENABLE RLS
ALTER TABLE public.vn_provinces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vn_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vn_wards ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES - Read-only for all authenticated users
CREATE POLICY "vn_provinces_read_all" ON public.vn_provinces
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "vn_districts_read_all" ON public.vn_districts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "vn_wards_read_all" ON public.vn_wards
  FOR SELECT TO authenticated USING (true);

-- 7. ADD-ONLY columns to property_catalog (NOT replacing existing city/district)
ALTER TABLE public.property_catalog 
  ADD COLUMN IF NOT EXISTS province_code TEXT REFERENCES public.vn_provinces(code),
  ADD COLUMN IF NOT EXISTS district_code TEXT REFERENCES public.vn_districts(code),
  ADD COLUMN IF NOT EXISTS ward_code TEXT REFERENCES public.vn_wards(code),
  ADD COLUMN IF NOT EXISTS province_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS district_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS ward_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS full_address TEXT; -- Computed or manual full address

-- 8. Index for property lookup by location
CREATE INDEX IF NOT EXISTS idx_property_catalog_province ON public.property_catalog(province_code) WHERE province_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_catalog_district ON public.property_catalog(district_code) WHERE district_code IS NOT NULL;

-- 9. Comment for documentation
COMMENT ON TABLE public.vn_provinces IS 'Vietnam provinces - 63 tỉnh/thành phố';
COMMENT ON TABLE public.vn_districts IS 'Vietnam districts - ~700 quận/huyện';
COMMENT ON TABLE public.vn_wards IS 'Vietnam wards - ~11,000 phường/xã';
COMMENT ON COLUMN public.property_catalog.province_code IS 'FK to vn_provinces - ADD-ONLY, không thay city cũ';
COMMENT ON COLUMN public.property_catalog.province_name_snapshot IS 'Snapshot tên tỉnh tại thời điểm tạo - historical integrity';
