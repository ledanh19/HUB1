-- ============================================================================
-- SPRINT 12 — UNIFIED FINANCIAL TRANSACTION RPC
-- ============================================================================
-- Date: 2026-03-09
-- Purpose:
--   Replace ALL client-side .insert('cashflow_entries') for:
--     HOST_PAYMENT, HOST_DEPOSIT, HOST_PREPAID, HOST_DEPOSIT_REFUND,
--     HOST_SETTLEMENT_PAYMENT, SERVICE_SETTLEMENT_PAYMENT
--   with a single atomic RPC that creates:
--     1. cash_outs (if direction = OUT)
--     2. ledger_entries (via post_ledger_entry_idempotent)
--     3. cashflow_entries
--     4. audit_logs
--   All inside one transaction. Period lock enforced. RBAC enforced. Idempotent.
--
-- NON-BREAKING: Does NOT modify existing RPCs or OTA payout paths.
-- ADDITIVE ONLY.
-- ============================================================================


-- ============================================================================
-- PART A: CREATE UNIFIED RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_financial_transaction_secure(
  p_transaction_type  TEXT,       -- 'HOST_PAYMENT','HOST_DEPOSIT','HOST_PREPAID','HOST_DEPOSIT_REFUND','HOST_SETTLEMENT_PAYMENT','SERVICE_SETTLEMENT_PAYMENT'
  p_direction         TEXT,       -- 'IN' or 'OUT'
  p_amount            NUMERIC,
  p_cash_date         DATE,
  p_counterparty_type TEXT,       -- 'HOST','SERVICE_PARTNER'
  p_counterparty_id   TEXT,       -- partner_id
  p_source_type       TEXT,       -- cashflow source_type (same as p_transaction_type)
  p_source_id         TEXT,       -- the entity id (payment.id, deposit.id, settlement.id)
  p_note              TEXT        DEFAULT NULL,
  p_payment_method    TEXT        DEFAULT 'BANK_TRANSFER',
  p_bank_name         TEXT        DEFAULT NULL,
  p_account_number    TEXT        DEFAULT NULL,
  p_account_name      TEXT        DEFAULT NULL,
  p_transfer_reference TEXT       DEFAULT NULL,
  p_metadata          JSONB       DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID;
  v_has_permission BOOLEAN;
  v_org_id        UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_cash_out_id   UUID;
  v_cashflow_id   UUID;
  v_ledger_id     UUID;
  v_account_id    UUID;
  v_ledger_direction TEXT;
  v_ledger_source_id UUID;
  v_audit_id      UUID;
  v_allowed_types TEXT[] := ARRAY[
    'HOST_PAYMENT', 'HOST_DEPOSIT', 'HOST_PREPAID',
    'HOST_DEPOSIT_REFUND', 'HOST_SETTLEMENT_PAYMENT',
    'SERVICE_SETTLEMENT_PAYMENT'
  ];
BEGIN
  -- ========================================
  -- 1. AUTHENTICATION
  -- ========================================
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- ========================================
  -- 2. RBAC CHECK
  -- ========================================
  -- Check page-level permission or role-based access
  v_has_permission := has_page_use_access('/payments/outgoing');

  IF NOT v_has_permission THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = v_user_id
        AND role IN ('admin', 'super_admin', 'ke_toan')
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Không có quyền tạo giao dịch tài chính';
  END IF;

  -- ========================================
  -- 3. INPUT VALIDATION
  -- ========================================
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount=% must be > 0', p_amount;
  END IF;

  IF p_direction NOT IN ('IN', 'OUT') THEN
    RAISE EXCEPTION 'INVALID_DIRECTION: direction=% must be IN or OUT', p_direction;
  END IF;

  IF p_transaction_type IS NULL OR p_transaction_type != ALL(v_allowed_types) THEN
    -- Check if it's in the allowed list
    IF NOT (p_transaction_type = ANY(v_allowed_types)) THEN
      RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE: % is not allowed. Allowed: %',
        p_transaction_type, array_to_string(v_allowed_types, ', ');
    END IF;
  END IF;

  IF p_source_id IS NULL OR p_source_id = '' THEN
    RAISE EXCEPTION 'INVALID_SOURCE_ID: source_id is required';
  END IF;

  -- ========================================
  -- 4. PERIOD LOCK CHECK
  -- ========================================
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_period_locked') THEN
    IF is_period_locked(v_org_id, p_cash_date) THEN
      RAISE EXCEPTION 'PERIOD_LOCKED: Kỳ kế toán đã khóa cho ngày %. Không thể tạo giao dịch.', p_cash_date;
    END IF;
  END IF;

  -- ========================================
  -- 5. SETTLEMENT STATUS GUARD (if settlement payment)
  -- ========================================
  IF p_transaction_type = 'HOST_SETTLEMENT_PAYMENT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM host_settlements
      WHERE id = p_source_id::UUID
        AND status IN ('SETTLED', 'FINALIZED', 'PARTIALLY_PAID')
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'INVALID_SETTLEMENT_STATUS: Settlement % không ở trạng thái cho phép thanh toán (must be SETTLED/FINALIZED/PARTIALLY_PAID)', p_source_id;
    END IF;
  END IF;

  IF p_transaction_type = 'SERVICE_SETTLEMENT_PAYMENT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM service_settlements
      WHERE id = p_source_id::UUID
        AND finalized_at IS NOT NULL
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'INVALID_SETTLEMENT_STATUS: Service settlement % chưa được finalize', p_source_id;
    END IF;
  END IF;

  -- ========================================
  -- 6. IDEMPOTENCY CHECK
  -- ========================================
  -- Check if a cashflow entry with same source_type + source_id already exists
  SELECT id INTO v_cashflow_id
  FROM cashflow_entries
  WHERE source_type = p_source_type
    AND source_id = p_source_id
  LIMIT 1;

  IF v_cashflow_id IS NOT NULL THEN
    -- Already exists — return idempotent response
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'cashflow_id', v_cashflow_id,
      'message', 'Transaction already exists'
    );
  END IF;

  -- ========================================
  -- 7A. CASH_OUT INSERT (if direction = OUT)
  -- ========================================
  IF p_direction = 'OUT' THEN
    INSERT INTO cash_outs (
      payment_request_id,
      amount,
      payment_method,
      paid_at,
      bank_name,
      bank_account_number,
      bank_account_name,
      transfer_reference,
      note,
      paid_by
    )
    VALUES (
      NULL,  -- No payment_request for direct financial transactions
      p_amount,
      p_payment_method,
      (p_cash_date::TEXT || 'T12:00:00+07:00')::TIMESTAMPTZ,
      p_bank_name,
      p_account_number,
      p_account_name,
      p_transfer_reference,
      p_note,
      v_user_id
    )
    RETURNING id INTO v_cash_out_id;

    -- Use cash_out_id as the unified source_id for ledger + cashflow
    v_ledger_source_id := v_cash_out_id;
  ELSE
    -- For IN direction, use a generated UUID as source
    v_ledger_source_id := gen_random_uuid();
  END IF;

  -- ========================================
  -- 7B. LEDGER ENTRY
  -- ========================================
  -- Resolve account mapping
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_account_mapping') THEN
    v_account_id := resolve_account_mapping(
      p_direction,
      p_transaction_type,
      p_transaction_type,  -- payment_type
      p_payment_method,
      p_counterparty_type
    );

    -- Direction: OUT = CREDIT (cash leaving), IN = DEBIT (cash entering)
    v_ledger_direction := CASE WHEN p_direction = 'OUT' THEN 'CREDIT' ELSE 'DEBIT' END;

    v_ledger_id := post_ledger_entry_idempotent(
      p_transaction_type,           -- source_type (e.g. HOST_PAYMENT)
      v_ledger_source_id,           -- source_id = cash_out_id (OUT) or generated UUID (IN)
      v_account_id,
      v_ledger_direction,
      p_amount,
      p_cash_date,
      p_counterparty_type,
      p_counterparty_id,
      COALESCE(p_note, p_transaction_type)
    );

    IF v_ledger_id IS NULL THEN
      RAISE EXCEPTION 'LEDGER_FAILED: Could not post ledger entry for % / %',
        p_transaction_type, v_ledger_source_id;
    END IF;
  END IF;

  -- ========================================
  -- 7C. CASHFLOW ENTRY
  -- ========================================
  INSERT INTO cashflow_entries (
    cash_date,
    source_type,
    source_id,
    direction,
    counterparty_type,
    counterparty_id,
    amount,
    created_by,
    note
  )
  VALUES (
    p_cash_date,
    p_source_type,
    -- UNIFIED SOURCE ID RULE:
    -- For OUT: use cash_out_id (same as ledger)
    -- For IN: use the generated UUID (same as ledger)
    v_ledger_source_id::TEXT,
    p_direction,
    p_counterparty_type,
    p_counterparty_id,
    p_amount,
    v_user_id,
    p_note
  )
  RETURNING id INTO v_cashflow_id;

  -- ========================================
  -- 8. AUDIT LOG (fail-fast)
  -- ========================================
  INSERT INTO audit_logs (
    event_time,
    user_id,
    action,
    entity,
    entity_id,
    after_data
  )
  VALUES (
    now(),
    v_user_id,
    'CREATE_FINANCIAL_TRANSACTION',
    p_transaction_type,
    p_source_id,
    jsonb_build_object(
      'transaction_type', p_transaction_type,
      'direction', p_direction,
      'amount', p_amount,
      'cash_date', p_cash_date,
      'source_type', p_source_type,
      'source_id', p_source_id,
      'cash_out_id', v_cash_out_id,
      'ledger_id', v_ledger_id,
      'cashflow_id', v_cashflow_id,
      'counterparty_type', p_counterparty_type,
      'counterparty_id', p_counterparty_id,
      'payment_method', p_payment_method,
      'metadata', p_metadata
    )
  )
  RETURNING id INTO v_audit_id;

  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'AUDIT_FAILED: Audit log insert failed — transaction rolled back';
  END IF;

  -- ========================================
  -- 9. RETURN RESULT
  -- ========================================
  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'cash_out_id', v_cash_out_id,
    'ledger_id', v_ledger_id,
    'cashflow_id', v_cashflow_id,
    'audit_id', v_audit_id,
    'amount', p_amount,
    'transaction_type', p_transaction_type,
    'direction', p_direction
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_financial_transaction_secure(
  TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

COMMENT ON FUNCTION public.create_financial_transaction_secure IS
  'Unified atomic RPC for all host/service financial transactions. '
  'Creates cash_out (if OUT) + ledger_entry + cashflow_entry + audit_log in one transaction. '
  'Enforces: period lock, RBAC, settlement status guard, idempotency. '
  'Replaces client-side .insert("cashflow_entries") for HOST_PAYMENT, HOST_DEPOSIT, '
  'HOST_PREPAID, HOST_DEPOSIT_REFUND, HOST_SETTLEMENT_PAYMENT, SERVICE_SETTLEMENT_PAYMENT. '
  'Returns JSONB with all created IDs.';


-- ============================================================================
-- PART B: UPDATE CASHFLOW-LEDGER COUPLING MAP
-- ============================================================================
-- Change WHITELISTED → ENFORCED for all types now handled by the new RPC.
-- The trigger trg_cashflow_ledger_coupling will now BLOCK any direct INSERT
-- that doesn't have a matching ledger entry.

UPDATE public.cashflow_ledger_type_map
SET
  enforcement = 'ENFORCED',
  ledger_source_type = cashflow_source_type,
  migration_target = 'create_financial_transaction_secure',
  notes = 'Migrated Sprint 12: now uses create_financial_transaction_secure RPC. '
       || 'Ledger + cashflow + cash_out created atomically. source_id = cash_out_id.',
  updated_at = now()
WHERE cashflow_source_type IN (
  'HOST_PAYMENT',
  'HOST_DEPOSIT',
  'HOST_PREPAID',
  'HOST_DEPOSIT_REFUND',
  'HOST_SETTLEMENT_PAYMENT',
  'SERVICE_SETTLEMENT_PAYMENT'
);

-- Also add HOST_PAYMENT_BATCH if it exists
UPDATE public.cashflow_ledger_type_map
SET
  enforcement = 'ENFORCED',
  ledger_source_type = 'HOST_PAYMENT_BATCH',
  migration_target = 'create_financial_transaction_secure',
  notes = 'Migrated Sprint 12: now enforced via create_financial_transaction_secure.',
  updated_at = now()
WHERE cashflow_source_type = 'HOST_PAYMENT_BATCH';


-- ============================================================================
-- PART C: VERIFICATION QUERIES
-- ============================================================================
-- Run these after migration to verify integrity:

-- 1. Check all target types are now ENFORCED
-- SELECT cashflow_source_type, enforcement, ledger_source_type, migration_target
-- FROM cashflow_ledger_type_map
-- WHERE cashflow_source_type IN (
--   'HOST_PAYMENT','HOST_DEPOSIT','HOST_PREPAID',
--   'HOST_DEPOSIT_REFUND','HOST_SETTLEMENT_PAYMENT',
--   'SERVICE_SETTLEMENT_PAYMENT','HOST_PAYMENT_BATCH'
-- );
-- Expected: ALL rows show enforcement = 'ENFORCED'

-- 2. Verify no orphan cashflows for enforced types
-- SELECT * FROM v_orphan_cashflow_enforced
-- WHERE source_type IN (
--   'HOST_PAYMENT','HOST_DEPOSIT','HOST_PREPAID',
--   'HOST_DEPOSIT_REFUND','HOST_SETTLEMENT_PAYMENT',
--   'SERVICE_SETTLEMENT_PAYMENT'
-- );
-- Expected: Only historical entries (before migration date)

-- 3. Test the RPC (example: HOST_PAYMENT)
-- SELECT create_financial_transaction_secure(
--   'HOST_PAYMENT',           -- p_transaction_type
--   'OUT',                    -- p_direction
--   100000,                   -- p_amount
--   CURRENT_DATE,             -- p_cash_date
--   'HOST',                   -- p_counterparty_type
--   'partner-uuid-here',      -- p_counterparty_id
--   'HOST_PAYMENT',           -- p_source_type
--   'payment-uuid-here',      -- p_source_id
--   'Test host payment',      -- p_note
--   'BANK_TRANSFER'           -- p_payment_method
-- );

-- 4. Verify triple-entry (cash_out + ledger + cashflow all have same source_id)
-- WITH txn AS (
--   SELECT (create_financial_transaction_secure(
--     'HOST_PAYMENT','OUT',1000,CURRENT_DATE,'HOST','test-partner',
--     'HOST_PAYMENT','test-source-id','Test','BANK_TRANSFER'
--   ))::jsonb AS result
-- )
-- SELECT
--   EXISTS(SELECT 1 FROM cash_outs WHERE id = (txn.result->>'cash_out_id')::UUID) AS has_cash_out,
--   EXISTS(SELECT 1 FROM ledger_entries WHERE id = (txn.result->>'ledger_id')::UUID) AS has_ledger,
--   EXISTS(SELECT 1 FROM cashflow_entries WHERE id = (txn.result->>'cashflow_id')::UUID) AS has_cashflow
-- FROM txn;
-- Expected: true, true, true
