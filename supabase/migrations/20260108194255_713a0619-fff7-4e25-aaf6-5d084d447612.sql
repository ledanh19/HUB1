-- ============================================================
-- OTA OPERATIONS MODULE - 028: CLASSIFICATION-BASED EVIDENCE RULES
-- ============================================================

-- STEP 1: Add require_evidence column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_tasks' 
    AND column_name = 'require_evidence'
  ) THEN
    ALTER TABLE public.ota_tasks 
    ADD COLUMN require_evidence BOOLEAN DEFAULT true;
    RAISE NOTICE 'Added require_evidence column to ota_tasks';
  ELSE
    RAISE NOTICE 'Column require_evidence already exists on ota_tasks';
  END IF;
END$$;

-- STEP 2: Backfill existing tasks based on classification
UPDATE public.ota_tasks
SET 
  require_evidence = CASE 
    WHEN classification = 'EXECUTION' THEN true
    WHEN classification IN ('PREP', 'AUTO', 'OPS') THEN false
    ELSE true
  END,
  min_evidence_count = CASE 
    WHEN classification = 'EXECUTION' THEN GREATEST(COALESCE(min_evidence_count, 1), 1)
    WHEN classification IN ('PREP', 'AUTO', 'OPS') THEN 0
    ELSE COALESCE(min_evidence_count, 1)
  END
WHERE require_evidence IS NULL 
   OR (classification IN ('PREP', 'AUTO', 'OPS') AND require_evidence = true);

-- STEP 3: Create trigger to auto-set evidence rules on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.ota_task_set_evidence_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.classification IS DISTINCT FROM NEW.classification) THEN
    IF NEW.classification = 'EXECUTION' THEN
      NEW.require_evidence := COALESCE(NEW.require_evidence, true);
      NEW.min_evidence_count := GREATEST(COALESCE(NEW.min_evidence_count, 1), 1);
    ELSIF NEW.classification IN ('PREP', 'AUTO', 'OPS') THEN
      NEW.require_evidence := COALESCE(NEW.require_evidence, false);
      NEW.min_evidence_count := COALESCE(NEW.min_evidence_count, 0);
    ELSE
      NEW.require_evidence := COALESCE(NEW.require_evidence, true);
      NEW.min_evidence_count := COALESCE(NEW.min_evidence_count, 1);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ota_task_evidence_rules ON public.ota_tasks;
CREATE TRIGGER tr_ota_task_evidence_rules
  BEFORE INSERT OR UPDATE ON public.ota_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.ota_task_set_evidence_rules();

-- STEP 4: Update DONE guard RPC to respect require_evidence
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
  v_require_evidence BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can update tasks'
    );
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'TASK_NOT_FOUND',
      'message', 'Task does not exist'
    );
  END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this project'
    );
  END IF;
  
  v_project_role := get_ota_project_role(v_task.project_id);
  
  IF v_project_role = 'STAFF' AND v_task.assignee_id != v_user_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'NOT_ASSIGNEE',
      'message', 'Staff can only update their own assigned tasks'
    );
  END IF;
  
  IF v_task.status = 'CANCELLED' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_TRANSITION',
      'message', 'Cannot change status of cancelled task'
    );
  END IF;
  
  IF UPPER(p_new_status) = 'DONE' THEN
    v_require_evidence := COALESCE(v_task.require_evidence, true);
    v_min_required := COALESCE(v_task.min_evidence_count, 1);
    
    IF v_require_evidence AND v_min_required > 0 THEN
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
          'required_count', v_min_required,
          'require_evidence', v_require_evidence
        );
      END IF;
    END IF;
  END IF;
  
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

-- STEP 5: Update trigger to respect require_evidence
CREATE OR REPLACE FUNCTION public.enforce_ota_task_done_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_approved_count INT;
  v_min_required INT;
  v_require_evidence BOOLEAN;
