-- ============================================================
-- BATCH MIGRATION: ALL OTA OPERATIONS SQL FILES
-- ============================================================

-- ============================================================
-- 1. RESPONSIBLE OWNER RLS (20260107_responsible_owner_rls.sql)
-- ============================================================

-- Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id
    AND role IN ('admin', 'super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin(UUID) TO authenticated;

-- Create function to validate owner assignment in audit_logs
CREATE OR REPLACE FUNCTION public.validate_owner_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_manual_assignment BOOLEAN;
  is_unassign BOOLEAN;
  target_user_id UUID;
  current_user_id UUID;
  user_is_admin BOOLEAN;
BEGIN
  current_user_id := auth.uid();
  
  is_manual_assignment := (
    NEW.after_data IS NOT NULL AND 
    NEW.after_data->>'source' = 'responsible_owner_assignment'
  );
  
  is_unassign := (
    NEW.action ILIKE '%unassign%' OR 
    NEW.action ILIKE '%gỡ phụ trách%' OR
    NEW.action ILIKE '%remove owner%'
  );
  
  IF NOT is_manual_assignment THEN
    RETURN NEW;
  END IF;
  
  target_user_id := NEW.user_id;
  user_is_admin := public.is_admin_or_super_admin(current_user_id);
  
  IF user_is_admin THEN
    RETURN NEW;
  END IF;
  
  IF is_unassign THEN
    RAISE EXCEPTION 'Permission denied: Only admin can unassign owner'
      USING ERRCODE = '42501';
  END IF;
  
  IF target_user_id IS NOT NULL AND target_user_id != current_user_id THEN
    RAISE EXCEPTION 'Permission denied: You can only assign yourself as owner'
      USING ERRCODE = '42501';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_owner_assignment ON public.audit_logs;
CREATE TRIGGER trg_validate_owner_assignment
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_owner_assignment();

COMMENT ON FUNCTION public.validate_owner_assignment() IS 
'Validates owner assignment permissions:
- Admin: can assign/transfer/unassign anyone
- Non-admin: can ONLY self-assign
- Non-admin: cannot unassign
Applied via trigger on audit_logs INSERT';

COMMENT ON FUNCTION public.is_admin_or_super_admin(UUID) IS 
'Check if user has admin or super_admin role';

-- ============================================================
-- 2. OTA HELPER FUNCTIONS (001_ota_helper_functions.sql)
-- ============================================================

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
      AND role IN ('ota_staff', 'ota_lead')
  );
$$;

REVOKE ALL ON FUNCTION public.is_ota_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ota_role() TO authenticated;

COMMENT ON FUNCTION public.is_ota_role() IS 
'Check if current user has OTA role (ota_staff or ota_lead). 
SECURITY DEFINER - used by RLS policies to deny OTA access to sensitive tables.';

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

REVOKE ALL ON FUNCTION public.is_ota_lead_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ota_lead_or_admin() TO authenticated;

COMMENT ON FUNCTION public.is_ota_lead_or_admin() IS 
'Check if current user is OTA lead or admin. Used for management actions.';

