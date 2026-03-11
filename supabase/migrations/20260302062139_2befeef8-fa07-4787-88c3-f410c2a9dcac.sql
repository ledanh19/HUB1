
-- Sprint 12G: Fix direction mapping OUT→CREDIT, IN→DEBIT (cash account convention)
-- Also fix the 60 backfilled ledger entries

-- 1. Fix the RPC
CREATE OR REPLACE FUNCTION public.create_financial_transaction_secure(
  p_transaction_type TEXT,
  p_direction TEXT,
  p_amount NUMERIC,
  p_cash_date TEXT,
  p_counterparty_type TEXT,
  p_counterparty_id TEXT DEFAULT NULL,
  p_source_type TEXT DEFAULT NULL,
  p_source_id TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'BANK_TRANSFER',
  p_bank_name TEXT DEFAULT NULL,
  p_account_number TEXT DEFAULT NULL,
  p_account_name TEXT DEFAULT NULL,
  p_transfer_reference TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_cashflow_id UUID;
  v_ledger_id UUID;
  v_cash_out_id UUID;
  v_cash_date DATE;
  v_effective_source_id TEXT;
  v_is_settlement_payment BOOLEAN;
  v_ledger_direction TEXT;
  v_default_account_id UUID;
  v_account_snapshot JSONB;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated';
  END IF;

  v_cash_date := p_cash_date::DATE;

  IF p_direction NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'INVALID_DIRECTION: Must be IN or OUT, got %', p_direction;
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Must be > 0, got %', p_amount;
  END IF;

  -- Cash account convention: IN=DEBIT (increase cash), OUT=CREDIT (decrease cash)
  v_ledger_direction := CASE WHEN p_direction = 'IN' THEN 'DEBIT' ELSE 'CREDIT' END;

  SELECT id INTO v_default_account_id
  FROM cash_accounts WHERE is_default = true LIMIT 1;
  IF v_default_account_id IS NULL THEN
    SELECT id INTO v_default_account_id FROM cash_accounts LIMIT 1;
  END IF;

  SELECT jsonb_build_object(
    'code', account_code, 'name', account_name,
    'bank_name', COALESCE(bank_name, ''), 'account_number', COALESCE(account_number, '')
  ) INTO v_account_snapshot
  FROM cash_accounts WHERE id = v_default_account_id;

  v_is_settlement_payment := p_transaction_type IN (
    'HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT'
  );

  IF v_is_settlement_payment AND p_direction = 'OUT' THEN
    INSERT INTO public.cash_outs (
      amount, paid_at, payment_method, payment_request_id,
      bank_name, bank_account_number, bank_account_name,
      transfer_reference, paid_by, note, settlement_id, settlement_type
    ) VALUES (
      p_amount, v_cash_date, COALESCE(p_payment_method, 'BANK_TRANSFER'), NULL,
      p_bank_name, p_account_number, p_account_name,
      p_transfer_reference, v_user_id, p_note,
      p_source_id::UUID,
      CASE WHEN p_transaction_type = 'HOST_SETTLEMENT_PAYMENT' THEN 'HOST' ELSE 'SERVICE' END
    )
    RETURNING id INTO v_cash_out_id;
    v_effective_source_id := v_cash_out_id::TEXT;
  ELSE
    v_effective_source_id := p_source_id;
  END IF;

  INSERT INTO public.cashflow_entries (
    source_type, source_id, direction, amount, cash_date,
    counterparty_type, counterparty_id, note, created_by, metadata
  ) VALUES (
    COALESCE(p_source_type, p_transaction_type), v_effective_source_id,
    p_direction, p_amount, v_cash_date,
    p_counterparty_type, p_counterparty_id, p_note, v_user_id,
    CASE WHEN v_is_settlement_payment THEN
      COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('settlement_id', p_source_id, 'cash_out_id', v_cash_out_id)
    ELSE p_metadata END
  )
  RETURNING id INTO v_cashflow_id;

  INSERT INTO public.ledger_entries (
    entry_type, source_type, source_id, direction, amount,
    entry_date, counterparty_type, counterparty_id, note, created_by,
    cash_account_id, account_snapshot
  ) VALUES (
    'ORIGINAL', COALESCE(p_source_type, p_transaction_type),
    COALESCE(v_effective_source_id::UUID, gen_random_uuid()),
    v_ledger_direction, p_amount, v_cash_date,
    p_counterparty_type, p_counterparty_id, p_note, v_user_id,
    v_default_account_id, COALESCE(v_account_snapshot, '{}'::JSONB)
  )
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'CREATE_FINANCIAL_TRANSACTION', p_transaction_type, v_effective_source_id, v_user_id,
    jsonb_build_object(
      'transaction_type', p_transaction_type, 'direction', p_direction,
      'ledger_direction', v_ledger_direction, 'amount', p_amount,
      'cash_date', v_cash_date, 'cashflow_id', v_cashflow_id,
      'ledger_id', v_ledger_id, 'cash_out_id', v_cash_out_id,
      'payment_method', p_payment_method, 'metadata', p_metadata
    )
  );

  RETURN jsonb_build_object(
    'cashflow_id', v_cashflow_id, 'ledger_id', v_ledger_id,
    'cash_out_id', v_cash_out_id, 'status', 'OK'
  );
END;
$$;
