-- ============================================================
-- OTA OPERATIONS MODULE - CONSOLIDATED MIGRATION
-- ============================================================
-- Run in correct dependency order
-- ============================================================

-- ============================================================
-- PART 1: BASIC HELPER FUNCTIONS (NO TABLE DEPENDENCIES)
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

CREATE OR REPLACE FUNCTION public.raise_immutable_error()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Cannot modify immutable fields';
END;
$$;

-- ============================================================
-- PART 2: OTA ROLES ENUM
-- ============================================================
DO $$
BEGIN
  BEGIN
    ALTER TYPE public.app_role ADD VALUE 'ota_staff';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TYPE public.app_role ADD VALUE 'ota_lead';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END$$;

-- ============================================================
-- PART 3: ENUM TYPES FOR OTA TABLES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_project_status') THEN
    CREATE TYPE public.ota_project_status AS ENUM (
      'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_project_role') THEN
    CREATE TYPE public.ota_project_role AS ENUM ('STAFF', 'LEAD', 'ADMIN');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_task_status') THEN
    CREATE TYPE public.ota_task_status AS ENUM (
      'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED', 'CANCELLED'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_task_priority') THEN
    CREATE TYPE public.ota_task_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_evidence_type') THEN
    CREATE TYPE public.ota_evidence_type AS ENUM (
      'SCREENSHOT', 'DOCUMENT', 'SPREADSHEET', 'IMAGE', 'VIDEO', 'LINK', 'NOTE', 'OTHER'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_evidence_review_status') THEN
    CREATE TYPE public.ota_evidence_review_status AS ENUM (
      'PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVISION'
    );
  END IF;
END$$;

-- ============================================================
-- PART 4: OTA_PROJECTS TABLE
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_ota_projects_property_id ON public.ota_projects(property_id);
CREATE INDEX IF NOT EXISTS idx_ota_projects_status ON public.ota_projects(status) WHERE status NOT IN ('COMPLETED', 'ARCHIVED');
CREATE INDEX IF NOT EXISTS idx_ota_projects_created_by ON public.ota_projects(created_by);

-- ============================================================
-- PART 5: OTA_PROJECT_MEMBERS TABLE
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_ota_project_members_user_id ON public.ota_project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_ota_project_members_project_active ON public.ota_project_members(project_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ota_project_members_role ON public.ota_project_members(role);

-- ============================================================
-- PART 6: OTA_TASKS TABLE
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_ota_tasks_project_id ON public.ota_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_ota_tasks_assignee_id ON public.ota_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_ota_tasks_status ON public.ota_tasks(status) WHERE status NOT IN ('DONE', 'CANCELLED');
CREATE INDEX IF NOT EXISTS idx_ota_tasks_due_date ON public.ota_tasks(due_date) WHERE status NOT IN ('DONE', 'CANCELLED');
CREATE INDEX IF NOT EXISTS idx_ota_tasks_project_status ON public.ota_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_ota_tasks_created_by ON public.ota_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_ota_tasks_tags ON public.ota_tasks USING GIN(tags);

-- ============================================================
-- PART 7: OTA_TASK_EVIDENCE TABLE
-- ============================================================
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

CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_task_id ON public.ota_task_evidence(task_id);
CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_review_status ON public.ota_task_evidence(review_status) WHERE review_status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_created_by ON public.ota_task_evidence(created_by);
CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_task_status ON public.ota_task_evidence(task_id, review_status);

-- ============================================================
-- PART 8: OTA AUDIT LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  project_id UUID REFERENCES public.ota_projects(id) ON DELETE SET NULL,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_ota_audit_log_entity ON public.ota_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ota_audit_log_project ON public.ota_audit_log(project_id);
CREATE INDEX IF NOT EXISTS idx_ota_audit_log_performed_by ON public.ota_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_ota_audit_log_performed_at ON public.ota_audit_log(performed_at);