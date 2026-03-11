
-- Sprint 12E: Fix settlement payment producer + normalize legacy rows
-- NON-BREAKING + ADDITIVE + IDEMPOTENT

-- 1. Tracking table for idempotent backfill
CREATE TABLE IF NOT EXISTS public.legacy_settlement_payment_backfill_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_cashflow_id UUID NOT NULL UNIQUE,
  cash_out_id UUID NOT NULL,
  ledger_id UUID NOT NULL,
  settlement_id UUID NOT NULL,
  settlement_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.legacy_settlement_payment_backfill_map ENABLE ROW LEVEL SECURITY;

-- 2. Fix the producer RPC: settlement payments now create cash_out first
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
  v_result JSONB;
BEGIN
  -- Auth check
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

  -- Detect settlement payment types
  v_is_settlement_payment := p_transaction_type IN (
    'HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT'
  );

  -- For settlement payments: create cash_out first, use cash_out.id as source_id
  IF v_is_settlement_payment AND p_direction = 'OUT' THEN
    INSERT INTO public.cash_outs (
      amount, paid_at, payment_method, payment_request_id,
      bank_name, bank_account_number, bank_account_name,
      transfer_reference, paid_by, note,
      settlement_id, settlement_type
    ) VALUES (
      p_amount,
      v_cash_date,
      COALESCE(p_payment_method, 'BANK_TRANSFER'),
      NULL, -- no payment_request for settlement payments
      p_bank_name,
      p_account_number,
      p_account_name,
      p_transfer_reference,
      v_user_id,
      p_note,
      p_source_id::UUID, -- settlement_id passed by FE
      CASE WHEN p_transaction_type = 'HOST_SETTLEMENT_PAYMENT' THEN 'HOST' ELSE 'SERVICE' END
    )
    RETURNING id INTO v_cash_out_id;

    v_effective_source_id := v_cash_out_id::TEXT;
  ELSE
    v_effective_source_id := p_source_id;
  END IF;

  -- 1. Create cashflow_entry (source_id = cash_out_id for settlements)
  INSERT INTO public.cashflow_entries (
    source_type, source_id, direction, amount, cash_date,
    counterparty_type, counterparty_id, note, created_by, metadata
  ) VALUES (
    COALESCE(p_source_type, p_transaction_type),
    v_effective_source_id,
    p_direction,
    p_amount,
    v_cash_date,
    p_counterparty_type,
    p_counterparty_id,
    p_note,
    v_user_id,
    CASE WHEN v_is_settlement_payment THEN
      COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object(
        'settlement_id', p_source_id,
        'cash_out_id', v_cash_out_id
      )
    ELSE
      p_metadata
    END
  )
  RETURNING id INTO v_cashflow_id;

  -- 2. Create ledger_entry (source_id = cash_out_id for settlements)
  INSERT INTO public.ledger_entries (
    entry_type, source_type, source_id, direction, amount,
    entry_date, counterparty_type, counterparty_id, note, created_by
  ) VALUES (
    'ORIGINAL',
    COALESCE(p_source_type, p_transaction_type),
    v_effective_source_id,
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
    action, entity, entity_id, user_id, after_data
  ) VALUES (
    'CREATE_FINANCIAL_TRANSACTION',
    p_transaction_type,
    v_effective_source_id,
    v_user_id,
    jsonb_build_object(
      'transaction_type', p_transaction_type,
      'direction', p_direction,
      'amount', p_amount,
      'cash_date', v_cash_date,
      'cashflow_id', v_cashflow_id,
      'ledger_id', v_ledger_id,
      'cash_out_id', v_cash_out_id,
      'payment_method', p_payment_method,
      'metadata', p_metadata,
      'settlement_source_id', CASE WHEN v_is_settlement_payment THEN p_source_id ELSE NULL END
    )
  );

  v_result := jsonb_build_object(
    'cashflow_id', v_cashflow_id,
    'ledger_id', v_ledger_id,
    'cash_out_id', v_cash_out_id,
    'status', 'OK'
  );

  RETURN v_result;
END;
$$;
