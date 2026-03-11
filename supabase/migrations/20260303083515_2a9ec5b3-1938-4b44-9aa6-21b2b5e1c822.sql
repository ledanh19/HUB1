-- booking_new_events_v + get_new_booking_count RPC

DROP VIEW IF EXISTS public.booking_new_events_v;

CREATE VIEW public.booking_new_events_v AS
SELECT
    ub.unified_booking_id    AS booking_id,
    ub.booking_date          AS created_date,
    ub.booking_type          AS source,
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

GRANT SELECT ON public.booking_new_events_v TO authenticated;
GRANT SELECT ON public.booking_new_events_v TO anon;

CREATE OR REPLACE FUNCTION public.get_new_booking_count(
    p_from_date   DATE,
    p_to_date     DATE,
    p_property_ids TEXT[] DEFAULT NULL,
    p_include_ids  BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
    v_count        BIGINT;
    v_ota_count    BIGINT;
    v_manual_count BIGINT;
    v_ids          TEXT[];
    v_result       JSONB;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.booking_new_events_v b
    WHERE b.created_date >= p_from_date
      AND b.created_date <= p_to_date
      AND (p_property_ids IS NULL OR b.property_id = ANY(p_property_ids) OR b.property_id IS NULL);

    SELECT COUNT(*) INTO v_ota_count
    FROM public.booking_new_events_v b
    WHERE b.created_date >= p_from_date
      AND b.created_date <= p_to_date
      AND b.source <> 'MANUAL'
      AND (p_property_ids IS NULL OR b.property_id = ANY(p_property_ids) OR b.property_id IS NULL);

    SELECT COUNT(*) INTO v_manual_count
    FROM public.booking_new_events_v b
    WHERE b.created_date >= p_from_date
      AND b.created_date <= p_to_date
      AND b.source = 'MANUAL'
      AND (p_property_ids IS NULL OR b.property_id = ANY(p_property_ids) OR b.property_id IS NULL);

    IF p_include_ids THEN
        SELECT ARRAY_AGG(sub.booking_id) INTO v_ids
        FROM (
            SELECT b.booking_id
            FROM public.booking_new_events_v b
            WHERE b.created_date >= p_from_date
              AND b.created_date <= p_to_date
              AND (p_property_ids IS NULL OR b.property_id = ANY(p_property_ids) OR b.property_id IS NULL)
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
'SOT RPC: Returns count of new bookings by business date range.';

GRANT EXECUTE ON FUNCTION public.get_new_booking_count TO authenticated;