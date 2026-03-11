-- =====================================================
-- OTA PRIVILEGE PRECEDENCE FIX - COMPLETE
-- =====================================================

-- 1. Create function to check if user has system privilege (admin/super_admin)
CREATE OR REPLACE FUNCTION public.has_system_privilege()
RETURNS boolean
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

-- 2. Create helper to check if user has ANY of the given roles
CREATE OR REPLACE FUNCTION public.has_any_role(roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role::text = ANY(roles)
  );
$$;

-- 3. Update RLS policies for bookings_mirror to allow system admins
DROP POLICY IF EXISTS "bookings_mirror_select" ON public.bookings_mirror;
CREATE POLICY "bookings_mirror_select" ON public.bookings_mirror
  FOR SELECT TO authenticated
  USING (
    public.has_system_privilege()
    OR public.has_any_role(ARRAY['ke_toan', 'thu_quy', 'ops_lead', 'ops_staff', 'cs_lead', 'cs_staff'])
  );

-- 4. Update RLS for host_payables to allow system admins
DROP POLICY IF EXISTS "host_payables_select" ON public.host_payables;
CREATE POLICY "host_payables_select" ON public.host_payables
  FOR SELECT TO authenticated
  USING (
    public.has_system_privilege()
    OR public.has_any_role(ARRAY['ke_toan', 'thu_quy', 'ops_lead'])
  );

-- 5. Update RLS for ledger_entries to allow system admins
DROP POLICY IF EXISTS "ledger_entries_select" ON public.ledger_entries;
CREATE POLICY "ledger_entries_select" ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (
    public.has_system_privilege()
    OR public.has_any_role(ARRAY['ke_toan'])
  );

-- 6. Update RLS for partners to allow system admins
DROP POLICY IF EXISTS "partners_select" ON public.partners;
CREATE POLICY "partners_select" ON public.partners
  FOR SELECT TO authenticated
  USING (
    public.has_system_privilege()
    OR public.has_any_role(ARRAY['ke_toan', 'ops_lead', 'ops_staff'])
  );

-- 7. Update RLS for ota_payouts to allow system admins
DROP POLICY IF EXISTS "ota_payouts_select" ON public.ota_payouts;
CREATE POLICY "ota_payouts_select" ON public.ota_payouts
  FOR SELECT TO authenticated
  USING (
    public.has_system_privilege()
    OR public.has_any_role(ARRAY['ke_toan', 'thu_quy', 'ops_lead'])
  );

-- 8. Update OTA tables policies to include admin/super_admin
DROP POLICY IF EXISTS "ota_projects_select_policy" ON public.ota_projects;
CREATE POLICY "ota_projects_select_policy" ON public.ota_projects
  FOR SELECT TO authenticated
  USING (public.is_ota_role());

DROP POLICY IF EXISTS "ota_tasks_select_policy" ON public.ota_tasks;
CREATE POLICY "ota_tasks_select_policy" ON public.ota_tasks
  FOR SELECT TO authenticated
  USING (public.is_ota_role());

DROP POLICY IF EXISTS "ota_project_members_select_policy" ON public.ota_project_members;
CREATE POLICY "ota_project_members_select_policy" ON public.ota_project_members
  FOR SELECT TO authenticated
  USING (public.is_ota_role());

DROP POLICY IF EXISTS "ota_task_evidence_select_policy" ON public.ota_task_evidence;
CREATE POLICY "ota_task_evidence_select_policy" ON public.ota_task_evidence
  FOR SELECT TO authenticated
  USING (public.is_ota_role());