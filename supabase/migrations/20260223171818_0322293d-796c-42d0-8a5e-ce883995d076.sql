-- Backfill ota_property_id for existing payouts that have booking details
-- Use the most common ota_property_id from linked bookings
UPDATE public.ota_payouts p
SET ota_property_id = sub.most_common_ota_property_id
FROM (
  SELECT 
    pd.payout_id,
    mode() WITHIN GROUP (ORDER BY bm.ota_property_id) AS most_common_ota_property_id
  FROM public.ota_payout_details pd
  JOIN public.bookings_mirror bm ON bm.unified_booking_id = pd.unified_booking_id
  WHERE bm.ota_property_id IS NOT NULL
  GROUP BY pd.payout_id
) sub
WHERE p.id = sub.payout_id
  AND p.ota_property_id IS NULL;