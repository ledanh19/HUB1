-- ============================================================
-- EMAIL MODULE V2 – SECURITY HARDENING PATCH
-- Created: 2026-02-27
-- Applies over: 20260227000000_email_v2_operational.sql
-- ADDITIVE: no existing columns or tables removed.
-- ============================================================

-- ─── 0. Tenant ID Helper (SECURITY INVOKER) ─────────────────
-- Reads tenant_id from JWT app_metadata (set only by service_role).
-- MUST be SECURITY INVOKER so it runs as calling user, not postgres.
-- Never reads user_metadata (user-writable, untrusted).
CREATE OR REPLACE FUNCTION public.get_email_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
    -- Fallback: join to user_profiles for apps that store tenant there
    (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
  );
$$;

-- ─── 1. PHASE 1 — TENANT ISOLATION RLS LOCKDOWN ────────────
-- Drop all existing V2 policies and recreate with tenant_id guard.

-- email_threads ──────────────────────────────────────────────
DROP POLICY IF EXISTS email_threads_v2_rbac_select ON public.email_threads;
DROP POLICY IF EXISTS email_threads_v2_rbac_update ON public.email_threads;

CREATE POLICY email_threads_v2_tenant_select ON public.email_threads
  FOR SELECT USING (
    tenant_id = public.get_email_tenant_id()
    AND public.has_email_access()
  );

CREATE POLICY email_threads_v2_tenant_update ON public.email_threads
  FOR UPDATE
  USING (
    tenant_id = public.get_email_tenant_id()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'cskh'::public.app_role)
    )
  )
  WITH CHECK (
    -- Cannot change tenant_id — prevents row escaping tenant scope
    tenant_id = public.get_email_tenant_id()
  );

-- email_messages ──────────────────────────────────────────────
DROP POLICY IF EXISTS email_messages_v2_rbac_select ON public.email_messages;

CREATE POLICY email_messages_v2_tenant_select ON public.email_messages
  FOR SELECT USING (
    tenant_id = public.get_email_tenant_id()
    AND public.has_email_access()
  );

-- email_thread_participants ────────────────────────────────────
DROP POLICY IF EXISTS email_participants_v2_rbac_select ON public.email_thread_participants;

-- participants table has no tenant_id column — join to parent thread
CREATE POLICY email_participants_v2_tenant_select ON public.email_thread_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.email_threads t
      WHERE t.id = thread_id
        AND t.tenant_id = public.get_email_tenant_id()
        AND public.has_email_access()
    )
  );

-- email_audit_logs ────────────────────────────────────────────
DROP POLICY IF EXISTS email_audit_logs_v2_rbac_select ON public.email_audit_logs;
DROP POLICY IF EXISTS email_audit_logs_v2_rbac_insert ON public.email_audit_logs;

