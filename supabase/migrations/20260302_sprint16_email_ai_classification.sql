-- ============================================================
-- EMAIL AI CLASSIFICATION — Sprint 16
-- Created: 2026-03-02
-- NON-BREAKING + ADDITIVE ONLY
--
-- Architecture: Rules-first → Heuristics → AI fallback → Human override
-- Thread-first scoring, multi-tenant safe, RBAC-safe, idempotent
-- ============================================================

-- ─── 1. EXTEND email_threads TAG CONSTRAINT (ADDITIVE) ──────
-- Add new AI classification tags alongside existing ones.
-- Old tags remain valid → NON-BREAKING.

DO $$
BEGIN
  -- Drop existing tag CHECK constraint
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
    -- Original V2 tags (backward compatible)
    'GUEST_REPLY', 'DISPUTE', 'FINANCE_ALERT', 'BOOKING_EXCEPTION',
    'VIP_PARTNER', 'SILENT', 'OTHER',
    -- New AI classification taxonomy
    'BOOKING_SYSTEM', 'GUEST_MESSAGE', 'DISPUTE_REFUND',
    'FINANCE_PAYOUT', 'ADS_SPAM', 'INTERNAL_OTHER'
  ));


-- ─── 2. EXTEND tag_source CONSTRAINT (ADDITIVE) ─────────────
-- Add AI source variants for traceability.

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
    -- New: AI classification sources
    'AI_RULES', 'AI_HEURISTIC', 'AI_MODEL'
  ));


-- ─── 3. ADD manual_override COLUMN TO email_threads ─────────
-- When true, AI auto-apply is blocked. Only human can change tag.

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;


-- ─── 4. EXTEND AUDIT LOGS ACTION CONSTRAINT ─────────────────
-- Add AI-specific audit actions.

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
    -- Original actions
    'MARK_DONE', 'REOPEN', 'ASSIGN', 'UNASSIGN',
    'CHANGE_PRIORITY', 'CHANGE_TAG',
    'SEND_REPLY', 'SEND_FORWARD',
    -- New AI actions
    'AI_SUGGESTED', 'AI_APPLIED_TAG', 'AI_IGNORED', 'AI_RERUN'
  ));

-- Allow NULL user_id for AI-generated audit entries
ALTER TABLE public.email_audit_logs
  ALTER COLUMN user_id DROP NOT NULL;


-- ─── 5. CREATE email_thread_ai_suggestions TABLE ────────────
-- Stores AI classification suggestions per thread+message pair.
-- Caches scoring results → idempotent by unique key.

