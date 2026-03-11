-- ============================================================
-- OTA OPERATIONS MODULE - 025: TASK CLASSIFICATION
-- ============================================================

-- STEP 1: Create enum type (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_task_classification') THEN
    CREATE TYPE public.ota_task_classification AS ENUM (
      'EXECUTION',
      'PREP',
      'AUTO',
      'OPS'
    );
    RAISE NOTICE 'Created enum type ota_task_classification';
  ELSE
    RAISE NOTICE 'Enum type ota_task_classification already exists, skipping';
  END IF;
END$$;

-- STEP 2: Add column to ota_tasks (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_tasks' 
    AND column_name = 'classification'
  ) THEN
    ALTER TABLE public.ota_tasks 
    ADD COLUMN classification public.ota_task_classification DEFAULT 'EXECUTION';
    RAISE NOTICE 'Added classification column to ota_tasks';
  ELSE
    RAISE NOTICE 'Column classification already exists on ota_tasks';
  END IF;
END$$;

-- STEP 3: Create index for filtering
CREATE INDEX IF NOT EXISTS idx_ota_tasks_classification 
ON public.ota_tasks(classification);

-- STEP 4: Create partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ota_tasks_classification_execution 
ON public.ota_tasks(project_id, status) 
WHERE classification = 'EXECUTION';

CREATE INDEX IF NOT EXISTS idx_ota_tasks_classification_ops 
ON public.ota_tasks(project_id, status) 
WHERE classification = 'OPS';

-- STEP 5: Comment for documentation
COMMENT ON COLUMN public.ota_tasks.classification IS 
  'Task classification: EXECUTION (thực thi), PREP (chuẩn bị), AUTO (tự động), OPS (vận hành)';

-- ============================================================
-- OTA OPERATIONS MODULE - 026: ISSUE TAG & EFFORT TRACKING
-- ============================================================

-- STEP 1: Add issue_tag column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_tasks' 
    AND column_name = 'issue_tag'
  ) THEN
    ALTER TABLE public.ota_tasks 
    ADD COLUMN issue_tag TEXT;
    RAISE NOTICE 'Added issue_tag column to ota_tasks';
  ELSE
    RAISE NOTICE 'Column issue_tag already exists on ota_tasks';
  END IF;
END$$;

-- Index for aggregation queries
CREATE INDEX IF NOT EXISTS idx_ota_tasks_issue_tag 
ON public.ota_tasks(issue_tag) 
WHERE issue_tag IS NOT NULL;

-- Composite index for KPI queries by issue_tag + status
CREATE INDEX IF NOT EXISTS idx_ota_tasks_issue_tag_status 
ON public.ota_tasks(issue_tag, status) 
WHERE issue_tag IS NOT NULL;

-- STEP 2: Add effort tracking in minutes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_tasks' 
    AND column_name = 'expected_effort_minutes'
  ) THEN
    ALTER TABLE public.ota_tasks 
    ADD COLUMN expected_effort_minutes INT;
    RAISE NOTICE 'Added expected_effort_minutes column to ota_tasks';
  ELSE
    RAISE NOTICE 'Column expected_effort_minutes already exists on ota_tasks';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_tasks' 
    AND column_name = 'actual_effort_minutes'
  ) THEN
    ALTER TABLE public.ota_tasks 
    ADD COLUMN actual_effort_minutes INT;
    RAISE NOTICE 'Added actual_effort_minutes column to ota_tasks';
  ELSE
    RAISE NOTICE 'Column actual_effort_minutes already exists on ota_tasks';
  END IF;
END$$;

-- STEP 3: Add min_evidence_count for enhanced DONE guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_tasks' 
    AND column_name = 'min_evidence_count'
  ) THEN
    ALTER TABLE public.ota_tasks 
    ADD COLUMN min_evidence_count INT DEFAULT 1;
    RAISE NOTICE 'Added min_evidence_count column to ota_tasks';
  ELSE
    RAISE NOTICE 'Column min_evidence_count already exists on ota_tasks';
  END IF;
END$$;

