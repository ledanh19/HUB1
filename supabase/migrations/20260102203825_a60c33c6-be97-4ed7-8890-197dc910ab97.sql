-- Security hardening: make stats view invoker-rights and set immutable search_path on functions

BEGIN;

-- 1) Views should run with invoker rights to respect RLS of the querying user
DO $$
BEGIN
  -- Postgres 15+ supports security_invoker view option
  EXECUTE 'ALTER VIEW public.push_delivery_stats SET (security_invoker = true)';
EXCEPTION
  WHEN undefined_object THEN
    -- View might not exist in some environments
    NULL;
  WHEN syntax_error_or_access_rule_violation THEN
    -- If option unsupported, leave as-is (better than breaking migration)
    NULL;
END;
$$;

-- 2) Functions: lock search_path to prevent hijacking via malicious objects
CREATE OR REPLACE FUNCTION public.can_refund_collection(p_collection_id uuid)
RETURNS TABLE(can_refund boolean, max_refund_amount numeric, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_collection RECORD;
  v_net_amount DECIMAL;
  v_refund_total DECIMAL;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  SELECT * INTO v_collection FROM public.hotel_collects WHERE id = p_collection_id;

  IF v_collection IS NULL THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Collection not found'::TEXT;
    RETURN;
  END IF;

  IF v_collection.collection_type != 'COLLECT' THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Only COLLECT type can be refunded'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hotel_collects
    WHERE related_collection_id = p_collection_id AND collection_type = 'VOID'
  ) THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Collection was voided'::TEXT;
    RETURN;
  END IF;

  -- Calculate remaining refundable amount
  SELECT COALESCE(SUM(ABS(amount_collected)), 0)
  INTO v_refund_total
  FROM public.hotel_collects
  WHERE related_collection_id = p_collection_id AND collection_type = 'REFUND';

  v_net_amount := v_collection.amount_collected - v_refund_total;

  IF v_net_amount <= 0 THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Already fully refunded'::TEXT;
    RETURN;
  END IF;

  IF public.is_period_locked(v_org_id, CURRENT_DATE) THEN
    RETURN QUERY SELECT false, 0::DECIMAL, 'Current period is locked'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_net_amount, ''::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_void_collection(p_collection_id uuid)
RETURNS TABLE(can_void boolean, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_collection RECORD;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  SELECT * INTO v_collection FROM public.hotel_collects WHERE id = p_collection_id;

  IF v_collection IS NULL THEN
    RETURN QUERY SELECT false, 'Collection not found'::TEXT;
    RETURN;
  END IF;

  IF v_collection.collection_type != 'COLLECT' THEN
    RETURN QUERY SELECT false, 'Only COLLECT type can be voided'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hotel_collects
    WHERE related_collection_id = p_collection_id AND collection_type = 'VOID'
  ) THEN
    RETURN QUERY SELECT false, 'Already voided'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hotel_collects
    WHERE related_collection_id = p_collection_id AND collection_type = 'REFUND'
  ) THEN
    RETURN QUERY SELECT false, 'Has refunds - use refund for remaining'::TEXT;
    RETURN;
  END IF;

  IF v_collection.ledger_entry_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.ledger_reconciliations
      WHERE ledger_entry_id = v_collection.ledger_entry_id
    ) THEN
      RETURN QUERY SELECT false, 'Ledger entry is reconciled'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF public.is_period_locked(v_org_id, v_collection.collected_at::date) THEN
    RETURN QUERY SELECT false, ('Period locked: ' || v_collection.collected_at::date)::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, ''::TEXT;
END;
$function$;

COMMIT;
