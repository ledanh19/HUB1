
-- ============================================================
-- EMAIL V2 – Overlay Views + Assignment RPC (ADDITIVE ONLY)
-- ============================================================

-- ─── 1. email_threads_operational_v ─────────────────────────
CREATE OR REPLACE VIEW public.email_threads_operational_v AS
SELECT
  t1.id,
  t1.tenant_id,
  t1.email_account_id,
  t1.provider_thread_id,
  t1.subject,
  t1.snippet,
  t1.participants,
  t1.last_message_at,
  t1.unread_count,
  t1.labels,
  COALESCE(t2.workflow_status, 'OPEN')     AS workflow_status,
  COALESCE(t2.priority, 'MEDIUM')          AS priority,
  COALESCE(t2.tag, 'OTHER')               AS tag,
  COALESCE(t2.tag_source, 'SYSTEM')       AS tag_source,
  COALESCE(t2.owner_id, NULL)             AS owner_id,
  COALESCE(t2.is_muted, false)            AS is_muted,
  t2.status_updated_by,
  t2.status_updated_at,
  t2.primary_participant AS v2_primary_participant,
  t1.created_at,
  GREATEST(t1.updated_at, t2.updated_at)  AS updated_at,
  t2.id AS v2_thread_id
FROM public.email_threads_mirror t1
LEFT JOIN public.email_threads t2
  ON t2.email_account_id = t1.email_account_id
  AND t2.provider_thread_id = t1.provider_thread_id;

GRANT SELECT ON public.email_threads_operational_v TO authenticated;
GRANT SELECT ON public.email_threads_operational_v TO service_role;

-- ─── 2. email_messages_operational_v ────────────────────────
CREATE OR REPLACE VIEW public.email_messages_operational_v AS
SELECT
  m1.id,
  m1.tenant_id,
  m1.email_account_id,
  m1.thread_id,
  m1.provider_message_id,
  COALESCE(m2.direction, m1.direction) AS direction,
  m1.from_json,
  m1.to_json,
  m1.cc_json,
  m1.bcc_json,
  COALESCE(m2.body_text, m1.body_plain)          AS body_text,
  COALESCE(m2.body_html, m1.body_html_sanitized) AS body_html,
  m1.body_plain,
  m1.body_html_sanitized,
  COALESCE(m2.sent_at, m1.date) AS sent_at,
  m1.date,
  m2.gmail_internal_date,
  COALESCE(m2.sender, NULL) AS sender_email,
  COALESCE(m2.message_id, m1.headers->>'Message-ID') AS message_id,
  COALESCE(m2.in_reply_to, m1.headers->>'In-Reply-To') AS in_reply_to,
  m1.has_attachments,
  m1.headers,
  m1.subject,
  m1.created_at,
  GREATEST(m1.updated_at, m2.created_at) AS updated_at
FROM public.email_messages_mirror m1
LEFT JOIN public.email_messages m2
  ON m2.email_account_id = m1.email_account_id
  AND m2.provider_message_id = m1.provider_message_id;

GRANT SELECT ON public.email_messages_operational_v TO authenticated;
GRANT SELECT ON public.email_messages_operational_v TO service_role;

-- ─── 3. email_assign_thread RPC ─────────────────────────────

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
    'MARK_DONE', 'REOPEN', 'ASSIGN', 'UNASSIGN',
    'CHANGE_PRIORITY', 'CHANGE_TAG',
    'SEND_REPLY', 'SEND_FORWARD'
  ));

CREATE OR REPLACE FUNCTION public.email_assign_thread(
  p_thread_id  uuid,
  p_owner_id   uuid,
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
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'User ID mismatch';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cskh'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden: insufficient role';
  END IF;

  SELECT * INTO v_before
  FROM email_threads
  WHERE id = p_thread_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;

  IF (v_before.owner_id IS NOT DISTINCT FROM p_owner_id) THEN
    RETURN v_before;
  END IF;

  UPDATE email_threads
  SET owner_id = p_owner_id, updated_at = now()
  WHERE id = p_thread_id
  RETURNING * INTO v_after;

  INSERT INTO email_audit_logs
    (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (
    v_before.tenant_id,
    p_thread_id,
    p_user_id,
    CASE WHEN p_owner_id IS NULL THEN 'UNASSIGN' ELSE 'ASSIGN' END,
    jsonb_build_object('owner_id', v_before.owner_id),
    jsonb_build_object('owner_id', v_after.owner_id)
  );

  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_assign_thread(uuid, uuid, uuid) TO authenticated;
