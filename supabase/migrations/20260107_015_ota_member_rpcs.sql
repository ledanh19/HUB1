-- ============================================================
-- OTA OPERATIONS MODULE - 015: MEMBER MANAGEMENT RPCs
-- ============================================================
-- Date: 2026-01-07
-- Updated: 2026-01-08
-- Purpose: Project member management (add/remove/update role)
-- Authorization: Caller must be project LEAD/ADMIN or global admin
-- ============================================================

-- ============================================================
-- RPC: ota_add_project_member
-- Adds a user to a project with specified role
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_add_project_member(
  p_project_id UUID,
  p_user_id UUID,
  p_project_role TEXT DEFAULT 'STAFF'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_project_role TEXT;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check caller has permission (project LEAD/ADMIN or global admin)
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead/Admin can manage project members'
    );
  END IF;
  
  -- Get caller's project role
  v_caller_project_role := get_ota_project_role(p_project_id);
  
  -- Staff cannot add members
  IF v_caller_project_role = 'STAFF' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Staff cannot add project members'
    );
  END IF;
  
  -- Validate project exists
  IF NOT EXISTS (SELECT 1 FROM ota_projects WHERE id = p_project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_NOT_FOUND',
      'message', 'Project does not exist'
    );
  END IF;
  
  -- Validate user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'USER_NOT_FOUND',
      'message', 'User does not exist'
    );
  END IF;
  
  -- Validate role
  IF p_project_role NOT IN ('STAFF', 'LEAD', 'ADMIN') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_ROLE',
      'message', 'Role must be STAFF, LEAD, or ADMIN'
    );
  END IF;
  
  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM ota_project_members 
    WHERE project_id = p_project_id AND user_id = p_user_id
  ) THEN
    -- Reactivate if inactive
    UPDATE ota_project_members
    SET is_active = true,
        role = p_project_role::ota_project_role,
        deactivated_at = NULL,
        deactivated_by = NULL
    WHERE project_id = p_project_id AND user_id = p_user_id;
    
    RETURN json_build_object(
      'success', true,
      'message', 'Member reactivated with role ' || p_project_role
    );
  END IF;
  
  -- Insert new member
  INSERT INTO ota_project_members (
    project_id,
    user_id,
    role,
    assigned_by
  ) VALUES (
    p_project_id,
    p_user_id,
    p_project_role::ota_project_role,
    v_caller_id
  );
  
  -- Audit log
  INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data, performed_by)
  VALUES (
    'INSERT',
    'ota_project_members',
    p_project_id,
    NULL,
    json_build_object('user_id', p_user_id, 'role', p_project_role),
    v_caller_id
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Member added successfully'
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

REVOKE ALL ON FUNCTION public.ota_add_project_member FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_add_project_member TO authenticated;

-- ============================================================
-- RPC: ota_remove_project_member
-- Removes (deactivates) a user from a project
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_remove_project_member(
  p_project_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_project_role TEXT;
  v_target_role TEXT;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check caller has permission
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead/Admin can manage project members'
    );
  END IF;
  
  -- Cannot remove yourself
  IF p_user_id = v_caller_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'SELF_REMOVE',
      'message', 'Cannot remove yourself from project'
    );
  END IF;
  
  -- Get caller's project role
  v_caller_project_role := get_ota_project_role(p_project_id);
  
  -- Staff cannot remove members
  IF v_caller_project_role = 'STAFF' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Staff cannot remove project members'
    );
  END IF;
  
  -- Get target member role
  SELECT role::TEXT INTO v_target_role
  FROM ota_project_members
  WHERE project_id = p_project_id AND user_id = p_user_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'MEMBER_NOT_FOUND',
      'message', 'User is not an active member of this project'
    );
  END IF;
  
  -- LEAD cannot remove ADMIN
  IF v_caller_project_role = 'LEAD' AND v_target_role = 'ADMIN' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INSUFFICIENT_PERMISSION',
      'message', 'Lead cannot remove Admin members'
    );
  END IF;
  
  -- Deactivate member (soft delete)
  UPDATE ota_project_members
  SET is_active = false,
      deactivated_at = now(),
      deactivated_by = v_caller_id
  WHERE project_id = p_project_id AND user_id = p_user_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data, performed_by)
  VALUES (
    'UPDATE',
    'ota_project_members',
    p_project_id,
    json_build_object('user_id', p_user_id, 'is_active', true),
    json_build_object('user_id', p_user_id, 'is_active', false),
    v_caller_id
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Member removed successfully'
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

REVOKE ALL ON FUNCTION public.ota_remove_project_member FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_remove_project_member TO authenticated;

-- ============================================================
-- RPC: ota_update_project_member_role
-- Changes a member's role in a project
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_update_project_member_role(
  p_project_id UUID,
  p_user_id UUID,
  p_new_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_project_role TEXT;
  v_current_role TEXT;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check caller has permission
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead/Admin can manage project members'
    );
  END IF;
  
  -- Validate role
  IF p_new_role NOT IN ('STAFF', 'LEAD', 'ADMIN') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_ROLE',
      'message', 'Role must be STAFF, LEAD, or ADMIN'
    );
  END IF;
  
  -- Get caller's project role
  v_caller_project_role := get_ota_project_role(p_project_id);
  
  -- Staff cannot change roles
  IF v_caller_project_role = 'STAFF' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Staff cannot change member roles'
    );
  END IF;
  
  -- Get current member role
  SELECT role::TEXT INTO v_current_role
  FROM ota_project_members
  WHERE project_id = p_project_id AND user_id = p_user_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'MEMBER_NOT_FOUND',
      'message', 'User is not an active member of this project'
    );
  END IF;
  
  -- LEAD cannot promote to ADMIN or demote ADMIN
  IF v_caller_project_role = 'LEAD' AND (p_new_role = 'ADMIN' OR v_current_role = 'ADMIN') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INSUFFICIENT_PERMISSION',
      'message', 'Lead cannot change Admin role'
    );
  END IF;
  
  -- Update role
  UPDATE ota_project_members
  SET role = p_new_role::ota_project_role
  WHERE project_id = p_project_id AND user_id = p_user_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data, performed_by)
  VALUES (
    'UPDATE',
    'ota_project_members',
    p_project_id,
    json_build_object('user_id', p_user_id, 'role', v_current_role),
    json_build_object('user_id', p_user_id, 'role', p_new_role),
    v_caller_id
  );
  
  RETURN json_build_object(
    'success', true,
    'old_role', v_current_role,
    'new_role', p_new_role,
    'message', 'Member role updated successfully'
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

REVOKE ALL ON FUNCTION public.ota_update_project_member_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_project_member_role TO authenticated;

-- ============================================================
-- RPC: ota_get_project_members
-- Returns all members of a project with user info
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_project_members(
  p_project_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members JSON;
BEGIN
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access project members'
    );
  END IF;
  
  -- Check project access
  IF NOT has_ota_project_access(p_project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this project'
    );
  END IF;
  
  SELECT COALESCE(json_agg(row_to_json(m) ORDER BY m.role, m.assigned_at), '[]'::json)
  INTO v_members
  FROM (
    SELECT 
      pm.user_id,
      pm.role,
      pm.is_active,
      pm.assigned_at,
      COALESCE(u.raw_user_meta_data->>'full_name', u.email) as display_name,
      u.email,
      COALESCE(ab.raw_user_meta_data->>'full_name', ab.email) as assigned_by_name
    FROM ota_project_members pm
    JOIN auth.users u ON u.id = pm.user_id
    LEFT JOIN auth.users ab ON ab.id = pm.assigned_by
    WHERE pm.project_id = p_project_id
  ) m;
  
  RETURN json_build_object(
    'success', true,
    'members', v_members
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

REVOKE ALL ON FUNCTION public.ota_get_project_members FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_project_members TO authenticated;

-- ============================================================
-- RPC: ota_update_project
-- Updates project details (name, description, status, dates)
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_update_project(
  p_project_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_due_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_caller_project_role ota_project_role;
  v_old_project RECORD;
BEGIN
  v_caller_id := auth.uid();
  
  -- Check caller has permission
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead/Admin can update project'
    );
  END IF;
  
  -- Get caller's project role
  v_caller_project_role := get_ota_project_role(p_project_id);
  
  -- Staff cannot update project
  IF v_caller_project_role = 'STAFF' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Staff cannot update project details'
    );
  END IF;
  
  -- Get current project data for audit
  SELECT * INTO v_old_project FROM ota_projects WHERE id = p_project_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_NOT_FOUND',
      'message', 'Project does not exist'
    );
  END IF;
  
  -- Validate status if provided
  IF p_status IS NOT NULL AND p_status NOT IN ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'Invalid project status'
    );
  END IF;
  
  -- Update project (only non-null params)
  UPDATE ota_projects
  SET 
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    status = COALESCE(p_status::ota_project_status, status),
    start_date = COALESCE(p_start_date, start_date),
    due_date = COALESCE(p_due_date, due_date),
    completed_at = CASE 
      WHEN p_status = 'COMPLETED' AND status != 'COMPLETED' THEN now()
      ELSE completed_at
    END
  WHERE id = p_project_id;
  
  -- Audit log
  INSERT INTO audit_logs (action, table_name, record_id, old_data, new_data, performed_by)
  VALUES (
    'UPDATE',
    'ota_projects',
    p_project_id,
    row_to_json(v_old_project),
    json_build_object(
      'name', COALESCE(p_name, v_old_project.name),
      'status', COALESCE(p_status, v_old_project.status::text)
    ),
    v_caller_id
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Project updated successfully'
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

REVOKE ALL ON FUNCTION public.ota_update_project FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_update_project TO authenticated;

-- ============================================================
-- RPC: ota_get_project_detail
-- Returns complete project info with stats
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_get_project_detail(
  p_project_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project RECORD;
  v_stats JSON;
  v_members JSON;
BEGIN
  -- Check OTA role
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access project details'
    );
  END IF;
  
  -- Check project access
  IF NOT has_ota_project_access(p_project_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_ACCESS_DENIED',
      'message', 'No access to this project'
    );
  END IF;
  
  -- Get project with property info
  SELECT 
    p.*,
    pm.property_name
  INTO v_project
  FROM ota_projects p
  JOIN properties_mirror pm ON pm.id = p.property_id
  WHERE p.id = p_project_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'PROJECT_NOT_FOUND',
      'message', 'Project does not exist'
    );
  END IF;
  
  -- Get task stats
  SELECT json_build_object(
    'total', COUNT(*),
    'todo', COUNT(*) FILTER (WHERE status = 'TODO'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'),
    'review', COUNT(*) FILTER (WHERE status = 'REVIEW'),
    'done', COUNT(*) FILTER (WHERE status = 'DONE'),
    'blocked', COUNT(*) FILTER (WHERE status = 'BLOCKED'),
    'overdue', COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('DONE', 'CANCELLED'))
  )
  INTO v_stats
  FROM ota_tasks
  WHERE project_id = p_project_id AND status != 'CANCELLED';
  
  -- Get member count
  SELECT json_build_object(
    'total', COUNT(*),
    'active', COUNT(*) FILTER (WHERE is_active = true)
  )
  INTO v_members
  FROM ota_project_members
  WHERE project_id = p_project_id;
  
  RETURN json_build_object(
    'success', true,
    'project', json_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'description', v_project.description,
      'property_id', v_project.property_id,
      'property_name', v_project.property_name,
      'status', v_project.status,
      'start_date', v_project.start_date,
      'due_date', v_project.due_date,
      'completed_at', v_project.completed_at,
      'created_at', v_project.created_at
    ),
    'task_stats', v_stats,
    'member_stats', v_members
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

REVOKE ALL ON FUNCTION public.ota_get_project_detail FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_project_detail TO authenticated;
