-- ============================================================
-- OTA OPERATIONS MODULE - 011: OTA ROLES
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Add OTA-specific roles to the app_role enum
-- 
-- New Roles:
--   - ota_staff: Basic OTA team member
--   - ota_lead: OTA team lead / supervisor
-- ============================================================

-- ============================================================
-- ADD OTA ROLES TO ENUM (if not exists)
-- ============================================================
-- Note: PostgreSQL doesn't support IF NOT EXISTS for enum values
-- We use DO block with exception handling

DO $$
BEGIN
  -- Add ota_staff role
  BEGIN
    ALTER TYPE public.app_role ADD VALUE 'ota_staff';
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Role already exists, ignore
  END;
  
  -- Add ota_lead role
  BEGIN
    ALTER TYPE public.app_role ADD VALUE 'ota_lead';
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Role already exists, ignore
  END;
END$$;

-- ============================================================
-- COMMENT ON ROLES
-- ============================================================
-- We can't add comments directly to enum values, so we document here:
-- 
-- ota_staff:
--   - Can view projects they're assigned to
--   - Can create/update tasks in assigned projects
--   - Can submit evidence for tasks
--   - Cannot view financial data (RLS deny)
--   - Cannot access bookings directly (use KPI RPC)
--
-- ota_lead:
--   - All ota_staff permissions
--   - Can create new projects
--   - Can assign team members to projects
--   - Can assign tasks to team members
--   - Can approve/reject evidence
--   - Can view team performance metrics

-- ============================================================
-- ROLE ASSIGNMENT HELPER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_ota_role(
  p_user_id UUID,
  p_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigner_id UUID;
BEGIN
  v_assigner_id := auth.uid();
  
  -- Only admin can assign OTA roles
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_assigner_id
    AND role = 'admin'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only admin can assign OTA roles'
    );
  END IF;
  
  -- Validate role
  IF p_role NOT IN ('ota_staff', 'ota_lead') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_ROLE',
      'message', 'Role must be ota_staff or ota_lead'
    );
  END IF;
  
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'USER_NOT_FOUND',
      'message', 'User does not exist'
    );
  END IF;
  
  -- Assign role (upsert)
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, p_role::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'role', p_role,
    'message', 'OTA role assigned successfully'
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

REVOKE ALL ON FUNCTION public.assign_ota_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_ota_role TO authenticated;

-- ============================================================
-- ROLE REMOVAL HELPER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_ota_role(
  p_user_id UUID,
  p_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigner_id UUID;
BEGIN
  v_assigner_id := auth.uid();
  
  -- Only admin can remove OTA roles
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_assigner_id
    AND role = 'admin'
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only admin can remove OTA roles'
    );
  END IF;
  
  -- Validate role
  IF p_role NOT IN ('ota_staff', 'ota_lead') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_ROLE',
      'message', 'Role must be ota_staff or ota_lead'
    );
  END IF;
  
  -- Remove role
  DELETE FROM user_roles
  WHERE user_id = p_user_id
  AND role = p_role::app_role;
  
  -- Also deactivate from all projects
  UPDATE ota_project_members
  SET 
    is_active = false,
    deactivated_at = now(),
    deactivated_by = v_assigner_id
  WHERE user_id = p_user_id
  AND is_active = true;
  
  RETURN json_build_object(
    'success', true,
    'user_id', p_user_id,
    'role', p_role,
    'message', 'OTA role removed and user deactivated from all projects'
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

REVOKE ALL ON FUNCTION public.remove_ota_role FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_ota_role TO authenticated;

-- ============================================================
-- LIST OTA TEAM MEMBERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_list_team_members()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Only Lead/Admin can list team members
  IF NOT is_ota_lead_or_admin() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only Lead or Admin can list team members'
    );
  END IF;
  
  SELECT json_agg(row_to_json(t))
  INTO v_result
  FROM (
    SELECT 
      u.id as user_id,
      u.email,
      ur.role,
      ur.created_at as role_assigned_at,
      (
        SELECT COUNT(*) 
        FROM ota_project_members pm 
        WHERE pm.user_id = u.id AND pm.is_active = true
      ) as active_projects,
      (
        SELECT COUNT(*) 
        FROM ota_tasks t 
        WHERE t.assignee_id = u.id 
        AND t.status NOT IN ('DONE', 'CANCELLED')
      ) as active_tasks
    FROM auth.users u
    JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role IN ('ota_staff', 'ota_lead')
    ORDER BY ur.role DESC, u.email
  ) t;
  
  RETURN json_build_object(
    'success', true,
    'team_members', COALESCE(v_result, '[]'::json)
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

REVOKE ALL ON FUNCTION public.ota_list_team_members FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_list_team_members TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON FUNCTION public.assign_ota_role IS 
'Admin-only function to assign ota_staff or ota_lead role to a user.';

COMMENT ON FUNCTION public.remove_ota_role IS 
'Admin-only function to remove OTA role. Also deactivates user from all projects.';

COMMENT ON FUNCTION public.ota_list_team_members IS 
'Lead/Admin function to list all OTA team members with activity stats.';
