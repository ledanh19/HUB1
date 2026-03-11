-- ============================================================================
-- MIGRATION: Create P&L-aligned analytics view
-- View: analytics_historical_daily_pl_v
-- 
-- Purpose: Dedicated view for Dashboard Channex Report tab that produces
-- EXACT same numbers as usePLCalculator (P&L SOT).
--
-- Key differences from analytics_historical_daily_v:
--   1. Time key: check_out_date (not actual_check_out_at)
--   2. Stay guard: stay_status = 'CHECKED_OUT' (not actual_check_out_at IS NOT NULL)
--   3. Property scope: An Gia Residences group only
--   4. No manual_bookings (P&L only uses bookings_mirror)
--   5. Override-applied revenue (booking_amount_overrides priority)
--   6. Enhanced cancel detection (booking_status + channex_status + ota_status_label)
-- ============================================================================

CREATE OR REPLACE VIEW public.analytics_historical_daily_pl_v AS

-- ── CTE 1: An Gia property IDs (same as P&L getAnGiaPropertyIds) ──
WITH an_gia_properties AS (
  SELECT cpg.channex_property_id
  FROM public.channex_property_groups cpg
  INNER JOIN public.channex_groups cg
    ON cg.channex_group_id = cpg.channex_group_id
  WHERE cg.title = 'An Gia Residences'
),

-- ── CTE 2: CHECKED_OUT stays dedup (same as P&L: stay_status = 'CHECKED_OUT') ──
checked_out_stays AS (
  SELECT DISTINCT ON (unified_booking_id)
    unified_booking_id
  FROM public.stays
  WHERE stay_status = 'CHECKED_OUT'
  ORDER BY unified_booking_id
),

-- ── CTE 3: Active bookings from bookings_mirror only (no manual_bookings) ──
-- Filters: An Gia properties, NOT CANCELLED/NO_SHOW, has CHECKED_OUT stay
active_bookings AS (
  SELECT
    bm.unified_booking_id,
    bm.check_out_date AS business_date,       -- P&L time key
    bm.pms_property_name AS property_name,
    bm.ota_source AS channel,
    bm.room_type,
    bm.booking_status,
    bm.channex_status,
    bm.ota_status_label,
    bm.payment_type,
    bm.booking_type,
    COALESCE(bm.total_amount_net, 0) AS revenue_raw_net,
    COALESCE(bm.total_amount_gross, 0) AS revenue_raw_gross,
    COALESCE(bm.nights, (bm.check_out_date - bm.check_in_date)) AS nights,
    bm.channex_property_id
  FROM public.bookings_mirror bm
  INNER JOIN an_gia_properties ap
    ON ap.channex_property_id = bm.channex_property_id
  INNER JOIN checked_out_stays cs
    ON cs.unified_booking_id = bm.unified_booking_id
  WHERE bm.booking_status NOT IN ('CANCELLED', 'NO_SHOW')
),

-- ── CTE 4: Booking amount overrides ──
overrides AS (
  SELECT
    unified_booking_id,
    amount AS override_amount
  FROM public.booking_amount_overrides
),