BEGIN
  IF NEW.status = 'DONE' AND (OLD.status IS NULL OR OLD.status != 'DONE') THEN
    v_require_evidence := COALESCE(NEW.require_evidence, true);
    v_min_required := COALESCE(NEW.min_evidence_count, 1);
    
    IF v_require_evidence AND v_min_required > 0 THEN
      SELECT COUNT(*) INTO v_approved_count
      FROM ota_task_evidence
      WHERE task_id = NEW.id
      AND review_status = 'APPROVED';
      
      IF v_approved_count < v_min_required THEN
        RAISE EXCEPTION 'DONE_GUARD_VIOLATION: Task requires % approved evidence, found %. Please get evidence approved first.', v_min_required, v_approved_count
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 6: DONE IMMUTABILITY - FIELD-LEVEL ONLY
CREATE OR REPLACE FUNCTION public.enforce_ota_task_done_immutable()
RETURNS TRIGGER AS $$
DECLARE
  v_immutable_fields TEXT[] := ARRAY['status', 'title', 'description', 'project_id', 'assignee_id', 'priority', 'due_date'];
  v_field TEXT;
BEGIN
  IF OLD.status = 'DONE' THEN
    FOREACH v_field IN ARRAY v_immutable_fields
    LOOP
      IF v_field = 'status' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'DONE_IMMUTABLE: Cannot change status of DONE task. Field: %', v_field
          USING ERRCODE = 'P0002';
      ELSIF v_field = 'title' AND NEW.title IS DISTINCT FROM OLD.title THEN
        RAISE EXCEPTION 'DONE_IMMUTABLE: Cannot change title of DONE task. Field: %', v_field
          USING ERRCODE = 'P0002';
      ELSIF v_field = 'description' AND NEW.description IS DISTINCT FROM OLD.description THEN
        RAISE EXCEPTION 'DONE_IMMUTABLE: Cannot change description of DONE task. Field: %', v_field
          USING ERRCODE = 'P0002';
      ELSIF v_field = 'project_id' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
        RAISE EXCEPTION 'DONE_IMMUTABLE: Cannot change project_id of DONE task. Field: %', v_field
          USING ERRCODE = 'P0002';
      ELSIF v_field = 'assignee_id' AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
        RAISE EXCEPTION 'DONE_IMMUTABLE: Cannot change assignee_id of DONE task. Field: %', v_field
          USING ERRCODE = 'P0002';
      ELSIF v_field = 'priority' AND NEW.priority IS DISTINCT FROM OLD.priority THEN
        RAISE EXCEPTION 'DONE_IMMUTABLE: Cannot change priority of DONE task. Field: %', v_field
          USING ERRCODE = 'P0002';
      ELSIF v_field = 'due_date' AND NEW.due_date IS DISTINCT FROM OLD.due_date THEN
        RAISE EXCEPTION 'DONE_IMMUTABLE: Cannot change due_date of DONE task. Field: %', v_field
          USING ERRCODE = 'P0002';
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ota_task_done_immutable ON public.ota_tasks;
CREATE TRIGGER tr_ota_task_done_immutable
  BEFORE UPDATE ON public.ota_tasks
  FOR EACH ROW
  WHEN (OLD.status = 'DONE')
  EXECUTE FUNCTION public.enforce_ota_task_done_immutable();

-- STEP 7: UPDATE BULK APPROVE RPC - FIX 3: PROJECT ACCESS PER TASK
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
  v_task RECORD;
  v_evidence RECORD;
  v_approved_count INT := 0;
  v_skipped_count INT := 0;
  v_task_count INT := 0;
  v_results JSON[] := '{}';
  v_task_approved INT;
  v_task_skipped INT;
