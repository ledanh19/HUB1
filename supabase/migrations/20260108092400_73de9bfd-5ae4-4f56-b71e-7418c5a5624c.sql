-- ============================================================
-- OTA OPERATIONS MODULE - 022: PROJECT IO RPC FUNCTIONS
-- ============================================================

-- FUNCTION: ota_get_project_io
CREATE OR REPLACE FUNCTION public.ota_get_project_io(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_inputs RECORD;
  v_latest_output RECORD;
  v_outputs_list JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED'); END IF;
  IF NOT has_ota_project_access(p_project_id) THEN RETURN jsonb_build_object('success', false, 'error', 'ACCESS_DENIED'); END IF;
  
  SELECT * INTO v_inputs FROM ota_project_inputs WHERE project_id = p_project_id;
  SELECT * INTO v_latest_output FROM ota_project_outputs WHERE project_id = p_project_id ORDER BY version DESC LIMIT 1;
  
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'version', o.version, 'status', o.status, 'created_at', o.created_at,
    'created_by', o.created_by, 'submitted_at', o.submitted_at, 'submitted_by', o.submitted_by,
    'reviewed_at', o.reviewed_at, 'reviewed_by', o.reviewed_by, 'review_reason', o.review_reason
  ) ORDER BY o.version DESC), '[]'::jsonb) INTO v_outputs_list
  FROM ota_project_outputs o WHERE o.project_id = p_project_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'inputs', CASE WHEN v_inputs.id IS NOT NULL THEN jsonb_build_object(
      'id', v_inputs.id, 'project_id', v_inputs.project_id, 'data', v_inputs.data,
      'schema_version', v_inputs.schema_version, 'updated_at', v_inputs.updated_at,
      'updated_by', v_inputs.updated_by, 'created_at', v_inputs.created_at, 'created_by', v_inputs.created_by
    ) ELSE NULL END,
    'latest_output', CASE WHEN v_latest_output.id IS NOT NULL THEN jsonb_build_object(
      'id', v_latest_output.id, 'project_id', v_latest_output.project_id, 'version', v_latest_output.version,
      'status', v_latest_output.status, 'data', v_latest_output.data, 'schema_version', v_latest_output.schema_version,
      'submitted_at', v_latest_output.submitted_at, 'submitted_by', v_latest_output.submitted_by,
      'reviewed_at', v_latest_output.reviewed_at, 'reviewed_by', v_latest_output.reviewed_by,
      'review_reason', v_latest_output.review_reason, 'created_at', v_latest_output.created_at, 'created_by', v_latest_output.created_by
    ) ELSE NULL END,
    'outputs_list', v_outputs_list
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ota_get_project_io(UUID) TO authenticated;

