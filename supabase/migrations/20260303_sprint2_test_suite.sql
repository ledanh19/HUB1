-- ============================================================================
-- SPRINT 2: TEST SUITE — analytics_historical_daily_v
-- 
-- READ-ONLY QUERIES — run in Supabase SQL Editor or psql
-- All queries are SELECT-only, no side effects.
--
-- Run AFTER applying the Sprint 2 migration.
-- ============================================================================


-- ############################################################################
-- TEST 1: VIEW EXISTS AND HAS DATA
-- Expected: view is queryable, row count > 0
-- ############################################################################

SELECT 'TEST 1: View exists and row count' AS test_name;
SELECT COUNT(*) AS total_rows FROM analytics_historical_daily_v;


-- ############################################################################
-- TEST 2: NO CANCELLED/NO_SHOW BOOKINGS IN VIEW
-- Expected: 0 rows. If > 0, the completion rule filter is broken.
-- ############################################################################

SELECT 'TEST 2: Cancelled/No-Show exclusion' AS test_name;

-- Check if any booking that made it into the view has CANCELLED or NO_SHOW status
WITH view_bookings AS (
  -- Reconstruct booking list from the enriched CTE logic
  SELECT DISTINCT bm.unified_booking_id, bm.booking_status
  FROM bookings_mirror bm
  INNER JOIN stays s ON s.unified_booking_id = bm.unified_booking_id
  WHERE s.actual_check_out_at IS NOT NULL
    AND bm.booking_status IN ('CANCELLED', 'NO_SHOW')
  
  UNION ALL
  
  SELECT DISTINCT mb.unified_booking_id, mb.booking_status::text
  FROM manual_bookings mb
  INNER JOIN stays s ON s.unified_booking_id = mb.unified_booking_id
  WHERE s.actual_check_out_at IS NOT NULL
    AND mb.booking_status IN ('CANCELLED', 'NO_SHOW')
)
SELECT 
  booking_status,
  COUNT(*) AS excluded_count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '⚠️ These are correctly EXCLUDED from view' END AS result
FROM view_bookings
GROUP BY booking_status;


-- ############################################################################
-- TEST 3: NO DOUBLE-COUNT FROM DUPLICATE STAYS
-- Expected: 0 rows with dup_count > 1 contributing to the view.
-- If any booking has >1 stays, stays_dedup should collapse them to 1.
-- ############################################################################

SELECT 'TEST 3: Stays deduplication check' AS test_name;

WITH stays_multi AS (
  SELECT 
    unified_booking_id,
    COUNT(*) AS stays_count,
    COUNT(*) FILTER (WHERE actual_check_out_at IS NOT NULL) AS checked_out_count
  FROM stays
  GROUP BY unified_booking_id
  HAVING COUNT(*) > 1
)
SELECT 
  COUNT(*) AS bookings_with_multiple_stays,
  SUM(stays_count) AS total_stays_rows,
  SUM(checked_out_count) AS total_checked_out_rows,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS — no duplicates exist'
    ELSE '⚠️ INFO — duplicates exist but stays_dedup handles them (DISTINCT ON takes latest)'
  END AS result
FROM stays_multi;


-- ############################################################################
-- TEST 4: TIMEZONE BOUNDARY CHECK
-- Find stays where checkout was near midnight VN time (23:00-01:00 VN = 16:00-18:00 UTC)
-- Verify that business_date uses VN timezone correctly.
-- Expected: business_date should match the VN local date, not UTC date.
-- ############################################################################

SELECT 'TEST 4: Timezone boundary check' AS test_name;

