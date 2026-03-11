-- ============================================================
-- OTA OPERATIONS MODULE - 013: TASK DETAIL RPC
-- ============================================================
-- Date: 2026-01-07
-- Updated: 2026-01-08
-- Purpose: RPC to get full task details with evidence and assignee info
-- ============================================================

-- ============================================================
-- RPC: ota_get_task_detail
-- Returns complete task info with evidence and project context
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_task_detail(
  p_task_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_evidence JSON;
  v_assignee_info JSON;
  v_project_info JSON;
BEGIN
  v_user_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access task details'
    );
  END IF;
  
  -- Get task with project info
  SELECT 
    t.*,
    p.name as project_name,
    p.property_id,
    pm.property_name
  INTO v_task
  FROM ota_tasks t
  JOIN ota_projects p ON p.id = t.project_id
  JOIN properties_mirror pm ON pm.id = p.property_id
  WHERE t.id = p_task_id;
  
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
  
  -- Get assignee info (safe: only display name)
  IF v_task.assignee_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', u.id,
      'email', u.email,
      'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.email)
    )
    INTO v_assignee_info
    FROM auth.users u
    WHERE u.id = v_task.assignee_id;
  END IF;
  
  -- Get all evidence for this task
  SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::json)
  INTO v_evidence
  FROM (
    SELECT 
      te.id,
      te.evidence_type,
      te.file_url,
      te.file_name,
      te.file_size_bytes,
      te.mime_type,
      te.description,
      te.review_status,
      te.reviewed_at,
      te.review_notes,
      te.created_at,
      te.created_by,
      COALESCE(cu.raw_user_meta_data->>'full_name', cu.email) as created_by_name,
      CASE WHEN te.reviewed_by IS NOT NULL THEN
        COALESCE(ru.raw_user_meta_data->>'full_name', ru.email)
      ELSE NULL END as reviewed_by_name
    FROM ota_task_evidence te
    LEFT JOIN auth.users cu ON cu.id = te.created_by
    LEFT JOIN auth.users ru ON ru.id = te.reviewed_by
    WHERE te.task_id = p_task_id
  ) e;
  
  -- Get project info
  SELECT json_build_object(
    'id', p.id,
    'name', p.name,
    'status', p.status,
    'property_id', p.property_id,
    'property_name', pm.property_name
  )
  INTO v_project_info
  FROM ota_projects p
  JOIN properties_mirror pm ON pm.id = p.property_id
  WHERE p.id = v_task.project_id;
  
  -- Count approved evidence
  RETURN json_build_object(
    'success', true,
    'task', json_build_object(
      'id', v_task.id,
      'title', v_task.title,
      'description', v_task.description,
      'status', v_task.status,
      'priority', v_task.priority,
      'due_date', v_task.due_date,
      'started_at', v_task.started_at,
      'completed_at', v_task.completed_at,
      'estimated_hours', v_task.estimated_hours,
      'actual_hours', v_task.actual_hours,
      'tags', v_task.tags,
      'created_at', v_task.created_at,
      'assignee', v_assignee_info
    ),
    'project', v_project_info,
    'evidence', v_evidence,
    'evidence_summary', (
      SELECT json_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE review_status = 'PENDING'),
        'approved', COUNT(*) FILTER (WHERE review_status = 'APPROVED'),
        'rejected', COUNT(*) FILTER (WHERE review_status = 'REJECTED'),
        'needs_revision', COUNT(*) FILTER (WHERE review_status = 'NEEDS_REVISION')
      )
      FROM ota_task_evidence
      WHERE task_id = p_task_id
    ),
    'can_complete', (
      SELECT COUNT(*) > 0 
      FROM ota_task_evidence 
      WHERE task_id = p_task_id AND review_status = 'APPROVED'
    )
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

REVOKE ALL ON FUNCTION public.ota_get_task_detail FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_task_detail TO authenticated;

COMMENT ON FUNCTION public.ota_get_task_detail(UUID) IS 
'Get complete task details including evidence, project info, and assignee. 
Returns can_complete flag to indicate if task has approved evidence.';

-- ============================================================
-- RPC: ota_get_task_evidence
-- Returns all evidence for a task (lighter weight than full detail)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_task_evidence(
  p_task_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_evidence JSON;
BEGIN
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access evidence'
    );
  END IF;
  
  -- Get task for project access check
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
  
  -- Get evidence list
  SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::json)
  INTO v_evidence
  FROM (
    SELECT 
      te.id,
      te.evidence_type,
      te.file_url,
      te.file_name,
      te.file_size_bytes,
      te.mime_type,
      te.description,
      te.review_status,
      te.reviewed_at,
      te.review_notes,
      te.created_at,
      te.created_by,
      COALESCE(cu.raw_user_meta_data->>'full_name', cu.email) as created_by_name,
      CASE WHEN te.reviewed_by IS NOT NULL THEN
        COALESCE(ru.raw_user_meta_data->>'full_name', ru.email)
      ELSE NULL END as reviewed_by_name
    FROM ota_task_evidence te
    LEFT JOIN auth.users cu ON cu.id = te.created_by
    LEFT JOIN auth.users ru ON ru.id = te.reviewed_by
    WHERE te.task_id = p_task_id
  ) e;
  
  RETURN json_build_object(
    'success', true,
    'evidence', v_evidence
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
