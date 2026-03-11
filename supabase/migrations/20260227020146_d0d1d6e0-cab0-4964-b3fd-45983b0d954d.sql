
-- ============================================================
-- EMAIL V2 — SECURITY HARDENING + RLS FIX (COMBINED)
-- ============================================================

-- 0. Tenant ID Helper (without user_profiles reference)
CREATE OR REPLACE FUNCTION public.get_email_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$;

-- 1. DROP all old V2 policies
DROP POLICY IF EXISTS email_threads_v2_rbac_select ON public.email_threads;
DROP POLICY IF EXISTS email_threads_v2_rbac_update ON public.email_threads;
DROP POLICY IF EXISTS email_threads_v2_tenant_select ON public.email_threads;
DROP POLICY IF EXISTS email_threads_v2_tenant_update ON public.email_threads;
DROP POLICY IF EXISTS email_messages_v2_rbac_select ON public.email_messages;
DROP POLICY IF EXISTS email_messages_v2_tenant_select ON public.email_messages;
DROP POLICY IF EXISTS email_participants_v2_rbac_select ON public.email_thread_participants;
DROP POLICY IF EXISTS email_participants_v2_tenant_select ON public.email_thread_participants;
DROP POLICY IF EXISTS email_audit_logs_v2_rbac_select ON public.email_audit_logs;
DROP POLICY IF EXISTS email_audit_logs_v2_rbac_insert ON public.email_audit_logs;
DROP POLICY IF EXISTS email_audit_logs_v2_tenant_select ON public.email_audit_logs;

-- 2. RECREATE correct RLS — single-tenant pattern (has_email_access only)
CREATE POLICY email_threads_v2_select ON public.email_threads
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_threads_v2_update ON public.email_threads
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  );

CREATE POLICY email_messages_v2_select ON public.email_messages
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_participants_v2_select ON public.email_thread_participants
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_audit_logs_v2_select ON public.email_audit_logs
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Restore INSERT for audit logs (RPCs need it)
GRANT INSERT ON public.email_audit_logs TO authenticated;

CREATE POLICY email_audit_logs_v2_insert ON public.email_audit_logs
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND public.has_email_access()
  );

-- 3. Schema additions
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS sent_at              timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_internal_date  bigint;

UPDATE public.email_messages SET sent_at = created_at WHERE sent_at IS NULL;

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS status_updated_by uuid,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS tag_source text NOT NULL DEFAULT 'SYSTEM';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'email_threads_tag_source_check'
  ) THEN
    ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_tag_source_check CHECK (tag_source IN ('SYSTEM', 'MANUAL'));
  END IF;
END $$;

