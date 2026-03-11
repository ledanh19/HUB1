-- SPRINT 2: ANALYTICS HISTORICAL FINANCE LAYER (PATCHED)
CREATE OR REPLACE VIEW public.analytics_historical_daily_v AS
WITH stays_dedup AS (
  SELECT DISTINCT ON (unified_booking_id)
    unified_booking_id,
    actual_check_out_at
  FROM public.stays
  WHERE actual_check_out_at IS NOT NULL
  ORDER BY unified_booking_id, actual_check_out_at DESC
),
completed_bookings AS (
  SELECT
    bm.unified_booking_id,
    (sd.actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS business_date,
    bm.pms_property_id AS property_id,
    bm.pms_property_name AS booking_property_name,
    bm.ota_source AS channel,
    bm.room_type AS ota_room_type,
    COALESCE(bm.total_amount_gross, 0) AS revenue_gross,
    COALESCE(bm.total_amount_net, 0) AS revenue_net,
    COALESCE(bm.nights, (bm.check_out_date - bm.check_in_date)) AS nights,
    bm.booking_status,
    bm.check_in_date,
    COALESCE(bm.booking_date, bm.created_at::date) AS booking_date
  FROM public.bookings_mirror bm
  INNER JOIN stays_dedup sd ON sd.unified_booking_id = bm.unified_booking_id
  WHERE bm.booking_status NOT IN ('CANCELLED', 'NO_SHOW')
  UNION ALL
  SELECT
    mb.unified_booking_id,
    (sd.actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS business_date,
    NULL::text AS property_id,
    mb.manual_property_name AS booking_property_name,
    mb.source AS channel,
    COALESCE(mb.sold_room_type, mb.room_type) AS ota_room_type,
    COALESCE(mb.total_amount_gross, 0) AS revenue_gross,
    COALESCE(mb.total_amount_net, 0) AS revenue_net,
    COALESCE(mb.nights, (mb.check_out_date - mb.check_in_date)) AS nights,
    mb.booking_status,
    mb.check_in_date,
    COALESCE(mb.booking_date, mb.created_at::date) AS booking_date
  FROM public.manual_bookings mb
  INNER JOIN stays_dedup sd ON sd.unified_booking_id = mb.unified_booking_id
  WHERE mb.booking_status NOT IN ('CANCELLED', 'NO_SHOW')
),
host_cost_per_booking AS (
  SELECT
    hss.unified_booking_id,
    SUM(hss.total_amount) AS host_cost_total,
    SUM(hss.nights) AS host_nights,
    (array_agg(hss.host_property_name ORDER BY hss.date_from)
       FILTER (WHERE hss.host_property_name IS NOT NULL))[1] AS first_host_property,
    (array_agg(hss.host_room_type ORDER BY hss.date_from)
       FILTER (WHERE hss.host_room_type IS NOT NULL))[1] AS first_host_room_type
  FROM public.host_supply_segments hss
  GROUP BY hss.unified_booking_id
),
enriched AS (
  SELECT
    cb.business_date,
    cb.unified_booking_id,
    cb.property_id,
    COALESCE(hc.first_host_property, cb.booking_property_name, 'Unknown') AS property_name,
    cb.channel,
    COALESCE(hc.first_host_room_type, cb.ota_room_type, 'Unknown') AS room_type,
    cb.revenue_gross,
    cb.revenue_net,
    COALESCE(hc.host_cost_total, 0) AS host_cost,
    cb.nights,
    cb.check_in_date,
    cb.booking_date
  FROM completed_bookings cb
  LEFT JOIN host_cost_per_booking hc ON hc.unified_booking_id = cb.unified_booking_id
)
SELECT
  e.business_date,
  e.property_name,
  e.channel,
  e.room_type,
  COUNT(DISTINCT e.unified_booking_id) AS bookings_count,
  COALESCE(SUM(e.nights), 0) AS nights,
  COALESCE(SUM(e.revenue_gross), 0) AS revenue_gross,
  COALESCE(SUM(e.revenue_net), 0) AS revenue_net,
  COALESCE(SUM(e.host_cost), 0) AS host_cost,
  COALESCE(SUM(e.revenue_net), 0) - COALESCE(SUM(e.host_cost), 0) AS gross_profit,
  CASE
    WHEN SUM(e.nights) >= 3 THEN ROUND(SUM(e.revenue_net) / NULLIF(SUM(e.nights), 0), 0)
    ELSE NULL
  END AS adr,
  CASE
    WHEN SUM(e.revenue_net) > 0
    THEN ROUND(
      (SUM(e.revenue_net) - COALESCE(SUM(e.host_cost), 0))
      / SUM(e.revenue_net) * 100, 2
    )
    ELSE NULL
  END AS margin_pct
FROM enriched e
GROUP BY e.business_date, e.property_name, e.channel, e.room_type;

COMMENT ON VIEW public.analytics_historical_daily_v IS
  'Analytics Historical Finance Layer (Sprint 2, Patched). Time key: actual_check_out VN timezone.';

CREATE INDEX IF NOT EXISTS idx_stays_analytics_checkout
  ON public.stays (unified_booking_id, actual_check_out_at DESC)
  WHERE actual_check_out_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_mirror_analytics
  ON public.bookings_mirror (unified_booking_id, booking_status)
  WHERE booking_status NOT IN ('CANCELLED', 'NO_SHOW');

CREATE INDEX IF NOT EXISTS idx_manual_bookings_analytics
  ON public.manual_bookings (unified_booking_id, booking_status)
  WHERE booking_status NOT IN ('CANCELLED', 'NO_SHOW');

CREATE INDEX IF NOT EXISTS idx_host_supply_segments_cost_agg
  ON public.host_supply_segments (unified_booking_id, total_amount, nights);