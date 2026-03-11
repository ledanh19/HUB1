
CREATE OR REPLACE VIEW public.v_no_show_reclass_gaps AS
SELECT
  p.id AS payout_id,
  d.unified_booking_id,
  d.expected_amount AS detail_amount,
  'MISSING_LEDGER' AS ledger_status
FROM public.ota_payout_details d
JOIN public.ota_payouts p ON p.id = d.payout_id
JOIN public.unified_bookings ub ON ub.unified_booking_id = d.unified_booking_id
LEFT JOIN public.ledger_entries le
  ON le.source_type = 'NO_SHOW_REVENUE'
  AND le.source_id = d.id
WHERE d.is_active = true
  AND p.is_voided = false
  AND ub.booking_status = 'NO_SHOW'
  AND le.id IS NULL;

CREATE OR REPLACE VIEW public.v_financial_integrity_summary AS
SELECT
  'payout_header_detail_mismatch' AS check_type,
  p.id AS entity_id,
  p.total_amount AS header_amount,
  COALESCE(SUM(d.expected_amount), 0) AS detail_sum,
  ABS(p.total_amount - COALESCE(SUM(d.expected_amount), 0)) AS diff
FROM public.ota_payouts p
LEFT JOIN public.ota_payout_details d ON d.payout_id = p.id AND d.is_active = true
WHERE p.is_voided = false
GROUP BY p.id, p.total_amount
HAVING ABS(p.total_amount - COALESCE(SUM(d.expected_amount), 0)) > 1;
