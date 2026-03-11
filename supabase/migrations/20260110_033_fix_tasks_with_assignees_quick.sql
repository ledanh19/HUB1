-- ============================================================
-- OTA OPERATIONS MODULE - 033: FIX TASKS WITH ASSIGNEES FOR QUICK TASKS
-- ============================================================
-- Date: 2026-01-10
-- Purpose: Fix ota_get_tasks_with_assignees to include Quick Tasks
-- Quick Tasks are in Ops Bucket (property_id = NULL)
-- INNER JOIN properties_mirror was excluding them - changed to LEFT JOIN
-- Also added is_quick_task, is_ops_bucket flags to response
-- ============================================================

CREATE OR REPLACE FUNCTION public.ota_get_tasks_with_assignees(
  p_project_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_assignee_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tasks JSON;
  v_is_lead BOOLEAN;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access tasks'
    );
  END IF;
  
  v_is_lead := is_ota_lead_or_admin();
  
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.priority DESC, t.due_date ASC NULLS LAST, t.created_at DESC), '[]'::json)
  INTO v_tasks
  FROM (
    SELECT 
      tk.id,
      tk.project_id,
      tk.title,
      tk.description,
      tk.assignee_id,
      tk.status,
      tk.priority,
      tk.due_date,
      tk.started_at,
      tk.completed_at,
      tk.estimated_hours,
      tk.actual_hours,
      tk.tags,
      tk.created_at,
      p.name as project_name,
      -- LEFT JOIN: property_name may be NULL for Ops Bucket tasks
      pm.property_name,
      -- Quick Task flags
      COALESCE(tk.is_quick_task, false) as is_quick_task,
      (p.property_id IS NULL) as is_ops_bucket,
      -- Assignee info
      COALESCE(au.raw_user_meta_data->>'full_name', au.email) as assignee_name,
      au.email as assignee_email,
      -- Evidence summary
      (
        SELECT json_build_object(
          'total', COUNT(*),
          'approved', COUNT(*) FILTER (WHERE review_status = 'APPROVED'),
          'pending', COUNT(*) FILTER (WHERE review_status = 'PENDING')
        )
        FROM ota_task_evidence e
        WHERE e.task_id = tk.id
      ) as evidence_summary
    FROM ota_tasks tk
    JOIN ota_projects p ON p.id = tk.project_id
    -- CHANGED: LEFT JOIN to include Ops Bucket tasks (property_id = NULL)
    LEFT JOIN properties_mirror pm ON pm.id = p.property_id
    LEFT JOIN auth.users au ON au.id = tk.assignee_id
    WHERE tk.status != 'CANCELLED'
      AND (
        -- Lead/Admin sees all tasks in their projects
        v_is_lead AND has_ota_project_access(tk.project_id)
        -- Staff sees only their tasks
        OR (NOT v_is_lead AND tk.assignee_id = v_caller_id)
      )
      -- Optional filters
      AND (p_project_id IS NULL OR tk.project_id = p_project_id)
      AND (p_status IS NULL OR tk.status = p_status::ota_task_status)
      AND (p_assignee_id IS NULL OR tk.assignee_id = p_assignee_id)
  ) t;
  
  RETURN json_build_object(
    'success', true,
    'tasks', v_tasks
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

COMMENT ON FUNCTION public.ota_get_tasks_with_assignees IS 
'Fixed 2026-01-10: Changed INNER JOIN properties_mirror to LEFT JOIN 
to include Quick Tasks from Ops Bucket (property_id = NULL).
Added is_quick_task, is_ops_bucket flags to task response.';
