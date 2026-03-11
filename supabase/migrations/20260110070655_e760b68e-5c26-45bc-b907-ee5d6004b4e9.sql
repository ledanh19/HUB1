-- ============================================================
-- OTA OPERATIONS MODULE - 029: QUICK TASK & OPS BUCKET
-- ============================================================

-- 1.1 Add Ops Bucket columns to ota_projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_projects' 
    AND column_name = 'is_ops_bucket'
  ) THEN
    ALTER TABLE public.ota_projects 
    ADD COLUMN is_ops_bucket BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_projects' 
    AND column_name = 'bucket_date'
  ) THEN
    ALTER TABLE public.ota_projects 
    ADD COLUMN bucket_date DATE;
  END IF;
END$$;

-- 1.2 Unique index: Only ONE ops bucket per day
DROP INDEX IF EXISTS uniq_ops_bucket_per_day;
CREATE UNIQUE INDEX uniq_ops_bucket_per_day
ON public.ota_projects(bucket_date)
WHERE is_ops_bucket = true;

-- 1.3 Add is_quick_task to ota_tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_tasks' 
    AND column_name = 'is_quick_task'
  ) THEN
    ALTER TABLE public.ota_tasks 
    ADD COLUMN is_quick_task BOOLEAN DEFAULT false;
  END IF;
END$$;

-- ============================================================
-- RPC: ota_get_or_create_ops_bucket
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_or_create_ops_bucket(
  p_bucket_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_project_id UUID;
  v_project_name TEXT;
  v_is_new BOOLEAN := false;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access ops bucket'
    );
  END IF;
  
  SELECT id INTO v_project_id
  FROM ota_projects
  WHERE is_ops_bucket = true
  AND bucket_date = p_bucket_date;
  
  IF v_project_id IS NULL THEN
    v_project_name := 'Ops Bucket – ' || to_char(p_bucket_date, 'YYYY-MM-DD');
    
    INSERT INTO ota_projects (
      name, description, work_type, status, is_ops_bucket, bucket_date, created_by
    ) VALUES (
      v_project_name,
      'Daily operational tasks bucket for ' || to_char(p_bucket_date, 'DD/MM/YYYY'),
      'INTERNAL_OPS', 'IN_PROGRESS', true, p_bucket_date, v_user_id
    ) RETURNING id INTO v_project_id;
    
    INSERT INTO ota_project_members (project_id, user_id, role, added_by)
    VALUES (v_project_id, v_user_id, 'LEAD', v_user_id);
    
    INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, new_data, performed_by)
    VALUES ('OPS_BUCKET_CREATED', 'project', v_project_id, v_project_id,
      json_build_object('name', v_project_name, 'bucket_date', p_bucket_date), v_user_id);
    
    v_is_new := true;
  ELSE
    IF NOT has_ota_project_access(v_project_id) THEN
      INSERT INTO ota_project_members (project_id, user_id, role, added_by)
      VALUES (v_project_id, v_user_id, 'STAFF', v_user_id)
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN json_build_object('success', true, 'project_id', v_project_id, 'bucket_date', p_bucket_date, 'is_new', v_is_new);
  
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_project_id FROM ota_projects WHERE is_ops_bucket = true AND bucket_date = p_bucket_date;
    RETURN json_build_object('success', true, 'project_id', v_project_id, 'bucket_date', p_bucket_date, 'is_new', false);
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

-- ============================================================
-- RPC: ota_create_quick_task
-- ============================================================
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
  
  INSERT INTO ota_tasks (
    title, project_id, assignee_id, due_date, classification, issue_tag,
    expected_effort_minutes, priority, status, is_quick_task, require_evidence,
    min_evidence_count, created_by
  ) VALUES (
    trim(p_title), v_project_id, COALESCE(p_assignee_id, v_user_id),
    COALESCE(p_due_date, (CURRENT_DATE + interval '1 day')::timestamptz),
    p_classification::ota_task_classification, p_issue_tag::ota_issue_tag,
    p_expected_effort_minutes, COALESCE(p_priority, 'MEDIUM')::ota_task_priority,
    'TODO', true, v_require_evidence, v_min_evidence_count, v_user_id
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

-- ============================================================
-- RPC: ota_promote_quick_task_to_project
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_promote_quick_task_to_project(
  p_task_id UUID,
  p_target_project_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_source_project_id UUID;
  v_target_project RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can promote quick tasks');
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist');
  END IF;
  
  IF NOT COALESCE(v_task.is_quick_task, false) THEN
    RETURN json_build_object('success', false, 'error', 'NOT_QUICK_TASK', 'message', 'Only quick tasks can be promoted');
  END IF;
  
  v_source_project_id := v_task.project_id;
  
  IF NOT has_ota_project_access(v_source_project_id) THEN
    RETURN json_build_object('success', false, 'error', 'SOURCE_ACCESS_DENIED', 'message', 'No access to source ops bucket');
  END IF;
  
  SELECT * INTO v_target_project FROM ota_projects WHERE id = p_target_project_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TARGET_PROJECT_NOT_FOUND', 'message', 'Target project does not exist');
  END IF;
  
  IF COALESCE(v_target_project.is_ops_bucket, false) THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_TARGET', 'message', 'Cannot promote to another ops bucket');
  END IF;
  
  IF NOT has_ota_project_access(p_target_project_id) THEN
    RETURN json_build_object('success', false, 'error', 'TARGET_ACCESS_DENIED', 'message', 'No access to target project');
  END IF;
  
  UPDATE ota_tasks
  SET project_id = p_target_project_id, is_quick_task = false, updated_at = now(), updated_by = v_user_id
  WHERE id = p_task_id;
  
  INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, old_data, new_data, performed_by)
  VALUES ('QUICK_TASK_PROMOTED', 'task', p_task_id, p_target_project_id,
    json_build_object('from_project_id', v_source_project_id, 'was_quick_task', true),
    json_build_object('to_project_id', p_target_project_id, 'to_project_name', v_target_project.name, 'is_quick_task', false),
    v_user_id);
  
  RETURN json_build_object('success', true, 'task_id', p_task_id, 'from_project_id', v_source_project_id,
    'to_project_id', p_target_project_id, 'message', format('Task promoted to project "%s"', v_target_project.name));
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.ota_get_or_create_ops_bucket TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_create_quick_task TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_promote_quick_task_to_project TO authenticated;