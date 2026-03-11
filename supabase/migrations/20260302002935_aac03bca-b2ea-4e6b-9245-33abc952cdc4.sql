
-- ============================================================
-- confirm_room_rounding_secure
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_room_rounding_secure(
  p_booking_id  TEXT,
  p_amount      INTEGER,
  p_reason      TEXT DEFAULT 'ROUNDING_WRITE_OFF'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_tolerance      INTEGER := 1000;
  v_booking_exists BOOLEAN;
  v_existing_id    UUID;
  v_room_expected  NUMERIC;
  v_room_collected NUMERIC;
  v_room_remaining NUMERIC;
  v_collect_id     UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF p_amount <= 0 OR p_amount > v_tolerance THEN
    RAISE EXCEPTION 'AMOUNT_OUT_OF_TOLERANCE: amount=% must be 1..%', p_amount, v_tolerance;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM bookings_mirror WHERE unified_booking_id = p_booking_id
    UNION ALL
    SELECT 1 FROM manual_bookings WHERE unified_booking_id = p_booking_id
  ) INTO v_booking_exists;

  IF NOT v_booking_exists THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: %', p_booking_id;
  END IF;

  SELECT id INTO v_existing_id
  FROM hotel_collects
  WHERE unified_booking_id = p_booking_id
    AND related_type = 'ROOM'
    AND note = 'ROUNDING_WRITE_OFF'
    AND (status IS NULL OR status != 'VOIDED')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'collect_id', v_existing_id,
      'idempotent', true
    );
  END IF;

  SELECT COALESCE(total_amount_net, 0) INTO v_room_expected
  FROM (
    SELECT total_amount_net FROM bookings_mirror WHERE unified_booking_id = p_booking_id
    UNION ALL
    SELECT total_amount_net FROM manual_bookings WHERE unified_booking_id = p_booking_id
  ) sub
  LIMIT 1;

  SELECT COALESCE(SUM(amount_collected), 0) INTO v_room_collected
  FROM hotel_collects
  WHERE unified_booking_id = p_booking_id
    AND related_type = 'ROOM'
    AND (status IS NULL OR status != 'VOIDED');

  v_room_remaining := v_room_expected - v_room_collected;

  IF ABS(v_room_remaining - p_amount) > 1 THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH: expected_remaining=%, provided=%, diff=%',
      v_room_remaining, p_amount, ABS(v_room_remaining - p_amount);
  END IF;

  IF v_room_remaining <= 0 THEN
    RAISE EXCEPTION 'ALREADY_PAID: remaining=% — booking is already fully paid, no rounding needed',
      v_room_remaining;
  END IF;

  IF v_room_remaining > v_tolerance THEN
    RAISE EXCEPTION 'REMAINING_OVER_TOLERANCE: remaining=% exceeds tolerance=% — this is not a rounding difference',
      v_room_remaining, v_tolerance;
  END IF;

  INSERT INTO hotel_collects (
    unified_booking_id,
    amount_collected,
    payment_method,
    payee_type,
    payer_type,
    related_type,
    collection_type,
    note,
    status,
    collected_at,
    collected_by
  ) VALUES (
    p_booking_id,
    v_room_remaining,
    'OTHER',
    'ROOMRISE',
    'SYSTEM',
    'ROOM',
    'ROOM',
    'ROUNDING_WRITE_OFF',
    'COLLECTED',
    now(),
    v_user_id
  )
  RETURNING id INTO v_collect_id;

  INSERT INTO audit_logs (
    event_time,
    user_id,
    action,
    entity,
    entity_id,
    after_data
  ) VALUES (
    now(),
    v_user_id,
    'BOOKING_ROUNDING_APPLIED',
    'unified_bookings',
    p_booking_id,
    jsonb_build_object(
      'rounding_amount', v_room_remaining,
      'room_expected', v_room_expected,
      'room_collected_before', v_room_collected,
      'room_remaining_before', v_room_remaining,
      'tolerance', v_tolerance,
      'collect_id', v_collect_id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'collect_id', v_collect_id,
    'idempotent', false,
    'rounding_amount', v_room_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_room_rounding_secure(TEXT, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION public.confirm_room_rounding_secure IS
  'Marks a booking as paid by inserting a rounding write-off hotel_collects record. '
  'Guards: amount ≤ 1000 VND, booking exists, not already applied (idempotent), '
  'computed remaining matches provided amount. No revenue modification. No cashflow entry.';
