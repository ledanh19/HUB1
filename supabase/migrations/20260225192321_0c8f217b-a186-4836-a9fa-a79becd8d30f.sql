-- One-time data fix: Update booking EXP-2392435872 status to CANCELLED
-- Evidence: Channex Live Feed shows Cancellation event for Jonathan Lewis
-- Revision ID from Channex UI: 69f34a40-c2da-4ae0-a2dc-0bffbe5a8148
UPDATE bookings_mirror 
SET booking_status = 'CANCELLED', 
    channex_status = 'cancelled',
    updated_at = now(),
    channex_revision_id = '69f34a40-c2da-4ae0-a2dc-0bffbe5a8148'
WHERE ota_booking_code = 'EXP-2392435872' 
  AND booking_status = 'CONFIRMED';

-- Also record the change in booking_changes for audit trail
INSERT INTO booking_changes (unified_booking_id, pms_booking_id, change_source, change_type, changed_fields, before_data, after_data, source_updated_at)
SELECT 
  unified_booking_id,
  pms_booking_id,
  'CHANNEX_SYNC',
  'STATUS_CHANGE',
  '["booking_status"]'::jsonb,
  '{"booking_status": "CONFIRMED"}'::jsonb,
  '{"booking_status": "CANCELLED"}'::jsonb,
  now()
FROM bookings_mirror
WHERE ota_booking_code = 'EXP-2392435872';