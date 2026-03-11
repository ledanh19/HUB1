-- ============================================
-- BACKFILL VERIFICATION: OTA Payout received_at coverage
-- Run this AFTER applying 20260228_fix_ota_payout_received_at.sql
-- This is a READ-ONLY diagnostic query — no data changes
-- ============================================

-- 1. Count RECEIVED payouts missing received_at
SELECT 
  'RECEIVED with NULL received_at' as check_type,
  COUNT(*) as count
FROM ota_payouts
WHERE status = 'RECEIVED' AND received_at IS NULL;

-- 2. Count RECEIVED payouts that HAVE received_at (post-backfill)
SELECT 
  'RECEIVED with received_at SET' as check_type,
  COUNT(*) as count
FROM ota_payouts
WHERE status = 'RECEIVED' AND received_at IS NOT NULL;

-- 3. Total RECEIVED payouts for reference
SELECT 
  'Total RECEIVED payouts' as check_type,
  COUNT(*) as count
FROM ota_payouts
WHERE status = 'RECEIVED';

-- 4. Coverage percentage
SELECT 
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE received_at IS NOT NULL) / NULLIF(COUNT(*), 0),
    1
  ) as received_at_coverage_pct,
  COUNT(*) as total_received,
  COUNT(*) FILTER (WHERE received_at IS NOT NULL) as has_received_at,
  COUNT(*) FILTER (WHERE received_at IS NULL) as missing_received_at
FROM ota_payouts
WHERE status = 'RECEIVED';

-- 5. Optional: sample payouts still missing received_at (for manual investigation)
SELECT 
  id,
  ota_source,
  payout_date,
  reconciled_at,
  updated_at,
  status
FROM ota_payouts
WHERE status = 'RECEIVED' AND received_at IS NULL
ORDER BY updated_at DESC
LIMIT 10;

-- 6. Verify no RECEIVED payout has reconciled_at but NOT received_at (backfill gap)
SELECT 
  'Has reconciled_at but NOT received_at' as check_type,
  COUNT(*) as count
FROM ota_payouts
WHERE status = 'RECEIVED' 
  AND reconciled_at IS NOT NULL 
  AND received_at IS NULL;
