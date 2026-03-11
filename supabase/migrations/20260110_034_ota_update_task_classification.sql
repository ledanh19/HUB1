-- ============================================================
-- OTA OPERATIONS MODULE - 034: UPDATE TASK CLASSIFICATION RPC
-- ============================================================
-- Date: 2026-01-10
-- Purpose: Allow changing task classification with proper audit
-- 
-- This enables users to:
-- 1. Change classification from EXECUTION to OPS/PREP/AUTO when EVIDENCE_REQUIRED
-- 2. Only for Quick Tasks (is_quick_task = true)
-- 3. With proper audit logging
-- ============================================================

-- Drop if exists for idempotency
DROP FUNCTION IF EXISTS public.ota_update_task_classification(UUID, TEXT, TEXT) CASCADE;

-- ============================================================
-- RPC: ota_update_task_classification
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_update_task_classification(
  p_task_id UUID,
  p_new_classification TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_is_lead BOOLEAN;
  v_old_classification TEXT;
  v_new_require_evidence BOOLEAN;
  v_new_min_evidence INT;
BEGIN
  v_user_id := auth.uid();
  
  -- Auth check
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;
  
  -- OTA role check
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can update task classification'
    );
  END IF;
  
  -- Validate classification value
  IF p_new_classification NOT IN ('EXECUTION', 'PREP', 'AUTO', 'OPS') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_CLASSIFICATION',
      'message', 'Classification must be EXECUTION, PREP, AUTO, or OPS'
    );
  END IF;
  
  -- Fetch task
  SELECT * INTO v_task
  FROM ota_tasks
  WHERE id = p_task_id
  FOR UPDATE;
  
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
  
  -- Cannot change classification if task is already DONE or CANCELLED
  IF v_task.status IN ('DONE', 'CANCELLED') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'Cannot change classification of completed or cancelled task'
    );
  END IF;
  
  -- Check if user is lead/admin or task owner
  v_is_lead := is_ota_lead_or_admin();
  
  -- Staff can only change their own assigned tasks
  IF NOT v_is_lead AND v_task.assignee_id != v_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'NOT_ASSIGNEE',
      'message', 'Staff can only update their own assigned tasks'
    );
  END IF;
  
  -- Store old value for audit
  v_old_classification := v_task.classification;
  
  -- No change needed
  IF v_old_classification = p_new_classification THEN
    RETURN json_build_object(
      'success', true,
      'task_id', p_task_id,
      'classification', p_new_classification,
      'message', 'No change needed'
    );
  END IF;
  
  -- Determine new evidence requirements based on classification
  IF p_new_classification = 'EXECUTION' THEN
    v_new_require_evidence := true;
    v_new_min_evidence := GREATEST(COALESCE(v_task.min_evidence_count, 1), 1);
  ELSE
    v_new_require_evidence := false;
    v_new_min_evidence := 0;
  END IF;
  
  -- Update task
  UPDATE ota_tasks
  SET 
    classification = p_new_classification::ota_task_classification,
    require_evidence = v_new_require_evidence,
    min_evidence_count = v_new_min_evidence,
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = p_task_id;
  
  -- Audit log
  INSERT INTO ota_audit_log (
    action,
    entity_type,
    entity_id,
    project_id,
    old_data,
    new_data,
    performed_by,
    performed_via,
    reason
  ) VALUES (
    'TASK_CLASSIFICATION_CHANGED',
    'TASK',
    p_task_id,
    v_task.project_id,
    jsonb_build_object(
      'classification', v_old_classification,
      'require_evidence', v_task.require_evidence,
      'min_evidence_count', v_task.min_evidence_count
    ),
    jsonb_build_object(
      'classification', p_new_classification,
      'require_evidence', v_new_require_evidence,
      'min_evidence_count', v_new_min_evidence
    ),
    v_user_id,
    'RPC',
    COALESCE(p_reason, 'Classification changed by user')
  );
  
  RETURN json_build_object(
    'success', true,
    'task_id', p_task_id,
    'old_classification', v_old_classification,
    'new_classification', p_new_classification,
    'require_evidence', v_new_require_evidence,
    'min_evidence_count', v_new_min_evidence,
    'message', 'Classification updated successfully'
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

-- Grant permission
REVOKE ALL ON FUNCTION public.ota_update_task_classification(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_task_classification(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.ota_update_task_classification IS 
'Update task classification with audit logging.
Changes require_evidence and min_evidence_count based on new classification.
EXECUTION: require_evidence=true, min_evidence_count>=1
PREP/AUTO/OPS: require_evidence=false, min_evidence_count=0';

-- ============================================================
-- VERIFY
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 034_ota_update_task_classification completed successfully';
END$$;
