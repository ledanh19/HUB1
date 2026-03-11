-- FIX: Payment Request requested_by

ALTER TABLE public.payment_requests
  ALTER COLUMN requested_by SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.trg_payment_requests_set_requested_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.requested_by := auth.uid();
  END IF;
  
  IF NEW.requested_at IS NULL THEN
    NEW.requested_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_payment_requests_set_requested_by IS
  'Safety trigger: force requested_by = auth.uid() on INSERT. '
  'Prevents client-side spoofing or stale session bugs.';

DROP TRIGGER IF EXISTS trg_payment_requests_force_requested_by
  ON public.payment_requests;

CREATE TRIGGER trg_payment_requests_force_requested_by
  BEFORE INSERT ON public.payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_payment_requests_set_requested_by();