CREATE OR REPLACE FUNCTION public.normalize_ota_source(raw_source TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE UPPER(TRIM(COALESCE(raw_source, '')))
    WHEN 'BOOKING.COM' THEN 'BOOKING_COM'
    WHEN 'BOOKINGCOM' THEN 'BOOKING_COM'
    WHEN 'BOOKING' THEN 'BOOKING_COM'
    WHEN 'AGODA' THEN 'AGODA'
    WHEN 'EXPEDIA' THEN 'EXPEDIA'
    WHEN 'AIRBNB' THEN 'AIRBNB'
    WHEN 'TRAVELOKA' THEN 'TRAVELOKA'
    WHEN 'DIRECT' THEN 'DIRECT'
    WHEN 'WEBSITE' THEN 'DIRECT'
    WHEN 'WALK-IN' THEN 'DIRECT'
    WHEN 'WALKIN' THEN 'DIRECT'
    WHEN 'PHONE' THEN 'DIRECT'
    ELSE 'UNKNOWN'
  END;
$$;

COMMENT ON FUNCTION public.normalize_ota_source(TEXT) IS 
'Normalize OTA source string to canonical format. IMMUTABLE for index compatibility.
Maps: booking.com -> BOOKING_COM, agoda -> AGODA, etc. Unknown -> UNKNOWN';

CREATE OR REPLACE FUNCTION public.raise_immutable_error()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Cannot modify immutable fields';
END;
$$;

COMMENT ON FUNCTION public.raise_immutable_error() IS 
'Trigger function to prevent modification of immutable fields.';

-- ============================================================
-- 3. KPI INDEX (003_ota_kpi_index.sql)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_bookings_mirror_kpi_ota
ON public.bookings_mirror (
  channex_property_id,
  booking_status,
  booking_date
)
WHERE booking_status = 'CONFIRMED';

CREATE INDEX IF NOT EXISTS idx_bookings_mirror_ota_source
ON public.bookings_mirror (ota_source)
WHERE booking_status = 'CONFIRMED';

COMMENT ON INDEX public.idx_bookings_mirror_kpi_ota IS 
'Composite partial index for OTA KPI aggregation - filters on property, status, and date range';

COMMENT ON INDEX public.idx_bookings_mirror_ota_source IS 
'Index for GROUP BY ota_source in KPI queries - partial on CONFIRMED bookings';

-- ============================================================
-- 4. OTA PROJECTS TABLE (004_ota_projects.sql)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_project_status') THEN
    CREATE TYPE public.ota_project_status AS ENUM (
      'PLANNING',
      'IN_PROGRESS',
      'ON_HOLD',
      'COMPLETED',
      'ARCHIVED'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.ota_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 200),
  description TEXT,
  property_id UUID NOT NULL REFERENCES public.properties_mirror(id) ON DELETE RESTRICT,
  status public.ota_project_status NOT NULL DEFAULT 'PLANNING',
  start_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  CONSTRAINT valid_project_dates CHECK (
    (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ota_projects_property_id 
ON public.ota_projects(property_id);

CREATE INDEX IF NOT EXISTS idx_ota_projects_status 
ON public.ota_projects(status) 
WHERE status NOT IN ('COMPLETED', 'ARCHIVED');

CREATE INDEX IF NOT EXISTS idx_ota_projects_created_by 
ON public.ota_projects(created_by);

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

ALTER TABLE public.ota_projects ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ota_projects IS 
'OTA Operations project container. Each project is linked to exactly one property via properties_mirror.id (SSOT dimension).';

COMMENT ON COLUMN public.ota_projects.property_id IS 
'SSOT FK to properties_mirror.id (UUID). This is the dimension table reference, NOT bookings_mirror.';

COMMENT ON COLUMN public.ota_projects.status IS 
'Project lifecycle status. Use ARCHIVED for soft delete. Hard DELETE is not allowed.';

-- ============================================================
-- 5. OTA PROJECT MEMBERS (005_ota_project_members.sql)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_project_role') THEN
    CREATE TYPE public.ota_project_role AS ENUM (
      'STAFF',
      'LEAD',
      'ADMIN'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.ota_project_members (
  project_id UUID NOT NULL REFERENCES public.ota_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id),
  role public.ota_project_role NOT NULL DEFAULT 'STAFF',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ota_project_members_user_id 
ON public.ota_project_members(user_id);

CREATE INDEX IF NOT EXISTS idx_ota_project_members_project_active 
ON public.ota_project_members(project_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ota_project_members_role 
ON public.ota_project_members(role);

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

ALTER TABLE public.ota_project_members ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ota_project_members IS 
'Links users to OTA projects with role-based access control. STAFF can execute tasks, LEAD can manage, ADMIN has full control.';

COMMENT ON COLUMN public.ota_project_members.role IS 
'STAFF = task execution only, LEAD = project management, ADMIN = full control including delete';

COMMENT ON COLUMN public.ota_project_members.is_active IS 
'Soft removal flag. Set to false instead of hard delete for audit trail.';

-- ============================================================
-- 6. OTA TASKS (006_ota_tasks.sql)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_task_status') THEN
    CREATE TYPE public.ota_task_status AS ENUM (
      'TODO',
      'IN_PROGRESS',
      'REVIEW',
      'DONE',
      'BLOCKED',
      'CANCELLED'
    );
  END IF;
END$$;

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

CREATE TABLE IF NOT EXISTS public.ota_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.ota_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 300),
  description TEXT,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.ota_task_status NOT NULL DEFAULT 'TODO',
  priority public.ota_task_priority NOT NULL DEFAULT 'MEDIUM',
  due_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_hours NUMERIC(5,2),
  actual_hours NUMERIC(5,2),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

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

CREATE INDEX IF NOT EXISTS idx_ota_tasks_tags 
ON public.ota_tasks USING GIN(tags);

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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ota_tasks_status_change ON public.ota_tasks;
CREATE TRIGGER tr_ota_tasks_status_change
  BEFORE UPDATE OF status ON public.ota_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.track_ota_task_status_change();

ALTER TABLE public.ota_tasks ENABLE ROW LEVEL SECURITY;

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

-- ============================================================
-- 7. OTA TASK EVIDENCE (007_ota_task_evidence.sql)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_evidence_type') THEN
    CREATE TYPE public.ota_evidence_type AS ENUM (
      'SCREENSHOT',
      'DOCUMENT',
      'SPREADSHEET',
      'IMAGE',
      'VIDEO',
      'LINK',
      'NOTE',
      'OTHER'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_evidence_review_status') THEN
    CREATE TYPE public.ota_evidence_review_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'NEEDS_REVISION'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.ota_task_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.ota_tasks(id) ON DELETE CASCADE,
  evidence_type public.ota_evidence_type NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  description TEXT,
  CONSTRAINT valid_file_or_note CHECK (
    (evidence_type = 'NOTE' AND file_url IS NULL) 
    OR (evidence_type != 'NOTE' AND file_url IS NOT NULL)
  ),
  review_status public.ota_evidence_review_status NOT NULL DEFAULT 'PENDING',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_task_id 
ON public.ota_task_evidence(task_id);

CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_review_status 
ON public.ota_task_evidence(review_status) 
WHERE review_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_created_by 
ON public.ota_task_evidence(created_by);

CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_task_status 
ON public.ota_task_evidence(task_id, review_status);

CREATE OR REPLACE FUNCTION public.set_ota_task_evidence_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_ota_task_evidence_created_by ON public.ota_task_evidence;
CREATE TRIGGER tr_ota_task_evidence_created_by
  BEFORE INSERT ON public.ota_task_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ota_task_evidence_created_by();

CREATE OR REPLACE FUNCTION public.enforce_ota_evidence_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    RAISE EXCEPTION 'Cannot modify immutable field: task_id';
  END IF;
  
  IF NEW.evidence_type IS DISTINCT FROM OLD.evidence_type THEN
    RAISE EXCEPTION 'Cannot modify immutable field: evidence_type';
  END IF;
  
  IF NEW.file_url IS DISTINCT FROM OLD.file_url THEN
    RAISE EXCEPTION 'Cannot modify immutable field: file_url';
  END IF;
  
  IF NEW.file_name IS DISTINCT FROM OLD.file_name THEN
    RAISE EXCEPTION 'Cannot modify immutable field: file_name';
  END IF;
  
  IF NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes THEN
    RAISE EXCEPTION 'Cannot modify immutable field: file_size_bytes';
  END IF;
  
  IF NEW.mime_type IS DISTINCT FROM OLD.mime_type THEN
    RAISE EXCEPTION 'Cannot modify immutable field: mime_type';
  END IF;
  
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    RAISE EXCEPTION 'Cannot modify immutable field: description';
  END IF;
  
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot modify immutable field: created_at';
  END IF;
  
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Cannot modify immutable field: created_by';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ota_task_evidence_immutability ON public.ota_task_evidence;
CREATE TRIGGER tr_ota_task_evidence_immutability
  BEFORE UPDATE ON public.ota_task_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ota_evidence_immutability();

CREATE OR REPLACE FUNCTION public.track_ota_evidence_review()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.review_status = 'PENDING' AND NEW.review_status != 'PENDING' THEN
    NEW.reviewed_at = COALESCE(NEW.reviewed_at, now());
    NEW.reviewed_by = COALESCE(NEW.reviewed_by, auth.uid());
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_ota_task_evidence_review ON public.ota_task_evidence;
CREATE TRIGGER tr_ota_task_evidence_review
  BEFORE UPDATE OF review_status ON public.ota_task_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.track_ota_evidence_review();

ALTER TABLE public.ota_task_evidence ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ota_task_evidence IS 
'Evidence/attachments for OTA tasks. Uses Model A: content fields immutable, review fields mutable.';

COMMENT ON COLUMN public.ota_task_evidence.task_id IS 
'IMMUTABLE after INSERT. Cannot be changed once evidence is submitted.';

COMMENT ON COLUMN public.ota_task_evidence.file_url IS 
'IMMUTABLE after INSERT. Storage URL for the evidence file.';

COMMENT ON COLUMN public.ota_task_evidence.review_status IS 
'MUTABLE. Review workflow status managed by Lead/Admin.';

COMMENT ON COLUMN public.ota_task_evidence.review_notes IS 
'MUTABLE. Feedback from reviewer on the evidence.';