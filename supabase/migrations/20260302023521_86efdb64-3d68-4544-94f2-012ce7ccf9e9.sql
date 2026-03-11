
-- ============================================================
-- EMAIL UNIFICATION: V2 absorbs V1 (SINGLE SOURCE OF TRUTH)
-- Created: 2026-03-02
-- ============================================================

-- ─── STEP 1: Add V1 content columns to V2 email_threads ─────
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS snippet       text,
  ADD COLUMN IF NOT EXISTS participants  jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS unread_count  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labels        jsonb DEFAULT '[]'::jsonb;

-- ─── STEP 2: Add V1 content columns to V2 email_messages ────
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS from_json            jsonb,
  ADD COLUMN IF NOT EXISTS to_json              jsonb,
  ADD COLUMN IF NOT EXISTS cc_json              jsonb,
  ADD COLUMN IF NOT EXISTS bcc_json             jsonb,
  ADD COLUMN IF NOT EXISTS subject              text,
  ADD COLUMN IF NOT EXISTS headers              jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS has_attachments      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachments_json     jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz DEFAULT now();

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS sent_at              timestamptz;

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS status               text DEFAULT 'RECEIVED';

-- ─── STEP 3: Backfill V2 threads from V1 mirror ─────────────
UPDATE public.email_threads t2
SET
  snippet     = COALESCE(t2.snippet, t1.snippet),
  participants = COALESCE(t2.participants, t1.participants, '[]'::jsonb),
  unread_count = COALESCE(t1.unread_count, t2.unread_count, 0),
  labels       = COALESCE(t2.labels, t1.labels, '[]'::jsonb)
FROM public.email_threads_mirror t1
WHERE t2.email_account_id = t1.email_account_id
  AND t2.provider_thread_id = t1.provider_thread_id;

-- ─── STEP 4: Insert V1-only threads not yet in V2 ───────────
INSERT INTO public.email_threads (
  tenant_id, email_account_id, provider_thread_id,
  subject, snippet, participants, last_message_at,
  unread_count, labels, created_at, updated_at
)
SELECT
  t1.tenant_id, t1.email_account_id, t1.provider_thread_id,
  t1.subject, t1.snippet, t1.participants, t1.last_message_at,
  t1.unread_count, t1.labels, t1.created_at, t1.updated_at
FROM public.email_threads_mirror t1
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_threads t2
  WHERE t2.email_account_id = t1.email_account_id
    AND t2.provider_thread_id = t1.provider_thread_id
);

-- ─── STEP 5: Backfill V2 messages from V1 mirror ────────────
UPDATE public.email_messages m2
SET
  from_json       = COALESCE(m2.from_json, m1.from_json),
  to_json         = COALESCE(m2.to_json, m1.to_json),
  cc_json         = COALESCE(m2.cc_json, m1.cc_json),
  bcc_json        = COALESCE(m2.bcc_json, m1.bcc_json),
  subject         = COALESCE(m2.subject, m1.subject),
  headers         = COALESCE(m2.headers, m1.headers, '{}'::jsonb),
  body_text       = COALESCE(m2.body_text, m1.body_plain),
  body_html       = COALESCE(m2.body_html, m1.body_html_sanitized),
  sent_at         = COALESCE(m2.sent_at, m1.date),
  has_attachments = COALESCE(m1.has_attachments, m2.has_attachments, false),
  attachments_json = COALESCE(m1.attachments_json, m2.attachments_json, '[]'::jsonb)
FROM public.email_messages_mirror m1
WHERE m2.email_account_id = m1.email_account_id
  AND m2.provider_message_id = m1.provider_message_id;

-- ─── STEP 6: Insert V1-only messages not yet in V2 ──────────
INSERT INTO public.email_messages (
  tenant_id, email_account_id, thread_id,
  provider_message_id, direction,
  from_json, to_json, cc_json, bcc_json,
  subject, headers, body_text, body_html,
  has_attachments, attachments_json,
  sent_at, sender, recipients, created_at
)
SELECT
  m1.tenant_id, m1.email_account_id,
  t2.id AS thread_id,
  m1.provider_message_id, m1.direction,
  m1.from_json, m1.to_json, m1.cc_json, m1.bcc_json,
  m1.subject, m1.headers, m1.body_plain, m1.body_html_sanitized,
  COALESCE(m1.has_attachments, false),
  COALESCE(m1.attachments_json, '[]'::jsonb),
  m1.date,
  CASE
    WHEN jsonb_typeof(m1.from_json) = 'array' AND jsonb_array_length(m1.from_json) > 0
    THEN COALESCE(m1.from_json->0->>'name', m1.from_json->0->>'email')
    WHEN jsonb_typeof(m1.from_json) = 'object'
    THEN COALESCE(m1.from_json->>'name', m1.from_json->>'email')
    ELSE NULL
  END,
  COALESCE(m1.to_json, '[]'::jsonb),
  m1.created_at
FROM public.email_messages_mirror m1
JOIN public.email_threads_mirror t1 ON t1.id = m1.thread_id
JOIN public.email_threads t2
  ON t2.email_account_id = t1.email_account_id
  AND t2.provider_thread_id = t1.provider_thread_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_messages m2
  WHERE m2.email_account_id = m1.email_account_id
    AND m2.provider_message_id = m1.provider_message_id
);
