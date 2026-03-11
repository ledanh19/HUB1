-- ============================================================
-- OTA OPERATIONS MODULE - 004: OTA_PROJECTS TABLE
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Project container for OTA team work
-- 
-- Design:
--   - Each project tracks work related to specific properties
--   - property_id is SSOT FK to properties_mirror.id (UUID)
--   - Soft delete via status ARCHIVED (no hard delete)
--   - Standard audit trail (created_at, updated_at, created_by, updated_by)
-- ============================================================

-- ============================================================
-- ENUM TYPE: Project Status
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_project_status') THEN
    CREATE TYPE public.ota_project_status AS ENUM (
      'PLANNING',    -- Initial planning phase
      'IN_PROGRESS', -- Active work ongoing
      'ON_HOLD',     -- Temporarily paused
      'COMPLETED',   -- All work finished
      'ARCHIVED'     -- Soft deleted / hidden
    );
  END IF;
END$$;

-- ============================================================
-- TABLE: ota_projects
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_projects (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core Fields
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT,
  
  -- SSOT Property Reference (Dimension FK)
  -- References properties_mirror.id, NOT bookings_mirror
  property_id UUID NOT NULL REFERENCES public.properties_mirror(id) ON DELETE RESTRICT,
  
  -- Status
  status public.ota_project_status NOT NULL DEFAULT 'PLANNING',
  
  -- Timeline
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  
  -- Constraints on dates
  CONSTRAINT valid_project_dates CHECK (
    (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
  ),
  
  -- Audit Trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ota_projects_property_id 
ON public.ota_projects(property_id);

CREATE INDEX IF NOT EXISTS idx_ota_projects_status 
ON public.ota_projects(status) 
WHERE status NOT IN ('COMPLETED', 'ARCHIVED');

CREATE INDEX IF NOT EXISTS idx_ota_projects_created_by 
ON public.ota_projects(created_by);

-- ============================================================
-- TRIGGER: updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_ota_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_ota_projects_updated_at ON public.ota_projects;
CREATE TRIGGER tr_ota_projects_updated_at
  BEFORE UPDATE ON public.ota_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ota_projects_updated_at();

-- ============================================================
-- TRIGGER: Set created_by on INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_ota_projects_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_ota_projects_created_by ON public.ota_projects;
CREATE TRIGGER tr_ota_projects_created_by
  BEFORE INSERT ON public.ota_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ota_projects_created_by();

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.ota_projects ENABLE ROW LEVEL SECURITY;

-- SELECT: Only OTA role + project members can view
CREATE POLICY "OTA projects viewable by ota role"
ON public.ota_projects
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND public.has_ota_project_access(id)
);

-- INSERT: Only OTA Lead or Admin can create projects
CREATE POLICY "OTA projects insertable by ota lead or admin"
ON public.ota_projects
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- UPDATE: Only OTA Lead or Admin can update
CREATE POLICY "OTA projects updatable by ota lead or admin"
ON public.ota_projects
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- DELETE: No hard delete allowed (use ARCHIVED status)
-- No DELETE policy = default deny

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE public.ota_projects IS 
'OTA Operations project container. Each project is linked to exactly one property via properties_mirror.id (SSOT dimension).';

COMMENT ON COLUMN public.ota_projects.property_id IS 
'SSOT FK to properties_mirror.id (UUID). This is the dimension table reference, NOT bookings_mirror.';

COMMENT ON COLUMN public.ota_projects.status IS 
'Project lifecycle status. Use ARCHIVED for soft delete. Hard DELETE is not allowed.';
