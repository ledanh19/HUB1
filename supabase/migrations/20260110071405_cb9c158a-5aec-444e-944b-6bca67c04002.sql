-- Fix ota_get_or_create_ops_bucket: use assigned_by instead of added_by
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
    
    -- Use assigned_by instead of added_by
    INSERT INTO ota_project_members (project_id, user_id, role, assigned_by)
    VALUES (v_project_id, v_user_id, 'LEAD', v_user_id);
    
    INSERT INTO ota_audit_log (action, entity_type, entity_id, project_id, new_data, performed_by)
    VALUES ('OPS_BUCKET_CREATED', 'project', v_project_id, v_project_id,
      json_build_object('name', v_project_name, 'bucket_date', p_bucket_date), v_user_id);
    
    v_is_new := true;
  ELSE
    IF NOT has_ota_project_access(v_project_id) THEN
      -- Use assigned_by instead of added_by
      INSERT INTO ota_project_members (project_id, user_id, role, assigned_by)
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