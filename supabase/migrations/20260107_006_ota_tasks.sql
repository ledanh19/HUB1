-- ============================================================
-- OTA OPERATIONS MODULE - 006: OTA_TASKS TABLE
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Task management for OTA team
-- 
-- Design:
--   - Tasks belong to projects
--   - Can be assigned to project members
--   - Standard task lifecycle: TODO → IN_PROGRESS → REVIEW → DONE
--   - Supports priority levels and due dates
--   - Full audit trail
-- ============================================================

-- ============================================================
-- ENUM TYPE: Task Status
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_task_status') THEN
    CREATE TYPE public.ota_task_status AS ENUM (
      'TODO',         -- Not started
      'IN_PROGRESS',  -- Currently being worked on
      'REVIEW',       -- Waiting for review/approval
      'DONE',         -- Completed
      'BLOCKED',      -- Cannot proceed (dependency/external)
      'CANCELLED'     -- Cancelled (soft delete)
    );
  END IF;
END$$;

-- ============================================================
-- ENUM TYPE: Task Priority
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_task_priority') THEN
    CREATE TYPE public.ota_task_priority AS ENUM (
      'LOW',
      'MEDIUM',
      'HIGH',
      'URGENT'
    );
  END IF;
END$$;

-- ============================================================
-- TABLE: ota_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_tasks (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Project Reference
  project_id UUID NOT NULL REFERENCES public.ota_projects(id) ON DELETE CASCADE,
  
  -- Core Fields
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 300),
  description TEXT,
  
  -- Assignment
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Status & Priority
  status public.ota_task_status NOT NULL DEFAULT 'TODO',
  priority public.ota_task_priority NOT NULL DEFAULT 'MEDIUM',
  
  -- Timeline
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Effort Tracking (optional)
  estimated_hours NUMERIC(5,2),
  actual_hours NUMERIC(5,2),
  
  -- Tags for categorization (array)
  tags TEXT[] DEFAULT '{}',
  
  -- Audit Trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ota_tasks_project_id 
ON public.ota_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_ota_tasks_assignee_id 
ON public.ota_tasks(assignee_id);

CREATE INDEX IF NOT EXISTS idx_ota_tasks_status 
ON public.ota_tasks(status) 
WHERE status NOT IN ('DONE', 'CANCELLED');

CREATE INDEX IF NOT EXISTS idx_ota_tasks_due_date 
ON public.ota_tasks(due_date) 
WHERE status NOT IN ('DONE', 'CANCELLED');

CREATE INDEX IF NOT EXISTS idx_ota_tasks_project_status 
ON public.ota_tasks(project_id, status);

CREATE INDEX IF NOT EXISTS idx_ota_tasks_created_by 
ON public.ota_tasks(created_by);

-- GIN index for tags array search
CREATE INDEX IF NOT EXISTS idx_ota_tasks_tags 
ON public.ota_tasks USING GIN(tags);

-- ============================================================
-- TRIGGER: updated_at auto-update
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_ota_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_ota_tasks_updated_at ON public.ota_tasks;
CREATE TRIGGER tr_ota_tasks_updated_at
  BEFORE UPDATE ON public.ota_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ota_tasks_updated_at();

-- ============================================================
-- TRIGGER: Set created_by on INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_ota_tasks_created_by()
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

DROP TRIGGER IF EXISTS tr_ota_tasks_created_by ON public.ota_tasks;
CREATE TRIGGER tr_ota_tasks_created_by
  BEFORE INSERT ON public.ota_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ota_tasks_created_by();

-- ============================================================
-- TRIGGER: Status change tracking
-- ============================================================
CREATE OR REPLACE FUNCTION public.track_ota_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Track when task starts
  IF OLD.status = 'TODO' AND NEW.status = 'IN_PROGRESS' THEN
    NEW.started_at = COALESCE(NEW.started_at, now());
  END IF;
  
  -- Track when task completes
  IF NEW.status = 'DONE' AND OLD.status != 'DONE' THEN
    NEW.completed_at = COALESCE(NEW.completed_at, now());
  END IF;
  
  -- Clear completed_at if reopening
  IF OLD.status = 'DONE' AND NEW.status != 'DONE' THEN
    NEW.completed_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ota_tasks_status_change ON public.ota_tasks;
CREATE TRIGGER tr_ota_tasks_status_change
  BEFORE UPDATE OF status ON public.ota_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.track_ota_task_status_change();

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.ota_tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: OTA role can view tasks in projects they have access to
CREATE POLICY "OTA tasks viewable by project members"
ON public.ota_tasks
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
);

-- INSERT: OTA role can create tasks in accessible projects
CREATE POLICY "OTA tasks insertable by project members"
ON public.ota_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
);

-- UPDATE: Can update if:
--   - Lead/Admin: any task in accessible project
--   - Staff: only own assigned tasks
CREATE POLICY "OTA tasks updatable by authorized users"
ON public.ota_tasks
FOR UPDATE
TO authenticated
USING (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
  AND (
    public.is_ota_lead_or_admin()
    OR assignee_id = auth.uid()
  )
)
WITH CHECK (
  public.is_ota_role()
  AND public.has_ota_project_access(project_id)
  AND (
    public.is_ota_lead_or_admin()
    OR assignee_id = auth.uid()
  )
);

-- DELETE: Only Lead/Admin can delete (should prefer CANCELLED status)
CREATE POLICY "OTA tasks deletable by lead or admin"
ON public.ota_tasks
FOR DELETE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
  AND public.has_ota_project_access(project_id)
);

-- ============================================================
-- COMMENTS
-- ============================================================
COMMENT ON TABLE public.ota_tasks IS 
'Task management for OTA Operations. Tasks belong to projects and can be assigned to project members.';

COMMENT ON COLUMN public.ota_tasks.status IS 
'Task lifecycle: TODO → IN_PROGRESS → REVIEW → DONE. Use CANCELLED instead of hard delete.';

COMMENT ON COLUMN public.ota_tasks.tags IS 
'Array of tags for categorization. Use GIN index for efficient searching.';

COMMENT ON COLUMN public.ota_tasks.estimated_hours IS 
'Estimated effort in hours. For capacity planning.';

COMMENT ON COLUMN public.ota_tasks.actual_hours IS 
'Actual effort logged. For performance tracking.';
