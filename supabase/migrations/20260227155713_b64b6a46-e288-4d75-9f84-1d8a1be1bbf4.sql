-- Drop legacy overload (p_total_amount as 3rd param)
DROP FUNCTION IF EXISTS public.create_multi_payout_cashin_atomic(
  UUID[], NUMERIC[], NUMERIC, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
);

-- Drop intermediate version (no p_total_amount)
DROP FUNCTION IF EXISTS public.create_multi_payout_cashin_atomic(
  UUID[], NUMERIC[], UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
);

-- Re-grant on SOT function
GRANT EXECUTE ON FUNCTION public.create_multi_payout_cashin_atomic TO authenticated;