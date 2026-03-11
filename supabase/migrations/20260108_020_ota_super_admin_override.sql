-- ============================================================
-- OTA OPERATIONS MODULE - 020: SUPER ADMIN OVERRIDE RPC
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Allow super_admin to override task status with audit
-- 
-- Override Types:
--   - REOPEN: DONE/CANCELLED → REVIEW
--   - FORCE_DONE: any → DONE (bypass evidence check)
--   - CANCEL: any → CANCELLED
--
-- Security:
--   - SECURITY DEFINER
--   - Only super_admin can call
--   - Requires reason (min 5 chars)
--   - Full audit trail
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ota_super_admin_override_task_status;
-- ============================================================

CREATE OR REPLACE FUNCTION public.ota_super_admin_override_task_status(
  p_task_id UUID,
  p_override_type TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_super_admin BOOLEAN;
  v_task RECORD;
  v_old_status TEXT;
  v_new_status TEXT;
  v_reason TEXT;
BEGIN
  -- ============================================================
  -- STEP 1: Get current user
  -- ============================================================
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;

  -- ============================================================
  -- STEP 2: Validate reason (trim and check length)
  -- ============================================================
  v_reason := TRIM(COALESCE(p_reason, ''));
  
  IF LENGTH(v_reason) < 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_REASON',
      'message', 'Reason must be at least 5 characters'
    );
  END IF;

  -- ============================================================
  -- STEP 3: Check if user is super_admin
  -- ============================================================
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id
    AND role = 'super_admin'
  ) INTO v_is_super_admin;
  
  IF NOT v_is_super_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only super_admin can perform override actions'
    );
  END IF;

  -- ============================================================
  -- STEP 4: Lock and fetch task
  -- ============================================================
  SELECT id, project_id, status, title
  INTO v_task
  FROM public.ota_tasks
  WHERE id = p_task_id
  FOR UPDATE;
  
  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TASK_NOT_FOUND',
      'message', 'Task not found'
    );
  END IF;
  
  v_old_status := v_task.status::TEXT;

  -- ============================================================
  -- STEP 5: Validate override type and determine new status
  -- ============================================================
  IF p_override_type = 'REOPEN' THEN
    -- REOPEN: Only from DONE or CANCELLED → REVIEW
    IF v_old_status NOT IN ('DONE', 'CANCELLED') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INVALID_OVERRIDE',
        'message', 'REOPEN only allowed from DONE or CANCELLED status'
      );
    END IF;
    v_new_status := 'REVIEW';
    
  ELSIF p_override_type = 'FORCE_DONE' THEN
    -- FORCE_DONE: Any → DONE (bypass evidence)
    IF v_old_status = 'DONE' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INVALID_OVERRIDE',
        'message', 'Task is already DONE'
      );
    END IF;
    v_new_status := 'DONE';
    
  ELSIF p_override_type = 'CANCEL' THEN
    -- CANCEL: Any → CANCELLED
    IF v_old_status = 'CANCELLED' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'INVALID_OVERRIDE',
        'message', 'Task is already CANCELLED'
      );
    END IF;
    v_new_status := 'CANCELLED';
    
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_OVERRIDE_TYPE',
      'message', 'Override type must be REOPEN, FORCE_DONE, or CANCEL'
    );
  END IF;

  -- ============================================================
  -- STEP 6: Apply status update
  -- ============================================================
  UPDATE public.ota_tasks
  SET 
    status = v_new_status::public.ota_task_status,
    updated_at = NOW(),
    updated_by = v_user_id,
    -- Set completed_at for DONE status
    completed_at = CASE 
      WHEN v_new_status = 'DONE' THEN NOW()
      ELSE NULL
    END
  WHERE id = p_task_id;

  -- ============================================================
  -- STEP 7: Insert audit log with override details (performed_via='RPC')
  -- ============================================================
  INSERT INTO public.ota_audit_log (
    action,
    entity_type,
    entity_id,
    project_id,
    old_data,
    new_data,
    performed_by,
    reason,
    override_type,
    performed_via
  ) VALUES (
    'OVERRIDE_TASK_STATUS',
    'task',
    p_task_id,
    v_task.project_id,
    jsonb_build_object(
      'status', v_old_status,
      'task_title', v_task.title
    ),
    jsonb_build_object(
      'status', v_new_status,
      'override_type', p_override_type,
      'task_title', v_task.title
    ),
    v_user_id,
    v_reason,
    p_override_type,
    'RPC'
  );

  -- ============================================================
  -- STEP 8: Return success
  -- ============================================================
  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'old_status', v_old_status,
    'new_status', v_new_status,
    'override_type', p_override_type,
    'message', 'Task status overridden successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INTERNAL_ERROR',
      'message', SQLERRM
    );
END;
$$;

-- ============================================================
-- GRANT EXECUTE
-- ============================================================
GRANT EXECUTE ON FUNCTION public.ota_super_admin_override_task_status(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- COMMENT
-- ============================================================
COMMENT ON FUNCTION public.ota_super_admin_override_task_status IS 
'Super admin override for task status. Bypasses normal rules with mandatory reason and full audit trail.
Override types: REOPEN (DONE/CANCELLED→REVIEW), FORCE_DONE (any→DONE), CANCEL (any→CANCELLED)';
