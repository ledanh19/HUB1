
-- ============================================================
-- EMAIL V2 — SYNC STATE + BACKFILL INFRASTRUCTURE
-- ============================================================

-- ─── 1. email_sync_state — checkpoint/resume for backfill ───
CREATE TABLE IF NOT EXISTS public.email_sync_state (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  account_id        uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  last_history_id   text,
  last_synced_at    timestamptz,
  backfill_cursor   text,
  backfill_start_date date,
  backfill_done     boolean NOT NULL DEFAULT false,
  total_threads_synced integer NOT NULL DEFAULT 0,
  total_messages_synced integer NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id)
);

ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_sync_state_select ON public.email_sync_state
  FOR SELECT USING (public.has_email_access());

-- Only service_role writes
GRANT SELECT ON public.email_sync_state TO authenticated;
GRANT ALL ON public.email_sync_state TO service_role;

-- ─── 2. Auto-update trigger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_sync_state_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_sync_state_updated ON public.email_sync_state;
CREATE TRIGGER trg_email_sync_state_updated
  BEFORE UPDATE ON public.email_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.email_sync_state_updated_at();
