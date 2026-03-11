-- Migrate legacy deduction_type values to 3 payout-level directions
-- DECREASE: OTA trừ thêm tiền
-- INCREASE: OTA bù thêm tiền
-- CORRECTION: Điều chỉnh kế toán

-- Map negative types → DECREASE
UPDATE ota_payout_deductions
SET deduction_type = 'DECREASE',
    updated_at = now()
WHERE deduction_type IN (
  'PENALTY', 'NO_SHOW', 'OVERBOOKING',
  'OTA_FEE', 'CANCELLATION', 'OTA_COMMISSION', 'DISPUTE'
);

-- Map positive types → INCREASE
UPDATE ota_payout_deductions
SET deduction_type = 'INCREASE',
    updated_at = now()
WHERE deduction_type IN ('OTA_CREDIT', 'BONUS');

-- Map correction/other → CORRECTION
UPDATE ota_payout_deductions
SET deduction_type = 'CORRECTION',
    updated_at = now()
WHERE deduction_type IN ('CORRECTION', 'OTHER');
