-- ============================================================
-- OTA OPERATIONS MODULE - 032: FIX QUICK TASK DETAIL
-- ============================================================
-- Date: 2026-01-10
-- Sprint: 2 Fix
-- Purpose: Fix ota_get_task_detail RPC to support Quick Tasks (Ops Bucket projects)
--
-- Problem:
--   Original RPC uses INNER JOIN with properties_mirror, which fails
--   for Ops Bucket projects that have no property_id (NULL).
--
-- Solution:
--   Change INNER JOIN → LEFT JOIN for property
--   Handle NULL property gracefully
-- ============================================================

-- Drop existing function to recreate
DROP FUNCTION IF EXISTS public.ota_get_task_detail(UUID) CASCADE;

-- ============================================================
-- RPC: ota_get_task_detail (FIXED for Quick Tasks)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_task_detail(
  p_task_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_task RECORD;
  v_evidence JSON;
  v_assignee_info JSON;
  v_project_info JSON;
  v_created_by_info JSON;
BEGIN
  v_user_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'ACCESS_DENIED', 
      'message', 'Only OTA role can access task details'
    );
  END IF;
  
  -- Fetch task with LEFT JOIN for property (handles Ops Bucket with no property)
  SELECT 
    t.*,
    p.name as project_name,
    p.property_id,
    p.is_ops_bucket,
    pm.property_name
  INTO v_task
  FROM ota_tasks t
  JOIN ota_projects p ON p.id = t.project_id
  LEFT JOIN properties_mirror pm ON pm.id = p.property_id  -- Changed: INNER → LEFT
  WHERE t.id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'TASK_NOT_FOUND', 
      'message', 'Task does not exist'
    );
  END IF;
  
  -- Check project access
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'PROJECT_ACCESS_DENIED', 
      'message', 'No access to this project'
    );
  END IF;
  
  -- Get assignee info
  IF v_task.assignee_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', u.id, 
      'email', u.email, 
      'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.email)
    )
    INTO v_assignee_info 
    FROM auth.users u 
    WHERE u.id = v_task.assignee_id;
  END IF;
  
  -- Get created_by info
  IF v_task.created_by IS NOT NULL THEN
    SELECT json_build_object(
      'id', u.id, 
      'email', u.email, 
      'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.email)
    )
    INTO v_created_by_info 
    FROM auth.users u 
    WHERE u.id = v_task.created_by;
  END IF;
  
  -- Get evidence list
  SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::json)
  INTO v_evidence
  FROM (
    SELECT 
      te.id, 
      te.evidence_type, 
      te.file_url, 
      te.file_name, 
      te.file_size_bytes, 
      te.mime_type, 
      te.description,
      te.review_status, 
      te.reviewed_at, 
      te.review_notes, 
      te.created_at, 
      te.created_by,
      COALESCE(cu.raw_user_meta_data->>'full_name', cu.email) as created_by_name,
      CASE 
        WHEN te.reviewed_by IS NOT NULL 
        THEN COALESCE(ru.raw_user_meta_data->>'full_name', ru.email) 
        ELSE NULL 
      END as reviewed_by_name
    FROM ota_task_evidence te
    LEFT JOIN auth.users cu ON cu.id = te.created_by
    LEFT JOIN auth.users ru ON ru.id = te.reviewed_by
    WHERE te.task_id = p_task_id
  ) e;
  
  -- Get project info (handles NULL property)
  SELECT json_build_object(
    'id', p.id, 
    'name', p.name, 
    'status', p.status, 
    'property_id', p.property_id, 
    'property_name', pm.property_name,
    'is_ops_bucket', COALESCE(p.is_ops_bucket, false),
    'bucket_date', p.bucket_date
  )
  INTO v_project_info 
  FROM ota_projects p 
  LEFT JOIN properties_mirror pm ON pm.id = p.property_id  -- Changed: INNER → LEFT
  WHERE p.id = v_task.project_id;
  
  -- Return complete task detail
  RETURN json_build_object(
    'success', true,
    'task', json_build_object(
      'id', v_task.id, 
      'title', v_task.title, 
      'description', v_task.description, 
      'status', v_task.status,
      'priority', v_task.priority, 
      'due_date', v_task.due_date, 
      'started_at', v_task.started_at,
      'completed_at', v_task.completed_at, 
      'estimated_hours', v_task.estimated_hours, 
      'actual_hours', v_task.actual_hours,
      'tags', v_task.tags, 
      'created_at', v_task.created_at, 
      'updated_at', v_task.updated_at,
      'assignee', v_assignee_info,
      'created_by_info', v_created_by_info,
      -- Quick Task fields
      'is_quick_task', COALESCE(v_task.is_quick_task, false),
      'project_name', v_task.project_name,
      'property_name', v_task.property_name,
      'is_ops_bucket', COALESCE(v_task.is_ops_bucket, false),
      -- Classification & effort fields
      'classification', v_task.classification,
      'issue_tag', v_task.issue_tag,
      'expected_effort_minutes', v_task.expected_effort_minutes,
      'actual_effort_minutes', v_task.actual_effort_minutes,
      'require_evidence', COALESCE(v_task.require_evidence, true),
      'min_evidence_count', v_task.min_evidence_count
    ),
    'project', v_project_info,
    'evidence', v_evidence,
    'evidence_summary', (
      SELECT json_build_object(
        'total', COUNT(*), 
        'pending', COUNT(*) FILTER (WHERE review_status = 'PENDING'),
        'approved', COUNT(*) FILTER (WHERE review_status = 'APPROVED'), 
        'rejected', COUNT(*) FILTER (WHERE review_status = 'REJECTED'),
        'needs_revision', COUNT(*) FILTER (WHERE review_status = 'NEEDS_REVISION')
      )
      FROM ota_task_evidence 
      WHERE task_id = p_task_id
    ),
    'can_complete', (
      -- For Quick Tasks that don't require evidence, always true
      -- For others, need at least 1 approved evidence
      SELECT 
        CASE 
          WHEN COALESCE(v_task.require_evidence, true) = false THEN true
          ELSE (COUNT(*) FILTER (WHERE review_status = 'APPROVED')) > 0
        END
      FROM ota_task_evidence 
      WHERE task_id = p_task_id
    )
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

-- Grant permissions
REVOKE ALL ON FUNCTION public.ota_get_task_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_task_detail(UUID) TO authenticated;

COMMENT ON FUNCTION public.ota_get_task_detail(UUID) IS 
  'Get task detail with evidence, project info, assignee info. Supports Quick Tasks (Ops Bucket).';

-- ============================================================
-- VERIFY
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 032_fix_quick_task_detail completed successfully';
  RAISE NOTICE 'Quick Tasks now work with ota_get_task_detail RPC';
END$$;
