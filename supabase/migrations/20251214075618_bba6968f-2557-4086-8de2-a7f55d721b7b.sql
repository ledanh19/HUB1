-- Fix security warnings

-- 1. Drop the view and recreate with SECURITY INVOKER (default, no SECURITY DEFINER)
DROP VIEW IF EXISTS public.unified_bookings;

CREATE VIEW public.unified_bookings 
WITH (security_invoker = true)
AS
SELECT 
  unified_booking_id,
  'PMS' as booking_type,
  ota_source as source,
  guest_name,
  guest_phone,
  guest_email,
  check_in_date,
  check_out_date,
  nights,
  room_type,
  booking_status,
  payment_type,
  total_amount_gross,
  total_amount_net,
  customer_id,
  created_at,
  updated_at
FROM public.bookings_mirror
UNION ALL
SELECT 
  unified_booking_id,
  'MANUAL' as booking_type,
  source,
  guest_name,
  guest_phone,
  guest_email,
  check_in_date,
  check_out_date,
  nights,
  room_type,
  booking_status,
  payment_type,
  total_amount_gross,
  total_amount_net,
  customer_id,
  created_at,
  updated_at
FROM public.manual_bookings;

-- 2. Fix update_updated_at_column function with proper search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;