-- STEP 4: Update DONE guard RPC to check min_evidence_count
CREATE OR REPLACE FUNCTION public.ota_update_task_status(
  p_task_id UUID,
  p_new_status TEXT,
  p_actual_hours NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_user_id UUID;
  v_project_role ota_project_role;
  v_approved_count INT;
  v_min_required INT;
BEGIN
  v_user_id := auth.uid();
  
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can update tasks'
    );
  END IF;
  
  -- Get task info
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  
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
  
  -- Get user's project role
  v_project_role := get_ota_project_role(v_task.project_id);
  
  -- Staff can only update their own assigned tasks
  IF v_project_role = 'STAFF' AND v_task.assignee_id != v_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'NOT_ASSIGNEE',
      'message', 'Staff can only update their own assigned tasks'
    );
  END IF;
  
  -- Validate status transition
  IF v_task.status = 'CANCELLED' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_TRANSITION',
      'message', 'Cannot change status of cancelled task'
    );
  END IF;
  
  -- DONE GUARD: Require at least min_evidence_count approved evidence
  IF UPPER(p_new_status) = 'DONE' THEN
    v_min_required := COALESCE(v_task.min_evidence_count, 1);
    
    SELECT COUNT(*) INTO v_approved_count
    FROM ota_task_evidence
    WHERE task_id = p_task_id
    AND review_status = 'APPROVED';
    
    IF v_approved_count < v_min_required THEN
      RETURN json_build_object(
        'success', false,
        'error', 'EVIDENCE_REQUIRED',
        'message', format('Task cannot be marked DONE. Requires %s approved evidence, found %s.', v_min_required, v_approved_count),
        'approved_count', v_approved_count,
        'required_count', v_min_required
      );
    END IF;
  END IF;
  
  -- Update task with timestamps
  UPDATE ota_tasks
  SET 
    status = p_new_status::ota_task_status,
    actual_hours = COALESCE(p_actual_hours, actual_hours),
    completed_at = CASE 
      WHEN UPPER(p_new_status) = 'DONE' THEN now() 
      ELSE completed_at 
    END,
    started_at = CASE 
      WHEN UPPER(p_new_status) = 'IN_PROGRESS' AND started_at IS NULL THEN now() 
      ELSE started_at 
    END,
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = p_task_id;
  
  RETURN json_build_object(
    'success', true,
    'task_id', p_task_id,
    'old_status', v_task.status,
    'new_status', p_new_status,
    'message', 'Task status updated successfully'
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

-- STEP 5: Update trigger to check min_evidence_count
CREATE OR REPLACE FUNCTION public.enforce_ota_task_done_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_approved_count INT;
  v_min_required INT;
BEGIN
  -- Only check when status is changing TO DONE
  IF NEW.status = 'DONE' AND (OLD.status IS NULL OR OLD.status != 'DONE') THEN
    v_min_required := COALESCE(NEW.min_evidence_count, 1);
    
    SELECT COUNT(*) INTO v_approved_count
    FROM ota_task_evidence
    WHERE task_id = NEW.id
    AND review_status = 'APPROVED';
    
    IF v_approved_count < v_min_required THEN
      RAISE EXCEPTION 'DONE_GUARD_VIOLATION: Task requires % approved evidence, found %. Please get evidence approved first.', v_min_required, v_approved_count
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 6: Comments
COMMENT ON COLUMN public.ota_tasks.issue_tag IS 
  'Issue categorization tag for Ops Insight aggregation (e.g., PRICE_MISMATCH, NO_SHOW, OVERBOOKING)';

COMMENT ON COLUMN public.ota_tasks.expected_effort_minutes IS 
  'Expected effort in minutes for this task';

COMMENT ON COLUMN public.ota_tasks.actual_effort_minutes IS 
  'Actual effort in minutes spent on this task';

COMMENT ON COLUMN public.ota_tasks.min_evidence_count IS 
  'Minimum number of APPROVED evidence required to mark task DONE (default 1)';

-- ============================================================
-- OTA OPERATIONS MODULE - 027: BULK APPROVE EVIDENCE
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
    p_task_ids[1],
    NULL,
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