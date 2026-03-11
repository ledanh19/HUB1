-- ============================================================
-- OTA OPERATIONS MODULE - 024: DONE STATUS GUARD
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Enforce rule that tasks cannot be set to DONE unless
--          they have at least one APPROVED evidence
-- 
-- Design:
--   - Replace ota_update_task_status RPC with evidence check
--   - Add trigger as backup for direct table updates
--   - Provides clear error message for missing evidence
-- ============================================================

-- ============================================================
-- HELPER FUNCTION: Check if task has approved evidence
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_task_has_approved_evidence(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM ota_task_evidence
    WHERE task_id = p_task_id
    AND review_status = 'APPROVED'
  );
$$;

-- ============================================================
-- UPDATED RPC: ota_update_task_status
-- Now includes DONE guard check
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
  v_project_role ota_project_role;
  v_approved_count INT;
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
  -- DONE GUARD: Require at least 1 approved evidence
  -- ============================================================
  IF UPPER(p_new_status) = 'DONE' THEN
    SELECT COUNT(*) INTO v_approved_count
    FROM ota_task_evidence
    WHERE task_id = p_task_id
    AND review_status = 'APPROVED';
    
    IF v_approved_count = 0 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'EVIDENCE_REQUIRED',
        'message', 'Task cannot be marked DONE without at least 1 approved evidence. Please submit and get evidence approved first.',
        'approved_count', v_approved_count
      );
    END IF;
  END IF;
  
  -- Update task with timestamps
  UPDATE ota_tasks
  SET 
    status = p_new_status::ota_task_status,
    actual_hours = COALESCE(p_actual_hours, actual_hours),
    completed_at = CASE 
      WHEN UPPER(p_new_status) = 'DONE' THEN now() 
      ELSE completed_at 
    END,
    started_at = CASE 
      WHEN UPPER(p_new_status) = 'IN_PROGRESS' AND started_at IS NULL THEN now() 
      ELSE started_at 
    END,
    updated_at = now(),
    updated_by = v_user_id
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

-- ============================================================
-- TRIGGER: Backup guard for direct table updates
-- Prevents DONE status without approved evidence
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_ota_task_done_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_approved_count INT;
BEGIN
  -- Only check when status is changing TO DONE
  IF NEW.status = 'DONE' AND (OLD.status IS NULL OR OLD.status != 'DONE') THEN
    SELECT COUNT(*) INTO v_approved_count
    FROM ota_task_evidence
    WHERE task_id = NEW.id
    AND review_status = 'APPROVED';
    
    IF v_approved_count = 0 THEN
      RAISE EXCEPTION 'DONE_GUARD_VIOLATION: Task cannot be marked DONE without at least 1 approved evidence. Approved count: %', v_approved_count
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS tr_ota_task_done_guard ON public.ota_tasks;

-- Create trigger
CREATE TRIGGER tr_ota_task_done_guard
  BEFORE UPDATE ON public.ota_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'DONE')
  EXECUTE FUNCTION public.enforce_ota_task_done_guard();

-- ============================================================
-- COMMENT: Document the DONE guard rule
-- ============================================================
COMMENT ON FUNCTION public.ota_task_has_approved_evidence IS 
  'Returns TRUE if task has at least one evidence with APPROVED review_status';

COMMENT ON FUNCTION public.enforce_ota_task_done_guard IS 
  'Trigger function that prevents tasks from being set to DONE without approved evidence';

COMMENT ON TRIGGER tr_ota_task_done_guard ON public.ota_tasks IS
  'Enforces rule: Task cannot be DONE unless >=1 evidence is APPROVED';