-- 4. Atomic workflow RPCs (single-tenant, no JWT tenant check)
CREATE OR REPLACE FUNCTION public.email_update_workflow(
  p_thread_id uuid, p_new_status text, p_user_id uuid
)
RETURNS public.email_threads
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_before public.email_threads; v_after public.email_threads;
BEGIN
  IF auth.uid() != p_user_id THEN RAISE EXCEPTION 'User ID mismatch'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'cskh'::public.app_role)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_new_status NOT IN ('OPEN', 'WAITING_GUEST', 'INTERNAL_PENDING', 'DONE') THEN RAISE EXCEPTION 'Invalid status: %', p_new_status; END IF;

  SELECT * INTO v_before FROM public.email_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thread not found'; END IF;

  UPDATE public.email_threads SET workflow_status = p_new_status, status_updated_by = p_user_id, status_updated_at = now(), updated_at = now() WHERE id = p_thread_id RETURNING * INTO v_after;

  INSERT INTO public.email_audit_logs (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (v_before.tenant_id, p_thread_id, p_user_id,
    CASE p_new_status WHEN 'DONE' THEN 'MARK_DONE' ELSE 'REOPEN' END,
    jsonb_build_object('workflow_status', v_before.workflow_status),
    jsonb_build_object('workflow_status', v_after.workflow_status));
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_update_priority(
  p_thread_id uuid, p_new_priority text, p_user_id uuid
)
RETURNS public.email_threads
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_before public.email_threads; v_after public.email_threads;
BEGIN
  IF auth.uid() != p_user_id THEN RAISE EXCEPTION 'User ID mismatch'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'cskh'::public.app_role)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_new_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN RAISE EXCEPTION 'Invalid priority: %', p_new_priority; END IF;

  SELECT * INTO v_before FROM public.email_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thread not found'; END IF;

  UPDATE public.email_threads SET priority = p_new_priority, updated_at = now() WHERE id = p_thread_id RETURNING * INTO v_after;

  INSERT INTO public.email_audit_logs (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (v_before.tenant_id, p_thread_id, p_user_id, 'CHANGE_PRIORITY',
    jsonb_build_object('priority', v_before.priority), jsonb_build_object('priority', v_after.priority));
  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.email_update_tag(
  p_thread_id uuid, p_new_tag text, p_user_id uuid
)
RETURNS public.email_threads
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_before public.email_threads; v_after public.email_threads;
BEGIN
  IF auth.uid() != p_user_id THEN RAISE EXCEPTION 'User ID mismatch'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'cskh'::public.app_role)) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT * INTO v_before FROM public.email_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thread not found'; END IF;

  UPDATE public.email_threads SET tag = p_new_tag, tag_source = 'MANUAL', updated_at = now() WHERE id = p_thread_id RETURNING * INTO v_after;

  INSERT INTO public.email_audit_logs (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (v_before.tenant_id, p_thread_id, p_user_id, 'CHANGE_TAG',
    jsonb_build_object('tag', v_before.tag, 'tag_source', v_before.tag_source),
    jsonb_build_object('tag', v_after.tag, 'tag_source', v_after.tag_source));
  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_update_workflow(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_update_priority(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_update_tag(uuid, text, uuid) TO authenticated;

-- 5. Analytics RPC (single-tenant, no tenant param)
DROP FUNCTION IF EXISTS public.get_email_analytics_v1(uuid);
DROP FUNCTION IF EXISTS public.get_email_analytics_v1();

CREATE OR REPLACE FUNCTION public.get_email_analytics_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  IF NOT public.has_email_access() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  RETURN jsonb_build_object(
    'total_action_required', (
      SELECT count(*) FROM public.email_threads WHERE workflow_status NOT IN ('DONE') AND tag != 'SILENT' AND is_muted = false
    ),
    'threads_open_gt_8h', (
      SELECT count(*) FROM public.email_threads WHERE workflow_status != 'DONE' AND tag != 'SILENT' AND last_message_at < (now() - interval '8 hours')
    ),
    'threads_per_tag', (
      SELECT COALESCE(jsonb_object_agg(tag, cnt), '{}'::jsonb) FROM (SELECT tag, count(*) AS cnt FROM public.email_threads WHERE workflow_status != 'DONE' GROUP BY tag) t
    ),
    'threads_per_owner', (
      SELECT COALESCE(jsonb_object_agg(COALESCE(owner_id::text, 'unassigned'), cnt), '{}'::jsonb) FROM (SELECT owner_id, count(*) AS cnt FROM public.email_threads WHERE workflow_status != 'DONE' GROUP BY owner_id) o
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_analytics_v1() TO authenticated;

-- 6. Debug RPC
CREATE OR REPLACE FUNCTION public.email_debug_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  RETURN jsonb_build_object(
    'current_user_id', auth.uid()::text,
    'has_email_access', public.has_email_access(),
    'threads_visible', (SELECT count(*) FROM public.email_threads),
    'messages_visible', (SELECT count(*) FROM public.email_messages),
    'accounts_visible', (SELECT count(*) FROM public.email_accounts)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_debug_status() TO authenticated;

-- 7. Composite indexes
CREATE INDEX IF NOT EXISTS idx_threads_v2_action_required
  ON public.email_threads (tenant_id, last_message_at DESC)
  WHERE workflow_status != 'DONE' AND tag != 'SILENT' AND is_muted = false;

CREATE INDEX IF NOT EXISTS idx_threads_v2_tenant_tag_lastmsg
  ON public.email_threads (tenant_id, tag, last_message_at DESC);

DROP INDEX IF EXISTS idx_email_threads_v2_status_tag;
CREATE INDEX IF NOT EXISTS idx_threads_v2_tenant_status_lastmsg
  ON public.email_threads (tenant_id, workflow_status, last_message_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_participants_v2_thread_email
  ON public.email_thread_participants (thread_id, email);

CREATE INDEX IF NOT EXISTS idx_email_messages_v2_thread_sent
  ON public.email_messages (thread_id, sent_at ASC NULLS LAST);
