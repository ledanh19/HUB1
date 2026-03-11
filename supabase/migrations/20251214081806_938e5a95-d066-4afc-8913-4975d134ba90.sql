
-- Recreate unified_payments with security_invoker
DROP VIEW IF EXISTS public.unified_payments;

CREATE VIEW public.unified_payments 
WITH (security_invoker = true) AS

-- 1) Hotel Collects (ROOM payments)
SELECT 
  hc.id AS unified_payment_id,
  hc.unified_booking_id,
  'HOTEL_COLLECT'::TEXT AS payment_channel,
  hc.payer_type,
  hc.payee_type,
  hc.related_type,
  hc.related_id,
  hc.amount_collected AS amount,
  'VND'::TEXT AS currency,
  hc.collected_at AS received_at,
  'hotel_collects'::TEXT AS source_table,
  hc.id::TEXT AS source_id,
  hc.payment_method,
  hc.note,
  hc.receipt,
  hc.collected_by AS processed_by
FROM public.hotel_collects hc

UNION ALL

-- 2) Service Payments (SERVICE payments)
SELECT 
  sp.id AS unified_payment_id,
  so.unified_booking_id,
  'SERVICE_COLLECT'::TEXT AS payment_channel,
  sp.payer_type,
  sp.payee_type,
  'SERVICE'::TEXT AS related_type,
  sp.service_order_id::TEXT AS related_id,
  sp.amount_collected AS amount,
  'VND'::TEXT AS currency,
  sp.collected_at AS received_at,
  'service_payments'::TEXT AS source_table,
  sp.id::TEXT AS source_id,
  sp.payment_method,
  NULL::TEXT AS note,
  sp.receipt,
  sp.collected_by AS processed_by
FROM public.service_payments sp
LEFT JOIN public.service_orders so ON sp.service_order_id = so.id

UNION ALL

-- 3) OTA Payouts Received (OTA_COLLECT)
SELECT 
  op.id AS unified_payment_id,
  NULL::TEXT AS unified_booking_id,
  'OTA_COLLECT'::TEXT AS payment_channel,
  'OTA'::TEXT AS payer_type,
  'ROOMRISE'::TEXT AS payee_type,
  'ROOM'::TEXT AS related_type,
  NULL::TEXT AS related_id,
  op.total_amount AS amount,
  'VND'::TEXT AS currency,
  op.reconciled_at AS received_at,
  'ota_payouts'::TEXT AS source_table,
  op.id::TEXT AS source_id,
  'BANK_TRANSFER'::TEXT AS payment_method,
  op.note,
  op.bank_reference AS receipt,
  op.reconciled_by AS processed_by
FROM public.ota_payouts op
WHERE op.status = 'RECEIVED';

COMMENT ON VIEW public.unified_payments IS 
'Unified view gom payments. SECURITY INVOKER enabled.';
