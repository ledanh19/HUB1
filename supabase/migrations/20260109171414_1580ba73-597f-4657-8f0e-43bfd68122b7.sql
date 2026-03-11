-- ============================================================
-- CHANNEX SYNC PIPELINE - WEBHOOK HEALTH MONITORING
-- ============================================================
-- Date: 2026-01-09
-- Purpose: Add tables and functions for webhook health monitoring
-- ============================================================

-- ============================================================
-- STEP 1: Create webhook_health_checks table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'channex',
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  last_event_at TIMESTAMPTZ,
  events_in_window INTEGER DEFAULT 0,
  check_window_minutes INTEGER DEFAULT 60,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_health_provider_created 
ON public.webhook_health_checks(provider, created_at DESC);

-- ============================================================
-- STEP 2: Create webhook_retry_queue table for failed webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id UUID REFERENCES public.webhook_events(id),
  provider TEXT NOT NULL DEFAULT 'channex',
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ NOT NULL,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_retry_next 
ON public.webhook_retry_queue(status, next_retry_at)
WHERE status IN ('PENDING', 'PROCESSING');

-- ============================================================
-- STEP 3: Create sync_coverage_kpi table for tracking coverage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_coverage_kpi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'channex',
  kpi_date DATE NOT NULL,
  total_bookings_source INTEGER DEFAULT 0,
  total_bookings_mirror INTEGER DEFAULT 0,
  coverage_pct NUMERIC(5,2) DEFAULT 0,
  missing_booking_ids JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB,
  UNIQUE(provider, kpi_date)
);

-- ============================================================
-- STEP 4: Add QUARANTINE mapping_status comment
-- ============================================================
COMMENT ON COLUMN public.bookings_mirror.mapping_status IS 
  'Mapping status: MAPPED (property mapped), PENDING_MAPPING (awaiting mapping), QUARANTINE (needs manual review)';

-- ============================================================
-- STEP 5: Function to check webhook health
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_webhook_health(
  p_provider TEXT DEFAULT 'channex',
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_event_at TIMESTAMPTZ;
  v_events_count INTEGER;
  v_status TEXT;
  v_window_start TIMESTAMPTZ;
  v_details JSONB;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::INTERVAL;
  
  SELECT COUNT(*), MAX(created_at)
  INTO v_events_count, v_last_event_at
  FROM webhook_events
  WHERE provider = p_provider
  AND created_at >= v_window_start;
  
  IF v_events_count = 0 THEN
    v_status := 'CRITICAL';
  ELSIF v_events_count < 5 THEN
    v_status := 'WARNING';
  ELSE
    v_status := 'HEALTHY';
  END IF;
  
  v_details := jsonb_build_object(
    'window_start', v_window_start,
    'window_end', now(),
    'events_in_window', v_events_count,
    'last_event_at', v_last_event_at,
    'minutes_since_last_event', 
      CASE WHEN v_last_event_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (now() - v_last_event_at)) / 60 
        ELSE NULL 
      END
  );
  
  INSERT INTO webhook_health_checks (
    provider, check_type, status, last_event_at, events_in_window, check_window_minutes, details
  ) VALUES (
    p_provider, 'SCHEDULED', v_status, v_last_event_at, v_events_count, p_window_minutes, v_details
  );
  
  RETURN jsonb_build_object(
    'status', v_status,
    'provider', p_provider,
    'events_in_window', v_events_count,
    'last_event_at', v_last_event_at,
    'details', v_details
  );
END;
$$;

-- ============================================================
-- STEP 6: Function to queue webhook for retry
-- ============================================================
CREATE OR REPLACE FUNCTION public.queue_webhook_retry(
  p_webhook_event_id UUID,
  p_error TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_retry_id UUID;
  v_retry_count INTEGER;
BEGIN
  SELECT * INTO v_event FROM webhook_events WHERE id = p_webhook_event_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook event not found: %', p_webhook_event_id;
  END IF;
  
  SELECT retry_count INTO v_retry_count
  FROM webhook_retry_queue
  WHERE webhook_event_id = p_webhook_event_id AND status IN ('PENDING', 'PROCESSING');
  
  IF FOUND THEN
    UPDATE webhook_retry_queue
    SET 
      retry_count = retry_count + 1,
      last_error = p_error,
      next_retry_at = now() + (POWER(2, LEAST(retry_count + 1, 6)) || ' minutes')::INTERVAL,
      status = CASE WHEN retry_count >= max_retries THEN 'FAILED' ELSE 'PENDING' END,
      updated_at = now()
    WHERE webhook_event_id = p_webhook_event_id AND status IN ('PENDING', 'PROCESSING')
    RETURNING id INTO v_retry_id;
    RETURN v_retry_id;
  END IF;
  
  INSERT INTO webhook_retry_queue (
    webhook_event_id, provider, event_type, payload, next_retry_at, last_error
  ) VALUES (
    p_webhook_event_id, v_event.provider, v_event.event_type, v_event.payload, now() + '2 minutes'::INTERVAL, p_error
  )
  RETURNING id INTO v_retry_id;
  
  RETURN v_retry_id;
END;
$$;

-- ============================================================
-- STEP 7: Function to get pending retries
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pending_webhook_retries(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.webhook_retry_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE webhook_retry_queue
  SET status = 'PROCESSING', updated_at = now()
  WHERE id IN (
    SELECT id FROM webhook_retry_queue
    WHERE status = 'PENDING' AND next_retry_at <= now()
    ORDER BY next_retry_at LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ============================================================
-- STEP 8: RLS Policies
-- ============================================================
ALTER TABLE public.webhook_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_retry_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_coverage_kpi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_health_read" ON public.webhook_health_checks
  FOR SELECT USING (true);

CREATE POLICY "webhook_health_insert" ON public.webhook_health_checks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "webhook_retry_select" ON public.webhook_retry_queue
  FOR SELECT USING (true);

CREATE POLICY "webhook_retry_insert" ON public.webhook_retry_queue
  FOR INSERT WITH CHECK (true);

CREATE POLICY "webhook_retry_update" ON public.webhook_retry_queue
  FOR UPDATE USING (true);

CREATE POLICY "sync_coverage_read" ON public.sync_coverage_kpi
  FOR SELECT USING (true);

CREATE POLICY "sync_coverage_insert" ON public.sync_coverage_kpi
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- STEP 9: Comments
-- ============================================================
COMMENT ON TABLE public.webhook_health_checks IS 
  'Tracks webhook health status over time. Used to detect when webhooks stop arriving.';

COMMENT ON TABLE public.webhook_retry_queue IS 
  'Queue for retrying failed webhooks with exponential backoff.';

COMMENT ON TABLE public.sync_coverage_kpi IS 
  'Daily KPI tracking sync coverage between Channex and our DB.';

COMMENT ON FUNCTION public.check_webhook_health IS 
  'Check webhook health by counting events in a time window. Returns HEALTHY/WARNING/CRITICAL status.';

COMMENT ON FUNCTION public.queue_webhook_retry IS 
  'Queue a failed webhook for retry with exponential backoff (2^n minutes).';

COMMENT ON FUNCTION public.get_pending_webhook_retries IS 
  'Get pending webhook retries that are due, marking them as PROCESSING.';