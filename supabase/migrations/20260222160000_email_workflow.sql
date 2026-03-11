-- ============================================================
-- EMAIL WORKFLOW – Migration (Additive, NON-BREAKING)
-- Created: 2026-02-22
-- Adds workflow tracking (status, assignment, booking link)
-- and internal notes for email threads.
-- Option 1: Separate tables to avoid sync upsert overwrite.
-- ============================================================

-- ─── 1. email_thread_workflow ──────────────────────────────
-- 1:1 with email_threads_mirror. Stores workflow state.
CREATE TABLE IF NOT EXISTS public.email_thread_workflow (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid NOT NULL UNIQUE
                      REFERENCES public.email_threads_mirror(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN','IN_PROGRESS','NEED_FOLLOWUP','DONE')),
  assigned_to       uuid,
  assigned_by       uuid,
  assigned_at       timestamptz,
  booking_unified_id  text,
  booking_linked_by   uuid,
  booking_linked_at   timestamptz,
  status_updated_by   uuid,
  status_updated_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_workflow_thread
  ON public.email_thread_workflow (thread_id);
CREATE INDEX IF NOT EXISTS idx_email_workflow_status
  ON public.email_thread_workflow (status);
CREATE INDEX IF NOT EXISTS idx_email_workflow_assigned
  ON public.email_thread_workflow (assigned_to) WHERE assigned_to IS NOT NULL;

-- ─── 2. email_thread_notes ─────────────────────────────────
-- 1:many internal notes per thread.
CREATE TABLE IF NOT EXISTS public.email_thread_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL
                REFERENCES public.email_threads_mirror(id) ON DELETE CASCADE,
  note        text NOT NULL,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_notes_thread
  ON public.email_thread_notes (thread_id, created_at DESC);

-- ─── 3. Triggers ───────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_email_workflow_updated ON public.email_thread_workflow;
CREATE TRIGGER trg_email_workflow_updated
  BEFORE UPDATE ON public.email_thread_workflow
  FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at();

-- ─── 4. RLS ────────────────────────────────────────────────
ALTER TABLE public.email_thread_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_notes    ENABLE ROW LEVEL SECURITY;

-- email_thread_workflow policies
CREATE POLICY email_workflow_rbac_select ON public.email_thread_workflow
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_workflow_rbac_insert ON public.email_thread_workflow
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  );

CREATE POLICY email_workflow_rbac_update ON public.email_thread_workflow
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  );

-- email_thread_notes policies
CREATE POLICY email_notes_rbac_select ON public.email_thread_notes
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_notes_rbac_insert ON public.email_thread_notes
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  );

CREATE POLICY email_notes_rbac_delete ON public.email_thread_notes
  FOR DELETE USING (
    created_by = auth.uid() OR
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- ─── 5. Grants ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.email_thread_workflow TO authenticated;
GRANT ALL ON public.email_thread_workflow TO service_role;

GRANT SELECT, INSERT, DELETE ON public.email_thread_notes TO authenticated;
GRANT ALL ON public.email_thread_notes TO service_role;

-- ─── Done ──────────────────────────────────────────────────
