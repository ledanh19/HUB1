
-- Fix security definer view by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.unified_bookings_with_final_amount;

CREATE VIEW public.unified_bookings_with_final_amount 
WITH (security_invoker = true)
AS
SELECT 
  ub.*,
  CASE
    WHEN ub.booking_status IN ('CANCELLED', 'NO_SHOW') THEN 0
    WHEN bao.amount IS NOT NULL THEN bao.amount
    WHEN ub.booking_type = 'IMPORTED' THEN 0
    ELSE COALESCE(ub.total_amount_net, 0)
  END AS final_amount
FROM public.unified_bookings ub
LEFT JOIN public.booking_amount_overrides bao 
  ON bao.unified_booking_id = ub.unified_booking_id;

COMMENT ON VIEW public.unified_bookings_with_final_amount IS 'View that computes final_amount for each booking applying override/cancelled/imported logic. Uses SECURITY INVOKER for proper RLS.';
