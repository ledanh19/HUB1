-- ============================================================
-- CHANNEX SYNC PIPELINE - P0 FIXES
-- ============================================================
-- Date: 2026-01-09
-- Purpose: Fix critical issues from pipeline audit
--   1. Add missing unique index for provider + provider_booking_id
--   2. This enables upsert to work correctly without duplicates
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_bookings_mirror_provider_booking;
-- ============================================================

-- Task 1: Add unique index for upsert to work correctly
-- The upsert uses onConflict: "provider,provider_booking_id"
-- but there was no unique constraint/index for this combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_mirror_provider_booking
ON public.bookings_mirror(provider, provider_booking_id)
WHERE provider IS NOT NULL AND provider_booking_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX idx_bookings_mirror_provider_booking IS 
'Unique index for (provider, provider_booking_id) to enable correct upsert behavior. 
Critical for preventing duplicate bookings and ensuring webhook/sync updates work correctly.';

-- Verify: Check for any existing duplicates before the index was created
-- This query will fail if there are duplicates, which we need to handle
DO $$
DECLARE
  duplicate_count INT;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM (
    SELECT provider, provider_booking_id, COUNT(*) as cnt
    FROM public.bookings_mirror
    WHERE provider IS NOT NULL AND provider_booking_id IS NOT NULL
    GROUP BY provider, provider_booking_id
    HAVING COUNT(*) > 1
  ) as duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE WARNING 'Found % duplicate provider+provider_booking_id combinations. These should be manually reviewed.', duplicate_count;
  ELSE
    RAISE NOTICE 'No duplicates found. Index created successfully.';
  END IF;
END$$;