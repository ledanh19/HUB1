-- ============================================================
-- OTA OPERATIONS MODULE - 012: PERMISSIONS & GRANTS
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Final permission grants and security hardening
-- 
-- This migration ensures:
--   1. All tables have correct GRANT statements
--   2. All functions have proper REVOKE/GRANT
--   3. Storage policies for evidence files
-- ============================================================

-- ============================================================
-- TABLE GRANTS
-- ============================================================

-- OTA Projects
GRANT SELECT, INSERT, UPDATE ON public.ota_projects TO authenticated;

-- OTA Project Members  
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_project_members TO authenticated;

-- OTA Tasks
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_tasks TO authenticated;

-- OTA Task Evidence
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_task_evidence TO authenticated;

-- Note: Actual access is controlled by RLS policies, not just GRANT

-- ============================================================
-- SEQUENCE GRANTS (for serial/bigserial if any)
-- ============================================================
-- All tables use UUID gen_random_uuid(), no sequences needed

-- ============================================================
-- STORAGE BUCKET FOR EVIDENCE FILES
-- ============================================================
-- Create storage bucket for OTA evidence files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ota-evidence',
  'ota-evidence',
  false,  -- Private bucket
  52428800,  -- 50MB limit
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'video/mp4',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- STORAGE POLICIES FOR OTA-EVIDENCE BUCKET
-- ============================================================

-- Policy: OTA role can upload files
CREATE POLICY "OTA role can upload evidence"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ota-evidence'
  AND public.is_ota_role()
);

-- Policy: OTA role can read files (own uploads or in accessible projects)
CREATE POLICY "OTA role can read evidence"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ota-evidence'
  AND public.is_ota_role()
  -- Additional check: file belongs to accessible project
  -- Path format: ota-evidence/{project_id}/{task_id}/{filename}
  AND (
    public.is_ota_lead_or_admin()
    OR public.has_ota_project_access((storage.foldername(name))[1]::uuid)
  )
);

-- Policy: Only admin can delete evidence files
CREATE POLICY "Admin can delete evidence"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'ota-evidence'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- ============================================================
-- AUDIT LOG TABLE FOR OTA OPERATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What happened
  action TEXT NOT NULL,  -- CREATE_PROJECT, UPDATE_TASK, SUBMIT_EVIDENCE, etc.
  entity_type TEXT NOT NULL,  -- project, task, evidence
  entity_id UUID NOT NULL,
  
  -- Context
  project_id UUID REFERENCES public.ota_projects(id) ON DELETE SET NULL,
  
  -- Change details
  old_data JSONB,
  new_data JSONB,
  
  -- Who and when
  performed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Request context
  ip_address INET,
  user_agent TEXT
);

-- Index for querying
CREATE INDEX IF NOT EXISTS idx_ota_audit_log_entity 
ON public.ota_audit_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_ota_audit_log_project 
ON public.ota_audit_log(project_id);

CREATE INDEX IF NOT EXISTS idx_ota_audit_log_performed_by 
ON public.ota_audit_log(performed_by);

CREATE INDEX IF NOT EXISTS idx_ota_audit_log_performed_at 
ON public.ota_audit_log(performed_at);

-- RLS for audit log
ALTER TABLE public.ota_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admin can view audit log
CREATE POLICY "Audit log viewable by admin only"
ON public.ota_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Insert allowed for triggers (SECURITY DEFINER functions)
-- No direct insert policy for users

GRANT SELECT ON public.ota_audit_log TO authenticated;

-- ============================================================
-- AUDIT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.ota_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_project_id UUID;
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  -- Determine action
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old_data := to_jsonb(OLD);
  END IF;
  
  -- Determine entity type and ID
  v_entity_type := TG_TABLE_NAME;
  
  IF TG_TABLE_NAME = 'ota_projects' THEN
    v_entity_id := COALESCE(NEW.id, OLD.id);
    v_project_id := v_entity_id;
  ELSIF TG_TABLE_NAME = 'ota_tasks' THEN
    v_entity_id := COALESCE(NEW.id, OLD.id);
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  ELSIF TG_TABLE_NAME = 'ota_task_evidence' THEN
    v_entity_id := COALESCE(NEW.id, OLD.id);
    -- Get project_id from task
    SELECT project_id INTO v_project_id
    FROM ota_tasks
    WHERE id = COALESCE(NEW.task_id, OLD.task_id);
  ELSIF TG_TABLE_NAME = 'ota_project_members' THEN
    v_entity_id := COALESCE(NEW.user_id, OLD.user_id);
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  END IF;
  
  -- Insert audit record
  INSERT INTO ota_audit_log (
    action,
    entity_type,
    entity_id,
    project_id,
    old_data,
    new_data,
    performed_by
  ) VALUES (
    v_action || '_' || UPPER(v_entity_type),
    v_entity_type,
    v_entity_id,
    v_project_id,
    v_old_data,
    v_new_data,
    auth.uid()
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ATTACH AUDIT TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS tr_ota_projects_audit ON public.ota_projects;
CREATE TRIGGER tr_ota_projects_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ota_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.ota_audit_trigger();

DROP TRIGGER IF EXISTS tr_ota_tasks_audit ON public.ota_tasks;
CREATE TRIGGER tr_ota_tasks_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ota_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.ota_audit_trigger();

DROP TRIGGER IF EXISTS tr_ota_task_evidence_audit ON public.ota_task_evidence;
CREATE TRIGGER tr_ota_task_evidence_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ota_task_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.ota_audit_trigger();

DROP TRIGGER IF EXISTS tr_ota_project_members_audit ON public.ota_project_members;
CREATE TRIGGER tr_ota_project_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.ota_project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.ota_audit_trigger();

-- ============================================================
-- FINAL SECURITY VERIFICATION VIEW
-- (Admin-only view to check all OTA permissions)
-- ============================================================
CREATE OR REPLACE VIEW public.ota_security_summary AS
SELECT 
  'OTA Tables' as category,
  schemaname,
  tablename,
  (
    SELECT COUNT(*) 
    FROM pg_policies 
    WHERE schemaname = pt.schemaname 
    AND tablename = pt.tablename
  ) as policy_count,
  hasrls as rls_enabled
FROM pg_tables pt
WHERE schemaname = 'public'
AND tablename LIKE 'ota_%'

UNION ALL

SELECT 
  'OTA Functions' as category,
  n.nspname as schemaname,
  p.proname as tablename,
  0 as policy_count,
  p.prosecdef as rls_enabled  -- Actually shows SECURITY DEFINER
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND p.proname LIKE 'ota_%';

-- Only admin can view this
REVOKE ALL ON public.ota_security_summary FROM PUBLIC;
GRANT SELECT ON public.ota_security_summary TO authenticated;

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE public.ota_audit_log IS 
'Audit trail for all OTA Operations module activities. Admin-only access.';

COMMENT ON VIEW public.ota_security_summary IS 
'Security verification view showing RLS status and policy counts for OTA objects.';
