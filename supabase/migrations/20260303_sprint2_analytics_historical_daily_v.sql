-- ============================================================================
-- SPRINT 2: ANALYTICS HISTORICAL FINANCE LAYER (PATCHED)
-- View: analytics_historical_daily_v
-- 
-- PURPOSE:
--   Correct SOT for all historical finance metrics.
--   Uses actual_check_out as business_date (revenue recognition).
--   Revenue and Host Cost in the SAME time bucket → correct Margin.
--
-- TIME KEY: (actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
-- GRAIN:   business_date × property_name × channel × room_type
--
-- TIMEZONE POLICY:
--   All TIMESTAMPTZ → date conversions use AT TIME ZONE 'Asia/Ho_Chi_Minh'
--   to prevent silent date-shift when checkout is near midnight UTC+7.
--   Example: checkout at 2026-01-05 23:30 UTC = 2026-01-06 06:30 VN time
--   Without TZ conversion: business_date = Jan 5 (WRONG)
--   With TZ conversion:    business_date = Jan 6 (CORRECT)
--
-- COMPLETION RULE:
--   A booking enters this view ONLY when ALL conditions are met:
--   1. stays.actual_check_out_at IS NOT NULL (guest has actually left)
--   2. booking_status NOT IN ('CANCELLED', 'NO_SHOW')
--      - CANCELLED: no stay occurred, no revenue to recognize
--      - NO_SHOW: guest never arrived → no earned revenue
--        (no-show fees, if any, are handled in a separate module)
--   3. Revenue and Host Cost are both attributed to the SAME business_date
--
-- HOST COST ATTRIBUTION (SOT DECISION):
--   business_date comes from stays.actual_check_out_at, NOT from
--   host_supply_segments.actual_check_out_at, because:
--   1. stays is the operational SOT for "when did checkout happen"
--   2. stays is always created (1:1 with booking lifecycle)
--   3. host_supply_segments.actual_check_out_at may be NULL even after
--      checkout (segment-level checkout tracking was added later in
--      migration 20260114 and may not be backfilled)
--   4. Using stays gives a single, consistent time key for BOTH revenue
--      and host cost in the same row
--
-- MULTI-TENANT NOTE:
--   ⚠️ CURRENT STATE: System is single-tenant (An Gia group).
--   ⚠️ This view has NO org_id / tenant filter — intentionally.
--   ⚠️ org_id does not exist in base tables (bookings_mirror, stays,
--      host_supply_segments). Adding it requires a base schema migration.
--   ⚠️ WHEN multi-tenant is needed:
--      1. Add org_id UUID column to bookings_mirror + manual_bookings
--      2. Populate via trigger from channex_property_groups mapping
--      3. Add org_id as FIRST column in this view's grain
--      4. Add WHERE org_id = $1 filter (parameterized, not hardcoded)
--   ⚠️ DO NOT hardcode AN_GIA_GROUP_ID in this view.
--   ⚠️ Scope filtering is currently done at the FE/API query layer.
--
-- POLICY:
--   ✅ NON-BREAKING — new additive view only
--   ✅ ADDITIVE — no existing tables/views modified
--   ✅ RBAC-safe — inherits RLS from base tables
--   ✅ Timezone-safe — AT TIME ZONE 'Asia/Ho_Chi_Minh'
--   ✅ Revenue and Host Cost share the SAME time key
--
-- RESOLVES:
--   R1 — Time Key Mismatch (was: check_in_date + date_from → now: actual_check_out)
--   R2 — Revenue Recognition Error (was: check_in_date → now: actual_check_out)
--
-- DOES NOT:
--   ❌ Modify unified_bookings view
--   ❌ Modify host_supply_segments table
--   ❌ Modify stays table
--   ❌ Implement night explosion (Sprint 3)
--   ❌ Implement forward OTB (Sprint 4)
--   ❌ Hardcode any org_id / group_id
-- ============================================================================

-- ============================================================================
-- SECTION 1: CREATE VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.analytics_historical_daily_v AS

-- ────────────────────────────────────────────────────────────────────────────
-- CTE 1: De-duplicate stays → 1 row per booking (latest checkout wins)
--
-- WHY DEDUP:
--   stays.unified_booking_id has NO UNIQUE constraint.
--   Edge case: multiple stays per booking (e.g., room move mid-stay).
--   We take the latest actual_check_out_at so revenue is recognized
--   on the real final checkout date, not an intermediate one.
--
-- WHY stays IS SOT FOR CHECKOUT:
--   See header comment "HOST COST ATTRIBUTION (SOT DECISION)".
--   stays is the operational lifecycle table; host_supply_segments
--   may lack actual_check_out_at due to migration timing.
-- ────────────────────────────────────────────────────────────────────────────
WITH stays_dedup AS (
  SELECT DISTINCT ON (unified_booking_id)
    unified_booking_id,
    actual_check_out_at
  FROM public.stays
  WHERE actual_check_out_at IS NOT NULL
  ORDER BY unified_booking_id, actual_check_out_at DESC
),

-- ────────────────────────────────────────────────────────────────────────────
-- CTE 2: All completed bookings (PMS + Manual) with actual checkout date
--
-- COMPLETION RULE (locked):
--   ✅ actual_check_out_at IS NOT NULL (enforced via INNER JOIN to stays_dedup)
--   ✅ booking_status NOT IN ('CANCELLED', 'NO_SHOW')
--      - CANCELLED: no revenue earned
--      - NO_SHOW: guest never checked in → no earned stay revenue
--        (no-show penalty fees are tracked separately in no_show_records)
--
-- TIMEZONE:
--   All actual_check_out_at → date conversions use
--   AT TIME ZONE 'Asia/Ho_Chi_Minh' to prevent midnight boundary bugs.
-- ────────────────────────────────────────────────────────────────────────────
completed_bookings AS (
  -- PMS bookings
  SELECT
    bm.unified_booking_id,
    -- PATCH 1: Timezone-safe business_date
    (sd.actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date  AS business_date,
    bm.pms_property_id                                  AS property_id,
    bm.pms_property_name                                AS booking_property_name,
    bm.ota_source                                       AS channel,
    bm.room_type                                        AS ota_room_type,
    COALESCE(bm.total_amount_gross, 0)                  AS revenue_gross,
    COALESCE(bm.total_amount_net, 0)                    AS revenue_net,
    COALESCE(bm.nights, (bm.check_out_date - bm.check_in_date))  AS nights,
    bm.booking_status,
    bm.check_in_date,
    COALESCE(bm.booking_date, bm.created_at::date)      AS booking_date
  FROM public.bookings_mirror bm
  INNER JOIN stays_dedup sd ON sd.unified_booking_id = bm.unified_booking_id
  -- PATCH 2: Exclude both CANCELLED and NO_SHOW
  WHERE bm.booking_status NOT IN ('CANCELLED', 'NO_SHOW')

  UNION ALL

  -- Manual bookings
  SELECT
    mb.unified_booking_id,
    -- PATCH 1: Timezone-safe business_date
    (sd.actual_check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date  AS business_date,
    NULL::text                                          AS property_id,
    mb.manual_property_name                             AS booking_property_name,
    mb.source                                           AS channel,
    COALESCE(mb.sold_room_type, mb.room_type)           AS ota_room_type,
    COALESCE(mb.total_amount_gross, 0)                  AS revenue_gross,
    COALESCE(mb.total_amount_net, 0)                    AS revenue_net,
    COALESCE(mb.nights, (mb.check_out_date - mb.check_in_date))  AS nights,
    mb.booking_status,
    mb.check_in_date,
    COALESCE(mb.booking_date, mb.created_at::date)      AS booking_date
  FROM public.manual_bookings mb
  INNER JOIN stays_dedup sd ON sd.unified_booking_id = mb.unified_booking_id
  -- PATCH 2: Exclude both CANCELLED and NO_SHOW
  WHERE mb.booking_status NOT IN ('CANCELLED', 'NO_SHOW')
),

-- ────────────────────────────────────────────────────────────────────────────
-- CTE 3: Aggregate host cost per booking from supply segments
--
-- USES: SUM of all segments per booking (handles split supply correctly)
-- BONUS: Also picks first segment's property/room for display name
--
-- NOTE: We aggregate ALL segments regardless of their own
--   actual_check_in_at / actual_check_out_at status, because:
--   1. The booking-level completion is already enforced by stays_dedup
--   2. Segment-level checkout may not be backfilled for older data
--   3. All segments of a completed booking should be recognized together
-- ────────────────────────────────────────────────────────────────────────────
host_cost_per_booking AS (
  SELECT
    hss.unified_booking_id,
    SUM(hss.total_amount)                               AS host_cost_total,
    SUM(hss.nights)                                     AS host_nights,
    -- First segment's property/room (for display, ordered by stay date)
    (array_agg(hss.host_property_name ORDER BY hss.date_from)
       FILTER (WHERE hss.host_property_name IS NOT NULL))[1]  AS first_host_property,
    (array_agg(hss.host_room_type ORDER BY hss.date_from)
       FILTER (WHERE hss.host_room_type IS NOT NULL))[1]      AS first_host_room_type
  FROM public.host_supply_segments hss
  GROUP BY hss.unified_booking_id
),

-- ────────────────────────────────────────────────────────────────────────────
-- CTE 4: Enrich each booking with host cost + effective property/room names
--
-- PROPERTY NAME PRIORITY (SOT chain):
--   1. host_supply_segments.host_property_name — supply-side SOT
--   2. bookings_mirror.pms_property_name — demand-side fallback
--   3. 'Unknown' — last resort
--
-- ROOM TYPE PRIORITY:
--   1. host_supply_segments.host_room_type — supply-side SOT
--   2. bookings_mirror.room_type (OTA room type) — demand-side fallback
--   3. 'Unknown' — last resort
-- ────────────────────────────────────────────────────────────────────────────
enriched AS (
  SELECT
    cb.business_date,
    cb.unified_booking_id,
    cb.property_id,
    COALESCE(hc.first_host_property, cb.booking_property_name, 'Unknown')   AS property_name,
    cb.channel,
    COALESCE(hc.first_host_room_type, cb.ota_room_type, 'Unknown')         AS room_type,
    cb.revenue_gross,
    cb.revenue_net,
    COALESCE(hc.host_cost_total, 0)                                         AS host_cost,
    cb.nights,
    cb.check_in_date,
    cb.booking_date
  FROM completed_bookings cb
  LEFT JOIN host_cost_per_booking hc ON hc.unified_booking_id = cb.unified_booking_id
)

-- ────────────────────────────────────────────────────────────────────────────
-- FINAL SELECT: Aggregate by (business_date, property_name, channel, room_type)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  -- ── Grain Dimensions ──
  e.business_date,
  e.property_name,
  e.channel,
  e.room_type,

  -- ── Volume Metrics ──
  COUNT(DISTINCT e.unified_booking_id)                    AS bookings_count,
  COALESCE(SUM(e.nights), 0)                              AS nights,

  -- ── Revenue Metrics (Recognized at checkout) ──
  COALESCE(SUM(e.revenue_gross), 0)                       AS revenue_gross,
  COALESCE(SUM(e.revenue_net), 0)                         AS revenue_net,

  -- ── Host Cost (Attributed to checkout date) ──
  COALESCE(SUM(e.host_cost), 0)                           AS host_cost,

  -- ── Profit ──
  COALESCE(SUM(e.revenue_net), 0)
    - COALESCE(SUM(e.host_cost), 0)                       AS gross_profit,

  -- ── ADR (Revenue / Nights, NULL if insufficient nights) ──
  CASE
    WHEN SUM(e.nights) >= 3 THEN ROUND(SUM(e.revenue_net) / NULLIF(SUM(e.nights), 0), 0)
    ELSE NULL
  END                                                     AS adr,

  -- ── Margin % ((Revenue - Host Cost) / Revenue × 100) ──
  CASE
    WHEN SUM(e.revenue_net) > 0
    THEN ROUND(
      (SUM(e.revenue_net) - COALESCE(SUM(e.host_cost), 0))
      / SUM(e.revenue_net) * 100, 2
    )
    ELSE NULL
  END                                                     AS margin_pct

FROM enriched e
GROUP BY
  e.business_date,
  e.property_name,
  e.channel,
  e.room_type
;

-- ============================================================================
-- SECTION 2: VIEW METADATA
-- ============================================================================

COMMENT ON VIEW public.analytics_historical_daily_v IS
  'Analytics Historical Finance Layer (Sprint 2, Patched). '
  'Time key: (actual_check_out_at AT TIME ZONE Asia/Ho_Chi_Minh)::date = business_date. '
  'Grain: business_date × property_name × channel × room_type. '
  'Completion rule: actual_check_out_at IS NOT NULL AND status NOT IN (CANCELLED, NO_SHOW). '
  'Revenue and Host Cost share the same time bucket for correct margin. '
  'Timezone: all TIMESTAMPTZ→date use AT TIME ZONE Asia/Ho_Chi_Minh. '
  'Multi-tenant: no org_id (single-tenant); see header comments for upgrade path. '
  'Resolves R1 (time key mismatch) and R2 (revenue recognition error).';

-- ============================================================================
-- SECTION 3: RECOMMENDED INDEXES (ADDITIVE ONLY)
-- All CREATE INDEX IF NOT EXISTS — safe to re-run.
-- ============================================================================

-- 3.1 Stays: Support the INNER JOIN + NOT NULL filter + dedup ORDER BY
-- This is the most critical index for this view's performance.
CREATE INDEX IF NOT EXISTS idx_stays_analytics_checkout
  ON public.stays (unified_booking_id, actual_check_out_at DESC)
  WHERE actual_check_out_at IS NOT NULL;

-- 3.2 Bookings Mirror: Support status filter + join
-- PATCH 2: Updated partial index to exclude both CANCELLED and NO_SHOW
CREATE INDEX IF NOT EXISTS idx_bookings_mirror_analytics
  ON public.bookings_mirror (unified_booking_id, booking_status)
  WHERE booking_status NOT IN ('CANCELLED', 'NO_SHOW');

-- 3.3 Manual Bookings: Same pattern
CREATE INDEX IF NOT EXISTS idx_manual_bookings_analytics
  ON public.manual_bookings (unified_booking_id, booking_status)
  WHERE booking_status NOT IN ('CANCELLED', 'NO_SHOW');

-- 3.4 Host Supply Segments: Support SUM aggregation per booking
-- (idx_host_supply_segments_booking already exists from original migration,
--  but ensure the covering index for total_amount access)
CREATE INDEX IF NOT EXISTS idx_host_supply_segments_cost_agg
  ON public.host_supply_segments (unified_booking_id, total_amount, nights);
