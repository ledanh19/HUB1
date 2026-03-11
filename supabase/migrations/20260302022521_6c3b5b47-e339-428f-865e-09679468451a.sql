-- ============================================================
-- SPRINT 3.2 — Mark legacy SYNC collections (soft-flag)
-- NON-BREAKING, ADDITIVE ONLY
-- ============================================================

-- Step 1: Add soft-flag columns
ALTER TABLE public.hotel_collects
  ADD COLUMN IF NOT EXISTS is_legacy_sync boolean NOT NULL DEFAULT false;

ALTER TABLE public.hotel_collects
  ADD COLUMN IF NOT EXISTS legacy_sync_reason text NULL;

ALTER TABLE public.hotel_collects
  ADD COLUMN IF NOT EXISTS legacy_sync_marked_at timestamptz NULL;

-- Step 2: Index for filtering
CREATE INDEX IF NOT EXISTS idx_hotel_collects_is_legacy_sync
  ON public.hotel_collects (is_legacy_sync)
  WHERE is_legacy_sync = true;

-- Step 3: Backfill — mark rows created by legacy sync tool
UPDATE public.hotel_collects
SET
  is_legacy_sync = true,
  legacy_sync_reason = 'AUTO_MARK_FROM_NOTE',
  legacy_sync_marked_at = now()
WHERE related_type = 'OTA_PAYOUT'
  AND note ILIKE '%[SYNC]%'
  AND is_legacy_sync = false;

-- Step 4: Audit log for the backfill
INSERT INTO public.audit_logs (action, entity, entity_id, user_id, after_data)
VALUES (
  'MARK_LEGACY_SYNC_COLLECTS',
  'hotel_collects',
  NULL,
  NULL,
  jsonb_build_object(
    'criteria', 'related_type=OTA_PAYOUT AND note ILIKE %[SYNC]%',
    'affected_count', (SELECT COUNT(*) FROM public.hotel_collects WHERE is_legacy_sync = true),
    'marked_at', now()::text
  )
);

-- Step 5: Verification
DO $$
DECLARE
  v_col_exists boolean;
  v_count int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hotel_collects' AND column_name='is_legacy_sync'
  ) INTO v_col_exists;

  SELECT COUNT(*) INTO v_count FROM public.hotel_collects WHERE is_legacy_sync = true;

  RAISE NOTICE 'Sprint 3.2: column_exists=%, legacy_rows_marked=%', v_col_exists, v_count;
END;
$$;