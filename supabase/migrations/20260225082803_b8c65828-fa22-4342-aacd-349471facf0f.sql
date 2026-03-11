
ALTER TABLE ota_payout_details
ADD CONSTRAINT uq_payout_detail_booking UNIQUE (payout_id, unified_booking_id);

COMMENT ON CONSTRAINT uq_payout_detail_booking ON ota_payout_details IS
'Prevent duplicate booking entries in the same payout. Each booking can only appear once per payout.';
