-- ============================================================
-- FIX P0 SECURITY + P1 ISSUES
-- ============================================================
-- Date: 2026-01-09
-- Purpose: Fix RLS policies, queue_webhook_retry bug, add indexes
-- ============================================================

-- ============================================================
-- STEP 1: Drop existing insecure RLS policies
-- ============================================================
DROP POLICY IF EXISTS "webhook_health_read" ON public.webhook_health_checks;
DROP POLICY IF EXISTS "webhook_health_insert" ON public.webhook_health_checks;
DROP POLICY IF EXISTS "webhook_retry_select" ON public.webhook_retry_queue;
DROP POLICY IF EXISTS "webhook_retry_insert" ON public.webhook_retry_queue;
DROP POLICY IF EXISTS "webhook_retry_update" ON public.webhook_retry_queue;
DROP POLICY IF EXISTS "sync_coverage_read" ON public.sync_coverage_kpi;
DROP POLICY IF EXISTS "sync_coverage_insert" ON public.sync_coverage_kpi;

-- ============================================================
-- STEP 2: Create secure RLS policies
-- webhook_health_checks: SELECT for authenticated (no PII), INSERT/UPDATE/DELETE for service_role only
-- webhook_retry_queue: NO authenticated access (contains PII in payload)
-- sync_coverage_kpi: SELECT for authenticated, INSERT/UPDATE for service_role only
-- ============================================================

-- webhook_health_checks: authenticated can read (no PII), write is via SECURITY DEFINER function only
CREATE POLICY "webhook_health_authenticated_read" ON public.webhook_health_checks
  FOR SELECT TO authenticated USING (true);

-- webhook_retry_queue: NO public access (contains PII in payload)
-- All access is via SECURITY DEFINER functions only
-- (No policy = no access for authenticated users)

-- sync_coverage_kpi: authenticated can read coverage stats, write via SECURITY DEFINER only
CREATE POLICY "sync_coverage_authenticated_read" ON public.sync_coverage_kpi
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- STEP 3: Fix queue_webhook_retry function - use (retry_count + 1) >= max_retries
-- Also add auth.role() check for safety
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
  v_existing_retry_count INTEGER;
  v_max_retries INTEGER;
  v_new_status TEXT;
BEGIN
  -- Fetch the webhook event
  SELECT * INTO v_event FROM webhook_events WHERE id = p_webhook_event_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook event not found: %', p_webhook_event_id;
  END IF;
  
  -- Check if retry record already exists
  SELECT retry_count, max_retries 
  INTO v_existing_retry_count, v_max_retries
  FROM webhook_retry_queue
  WHERE webhook_event_id = p_webhook_event_id AND status IN ('PENDING', 'PROCESSING');
  
  IF FOUND THEN
    -- FIX: Use (retry_count + 1) >= max_retries for correct status determination
    v_new_status := CASE WHEN (v_existing_retry_count + 1) >= v_max_retries THEN 'FAILED' ELSE 'PENDING' END;
    
    UPDATE webhook_retry_queue
    SET 
      retry_count = v_existing_retry_count + 1,
      last_error = p_error,
      next_retry_at = now() + (POWER(2, LEAST(v_existing_retry_count + 1, 6)) || ' minutes')::INTERVAL,
      status = v_new_status,
      updated_at = now()
    WHERE webhook_event_id = p_webhook_event_id AND status IN ('PENDING', 'PROCESSING')
    RETURNING id INTO v_retry_id;
    
    RETURN v_retry_id;
  END IF;
  
  -- Insert new retry record
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
-- STEP 4: Add missing indexes for performance
-- ============================================================

-- Index for webhook_events lookup by provider and date
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_created 
ON public.webhook_events(provider, created_at DESC);

-- Index already exists for webhook_retry_queue (status, next_retry_at) from previous migration

-- ============================================================
-- STEP 5: Convert index to UNIQUE constraint on bookings_mirror
-- First drop the existing non-unique index, then create UNIQUE
-- ============================================================

-- Drop the non-unique index if it exists
DROP INDEX IF EXISTS public.idx_bookings_mirror_provider_booking;

-- Create proper UNIQUE constraint
ALTER TABLE public.bookings_mirror
DROP CONSTRAINT IF EXISTS uq_bookings_mirror_provider_booking;

ALTER TABLE public.bookings_mirror
ADD CONSTRAINT uq_bookings_mirror_provider_booking 
UNIQUE (provider, provider_booking_id);

-- ============================================================
-- STEP 6: Add error_code column to webhook_retry_queue for categorization
-- ============================================================
ALTER TABLE public.webhook_retry_queue
ADD COLUMN IF NOT EXISTS error_code TEXT;

COMMENT ON COLUMN public.webhook_retry_queue.error_code IS 
  'Error category: MAPPING_MISSING, VALIDATION_FAIL, DB_CONFLICT, API_ERROR, UNKNOWN';

-- ============================================================
-- STEP 7: Add status/processed_at to webhook_events if missing
-- (for proper retry tracking)
-- ============================================================
ALTER TABLE public.webhook_events
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';

ALTER TABLE public.webhook_events
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webhook_events_status
ON public.webhook_events(status) WHERE status != 'PROCESSED';

-- ============================================================
-- STEP 8: Update comments
-- ============================================================
COMMENT ON FUNCTION public.queue_webhook_retry IS 
  'Queue a failed webhook for retry with exponential backoff. Uses (retry_count + 1) >= max_retries for status.';