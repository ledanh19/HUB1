-- ============================================================
-- FIX OTA PERMISSIONS FOR ALL ROLES
-- ============================================================
-- Date: 2026-01-08
-- Last Modified: 2026-01-08T23:30:00+07:00
-- Problem: 
--   1. is_ota_role() only checks ota_staff/ota_lead, blocks admin/super_admin
--   2. RLS policies use "is_ota_role() AND has_ota_project_access()"
--      which blocks admins because is_ota_role() returns FALSE
--   3. useOtaProjectRoles hook doesn't return ADMIN role for super_admin/admin
-- 
-- Solution:
--   1. Update is_ota_role() to include admin/super_admin
--   2. Create is_admin_or_superadmin() helper
--   3. Update RLS policies to allow admin/super_admin
--   4. Update has_ota_project_access() to be more permissive
-- ============================================================

-- ============================================================
-- 1. Create admin check helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_superadmin() TO authenticated;

COMMENT ON FUNCTION public.is_admin_or_superadmin() IS 
'Check if current user is admin or super_admin.';

-- ============================================================
-- 2. Update is_ota_role() to include admin/super_admin
-- ============================================================
-- Now returns TRUE if user has OTA role OR is admin/super_admin
CREATE OR REPLACE FUNCTION public.is_ota_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('ota_staff', 'ota_lead', 'admin', 'super_admin')
  );
$$;

COMMENT ON FUNCTION public.is_ota_role() IS 
'Check if current user has OTA module access (ota_staff, ota_lead, admin, or super_admin).
Updated 2026-01-08: Now includes admin/super_admin for full access.';

-- ============================================================
-- 3. Update is_ota_lead_or_admin() to be clearer
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_ota_lead_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('ota_lead', 'admin', 'super_admin')
  );
$$;

COMMENT ON FUNCTION public.is_ota_lead_or_admin() IS 
'Check if current user is OTA lead, admin, or super_admin. Used for management actions.';

-- ============================================================
-- 4. Update has_ota_project_access() - Admin/super_admin always have access
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_ota_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Admin/super_admin always have access
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  )
  OR
  -- Check project membership for OTA staff/lead
  EXISTS (
    SELECT 1 FROM public.ota_project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

COMMENT ON FUNCTION public.has_ota_project_access(UUID) IS 
'Check if current user has access to OTA project. Admin/super_admin always have access, others need membership.';

-- ============================================================
-- 5. Update get_ota_project_role() - Return ADMIN for admin/super_admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_ota_project_role(p_project_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      -- Admin/super_admin get ADMIN role in all projects
      WHEN EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
      ) THEN 'ADMIN'
      -- Otherwise, check project membership
      ELSE COALESCE(
        (SELECT role::TEXT FROM public.ota_project_members
         WHERE project_id = p_project_id 
         AND user_id = auth.uid() 
         AND is_active = true),
        NULL
      )
    END;
$$;

COMMENT ON FUNCTION public.get_ota_project_role(UUID) IS 
'Get current user role in OTA project. Returns STAFF, LEAD, ADMIN, or NULL.
Admin/super_admin always get ADMIN role.';

-- ============================================================
-- 6. Re-create RLS Policies for ota_projects
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "OTA projects viewable by ota role" ON public.ota_projects;
DROP POLICY IF EXISTS "OTA projects insertable by ota lead or admin" ON public.ota_projects;
DROP POLICY IF EXISTS "OTA projects updatable by ota lead or admin" ON public.ota_projects;

-- SELECT: OTA role + (admin OR project member)
CREATE POLICY "ota_projects_select"
ON public.ota_projects
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND (
    public.is_admin_or_superadmin()
    OR public.has_ota_project_access(id)
  )
);

-- INSERT: Only OTA Lead or Admin
CREATE POLICY "ota_projects_insert"
ON public.ota_projects
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- UPDATE: Only OTA Lead or Admin
CREATE POLICY "ota_projects_update"
ON public.ota_projects
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- ============================================================
-- 7. Re-create RLS Policies for ota_tasks
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "OTA tasks viewable by project members" ON public.ota_tasks;
DROP POLICY IF EXISTS "OTA tasks insertable by project members" ON public.ota_tasks;
DROP POLICY IF EXISTS "OTA tasks updatable by authorized users" ON public.ota_tasks;
DROP POLICY IF EXISTS "OTA tasks deletable by lead or admin" ON public.ota_tasks;

-- SELECT: Admin can see all, others need project membership
CREATE POLICY "ota_tasks_select"
ON public.ota_tasks
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND (
    public.is_admin_or_superadmin()
    OR public.has_ota_project_access(project_id)
  )
);

