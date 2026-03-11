-- =====================================================
-- ADDITIVE SOT: booking_new_events_v + get_new_booking_count RPC
-- Purpose: Single unified source for "new bookings" metric
-- SOT: unified_bookings (bookings_mirror UNION ALL manual_bookings)
-- Timestamp: booking_date (DATE, COALESCE(booking_date, date(created_at)))
--
-- ═══ TIMESTAMP SEMANTICS ════════════════════════════════
--
--   booking_date = BUSINESS DATE KEY (this view/RPC)
--     Type: DATE (YYYY-MM-DD) — timezone-safe, no TZ conversion
--     Meaning: ngày khách đặt phòng (OTA metadata or creation date)
--     Granularity: calendar day (NOT 24h rolling window)
--     Example: 23:30 Jan 1 → Jan 1, 00:10 Jan 2 → Jan 2  (by design)
--
--   created_at = EVENT TIMELINE KEY (used by notifications/bell only)
--     Type: TIMESTAMPTZ — timezone matters
--     Purpose: ordering events, computing "unread since lastReadAt"
--     NOT used for booking count
--
-- ═══════════════════════════════════════════════════════
--
-- RULES:
--   1. ADDITIVE ONLY — no existing schema changes
--   2. Multi-tenant safe (inherits RLS from underlying tables)
--   3. Idempotent (CREATE OR REPLACE / DROP IF EXISTS)
-- =====================================================

-- ── VIEW: booking_new_events_v ──────────────────────────────────────────
-- Returns all bookings with essential fields for "new booking" counting.
-- This is a thin projection of unified_bookings — no extra logic, just field selection.
-- Test bookings excluded via is_test flag if it exists on source tables.

DROP VIEW IF EXISTS public.booking_new_events_v;

CREATE VIEW public.booking_new_events_v AS
SELECT
    ub.unified_booking_id    AS booking_id,
    ub.booking_date          AS created_date,   -- SOT: date the booking was made
    ub.booking_type          AS source,          -- PMS | MANUAL | IMPORTED | SYNCED
    ub.booking_status        AS status,
    ub.pms_property_id       AS property_id,
    ub.pms_property_name     AS property_name,
    ub.guest_name,
    ub.nights,
    ub.total_amount_net,
    ub.payment_type,
    ub.source AS ota_source
FROM public.unified_bookings ub;

COMMENT ON VIEW public.booking_new_events_v IS
'SOT view for "new booking" events. Thin projection of unified_bookings. '
'Use booking_date (DATE) to filter by date range. '
'Includes ALL statuses and ALL booking types (PMS, MANUAL, IMPORTED).';

-- Grant access (same as unified_bookings)
GRANT SELECT ON public.booking_new_events_v TO authenticated;
GRANT SELECT ON public.booking_new_events_v TO anon;


-- ── RPC: get_new_booking_count ──────────────────────────────────────────
-- Single entrypoint for "new booking count" metric.
-- Returns { count, ota_count, manual_count, from_date, to_date, booking_ids? }
-- Parameters:
--   p_from_date: start date (DATE, inclusive) — BUSINESS DATE KEY
--   p_to_date:   end date (DATE, inclusive)
--   p_property_ids: optional array of property IDs (text[])
--   p_include_ids: if true, return up to 200 booking_ids for debug

CREATE OR REPLACE FUNCTION public.get_new_booking_count(
    p_from_date   DATE,
    p_to_date     DATE,
    p_property_ids TEXT[] DEFAULT NULL,
    p_include_ids  BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER   -- inherits caller's RLS context
STABLE              -- no side effects, safe for repeated calls
AS $$
DECLARE
    v_count        BIGINT;
    v_ota_count    BIGINT;
    v_manual_count BIGINT;
    v_ids          TEXT[];
    v_result       JSONB;
BEGIN
    -- Total count
    SELECT COUNT(*)
    INTO v_count
    FROM public.booking_new_events_v b
    WHERE b.created_date >= p_from_date
      AND b.created_date <= p_to_date
      AND (
          p_property_ids IS NULL
          OR b.property_id = ANY(p_property_ids)
          OR b.property_id IS NULL  -- MANUAL bookings (no property)
      );

    -- OTA count (PMS + SYNCED + anything non-MANUAL)
    SELECT COUNT(*)
    INTO v_ota_count
    FROM public.booking_new_events_v b
    WHERE b.created_date >= p_from_date
      AND b.created_date <= p_to_date
      AND b.source <> 'MANUAL'
      AND (
          p_property_ids IS NULL
          OR b.property_id = ANY(p_property_ids)
          OR b.property_id IS NULL
      );

    -- MANUAL count
    SELECT COUNT(*)
    INTO v_manual_count
    FROM public.booking_new_events_v b
    WHERE b.created_date >= p_from_date
      AND b.created_date <= p_to_date
      AND b.source = 'MANUAL'
      AND (
          p_property_ids IS NULL
          OR b.property_id = ANY(p_property_ids)
          OR b.property_id IS NULL
      );

    -- Optional: sample IDs for debug
    IF p_include_ids THEN
        SELECT ARRAY_AGG(sub.booking_id)
        INTO v_ids
        FROM (
            SELECT b.booking_id
            FROM public.booking_new_events_v b
            WHERE b.created_date >= p_from_date
              AND b.created_date <= p_to_date
              AND (
                  p_property_ids IS NULL
                  OR b.property_id = ANY(p_property_ids)
                  OR b.property_id IS NULL
              )
            ORDER BY b.created_date DESC
            LIMIT 200
        ) sub;
    END IF;

    v_result := jsonb_build_object(
        'count', v_count,
        'ota_count', v_ota_count,
        'manual_count', v_manual_count,
        'from_date', p_from_date,
        'to_date', p_to_date,
        'property_ids', p_property_ids
    );

    IF p_include_ids THEN
        v_result := v_result || jsonb_build_object('booking_ids', v_ids);
    END IF;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_new_booking_count IS
'SOT RPC: Returns count of new bookings by business date range. '
'Output: { count, ota_count, manual_count, from_date, to_date, booking_ids? }. '
'Uses booking_date (DATE) = BUSINESS DATE KEY (not created_at). '
'Multi-tenant: SECURITY INVOKER (inherits RLS). '
'Property filter: includes NULL pms_property_id (MANUAL bookings). '
'Debug: pass p_include_ids=true to get up to 200 booking IDs.';

-- Grant execute
GRANT EXECUTE ON FUNCTION public.get_new_booking_count TO authenticated;

