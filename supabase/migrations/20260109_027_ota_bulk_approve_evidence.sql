-- ============================================================
-- OTA OPERATIONS MODULE - 027: BULK APPROVE EVIDENCE
-- ============================================================
-- Date: 2026-01-09
-- Purpose: RPC for bulk approving evidence on multiple tasks
--          with proper audit logging per task/evidence
--
-- Usage: Lead/Admin can select multiple tasks in REVIEW column
--        and bulk approve all PENDING evidence
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ota_bulk_approve_evidence;
-- ============================================================

-- ============================================================
-- RPC: Bulk Approve Evidence
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_bulk_approve_evidence(
  p_task_ids UUID[],
  p_comment TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_lead_or_admin BOOLEAN;
  v_task_id UUID;
  v_evidence RECORD;
  v_approved_count INT := 0;
  v_task_count INT := 0;
  v_results JSON[] := '{}';
BEGIN
  v_user_id := auth.uid();
  
  -- Check OTA Lead/Admin role
  v_is_lead_or_admin := is_ota_lead_or_admin();
  
  IF NOT v_is_lead_or_admin THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead or Admin can bulk approve evidence'
    );
  END IF;
  
  -- Validate task_ids not empty
  IF p_task_ids IS NULL OR array_length(p_task_ids, 1) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_INPUT',
      'message', 'No task IDs provided'
    );
  END IF;
  
  -- Process each task
  FOREACH v_task_id IN ARRAY p_task_ids
  LOOP
    -- Check task exists and user has access
    IF NOT EXISTS (
      SELECT 1 FROM ota_tasks t
      WHERE t.id = v_task_id
      AND has_ota_project_access(t.project_id)
    ) THEN
      -- Skip tasks user doesn't have access to
      CONTINUE;
    END IF;
    
    v_task_count := v_task_count + 1;
    
    -- Approve all PENDING evidence for this task
    FOR v_evidence IN
      SELECT id, task_id
      FROM ota_task_evidence
      WHERE task_id = v_task_id
      AND review_status = 'PENDING'
    LOOP
      -- Update evidence to APPROVED
      UPDATE ota_task_evidence
      SET 
        review_status = 'APPROVED',
        reviewed_by = v_user_id,
        reviewed_at = now(),
        review_comment = COALESCE(p_comment, 'Bulk approved'),
        updated_at = now()
      WHERE id = v_evidence.id;
      
      -- Log to audit (using existing trigger on ota_task_evidence)
      -- The ota_audit_trigger will automatically log this UPDATE
      
      v_approved_count := v_approved_count + 1;
    END LOOP;
    
    -- Record per-task result
    v_results := array_append(v_results, json_build_object(
      'task_id', v_task_id,
      'approved', (
        SELECT COUNT(*) FROM ota_task_evidence 
        WHERE task_id = v_task_id AND review_status = 'APPROVED'
      )
    ));
  END LOOP;
  
  -- Insert bulk action audit log entry
  INSERT INTO ota_audit_log (
    action,
    entity_type,
    entity_id,
    project_id,
    old_data,
    new_data,
    performed_by
  ) VALUES (
    'BULK_APPROVE_EVIDENCE',
    'evidence',
    p_task_ids[1], -- First task as reference
    NULL, -- No single project
    json_build_object('task_ids', p_task_ids),
    json_build_object(
      'approved_count', v_approved_count,
      'task_count', v_task_count,
      'comment', p_comment
    ),
    v_user_id
  );
  
  RETURN json_build_object(
    'success', true,
    'approved_count', v_approved_count,
    'task_count', v_task_count,
    'results', v_results,
    'message', format('Approved %s evidence across %s tasks', v_approved_count, v_task_count)
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.ota_bulk_approve_evidence TO authenticated;

-- Comment
COMMENT ON FUNCTION public.ota_bulk_approve_evidence IS 
  'Bulk approve all PENDING evidence for multiple tasks. Lead/Admin only. Audit logged per evidence + bulk action.';

RAISE NOTICE 'Migration 027_ota_bulk_approve_evidence completed successfully';
