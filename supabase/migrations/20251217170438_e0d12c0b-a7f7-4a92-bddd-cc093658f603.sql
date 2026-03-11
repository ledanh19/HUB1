-- PHASE 1: Create webhook_events table for deduplication and DLQ
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'channex',
  event_type text NOT NULL,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  processed_at timestamptz,
  error text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT webhook_events_dedupe_key_unique UNIQUE (provider, dedupe_key)
);

-- Index for processing queue
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON public.webhook_events(provider, event_type);

-- Enable RLS
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Policy for service role only
CREATE POLICY "Service role can manage webhook events" ON public.webhook_events
  FOR ALL USING (true);

-- PHASE 2: Enable Realtime on bookings_mirror and manual_bookings
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings_mirror;
ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_bookings;

-- Add replica identity for complete row data in realtime events
ALTER TABLE public.bookings_mirror REPLICA IDENTITY FULL;
ALTER TABLE public.manual_bookings REPLICA IDENTITY FULL;