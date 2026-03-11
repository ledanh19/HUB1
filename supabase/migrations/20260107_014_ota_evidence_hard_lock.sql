-- ============================================================
-- OTA OPERATIONS MODULE - 014: EVIDENCE HARD LOCK
-- ============================================================
-- Date: 2026-01-07
-- Updated: 2026-01-08
-- Purpose: Enforce that tasks cannot be marked DONE without approved evidence
-- 
-- CRITICAL RULE:
--   Task status = DONE requires ≥1 evidence with review_status = APPROVED
-- ============================================================

-- ============================================================
-- Replace ota_update_task_status with evidence validation
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_update_task_status(
  p_task_id UUID,
  p_new_status TEXT,
  p_actual_hours NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_user_id UUID;
  v_project_role TEXT;
  v_approved_evidence_count INT;
BEGIN
  v_user_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can update tasks'
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
  
  -- Get user's project role
  v_project_role := get_ota_project_role(v_task.project_id);
  
  -- Staff can only update their own assigned tasks
  IF v_project_role = 'STAFF' AND v_task.assignee_id != v_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'NOT_ASSIGNEE',
      'message', 'Staff can only update their own assigned tasks'
    );
  END IF;
  
  -- Validate status transition
  IF v_task.status = 'CANCELLED' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_TRANSITION',
      'message', 'Cannot change status of cancelled task'
    );
  END IF;
  
  -- ============================================================
  -- HARD LOCK: DONE requires approved evidence
  -- ============================================================
  IF p_new_status = 'DONE' THEN
    SELECT COUNT(*) INTO v_approved_evidence_count
    FROM ota_task_evidence
    WHERE task_id = p_task_id
    AND review_status = 'APPROVED';
    
    IF v_approved_evidence_count = 0 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'EVIDENCE_REQUIRED',
        'message', 'Task cannot be marked as DONE without at least one approved evidence. Please submit and get evidence approved first.'
      );
    END IF;
  END IF;
  
  -- Update task
  UPDATE ota_tasks
  SET 
    status = p_new_status::ota_task_status,
    actual_hours = COALESCE(p_actual_hours, actual_hours),
    started_at = CASE 
      WHEN p_new_status = 'IN_PROGRESS' AND started_at IS NULL THEN now() 
      ELSE started_at 
    END,
    completed_at = CASE 
      WHEN p_new_status = 'DONE' THEN now() 
      ELSE completed_at 
    END
  WHERE id = p_task_id;
  
  RETURN json_build_object(
    'success', true,
    'task_id', p_task_id,
    'old_status', v_task.status,
    'new_status', p_new_status,
    'message', 'Task status updated successfully'
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

-- Ensure permissions are correct
REVOKE ALL ON FUNCTION public.ota_update_task_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_task_status TO authenticated;

COMMENT ON FUNCTION public.ota_update_task_status(UUID, TEXT, NUMERIC) IS 
'Update task status with HARD LOCK: DONE status requires ≥1 approved evidence.
Staff can only update their own assigned tasks.';
