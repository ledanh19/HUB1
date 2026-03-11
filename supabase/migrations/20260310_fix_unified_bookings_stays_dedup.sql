-- ============================================================
-- FIX: DUPLICATE BOOKINGS IN BOOKING CENTER
-- ============================================================
-- Date: 2026-03-10
-- Root Cause: unified_bookings VIEW joins stays via plain LEFT JOIN
--   which causes row multiplication when stays has >1 row per booking.
--   The stays table has NO unique constraint on unified_booking_id.
--
-- Fix: Replace bare LEFT JOIN stays with LEFT JOIN LATERAL ... LIMIT 1
--   pattern (already used for host_supply_segments in the same view).
--   Applied to BOTH branches of the UNION ALL.
--
-- Sort logic for "latest stay":
--   1. updated_at DESC NULLS LAST  (most recently modified)
--   2. created_at DESC NULLS LAST  (tiebreaker: most recently created)
--   3. id DESC                      (final deterministic tiebreaker)
--
-- Impact: unified_bookings view consumers get exactly 1 row per booking.
--   No column additions/removals — output shape is identical.
--
-- Rollback:
--   Re-run the previous CREATE OR REPLACE VIEW from migration
--   20260304204817_7f14a395-77b6-40ec-bc3c-1354ddb0cd68.sql
-- ============================================================

CREATE OR REPLACE VIEW public.unified_bookings AS

-- ── Branch 1: bookings_mirror (PMS / SYNCED / IMPORTED) ──
SELECT bm.unified_booking_id,
    COALESCE(bm.booking_type, 'PMS'::text) AS booking_type,
    bm.created_at,
    COALESCE(bm.booking_date, date(bm.created_at)) AS booking_date,
    bm.check_in_date,
    bm.check_out_date,
    COALESCE(bm.nights, bm.check_out_date - bm.check_in_date) AS nights,
    bm.guest_name,
    bm.guest_phone,
    bm.guest_email,
    bm.customer_id,
    COALESCE(bm.nationality, c.nationality) AS nationality,
    bm.ota_source AS source,
    bm.pms_property_name,
    bm.pms_property_id,
    bm.ota_booking_code,
    hss.host_property_name,
    bm.room_type AS ota_room_type_sold,
    hss.host_room_type,
    hss.room_code AS host_room_code,
    hss.host_room_id,
    bm.payment_type,
    bm.total_amount_gross,
    bm.total_amount_net,
    bm.commission_rate,
    bm.commission_amount,
    bm.booking_status,
    s.stay_status,
    s.host_cost,
    bm.updated_at
   FROM bookings_mirror bm
     LEFT JOIN customers c ON bm.customer_id = c.id
     -- FIX: Use LATERAL + LIMIT 1 to prevent row multiplication from stays
     LEFT JOIN LATERAL (
       SELECT st.stay_status,
              st.host_cost
         FROM stays st
        WHERE st.unified_booking_id = bm.unified_booking_id
        ORDER BY st.updated_at DESC NULLS LAST,
                 st.created_at DESC NULLS LAST,
                 st.id DESC
        LIMIT 1
     ) s ON true
     LEFT JOIN LATERAL ( SELECT seg.host_property_name,
            seg.host_room_type,
            seg.room_code,
            seg.host_room_id
           FROM host_supply_segments seg
          WHERE seg.unified_booking_id = bm.unified_booking_id
          ORDER BY seg.date_from
         LIMIT 1) hss ON true

UNION ALL

-- ── Branch 2: manual_bookings ──
 SELECT mb.unified_booking_id,
    'MANUAL'::text AS booking_type,
    mb.created_at,
    COALESCE(mb.booking_date, date(mb.created_at)) AS booking_date,
    mb.check_in_date,
    mb.check_out_date,
    COALESCE(mb.nights, mb.check_out_date - mb.check_in_date) AS nights,
    mb.guest_name,
    mb.guest_phone,
    mb.guest_email,
    mb.customer_id,
    c.nationality,
    mb.source,
    mb.manual_property_name AS pms_property_name,
    NULL::text AS pms_property_id,
    NULL::text AS ota_booking_code,
    hss.host_property_name,
    COALESCE(mb.sold_room_type, mb.room_type) AS ota_room_type_sold,
    hss.host_room_type,
    hss.room_code AS host_room_code,
    hss.host_room_id,
    mb.payment_type,
    mb.total_amount_gross,
    mb.total_amount_net,
    NULL::numeric AS commission_rate,
    NULL::numeric AS commission_amount,
    mb.booking_status,
    s.stay_status,
    s.host_cost,
    mb.updated_at
   FROM manual_bookings mb
     LEFT JOIN customers c ON mb.customer_id = c.id
     -- FIX: Use LATERAL + LIMIT 1 to prevent row multiplication from stays
     LEFT JOIN LATERAL (
       SELECT st.stay_status,
              st.host_cost
         FROM stays st
        WHERE st.unified_booking_id = mb.unified_booking_id
        ORDER BY st.updated_at DESC NULLS LAST,
                 st.created_at DESC NULLS LAST,
                 st.id DESC
        LIMIT 1
     ) s ON true
     LEFT JOIN LATERAL ( SELECT seg.host_property_name,
            seg.host_room_type,
            seg.room_code,
            seg.host_room_id
           FROM host_supply_segments seg
          WHERE seg.unified_booking_id = mb.unified_booking_id
          ORDER BY seg.date_from
         LIMIT 1) hss ON true;
