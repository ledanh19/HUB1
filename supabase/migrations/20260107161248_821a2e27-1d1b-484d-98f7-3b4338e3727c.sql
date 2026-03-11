
-- Fix ota_get_my_tasks RPC: column is "property_name" not "name"
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
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access tasks');
  END IF;
  
  SELECT json_agg(row_to_json(t)) INTO v_result FROM (
    SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.started_at, t.completed_at,
      t.estimated_hours, t.actual_hours, t.tags, t.created_at, 
      p.id as project_id, p.name as project_name, 
      pm.property_name as property_name  -- Fixed: was pm.name
    FROM ota_tasks t
    JOIN ota_projects p ON p.id = t.project_id
    JOIN properties_mirror pm ON pm.id = p.property_id
    WHERE t.assignee_id = v_user_id AND has_ota_project_access(t.project_id)
    AND (p_status IS NULL OR t.status = p_status::ota_task_status)
    AND (p_project_id IS NULL OR t.project_id = p_project_id)
    ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 END, t.due_date NULLS LAST, t.created_at DESC
  ) t;
  
  RETURN json_build_object('success', true, 'tasks', COALESCE(v_result, '[]'::json));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;
