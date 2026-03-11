
-- ============================================================
-- EMAIL MODULE – Migration (v3 – RBAC Shared Workspace)
-- ============================================================

-- ─── 1. email_accounts ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  created_by    uuid NOT NULL,
  provider      text NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail')),
  email_address text NOT NULL,
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','ERROR')),
  scope_level   text NOT NULL DEFAULT 'READ_ONLY' CHECK (scope_level IN ('READ_ONLY','REPLY','FULL_MODIFY')),
  token_cipher   text,
  refresh_cipher text,
  expiry_at      timestamptz,
  sync_cursor    text,
  last_sync_at   timestamptz,
  syncing_since  timestamptz,
  error_code     text,
  error_at       timestamptz,
  visibility     text NOT NULL DEFAULT 'TEAM' CHECK (visibility IN ('TEAM', 'PRIVATE')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_tenant
  ON public.email_accounts (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_accounts_email
  ON public.email_accounts (email_address) WHERE status != 'REVOKED';

-- ─── 2. email_threads_mirror ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_threads_mirror (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  email_account_id   uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  provider_thread_id text NOT NULL,
  subject            text,
  snippet            text,
  participants       jsonb DEFAULT '[]'::jsonb,
  last_message_at    timestamptz,
  unread_count       int NOT NULL DEFAULT 0,
  labels             jsonb DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_threads_account_provider
  ON public.email_threads_mirror (email_account_id, provider_thread_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_tenant
  ON public.email_threads_mirror (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_last_message
  ON public.email_threads_mirror (email_account_id, last_message_at DESC);

-- ─── 3. email_messages_mirror ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_messages_mirror (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  email_account_id     uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  thread_id            uuid NOT NULL REFERENCES public.email_threads_mirror(id) ON DELETE CASCADE,
  provider_message_id  text NOT NULL,
  direction            text NOT NULL DEFAULT 'INBOUND' CHECK (direction IN ('INBOUND','OUTBOUND')),
  from_json            jsonb,
  to_json              jsonb,
  cc_json              jsonb,
  bcc_json             jsonb,
  date                 timestamptz,
  subject              text,
  headers              jsonb DEFAULT '{}'::jsonb,
  body_plain           text,
  body_html_sanitized  text,
  has_attachments      boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_messages_account_provider
  ON public.email_messages_mirror (email_account_id, provider_message_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread
  ON public.email_messages_mirror (thread_id, date ASC);
CREATE INDEX IF NOT EXISTS idx_email_messages_tenant
  ON public.email_messages_mirror (tenant_id);

-- ─── 4. email_actions_audit ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_actions_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  actor_user_id    uuid NOT NULL,
  action           text NOT NULL,
  email_account_id uuid,
  thread_id        uuid,
  message_id       uuid,
  meta             jsonb DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_audit_tenant
  ON public.email_actions_audit (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_audit_action
  ON public.email_actions_audit (action);

-- ─── 5. email_oauth_states ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_oauth_states (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_token text NOT NULL UNIQUE,
  tenant_id   uuid NOT NULL,
  user_id     uuid NOT NULL,
  scope_level text NOT NULL DEFAULT 'READ_ONLY',
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_oauth_states_token
  ON public.email_oauth_states (state_token) WHERE used_at IS NULL;

-- ─── 6. Auto-update updated_at trigger ──────────────────────
CREATE OR REPLACE FUNCTION public.email_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_accounts_updated ON public.email_accounts;
CREATE TRIGGER trg_email_accounts_updated
  BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at();

DROP TRIGGER IF EXISTS trg_email_threads_updated ON public.email_threads_mirror;
CREATE TRIGGER trg_email_threads_updated
  BEFORE UPDATE ON public.email_threads_mirror
  FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at();

DROP TRIGGER IF EXISTS trg_email_messages_updated ON public.email_messages_mirror;
CREATE TRIGGER trg_email_messages_updated
  BEFORE UPDATE ON public.email_messages_mirror
  FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at();

-- ─── 7. RLS ─────────────────────────────────────────────────
ALTER TABLE public.email_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages_mirror ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_actions_audit  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_oauth_states   ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS email_accounts_tenant_select  ON public.email_accounts;
DROP POLICY IF EXISTS email_accounts_tenant_insert  ON public.email_accounts;
DROP POLICY IF EXISTS email_accounts_tenant_update  ON public.email_accounts;
DROP POLICY IF EXISTS email_threads_tenant_select   ON public.email_threads_mirror;
DROP POLICY IF EXISTS email_threads_tenant_insert   ON public.email_threads_mirror;
DROP POLICY IF EXISTS email_threads_tenant_update   ON public.email_threads_mirror;
DROP POLICY IF EXISTS email_messages_tenant_select  ON public.email_messages_mirror;
DROP POLICY IF EXISTS email_messages_tenant_insert  ON public.email_messages_mirror;
DROP POLICY IF EXISTS email_messages_tenant_update  ON public.email_messages_mirror;
DROP POLICY IF EXISTS email_audit_tenant_select     ON public.email_actions_audit;
DROP POLICY IF EXISTS email_audit_tenant_insert     ON public.email_actions_audit;

DROP POLICY IF EXISTS email_accounts_rbac_select    ON public.email_accounts;
DROP POLICY IF EXISTS email_accounts_rbac_insert    ON public.email_accounts;
DROP POLICY IF EXISTS email_accounts_rbac_update    ON public.email_accounts;
DROP POLICY IF EXISTS email_threads_rbac_select     ON public.email_threads_mirror;
DROP POLICY IF EXISTS email_messages_rbac_select    ON public.email_messages_mirror;
DROP POLICY IF EXISTS email_audit_rbac_select       ON public.email_actions_audit;
DROP POLICY IF EXISTS email_audit_rbac_insert       ON public.email_actions_audit;

-- RBAC helper
CREATE OR REPLACE FUNCTION public.has_email_access()
RETURNS boolean AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role) OR
    public.has_role(auth.uid(), 'sale'::public.app_role);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- email_accounts policies
CREATE POLICY email_accounts_rbac_select ON public.email_accounts
  FOR SELECT USING (
    public.has_email_access()
    AND (visibility = 'TEAM' OR created_by = auth.uid())
  );

CREATE POLICY email_accounts_rbac_insert ON public.email_accounts
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY email_accounts_rbac_update ON public.email_accounts
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- email_threads_mirror policies
CREATE POLICY email_threads_rbac_select ON public.email_threads_mirror
  FOR SELECT USING (public.has_email_access());

-- email_messages_mirror policies
CREATE POLICY email_messages_rbac_select ON public.email_messages_mirror
  FOR SELECT USING (public.has_email_access());

-- email_actions_audit policies
CREATE POLICY email_audit_rbac_select ON public.email_actions_audit
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY email_audit_rbac_insert ON public.email_actions_audit
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- email_oauth_states: service_role only
GRANT ALL ON public.email_oauth_states TO service_role;
REVOKE ALL ON public.email_oauth_states FROM anon, authenticated;

-- ─── 8. Column-level security ───────────────────────────────
REVOKE ALL ON public.email_accounts FROM anon, authenticated;

GRANT SELECT (
  id, tenant_id, created_by, provider, email_address, status,
  scope_level, expiry_at, sync_cursor, last_sync_at, syncing_since,
  error_code, error_at, visibility, created_at, updated_at
) ON public.email_accounts TO authenticated;

GRANT INSERT (
  id, tenant_id, created_by, provider, email_address, status,
  scope_level, expiry_at, sync_cursor, last_sync_at,
  error_code, error_at, visibility, created_at, updated_at
) ON public.email_accounts TO authenticated;

GRANT UPDATE (
  status, scope_level, expiry_at, sync_cursor, last_sync_at,
  error_code, error_at, visibility, updated_at
) ON public.email_accounts TO authenticated;

GRANT ALL ON public.email_accounts TO service_role;

GRANT SELECT ON public.email_threads_mirror  TO authenticated;
GRANT SELECT ON public.email_messages_mirror TO authenticated;
GRANT SELECT, INSERT ON public.email_actions_audit TO authenticated;

GRANT ALL ON public.email_threads_mirror  TO service_role;
GRANT ALL ON public.email_messages_mirror TO service_role;
GRANT ALL ON public.email_actions_audit   TO service_role;
