
-- ─── STEP 7: Re-point email_thread_workflow FK ──────────────
DO $$
DECLARE
  _has_fk boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'email_thread_workflow'
    AND constraint_type = 'FOREIGN KEY'
  ) INTO _has_fk;

  IF _has_fk THEN
    ALTER TABLE public.email_thread_workflow
      ADD COLUMN IF NOT EXISTS v2_thread_id uuid;

    UPDATE public.email_thread_workflow w
    SET v2_thread_id = t2.id
    FROM public.email_threads_mirror t1
    JOIN public.email_threads t2
      ON t2.email_account_id = t1.email_account_id
      AND t2.provider_thread_id = t1.provider_thread_id
    WHERE w.thread_id = t1.id;

    ALTER TABLE public.email_thread_workflow
      DROP CONSTRAINT IF EXISTS email_thread_workflow_thread_id_fkey;

    UPDATE public.email_thread_workflow
    SET thread_id = v2_thread_id
    WHERE v2_thread_id IS NOT NULL;

    ALTER TABLE public.email_thread_workflow
      DROP COLUMN IF EXISTS v2_thread_id;

    ALTER TABLE public.email_thread_workflow
      ADD CONSTRAINT email_thread_workflow_thread_id_fkey
      FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─── STEP 8: Re-point email_thread_notes FK ─────────────────
DO $$
BEGIN
  ALTER TABLE public.email_thread_notes
    ADD COLUMN IF NOT EXISTS v2_thread_id uuid;

  UPDATE public.email_thread_notes n
  SET v2_thread_id = t2.id
  FROM public.email_threads_mirror t1
  JOIN public.email_threads t2
    ON t2.email_account_id = t1.email_account_id
    AND t2.provider_thread_id = t1.provider_thread_id
  WHERE n.thread_id = t1.id;

  ALTER TABLE public.email_thread_notes
    DROP CONSTRAINT IF EXISTS email_thread_notes_thread_id_fkey;

  UPDATE public.email_thread_notes
  SET thread_id = v2_thread_id
  WHERE v2_thread_id IS NOT NULL;

  ALTER TABLE public.email_thread_notes
    DROP COLUMN IF EXISTS v2_thread_id;

  ALTER TABLE public.email_thread_notes
    ADD CONSTRAINT email_thread_notes_thread_id_fkey
    FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;
END $$;

-- ─── STEP 9: Drop overlay views ─────────────────────────────
DROP VIEW IF EXISTS public.email_messages_operational_v;
DROP VIEW IF EXISTS public.email_threads_operational_v;

-- ─── STEP 10: Drop V1 mirror tables ─────────────────────────
DROP TABLE IF EXISTS public.email_messages_mirror CASCADE;
DROP TABLE IF EXISTS public.email_threads_mirror CASCADE;

-- ─── STEP 11: Add missing indexes on V2 ─────────────────────
CREATE INDEX IF NOT EXISTS idx_email_messages_v2_sent_at
  ON public.email_messages (thread_id, sent_at ASC);

CREATE INDEX IF NOT EXISTS idx_email_threads_v2_account_last_msg
  ON public.email_threads (email_account_id, last_message_at DESC);

-- ─── STEP 12: Grants for new columns ────────────────────────
GRANT SELECT ON public.email_threads TO authenticated;
GRANT SELECT ON public.email_messages TO authenticated;
