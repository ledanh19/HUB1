-- ============================================================
-- RPC: ota_super_admin_override_task_status
-- Wrapper for super admin override specifically for tasks
-- ============================================================

CREATE OR REPLACE FUNCTION public.ota_super_admin_override_task_status(
  p_task_id UUID,
  p_override_type TEXT,  -- REOPEN, FORCE_DONE, CANCEL
  p_reason TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_current_status ota_task_status;
  v_new_status ota_task_status;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  -- Only super_admin or admin can use override
  IF NOT is_admin_or_superadmin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only admin or super_admin can use override'
    );
  END IF;
  
  -- Validate reason
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_INPUT',
      'message', 'Override reason must be at least 5 characters'
    );
  END IF;
  
  -- Get current task status
  SELECT status INTO v_current_status
  FROM ota_tasks
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'NOT_FOUND',
      'message', 'Task not found'
    );
  END IF;
  
  -- Determine new status based on override type
  CASE p_override_type
    WHEN 'REOPEN' THEN
      v_new_status := 'REVIEW';
    WHEN 'FORCE_DONE' THEN
      v_new_status := 'DONE';
    WHEN 'CANCEL' THEN
      v_new_status := 'CANCELLED';
    ELSE
      RETURN json_build_object(
        'success', false,
        'error', 'INVALID_OVERRIDE_TYPE',
        'message', 'Invalid override type: ' || p_override_type
      );
  END CASE;
  
  -- Log the override action
  INSERT INTO audit_logs (
    action,
    entity,
    entity_id,
    user_id,
    is_override,
    override_reason,
    before_data,
    after_data
  ) VALUES (
    'SUPER_ADMIN_OVERRIDE:' || p_override_type,
    'ota_tasks',
    p_task_id::TEXT,
    v_user_id,
    TRUE,
    p_reason,
    json_build_object('status', v_current_status::TEXT),
    json_build_object('status', v_new_status::TEXT)
  );
  
  -- Update task status
  UPDATE ota_tasks
  SET 
    status = v_new_status,
    updated_at = now(),
    updated_by = v_user_id,
    completed_at = CASE 
      WHEN v_new_status = 'DONE' THEN now()
      ELSE completed_at
    END
  WHERE id = p_task_id;
  
  RETURN json_build_object(
    'success', true,
    'task_id', p_task_id,
    'old_status', v_current_status::TEXT,
    'new_status', v_new_status::TEXT,
    'override_type', p_override_type
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

REVOKE ALL ON FUNCTION public.ota_super_admin_override_task_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_super_admin_override_task_status TO authenticated;

COMMENT ON FUNCTION public.ota_super_admin_override_task_status IS 
'Super Admin override for task status changes. Supports REOPEN, FORCE_DONE, CANCEL. All actions logged.';