
-- ============================================================
-- EMAIL AI CLASSIFICATION — Sprint 16
-- NON-BREAKING + ADDITIVE ONLY
-- ============================================================

-- ─── 1. EXTEND email_threads TAG CONSTRAINT (ADDITIVE) ──────
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
    WHERE conrelid = 'public.email_threads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%tag%'
      AND pg_get_constraintdef(oid) NOT LIKE '%tag_source%';
  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.email_threads DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'public.email_threads'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%tag%'
        AND pg_get_constraintdef(oid) NOT LIKE '%tag_source%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.email_threads
  ADD CONSTRAINT email_threads_tag_check_v2
  CHECK (tag IN (
    'GUEST_REPLY', 'DISPUTE', 'FINANCE_ALERT', 'BOOKING_EXCEPTION',
    'VIP_PARTNER', 'SILENT', 'OTHER',
    'BOOKING_SYSTEM', 'GUEST_MESSAGE', 'DISPUTE_REFUND',
    'FINANCE_PAYOUT', 'ADS_SPAM', 'INTERNAL_OTHER'
  ));

-- ─── 2. EXTEND tag_source CONSTRAINT (ADDITIVE) ─────────────
DO $$
BEGIN
  PERFORM 1 FROM pg_constraint
    WHERE conrelid = 'public.email_threads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%tag_source%';
  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.email_threads DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'public.email_threads'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%tag_source%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.email_threads
  ADD CONSTRAINT email_threads_tag_source_check_v2
  CHECK (tag_source IN (
    'SYSTEM', 'MANUAL',
    'AI_RULES', 'AI_HEURISTIC', 'AI_MODEL'
  ));

-- ─── 3. ADD manual_override COLUMN ─────────────────────────
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;

-- ─── 4. EXTEND AUDIT LOGS ACTION CONSTRAINT ─────────────────
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
  ADD CONSTRAINT email_audit_logs_action_check_v2
  CHECK (action IN (
    'MARK_DONE', 'REOPEN', 'ASSIGN', 'UNASSIGN',
    'CHANGE_PRIORITY', 'CHANGE_TAG',
    'SEND_REPLY', 'SEND_FORWARD',
    'AI_SUGGESTED', 'AI_APPLIED_TAG', 'AI_IGNORED', 'AI_RERUN'
  ));

ALTER TABLE public.email_audit_logs
  ALTER COLUMN user_id DROP NOT NULL;

