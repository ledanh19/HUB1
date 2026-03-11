-- ============================================================
-- OTA OPERATIONS MODULE - 005: OTA_PROJECT_MEMBERS TABLE
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Project membership (who can access which projects)
-- 
-- Design:
--   - Links users to projects with specific roles
--   - Roles: STAFF, LEAD, ADMIN
--   - ADMIN can manage all projects
--   - LEAD can manage assigned projects
--   - STAFF can only view/execute tasks
-- ============================================================

-- ============================================================
-- ENUM TYPE: Project Member Role
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_project_role') THEN
    CREATE TYPE public.ota_project_role AS ENUM (
      'STAFF',  -- Can view project, create/update own tasks
      'LEAD',   -- Can manage project, assign tasks, approve evidence
      'ADMIN'   -- Full control, can delete (soft), reassign
    );
  END IF;
END$$;

-- ============================================================
-- TABLE: ota_project_members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_project_members (
  -- Composite Primary Key
  project_id UUID NOT NULL REFERENCES public.ota_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  PRIMARY KEY (project_id, user_id),
  
  -- Role in this project
  role public.ota_project_role NOT NULL DEFAULT 'STAFF',
  
  -- Assignment tracking
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  
  -- Active flag (for soft removal from project)
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ota_project_members_user_id 
ON public.ota_project_members(user_id);

CREATE INDEX IF NOT EXISTS idx_ota_project_members_project_active 
ON public.ota_project_members(project_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ota_project_members_role 
ON public.ota_project_members(role);

-- ============================================================
-- TRIGGER: Set assigned_by on INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_ota_project_members_assigned_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_by IS NULL THEN
    NEW.assigned_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_ota_project_members_assigned_by ON public.ota_project_members;
CREATE TRIGGER tr_ota_project_members_assigned_by
  BEFORE INSERT ON public.ota_project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ota_project_members_assigned_by();

-- ============================================================
-- TRIGGER: Set deactivated fields on UPDATE
-- ============================================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_ota_project_members_deactivated ON public.ota_project_members;
CREATE TRIGGER tr_ota_project_members_deactivated
  BEFORE UPDATE ON public.ota_project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ota_project_members_deactivated();

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.ota_project_members ENABLE ROW LEVEL SECURITY;

-- SELECT: OTA role can view members of projects they have access to
CREATE POLICY "OTA project members viewable by ota role"
ON public.ota_project_members
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
);

-- INSERT: Only OTA Lead or Admin can add members
CREATE POLICY "OTA project members insertable by ota lead or admin"
ON public.ota_project_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- UPDATE: Only OTA Lead or Admin can update (e.g., change role, deactivate)
CREATE POLICY "OTA project members updatable by ota lead or admin"
ON public.ota_project_members
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- DELETE: Only ADMIN can hard delete members
CREATE POLICY "OTA project members deletable by admin only"
ON public.ota_project_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE public.ota_project_members IS 
'Links users to OTA projects with role-based access control. STAFF can execute tasks, LEAD can manage, ADMIN has full control.';

COMMENT ON COLUMN public.ota_project_members.role IS 
'STAFF = task execution only, LEAD = project management, ADMIN = full control including delete';

COMMENT ON COLUMN public.ota_project_members.is_active IS 
'Soft removal flag. Set to false instead of hard delete for audit trail.';
