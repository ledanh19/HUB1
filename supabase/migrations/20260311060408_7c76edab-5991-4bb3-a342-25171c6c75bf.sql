
-- ============================================================
-- ONE-TIME REPAIR: Fix bank fee distribution for 3 batch cash-in sessions
-- ============================================================
-- Root cause: Frontend distributed bank fees proportionally by allocation amount,
-- but waterfall allocation puts entire shortfall on last payout.
-- Fix: Move full bank fee (2200 VND each batch) to the payout with the shortfall,
-- remove bank fee from payouts with zero shortfall.
-- ============================================================

-- Step 1: Update PARTIAL payouts — set bank fee to full 2200 (the actual shortfall)
UPDATE ota_payout_reconciliation_items SET amount = 2200, note = 'Phí chuyển khoản NH (repair: shortfall-based)'
WHERE id = 'fb3a8137-f495-4f1d-8a0d-5cb2e438c822'; -- payout 22005c82, was 1846

UPDATE ota_payout_reconciliation_items SET amount = 2200, note = 'Phí chuyển khoản NH (repair: shortfall-based)'
WHERE id = 'cb9cab9c-f657-4e8b-940e-57e4470cc754'; -- payout a8c5dd95, was 1192

UPDATE ota_payout_reconciliation_items SET amount = 2200, note = 'Phí chuyển khoản NH (repair: shortfall-based)'
WHERE id = '5eba9178-807d-4cab-b81f-33b18d120732'; -- payout 3eb1685f, was 582

-- Step 2: Delete bank fee from RECEIVED payouts with zero shortfall
DELETE FROM ota_payout_reconciliation_items
WHERE id = '788b3718-89fc-46eb-98ec-06a61d8d2bfd'; -- payout 1dedcf31, was 354

DELETE FROM ota_payout_reconciliation_items
WHERE id = '4a04f2a4-e6a5-4819-8e78-5df89a9683aa'; -- payout c2eba736, was 1008

DELETE FROM ota_payout_reconciliation_items
WHERE id = '4baf2dba-5781-4795-9ae3-3a057db2134c'; -- payout 2dc6d9b9, was 1618

-- Step 3: Recalculate status for all 6 payouts
SELECT recalculate_ota_payout_status_v2('22005c82-64e5-451d-837e-c02e5145c598'::uuid);
SELECT recalculate_ota_payout_status_v2('1dedcf31-e12d-4625-a9db-4f714e506836'::uuid);
SELECT recalculate_ota_payout_status_v2('a8c5dd95-884d-4277-97e3-5c722ec31306'::uuid);
SELECT recalculate_ota_payout_status_v2('c2eba736-7c01-4fa2-b0cd-91edf9e8ce71'::uuid);
SELECT recalculate_ota_payout_status_v2('3eb1685f-2a1c-4f5f-8912-50e007cd2a9a'::uuid);
SELECT recalculate_ota_payout_status_v2('2dc6d9b9-6595-4723-ab19-28a7ddc8682d'::uuid);

-- Step 4: Audit log
INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
VALUES ('DATA_REPAIR_BANK_FEE_DISTRIBUTION', 'ota_payout_reconciliation_items', 'batch_repair_3_sessions', NULL,
  jsonb_build_object(
    'reason', 'Bank fee was distributed proportionally by allocation amount instead of by shortfall. Fixed 3 PARTIAL payouts to RECEIVED.',
    'partial_payouts_fixed', ARRAY['22005c82-64e5-451d-837e-c02e5145c598','a8c5dd95-884d-4277-97e3-5c722ec31306','3eb1685f-2a1c-4f5f-8912-50e007cd2a9a'],
    'received_payouts_cleaned', ARRAY['1dedcf31-e12d-4625-a9db-4f714e506836','c2eba736-7c01-4fa2-b0cd-91edf9e8ce71','2dc6d9b9-6595-4723-ab19-28a7ddc8682d'],
    'bank_fee_per_batch', 2200,
    'repair_date', now()
  ));
