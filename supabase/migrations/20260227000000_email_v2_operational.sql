-- ============================================================
-- EMAIL MODULE V2 – Operational Inbox Migration
-- Created: 2026-02-27
-- ARCHITECTURE: Brand new thread-first schema from scratch.
-- Multi-tenant, RBAC safe, with Action Tagging and Audit Logs.
-- ============================================================

-- ─── 1. email_threads ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_threads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  email_account_id    uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  provider_thread_id  text NOT NULL,
  subject             text,
  primary_participant text,
  last_message_at     timestamptz,
  workflow_status     text NOT NULL DEFAULT 'OPEN' CHECK (workflow_status IN ('OPEN', 'WAITING_GUEST', 'INTERNAL_PENDING', 'DONE')),
  priority            text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  owner_id            uuid,
  tag                 text NOT NULL DEFAULT 'OTHER' CHECK (tag IN ('GUEST_REPLY', 'DISPUTE', 'FINANCE_ALERT', 'BOOKING_EXCEPTION', 'VIP_PARTNER', 'SILENT', 'OTHER')),
  is_muted            boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_threads_v2_account_provider
  ON public.email_threads (email_account_id, provider_thread_id);

CREATE INDEX IF NOT EXISTS idx_email_threads_v2_tenant 
  ON public.email_threads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_v2_tenant_last_msg 
  ON public.email_threads (tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_threads_v2_status_tag 
  ON public.email_threads (workflow_status, tag);

-- ─── 2. email_messages ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  email_account_id    uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  thread_id           uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  direction           text NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
  sender              text,
  recipients          jsonb DEFAULT '[]'::jsonb,
  body_html           text,
  body_text           text,
  message_id          text,
  in_reply_to         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_messages_v2_account_provider
  ON public.email_messages (email_account_id, provider_message_id);

CREATE INDEX IF NOT EXISTS idx_email_messages_v2_thread 
  ON public.email_messages (thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_email_messages_v2_tenant 
  ON public.email_messages (tenant_id);

-- ─── 3. email_thread_participants ───────────────────────────
CREATE TABLE IF NOT EXISTS public.email_thread_participants (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  email     text NOT NULL,
  role      text NOT NULL CHECK (role IN ('GUEST', 'OTA', 'INTERNAL'))
);

CREATE INDEX IF NOT EXISTS idx_email_participants_v2_thread 
  ON public.email_thread_participants (thread_id);

-- ─── 4. email_audit_logs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  thread_id  uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  action     text NOT NULL CHECK (action IN ('MARK_DONE', 'REOPEN', 'ASSIGN', 'CHANGE_PRIORITY', 'CHANGE_TAG')),
  before_data jsonb,
  after_data  jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_audit_logs_v2_tenant 
  ON public.email_audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_audit_logs_v2_thread 
  ON public.email_audit_logs (thread_id, created_at DESC);

-- ─── 5. Auto-update Trigger ─────────────────────────────────
DROP TRIGGER IF EXISTS trg_email_threads_v2_updated ON public.email_threads;
CREATE TRIGGER trg_email_threads_v2_updated
  BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at();

-- ─── 6. User helper access ──────────────────────────────────
-- Same as existing has_email_access() in previous migration: 
-- Grants access to admin, super_admin, cskh, sale.

-- ─── 7. RLS row security ────────────────────────────────────
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_audit_logs ENABLE ROW LEVEL SECURITY;

-- Select Policies (Read Access depending on RBAC)
CREATE POLICY email_threads_v2_rbac_select ON public.email_threads
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_messages_v2_rbac_select ON public.email_messages
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_participants_v2_rbac_select ON public.email_thread_participants
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_audit_logs_v2_rbac_select ON public.email_audit_logs
  FOR SELECT USING (public.has_email_access());

-- Insert/Update Policies (Manual operations from users)
-- 1. Updates to threads (Workflow actions like Mark Done, Reopen, Tag change)
CREATE POLICY email_threads_v2_rbac_update ON public.email_threads
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  );

-- 2. Inserts to Audit Logs (User actions)
CREATE POLICY email_audit_logs_v2_rbac_insert ON public.email_audit_logs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'cskh'::public.app_role)
    )
  );

-- ─── 8. Analytics RPC (V1) ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_email_analytics_v1(input_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Verify permissions
  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT jsonb_build_object(
    'threads_open_gt_8h', (
      SELECT count(*) FROM public.email_threads 
      WHERE tenant_id = input_tenant_id 
        AND workflow_status != 'DONE' 
        AND tag != 'SILENT' 
        AND last_message_at < (now() - interval '8 hours')
    ),
    'threads_per_tag', (
      SELECT jsonb_object_agg(tag, count)
      FROM (
        SELECT tag, count(*) 
        FROM public.email_threads 
        WHERE tenant_id = input_tenant_id AND workflow_status != 'DONE'
        GROUP BY tag
      ) t
    ),
    'threads_per_owner', (
      SELECT jsonb_object_agg(COALESCE(owner_id::text, 'unassigned'), count)
      FROM (
        SELECT owner_id, count(*) 
        FROM public.email_threads 
        WHERE tenant_id = input_tenant_id AND workflow_status != 'DONE'
        GROUP BY owner_id
      ) o
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ─── 9. Grants ──────────────────────────────────────────────
GRANT SELECT, UPDATE ON public.email_threads TO authenticated;
GRANT SELECT ON public.email_messages TO authenticated;
GRANT SELECT ON public.email_thread_participants TO authenticated;
GRANT SELECT, INSERT ON public.email_audit_logs TO authenticated;

-- Edge Functions (service_role) gets full capability
GRANT ALL ON public.email_threads TO service_role;
GRANT ALL ON public.email_messages TO service_role;
GRANT ALL ON public.email_thread_participants TO service_role;
GRANT ALL ON public.email_audit_logs TO service_role;

-- ─── DONE ───────────────────────────────────────────────────
