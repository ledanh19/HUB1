
-- Fix unified_bookings với đúng column names
DROP VIEW IF EXISTS public.unified_bookings;

CREATE VIEW public.unified_bookings
WITH (security_invoker = true) AS
SELECT 
  'mirror'::text AS booking_type,
  unified_booking_id,
  guest_name,
  guest_phone,
  guest_email,
  room_type,
  check_in_date,
  check_out_date,
  nights,
  booking_status,
  payment_type,
  total_amount_gross,
  total_amount_net,
  ota_source AS source,
  customer_id,
  created_at,
  updated_at
FROM public.bookings_mirror
UNION ALL
SELECT 
  'manual'::text AS booking_type,
  unified_booking_id,
  guest_name,
  guest_phone,
  guest_email,
  room_type,
  check_in_date,
  check_out_date,
  nights,
  booking_status,
  payment_type,
  total_amount_gross,
  total_amount_net,
  source,
  customer_id,
  created_at,
  updated_at
FROM public.manual_bookings;

COMMENT ON VIEW public.unified_bookings IS 
'Unified view gom bookings_mirror + manual_bookings. SECURITY INVOKER.';