-- FUNCTION: ota_upsert_project_inputs
CREATE OR REPLACE FUNCTION public.ota_upsert_project_inputs(
  p_project_id UUID, p_data JSONB, p_expected_updated_at TIMESTAMPTZ DEFAULT NULL, p_schema_version INT DEFAULT 1
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_existing RECORD; v_new_id UUID; v_old_data JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED'); END IF;
  IF NOT has_ota_project_access(p_project_id) THEN RETURN jsonb_build_object('success', false, 'error', 'ACCESS_DENIED'); END IF;
  
  SELECT * INTO v_existing FROM ota_project_inputs WHERE project_id = p_project_id FOR UPDATE;
  
  IF v_existing.id IS NOT NULL THEN
    IF p_expected_updated_at IS NOT NULL AND v_existing.updated_at != p_expected_updated_at THEN
      RETURN jsonb_build_object('success', false, 'error', 'CONFLICT_INPUTS_UPDATED',
        'message', 'Dữ liệu đã được cập nhật bởi người khác. Vui lòng reload.', 'current_updated_at', v_existing.updated_at);
    END IF;
    v_old_data := v_existing.data;
    UPDATE ota_project_inputs SET data = p_data, schema_version = p_schema_version, updated_at = NOW(), updated_by = v_user_id
    WHERE id = v_existing.id RETURNING id INTO v_new_id;
    INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, old_data, new_data, performed_by, performed_via)
    VALUES ('UPDATE_PROJECT_INPUTS', 'PROJECT_INPUT', v_new_id, p_project_id, jsonb_build_object('data', v_old_data), jsonb_build_object('data', p_data), v_user_id, 'RPC');
  ELSE
    INSERT INTO ota_project_inputs (project_id, data, schema_version, created_by, updated_by)
    VALUES (p_project_id, p_data, p_schema_version, v_user_id, v_user_id) RETURNING id INTO v_new_id;
    INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, old_data, new_data, performed_by, performed_via)
    VALUES ('CREATE_PROJECT_INPUTS', 'PROJECT_INPUT', v_new_id, p_project_id, NULL, jsonb_build_object('data', p_data), v_user_id, 'RPC');
  END IF;
  RETURN jsonb_build_object('success', true, 'id', v_new_id, 'updated_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.ota_upsert_project_inputs(UUID, JSONB, TIMESTAMPTZ, INT) TO authenticated;

-- FUNCTION: ota_update_output_draft
CREATE OR REPLACE FUNCTION public.ota_update_output_draft(p_output_id UUID, p_data JSONB, p_schema_version INT DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_output RECORD; v_is_admin BOOLEAN; v_old_data JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED'); END IF;
  SELECT * INTO v_output FROM ota_project_outputs WHERE id = p_output_id FOR UPDATE;
  IF v_output.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'OUTPUT_NOT_FOUND'); END IF;
  IF NOT has_ota_project_access(v_output.project_id) THEN RETURN jsonb_build_object('success', false, 'error', 'ACCESS_DENIED'); END IF;
  IF v_output.status != 'DRAFT' THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Chỉ có thể chỉnh sửa output ở trạng thái DRAFT'); END IF;
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')) INTO v_is_admin;
  IF v_output.created_by != v_user_id AND NOT v_is_admin THEN RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED', 'message', 'Chỉ người tạo hoặc admin có thể chỉnh sửa'); END IF;
  v_old_data := v_output.data;
  UPDATE ota_project_outputs SET data = p_data, schema_version = p_schema_version WHERE id = p_output_id;
  INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, old_data, new_data, performed_by, performed_via)
  VALUES ('UPDATE_OUTPUT_DRAFT', 'PROJECT_OUTPUT', p_output_id, v_output.project_id, jsonb_build_object('data', v_old_data), jsonb_build_object('data', p_data), v_user_id, 'RPC');
  RETURN jsonb_build_object('success', true, 'id', p_output_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ota_update_output_draft(UUID, JSONB, INT) TO authenticated;

-- FUNCTION: ota_submit_output
CREATE OR REPLACE FUNCTION public.ota_submit_output(p_output_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_output RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED'); END IF;
  SELECT * INTO v_output FROM ota_project_outputs WHERE id = p_output_id FOR UPDATE;
  IF v_output.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'OUTPUT_NOT_FOUND'); END IF;
  IF NOT has_ota_project_access(v_output.project_id) THEN RETURN jsonb_build_object('success', false, 'error', 'ACCESS_DENIED'); END IF;
  IF v_output.status != 'DRAFT' THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Chỉ có thể submit output ở trạng thái DRAFT'); END IF;
  UPDATE ota_project_outputs SET status = 'SUBMITTED', submitted_at = NOW(), submitted_by = v_user_id WHERE id = p_output_id;
  INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, old_data, new_data, performed_by, performed_via)
  VALUES ('SUBMIT_OUTPUT', 'PROJECT_OUTPUT', p_output_id, v_output.project_id, jsonb_build_object('status', 'DRAFT'), jsonb_build_object('status', 'SUBMITTED'), v_user_id, 'RPC');
  RETURN jsonb_build_object('success', true, 'id', p_output_id, 'status', 'SUBMITTED', 'submitted_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.ota_submit_output(UUID) TO authenticated;

-- FUNCTION: ota_review_output
CREATE OR REPLACE FUNCTION public.ota_review_output(p_output_id UUID, p_decision TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID; v_output RECORD; v_is_reviewer BOOLEAN; v_new_status TEXT; v_reason TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'AUTH_REQUIRED'); END IF;
  IF p_decision NOT IN ('APPROVE', 'REJECT') THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_DECISION', 'message', 'Decision must be APPROVE or REJECT'); END IF;
  v_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_reason) < 5 THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_REASON', 'message', 'Reason must be at least 5 characters'); END IF;
  SELECT * INTO v_output FROM ota_project_outputs WHERE id = p_output_id FOR UPDATE;
  IF v_output.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'OUTPUT_NOT_FOUND'); END IF;
  IF NOT has_ota_project_access(v_output.project_id) THEN RETURN jsonb_build_object('success', false, 'error', 'ACCESS_DENIED'); END IF;
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('ota_lead', 'admin', 'super_admin')) INTO v_is_reviewer;
  IF NOT v_is_reviewer THEN
    SELECT EXISTS (SELECT 1 FROM ota_project_members WHERE project_id = v_output.project_id AND user_id = v_user_id AND role IN ('LEAD', 'ADMIN')) INTO v_is_reviewer;
  END IF;
  IF NOT v_is_reviewer THEN RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED', 'message', 'Chỉ Lead/Admin có thể review output'); END IF;
  IF v_output.status != 'SUBMITTED' THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Chỉ có thể review output ở trạng thái SUBMITTED'); END IF;
  v_new_status := CASE p_decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' END;
  UPDATE ota_project_outputs SET status = v_new_status::ota_output_status, reviewed_at = NOW(), reviewed_by = v_user_id, review_reason = v_reason WHERE id = p_output_id;
  INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, old_data, new_data, performed_by, performed_via, reason)
  VALUES ('REVIEW_OUTPUT', 'PROJECT_OUTPUT', p_output_id, v_output.project_id, jsonb_build_object('status', 'SUBMITTED'), jsonb_build_object('status', v_new_status, 'decision', p_decision), v_user_id, 'RPC', v_reason);
  RETURN jsonb_build_object('success', true, 'id', p_output_id, 'status', v_new_status, 'reviewed_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.ota_review_output(UUID, TEXT, TEXT) TO authenticated;