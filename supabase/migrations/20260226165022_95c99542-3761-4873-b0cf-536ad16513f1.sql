
-- Create is_period_locked function that was missing
-- This checks if a given date falls within a locked accounting period
CREATE OR REPLACE FUNCTION public.is_period_locked(p_org_id uuid, p_date text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE org_id = p_org_id
      AND is_locked = true
      AND p_date::date BETWEEN period_start::date AND period_end::date
  );
END;
$$;