-- ── CTE 5: Compute revenue_pl (mirrors computeBookingAmount exactly) ──
-- Priority order (identical to FE computeBookingAmount):
--   1. CANCELLED/NO_SHOW/channex cancelled/ota cancelled → 0
--   2. Override exists → override_amount
--   3. IMPORTED booking → 0
--   4. OTA_COLLECT with total_amount_net > 0 → total_amount_net
--   5. HOTEL_COLLECT with amount > 0 → total_amount_net (or gross fallback)
--   6. Otherwise → 0 (UNCONFIRMED)
bookings_with_revenue AS (
  SELECT
    ab.unified_booking_id,
    ab.business_date,
    ab.property_name,
    ab.channel,
    ab.room_type,
    ab.booking_status,
    ab.channex_status,
    ab.ota_status_label,
    ab.payment_type,
    ab.booking_type,
    ab.revenue_raw_net,
    ab.revenue_raw_gross,
    ab.nights,
    ov.override_amount,
    (ov.override_amount IS NOT NULL) AS override_applied,

    -- ── revenue_pl: exact P&L SOT calculation ──
    CASE
      -- 1. Enhanced cancel detection (same as computeBookingAmount)
      WHEN UPPER(COALESCE(ab.booking_status, '')) IN ('CANCELLED', 'CANCELED', 'CANCELLED_BY_GUEST', 'NO_SHOW')
        OR LOWER(COALESCE(ab.channex_status, '')) IN ('cancelled', 'canceled')
        OR LOWER(COALESCE(ab.ota_status_label, '')) LIKE '%hủy%'
        OR LOWER(COALESCE(ab.ota_status_label, '')) LIKE '%cancel%'
      THEN 0

      -- 2. Override confirmed → use override amount
      WHEN ov.override_amount IS NOT NULL
      THEN ov.override_amount

      -- 3. IMPORTED booking → 0
      WHEN ab.booking_type = 'IMPORTED'
      THEN 0

      -- 4. OTA_COLLECT with valid remittance → use total_amount_net
      WHEN ab.payment_type = 'OTA_COLLECT' AND ab.revenue_raw_net > 0
      THEN ab.revenue_raw_net

      -- 5. HOTEL_COLLECT with valid amount → use total_amount_net (or gross fallback)
      WHEN ab.payment_type = 'HOTEL_COLLECT'
        AND GREATEST(ab.revenue_raw_net, ab.revenue_raw_gross) > 0
      THEN GREATEST(ab.revenue_raw_net, ab.revenue_raw_gross)

      -- 6. Default → 0 (UNCONFIRMED)
      ELSE 0
    END AS revenue_pl

  FROM active_bookings ab
  LEFT JOIN overrides ov ON ov.unified_booking_id = ab.unified_booking_id
),

-- ── CTE 6: Host cost per booking (same as P&L hostCostQuery) ──
host_cost_per_booking AS (
  SELECT
    hss.unified_booking_id,
    SUM(hss.total_amount) AS host_cost_total
  FROM public.host_supply_segments hss
  INNER JOIN checked_out_stays cs
    ON cs.unified_booking_id = hss.unified_booking_id
  GROUP BY hss.unified_booking_id
)

-- ── Final SELECT: aggregated by date/property/channel/room_type ──
SELECT
  bwr.business_date,
  bwr.property_name,
  bwr.channel,
  bwr.room_type,
  COUNT(DISTINCT bwr.unified_booking_id) AS bookings_count,
  COALESCE(SUM(bwr.nights), 0) AS nights,

  -- P&L-aligned revenue (override-applied, cancel-detected)
  COALESCE(SUM(bwr.revenue_pl), 0) AS revenue_pl,
  -- Raw net for debugging
  COALESCE(SUM(bwr.revenue_raw_net), 0) AS revenue_raw_net,
  -- Override tracking
  COUNT(*) FILTER (WHERE bwr.override_applied) AS overrides_count,

  -- Host cost (P&L COGS)
  COALESCE(SUM(hc.host_cost_total), 0) AS host_cost,

  -- Gross profit (P&L definition)
  COALESCE(SUM(bwr.revenue_pl), 0) - COALESCE(SUM(hc.host_cost_total), 0) AS gross_profit_pl,

  -- ADR (revenue per night, min 3 nights threshold)
  CASE
    WHEN SUM(bwr.nights) >= 3
    THEN ROUND(SUM(bwr.revenue_pl) / NULLIF(SUM(bwr.nights), 0), 0)
    ELSE NULL
  END AS adr,

  -- Margin %
  CASE
    WHEN SUM(bwr.revenue_pl) > 0
    THEN ROUND(
      (SUM(bwr.revenue_pl) - COALESCE(SUM(hc.host_cost_total), 0))
      / SUM(bwr.revenue_pl) * 100, 2
    )
    ELSE NULL
  END AS margin_pct

FROM bookings_with_revenue bwr
LEFT JOIN host_cost_per_booking hc ON hc.unified_booking_id = bwr.unified_booking_id
GROUP BY bwr.business_date, bwr.property_name, bwr.channel, bwr.room_type;

COMMENT ON VIEW public.analytics_historical_daily_pl_v IS
  'P&L-aligned analytics view (Dashboard Channex Report). '
  'Time key: check_out_date. Revenue: computeBookingAmount parity. '
  'Scope: An Gia Residences only. No manual_bookings.';
