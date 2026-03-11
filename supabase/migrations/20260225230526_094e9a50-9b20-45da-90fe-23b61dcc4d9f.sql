
-- Add missing columns to webhook_events for the always-200 queue pattern
-- These are idempotent (IF NOT EXISTS via DO block for columns)

DO $$
BEGIN
  -- request_id: trace each webhook call
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_events' AND column_name='request_id') THEN
    ALTER TABLE public.webhook_events ADD COLUMN request_id text;
  END IF;

  -- received_at: when we received it
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_events' AND column_name='received_at') THEN
    ALTER TABLE public.webhook_events ADD COLUMN received_at timestamptz DEFAULT now();
  END IF;

  -- is_valid: secret check result
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_events' AND column_name='is_valid') THEN
    ALTER TABLE public.webhook_events ADD COLUMN is_valid boolean DEFAULT true;
  END IF;

  -- reject_reason
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_events' AND column_name='reject_reason') THEN
    ALTER TABLE public.webhook_events ADD COLUMN reject_reason text;
  END IF;

  -- headers: subset of request headers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_events' AND column_name='headers') THEN
    ALTER TABLE public.webhook_events ADD COLUMN headers jsonb;
  END IF;

  -- ip: client IP
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_events' AND column_name='ip') THEN
    ALTER TABLE public.webhook_events ADD COLUMN ip text;
  END IF;

  -- user_agent
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_events' AND column_name='user_agent') THEN
    ALTER TABLE public.webhook_events ADD COLUMN user_agent text;
  END IF;

  -- kind: sub-type e.g. 'messages', 'booking'
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='webhook_events' AND column_name='kind') THEN
    ALTER TABLE public.webhook_events ADD COLUMN kind text;
  END IF;

  -- Make dedupe_key nullable (queue pattern doesn't always have one)
  ALTER TABLE public.webhook_events ALTER COLUMN dedupe_key DROP NOT NULL;
END $$;

-- Index for queue processing by status + kind
CREATE INDEX IF NOT EXISTS idx_webhook_events_kind_status ON public.webhook_events(kind, status, created_at);

-- Index for request_id lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_request_id ON public.webhook_events(request_id);