CREATE TABLE IF NOT EXISTS public.email_thread_ai_suggestions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL,
  thread_id                 uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  last_message_id           uuid,  -- NULL for initial scoring (no messages yet)

  -- Suggestion payload
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

  -- Classification source
  model                      text NOT NULL DEFAULT 'rules_v1',  -- 'rules_v1', 'heuristics_v1', 'gemini-2.0-flash', etc.
  prompt_version             text DEFAULT 'v1',

  -- Lifecycle
  scored_at                  timestamptz NOT NULL DEFAULT now(),
  apply_status               text NOT NULL DEFAULT 'SUGGESTED' CHECK (apply_status IN (
    'SUGGESTED', 'APPLIED', 'IGNORED'
  )),
  applied_at                 timestamptz,
  applied_by                 uuid,

  -- Timestamps
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Unique: one suggestion per thread + message pair (idempotent cache key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_suggestions_thread_msg
  ON public.email_thread_ai_suggestions (tenant_id, thread_id, COALESCE(last_message_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_thread
  ON public.email_thread_ai_suggestions (thread_id, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_tenant_status
  ON public.email_thread_ai_suggestions (tenant_id, apply_status, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_needs_review
  ON public.email_thread_ai_suggestions (tenant_id, apply_status, confidence)
  WHERE apply_status = 'SUGGESTED' AND confidence < 0.85;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION public.ai_suggestion_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
-- Tenant isolation via has_email_access() (existing RBAC function)

ALTER TABLE public.email_thread_ai_suggestions ENABLE ROW LEVEL SECURITY;

-- Read: authenticated users with email access
CREATE POLICY ai_suggestions_rbac_select ON public.email_thread_ai_suggestions
  FOR SELECT USING (public.has_email_access());

-- Insert/Update: service_role only (AI pipeline runs server-side)
-- Authenticated users can update apply_status (apply/ignore)
CREATE POLICY ai_suggestions_rbac_update ON public.email_thread_ai_suggestions
  FOR UPDATE USING (public.has_email_access())
  WITH CHECK (public.has_email_access());

-- Grants
GRANT SELECT, UPDATE ON public.email_thread_ai_suggestions TO authenticated;
GRANT ALL ON public.email_thread_ai_suggestions TO service_role;


-- ─── 7. RPC: email_score_thread ─────────────────────────────
-- Client-side scoring: runs rules + heuristics on thread metadata.
-- AI fallback is handled client-side (Edge Function call).
-- This RPC only STORES the suggestion result.

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
  -- RBAC check
  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Upsert: idempotent by (tenant_id, thread_id, last_message_id)
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
    -- Only reset apply_status if suggestion actually changed
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


-- ─── 8. RPC: email_apply_suggestion ─────────────────────────
-- Applies an AI suggestion to the thread. Guards against manual override.

CREATE OR REPLACE FUNCTION public.email_apply_ai_suggestion(
  p_thread_id   uuid,
  p_user_id     uuid DEFAULT NULL,  -- NULL = auto-apply
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
  -- RBAC check
  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 1. Lock thread row
  SELECT * INTO v_thread
  FROM public.email_threads
  WHERE id = p_thread_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found: %', p_thread_id;
  END IF;

  -- 2. Guard: manual override blocks auto-apply
  IF v_thread.manual_override = true AND p_force = false THEN
    RAISE EXCEPTION 'Thread has manual override. Use force=true to override.';
  END IF;

  -- 3. Get latest suggestion for this thread
  SELECT * INTO v_sugg
  FROM public.email_thread_ai_suggestions
  WHERE thread_id = p_thread_id
  ORDER BY scored_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No AI suggestion found for thread: %', p_thread_id;
  END IF;

  -- 4. Check confidence threshold per tag
  v_threshold := CASE v_sugg.suggested_tag
    WHEN 'BOOKING_SYSTEM'   THEN 0.85
    WHEN 'GUEST_MESSAGE'    THEN 0.85
    WHEN 'FINANCE_PAYOUT'   THEN 0.90
    WHEN 'DISPUTE_REFUND'   THEN 0.92
    WHEN 'ADS_SPAM'         THEN 0.85
    WHEN 'INTERNAL_OTHER'   THEN 0.80
    -- Legacy tags
    WHEN 'GUEST_REPLY'      THEN 0.85
    WHEN 'DISPUTE'          THEN 0.92
    WHEN 'FINANCE_ALERT'    THEN 0.90
    WHEN 'BOOKING_EXCEPTION' THEN 0.85
    WHEN 'SILENT'           THEN 0.85
    ELSE 0.80
  END;

  -- If thread already has a tag (not OTHER/NULL) && confidence below threshold → reject
  IF v_thread.tag NOT IN ('OTHER') AND v_sugg.confidence < v_threshold AND p_force = false THEN
    RAISE EXCEPTION 'Confidence %.3f below threshold %.3f for tag %',
      v_sugg.confidence, v_threshold, v_sugg.suggested_tag;
  END IF;

  -- 5. Determine tag_source based on model
  v_tag_source := CASE
    WHEN v_sugg.model LIKE 'rules%' THEN 'AI_RULES'
    WHEN v_sugg.model LIKE 'heuristics%' THEN 'AI_HEURISTIC'
    ELSE 'AI_MODEL'
  END;

  -- 6. Snapshot before
  v_before := jsonb_build_object(
    'tag', v_thread.tag,
    'tag_source', v_thread.tag_source,
    'workflow_status', v_thread.workflow_status,
    'priority', v_thread.priority
  );

  -- 7. Apply suggestion to thread
  UPDATE public.email_threads SET
    tag = v_sugg.suggested_tag,
    tag_source = v_tag_source,
    workflow_status = COALESCE(v_sugg.suggested_workflow_status, workflow_status),
    priority = COALESCE(v_sugg.suggested_priority, priority),
    updated_at = now()
  WHERE id = p_thread_id
  RETURNING * INTO v_thread;

  -- 8. Snapshot after
  v_after := jsonb_build_object(
    'tag', v_thread.tag,
    'tag_source', v_thread.tag_source,
    'workflow_status', v_thread.workflow_status,
    'priority', v_thread.priority
  );

  -- 9. Mark suggestion as APPLIED
  UPDATE public.email_thread_ai_suggestions SET
    apply_status = 'APPLIED',
    applied_at = now(),
    applied_by = p_user_id
  WHERE id = v_sugg.id;

  -- 10. Audit log
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
-- User explicitly ignores a suggestion.

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
  -- RBAC check
  IF NOT public.has_email_access() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get latest suggestion
  SELECT * INTO v_sugg
  FROM public.email_thread_ai_suggestions
  WHERE thread_id = p_thread_id
    AND apply_status = 'SUGGESTED'
  ORDER BY scored_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;  -- Idempotent: nothing to ignore
  END IF;

  -- Mark as ignored
  UPDATE public.email_thread_ai_suggestions SET
    apply_status = 'IGNORED',
    applied_at = now(),
    applied_by = p_user_id
  WHERE id = v_sugg.id;

  -- Get thread for audit
  SELECT * INTO v_thread
  FROM public.email_threads
  WHERE id = p_thread_id;

  -- Audit log
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


-- ─── 10. UPDATE OVERLAY VIEW ────────────────────────────────
-- Add AI suggestion fields to the operational view so UI can read them.

CREATE OR REPLACE VIEW public.email_threads_operational_v AS
SELECT
  -- Identity
  t1.id,
  t1.tenant_id,
  t1.email_account_id,
  t1.provider_thread_id,

  -- Display content from V1 mirror
  t1.subject,
  t1.snippet,
  t1.participants,
  t1.last_message_at,
  t1.unread_count,
  t1.labels,

  -- Operational state from V2
  COALESCE(t2.workflow_status, 'OPEN')     AS workflow_status,
  COALESCE(t2.priority, 'MEDIUM')          AS priority,
  COALESCE(t2.tag, 'OTHER')               AS tag,
  COALESCE(t2.tag_source, 'SYSTEM')       AS tag_source,
  COALESCE(t2.owner_id, NULL)             AS owner_id,
  COALESCE(t2.is_muted, false)            AS is_muted,
  COALESCE(t2.manual_override, false)     AS manual_override,
  t2.status_updated_by,
  t2.status_updated_at,
  t2.primary_participant AS v2_primary_participant,

  -- AI suggestion (latest per thread)
  ai.suggested_tag        AS ai_suggested_tag,
  ai.confidence           AS ai_confidence,
  ai.apply_status         AS ai_apply_status,
  ai.reasons              AS ai_reasons,
  ai.model                AS ai_model,
  ai.scored_at            AS ai_scored_at,

  -- Timestamps
  t1.created_at,
  GREATEST(t1.updated_at, t2.updated_at)  AS updated_at,

  -- V2 thread id for RPC calls
  t2.id AS v2_thread_id
FROM public.email_threads_mirror t1
LEFT JOIN public.email_threads t2
  ON t2.email_account_id = t1.email_account_id
  AND t2.provider_thread_id = t1.provider_thread_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.email_thread_ai_suggestions s
  WHERE s.thread_id = t2.id
  ORDER BY s.scored_at DESC
  LIMIT 1
) ai ON true;

-- Re-grant
GRANT SELECT ON public.email_threads_operational_v TO authenticated;
GRANT SELECT ON public.email_threads_operational_v TO service_role;


-- ─── DONE ───────────────────────────────────────────────────