BEGIN
  v_user_id := auth.uid();
  
  v_is_lead_or_admin := is_ota_lead_or_admin();
  
  IF NOT v_is_lead_or_admin THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead or Admin can bulk approve evidence'
    );
  END IF;
  
  IF p_task_ids IS NULL OR array_length(p_task_ids, 1) = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_INPUT',
      'message', 'No task IDs provided'
    );
  END IF;
  
  FOREACH v_task_id IN ARRAY p_task_ids
  LOOP
    v_task_approved := 0;
    v_task_skipped := 0;
    
    SELECT * INTO v_task FROM ota_tasks t
    WHERE t.id = v_task_id;
    
    IF NOT FOUND THEN
      v_skipped_count := v_skipped_count + 1;
      v_results := array_append(v_results, json_build_object(
        'task_id', v_task_id,
        'status', 'SKIPPED',
        'reason', 'TASK_NOT_FOUND'
      ));
      CONTINUE;
    END IF;
    
    IF NOT has_ota_project_access(v_task.project_id) THEN
      v_skipped_count := v_skipped_count + 1;
      v_results := array_append(v_results, json_build_object(
        'task_id', v_task_id,
        'status', 'SKIPPED',
        'reason', 'PROJECT_ACCESS_DENIED',
        'project_id', v_task.project_id
      ));
      CONTINUE;
    END IF;
    
    v_task_count := v_task_count + 1;
    
    FOR v_evidence IN
      SELECT id, task_id, review_status
      FROM ota_task_evidence
      WHERE task_id = v_task_id
      AND review_status IN ('PENDING', 'NEEDS_REVISION')
    LOOP
      UPDATE ota_task_evidence
      SET 
        review_status = 'APPROVED',
        reviewed_by = v_user_id,
        reviewed_at = now(),
        review_comment = COALESCE(p_comment, 'Bulk approved'),
        updated_at = now()
      WHERE id = v_evidence.id;
      
      INSERT INTO ota_audit_log (
        action,
        entity_type,
        entity_id,
        project_id,
        old_data,
        new_data,
        performed_by
      ) VALUES (
        'EVIDENCE_APPROVED',
        'evidence',
        v_evidence.id,
        v_task.project_id,
        json_build_object('review_status', v_evidence.review_status),
        json_build_object(
          'review_status', 'APPROVED',
          'bulk_action', true,
          'comment', COALESCE(p_comment, 'Bulk approved')
        ),
        v_user_id
      );
      
      v_task_approved := v_task_approved + 1;
      v_approved_count := v_approved_count + 1;
    END LOOP;
    
    v_results := array_append(v_results, json_build_object(
      'task_id', v_task_id,
      'project_id', v_task.project_id,
      'status', 'PROCESSED',
      'approved', v_task_approved,
      'total_approved', (
        SELECT COUNT(*) FROM ota_task_evidence 
        WHERE task_id = v_task_id AND review_status = 'APPROVED'
      )
    ));
  END LOOP;
  
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
    json_build_object(
      'task_ids', p_task_ids,
      'input_count', array_length(p_task_ids, 1)
    ),
    json_build_object(
      'approved_count', v_approved_count,
      'task_count', v_task_count,
      'skipped_count', v_skipped_count,
      'comment', p_comment
    ),
    v_user_id
  );
  
  RETURN json_build_object(
    'success', true,
    'approved_count', v_approved_count,
    'task_count', v_task_count,
    'skipped_count', v_skipped_count,
    'results', v_results,
    'message', format('Approved %s evidence across %s tasks (%s skipped due to access)', 
                      v_approved_count, v_task_count, v_skipped_count)
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

-- STEP 8: Comments
COMMENT ON COLUMN public.ota_tasks.require_evidence IS 
  'Whether this task requires approved evidence to be marked DONE. Auto-set based on classification: EXECUTION=true, PREP/AUTO/OPS=false';

COMMENT ON FUNCTION public.ota_task_set_evidence_rules IS 
  'Trigger function to auto-set require_evidence and min_evidence_count based on task classification';

COMMENT ON FUNCTION public.enforce_ota_task_done_immutable IS 
  'Trigger function that enforces field-level immutability on DONE tasks. Core fields locked, metadata fields allowed.';

COMMENT ON FUNCTION public.ota_bulk_approve_evidence IS
  'RPC for bulk approving evidence. Checks project access per task, only approves PENDING/NEEDS_REVISION status, full audit logging.';