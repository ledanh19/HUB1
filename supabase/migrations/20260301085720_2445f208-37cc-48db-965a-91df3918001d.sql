
-- Fix: Add CANCELLED to payment_requests status constraint
ALTER TABLE public.payment_requests 
  DROP CONSTRAINT IF EXISTS payment_requests_status_check;

ALTER TABLE public.payment_requests 
  ADD CONSTRAINT payment_requests_status_check 
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED'));
