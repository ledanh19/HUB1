-- Drop the existing function with correct signature
DROP FUNCTION IF EXISTS public.get_default_cash_account_for_collection(TEXT, UUID);

-- Recreate with single parameter
CREATE OR REPLACE FUNCTION public.get_default_cash_account_for_collection(
  p_canonical_payment TEXT DEFAULT 'BANK_TRANSFER'
) RETURNS TABLE (
  id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  bank_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ca.id,
    ca.account_code,
    ca.account_name,
    ca.account_type,
    ca.bank_name
  FROM cash_accounts ca
  WHERE ca.is_default = true 
    AND ca.is_archived = false 
    AND ca.is_active = true
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      ca.id,
      ca.account_code,
      ca.account_name,
      ca.account_type,
      ca.bank_name
    FROM cash_accounts ca
    WHERE ca.is_archived = false 
      AND ca.is_active = true
    ORDER BY ca.created_at ASC
    LIMIT 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_default_cash_account_for_collection(TEXT) TO authenticated;