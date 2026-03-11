CREATE OR REPLACE VIEW public.analytics_historical_daily_pl_v AS

WITH an_gia_properties AS (
  SELECT cpg.channex_property_id
  FROM public.channex_property_groups cpg
  INNER JOIN public.channex_groups cg
    ON cg.channex_group_id = cpg.channex_group_id
  WHERE cg.title = 'An Gia Residences'
),

checked_out_stays AS (
  SELECT DISTINCT ON (unified_booking_id)
    unified_booking_id
  FROM public.stays
  WHERE stay_status = 'CHECKED_OUT'
  ORDER BY unified_booking_id
),

ota_bookings AS (
  SELECT
    bm.unified_booking_id,
    bm.check_out_date AS business_date,
    bm.pms_property_name AS property_name,
    bm.ota_source AS channel,
    bm.room_type,
    bm.booking_status::text AS booking_status,
    bm.channex_status,
    bm.payment_type::text AS payment_type,
    bm.booking_type,
    COALESCE(bm.total_amount_net, 0) AS revenue_raw_net,
    COALESCE(bm.total_amount_gross, 0) AS revenue_raw_gross,
    COALESCE(bm.nights, (bm.check_out_date - bm.check_in_date)) AS nights,
    bm.channex_property_id::text AS channex_property_id
  FROM public.bookings_mirror bm
  INNER JOIN an_gia_properties ap
    ON ap.channex_property_id = bm.channex_property_id
  INNER JOIN checked_out_stays cs
    ON cs.unified_booking_id = bm.unified_booking_id
  WHERE bm.booking_status NOT IN ('CANCELLED', 'NO_SHOW')
),

manual_booking_rows AS (
  SELECT
    mb.unified_booking_id,
    mb.check_out_date AS business_date,
    mb.manual_property_name AS property_name,
    mb.source AS channel,
    NULL::text AS room_type,
    mb.booking_status::text AS booking_status,
    NULL::text AS channex_status,
    mb.payment_type::text AS payment_type,
    'MANUAL'::text AS booking_type,
    COALESCE(mb.total_amount_net, 0) AS revenue_raw_net,
    COALESCE(mb.total_amount_gross, 0) AS revenue_raw_gross,
    COALESCE(mb.nights, (mb.check_out_date - mb.check_in_date)) AS nights,
    NULL::text AS channex_property_id
  FROM public.manual_bookings mb
  INNER JOIN checked_out_stays cs
    ON cs.unified_booking_id = mb.unified_booking_id
  WHERE mb.booking_status NOT IN ('CANCELLED', 'NO_SHOW')
),

active_bookings AS (
  SELECT * FROM ota_bookings
  UNION ALL
  SELECT * FROM manual_booking_rows
),

overrides AS (
  SELECT
    unified_booking_id,
    amount AS override_amount
  FROM public.booking_amount_overrides
),

bookings_with_revenue AS (
  SELECT
    ab.unified_booking_id,
    ab.business_date,
    ab.property_name,
    ab.channel,
    ab.room_type,
    ab.booking_status,
    ab.channex_status,
    ab.payment_type,
    ab.booking_type,
    ab.revenue_raw_net,
    ab.revenue_raw_gross,
    ab.nights,
    ov.override_amount,
    (ov.override_amount IS NOT NULL) AS override_applied,

    CASE
      WHEN UPPER(COALESCE(ab.booking_status, '')) IN ('CANCELLED', 'CANCELED', 'CANCELLED_BY_GUEST', 'NO_SHOW')
        OR LOWER(COALESCE(ab.channex_status, '')) IN ('cancelled', 'canceled')
      THEN 0

      WHEN ov.override_amount IS NOT NULL
      THEN ov.override_amount

      WHEN ab.booking_type = 'IMPORTED'
      THEN 0

      WHEN ab.payment_type = 'OTA_COLLECT' AND ab.revenue_raw_net > 0
      THEN ab.revenue_raw_net

      WHEN ab.payment_type = 'HOTEL_COLLECT'
        AND GREATEST(ab.revenue_raw_net, ab.revenue_raw_gross) > 0
      THEN GREATEST(ab.revenue_raw_net, ab.revenue_raw_gross)

      ELSE 0
    END AS revenue_pl

  FROM active_bookings ab
  LEFT JOIN overrides ov ON ov.unified_booking_id = ab.unified_booking_id
),

host_cost_per_booking AS (
  SELECT
    hss.unified_booking_id,
    SUM(hss.total_amount) AS host_cost_total
  FROM public.host_supply_segments hss
  INNER JOIN checked_out_stays cs
    ON cs.unified_booking_id = hss.unified_booking_id
  GROUP BY hss.unified_booking_id
)

SELECT
  bwr.business_date,
  bwr.property_name,
  bwr.channel,
  bwr.room_type,
  COUNT(DISTINCT bwr.unified_booking_id) AS bookings_count,
  COALESCE(SUM(bwr.nights), 0) AS nights,
  COALESCE(SUM(bwr.revenue_pl), 0) AS revenue_pl,
  COALESCE(SUM(bwr.revenue_raw_net), 0) AS revenue_raw_net,
  COUNT(*) FILTER (WHERE bwr.override_applied) AS overrides_count,
  COALESCE(SUM(hc.host_cost_total), 0) AS host_cost,
  COALESCE(SUM(bwr.revenue_pl), 0) - COALESCE(SUM(hc.host_cost_total), 0) AS gross_profit_pl,
  CASE
    WHEN SUM(bwr.nights) >= 3
    THEN ROUND(SUM(bwr.revenue_pl) / NULLIF(SUM(bwr.nights), 0), 0)
    ELSE NULL
  END AS adr,
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
  'P&L-aligned analytics view. Includes bookings_mirror + manual_bookings. Time key: check_out_date. Revenue: computeBookingAmount parity. Scope: An Gia Residences (OTA) + all manual bookings.';