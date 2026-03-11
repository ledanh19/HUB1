-- ============================================================
-- Migration 018: OTA Work Type
-- ============================================================

-- Add work_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_work_type') THEN
    CREATE TYPE public.ota_work_type AS ENUM (
      'ONBOARDING',
      'CONTENT_UPDATE', 
      'PROMOTION',
      'ISSUE_RESOLUTION',
      'OPTIMIZATION',
      'MAINTENANCE',
      'OTHER'
    );
  END IF;
END$$;

-- Add work_type column to ota_projects if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_projects' 
    AND column_name = 'work_type'
  ) THEN
    ALTER TABLE public.ota_projects 
    ADD COLUMN work_type public.ota_work_type DEFAULT 'OTHER';
  END IF;
END$$;

-- Add comment
COMMENT ON COLUMN public.ota_projects.work_type IS 'Type of OTA work: ONBOARDING, CONTENT_UPDATE, PROMOTION, ISSUE_RESOLUTION, OPTIMIZATION, MAINTENANCE, OTHER';