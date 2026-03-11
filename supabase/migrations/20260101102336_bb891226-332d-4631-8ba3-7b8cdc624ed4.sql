-- ============================================================================
-- STEP 1: CREATE partner_status ENUM TYPE (nếu chưa có)
-- ============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_status') THEN
    CREATE TYPE partner_status AS ENUM (
      'ACTIVE',
      'INACTIVE',
      'ARCHIVED',
      'BLACKLISTED'
    );
  END IF;
END $$;

-- ============================================================================
-- STEP 2: ADD LIFECYCLE COLUMNS TO PARTNERS
-- ============================================================================

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

-- ============================================================================
-- STEP 3: ADD ENHANCED PARTNER FIELDS
-- ============================================================================

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
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'bank_account_info') THEN
    ALTER TABLE public.partners ADD COLUMN bank_account_info JSONB;
  END IF;
END $$;

-- ============================================================================
-- STEP 4: MIGRATE EXISTING STATUS
-- ============================================================================

UPDATE public.partners 
SET partner_status = CASE 
  WHEN status = 'active' THEN 'ACTIVE'::partner_status
  WHEN status = 'inactive' THEN 'INACTIVE'::partner_status
  ELSE 'ACTIVE'::partner_status
END
WHERE partner_status IS NULL;

-- ============================================================================
-- STEP 5: ADD COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.partners.partner_status IS 'Trạng thái hoạt động: ACTIVE/INACTIVE/ARCHIVED/BLACKLISTED';
COMMENT ON COLUMN public.partners.tax_code IS 'Mã số thuế';
COMMENT ON COLUMN public.partners.business_license IS 'Số giấy phép kinh doanh';
COMMENT ON COLUMN public.partners.contract_number IS 'Số hợp đồng';
COMMENT ON COLUMN public.partners.region IS 'Khu vực: HCM/HN/DN/HP/CT/OTHER';
COMMENT ON COLUMN public.partners.priority_level IS 'Mức độ ưu tiên: 1-5 (1=cao nhất)';