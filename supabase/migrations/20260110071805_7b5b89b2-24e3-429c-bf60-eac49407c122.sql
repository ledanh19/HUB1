-- Fix ota_create_quick_task: correct column types
-- issue_tag is TEXT not enum
-- due_date is DATE not TIMESTAMPTZ
CREATE OR REPLACE FUNCTION public.ota_create_quick_task(
  p_title TEXT,
  p_assignee_id UUID DEFAULT NULL,
  p_due_date TIMESTAMPTZ DEFAULT NULL,
  p_classification TEXT DEFAULT 'EXECUTION',
  p_issue_tag TEXT DEFAULT NULL,
  p_expected_effort_minutes INT DEFAULT NULL,
  p_priority TEXT DEFAULT 'MEDIUM'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_bucket_result JSON;
  v_project_id UUID;
  v_task_id UUID;
  v_require_evidence BOOLEAN;
  v_min_evidence_count INT;
  v_due_date DATE;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can create quick tasks');
  END IF;
  
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_INPUT', 'message', 'Title is required');
  END IF;
  
  v_bucket_result := ota_get_or_create_ops_bucket(CURRENT_DATE);
  
  IF NOT (v_bucket_result->>'success')::boolean THEN
    RETURN v_bucket_result;
  END IF;
  
  v_project_id := (v_bucket_result->>'project_id')::uuid;
  
  -- Convert timestamptz to date for due_date column
  IF p_due_date IS NOT NULL THEN
    v_due_date := p_due_date::date;
  ELSE
    v_due_date := CURRENT_DATE + 1;
  END IF;
  
  IF p_classification = 'EXECUTION' THEN
    v_require_evidence := true;
    v_min_evidence_count := 1;
  ELSIF p_classification IN ('PREP', 'AUTO', 'OPS') THEN
    v_require_evidence := false;
    v_min_evidence_count := 0;
  ELSE
    v_require_evidence := true;
    v_min_evidence_count := 1;
  END IF;
  
  -- Insert with correct types: 
  -- issue_tag is TEXT (no cast needed)
  -- due_date is DATE
  INSERT INTO ota_tasks (
    title, project_id, assignee_id, due_date, classification, issue_tag,
    expected_effort_minutes, priority, status, is_quick_task, require_evidence,
    min_evidence_count, created_by
  ) VALUES (
    trim(p_title), 
    v_project_id, 
    COALESCE(p_assignee_id, v_user_id),
    v_due_date,
    p_classification::ota_task_classification, 
    p_issue_tag,  -- TEXT, no cast
    p_expected_effort_minutes, 
    COALESCE(p_priority, 'MEDIUM')::ota_task_priority,
    'TODO', 
    true, 
    v_require_evidence, 
    v_min_evidence_count, 
    v_user_id
  ) RETURNING id INTO v_task_id;
  
  INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, new_data, performed_by)
  VALUES ('QUICK_TASK_CREATED', 'task', v_task_id, v_project_id,
    json_build_object('title', trim(p_title), 'classification', p_classification, 'is_quick_task', true, 
      'require_evidence', v_require_evidence, 'bucket_date', CURRENT_DATE), v_user_id);
  
  RETURN json_build_object('success', true, 'task_id', v_task_id, 'project_id', v_project_id,
    'is_quick_task', true, 'require_evidence', v_require_evidence, 'message', 'Quick task created successfully');
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;