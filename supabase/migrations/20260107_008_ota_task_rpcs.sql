-- ============================================================
-- OTA OPERATIONS MODULE - 008: TASK LIFECYCLE RPCs
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Task management operations via RPC
-- 
-- Design:
--   All RPCs use SECURITY DEFINER pattern for controlled access
--   Internal authorization checks within function body
--   Returns JSON for consistent API response format
-- ============================================================

-- ============================================================
-- RPC: ota_create_task
-- Creates a new task in a project
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_create_task(
  p_project_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_priority TEXT DEFAULT 'MEDIUM',
  p_due_date DATE DEFAULT NULL,
  p_estimated_hours NUMERIC DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can create tasks'
    );
  END IF;
  
  -- Check project access
  IF NOT has_ota_project_access(p_project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this project'
    );
  END IF;
  
  -- Validate assignee is project member (if specified)
  IF p_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM ota_project_members
      WHERE project_id = p_project_id
      AND user_id = p_assignee_id
      AND is_active = true
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'INVALID_ASSIGNEE',
        'message', 'Assignee is not an active member of this project'
      );
    END IF;
  END IF;
  
  -- Create task
  INSERT INTO ota_tasks (
    project_id,
    title,
    description,
    assignee_id,
    assigned_at,
    assigned_by,
    priority,
    due_date,
    estimated_hours,
    tags,
    created_by,
    updated_by
  ) VALUES (
    p_project_id,
    p_title,
    p_description,
    p_assignee_id,
    CASE WHEN p_assignee_id IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN p_assignee_id IS NOT NULL THEN v_user_id ELSE NULL END,
    p_priority::ota_task_priority,
    p_due_date,
    p_estimated_hours,
    p_tags,
    v_user_id,
    v_user_id
  )
  RETURNING id INTO v_task_id;
  
  RETURN json_build_object(
    'success', true,
    'task_id', v_task_id,
    'message', 'Task created successfully'
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

-- Security: REVOKE all, GRANT to authenticated
REVOKE ALL ON FUNCTION public.ota_create_task FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_create_task TO authenticated;

-- ============================================================
-- RPC: ota_update_task_status
-- Transitions task status with validation
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
  
  -- Update task
  UPDATE ota_tasks
  SET 
    status = p_new_status::ota_task_status,
    actual_hours = COALESCE(p_actual_hours, actual_hours)
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

REVOKE ALL ON FUNCTION public.ota_update_task_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_task_status TO authenticated;

-- ============================================================
-- RPC: ota_assign_task
-- Assigns or reassigns task to a project member
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_assign_task(
  p_task_id UUID,
  p_assignee_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Only Lead/Admin can assign tasks
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead or Admin can assign tasks'
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
  
  -- Validate assignee is project member
  IF p_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM ota_project_members
      WHERE project_id = v_task.project_id
      AND user_id = p_assignee_id
      AND is_active = true
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'INVALID_ASSIGNEE',
        'message', 'Assignee is not an active member of this project'
      );
    END IF;
  END IF;
  
  -- Update assignment
  UPDATE ota_tasks
  SET 
    assignee_id = p_assignee_id,
    assigned_at = CASE WHEN p_assignee_id IS NOT NULL THEN now() ELSE NULL END,
    assigned_by = CASE WHEN p_assignee_id IS NOT NULL THEN v_user_id ELSE NULL END
  WHERE id = p_task_id;
  
  RETURN json_build_object(
    'success', true,
    'task_id', p_task_id,
    'assignee_id', p_assignee_id,
    'message', 'Task assigned successfully'
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

REVOKE ALL ON FUNCTION public.ota_assign_task FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_assign_task TO authenticated;

-- ============================================================
-- RPC: ota_get_my_tasks
-- Gets tasks assigned to current user
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_my_tasks(
  p_status TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access tasks'
    );
  END IF;
  
  SELECT json_agg(row_to_json(t))
  INTO v_result
  FROM (
    SELECT 
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.due_date,
      t.started_at,
      t.completed_at,
      t.estimated_hours,
      t.actual_hours,
      t.tags,
      t.created_at,
      p.id as project_id,
      p.name as project_name,
      pm.name as property_name
    FROM ota_tasks t
    JOIN ota_projects p ON p.id = t.project_id
    JOIN properties_mirror pm ON pm.id = p.property_id
    WHERE t.assignee_id = v_user_id
    AND has_ota_project_access(t.project_id)
    AND (p_status IS NULL OR t.status = p_status::ota_task_status)
    AND (p_project_id IS NULL OR t.project_id = p_project_id)
    ORDER BY 
      CASE t.priority 
        WHEN 'URGENT' THEN 1 
        WHEN 'HIGH' THEN 2 
        WHEN 'MEDIUM' THEN 3 
        WHEN 'LOW' THEN 4 
      END,
      t.due_date NULLS LAST,
      t.created_at DESC
  ) t;
  
  RETURN json_build_object(
    'success', true,
    'tasks', COALESCE(v_result, '[]'::json)
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

REVOKE ALL ON FUNCTION public.ota_get_my_tasks FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_my_tasks TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON FUNCTION public.ota_create_task IS 
'RPC to create a new task in a project. Validates OTA role and project access.';

COMMENT ON FUNCTION public.ota_update_task_status IS 
'RPC to update task status. Staff can only update own tasks, Lead/Admin can update any.';

COMMENT ON FUNCTION public.ota_assign_task IS 
'RPC to assign/reassign task. Only Lead/Admin can use this.';

COMMENT ON FUNCTION public.ota_get_my_tasks IS 
'RPC to get tasks assigned to current user with optional filtering.';
