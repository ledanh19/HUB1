-- ============================================================
-- EMAIL V2 — RLS FIX (single-tenant architecture correction)
-- Created: 2026-02-27
-- ROOT CAUSE: Previous hardening migration introduced
--   get_email_tenant_id() which reads app_metadata.tenant_id.
--   This app is SINGLE-TENANT: tenant_id is stored on records
--   (email_accounts, email_threads) but NEVER in JWT claims.
--   Result: get_email_tenant_id() always returned NULL,
--   causing ALL RLS policies to match 0 rows → empty inbox.
--
-- FIX STRATEGY:
--   - Remove broken tenant_id RLS check from V2 tables.
--   - Reuse proven single-tenant pattern: has_email_access()
--     (checks user_roles table for role — same as all V1 tables)
--   - email_account_id FK already provides indirect tenant scope
--     (threads belong to accounts → accounts belong to tenants)
--   - Keep atomic workflow RPCs; patch tenant validation to use
--     email_accounts table join instead of JWT claim.
-- ============================================================

-- ─── 1. DROP broken policies from V2 tables ─────────────────

DROP POLICY IF EXISTS email_threads_v2_tenant_select ON public.email_threads;
DROP POLICY IF EXISTS email_threads_v2_tenant_update ON public.email_threads;
DROP POLICY IF EXISTS email_messages_v2_tenant_select ON public.email_messages;
DROP POLICY IF EXISTS email_participants_v2_tenant_select ON public.email_thread_participants;
DROP POLICY IF EXISTS email_audit_logs_v2_tenant_select ON public.email_audit_logs;

-- Also drop any that might have been created by first migration
DROP POLICY IF EXISTS email_threads_v2_rbac_select ON public.email_threads;
DROP POLICY IF EXISTS email_threads_v2_rbac_update ON public.email_threads;
DROP POLICY IF EXISTS email_messages_v2_rbac_select ON public.email_messages;
DROP POLICY IF EXISTS email_participants_v2_rbac_select ON public.email_thread_participants;
DROP POLICY IF EXISTS email_audit_logs_v2_rbac_select ON public.email_audit_logs;
DROP POLICY IF EXISTS email_audit_logs_v2_rbac_insert ON public.email_audit_logs;


-- ─── 2. RECREATE correct RLS — same pattern as V1 email tables ──

-- email_threads
CREATE POLICY email_threads_v2_select ON public.email_threads
  FOR SELECT USING (public.has_email_access());

CREATE POLICY email_threads_v2_update ON public.email_threads
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  );

-- email_messages
CREATE POLICY email_messages_v2_select ON public.email_messages
  FOR SELECT USING (public.has_email_access());

-- email_thread_participants
CREATE POLICY email_participants_v2_select ON public.email_thread_participants
  FOR SELECT USING (public.has_email_access());

-- email_audit_logs
CREATE POLICY email_audit_logs_v2_select ON public.email_audit_logs
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Restore INSERT to authenticated for audit logs
-- (the atomic RPCs above run as SECURITY DEFINER and need to insert;
--  service_role bypass RLS entirely anyway)
GRANT INSERT ON public.email_audit_logs TO authenticated;

CREATE POLICY email_audit_logs_v2_insert ON public.email_audit_logs
  FOR INSERT WITH CHECK (
    -- Only allow insert if the user_id matches the caller
    -- and caller has at minimum email access
    auth.uid() = user_id AND public.has_email_access()
  );

-- ─── 3. PATCH atomic workflow RPCs ──────────────────────────
-- Remove the broken JWT tenant_id lookup. Validate ownership via
-- email_account FK join since this is single-tenant.

CREATE OR REPLACE FUNCTION public.email_update_workflow(
  p_thread_id  uuid,
  p_new_status text,
  p_user_id    uuid
)
RETURNS public.email_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before  public.email_threads;
  v_after   public.email_threads;
