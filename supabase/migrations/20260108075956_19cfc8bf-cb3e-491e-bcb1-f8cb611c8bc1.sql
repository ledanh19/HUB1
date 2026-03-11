-- ============================================================
-- Migration 020: Super Admin Override RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.ota_super_admin_override(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_reason TEXT,
  p_data JSONB DEFAULT NULL
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
  
  -- Only super_admin or admin can use override
  IF NOT is_admin_or_superadmin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only admin or super_admin can use override'
    );
  END IF;
  
  -- Validate reason is provided
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_INPUT',
      'message', 'Override reason is required'
    );
  END IF;
  
  -- Log the override action
  INSERT INTO audit_logs (
    action, 
    entity, 
    entity_id, 
    user_id,
    is_override,
    override_reason,
    after_data
  ) VALUES (
    'SUPER_ADMIN_OVERRIDE:' || p_action,
    p_entity_type,
    p_entity_id::TEXT,
    v_user_id,
    TRUE,
    p_reason,
    p_data
  );
  
  -- Perform action based on type
  CASE p_action
    WHEN 'FORCE_STATUS_CHANGE' THEN
      IF p_entity_type = 'ota_projects' THEN
        UPDATE ota_projects 
        SET status = (p_data->>'new_status')::ota_project_status,
            updated_at = now(),
            updated_by = v_user_id
        WHERE id = p_entity_id;
      ELSIF p_entity_type = 'ota_tasks' THEN
        UPDATE ota_tasks
        SET status = (p_data->>'new_status')::ota_task_status,
            updated_at = now(),
            updated_by = v_user_id
        WHERE id = p_entity_id;
      END IF;
      
    WHEN 'FORCE_REASSIGN' THEN
      UPDATE ota_tasks
      SET assignee_id = (p_data->>'new_assignee_id')::UUID,
          assigned_at = now(),
          assigned_by = v_user_id,
          updated_at = now(),
          updated_by = v_user_id
      WHERE id = p_entity_id;
      
    WHEN 'FORCE_DELETE' THEN
      IF p_entity_type = 'ota_tasks' THEN
        DELETE FROM ota_tasks WHERE id = p_entity_id;
      ELSIF p_entity_type = 'ota_task_evidence' THEN
        DELETE FROM ota_task_evidence WHERE id = p_entity_id;
      END IF;
      
    ELSE
      RETURN json_build_object(
        'success', false,
        'error', 'INVALID_ACTION',
        'message', 'Unknown override action: ' || p_action
      );
  END CASE;
  
  RETURN json_build_object(
    'success', true,
    'action', p_action,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id
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

REVOKE ALL ON FUNCTION public.ota_super_admin_override FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_super_admin_override TO authenticated;

COMMENT ON FUNCTION public.ota_super_admin_override IS 
'Super Admin override RPC for emergency actions. All actions are logged.';