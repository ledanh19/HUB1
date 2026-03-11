
-- Fix 1: Update ota_create_task to allow any OTA role user as assignee (not just project members)
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
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can create tasks');
  END IF;
  
  IF NOT has_ota_project_access(p_project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  -- UPDATED: Allow assigning to any user with OTA role (not just project members)
  IF p_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = p_assignee_id 
      AND role IN ('ota_lead', 'ota_staff')
    ) THEN
      RETURN json_build_object('success', false, 'error', 'INVALID_ASSIGNEE', 'message', 'Assignee must have OTA role');
    END IF;
  END IF;
  
  INSERT INTO ota_tasks (project_id, title, description, assignee_id, assigned_at, assigned_by, priority, due_date, estimated_hours, tags, created_by, updated_by)
  VALUES (p_project_id, p_title, p_description, p_assignee_id,
    CASE WHEN p_assignee_id IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN p_assignee_id IS NOT NULL THEN v_user_id ELSE NULL END,
    p_priority::ota_task_priority, p_due_date, p_estimated_hours, p_tags, v_user_id, v_user_id)
  RETURNING id INTO v_task_id;
  
  RETURN json_build_object('success', true, 'task_id', v_task_id, 'message', 'Task created successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

-- Fix 2: Create RPC to get OTA staff with email from auth.users
CREATE OR REPLACE FUNCTION public.ota_get_staff_list()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED');
  END IF;
  
  SELECT json_agg(row_to_json(t)) INTO v_result FROM (
    SELECT DISTINCT 
      ur.user_id as id,
      au.email,
      COALESCE(au.raw_user_meta_data->>'full_name', au.email) as name,
      ur.role
    FROM user_roles ur
    JOIN auth.users au ON au.id = ur.user_id
    WHERE ur.role IN ('ota_lead', 'ota_staff')
    ORDER BY name
  ) t;
  
  RETURN json_build_object('success', true, 'staff', COALESCE(v_result, '[]'::json));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;
