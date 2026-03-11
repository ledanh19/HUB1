
-- Backfill ota_payout_details for IMPORTED bookings that have confirmed overrides
-- Updates expected_amount, actual_amount, final_amount from booking_amount_overrides
UPDATE ota_payout_details d
SET 
  expected_amount = o.amount,
  actual_amount = o.amount,
  final_amount = o.amount - COALESCE(d.deduction_amount, 0)
FROM booking_amount_overrides o
JOIN unified_bookings ub ON ub.unified_booking_id = o.unified_booking_id
WHERE d.unified_booking_id = o.unified_booking_id
  AND ub.booking_type = 'IMPORTED'
  AND d.expected_amount = 0
  AND o.amount > 0;

-- Recalculate payout totals for affected payouts
UPDATE ota_payouts p
SET 
  gross_amount = sub.total_expected,
  total_amount = sub.total_final,
  net_payout_amount = sub.total_final + COALESCE(p.deduction_total, 0)
FROM (
  SELECT 
    d.payout_id,
    SUM(d.expected_amount) as total_expected,
    SUM(COALESCE(d.final_amount, d.expected_amount)) as total_final
  FROM ota_payout_details d
  WHERE d.payout_id IN (
    SELECT DISTINCT d2.payout_id 
    FROM ota_payout_details d2
    JOIN unified_bookings ub ON ub.unified_booking_id = d2.unified_booking_id
    JOIN booking_amount_overrides o ON o.unified_booking_id = d2.unified_booking_id
    WHERE ub.booking_type = 'IMPORTED'
  )
  GROUP BY d.payout_id
) sub
WHERE p.id = sub.payout_id;