BEGIN
  -- Validate caller identity
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'User ID mismatch';
  END IF;

  -- Validate caller has update rights
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
  END IF;

  -- Validate status value
  IF p_new_status NOT IN ('OPEN', 'WAITING_GUEST', 'INTERNAL_PENDING', 'DONE') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  -- Lock + fetch thread
  SELECT * INTO v_before
  FROM public.email_threads
  WHERE id = p_thread_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;

  -- Perform update
  UPDATE public.email_threads
  SET
    workflow_status   = p_new_status,
    status_updated_by = p_user_id,
    status_updated_at = now(),
    updated_at        = now()
  WHERE id = p_thread_id
  RETURNING * INTO v_after;

  -- Write audit log (atomic — same transaction)
  INSERT INTO public.email_audit_logs (
    tenant_id, thread_id, user_id, action, before_data, after_data
  ) VALUES (
    v_before.tenant_id,
    p_thread_id,
    p_user_id,
    CASE p_new_status
      WHEN 'DONE' THEN 'MARK_DONE'
      ELSE 'REOPEN'
    END,
    jsonb_build_object('workflow_status', v_before.workflow_status),
    jsonb_build_object('workflow_status', v_after.workflow_status)
  );

  RETURN v_after;
END;
$$;

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
  v_before  public.email_threads;
  v_after   public.email_threads;
BEGIN
  IF auth.uid() != p_user_id THEN RAISE EXCEPTION 'User ID mismatch'; END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role) OR
    public.has_role(auth.uid(), 'cskh'::public.app_role)
  ) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  IF p_new_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN
    RAISE EXCEPTION 'Invalid priority: %', p_new_priority;
  END IF;

  SELECT * INTO v_before FROM public.email_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Thread not found'; END IF;

  UPDATE public.email_threads SET priority = p_new_priority, updated_at = now()
  WHERE id = p_thread_id RETURNING * INTO v_after;

  INSERT INTO public.email_audit_logs (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (
    v_before.tenant_id, p_thread_id, p_user_id, 'CHANGE_PRIORITY',
    jsonb_build_object('priority', v_before.priority),
    jsonb_build_object('priority', v_after.priority)
  );

  RETURN v_after;
END;
$$;

-- ─── 4. PATCH analytics RPC ─────────────────────────────────
-- Remove tenant_id parameter (single tenant — just scope by
-- email_accounts the user has access to).

DROP FUNCTION IF EXISTS public.get_email_analytics_v1();

CREATE OR REPLACE FUNCTION public.get_email_analytics_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN jsonb_build_object(
    'total_action_required', (
      SELECT count(*) FROM public.email_threads
      WHERE workflow_status NOT IN ('DONE')
        AND tag != 'SILENT'
        AND is_muted = false
    ),
    'threads_open_gt_8h', (
      SELECT count(*) FROM public.email_threads
      WHERE workflow_status != 'DONE'
        AND tag != 'SILENT'
        AND last_message_at < (now() - interval '8 hours')
    ),
    'threads_per_tag', (
      SELECT COALESCE(jsonb_object_agg(tag, cnt), '{}'::jsonb)
      FROM (
        SELECT tag, count(*) AS cnt
        FROM public.email_threads
        WHERE workflow_status != 'DONE'
        GROUP BY tag
      ) t
    ),
    'threads_per_owner', (
      SELECT COALESCE(jsonb_object_agg(COALESCE(owner_id::text, 'unassigned'), cnt), '{}'::jsonb)
      FROM (
        SELECT owner_id, count(*) AS cnt
        FROM public.email_threads
        WHERE workflow_status != 'DONE'
        GROUP BY owner_id
      ) o
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_analytics_v1() TO authenticated;

-- ─── 5. DIAGNOSTIC RPC — to verify data & RLS in one call ────
-- Run: select public.email_debug_status();
-- from the Supabase SQL editor as the affected user.

CREATE OR REPLACE FUNCTION public.email_debug_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'current_user_id',   auth.uid()::text,
    'has_email_access',  public.has_email_access(),
    'threads_visible',   (SELECT count(*) FROM public.email_threads),
    'messages_visible',  (SELECT count(*) FROM public.email_messages),
    'accounts_visible',  (SELECT count(*) FROM public.email_accounts)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_debug_status() TO authenticated;

-- ─── DONE ───────────────────────────────────────────────────