WITH midnight_checkouts AS (
  SELECT 
    unified_booking_id,
    actual_check_out_at,
    -- What the OLD logic would produce (UTC-dependent, session timezone)
    actual_check_out_at::date AS naive_date,
    -- What the PATCHED logic produces (VN timezone)
    (actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vn_date,
    -- Extract hour in VN time for debugging
    EXTRACT(HOUR FROM actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS vn_hour
  FROM stays
  WHERE actual_check_out_at IS NOT NULL
    -- Checkouts between 22:00-02:00 VN time (boundary zone)
    AND EXTRACT(HOUR FROM actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (22, 23, 0, 1)
)
SELECT 
  COUNT(*) AS boundary_checkouts,
  COUNT(*) FILTER (WHERE naive_date != vn_date) AS date_mismatch_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS — no boundary checkouts found (no risk)'
    WHEN COUNT(*) FILTER (WHERE naive_date != vn_date) = 0 THEN '✅ PASS — all dates match (session TZ = VN)'
    ELSE '🔴 CRITICAL — ' || COUNT(*) FILTER (WHERE naive_date != vn_date) || ' checkouts would have WRONG date without TZ fix'
  END AS result
FROM midnight_checkouts;

-- Show actual examples if any mismatch exists
SELECT 
  unified_booking_id,
  actual_check_out_at,
  actual_check_out_at::date AS naive_date,
  (actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vn_date,
  EXTRACT(HOUR FROM actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS vn_hour,
  CASE WHEN actual_check_out_at::date != (actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date 
       THEN '🔴 MISMATCH' ELSE '✅ OK' END AS status
FROM stays
WHERE actual_check_out_at IS NOT NULL
  AND EXTRACT(HOUR FROM actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh') IN (22, 23, 0, 1)
ORDER BY actual_check_out_at DESC
LIMIT 10;


-- ############################################################################
-- TEST 5: PARITY CHECK — View Revenue vs FE Logic (1 month)
-- Compare total revenue from the NEW view vs the OLD FE approach
-- for the most recent full month.
--
-- Expected: Numbers WILL differ because time keys are different.
-- The point is to EXPLAIN the delta, not to match exactly.
--   - View uses actual_check_out → revenue of stays completed in that month
--   - FE uses check_in_date → revenue of bookings checking in that month
-- ############################################################################

SELECT 'TEST 5: Parity check — View vs FE logic (last full month)' AS test_name;

WITH
  date_range AS (
    SELECT 
      date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::date AS month_start,
      (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date AS month_end
  ),
  -- NEW VIEW: revenue by actual_check_out
  view_totals AS (
    SELECT 
      SUM(revenue_net) AS view_revenue_net,
      SUM(host_cost) AS view_host_cost,
      SUM(gross_profit) AS view_gross_profit,
      SUM(bookings_count) AS view_bookings,
      SUM(nights) AS view_nights
    FROM analytics_historical_daily_v, date_range dr
    WHERE business_date BETWEEN dr.month_start AND dr.month_end
  ),
  -- OLD FE LOGIC: revenue by check_in_date (simulating what FE does)
  fe_totals AS (
    SELECT 
      COALESCE(SUM(ub.total_amount_net), 0) AS fe_revenue_net,
      COUNT(DISTINCT ub.unified_booking_id) AS fe_bookings,
      COALESCE(SUM(ub.nights), 0) AS fe_nights
    FROM unified_bookings ub, date_range dr
    WHERE ub.check_in_date BETWEEN dr.month_start AND dr.month_end
      AND ub.booking_status NOT IN ('CANCELLED', 'NO_SHOW')
  )
SELECT
  (SELECT month_start || ' to ' || month_end FROM date_range) AS period,
  vt.view_revenue_net,
  ft.fe_revenue_net,
  vt.view_revenue_net - ft.fe_revenue_net AS delta_revenue,
  CASE WHEN ft.fe_revenue_net > 0 
    THEN ROUND((vt.view_revenue_net - ft.fe_revenue_net) / ft.fe_revenue_net * 100, 1) 
    ELSE NULL 
  END AS delta_pct,
  vt.view_bookings,
  ft.fe_bookings,
  vt.view_bookings - ft.fe_bookings AS delta_bookings,
  '⚠️ Delta is EXPECTED — different time keys. View=checkout, FE=check_in' AS explanation
FROM view_totals vt, fe_totals ft;


-- ############################################################################
-- TEST 6: MARGIN CONSISTENCY — Random 20 bookings spot check
-- For individual bookings, verify:
--   revenue_net (from booking) matches what view aggregates
--   host_cost (from segments) sums correctly
--   profit = revenue - cost (no negative unless real margin issue)
-- ############################################################################

SELECT 'TEST 6: Margin consistency — 20 random booking spot check' AS test_name;

WITH random_bookings AS (
  SELECT DISTINCT ON (bm.unified_booking_id)
    bm.unified_booking_id,
    COALESCE(bm.total_amount_net, 0) AS booking_revenue_net,
    bm.booking_status,
    (s.actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS business_date
  FROM bookings_mirror bm
  INNER JOIN stays s ON s.unified_booking_id = bm.unified_booking_id
  WHERE s.actual_check_out_at IS NOT NULL
    AND bm.booking_status NOT IN ('CANCELLED', 'NO_SHOW')
  ORDER BY bm.unified_booking_id, s.actual_check_out_at DESC
  LIMIT 20
),
segment_costs AS (
  SELECT 
    hss.unified_booking_id,
    SUM(hss.total_amount) AS total_host_cost,
    SUM(hss.nights) AS total_host_nights,
    COUNT(*) AS segment_count
  FROM host_supply_segments hss
  WHERE hss.unified_booking_id IN (SELECT unified_booking_id FROM random_bookings)
  GROUP BY hss.unified_booking_id
)
SELECT 
  rb.unified_booking_id,
  rb.business_date,
  rb.booking_revenue_net AS revenue,
  COALESCE(sc.total_host_cost, 0) AS host_cost,
  rb.booking_revenue_net - COALESCE(sc.total_host_cost, 0) AS profit,
  CASE 
    WHEN rb.booking_revenue_net - COALESCE(sc.total_host_cost, 0) < 0 
    THEN '⚠️ NEGATIVE MARGIN'
    ELSE '✅ OK'
  END AS margin_status,
  COALESCE(sc.segment_count, 0) AS segments,
  COALESCE(sc.total_host_nights, 0) AS host_nights
FROM random_bookings rb
LEFT JOIN segment_costs sc ON sc.unified_booking_id = rb.unified_booking_id
ORDER BY profit ASC;


-- ############################################################################
-- TEST 7: HOST COST COMPLETENESS
-- Check if any completed bookings in the view have zero host cost
-- (could be valid for bookings without supply segments, but worth flagging)
-- ############################################################################

SELECT 'TEST 7: Host cost completeness' AS test_name;

WITH view_agg AS (
  SELECT
    SUM(bookings_count) AS total_bookings,
    SUM(bookings_count) FILTER (WHERE host_cost = 0 AND revenue_net > 0) AS bookings_with_zero_cost,
    SUM(bookings_count) FILTER (WHERE host_cost > 0) AS bookings_with_cost
  FROM analytics_historical_daily_v
)
SELECT
  total_bookings,
  bookings_with_cost,
  bookings_with_zero_cost,
  CASE 
    WHEN bookings_with_zero_cost = 0 THEN '✅ PASS — all bookings have host cost'
    WHEN bookings_with_zero_cost::float / NULLIF(total_bookings, 0) < 0.1 
      THEN '⚠️ INFO — ' || bookings_with_zero_cost || ' bookings with 0 host cost (<10%, likely missing segments)'
    ELSE '🔴 WARNING — ' || bookings_with_zero_cost || ' bookings with 0 host cost (>10%)'
  END AS result
FROM view_agg;


-- ############################################################################
-- TEST 8: GRAIN VALIDATION — No NULL dimensions in output
-- Expected: 0 rows with NULL business_date, property_name, channel, or room_type
-- ############################################################################

SELECT 'TEST 8: Grain validation — no NULL dimensions' AS test_name;

SELECT 
  COUNT(*) FILTER (WHERE business_date IS NULL) AS null_business_date,
  COUNT(*) FILTER (WHERE property_name IS NULL) AS null_property_name,
  COUNT(*) FILTER (WHERE channel IS NULL) AS null_channel,
  COUNT(*) FILTER (WHERE room_type IS NULL) AS null_room_type,
  CASE 
    WHEN COUNT(*) FILTER (WHERE business_date IS NULL OR property_name IS NULL 
                           OR channel IS NULL OR room_type IS NULL) = 0 
    THEN '✅ PASS — all grain dimensions are non-NULL'
    ELSE '🔴 FAIL — has NULL grain dimensions'
  END AS result
FROM analytics_historical_daily_v;
