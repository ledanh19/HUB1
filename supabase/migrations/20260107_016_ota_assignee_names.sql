-- ============================================================
-- OTA OPERATIONS MODULE - 016: ASSIGNEE DISPLAY NAMES
-- ============================================================
-- Date: 2026-01-07
-- Updated: 2026-01-08
-- Purpose: RPC to fetch tasks with assignee display names
-- Phase C: Show assignee names in task list
-- ============================================================

-- ============================================================
-- RPC: ota_get_tasks_with_assignees
-- Returns tasks with joined assignee info
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_tasks_with_assignees(
  p_project_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tasks JSON;
  v_is_lead BOOLEAN;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access tasks'
    );
  END IF;
  
  v_is_lead := is_ota_lead_or_admin();
  
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.priority DESC, t.due_date ASC NULLS LAST, t.created_at DESC), '[]'::json)
  INTO v_tasks
  FROM (
    SELECT 
      tk.id,
      tk.project_id,
      tk.title,
      tk.description,
      tk.assignee_id,
      tk.status,
      tk.priority,
      tk.due_date,
      tk.started_at,
      tk.completed_at,
      tk.estimated_hours,
      tk.actual_hours,
      tk.tags,
      tk.created_at,
      p.name as project_name,
      pm.property_name,
      -- Assignee info
      COALESCE(au.raw_user_meta_data->>'full_name', au.email) as assignee_name,
      au.email as assignee_email,
      -- Evidence summary
      (
        SELECT json_build_object(
          'total', COUNT(*),
          'approved', COUNT(*) FILTER (WHERE review_status = 'APPROVED'),
          'pending', COUNT(*) FILTER (WHERE review_status = 'PENDING')
        )
        FROM ota_task_evidence e
        WHERE e.task_id = tk.id
      ) as evidence_summary
    FROM ota_tasks tk
    JOIN ota_projects p ON p.id = tk.project_id
    JOIN properties_mirror pm ON pm.id = p.property_id
    LEFT JOIN auth.users au ON au.id = tk.assignee_id
    WHERE tk.status != 'CANCELLED'
      AND (
        -- Lead/Admin sees all tasks in their projects
        v_is_lead AND has_ota_project_access(tk.project_id)
        -- Staff sees only their tasks
        OR (NOT v_is_lead AND tk.assignee_id = v_caller_id)
      )
      -- Optional filters
      AND (p_project_id IS NULL OR tk.project_id = p_project_id)
      AND (p_status IS NULL OR tk.status = p_status::ota_task_status)
      AND (p_assignee_id IS NULL OR tk.assignee_id = p_assignee_id)
  ) t;
  
  RETURN json_build_object(
    'success', true,
    'tasks', v_tasks
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

REVOKE ALL ON FUNCTION public.ota_get_tasks_with_assignees FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_tasks_with_assignees TO authenticated;

-- ============================================================
-- RPC: ota_get_available_assignees
-- Returns users who can be assigned to tasks in a project
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_available_assignees(
  p_project_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users JSON;
BEGIN
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access assignees'
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
  
  -- Get active project members
  SELECT COALESCE(json_agg(row_to_json(u) ORDER BY u.display_name), '[]'::json)
  INTO v_users
  FROM (
    SELECT 
      pm.user_id as id,
      pm.role,
      COALESCE(au.raw_user_meta_data->>'full_name', au.email) as display_name,
      au.email
    FROM ota_project_members pm
    JOIN auth.users au ON au.id = pm.user_id
    WHERE pm.project_id = p_project_id
      AND pm.is_active = true
  ) u;
  
  RETURN json_build_object(
    'success', true,
    'assignees', v_users
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

REVOKE ALL ON FUNCTION public.ota_get_available_assignees FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_available_assignees TO authenticated;
