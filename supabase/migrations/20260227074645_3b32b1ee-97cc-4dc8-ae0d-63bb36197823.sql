
-- Fix Yi-Chieh payout detail: 6,764,128 → 5,570,560 (match unified_bookings.total_amount_net SOT)
UPDATE public.ota_payout_details
SET expected_amount = 5570560,
    actual_amount = 5570560,
    final_amount = 5570560
WHERE id = 'd4fb2cc4-1f0e-4325-9de4-e3615ca4590d'
  AND unified_booking_id = 'channex_bfaca7fb-c0a8-439f-aac4-f963a8024b83';
