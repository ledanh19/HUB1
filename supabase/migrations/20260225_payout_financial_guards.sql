-- ============================================
-- OTA PAYOUT FINANCIAL GUARDS
-- Migration: 20260225_payout_financial_guards.sql
--
-- NON-BREAKING: No column renames, no data deletion
-- ============================================

-- Add unique constraint to prevent duplicate bookings in same payout
-- This prevents the same booking from being added twice to the same payout
ALTER TABLE ota_payout_details
ADD CONSTRAINT uq_payout_detail_booking UNIQUE (payout_id, unified_booking_id);

-- Comment
COMMENT ON CONSTRAINT uq_payout_detail_booking ON ota_payout_details IS
'Prevent duplicate booking entries in the same payout. Each booking can only appear once per payout.';
