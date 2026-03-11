-- ============================================================
-- OTA OPERATIONS MODULE - 018: WORK TYPE
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Add work_type classification for OTA projects
-- 
-- Rollout Strategy (safe + idempotent):
--   1. Create enum type (guard: duplicate_object)
--   2. Add column as NULLABLE (guard: if not exists)
--   3. Backfill ALL NULL → 'OTA_OPTIMIZATION' (safe default)
--   4. Set NOT NULL + DEFAULT for new records
--   5. Add index (guard: if not exists)
--
-- Rollback:
--   ALTER TABLE ota_projects DROP COLUMN IF EXISTS work_type;
--   DROP TYPE IF EXISTS ota_work_type;
-- ============================================================

-- ============================================================
-- STEP 1: Create enum type (idempotent)
-- ============================================================
DO $$
BEGIN
  CREATE TYPE public.ota_work_type AS ENUM (
    'OTA_ONBOARDING',      -- Onboarding property mới lên OTA
    'OTA_OPTIMIZATION',    -- Tối ưu hóa listing/performance
    'INCIDENT_SUPPORT',    -- Xử lý sự cố, complaint
    'QUALITY_AUDIT',       -- Kiểm tra chất lượng định kỳ
    'INTERNAL_OPS',        -- Công việc nội bộ team
    'STRATEGY_GROWTH'      -- Chiến lược phát triển
  );
  RAISE NOTICE 'Created enum type ota_work_type';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Enum type ota_work_type already exists, skipping';
END$$;

-- ============================================================
-- STEP 2: Add column as NULLABLE (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_projects' 
    AND column_name = 'work_type'
  ) THEN
    ALTER TABLE public.ota_projects ADD COLUMN work_type public.ota_work_type;
    RAISE NOTICE 'Added work_type column to ota_projects (NULLABLE)';
  ELSE
    RAISE NOTICE 'Column work_type already exists on ota_projects';
  END IF;
END$$;

-- ============================================================
-- STEP 3: Backfill existing rows
-- Rule: ALL NULL → 'OTA_OPTIMIZATION' (safe default, no auto INTERNAL_OPS)
-- ============================================================
UPDATE public.ota_projects
SET work_type = 'OTA_OPTIMIZATION'::public.ota_work_type
WHERE work_type IS NULL;

-- ============================================================
-- STEP 4: Set NOT NULL + DEFAULT for new records (idempotent)
-- ============================================================
DO $$
BEGIN
  -- Set NOT NULL if not already
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_projects' 
    AND column_name = 'work_type'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.ota_projects ALTER COLUMN work_type SET NOT NULL;
    RAISE NOTICE 'Set work_type to NOT NULL';
  END IF;
  
  -- Set DEFAULT if not already
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_projects' 
    AND column_name = 'work_type'
    AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE public.ota_projects ALTER COLUMN work_type SET DEFAULT 'OTA_OPTIMIZATION'::public.ota_work_type;
    RAISE NOTICE 'Set work_type DEFAULT to OTA_OPTIMIZATION';
  END IF;
END$$;

-- ============================================================
-- STEP 5: Add index for filtering by work_type (idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ota_projects_work_type 
ON public.ota_projects(work_type);

-- ============================================================
-- VERIFY
-- ============================================================
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count 
  FROM public.ota_projects 
  WHERE work_type IS NULL;
  
  IF null_count > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: % projects still have NULL work_type', null_count;
  ELSE
    RAISE NOTICE 'VERIFICATION PASSED: All projects have work_type set';
  END IF;
END$$;
