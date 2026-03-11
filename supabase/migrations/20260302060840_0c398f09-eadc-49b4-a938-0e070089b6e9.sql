
-- Sprint 12A: Unified Financial Transaction RPC
-- NON-BREAKING + ADDITIVE + IDEMPOTENT

-- 1. Add metadata JSONB to cashflow_entries (additive)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cashflow_entries' AND column_name='metadata'
  ) THEN
    ALTER TABLE public.cashflow_entries ADD COLUMN metadata JSONB DEFAULT NULL;
  END IF;
END $$;

-- 2. Make cash_outs.payment_request_id nullable (non-breaking)
ALTER TABLE public.cash_outs ALTER COLUMN payment_request_id DROP NOT NULL;

-- 3. Create unified atomic RPC
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
  v_cash_date DATE;
  v_result JSONB;
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated';
  END IF;

  -- Parse date
  v_cash_date := p_cash_date::DATE;

  -- Validate direction
  IF p_direction NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'INVALID_DIRECTION: Must be IN or OUT, got %', p_direction;
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Must be > 0, got %', p_amount;
  END IF;

  -- 1. Create cashflow_entry
  INSERT INTO public.cashflow_entries (
    source_type, source_id, direction, amount, cash_date,
    counterparty_type, counterparty_id, note, created_by, metadata
  ) VALUES (
    COALESCE(p_source_type, p_transaction_type),
    p_source_id,
    p_direction,
    p_amount,
    v_cash_date,
    p_counterparty_type,
    p_counterparty_id,
    p_note,
    v_user_id,
    p_metadata
  )
  RETURNING id INTO v_cashflow_id;

  -- 2. Create ledger_entry (ORIGINAL type)
  INSERT INTO public.ledger_entries (
    entry_type, source_type, source_id, direction, amount,
    entry_date, counterparty_type, counterparty_id, note, created_by
  ) VALUES (
    'ORIGINAL',
    COALESCE(p_source_type, p_transaction_type),
    p_source_id,
    p_direction,
    p_amount,
    v_cash_date,
    p_counterparty_type,
    p_counterparty_id,
    p_note,
    v_user_id
  )
  RETURNING id INTO v_ledger_id;

  -- 3. Audit log
  INSERT INTO public.audit_logs (
    action, entity, entity_id, user_id,
    after_data
  ) VALUES (
    'CREATE_FINANCIAL_TRANSACTION',
    p_transaction_type,
    COALESCE(p_source_id, v_cashflow_id::TEXT),
    v_user_id,
    jsonb_build_object(
      'transaction_type', p_transaction_type,
      'direction', p_direction,
      'amount', p_amount,
      'cash_date', v_cash_date,
      'cashflow_id', v_cashflow_id,
      'ledger_id', v_ledger_id,
      'payment_method', p_payment_method,
      'metadata', p_metadata
    )
  );

  v_result := jsonb_build_object(
    'cashflow_id', v_cashflow_id,
    'ledger_id', v_ledger_id,
    'status', 'OK'
  );

  RETURN v_result;
END;
$$;
