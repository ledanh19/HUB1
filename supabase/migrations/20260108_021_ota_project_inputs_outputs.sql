-- ============================================================
-- OTA OPERATIONS MODULE - 021: PROJECT INPUTS & OUTPUTS
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Add structured inputs/outputs for OTA projects
-- 
-- Features:
--   - Project Inputs: JSONB data with optimistic locking
--   - Project Outputs: Versioned with review workflow
--   - Status: DRAFT → SUBMITTED → APPROVED | REJECTED
--
-- Rollback:
--   DROP TABLE IF EXISTS ota_project_outputs;
--   DROP TABLE IF EXISTS ota_project_inputs;
--   DROP TYPE IF EXISTS ota_output_status;
-- ============================================================

-- ============================================================
-- STEP 1: Create output status enum (idempotent)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_output_status') THEN
    CREATE TYPE public.ota_output_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
    RAISE NOTICE 'Created enum type ota_output_status';
  ELSE
    RAISE NOTICE 'Enum type ota_output_status already exists';
  END IF;
END$$;

-- ============================================================
-- STEP 2: Create ota_project_inputs table
-- One record per project, JSONB data with optimistic locking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_project_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.ota_projects(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- One input record per project
  CONSTRAINT ota_project_inputs_project_unique UNIQUE (project_id)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_ota_project_inputs_project 
ON public.ota_project_inputs(project_id);

COMMENT ON TABLE public.ota_project_inputs IS 
'Stores input data for OTA projects. One record per project with optimistic locking via updated_at.';

-- ============================================================
-- STEP 3: Create ota_project_outputs table
-- Multiple records per project (versioning), review workflow
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_project_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.ota_projects(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status public.ota_output_status NOT NULL DEFAULT 'DRAFT',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INT NOT NULL DEFAULT 1,
  
  -- Submit tracking
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id),
  
  -- Review tracking
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  review_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Unique version per project
  CONSTRAINT ota_project_outputs_version_unique UNIQUE (project_id, version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ota_project_outputs_project 
ON public.ota_project_outputs(project_id);

CREATE INDEX IF NOT EXISTS idx_ota_project_outputs_project_status 
ON public.ota_project_outputs(project_id, status);

CREATE INDEX IF NOT EXISTS idx_ota_project_outputs_project_version 
ON public.ota_project_outputs(project_id, version DESC);

COMMENT ON TABLE public.ota_project_outputs IS 
'Stores versioned output data for OTA projects with review workflow (DRAFT→SUBMITTED→APPROVED|REJECTED).';

-- ============================================================
-- STEP 4: Create view for latest output per project
-- ============================================================
CREATE OR REPLACE VIEW public.ota_project_outputs_latest AS
SELECT DISTINCT ON (project_id)
  id,
  project_id,
  version,
  status,
  data,
  schema_version,
  submitted_at,
  submitted_by,
  reviewed_at,
  reviewed_by,
  review_reason,
  created_at,
  created_by
FROM public.ota_project_outputs
ORDER BY project_id, version DESC;

COMMENT ON VIEW public.ota_project_outputs_latest IS 
'Returns the latest output version for each project.';

-- ============================================================
-- STEP 5: RLS Policies for ota_project_inputs
-- ============================================================

-- Enable RLS
ALTER TABLE public.ota_project_inputs ENABLE ROW LEVEL SECURITY;

-- SELECT: User must have project access
DROP POLICY IF EXISTS "inputs_select_policy" ON public.ota_project_inputs;
CREATE POLICY "inputs_select_policy" ON public.ota_project_inputs
  FOR SELECT
  USING (
    public.has_ota_project_access(project_id)
  );

-- INSERT: Admin/Lead/Super_admin or project member with write access
DROP POLICY IF EXISTS "inputs_insert_policy" ON public.ota_project_inputs;
CREATE POLICY "inputs_insert_policy" ON public.ota_project_inputs
  FOR INSERT
  WITH CHECK (
    public.has_ota_project_access(project_id)
  );

-- UPDATE: User has project access (optimistic locking handled by RPC)
DROP POLICY IF EXISTS "inputs_update_policy" ON public.ota_project_inputs;
CREATE POLICY "inputs_update_policy" ON public.ota_project_inputs
  FOR UPDATE
  USING (
    public.has_ota_project_access(project_id)
  );

-- DELETE: Admin/Super_admin only
DROP POLICY IF EXISTS "inputs_delete_policy" ON public.ota_project_inputs;
CREATE POLICY "inputs_delete_policy" ON public.ota_project_inputs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- ============================================================
-- STEP 6: RLS Policies for ota_project_outputs
-- ============================================================

-- Enable RLS
ALTER TABLE public.ota_project_outputs ENABLE ROW LEVEL SECURITY;

-- SELECT: User has project access
DROP POLICY IF EXISTS "outputs_select_policy" ON public.ota_project_outputs;
CREATE POLICY "outputs_select_policy" ON public.ota_project_outputs
  FOR SELECT
  USING (
    public.has_ota_project_access(project_id)
  );

-- INSERT: User has project access (creates DRAFT)
DROP POLICY IF EXISTS "outputs_insert_policy" ON public.ota_project_outputs;
CREATE POLICY "outputs_insert_policy" ON public.ota_project_outputs
  FOR INSERT
  WITH CHECK (
    public.has_ota_project_access(project_id)
  );

-- UPDATE: Very restrictive - only allow via RPC
-- Creator can update DRAFT only, others blocked
DROP POLICY IF EXISTS "outputs_update_policy" ON public.ota_project_outputs;
CREATE POLICY "outputs_update_policy" ON public.ota_project_outputs
  FOR UPDATE
  USING (
    -- Only DRAFT can be updated directly
    status = 'DRAFT'
    AND created_by = auth.uid()
    AND public.has_ota_project_access(project_id)
  );

-- DELETE: Disabled (versioning means we keep history)
DROP POLICY IF EXISTS "outputs_delete_policy" ON public.ota_project_outputs;
CREATE POLICY "outputs_delete_policy" ON public.ota_project_outputs
  FOR DELETE
  USING (false); -- Never allow delete

-- ============================================================
-- VERIFY
-- ============================================================
DO $$
BEGIN
  -- Check inputs table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_project_inputs'
  ) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: ota_project_inputs table not created';
  END IF;
  
  -- Check outputs table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ota_project_outputs'
  ) THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: ota_project_outputs table not created';
  END IF;
  
  RAISE NOTICE 'VERIFICATION PASSED: ota_project_inputs and ota_project_outputs tables created';
END$$;