-- INSERT: OTA role + (admin OR project member)
CREATE POLICY "ota_tasks_insert"
ON public.ota_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_role()
  AND (
    public.is_admin_or_superadmin()
    OR public.has_ota_project_access(project_id)
  )
);

-- UPDATE: Admin, Lead, or own assigned task
CREATE POLICY "ota_tasks_update"
ON public.ota_tasks
FOR UPDATE
TO authenticated
USING (
  public.is_ota_role()
  AND (
    public.is_admin_or_superadmin()
    OR (
      public.has_ota_project_access(project_id)
      AND (
        public.is_ota_lead_or_admin()
        OR assignee_id = auth.uid()
      )
    )
  )
)
WITH CHECK (
  public.is_ota_role()
  AND (
    public.is_admin_or_superadmin()
    OR (
      public.has_ota_project_access(project_id)
      AND (
        public.is_ota_lead_or_admin()
        OR assignee_id = auth.uid()
      )
    )
  )
);

-- DELETE: Only admin
CREATE POLICY "ota_tasks_delete"
ON public.ota_tasks
FOR DELETE
TO authenticated
USING (
  public.is_admin_or_superadmin()
  OR (
    public.is_ota_lead_or_admin()
    AND public.has_ota_project_access(project_id)
  )
);

-- ============================================================
-- 8. Re-create RLS Policies for ota_project_members
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "OTA members viewable by project members" ON public.ota_project_members;
DROP POLICY IF EXISTS "OTA members manageable by lead or admin" ON public.ota_project_members;

-- SELECT: Admin can see all, others need project access
CREATE POLICY "ota_project_members_select"
ON public.ota_project_members
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND (
    public.is_admin_or_superadmin()
    OR public.has_ota_project_access(project_id)
  )
);

-- INSERT: Only lead/admin
CREATE POLICY "ota_project_members_insert"
ON public.ota_project_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- UPDATE: Only lead/admin with project access
CREATE POLICY "ota_project_members_update"
ON public.ota_project_members
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
  AND (
    public.is_admin_or_superadmin()
    OR public.has_ota_project_access(project_id)
  )
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- DELETE: Only lead/admin with project access
CREATE POLICY "ota_project_members_delete"
ON public.ota_project_members
FOR DELETE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
  AND (
    public.is_admin_or_superadmin()
    OR public.has_ota_project_access(project_id)
  )
);

-- ============================================================
-- 9. Re-create RLS Policies for ota_task_evidence
-- ============================================================

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "OTA evidence viewable by project members" ON public.ota_task_evidence;
DROP POLICY IF EXISTS "OTA evidence insertable by assignee" ON public.ota_task_evidence;
DROP POLICY IF EXISTS "OTA evidence updatable by admin" ON public.ota_task_evidence;
DROP POLICY IF EXISTS "OTA evidence deletable by admin" ON public.ota_task_evidence;

-- SELECT: Admin can see all, others need access via task's project
CREATE POLICY "ota_task_evidence_select"
ON public.ota_task_evidence
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND (
    public.is_admin_or_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.ota_tasks t
      WHERE t.id = task_id
      AND public.has_ota_project_access(t.project_id)
    )
  )
);

-- INSERT: OTA role + access to task's project
CREATE POLICY "ota_task_evidence_insert"
ON public.ota_task_evidence
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_role()
  AND (
    public.is_admin_or_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.ota_tasks t
      WHERE t.id = task_id
      AND public.has_ota_project_access(t.project_id)
    )
  )
);

-- UPDATE: Admin or lead with access
CREATE POLICY "ota_task_evidence_update"
ON public.ota_task_evidence
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
  AND (
    public.is_admin_or_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.ota_tasks t
      WHERE t.id = task_id
      AND public.has_ota_project_access(t.project_id)
    )
  )
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- DELETE: Only admin
CREATE POLICY "ota_task_evidence_delete"
ON public.ota_task_evidence
FOR DELETE
TO authenticated
USING (
  public.is_admin_or_superadmin()
);

-- ============================================================
-- 10. Verify permissions
-- ============================================================
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  -- Check functions exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin_or_superadmin') THEN
    v_missing := v_missing || 'is_admin_or_superadmin(), ';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_ota_role') THEN
    v_missing := v_missing || 'is_ota_role(), ';
  END IF;
  
  -- Check policies exist
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ota_projects_select') THEN
    v_missing := v_missing || 'ota_projects_select, ';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ota_tasks_select') THEN
    v_missing := v_missing || 'ota_tasks_select, ';
  END IF;
  
  IF v_missing != '' THEN
    RAISE WARNING 'Missing: %', v_missing;
  ELSE
    RAISE NOTICE '✅ All OTA permission fixes applied successfully';
  END IF;
END$$;
