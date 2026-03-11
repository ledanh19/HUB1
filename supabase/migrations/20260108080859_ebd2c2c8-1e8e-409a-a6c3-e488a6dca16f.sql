-- ============================================================
-- Update ota_get_project_detail to include work_type
-- ============================================================

CREATE OR REPLACE FUNCTION public.ota_get_project_detail(p_project_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_project RECORD; 
  v_stats JSON; 
  v_members JSON;
BEGIN
  -- Check OTA role
  IF NOT is_ota_role() THEN 
    RETURN json_build_object(
      'success', false, 
      'error', 'ACCESS_DENIED', 
      'message', 'Only OTA role can access project details'
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
  
  -- Get project with property name (LEFT JOIN for optional property)
  SELECT 
    p.*, 
    pm.property_name 
  INTO v_project 
  FROM ota_projects p 
  LEFT JOIN properties_mirror pm ON pm.id = p.property_id 
  WHERE p.id = p_project_id;
  
  IF NOT FOUND THEN 
    RETURN json_build_object(
      'success', false, 
      'error', 'PROJECT_NOT_FOUND', 
      'message', 'Project does not exist'
    ); 
  END IF;
  
  -- Get task stats
  SELECT json_build_object(
    'total', COUNT(*), 
    'todo', COUNT(*) FILTER (WHERE status = 'TODO'), 
    'in_progress', COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'), 
    'review', COUNT(*) FILTER (WHERE status = 'REVIEW'), 
    'done', COUNT(*) FILTER (WHERE status = 'DONE'), 
    'blocked', COUNT(*) FILTER (WHERE status = 'BLOCKED'), 
    'overdue', COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('DONE', 'CANCELLED'))
  ) INTO v_stats 
  FROM ota_tasks 
  WHERE project_id = p_project_id AND status != 'CANCELLED';
  
  -- Get member stats
  SELECT json_build_object(
    'total', COUNT(*), 
    'active', COUNT(*) FILTER (WHERE is_active = true)
  ) INTO v_members 
  FROM ota_project_members 
  WHERE project_id = p_project_id;
  
  -- Return with work_type included
  RETURN json_build_object(
    'success', true, 
    'project', json_build_object(
      'id', v_project.id, 
      'name', v_project.name, 
      'description', v_project.description, 
      'property_id', v_project.property_id, 
      'property_name', v_project.property_name, 
      'work_type', v_project.work_type,  -- ADDED
      'status', v_project.status, 
      'start_date', v_project.start_date, 
      'due_date', v_project.due_date, 
      'completed_at', v_project.completed_at, 
      'created_at', v_project.created_at
    ), 
    'task_stats', v_stats, 
    'member_stats', v_members
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

COMMENT ON FUNCTION public.ota_get_project_detail(UUID) IS 
'Get project detail including work_type, task stats, and member stats.';