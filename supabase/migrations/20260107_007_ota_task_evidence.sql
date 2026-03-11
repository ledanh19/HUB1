-- ============================================================
-- OTA OPERATIONS MODULE - 007: OTA_TASK_EVIDENCE TABLE
-- ============================================================
-- Date: 2026-01-07
-- Purpose: Evidence/attachments for task completion
-- 
-- Design (Model A - Content Immutable, Review Mutable):
--   IMMUTABLE fields (after INSERT):
--     - task_id, evidence_type, file_url, description, created_at, created_by
--   
--   MUTABLE fields (for review):
--     - review_status, reviewed_at, reviewed_by, review_notes
--   
--   This preserves original submission integrity while allowing review workflow
-- ============================================================

-- ============================================================
-- ENUM TYPE: Evidence Type
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_evidence_type') THEN
    CREATE TYPE public.ota_evidence_type AS ENUM (
      'SCREENSHOT',      -- Screen capture
      'DOCUMENT',        -- PDF, Word, etc.
      'SPREADSHEET',     -- Excel, CSV
      'IMAGE',           -- Photo evidence
      'VIDEO',           -- Video evidence
      'LINK',            -- External URL reference
      'NOTE',            -- Text note (no file)
      'OTHER'            -- Other types
    );
  END IF;
END$$;

-- ============================================================
-- ENUM TYPE: Review Status
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ota_evidence_review_status') THEN
    CREATE TYPE public.ota_evidence_review_status AS ENUM (
      'PENDING',         -- Awaiting review
      'APPROVED',        -- Evidence accepted
      'REJECTED',        -- Evidence rejected
      'NEEDS_REVISION'   -- Requires modification
    );
  END IF;
END$$;

-- ============================================================
-- TABLE: ota_task_evidence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ota_task_evidence (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Task Reference (IMMUTABLE after INSERT)
  task_id UUID NOT NULL REFERENCES public.ota_tasks(id) ON DELETE CASCADE,
  
  -- Evidence Content (IMMUTABLE after INSERT)
  evidence_type public.ota_evidence_type NOT NULL,
  file_url TEXT,                     -- Storage URL (null for NOTE type)
  file_name TEXT,                    -- Original filename
  file_size_bytes BIGINT,            -- File size for tracking
  mime_type TEXT,                    -- MIME type
  description TEXT,                  -- Evidence description
  
  -- Validation
  CONSTRAINT valid_file_or_note CHECK (
    (evidence_type = 'NOTE' AND file_url IS NULL) 
    OR (evidence_type != 'NOTE' AND file_url IS NOT NULL)
  ),
  
  -- Review Workflow (MUTABLE)
  review_status public.ota_evidence_review_status NOT NULL DEFAULT 'PENDING',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  
  -- Audit Trail (created_* IMMUTABLE)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_task_id 
ON public.ota_task_evidence(task_id);

CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_review_status 
ON public.ota_task_evidence(review_status) 
WHERE review_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_created_by 
ON public.ota_task_evidence(created_by);

CREATE INDEX IF NOT EXISTS idx_ota_task_evidence_task_status 
ON public.ota_task_evidence(task_id, review_status);

-- ============================================================
-- TRIGGER: Set created_by on INSERT
-- ============================================================
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

-- ============================================================
-- TRIGGER: ENFORCE IMMUTABILITY (Model A)
-- Prevents modification of content fields after INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_ota_evidence_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Check immutable fields
  IF NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    PERFORM public.raise_immutable_error('task_id');
  END IF;
  
  IF NEW.evidence_type IS DISTINCT FROM OLD.evidence_type THEN
    PERFORM public.raise_immutable_error('evidence_type');
  END IF;
  
  IF NEW.file_url IS DISTINCT FROM OLD.file_url THEN
    PERFORM public.raise_immutable_error('file_url');
  END IF;
  
  IF NEW.file_name IS DISTINCT FROM OLD.file_name THEN
    PERFORM public.raise_immutable_error('file_name');
  END IF;
  
  IF NEW.file_size_bytes IS DISTINCT FROM OLD.file_size_bytes THEN
    PERFORM public.raise_immutable_error('file_size_bytes');
  END IF;
  
  IF NEW.mime_type IS DISTINCT FROM OLD.mime_type THEN
    PERFORM public.raise_immutable_error('mime_type');
  END IF;
  
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    PERFORM public.raise_immutable_error('description');
  END IF;
  
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    PERFORM public.raise_immutable_error('created_at');
  END IF;
  
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    PERFORM public.raise_immutable_error('created_by');
  END IF;
  
  -- Mutable fields allowed: review_status, reviewed_at, reviewed_by, review_notes
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ota_task_evidence_immutability ON public.ota_task_evidence;
CREATE TRIGGER tr_ota_task_evidence_immutability
  BEFORE UPDATE ON public.ota_task_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ota_evidence_immutability();

-- ============================================================
-- TRIGGER: Track review timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION public.track_ota_evidence_review()
RETURNS TRIGGER AS $$
BEGIN
  -- Set reviewed_at and reviewed_by when status changes from PENDING
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

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE public.ota_task_evidence ENABLE ROW LEVEL SECURITY;

-- SELECT: OTA role can view evidence for tasks in accessible projects
CREATE POLICY "OTA evidence viewable by project members"
ON public.ota_task_evidence
FOR SELECT
TO authenticated
USING (
  public.is_ota_role()
  AND EXISTS (
    SELECT 1 FROM public.ota_tasks t
    WHERE t.id = task_id
    AND public.has_ota_project_access(t.project_id)
  )
);

-- INSERT: OTA role can submit evidence for tasks they can access
CREATE POLICY "OTA evidence insertable by project members"
ON public.ota_task_evidence
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ota_role()
  AND EXISTS (
    SELECT 1 FROM public.ota_tasks t
    WHERE t.id = task_id
    AND public.has_ota_project_access(t.project_id)
  )
);

-- UPDATE: Only Lead/Admin can review (update review fields)
CREATE POLICY "OTA evidence updatable by lead or admin"
ON public.ota_task_evidence
FOR UPDATE
TO authenticated
USING (
  public.is_ota_lead_or_admin()
  AND EXISTS (
    SELECT 1 FROM public.ota_tasks t
    WHERE t.id = task_id
    AND public.has_ota_project_access(t.project_id)
  )
)
WITH CHECK (
  public.is_ota_lead_or_admin()
);

-- DELETE: Only ADMIN can delete evidence (should be rare)
CREATE POLICY "OTA evidence deletable by admin only"
ON public.ota_task_evidence
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