-- SELECT: admin/super_admin only (audit logs are privileged)
CREATE POLICY email_audit_logs_v2_tenant_select ON public.email_audit_logs
  FOR SELECT USING (
    tenant_id = public.get_email_tenant_id()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

-- INSERT: REVOKE from authenticated — audit is written server-side only via RPC
REVOKE INSERT ON public.email_audit_logs FROM authenticated;
GRANT INSERT ON public.email_audit_logs TO service_role;

-- ─── 2. PHASE 1 — ANALYTICS RPC HARDENING ───────────────────
-- REMOVE caller-supplied tenant_id parameter.
-- REMOVE SECURITY DEFINER.
-- Derive tenant from JWT internally.
-- Use SECURITY INVOKER so Postgres checks RLS on underlying tables too.

DROP FUNCTION IF EXISTS public.get_email_analytics_v1(uuid);

CREATE OR REPLACE FUNCTION public.get_email_analytics_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- runs as calling user, RLS on email_threads is enforced
AS $$
DECLARE
  v_tenant_id uuid;
  result      jsonb;
BEGIN
  v_tenant_id := public.get_email_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no tenant context';
  END IF;

  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
  END IF;

  SELECT jsonb_build_object(
    'total_action_required', (
      SELECT count(*) FROM public.email_threads
      WHERE tenant_id = v_tenant_id
        AND workflow_status NOT IN ('DONE')
        AND tag != 'SILENT'
        AND is_muted = false
    ),
    'threads_open_gt_8h', (
      SELECT count(*) FROM public.email_threads
      WHERE tenant_id = v_tenant_id
        AND workflow_status != 'DONE'
        AND tag != 'SILENT'
        AND last_message_at < (now() - interval '8 hours')
    ),
    'threads_per_tag', (
      SELECT COALESCE(jsonb_object_agg(tag, cnt), '{}'::jsonb)
      FROM (
        SELECT tag, count(*) AS cnt
        FROM public.email_threads
        WHERE tenant_id = v_tenant_id AND workflow_status != 'DONE'
        GROUP BY tag
      ) t
    ),
    'threads_per_owner', (
      SELECT COALESCE(jsonb_object_agg(COALESCE(owner_id::text, 'unassigned'), cnt), '{}'::jsonb)
      FROM (
        SELECT owner_id, count(*) AS cnt
        FROM public.email_threads
        WHERE tenant_id = v_tenant_id AND workflow_status != 'DONE'
        GROUP BY owner_id
      ) o
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- No GRANT needed for SECURITY INVOKER — RLS on the tables handles access control.

-- ─── 3. PHASE 2 — ATOMIC WORKFLOW TRANSITION RPC ────────────
-- Single transaction: validate ownership → before snapshot → update → audit insert
-- SECURITY DEFINER here IS justified: we need to WRITE audit_logs
-- even though INSERT is revoked from authenticated.
-- Scope is minimal and explicitly checked inside the function.

CREATE OR REPLACE FUNCTION public.email_update_workflow(
  p_thread_id  uuid,
  p_new_status text,
  p_user_id    uuid
)
RETURNS public.email_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- prevent search_path injection
AS $$
DECLARE
  v_tenant_id   uuid;
  v_before      public.email_threads;
  v_after       public.email_threads;
BEGIN
  -- 1. Resolve tenant from JWT (caller's context)
  v_tenant_id := public.get_email_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. Validate caller has update rights
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- 3. Validate status value
  IF p_new_status NOT IN ('OPEN', 'WAITING_GUEST', 'INTERNAL_PENDING', 'DONE') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  -- 4. Lock + fetch thread (must belong to caller's tenant)
  SELECT * INTO v_before
  FROM public.email_threads
  WHERE id = p_thread_id AND tenant_id = v_tenant_id
  FOR UPDATE;  -- row lock prevents concurrent conflicting updates

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found or access denied';
  END IF;

  -- 5. Perform update
  UPDATE public.email_threads
  SET
    workflow_status   = p_new_status,
    status_updated_by = p_user_id,
    status_updated_at = now(),
    updated_at        = now()
  WHERE id = p_thread_id
  RETURNING * INTO v_after;

  -- 6. Write audit log (atomic — same transaction)
  INSERT INTO public.email_audit_logs (
    tenant_id, thread_id, user_id, action, before_data, after_data
  ) VALUES (
    v_tenant_id,
    p_thread_id,
    p_user_id,
    CASE p_new_status
      WHEN 'DONE'             THEN 'MARK_DONE'
      WHEN 'OPEN'             THEN 'REOPEN'
      WHEN 'WAITING_GUEST'    THEN 'REOPEN'
      WHEN 'INTERNAL_PENDING' THEN 'REOPEN'
      ELSE 'REOPEN'
    END,
    jsonb_build_object(
      'workflow_status', v_before.workflow_status,
      'priority',        v_before.priority,
      'tag',             v_before.tag
    ),
    jsonb_build_object(
      'workflow_status', v_after.workflow_status,
      'priority',        v_after.priority,
      'tag',             v_after.tag
    )
  );

  RETURN v_after;
END;
$$;

-- Generic RPC for priority change
CREATE OR REPLACE FUNCTION public.email_update_priority(
  p_thread_id   uuid,
  p_new_priority text,
  p_user_id     uuid
)
RETURNS public.email_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_before    public.email_threads;
  v_after     public.email_threads;
BEGIN
  v_tenant_id := public.get_email_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF p_new_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN
    RAISE EXCEPTION 'Invalid priority: %', p_new_priority;
  END IF;

  SELECT * INTO v_before FROM public.email_threads
  WHERE id = p_thread_id AND tenant_id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thread not found or access denied'; END IF;

  UPDATE public.email_threads SET priority = p_new_priority, updated_at = now()
  WHERE id = p_thread_id RETURNING * INTO v_after;

  INSERT INTO public.email_audit_logs (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (
    v_tenant_id, p_thread_id, p_user_id, 'CHANGE_PRIORITY',
    jsonb_build_object('priority', v_before.priority),
    jsonb_build_object('priority', v_after.priority)
  );

  RETURN v_after;
END;
$$;

-- Tag change RPC
CREATE OR REPLACE FUNCTION public.email_update_tag(
  p_thread_id uuid,
  p_new_tag   text,
  p_user_id   uuid
)
RETURNS public.email_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_before    public.email_threads;
  v_after     public.email_threads;
BEGIN
  v_tenant_id := public.get_email_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT * INTO v_before FROM public.email_threads
  WHERE id = p_thread_id AND tenant_id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thread not found or access denied'; END IF;

  -- Set tag as MANUAL so sync won't overwrite it
  UPDATE public.email_threads
  SET tag = p_new_tag, tag_source = 'MANUAL', updated_at = now()
  WHERE id = p_thread_id RETURNING * INTO v_after;

  INSERT INTO public.email_audit_logs (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (
    v_tenant_id, p_thread_id, p_user_id, 'CHANGE_TAG',
    jsonb_build_object('tag', v_before.tag, 'tag_source', v_before.tag_source),
    jsonb_build_object('tag', v_after.tag, 'tag_source', v_after.tag_source)
  );

  RETURN v_after;
END;
$$;

-- Grant execute to authenticated (RPCs validate tenant + role internally)
GRANT EXECUTE ON FUNCTION public.email_update_workflow(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_update_priority(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_update_tag(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_analytics_v1() TO authenticated;

-- ─── 4. PHASE 4 — DATA CORRECTNESS: Schema additions ────────

-- email_messages: add sent_at and gmail_internal_date
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS sent_at              timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_internal_date  bigint;

-- Update existing rows: best-effort backfill from created_at
UPDATE public.email_messages SET sent_at = created_at WHERE sent_at IS NULL;

-- email_threads: add status_updated_by/at for workflow tracking (used by RPC above)
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS status_updated_by uuid,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- ─── 5. PHASE 5 — SYNC OVERWRITE PROTECTION ─────────────────

-- tag_source: SYSTEM = auto-classified, MANUAL = user-overridden (never overwrite)
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS tag_source text NOT NULL DEFAULT 'SYSTEM'
  CHECK (tag_source IN ('SYSTEM', 'MANUAL'));

-- Existing rows default to SYSTEM (sync may update them)

-- ─── 6. PHASE 6 — COMPOSITE INDEXES FOR SCALE ───────────────

-- Action Required folder query: tenant + status + tag + is_muted + last_message_at
CREATE INDEX IF NOT EXISTS idx_threads_v2_action_required
  ON public.email_threads (tenant_id, last_message_at DESC)
  WHERE workflow_status != 'DONE' AND tag != 'SILENT' AND is_muted = false;

-- Tag-based folder query: tenant + tag + last_message_at
CREATE INDEX IF NOT EXISTS idx_threads_v2_tenant_tag_lastmsg
  ON public.email_threads (tenant_id, tag, last_message_at DESC);

-- Status+Tag analytics: replaces old idx_email_threads_v2_status_tag
DROP INDEX IF EXISTS idx_email_threads_v2_status_tag;
CREATE INDEX IF NOT EXISTS idx_threads_v2_tenant_status_lastmsg
  ON public.email_threads (tenant_id, workflow_status, last_message_at DESC);

-- Unique constraint on participants to prevent sync duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_participants_v2_thread_email
  ON public.email_thread_participants (thread_id, email);

-- sent_at index for timeline ordering
CREATE INDEX IF NOT EXISTS idx_email_messages_v2_thread_sent
  ON public.email_messages (thread_id, sent_at ASC NULLS LAST);

-- ─── DONE ───────────────────────────────────────────────────
