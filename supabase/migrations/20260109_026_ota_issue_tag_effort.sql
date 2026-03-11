-- ============================================================
-- OTA OPERATIONS MODULE - 026: ISSUE TAG & EFFORT TRACKING
-- ============================================================
-- Date: 2026-01-09
-- Purpose: 
--   1. Add issue_tag for Ops Insight aggregation
--   2. Add expected/actual effort in minutes (more granular than hours)
-- 
-- Rollback:
--   ALTER TABLE ota_tasks DROP COLUMN IF EXISTS issue_tag;
--   ALTER TABLE ota_tasks DROP COLUMN IF EXISTS expected_effort_minutes;
--   ALTER TABLE ota_tasks DROP COLUMN IF EXISTS actual_effort_minutes;
-- ============================================================

-- ============================================================
-- STEP 1: Add issue_tag column
-- ============================================================
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

-- ============================================================
-- STEP 2: Add effort tracking in minutes
-- (existing estimated_hours/actual_hours kept for backward compat)
-- ============================================================
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

-- ============================================================
-- STEP 3: Add min_evidence_count for enhanced DONE guard
-- ============================================================
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

-- ============================================================
-- STEP 4: Update DONE guard RPC to check min_evidence_count
-- ============================================================
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
  
  -- ============================================================
  -- DONE GUARD: Require at least min_evidence_count approved evidence
  -- ============================================================
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

-- ============================================================
-- STEP 5: Update trigger to check min_evidence_count
-- ============================================================
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

-- ============================================================
-- STEP 6: Comments
-- ============================================================
COMMENT ON COLUMN public.ota_tasks.issue_tag IS 
  'Issue categorization tag for Ops Insight aggregation (e.g., PRICE_MISMATCH, NO_SHOW, OVERBOOKING)';

COMMENT ON COLUMN public.ota_tasks.expected_effort_minutes IS 
  'Expected effort in minutes for this task';

COMMENT ON COLUMN public.ota_tasks.actual_effort_minutes IS 
  'Actual effort in minutes spent on this task';

COMMENT ON COLUMN public.ota_tasks.min_evidence_count IS 
  'Minimum number of APPROVED evidence required to mark task DONE (default 1)';

RAISE NOTICE 'Migration 026_ota_issue_tag_effort completed successfully';
