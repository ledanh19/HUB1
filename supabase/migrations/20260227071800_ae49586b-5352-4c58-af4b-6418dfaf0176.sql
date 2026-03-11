
-- ============================================================
-- EMAIL V2 – Reply Schema Migration (ADDITIVE ONLY)
-- ============================================================

-- A) email_messages — ADD reply/outbound columns
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'SENT';

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS error_code text;

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_idem_idx
  ON public.email_messages (tenant_id, email_account_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- B) email_threads — ADD participant tracking columns
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS primary_participant_email text;

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS primary_participant_name text;

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS tag_source text DEFAULT 'SYSTEM';

-- C) email_attachments — NEW TABLE
CREATE TABLE IF NOT EXISTS public.email_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  message_id    uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  filename      text,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_message
  ON public.email_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_tenant
  ON public.email_attachments (tenant_id);

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_attachments_rbac_select ON public.email_attachments
  FOR SELECT USING (public.has_email_access());

GRANT SELECT ON public.email_attachments TO authenticated;
GRANT ALL ON public.email_attachments TO service_role;

-- D) email_audit_logs — Extend CHECK constraint
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
    WHERE conrelid = 'public.email_audit_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%action%';
  
  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.email_audit_logs DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'public.email_audit_logs'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%action%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.email_audit_logs
  ADD CONSTRAINT email_audit_logs_action_check
  CHECK (action IN (
    'MARK_DONE', 'REOPEN', 'ASSIGN', 'CHANGE_PRIORITY', 'CHANGE_TAG',
    'SEND_REPLY', 'SEND_FORWARD'
  ));

-- E) Security
REVOKE INSERT ON public.email_messages FROM authenticated;
REVOKE UPDATE ON public.email_messages FROM authenticated;
REVOKE DELETE ON public.email_messages FROM authenticated;
GRANT ALL ON public.email_messages TO service_role;
