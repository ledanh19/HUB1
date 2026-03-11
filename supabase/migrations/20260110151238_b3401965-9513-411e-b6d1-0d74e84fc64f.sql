-- Drop old function signature first to avoid ambiguity
DROP FUNCTION IF EXISTS public.ota_create_task(UUID, TEXT, TEXT, UUID, TEXT, DATE, NUMERIC, TEXT[]);

-- Now create with new signature including p_classification
CREATE OR REPLACE FUNCTION public.ota_create_task(
  p_project_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL,
  p_priority TEXT DEFAULT 'MEDIUM',
  p_due_date DATE DEFAULT NULL,
  p_estimated_hours NUMERIC DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}',
  p_classification TEXT DEFAULT 'EXECUTION'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id UUID;
  v_user_id UUID;
  v_classification ota_task_classification;
BEGIN
  v_user_id := auth.uid();
  
  -- Validate OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'ACCESS_DENIED', 
      'message', 'Only OTA role can create tasks'
    );
  END IF;
  
  -- Validate project access
  IF NOT has_ota_project_access(p_project_id) THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'PROJECT_ACCESS_DENIED', 
      'message', 'No access to this project'
    );
  END IF;
  
  -- Validate assignee (if provided)
  IF p_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = p_assignee_id 
      AND role IN ('ota_lead', 'ota_staff')
    ) THEN
      RETURN json_build_object(
        'success', false, 
        'error', 'INVALID_ASSIGNEE', 
        'message', 'Assignee must have OTA role'
      );
    END IF;
  END IF;
  
  -- Validate and cast classification
  BEGIN
    v_classification := UPPER(p_classification)::ota_task_classification;
  EXCEPTION WHEN invalid_text_representation THEN
    -- Fallback to EXECUTION if invalid
    v_classification := 'EXECUTION';
  END;
  
  -- Insert task with classification
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
    classification,
    created_by, 
    updated_by
  )
  VALUES (
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
    v_classification,
    v_user_id, 
    v_user_id
  )
  RETURNING id INTO v_task_id;
  
  RETURN json_build_object(
    'success', true, 
    'task_id', v_task_id, 
    'classification', v_classification::text,
    'message', 'Task created successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false, 
    'error', SQLSTATE, 
    'message', SQLERRM
  );
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.ota_create_task FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_create_task TO authenticated;

-- Update comment
COMMENT ON FUNCTION public.ota_create_task IS 
  'Create a new task in an OTA project. Supports classification (EXECUTION, PREP, AUTO, OPS). Sprint C: Added p_classification parameter.';