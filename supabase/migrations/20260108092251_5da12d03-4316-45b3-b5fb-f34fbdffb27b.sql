-- ============================================================
-- OTA OPERATIONS MODULE - 021: PROJECT INPUTS & OUTPUTS
-- ============================================================
-- Date: 2026-01-08
-- Purpose: Add structured inputs/outputs for OTA projects
-- ============================================================

-- STEP 1: Create output status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_output_status') THEN
    CREATE TYPE public.ota_output_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
  END IF;
END$$;

-- STEP 2: Create ota_project_inputs table
CREATE TABLE IF NOT EXISTS public.ota_project_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.ota_projects(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT ota_project_inputs_project_unique UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_ota_project_inputs_project ON public.ota_project_inputs(project_id);

-- STEP 3: Create ota_project_outputs table
CREATE TABLE IF NOT EXISTS public.ota_project_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.ota_projects(id) ON DELETE CASCADE,
  version INT NOT NULL,
  status public.ota_output_status NOT NULL DEFAULT 'DRAFT',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INT NOT NULL DEFAULT 1,
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT ota_project_outputs_version_unique UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ota_project_outputs_project ON public.ota_project_outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_ota_project_outputs_project_status ON public.ota_project_outputs(project_id, status);
CREATE INDEX IF NOT EXISTS idx_ota_project_outputs_project_version ON public.ota_project_outputs(project_id, version DESC);

-- STEP 4: Create view for latest output
CREATE OR REPLACE VIEW public.ota_project_outputs_latest AS
SELECT DISTINCT ON (project_id)
  id, project_id, version, status, data, schema_version,
  submitted_at, submitted_by, reviewed_at, reviewed_by, review_reason,
  created_at, created_by
FROM public.ota_project_outputs
ORDER BY project_id, version DESC;

-- STEP 5: RLS for ota_project_inputs
ALTER TABLE public.ota_project_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inputs_select_policy" ON public.ota_project_inputs;
CREATE POLICY "inputs_select_policy" ON public.ota_project_inputs
  FOR SELECT USING (public.has_ota_project_access(project_id));

DROP POLICY IF EXISTS "inputs_insert_policy" ON public.ota_project_inputs;
CREATE POLICY "inputs_insert_policy" ON public.ota_project_inputs
  FOR INSERT WITH CHECK (public.has_ota_project_access(project_id));

DROP POLICY IF EXISTS "inputs_update_policy" ON public.ota_project_inputs;
CREATE POLICY "inputs_update_policy" ON public.ota_project_inputs
  FOR UPDATE USING (public.has_ota_project_access(project_id));

DROP POLICY IF EXISTS "inputs_delete_policy" ON public.ota_project_inputs;
CREATE POLICY "inputs_delete_policy" ON public.ota_project_inputs
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- STEP 6: RLS for ota_project_outputs
ALTER TABLE public.ota_project_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outputs_select_policy" ON public.ota_project_outputs;
CREATE POLICY "outputs_select_policy" ON public.ota_project_outputs
  FOR SELECT USING (public.has_ota_project_access(project_id));

DROP POLICY IF EXISTS "outputs_insert_policy" ON public.ota_project_outputs;
CREATE POLICY "outputs_insert_policy" ON public.ota_project_outputs
  FOR INSERT WITH CHECK (public.has_ota_project_access(project_id));

DROP POLICY IF EXISTS "outputs_update_policy" ON public.ota_project_outputs;
CREATE POLICY "outputs_update_policy" ON public.ota_project_outputs
  FOR UPDATE USING (
    status = 'DRAFT' AND created_by = auth.uid() AND public.has_ota_project_access(project_id)
  );

DROP POLICY IF EXISTS "outputs_delete_policy" ON public.ota_project_outputs;
CREATE POLICY "outputs_delete_policy" ON public.ota_project_outputs
  FOR DELETE USING (false);