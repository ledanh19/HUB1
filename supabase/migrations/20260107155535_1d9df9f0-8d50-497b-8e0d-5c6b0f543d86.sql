-- Drop existing conflicting functions
DROP FUNCTION IF EXISTS public.ota_submit_evidence(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.ota_submit_evidence(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.ota_submit_evidence;

-- Recreate ota_submit_evidence with explicit signature
CREATE OR REPLACE FUNCTION public.ota_submit_evidence(
  p_task_id UUID,
  p_evidence_type TEXT,
  p_file_url TEXT,
  p_file_name TEXT,
  p_file_size BIGINT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_user_id UUID;
  v_evidence_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED');
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND');
  END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED');
  END IF;
  
  INSERT INTO ota_task_evidence (task_id, evidence_type, file_url, file_name, file_size, description, created_by)
  VALUES (p_task_id, p_evidence_type::ota_evidence_type, p_file_url, p_file_name, p_file_size, p_description, v_user_id)
  RETURNING id INTO v_evidence_id;
  
  RETURN json_build_object('success', true, 'evidence_id', v_evidence_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_submit_evidence FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_submit_evidence TO authenticated;