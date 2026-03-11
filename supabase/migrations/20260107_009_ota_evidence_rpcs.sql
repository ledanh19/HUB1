-- ============================================================
-- OTA OPERATIONS MODULE - 009: EVIDENCE APPROVAL RPCs
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Evidence submission and review operations
-- 
-- Design:
--   - Submit evidence: Any OTA role with project access
--   - Review evidence: Only Lead/Admin
--   - Content immutable after submission (enforced by trigger)
-- ============================================================

-- ============================================================
-- RPC: ota_submit_evidence
-- Submits evidence for a task
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_submit_evidence(
  p_task_id UUID,
  p_evidence_type TEXT,
  p_file_url TEXT DEFAULT NULL,
  p_file_name TEXT DEFAULT NULL,
  p_file_size_bytes BIGINT DEFAULT NULL,
  p_mime_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evidence_id UUID;
  v_task RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can submit evidence'
    );
  END IF;
  
  -- Get task info
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'TASK_NOT_FOUND',
      'message', 'Task does not exist'
    );
  END IF;
  
  -- Check project access
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this project'
    );
  END IF;
  
  -- Validate: NOTE type should not have file_url
  IF p_evidence_type = 'NOTE' AND p_file_url IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_EVIDENCE',
      'message', 'NOTE type evidence should not have file_url'
    );
  END IF;
  
  -- Validate: Non-NOTE type must have file_url
  IF p_evidence_type != 'NOTE' AND p_file_url IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_EVIDENCE',
      'message', 'File evidence must have file_url'
    );
  END IF;
  
  -- Insert evidence
  INSERT INTO ota_task_evidence (
    task_id,
    evidence_type,
    file_url,
    file_name,
    file_size_bytes,
    mime_type,
    description,
    created_by
  ) VALUES (
    p_task_id,
    p_evidence_type::ota_evidence_type,
    p_file_url,
    p_file_name,
    p_file_size_bytes,
    p_mime_type,
    p_description,
    v_user_id
  )
  RETURNING id INTO v_evidence_id;
  
  RETURN json_build_object(
    'success', true,
    'evidence_id', v_evidence_id,
    'message', 'Evidence submitted successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_submit_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_submit_evidence TO authenticated;

-- ============================================================
-- RPC: ota_review_evidence
-- Reviews evidence (approve/reject/needs_revision)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_review_evidence(
  p_evidence_id UUID,
  p_review_status TEXT,
  p_review_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evidence RECORD;
  v_task RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Only Lead/Admin can review evidence
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead or Admin can review evidence'
    );
  END IF;
  
  -- Get evidence info
  SELECT * INTO v_evidence FROM ota_task_evidence WHERE id = p_evidence_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'EVIDENCE_NOT_FOUND',
      'message', 'Evidence does not exist'
    );
  END IF;
  
  -- Get task info for project check
  SELECT * INTO v_task FROM ota_tasks WHERE id = v_evidence.task_id;
  
  -- Check project access
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this project'
    );
  END IF;
  
  -- Validate review status
  IF p_review_status NOT IN ('APPROVED', 'REJECTED', 'NEEDS_REVISION') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'Review status must be APPROVED, REJECTED, or NEEDS_REVISION'
    );
  END IF;
  
  -- Cannot review own evidence
  IF v_evidence.created_by = v_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'SELF_REVIEW',
      'message', 'Cannot review your own evidence'
    );
  END IF;
  
  -- Update evidence review fields
  UPDATE ota_task_evidence
  SET 
    review_status = p_review_status::ota_evidence_review_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    review_notes = p_review_notes
  WHERE id = p_evidence_id;
  
  RETURN json_build_object(
    'success', true,
    'evidence_id', p_evidence_id,
    'old_status', v_evidence.review_status,
    'new_status', p_review_status,
    'message', 'Evidence reviewed successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_review_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_review_evidence TO authenticated;

-- ============================================================
-- RPC: ota_get_task_evidence
-- Gets all evidence for a task
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_task_evidence(
  p_task_id UUID,
  p_review_status TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_result JSON;
BEGIN
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can view evidence'
    );
  END IF;
  
  -- Get task info
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'TASK_NOT_FOUND',
      'message', 'Task does not exist'
    );
  END IF;
  
  -- Check project access
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this project'
    );
  END IF;
  
  SELECT json_agg(row_to_json(e))
  INTO v_result
  FROM (
    SELECT 
      e.id,
      e.evidence_type,
      e.file_url,
      e.file_name,
      e.file_size_bytes,
      e.mime_type,
      e.description,
      e.review_status,
      e.reviewed_at,
      e.review_notes,
      e.created_at,
      u.email as created_by_email,
      r.email as reviewed_by_email
    FROM ota_task_evidence e
    LEFT JOIN auth.users u ON u.id = e.created_by
    LEFT JOIN auth.users r ON r.id = e.reviewed_by
    WHERE e.task_id = p_task_id
    AND (p_review_status IS NULL OR e.review_status = p_review_status::ota_evidence_review_status)
    ORDER BY e.created_at DESC
  ) e;
  
  RETURN json_build_object(
    'success', true,
    'task_id', p_task_id,
    'evidence', COALESCE(v_result, '[]'::json)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_task_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_task_evidence TO authenticated;

-- ============================================================
-- RPC: ota_get_pending_reviews
-- Gets all evidence pending review (for Lead/Admin dashboard)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_pending_reviews(
  p_project_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Only Lead/Admin can view pending reviews
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead or Admin can view pending reviews'
    );
  END IF;
  
  SELECT json_agg(row_to_json(e))
  INTO v_result
  FROM (
    SELECT 
      e.id as evidence_id,
      e.evidence_type,
      e.file_url,
      e.file_name,
      e.description,
      e.created_at,
      t.id as task_id,
      t.title as task_title,
      p.id as project_id,
      p.name as project_name,
      pm.name as property_name,
      u.email as submitted_by
    FROM ota_task_evidence e
    JOIN ota_tasks t ON t.id = e.task_id
    JOIN ota_projects p ON p.id = t.project_id
    JOIN properties_mirror pm ON pm.id = p.property_id
    LEFT JOIN auth.users u ON u.id = e.created_by
    WHERE e.review_status = 'PENDING'
    AND has_ota_project_access(p.id)
    AND (p_project_id IS NULL OR p.id = p_project_id)
    ORDER BY e.created_at ASC  -- FIFO review
  ) e;
  
  RETURN json_build_object(
    'success', true,
    'pending_reviews', COALESCE(v_result, '[]'::json)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_pending_reviews FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_pending_reviews TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON FUNCTION public.ota_submit_evidence IS 
'RPC to submit evidence for a task. Content becomes immutable after submission.';

COMMENT ON FUNCTION public.ota_review_evidence IS 
'RPC to review evidence. Only Lead/Admin can use. Cannot review own evidence.';

COMMENT ON FUNCTION public.ota_get_task_evidence IS 
'RPC to get all evidence for a task with optional status filtering.';

COMMENT ON FUNCTION public.ota_get_pending_reviews IS 
'RPC to get all pending evidence reviews across accessible projects.';
