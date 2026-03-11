-- ============================================================
-- OTA OPERATIONS MODULE - 019: AUDIT LOG OVERRIDE EXTENSION
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Extend ota_audit_log for override tracking
-- 
-- New columns:
--   - reason: TEXT for override justification
--   - override_type: TEXT for REOPEN/FORCE_DONE/CANCEL
--   - performed_via: TEXT DEFAULT 'TRIGGER' (TRIGGER/RPC)
--
-- Rollback:
--   ALTER TABLE ota_audit_log DROP COLUMN IF EXISTS reason;
--   ALTER TABLE ota_audit_log DROP COLUMN IF EXISTS override_type;
--   ALTER TABLE ota_audit_log DROP COLUMN IF EXISTS performed_via;
-- ============================================================

-- ============================================================
-- STEP 1: Add reason column (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_audit_log' 
    AND column_name = 'reason'
  ) THEN
    ALTER TABLE public.ota_audit_log ADD COLUMN reason TEXT;
    RAISE NOTICE 'Added reason column to ota_audit_log';
  ELSE
    RAISE NOTICE 'Column reason already exists on ota_audit_log';
  END IF;
END$$;

-- ============================================================
-- STEP 2: Add override_type column (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_audit_log' 
    AND column_name = 'override_type'
  ) THEN
    ALTER TABLE public.ota_audit_log ADD COLUMN override_type TEXT;
    RAISE NOTICE 'Added override_type column to ota_audit_log';
  ELSE
    RAISE NOTICE 'Column override_type already exists on ota_audit_log';
  END IF;
END$$;

-- ============================================================
-- STEP 3: Add performed_via column with DEFAULT 'TRIGGER' (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_audit_log' 
    AND column_name = 'performed_via'
  ) THEN
    ALTER TABLE public.ota_audit_log ADD COLUMN performed_via TEXT NOT NULL DEFAULT 'TRIGGER';
    RAISE NOTICE 'Added performed_via column to ota_audit_log with DEFAULT TRIGGER';
  ELSE
    RAISE NOTICE 'Column performed_via already exists on ota_audit_log';
  END IF;
END$$;

-- ============================================================
-- STEP 4: Add indexes for filtering (idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ota_audit_log_override_type 
ON public.ota_audit_log(override_type) 
WHERE override_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ota_audit_log_performed_via 
ON public.ota_audit_log(performed_via);

-- ============================================================
-- VERIFY
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_audit_log' 
    AND column_name = 'performed_via'
  ) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: performed_via column not added';
  ELSE
    RAISE NOTICE 'VERIFICATION PASSED: ota_audit_log extended for override tracking';
  END IF;
END$$;
