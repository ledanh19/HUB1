-- Fix Quick Task flow comprehensively:
-- 1) ota_get_or_create_ops_bucket must populate updated_by (NOT NULL)
-- 2) ota_create_quick_task must populate updated_by (NOT NULL)

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

    -- IMPORTANT: ota_projects.updated_by is NOT NULL
    INSERT INTO ota_projects (
      name,
      description,
      work_type,
      status,
      is_ops_bucket,
      bucket_date,
      created_by,
      updated_by
    ) VALUES (
      v_project_name,
      'Daily operational tasks bucket for ' || to_char(p_bucket_date, 'DD/MM/YYYY'),
      'INTERNAL_OPS',
      'IN_PROGRESS',
      true,
      p_bucket_date,
      v_user_id,
      v_user_id
    ) RETURNING id INTO v_project_id;

    -- Add creator as project member
    INSERT INTO ota_project_members (project_id, user_id, role, assigned_by)
    VALUES (v_project_id, v_user_id, 'LEAD', v_user_id)
    ON CONFLICT (project_id, user_id) DO NOTHING;

    INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, new_data, performed_by)
    VALUES (
      'OPS_BUCKET_CREATED',
      'project',
      v_project_id,
      v_project_id,
      json_build_object('name', v_project_name, 'bucket_date', p_bucket_date),
      v_user_id
    );

    v_is_new := true;
  ELSE
    -- If user doesn't have access yet, add them as STAFF (idempotent)
    IF NOT has_ota_project_access(v_project_id) THEN
      INSERT INTO ota_project_members (project_id, user_id, role, assigned_by)
      VALUES (v_project_id, v_user_id, 'STAFF', v_user_id)
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'project_id', v_project_id,
    'bucket_date', p_bucket_date,
    'is_new', v_is_new
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Safety for race conditions; also ensures non-null id when the row exists
    SELECT id INTO v_project_id
    FROM ota_projects
    WHERE is_ops_bucket = true
      AND bucket_date = p_bucket_date;

    IF v_project_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'RACE_CONDITION', 'message', 'Ops bucket creation race condition');
    END IF;

    RETURN json_build_object('success', true, 'project_id', v_project_id, 'bucket_date', p_bucket_date, 'is_new', false);
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;


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

  v_project_id := NULLIF(v_bucket_result->>'project_id','')::uuid;

  IF v_project_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NO_BUCKET_PROJECT', 'message', 'Ops bucket project_id is null');
  END IF;

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

  -- IMPORTANT: ota_tasks.updated_by is NOT NULL
  INSERT INTO ota_tasks (
    title,
    project_id,
    assignee_id,
    due_date,
    classification,
    issue_tag,
    expected_effort_minutes,
    priority,
    status,
    is_quick_task,
    require_evidence,
    min_evidence_count,
    created_by,
    updated_by
  ) VALUES (
    trim(p_title),
    v_project_id,
    COALESCE(p_assignee_id, v_user_id),
    v_due_date,
    p_classification::ota_task_classification,
    p_issue_tag,
    p_expected_effort_minutes,
    COALESCE(p_priority, 'MEDIUM')::ota_task_priority,
    'TODO',
    true,
    v_require_evidence,
    v_min_evidence_count,
    v_user_id,
    v_user_id
  ) RETURNING id INTO v_task_id;

  INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, new_data, performed_by)
  VALUES (
    'QUICK_TASK_CREATED',
    'task',
    v_task_id,
    v_project_id,
    json_build_object(
      'title', trim(p_title),
      'classification', p_classification,
      'is_quick_task', true,
      'require_evidence', v_require_evidence,
      'bucket_date', CURRENT_DATE
    ),
    v_user_id
  );

  RETURN json_build_object(
    'success', true,
    'task_id', v_task_id,
    'project_id', v_project_id,
    'is_quick_task', true,
    'require_evidence', v_require_evidence,
    'message', 'Quick task created successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ota_get_or_create_ops_bucket TO authenticated;
GRANT EXECUTE ON FUNCTION public.ota_create_quick_task TO authenticated;
