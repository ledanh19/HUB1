-- ============================================================
-- FIX OTA PERMISSIONS FOR ALL ROLES
-- ============================================================

-- 1. Create admin check helper
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

-- 2. Update is_ota_role() to include admin/super_admin
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

-- 3. Update is_ota_lead_or_admin()
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

-- 4. Update has_ota_project_access()
CREATE OR REPLACE FUNCTION public.has_ota_project_access(p_project_id UUID)
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
  )
  OR
  EXISTS (
    SELECT 1 FROM public.ota_project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- 5. Update get_ota_project_role()
CREATE OR REPLACE FUNCTION public.get_ota_project_role(p_project_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
      ) THEN 'ADMIN'
      ELSE COALESCE(
        (SELECT role::TEXT FROM public.ota_project_members
         WHERE project_id = p_project_id 
         AND user_id = auth.uid() 
         AND is_active = true),
        NULL
      )
    END;
$$;

-- 6. Re-create RLS Policies for ota_projects
DROP POLICY IF EXISTS "OTA projects viewable by ota role" ON public.ota_projects;
DROP POLICY IF EXISTS "OTA projects insertable by ota lead or admin" ON public.ota_projects;
DROP POLICY IF EXISTS "OTA projects updatable by ota lead or admin" ON public.ota_projects;

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

CREATE POLICY "ota_projects_insert"
ON public.ota_projects
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_lead_or_admin()
);

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

-- 7. Re-create RLS Policies for ota_tasks
DROP POLICY IF EXISTS "OTA tasks viewable by project members" ON public.ota_tasks;
DROP POLICY IF EXISTS "OTA tasks insertable by project members" ON public.ota_tasks;
DROP POLICY IF EXISTS "OTA tasks updatable by authorized users" ON public.ota_tasks;
DROP POLICY IF EXISTS "OTA tasks deletable by lead or admin" ON public.ota_tasks;

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

-- 8. Re-create RLS Policies for ota_project_members
DROP POLICY IF EXISTS "OTA members viewable by project members" ON public.ota_project_members;
DROP POLICY IF EXISTS "OTA members manageable by lead or admin" ON public.ota_project_members;

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

CREATE POLICY "ota_project_members_insert"
ON public.ota_project_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_lead_or_admin()
);

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

-- 9. Re-create RLS Policies for ota_task_evidence
DROP POLICY IF EXISTS "OTA evidence viewable by project members" ON public.ota_task_evidence;
DROP POLICY IF EXISTS "OTA evidence insertable by assignee" ON public.ota_task_evidence;
DROP POLICY IF EXISTS "OTA evidence updatable by admin" ON public.ota_task_evidence;
DROP POLICY IF EXISTS "OTA evidence deletable by admin" ON public.ota_task_evidence;

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

CREATE POLICY "ota_task_evidence_delete"
ON public.ota_task_evidence
FOR DELETE
TO authenticated
USING (
  public.is_admin_or_superadmin()
);

-- 10. ota_get_my_tasks with assignee_id
CREATE OR REPLACE FUNCTION public.ota_get_my_tasks(
  p_status TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  IF NOT is_ota_role() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'ACCESS_DENIED',
      'message', 'Only OTA role can access tasks'
    );
  END IF;
  
  SELECT json_agg(row_to_json(t))
  INTO v_result
  FROM (
    SELECT 
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.due_date,
      t.started_at,
      t.completed_at,
      t.estimated_hours,
      t.actual_hours,
      t.tags,
      t.created_at,
      t.assignee_id,
      p.id as project_id,
      p.name as project_name,
      pm.property_name as property_name
    FROM ota_tasks t
    JOIN ota_projects p ON p.id = t.project_id
    JOIN properties_mirror pm ON pm.id = p.property_id
    WHERE t.assignee_id = v_user_id
    AND has_ota_project_access(t.project_id)
    AND (p_status IS NULL OR t.status = p_status::ota_task_status)
    AND (p_project_id IS NULL OR t.project_id = p_project_id)
    ORDER BY 
      CASE t.priority 
        WHEN 'URGENT' THEN 1 
        WHEN 'HIGH' THEN 2 
        WHEN 'MEDIUM' THEN 3 
        WHEN 'LOW' THEN 4 
      END,
      t.due_date NULLS LAST,
      t.created_at DESC
  ) t;
  
  RETURN json_build_object(
    'success', true,
    'tasks', COALESCE(v_result, '[]'::json)
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

REVOKE ALL ON FUNCTION public.ota_get_my_tasks FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ota_get_my_tasks TO authenticated;