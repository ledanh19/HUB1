
-- Add GUEST_REFUND to payment_requests payment_type CHECK constraint
ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_payment_type_check;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_payment_type_check 
  CHECK (payment_type = ANY (ARRAY[
    'HOST_PAYMENT'::text, 'SERVICE_PARTNER_PAYMENT'::text, 'INTERNAL_EXPENSE'::text, 
    'OTA_COMMISSION'::text, 'HOST_DEPOSIT'::text, 'HOST_PREPAID'::text, 
    'HOST_DEPOSIT_REFUND'::text, 'HOST_PREPAID_REFUND'::text,
    'GUEST_REFUND'::text
  ]));