-- ─── 5. CREATE email_thread_ai_suggestions TABLE ────────────
CREATE TABLE IF NOT EXISTS public.email_thread_ai_suggestions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL,
  thread_id                 uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  last_message_id           uuid,
  suggested_tag             text NOT NULL CHECK (suggested_tag IN (
    'GUEST_REPLY', 'DISPUTE', 'FINANCE_ALERT', 'BOOKING_EXCEPTION',
    'VIP_PARTNER', 'SILENT', 'OTHER',
    'BOOKING_SYSTEM', 'GUEST_MESSAGE', 'DISPUTE_REFUND',
    'FINANCE_PAYOUT', 'ADS_SPAM', 'INTERNAL_OTHER'
  )),
  suggested_workflow_status  text CHECK (suggested_workflow_status IN (
    'OPEN', 'ACTION_REQUIRED', 'WAITING_GUEST', 'INTERNAL_PENDING', 'DONE'
  )),
  suggested_priority         text CHECK (suggested_priority IN (
    'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  )),
  confidence                 numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasons                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  model                      text NOT NULL DEFAULT 'rules_v1',
  prompt_version             text DEFAULT 'v1',
  scored_at                  timestamptz NOT NULL DEFAULT now(),
  apply_status               text NOT NULL DEFAULT 'SUGGESTED' CHECK (apply_status IN (
    'SUGGESTED', 'APPLIED', 'IGNORED'
  )),
  applied_at                 timestamptz,
  applied_by                 uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_suggestions_thread_msg
  ON public.email_thread_ai_suggestions (tenant_id, thread_id, COALESCE(last_message_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_thread
  ON public.email_thread_ai_suggestions (thread_id, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_tenant_status
  ON public.email_thread_ai_suggestions (tenant_id, apply_status, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_needs_review
  ON public.email_thread_ai_suggestions (tenant_id, apply_status, confidence)
  WHERE apply_status = 'SUGGESTED' AND confidence < 0.85;

CREATE OR REPLACE FUNCTION public.ai_suggestion_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_suggestion_updated ON public.email_thread_ai_suggestions;
CREATE TRIGGER trg_ai_suggestion_updated
  BEFORE UPDATE ON public.email_thread_ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.ai_suggestion_set_updated_at();

-- ─── 6. RLS POLICIES ────────────────────────────────────────
ALTER TABLE public.email_thread_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_suggestions_rbac_select ON public.email_thread_ai_suggestions
  FOR SELECT USING (public.has_email_access());

CREATE POLICY ai_suggestions_rbac_update ON public.email_thread_ai_suggestions
  FOR UPDATE USING (public.has_email_access())
  WITH CHECK (public.has_email_access());

GRANT SELECT, UPDATE ON public.email_thread_ai_suggestions TO authenticated;
GRANT ALL ON public.email_thread_ai_suggestions TO service_role;

-- ─── 7. RPC: email_upsert_ai_suggestion ─────────────────────
CREATE OR REPLACE FUNCTION public.email_upsert_ai_suggestion(
  p_thread_id                uuid,
  p_tenant_id                uuid,
  p_last_message_id          uuid DEFAULT NULL,
  p_suggested_tag            text DEFAULT 'OTHER',
  p_suggested_workflow_status text DEFAULT 'OPEN',
  p_suggested_priority       text DEFAULT 'MEDIUM',
  p_confidence               numeric DEFAULT 0.0,
  p_reasons                  jsonb DEFAULT '[]'::jsonb,
  p_model                    text DEFAULT 'rules_v1',
  p_prompt_version           text DEFAULT 'v1'
)
RETURNS public.email_thread_ai_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result public.email_thread_ai_suggestions;
  v_null_uuid uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.email_thread_ai_suggestions (
    tenant_id, thread_id, last_message_id,
    suggested_tag, suggested_workflow_status, suggested_priority,
    confidence, reasons, model, prompt_version,
    scored_at, apply_status
  ) VALUES (
    p_tenant_id, p_thread_id, p_last_message_id,
    p_suggested_tag, p_suggested_workflow_status, p_suggested_priority,
    p_confidence, p_reasons, p_model, p_prompt_version,
    now(), 'SUGGESTED'
  )
  ON CONFLICT (tenant_id, thread_id, COALESCE(last_message_id, v_null_uuid))
  DO UPDATE SET
    suggested_tag = EXCLUDED.suggested_tag,
    suggested_workflow_status = EXCLUDED.suggested_workflow_status,
    suggested_priority = EXCLUDED.suggested_priority,
    confidence = EXCLUDED.confidence,
    reasons = EXCLUDED.reasons,
    model = EXCLUDED.model,
    prompt_version = EXCLUDED.prompt_version,
    scored_at = now(),
    apply_status = CASE
      WHEN email_thread_ai_suggestions.suggested_tag != EXCLUDED.suggested_tag
        THEN 'SUGGESTED'
      ELSE email_thread_ai_suggestions.apply_status
    END
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_upsert_ai_suggestion(uuid, uuid, uuid, text, text, text, numeric, jsonb, text, text) TO authenticated;

-- ─── 8. RPC: email_apply_ai_suggestion ─────────────────────
CREATE OR REPLACE FUNCTION public.email_apply_ai_suggestion(
  p_thread_id   uuid,
  p_user_id     uuid DEFAULT NULL,
  p_force       boolean DEFAULT false
)
RETURNS public.email_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread   public.email_threads;
  v_sugg     public.email_thread_ai_suggestions;
  v_before   jsonb;
  v_after    jsonb;
  v_threshold numeric;
  v_tag_source text;
BEGIN
  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_thread
  FROM public.email_threads
  WHERE id = p_thread_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found: %', p_thread_id;
  END IF;

  IF v_thread.manual_override = true AND p_force = false THEN
    RAISE EXCEPTION 'Thread has manual override. Use force=true to override.';
  END IF;

  SELECT * INTO v_sugg
  FROM public.email_thread_ai_suggestions
  WHERE thread_id = p_thread_id
  ORDER BY scored_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No AI suggestion found for thread: %', p_thread_id;
  END IF;

  v_threshold := CASE v_sugg.suggested_tag
    WHEN 'BOOKING_SYSTEM'   THEN 0.85
    WHEN 'GUEST_MESSAGE'    THEN 0.85
    WHEN 'FINANCE_PAYOUT'   THEN 0.90
    WHEN 'DISPUTE_REFUND'   THEN 0.92
    WHEN 'ADS_SPAM'         THEN 0.85
    WHEN 'INTERNAL_OTHER'   THEN 0.80
    WHEN 'GUEST_REPLY'      THEN 0.85
    WHEN 'DISPUTE'          THEN 0.92
    WHEN 'FINANCE_ALERT'    THEN 0.90
    WHEN 'BOOKING_EXCEPTION' THEN 0.85
    WHEN 'SILENT'           THEN 0.85
    ELSE 0.80
  END;

  IF v_thread.tag NOT IN ('OTHER') AND v_sugg.confidence < v_threshold AND p_force = false THEN
    RAISE EXCEPTION 'Confidence %.3f below threshold %.3f for tag %',
      v_sugg.confidence, v_threshold, v_sugg.suggested_tag;
  END IF;

  v_tag_source := CASE
    WHEN v_sugg.model LIKE 'rules%' THEN 'AI_RULES'
    WHEN v_sugg.model LIKE 'heuristics%' THEN 'AI_HEURISTIC'
    ELSE 'AI_MODEL'
  END;

  v_before := jsonb_build_object(
    'tag', v_thread.tag,
    'tag_source', v_thread.tag_source,
    'workflow_status', v_thread.workflow_status,
    'priority', v_thread.priority
  );

  UPDATE public.email_threads SET
    tag = v_sugg.suggested_tag,
    tag_source = v_tag_source,
    workflow_status = COALESCE(v_sugg.suggested_workflow_status, workflow_status),
    priority = COALESCE(v_sugg.suggested_priority, priority),
    updated_at = now()
  WHERE id = p_thread_id
  RETURNING * INTO v_thread;

  v_after := jsonb_build_object(
    'tag', v_thread.tag,
    'tag_source', v_thread.tag_source,
    'workflow_status', v_thread.workflow_status,
    'priority', v_thread.priority
  );

  UPDATE public.email_thread_ai_suggestions SET
    apply_status = 'APPLIED',
    applied_at = now(),
    applied_by = p_user_id
  WHERE id = v_sugg.id;

  INSERT INTO public.email_audit_logs
    (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (
    v_thread.tenant_id,
    p_thread_id,
    p_user_id,
    'AI_APPLIED_TAG',
    v_before,
    v_after
  );

  RETURN v_thread;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_apply_ai_suggestion(uuid, uuid, boolean) TO authenticated;

-- ─── 9. RPC: email_ignore_ai_suggestion ─────────────────────
CREATE OR REPLACE FUNCTION public.email_ignore_ai_suggestion(
  p_thread_id uuid,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sugg public.email_thread_ai_suggestions;
  v_thread public.email_threads;
BEGIN
  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_sugg
  FROM public.email_thread_ai_suggestions
  WHERE thread_id = p_thread_id
    AND apply_status = 'SUGGESTED'
  ORDER BY scored_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.email_thread_ai_suggestions SET
    apply_status = 'IGNORED',
    applied_at = now(),
    applied_by = p_user_id
  WHERE id = v_sugg.id;

  SELECT * INTO v_thread
  FROM public.email_threads
  WHERE id = p_thread_id;

  INSERT INTO public.email_audit_logs
    (tenant_id, thread_id, user_id, action, before_data, after_data)
  VALUES (
    v_thread.tenant_id,
    p_thread_id,
    p_user_id,
    'AI_IGNORED',
    jsonb_build_object(
      'suggested_tag', v_sugg.suggested_tag,
      'confidence', v_sugg.confidence
    ),
    jsonb_build_object('apply_status', 'IGNORED')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_ignore_ai_suggestion(uuid, uuid) TO authenticated;
