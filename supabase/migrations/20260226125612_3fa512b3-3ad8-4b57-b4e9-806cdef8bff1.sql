
-- Remove mismatched payout-booking allocations
-- These bookings have different ota_property_id than their assigned payout
DELETE FROM public.ota_payout_details
WHERE id IN (
  SELECT pd.id
  FROM ota_payout_details pd
  JOIN bookings_mirror bm ON bm.unified_booking_id = pd.unified_booking_id
  JOIN ota_payouts op ON op.id = pd.payout_id
  WHERE bm.ota_property_id != op.ota_property_id
);
