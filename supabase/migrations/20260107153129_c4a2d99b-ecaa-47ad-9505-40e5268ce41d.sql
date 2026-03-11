-- ============================================================
-- OTA OPERATIONS MODULE - PART 2: RLS, TRIGGERS, HELPER FUNCTIONS
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS THAT DEPEND ON TABLES
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_ota_project_access(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ota_project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.has_ota_project_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_ota_project_access(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ota_project_role(p_project_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::TEXT FROM public.ota_project_members
     WHERE project_id = p_project_id AND user_id = auth.uid() AND is_active = true),
    (SELECT 'ADMIN' FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
     LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.get_ota_project_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ota_project_role(UUID) TO authenticated;

-- ============================================================
-- TRIGGERS FOR OTA_PROJECTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_ota_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_projects_updated_at ON public.ota_projects;
CREATE TRIGGER tr_ota_projects_updated_at
  BEFORE UPDATE ON public.ota_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_ota_projects_updated_at();

CREATE OR REPLACE FUNCTION public.set_ota_projects_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by = auth.uid(); END IF;
  IF NEW.updated_by IS NULL THEN NEW.updated_by = auth.uid(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_projects_created_by ON public.ota_projects;
CREATE TRIGGER tr_ota_projects_created_by
  BEFORE INSERT ON public.ota_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_ota_projects_created_by();

-- ============================================================
-- TRIGGERS FOR OTA_PROJECT_MEMBERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_ota_project_members_assigned_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_by IS NULL THEN NEW.assigned_by = auth.uid(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_project_members_assigned_by ON public.ota_project_members;
CREATE TRIGGER tr_ota_project_members_assigned_by
  BEFORE INSERT ON public.ota_project_members
  FOR EACH ROW EXECUTE FUNCTION public.set_ota_project_members_assigned_by();

CREATE OR REPLACE FUNCTION public.set_ota_project_members_deactivated()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    NEW.deactivated_at = now();
    NEW.deactivated_by = auth.uid();
  ELSIF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.deactivated_at = NULL;
    NEW.deactivated_by = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_project_members_deactivated ON public.ota_project_members;
CREATE TRIGGER tr_ota_project_members_deactivated
  BEFORE UPDATE ON public.ota_project_members
  FOR EACH ROW EXECUTE FUNCTION public.set_ota_project_members_deactivated();

-- ============================================================
-- TRIGGERS FOR OTA_TASKS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_ota_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_tasks_updated_at ON public.ota_tasks;
CREATE TRIGGER tr_ota_tasks_updated_at
  BEFORE UPDATE ON public.ota_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_ota_tasks_updated_at();

CREATE OR REPLACE FUNCTION public.set_ota_tasks_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by = auth.uid(); END IF;
  IF NEW.updated_by IS NULL THEN NEW.updated_by = auth.uid(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_tasks_created_by ON public.ota_tasks;
CREATE TRIGGER tr_ota_tasks_created_by
  BEFORE INSERT ON public.ota_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_ota_tasks_created_by();

CREATE OR REPLACE FUNCTION public.track_ota_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'TODO' AND NEW.status = 'IN_PROGRESS' THEN
    NEW.started_at = COALESCE(NEW.started_at, now());
  END IF;
  IF NEW.status = 'DONE' AND OLD.status != 'DONE' THEN
    NEW.completed_at = COALESCE(NEW.completed_at, now());
  END IF;
  IF OLD.status = 'DONE' AND NEW.status != 'DONE' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_tasks_status_change ON public.ota_tasks;
CREATE TRIGGER tr_ota_tasks_status_change
  BEFORE UPDATE OF status ON public.ota_tasks
  FOR EACH ROW EXECUTE FUNCTION public.track_ota_task_status_change();

-- ============================================================
-- TRIGGERS FOR OTA_TASK_EVIDENCE
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_ota_task_evidence_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by = auth.uid(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_task_evidence_created_by ON public.ota_task_evidence;
CREATE TRIGGER tr_ota_task_evidence_created_by
  BEFORE INSERT ON public.ota_task_evidence
  FOR EACH ROW EXECUTE FUNCTION public.set_ota_task_evidence_created_by();

CREATE OR REPLACE FUNCTION public.track_ota_evidence_review()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.review_status = 'PENDING' AND NEW.review_status != 'PENDING' THEN
    NEW.reviewed_at = COALESCE(NEW.reviewed_at, now());
    NEW.reviewed_by = COALESCE(NEW.reviewed_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_ota_task_evidence_review ON public.ota_task_evidence;
CREATE TRIGGER tr_ota_task_evidence_review
  BEFORE UPDATE OF review_status ON public.ota_task_evidence
  FOR EACH ROW EXECUTE FUNCTION public.track_ota_evidence_review();

-- ============================================================
-- RLS POLICIES FOR OTA_PROJECTS
-- ============================================================
ALTER TABLE public.ota_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OTA projects viewable by ota role" ON public.ota_projects;
CREATE POLICY "OTA projects viewable by ota role"
ON public.ota_projects FOR SELECT TO authenticated
USING (public.is_ota_role() AND public.has_ota_project_access(id));

DROP POLICY IF EXISTS "OTA projects insertable by ota lead or admin" ON public.ota_projects;
CREATE POLICY "OTA projects insertable by ota lead or admin"
ON public.ota_projects FOR INSERT TO authenticated
WITH CHECK (public.is_ota_lead_or_admin());

DROP POLICY IF EXISTS "OTA projects updatable by ota lead or admin" ON public.ota_projects;
CREATE POLICY "OTA projects updatable by ota lead or admin"
ON public.ota_projects FOR UPDATE TO authenticated
USING (public.is_ota_lead_or_admin())
WITH CHECK (public.is_ota_lead_or_admin());

-- ============================================================
-- RLS POLICIES FOR OTA_PROJECT_MEMBERS
-- ============================================================
ALTER TABLE public.ota_project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OTA project members viewable by ota role" ON public.ota_project_members;
CREATE POLICY "OTA project members viewable by ota role"
ON public.ota_project_members FOR SELECT TO authenticated
USING (public.is_ota_role() AND public.has_ota_project_access(project_id));

DROP POLICY IF EXISTS "OTA project members insertable by ota lead or admin" ON public.ota_project_members;
CREATE POLICY "OTA project members insertable by ota lead or admin"
ON public.ota_project_members FOR INSERT TO authenticated
WITH CHECK (public.is_ota_lead_or_admin());

DROP POLICY IF EXISTS "OTA project members updatable by ota lead or admin" ON public.ota_project_members;
CREATE POLICY "OTA project members updatable by ota lead or admin"
ON public.ota_project_members FOR UPDATE TO authenticated
USING (public.is_ota_lead_or_admin())
WITH CHECK (public.is_ota_lead_or_admin());

DROP POLICY IF EXISTS "OTA project members deletable by admin only" ON public.ota_project_members;
CREATE POLICY "OTA project members deletable by admin only"
ON public.ota_project_members FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ============================================================
-- RLS POLICIES FOR OTA_TASKS
-- ============================================================
ALTER TABLE public.ota_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OTA tasks viewable by project members" ON public.ota_tasks;
CREATE POLICY "OTA tasks viewable by project members"
ON public.ota_tasks FOR SELECT TO authenticated
USING (public.is_ota_role() AND public.has_ota_project_access(project_id));

DROP POLICY IF EXISTS "OTA tasks insertable by project members" ON public.ota_tasks;
CREATE POLICY "OTA tasks insertable by project members"
ON public.ota_tasks FOR INSERT TO authenticated
WITH CHECK (public.is_ota_role() AND public.has_ota_project_access(project_id));

DROP POLICY IF EXISTS "OTA tasks updatable by authorized users" ON public.ota_tasks;
CREATE POLICY "OTA tasks updatable by authorized users"
ON public.ota_tasks FOR UPDATE TO authenticated
USING (public.is_ota_role() AND public.has_ota_project_access(project_id) AND (public.is_ota_lead_or_admin() OR assignee_id = auth.uid()))
WITH CHECK (public.is_ota_role() AND public.has_ota_project_access(project_id) AND (public.is_ota_lead_or_admin() OR assignee_id = auth.uid()));

DROP POLICY IF EXISTS "OTA tasks deletable by lead or admin" ON public.ota_tasks;
CREATE POLICY "OTA tasks deletable by lead or admin"
ON public.ota_tasks FOR DELETE TO authenticated
USING (public.is_ota_lead_or_admin() AND public.has_ota_project_access(project_id));

-- ============================================================
-- RLS POLICIES FOR OTA_TASK_EVIDENCE
-- ============================================================
ALTER TABLE public.ota_task_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OTA evidence viewable by project members" ON public.ota_task_evidence;
CREATE POLICY "OTA evidence viewable by project members"
ON public.ota_task_evidence FOR SELECT TO authenticated
USING (public.is_ota_role() AND EXISTS (
  SELECT 1 FROM public.ota_tasks t WHERE t.id = task_id AND public.has_ota_project_access(t.project_id)
));

DROP POLICY IF EXISTS "OTA evidence insertable by project members" ON public.ota_task_evidence;
CREATE POLICY "OTA evidence insertable by project members"
ON public.ota_task_evidence FOR INSERT TO authenticated
WITH CHECK (public.is_ota_role() AND EXISTS (
  SELECT 1 FROM public.ota_tasks t WHERE t.id = task_id AND public.has_ota_project_access(t.project_id)
));

DROP POLICY IF EXISTS "OTA evidence updatable by lead or admin" ON public.ota_task_evidence;
CREATE POLICY "OTA evidence updatable by lead or admin"
ON public.ota_task_evidence FOR UPDATE TO authenticated
USING (public.is_ota_lead_or_admin() AND EXISTS (
  SELECT 1 FROM public.ota_tasks t WHERE t.id = task_id AND public.has_ota_project_access(t.project_id)
))
WITH CHECK (public.is_ota_lead_or_admin());

DROP POLICY IF EXISTS "OTA evidence deletable by admin only" ON public.ota_task_evidence;
CREATE POLICY "OTA evidence deletable by admin only"
ON public.ota_task_evidence FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ============================================================
-- RLS POLICIES FOR OTA_AUDIT_LOG
-- ============================================================
ALTER TABLE public.ota_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit log viewable by admin only" ON public.ota_audit_log;
CREATE POLICY "Audit log viewable by admin only"
ON public.ota_audit_log FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ============================================================
-- TABLE GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.ota_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_project_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_task_evidence TO authenticated;
GRANT SELECT ON public.ota_audit_log TO authenticated;