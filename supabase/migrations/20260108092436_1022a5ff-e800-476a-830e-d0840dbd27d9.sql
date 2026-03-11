-- ============================================================
-- OTA OPERATIONS MODULE - 023: CREATE DRAFT WITH RACE-CONDITION FIX
-- ============================================================

CREATE OR REPLACE FUNCTION public.ota_create_output_draft(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_new_version INT; v_new_id UUID; v_lock_key BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED'); END IF;
  IF NOT has_ota_project_access(p_project_id) THEN RETURN jsonb_build_object('success', false, 'error', 'ACCESS_DENIED'); END IF;
  
  -- Advisory lock to prevent race condition
  v_lock_key := ('x' || substr(p_project_id::text, 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);
  
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_new_version FROM ota_project_outputs WHERE project_id = p_project_id;
  
  BEGIN
    INSERT INTO ota_project_outputs (project_id, version, status, data, created_by)
    VALUES (p_project_id, v_new_version, 'DRAFT', '{}'::jsonb, v_user_id) RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'VERSION_CONFLICT', 'message', 'Phiên bản bị trùng, vui lòng thử lại');
  END;
  
  INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, old_data, new_data, performed_by, performed_via)
  VALUES ('CREATE_OUTPUT_DRAFT', 'PROJECT_OUTPUT', v_new_id, p_project_id, NULL, jsonb_build_object('version', v_new_version, 'status', 'DRAFT'), v_user_id, 'RPC');
  
  RETURN jsonb_build_object('success', true, 'id', v_new_id, 'version', v_new_version, 'status', 'DRAFT');
END;
$$;

GRANT EXECUTE ON FUNCTION public.ota_create_output_draft(UUID) TO authenticated;