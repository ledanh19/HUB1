-- Fix SECURITY DEFINER view issue by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.partner_reference_summary;

CREATE VIEW public.partner_reference_summary
WITH (security_invoker = true)
AS
SELECT 
  p.id AS partner_id,
  p.partner_name,
  p.partner_status,
  COALESCE((SELECT COUNT(*) FROM host_supply_segments WHERE partner_id = p.id), 0) AS segment_count,
  COALESCE((SELECT COUNT(*) FROM host_payables WHERE partner_id = p.id), 0) AS payable_count,
  COALESCE((SELECT COUNT(*) FROM host_payments WHERE partner_id = p.id), 0) AS payment_count,
  COALESCE((SELECT COUNT(*) FROM host_deposits WHERE partner_id = p.id), 0) AS deposit_count,
  COALESCE((SELECT COUNT(*) FROM host_properties WHERE partner_id = p.id), 0) AS property_count,
  COALESCE((SELECT COUNT(*) FROM host_rooms WHERE partner_id = p.id), 0) AS room_count
FROM public.partners p;

GRANT SELECT ON public.partner_reference_summary TO authenticated;