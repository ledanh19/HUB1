CREATE OR REPLACE FUNCTION public.create_collection_ledger_atomic(
  p_unified_booking_id text, 
  p_amount numeric, 
  p_payment_method text, 
  p_collection_type text, 
  p_related_type text, 
  p_payer_type text, 
  p_related_id uuid DEFAULT NULL::uuid, 
  p_note text DEFAULT NULL::text, 
  p_related_collection_id uuid DEFAULT NULL::uuid, 
  p_reason_note text DEFAULT NULL::text,
  p_payee_type text DEFAULT 'ROOMRISE'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_collection_id UUID;
  v_user_id UUID;
  v_cash_account_id UUID;
  v_direction TEXT;
  v_ledger_entry_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_entry_date DATE := CURRENT_DATE;
  v_payee TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be positive';
  END IF;
  
  IF p_collection_type NOT IN ('COLLECT', 'REFUND') THEN
    RAISE EXCEPTION 'Invalid collection_type: %. Must be COLLECT or REFUND', p_collection_type;
  END IF;
  
  v_payee := COALESCE(p_payee_type, 'ROOMRISE');
  IF v_payee NOT IN ('ROOMRISE', 'HOST', 'SERVICE_PARTNER') THEN
    v_payee := 'ROOMRISE';
  END IF;
  
  IF is_period_locked(v_org_id, v_entry_date) THEN
    RAISE EXCEPTION 'Accounting period is locked for date %', v_entry_date;
  END IF;
  
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method,
    collection_type, related_type, related_id, payer_type,
    note, collected_by, payee_type, status,
    related_collection_id, reason_note
  )
  VALUES (
    p_unified_booking_id, 
    CASE WHEN p_collection_type = 'REFUND' THEN -ABS(p_amount) ELSE ABS(p_amount) END,
    p_payment_method,
    p_collection_type, p_related_type, p_related_id, p_payer_type,
    p_note, v_user_id, v_payee,
    CASE WHEN p_collection_type = 'COLLECT' THEN 'COLLECTED' ELSE 'REFUNDED' END,
    p_related_collection_id, p_reason_note
  )
  RETURNING id INTO v_collection_id;
  
  IF v_payee = 'ROOMRISE' THEN
    INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
    VALUES (
      v_entry_date,
      p_amount,
      CASE WHEN p_collection_type = 'COLLECT' THEN 'IN' ELSE 'OUT' END,
      'HOTEL_COLLECT',
      v_collection_id,
      p_payer_type,
      CASE WHEN p_collection_type = 'COLLECT' THEN 'Thu tien (atomic)' ELSE 'Hoan tien (atomic)' END,
      v_user_id
    );
    
    v_direction := CASE WHEN p_collection_type = 'COLLECT' THEN 'DEBIT' ELSE 'CREDIT' END;
    v_cash_account_id := resolve_account_mapping(
      CASE WHEN p_collection_type = 'COLLECT' THEN 'IN' ELSE 'OUT' END,
      'HOTEL_COLLECT',
      p_payment_method,
      p_payer_type
    );
    
    v_ledger_entry_id := post_ledger_entry_idempotent(
      p_source_type := 'HOTEL_COLLECT',
      p_source_id := v_collection_id, 
      p_cash_account_id := v_cash_account_id, 
      p_direction := v_direction, 
      p_amount := p_amount, 
      p_entry_date := v_entry_date,
      p_counterparty_type := p_payer_type,
      p_counterparty_id := NULL,
      p_note := CASE WHEN p_collection_type = 'COLLECT' THEN 'Thu tien' ELSE 'Hoan tien' END,
      p_org_id := v_org_id
    );
    
    UPDATE hotel_collects
    SET ledger_entry_id = v_ledger_entry_id
    WHERE id = v_collection_id;
  END IF;
  
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    CASE WHEN p_collection_type = 'COLLECT' THEN 'COLLECTION_CREATED' ELSE 'REFUND_CREATED' END,
    'hotel_collects',
    v_collection_id,
    v_user_id,
    jsonb_build_object(
      'unified_booking_id', p_unified_booking_id,
      'amount', p_amount,
      'collection_type', p_collection_type,
      'payment_method', p_payment_method,
      'payee_type', v_payee,
      'ledger_entry_id', v_ledger_entry_id
    )
  );
  
  RETURN v_collection_id;
END;
$function$;

COMMENT ON FUNCTION public.create_collection_ledger_atomic IS
  'Atomic collection creation with ledger entry. p_payee_type controls who receives the money: ROOMRISE (default), HOST, or SERVICE_PARTNER. Non-ROOMRISE collections skip cashflow/ledger entries.';

GRANT EXECUTE ON FUNCTION public.create_collection_ledger_atomic TO authenticated;