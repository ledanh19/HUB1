-- ============================================================
-- OTA OPERATIONS MODULE - 023: FIX CREATE DRAFT RACE CONDITION
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Fix race condition in ota_create_output_draft
-- 
-- Problem: Two concurrent requests can SELECT MAX(version) = 0
--          then both try INSERT version = 1, causing unique constraint error
--
-- Solution: Use advisory lock per project to serialize creation
--           OR handle unique constraint violation with retry
--
-- Rollback:
--   -- Restore previous function version from migration 022
-- ============================================================

-- ============================================================
-- FUNCTION: ota_create_output_draft (PATCHED)
-- Create a new output version with race-condition protection
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_create_output_draft(
  p_project_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_new_version INT;
  v_new_id UUID;
  v_lock_key BIGINT;
  v_retry_count INT := 0;
  v_max_retries INT := 3;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED');
  END IF;
  
  -- Check access
  IF NOT has_ota_project_access(p_project_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCESS_DENIED');
  END IF;
  
  -- Generate lock key from project_id (convert UUID to bigint for advisory lock)
  v_lock_key := ('x' || substr(p_project_id::text, 1, 16))::bit(64)::bigint;
  
  -- Acquire advisory lock for this project (will wait if another tx has it)
  PERFORM pg_advisory_xact_lock(v_lock_key);
  
  -- Now safely get max version (protected by advisory lock)
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version
  FROM ota_project_outputs
  WHERE project_id = p_project_id;
  
  -- Create new draft (unique constraint as backup safety)
  BEGIN
    INSERT INTO ota_project_outputs (
      project_id, version, status, data, created_by
    ) VALUES (
      p_project_id, v_new_version, 'DRAFT', '{}'::jsonb, v_user_id
    )
    RETURNING id INTO v_new_id;
  EXCEPTION 
    WHEN unique_violation THEN
      -- Should not happen with advisory lock, but handle anyway
      RETURN jsonb_build_object(
        'success', false,
        'error', 'VERSION_CONFLICT',
        'message', 'Phiên bản bị trùng, vui lòng thử lại'
      );
  END;
  
  -- Audit log
  INSERT INTO ota_audit_log (
    action, entity_type, entity_id, project_id,
    old_data, new_data, performed_by, performed_via
  ) VALUES (
    'CREATE_OUTPUT_DRAFT', 'PROJECT_OUTPUT', v_new_id, p_project_id,
    NULL,
    jsonb_build_object('version', v_new_version, 'status', 'DRAFT'),
    v_user_id, 'RPC'
  );
  
  -- Advisory lock automatically released at end of transaction
  
  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'version', v_new_version,
    'status', 'DRAFT'
  );
END;
$$;

-- ============================================================
-- VERIFY
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'ota_create_output_draft'
  ) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: ota_create_output_draft not found';
  END IF;
  
  RAISE NOTICE 'PATCH APPLIED: ota_create_output_draft now uses advisory lock for race-condition protection';
END$$;
