-- First, drop ALL existing overloads of the functions to avoid conflicts
DROP FUNCTION IF EXISTS public.ota_get_task_detail(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_get_task_evidence(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_get_task_evidence(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.ota_update_task_status(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.ota_update_task_status(UUID, TEXT, NUMERIC) CASCADE;
DROP FUNCTION IF EXISTS public.ota_add_project_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_add_project_member(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.ota_remove_project_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_update_project_member_role(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.ota_get_project_members(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_update_project(UUID, TEXT, TEXT, TEXT, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS public.ota_get_project_detail(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_get_tasks_with_assignees(UUID, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_get_tasks_with_assignees() CASCADE;
DROP FUNCTION IF EXISTS public.ota_get_available_assignees(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_add_task_comment(UUID, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_add_task_comment(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.ota_get_task_comments(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.ota_edit_task_comment(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.ota_delete_task_comment(UUID) CASCADE;

-- ============================================================
-- 013: TASK DETAIL RPC
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
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access task details');
  END IF;
  
  SELECT t.*, p.name as project_name, p.property_id, pm.property_name
  INTO v_task
  FROM ota_tasks t
  JOIN ota_projects p ON p.id = t.project_id
  JOIN properties_mirror pm ON pm.id = p.property_id
  WHERE t.id = p_task_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist');
  END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  IF v_task.assignee_id IS NOT NULL THEN
    SELECT json_build_object('id', u.id, 'email', u.email, 'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.email))
    INTO v_assignee_info FROM auth.users u WHERE u.id = v_task.assignee_id;
  END IF;
  
  SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::json)
  INTO v_evidence
  FROM (
    SELECT te.id, te.evidence_type, te.file_url, te.file_name, te.file_size_bytes, te.mime_type, te.description,
           te.review_status, te.reviewed_at, te.review_notes, te.created_at, te.created_by,
           COALESCE(cu.raw_user_meta_data->>'full_name', cu.email) as created_by_name,
           CASE WHEN te.reviewed_by IS NOT NULL THEN COALESCE(ru.raw_user_meta_data->>'full_name', ru.email) ELSE NULL END as reviewed_by_name
    FROM ota_task_evidence te
    LEFT JOIN auth.users cu ON cu.id = te.created_by
    LEFT JOIN auth.users ru ON ru.id = te.reviewed_by
    WHERE te.task_id = p_task_id
  ) e;
  
  SELECT json_build_object('id', p.id, 'name', p.name, 'status', p.status, 'property_id', p.property_id, 'property_name', pm.property_name)
  INTO v_project_info FROM ota_projects p JOIN properties_mirror pm ON pm.id = p.property_id WHERE p.id = v_task.project_id;
  
  RETURN json_build_object(
    'success', true,
    'task', json_build_object(
      'id', v_task.id, 'title', v_task.title, 'description', v_task.description, 'status', v_task.status,
      'priority', v_task.priority, 'due_date', v_task.due_date, 'started_at', v_task.started_at,
      'completed_at', v_task.completed_at, 'estimated_hours', v_task.estimated_hours, 'actual_hours', v_task.actual_hours,
      'tags', v_task.tags, 'created_at', v_task.created_at, 'assignee', v_assignee_info
    ),
    'project', v_project_info,
    'evidence', v_evidence,
    'evidence_summary', (
      SELECT json_build_object('total', COUNT(*), 'pending', COUNT(*) FILTER (WHERE review_status = 'PENDING'),
        'approved', COUNT(*) FILTER (WHERE review_status = 'APPROVED'), 'rejected', COUNT(*) FILTER (WHERE review_status = 'REJECTED'),
        'needs_revision', COUNT(*) FILTER (WHERE review_status = 'NEEDS_REVISION'))
      FROM ota_task_evidence WHERE task_id = p_task_id
    ),
    'can_complete', (SELECT COUNT(*) > 0 FROM ota_task_evidence WHERE task_id = p_task_id AND review_status = 'APPROVED')
  );
EXCEPTION
  WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_task_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_task_detail(UUID) TO authenticated;

-- ============================================================
-- ota_get_task_evidence
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_task_evidence(
  p_task_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_evidence JSON;
BEGIN
  IF NOT is_ota_role() THEN
    RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access evidence');
  END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist'); END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.created_at DESC), '[]'::json)
  INTO v_evidence
  FROM (
    SELECT te.id, te.evidence_type, te.file_url, te.file_name, te.file_size_bytes, te.mime_type, te.description,
           te.review_status, te.reviewed_at, te.review_notes, te.created_at, te.created_by,
           COALESCE(cu.raw_user_meta_data->>'full_name', cu.email) as created_by_name,
           CASE WHEN te.reviewed_by IS NOT NULL THEN COALESCE(ru.raw_user_meta_data->>'full_name', ru.email) ELSE NULL END as reviewed_by_name
    FROM ota_task_evidence te
    LEFT JOIN auth.users cu ON cu.id = te.created_by
    LEFT JOIN auth.users ru ON ru.id = te.reviewed_by
    WHERE te.task_id = p_task_id
  ) e;
  
  RETURN json_build_object('success', true, 'evidence', v_evidence);
EXCEPTION
  WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_task_evidence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_task_evidence(UUID) TO authenticated;

-- ============================================================
-- 014: ota_update_task_status with EVIDENCE HARD LOCK
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
  v_project_role TEXT;
  v_approved_evidence_count INT;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can update tasks'); END IF;
  
  SELECT * INTO v_task FROM ota_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist'); END IF;
  
  IF NOT has_ota_project_access(v_task.project_id) THEN
    RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project');
  END IF;
  
  v_project_role := get_ota_project_role(v_task.project_id);
  
  IF v_project_role = 'STAFF' AND v_task.assignee_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'NOT_ASSIGNEE', 'message', 'Staff can only update their own assigned tasks');
  END IF;
  
  IF v_task.status = 'CANCELLED' THEN
    RETURN json_build_object('success', false, 'error', 'INVALID_TRANSITION', 'message', 'Cannot change status of cancelled task');
  END IF;
  
  -- HARD LOCK: DONE requires approved evidence
  IF p_new_status = 'DONE' THEN
    SELECT COUNT(*) INTO v_approved_evidence_count FROM ota_task_evidence WHERE task_id = p_task_id AND review_status = 'APPROVED';
    IF v_approved_evidence_count = 0 THEN
      RETURN json_build_object('success', false, 'error', 'EVIDENCE_REQUIRED', 'message', 'Task cannot be marked as DONE without at least one approved evidence.');
    END IF;
  END IF;
  
  UPDATE ota_tasks SET 
    status = p_new_status::ota_task_status,
    actual_hours = COALESCE(p_actual_hours, actual_hours),
    started_at = CASE WHEN p_new_status = 'IN_PROGRESS' AND started_at IS NULL THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'DONE' THEN now() ELSE completed_at END
  WHERE id = p_task_id;
  
  RETURN json_build_object('success', true, 'task_id', p_task_id, 'old_status', v_task.status, 'new_status', p_new_status, 'message', 'Task status updated successfully');
EXCEPTION
  WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_update_task_status(UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_task_status(UUID, TEXT, NUMERIC) TO authenticated;

-- ============================================================
-- 015: MEMBER MANAGEMENT RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_add_project_member(p_project_id UUID, p_user_id UUID, p_project_role TEXT DEFAULT 'STAFF')
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_id UUID; v_caller_project_role TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF NOT is_ota_lead_or_admin() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only Lead/Admin can manage project members'); END IF;
  v_caller_project_role := get_ota_project_role(p_project_id);
  IF v_caller_project_role = 'STAFF' THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Staff cannot add project members'); END IF;
  IF NOT EXISTS (SELECT 1 FROM ota_projects WHERE id = p_project_id) THEN RETURN json_build_object('success', false, 'error', 'PROJECT_NOT_FOUND', 'message', 'Project does not exist'); END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RETURN json_build_object('success', false, 'error', 'USER_NOT_FOUND', 'message', 'User does not exist'); END IF;
  IF p_project_role NOT IN ('STAFF', 'LEAD', 'ADMIN') THEN RETURN json_build_object('success', false, 'error', 'INVALID_ROLE', 'message', 'Role must be STAFF, LEAD, or ADMIN'); END IF;
  IF EXISTS (SELECT 1 FROM ota_project_members WHERE project_id = p_project_id AND user_id = p_user_id) THEN
    UPDATE ota_project_members SET is_active = true, role = p_project_role::ota_project_role, deactivated_at = NULL, deactivated_by = NULL WHERE project_id = p_project_id AND user_id = p_user_id;
    RETURN json_build_object('success', true, 'message', 'Member reactivated with role ' || p_project_role);
  END IF;
  INSERT INTO ota_project_members (project_id, user_id, role, assigned_by) VALUES (p_project_id, p_user_id, p_project_role::ota_project_role, v_caller_id);
  RETURN json_build_object('success', true, 'message', 'Member added successfully');
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_add_project_member(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_add_project_member(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_remove_project_member(p_project_id UUID, p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_id UUID; v_caller_project_role TEXT; v_target_role TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF NOT is_ota_lead_or_admin() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only Lead/Admin can manage project members'); END IF;
  IF p_user_id = v_caller_id THEN RETURN json_build_object('success', false, 'error', 'SELF_REMOVE', 'message', 'Cannot remove yourself from project'); END IF;
  v_caller_project_role := get_ota_project_role(p_project_id);
  IF v_caller_project_role = 'STAFF' THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Staff cannot remove project members'); END IF;
  SELECT role::TEXT INTO v_target_role FROM ota_project_members WHERE project_id = p_project_id AND user_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'MEMBER_NOT_FOUND', 'message', 'User is not an active member of this project'); END IF;
  IF v_caller_project_role = 'LEAD' AND v_target_role = 'ADMIN' THEN RETURN json_build_object('success', false, 'error', 'INSUFFICIENT_PERMISSION', 'message', 'Lead cannot remove Admin members'); END IF;
  UPDATE ota_project_members SET is_active = false, deactivated_at = now(), deactivated_by = v_caller_id WHERE project_id = p_project_id AND user_id = p_user_id;
  RETURN json_build_object('success', true, 'message', 'Member removed successfully');
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_remove_project_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_remove_project_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_update_project_member_role(p_project_id UUID, p_user_id UUID, p_new_role TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_id UUID; v_caller_project_role TEXT; v_current_role TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF NOT is_ota_lead_or_admin() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only Lead/Admin can manage project members'); END IF;
  IF p_new_role NOT IN ('STAFF', 'LEAD', 'ADMIN') THEN RETURN json_build_object('success', false, 'error', 'INVALID_ROLE', 'message', 'Role must be STAFF, LEAD, or ADMIN'); END IF;
  v_caller_project_role := get_ota_project_role(p_project_id);
  IF v_caller_project_role = 'STAFF' THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Staff cannot change member roles'); END IF;
  SELECT role::TEXT INTO v_current_role FROM ota_project_members WHERE project_id = p_project_id AND user_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'MEMBER_NOT_FOUND', 'message', 'User is not an active member of this project'); END IF;
  IF v_caller_project_role = 'LEAD' AND (p_new_role = 'ADMIN' OR v_current_role = 'ADMIN') THEN RETURN json_build_object('success', false, 'error', 'INSUFFICIENT_PERMISSION', 'message', 'Lead cannot change Admin role'); END IF;
  UPDATE ota_project_members SET role = p_new_role::ota_project_role WHERE project_id = p_project_id AND user_id = p_user_id;
  RETURN json_build_object('success', true, 'old_role', v_current_role, 'new_role', p_new_role, 'message', 'Member role updated successfully');
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_update_project_member_role(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_project_member_role(UUID, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_get_project_members(p_project_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_members JSON;
BEGIN
  IF NOT is_ota_role() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access project members'); END IF;
  IF NOT has_ota_project_access(p_project_id) THEN RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project'); END IF;
  SELECT COALESCE(json_agg(row_to_json(m) ORDER BY m.role, m.assigned_at), '[]'::json) INTO v_members
  FROM (
    SELECT pm.user_id, pm.role, pm.is_active, pm.assigned_at, COALESCE(u.raw_user_meta_data->>'full_name', u.email) as display_name, u.email,
           COALESCE(ab.raw_user_meta_data->>'full_name', ab.email) as assigned_by_name
    FROM ota_project_members pm JOIN auth.users u ON u.id = pm.user_id LEFT JOIN auth.users ab ON ab.id = pm.assigned_by WHERE pm.project_id = p_project_id
  ) m;
  RETURN json_build_object('success', true, 'members', v_members);
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_project_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_project_members(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_update_project(p_project_id UUID, p_name TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL, p_start_date DATE DEFAULT NULL, p_due_date DATE DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_id UUID; v_caller_project_role TEXT; v_old_project RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF NOT is_ota_lead_or_admin() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only Lead/Admin can update project'); END IF;
  v_caller_project_role := get_ota_project_role(p_project_id);
  IF v_caller_project_role = 'STAFF' THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Staff cannot update project details'); END IF;
  SELECT * INTO v_old_project FROM ota_projects WHERE id = p_project_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'PROJECT_NOT_FOUND', 'message', 'Project does not exist'); END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED') THEN RETURN json_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Invalid project status'); END IF;
  UPDATE ota_projects SET name = COALESCE(p_name, name), description = COALESCE(p_description, description), status = COALESCE(p_status::ota_project_status, status), start_date = COALESCE(p_start_date, start_date), due_date = COALESCE(p_due_date, due_date), completed_at = CASE WHEN p_status = 'COMPLETED' AND status != 'COMPLETED' THEN now() ELSE completed_at END WHERE id = p_project_id;
  RETURN json_build_object('success', true, 'message', 'Project updated successfully');
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_update_project(UUID, TEXT, TEXT, TEXT, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_project(UUID, TEXT, TEXT, TEXT, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_get_project_detail(p_project_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_project RECORD; v_stats JSON; v_members JSON;
BEGIN
  IF NOT is_ota_role() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access project details'); END IF;
  IF NOT has_ota_project_access(p_project_id) THEN RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project'); END IF;
  SELECT p.*, pm.property_name INTO v_project FROM ota_projects p JOIN properties_mirror pm ON pm.id = p.property_id WHERE p.id = p_project_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'PROJECT_NOT_FOUND', 'message', 'Project does not exist'); END IF;
  SELECT json_build_object('total', COUNT(*), 'todo', COUNT(*) FILTER (WHERE status = 'TODO'), 'in_progress', COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'), 'review', COUNT(*) FILTER (WHERE status = 'REVIEW'), 'done', COUNT(*) FILTER (WHERE status = 'DONE'), 'blocked', COUNT(*) FILTER (WHERE status = 'BLOCKED'), 'overdue', COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('DONE', 'CANCELLED'))) INTO v_stats FROM ota_tasks WHERE project_id = p_project_id AND status != 'CANCELLED';
  SELECT json_build_object('total', COUNT(*), 'active', COUNT(*) FILTER (WHERE is_active = true)) INTO v_members FROM ota_project_members WHERE project_id = p_project_id;
  RETURN json_build_object('success', true, 'project', json_build_object('id', v_project.id, 'name', v_project.name, 'description', v_project.description, 'property_id', v_project.property_id, 'property_name', v_project.property_name, 'status', v_project.status, 'start_date', v_project.start_date, 'due_date', v_project.due_date, 'completed_at', v_project.completed_at, 'created_at', v_project.created_at), 'task_stats', v_stats, 'member_stats', v_members);
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_project_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_project_detail(UUID) TO authenticated;

-- ============================================================
-- 016: ASSIGNEE DISPLAY NAMES
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_tasks_with_assignees(p_project_id UUID DEFAULT NULL, p_status TEXT DEFAULT NULL, p_assignee_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tasks JSON; v_is_lead BOOLEAN; v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF NOT is_ota_role() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access tasks'); END IF;
  v_is_lead := is_ota_lead_or_admin();
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.priority DESC, t.due_date ASC NULLS LAST, t.created_at DESC), '[]'::json) INTO v_tasks
  FROM (
    SELECT tk.id, tk.project_id, tk.title, tk.description, tk.assignee_id, tk.status, tk.priority, tk.due_date, tk.started_at, tk.completed_at, tk.estimated_hours, tk.actual_hours, tk.tags, tk.created_at, p.name as project_name, pm.property_name,
           COALESCE(au.raw_user_meta_data->>'full_name', au.email) as assignee_name, au.email as assignee_email,
           (SELECT json_build_object('total', COUNT(*), 'approved', COUNT(*) FILTER (WHERE review_status = 'APPROVED'), 'pending', COUNT(*) FILTER (WHERE review_status = 'PENDING')) FROM ota_task_evidence e WHERE e.task_id = tk.id) as evidence_summary
    FROM ota_tasks tk JOIN ota_projects p ON p.id = tk.project_id JOIN properties_mirror pm ON pm.id = p.property_id LEFT JOIN auth.users au ON au.id = tk.assignee_id
    WHERE tk.status != 'CANCELLED' AND (v_is_lead AND has_ota_project_access(tk.project_id) OR (NOT v_is_lead AND tk.assignee_id = v_caller_id))
      AND (p_project_id IS NULL OR tk.project_id = p_project_id) AND (p_status IS NULL OR tk.status = p_status::ota_task_status) AND (p_assignee_id IS NULL OR tk.assignee_id = p_assignee_id)
  ) t;
  RETURN json_build_object('success', true, 'tasks', v_tasks);
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_tasks_with_assignees(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_tasks_with_assignees(UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_get_available_assignees(p_project_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_users JSON;
BEGIN
  IF NOT is_ota_role() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can access assignees'); END IF;
  IF NOT has_ota_project_access(p_project_id) THEN RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this project'); END IF;
  SELECT COALESCE(json_agg(row_to_json(u) ORDER BY u.display_name), '[]'::json) INTO v_users
  FROM (SELECT pm.user_id as id, pm.role, COALESCE(au.raw_user_meta_data->>'full_name', au.email) as display_name, au.email FROM ota_project_members pm JOIN auth.users au ON au.id = pm.user_id WHERE pm.project_id = p_project_id AND pm.is_active = true) u;
  RETURN json_build_object('success', true, 'assignees', v_users);
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_available_assignees(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_available_assignees(UUID) TO authenticated;

-- ============================================================
-- 017: TASK COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES ota_tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  parent_id UUID REFERENCES ota_task_comments(id) ON DELETE CASCADE,
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ota_task_comments_task_id ON ota_task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_ota_task_comments_author_id ON ota_task_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_ota_task_comments_parent_id ON ota_task_comments(parent_id);

ALTER TABLE ota_task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ota_task_comments_select" ON ota_task_comments;

CREATE POLICY "ota_task_comments_select" ON ota_task_comments FOR SELECT TO authenticated
  USING (is_ota_role() AND EXISTS (SELECT 1 FROM ota_tasks t JOIN ota_projects p ON p.id = t.project_id WHERE t.id = ota_task_comments.task_id AND has_ota_project_access(p.id)));

CREATE OR REPLACE FUNCTION public.ota_add_task_comment(p_task_id UUID, p_content TEXT, p_parent_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_id UUID; v_comment_id UUID; v_project_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF NOT is_ota_role() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can add comments'); END IF;
  SELECT t.project_id INTO v_project_id FROM ota_tasks t WHERE t.id = p_task_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist'); END IF;
  IF NOT has_ota_project_access(v_project_id) THEN RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this task'); END IF;
  IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN RETURN json_build_object('success', false, 'error', 'EMPTY_CONTENT', 'message', 'Comment content cannot be empty'); END IF;
  IF p_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ota_task_comments WHERE id = p_parent_id AND task_id = p_task_id) THEN RETURN json_build_object('success', false, 'error', 'INVALID_PARENT', 'message', 'Parent comment not found'); END IF;
  INSERT INTO ota_task_comments (task_id, author_id, content, parent_id) VALUES (p_task_id, v_caller_id, TRIM(p_content), p_parent_id) RETURNING id INTO v_comment_id;
  RETURN json_build_object('success', true, 'comment_id', v_comment_id, 'message', 'Comment added successfully');
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_add_task_comment(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_add_task_comment(UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_get_task_comments(p_task_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_comments JSON; v_project_id UUID;
BEGIN
  IF NOT is_ota_role() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only OTA role can view comments'); END IF;
  SELECT t.project_id INTO v_project_id FROM ota_tasks t WHERE t.id = p_task_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'TASK_NOT_FOUND', 'message', 'Task does not exist'); END IF;
  IF NOT has_ota_project_access(v_project_id) THEN RETURN json_build_object('success', false, 'error', 'PROJECT_ACCESS_DENIED', 'message', 'No access to this task'); END IF;
  SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.created_at ASC), '[]'::json) INTO v_comments
  FROM (SELECT tc.id, tc.task_id, tc.author_id, tc.content, tc.parent_id, tc.is_edited, tc.edited_at, tc.created_at, COALESCE(u.raw_user_meta_data->>'full_name', u.email) as author_name, u.email as author_email FROM ota_task_comments tc JOIN auth.users u ON u.id = tc.author_id WHERE tc.task_id = p_task_id) c;
  RETURN json_build_object('success', true, 'comments', v_comments);
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_get_task_comments(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_task_comments(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_edit_task_comment(p_comment_id UUID, p_content TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_id UUID; v_author_id UUID;
BEGIN
  v_caller_id := auth.uid();
  SELECT author_id INTO v_author_id FROM ota_task_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'COMMENT_NOT_FOUND', 'message', 'Comment does not exist'); END IF;
  IF v_author_id != v_caller_id THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only the author can edit this comment'); END IF;
  IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN RETURN json_build_object('success', false, 'error', 'EMPTY_CONTENT', 'message', 'Comment content cannot be empty'); END IF;
  UPDATE ota_task_comments SET content = TRIM(p_content), is_edited = true, edited_at = now() WHERE id = p_comment_id;
  RETURN json_build_object('success', true, 'message', 'Comment updated successfully');
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_edit_task_comment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_edit_task_comment(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.ota_delete_task_comment(p_comment_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_id UUID; v_author_id UUID; v_task_id UUID; v_project_id UUID;
BEGIN
  v_caller_id := auth.uid();
  SELECT author_id, task_id INTO v_author_id, v_task_id FROM ota_task_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'COMMENT_NOT_FOUND', 'message', 'Comment does not exist'); END IF;
  SELECT project_id INTO v_project_id FROM ota_tasks WHERE id = v_task_id;
  IF v_author_id != v_caller_id AND NOT is_ota_lead_or_admin() THEN RETURN json_build_object('success', false, 'error', 'ACCESS_DENIED', 'message', 'Only the author or Lead/Admin can delete this comment'); END IF;
  DELETE FROM ota_task_comments WHERE id = p_comment_id;
  RETURN json_build_object('success', true, 'message', 'Comment deleted successfully');
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLSTATE, 'message', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.ota_delete_task_comment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_delete_task_comment(UUID) TO authenticated;