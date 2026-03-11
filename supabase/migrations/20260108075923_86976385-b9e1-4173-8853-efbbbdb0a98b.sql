-- ============================================================
-- Migration 019: Audit Log Override Extension
-- ============================================================

-- Add override-related columns to audit_logs if not exist
DO $$
BEGIN
  -- Add is_override column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'audit_logs' 
    AND column_name = 'is_override'
  ) THEN
    ALTER TABLE public.audit_logs 
    ADD COLUMN is_override BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add override_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'audit_logs' 
    AND column_name = 'override_reason'
  ) THEN
    ALTER TABLE public.audit_logs 
    ADD COLUMN override_reason TEXT;
  END IF;
END$$;

-- Add comments
COMMENT ON COLUMN public.audit_logs.is_override IS 'Whether this action was a super admin override';
COMMENT ON COLUMN public.audit_logs.override_reason IS 'Reason for super admin override';