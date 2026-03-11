-- ============================================
-- OTA PAYOUT: NORMALIZE LEGACY DEDUCTIONS TO SIGNED MODEL
-- Migration: 20260225_normalize_ota_payout_deductions_signed.sql
--
-- PURPOSE: Convert all historical deductions stored as positive amounts
-- into their correct signed (negative) values. After this migration,
-- NO fallback type-based negation is needed in application code.
--
-- RULE: For known legacy negative types, if amount > 0, set amount = -ABS(amount)
-- ============================================

-- 1) Preview: count rows that will be flipped
-- SELECT count(*) AS will_flip
-- FROM ota_payout_deductions
-- WHERE amount > 0
--   AND deduction_type IN ('PENALTY','NO_SHOW','OVERBOOKING','DISPUTE','OTA_FEE','CANCELLATION','OTHER');

-- 2) Normalize: flip positive legacy deductions to negative
UPDATE ota_payout_deductions
SET amount = -ABS(amount),
    updated_at = now()
WHERE amount > 0
  AND deduction_type IN (
    'PENALTY',
    'NO_SHOW',
    'OVERBOOKING',
    'DISPUTE',
    'OTA_FEE',
    'CANCELLATION',
    'OTHER'
  );

-- 3) Recalculate all payout totals to match new signed amounts
-- This updates gross_amount, deduction_total, net_payout_amount, total_amount
-- for every payout that has deductions
UPDATE ota_payouts p
SET
  deduction_total = sub.adj_total,
  net_payout_amount = sub.gross + sub.adj_total,
  total_amount = sub.gross + sub.adj_total
FROM (
  SELECT
    d.payout_id,
    COALESCE(det.gross, 0) AS gross,
    SUM(d.amount) AS adj_total
  FROM ota_payout_deductions d
  LEFT JOIN (
    SELECT payout_id, SUM(expected_amount) AS gross
    FROM ota_payout_details
    GROUP BY payout_id
  ) det ON det.payout_id = d.payout_id
  GROUP BY d.payout_id, det.gross
) sub
WHERE p.id = sub.payout_id;
