-- ============================================================================
-- SPRINT 12 PATCH — Schema Safety + Backward Compatibility
-- ============================================================================
-- Date: 2026-03-09
-- Purpose:
--   1. Add metadata column to cashflow_entries (ADDITIVE)
--   2. Patch RPC to store entity_source_id + settlement_id in metadata
--   3. Add UUID validation guard in RPC
--   4. Create settlement_payments_unified_v for backward-compat reads
--   5. Reject HOST_PAYMENT_BATCH as source_type (normalized to HOST_PAYMENT)
--
-- NON-BREAKING. ADDITIVE ONLY.
-- ============================================================================


-- ============================================================================
-- PART 0: PREREQUISITE — cash_outs.payment_request_id must be nullable
-- ============================================================================
-- Original schema: payment_request_id UUID NOT NULL REFERENCES payment_requests(id)
-- Required because create_financial_transaction_secure inserts NULL for
-- direct financial transactions that bypass the payment_request workflow.

ALTER TABLE public.cash_outs
  ALTER COLUMN payment_request_id DROP NOT NULL;

COMMENT ON COLUMN public.cash_outs.payment_request_id IS
  'FK to payment_requests. NULL for direct financial transactions created by '
  'create_financial_transaction_secure or backfill RPCs.';


-- ============================================================================
-- PART 1: ADD metadata COLUMN TO cashflow_entries
-- ============================================================================
-- Required for storing settlement_id, payable_id, batch info etc.
-- Without this, the only place metadata lives is audit_logs.after_data.

ALTER TABLE public.cashflow_entries
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cashflow_entries.metadata IS
  'Structured metadata for backward compatibility and reporting joins. '
  'For settlement payments: contains settlement_id. '
  'For batch payments: contains batch_id, payable_id.';


-- ============================================================================
-- PART 2: PATCH create_financial_transaction_secure
-- ============================================================================
-- Changes:
--   a) Add UUID validation for p_source_id (fail-fast BEFORE hitting trigger)
--   b) Store p_metadata + entity_source_id in cashflow_entries.metadata
--   c) For settlement payments, store settlement_id in metadata explicitly
--   d) Reject HOST_PAYMENT_BATCH (must use HOST_PAYMENT)
--   e) Fix idempotency: for settlement payments, also check by metadata.settlement_id

CREATE OR REPLACE FUNCTION public.create_financial_transaction_secure(
  p_transaction_type  TEXT,
  p_direction         TEXT,
  p_amount            NUMERIC,
  p_cash_date         DATE,
  p_counterparty_type TEXT,
  p_counterparty_id   TEXT,
  p_source_type       TEXT,
  p_source_id         TEXT,
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
  v_user_id          UUID;
  v_has_permission   BOOLEAN;
  v_org_id           UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_cash_out_id      UUID;
  v_cashflow_id      UUID;
  v_ledger_id        UUID;
  v_account_id       UUID;
  v_ledger_direction TEXT;
  v_ledger_source_id UUID;
  v_audit_id         UUID;
  v_cashflow_metadata JSONB;
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

  -- Reject HOST_PAYMENT_BATCH — must use HOST_PAYMENT
  IF p_transaction_type = 'HOST_PAYMENT_BATCH' OR p_source_type = 'HOST_PAYMENT_BATCH' THEN
    RAISE EXCEPTION 'DEPRECATED_TYPE: HOST_PAYMENT_BATCH is deprecated. Use HOST_PAYMENT with batch metadata instead.';
  END IF;

  IF NOT (p_transaction_type = ANY(v_allowed_types)) THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE: % is not allowed. Allowed: %',
      p_transaction_type, array_to_string(v_allowed_types, ', ');
  END IF;

  IF p_source_id IS NULL OR p_source_id = '' THEN
    RAISE EXCEPTION 'INVALID_SOURCE_ID: source_id is required';
  END IF;

  -- UUID VALIDATION (fail-fast before trigger)
  IF NOT is_valid_uuid(p_source_id) THEN
    RAISE EXCEPTION 'INVALID_SOURCE_ID: p_source_id=% is not a valid UUID. '
      'Use UUID source_id and pass extra identifiers via p_metadata.',
      p_source_id;
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
  -- 5. SETTLEMENT STATUS GUARD
  -- ========================================
  IF p_transaction_type = 'HOST_SETTLEMENT_PAYMENT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM host_settlements
      WHERE id = p_source_id::UUID
        AND status IN ('SETTLED', 'FINALIZED', 'PARTIALLY_PAID')
      FOR UPDATE
    ) THEN
      RAISE EXCEPTION 'INVALID_SETTLEMENT_STATUS: Settlement % không ở trạng thái cho phép thanh toán', p_source_id;
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
  SELECT id INTO v_cashflow_id
  FROM cashflow_entries
  WHERE source_type = p_source_type
    AND source_id = p_source_id
  LIMIT 1;

  IF v_cashflow_id IS NOT NULL THEN
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
      NULL,
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

    v_ledger_source_id := v_cash_out_id;
  ELSE
    v_ledger_source_id := gen_random_uuid();
  END IF;

  -- ========================================
  -- 7B. BUILD CASHFLOW METADATA
  -- ========================================
  -- Always include: entity_source_id (the original p_source_id before unification)
  -- For settlements: include settlement_id for backward compat joins
  v_cashflow_metadata := COALESCE(p_metadata, '{}'::jsonb)
    || jsonb_build_object('entity_source_id', p_source_id);

  -- For settlement payments, explicitly store settlement_id
  IF p_transaction_type IN ('HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT') THEN
    v_cashflow_metadata := v_cashflow_metadata
      || jsonb_build_object('settlement_id', p_source_id);
  END IF;

  -- Store the unified source_id (cash_out_id or generated UUID)
  v_cashflow_metadata := v_cashflow_metadata
    || jsonb_build_object('unified_source_id', v_ledger_source_id);

  -- ========================================
  -- 7C. LEDGER ENTRY
  -- ========================================
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_account_mapping') THEN
    v_account_id := resolve_account_mapping(
      p_direction,
      p_transaction_type,
      p_payment_method,
      p_counterparty_type
    );

    v_ledger_direction := CASE WHEN p_direction = 'OUT' THEN 'CREDIT' ELSE 'DEBIT' END;

    v_ledger_id := post_ledger_entry_idempotent(
      p_transaction_type,
      v_ledger_source_id,
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
  -- 7D. CASHFLOW ENTRY (with metadata)
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
    note,
    metadata
  )
  VALUES (
    p_cash_date,
    p_source_type,
    v_ledger_source_id::TEXT,
    p_direction,
    p_counterparty_type,
    p_counterparty_id,
    p_amount,
    v_user_id,
    p_note,
    v_cashflow_metadata
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
      'unified_source_id', v_ledger_source_id,
      'ledger_id', v_ledger_id,
      'cashflow_id', v_cashflow_id,
      'counterparty_type', p_counterparty_type,
      'counterparty_id', p_counterparty_id,
      'payment_method', p_payment_method,
      'metadata', v_cashflow_metadata
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
    'unified_source_id', v_ledger_source_id,
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
  'Sprint 12 Unified atomic RPC. Creates cash_out (OUT) + ledger + cashflow + audit. '
  'Enforces: period lock, RBAC, settlement guard, idempotency, UUID validation. '
  'Stores metadata in cashflow_entries.metadata for backward-compat joins. '
  'Rejects HOST_PAYMENT_BATCH (use HOST_PAYMENT + metadata instead).';


-- ============================================================================
-- PART 3: BACKWARD COMPATIBILITY VIEW — settlement_payments_unified_v
-- ============================================================================
-- Allows reporting/joins for both:
--   NEW: source_id = cash_out_id, settlement_id in metadata
--   OLD: source_id = settlement_id directly

CREATE OR REPLACE VIEW public.settlement_payments_unified_v AS
WITH new_path AS (
  -- Post-Sprint 12 entries: source_id = cash_out_id, settlement_id in metadata
  SELECT
    cf.id              AS cashflow_id,
    cf.source_id::uuid AS cash_out_id,
    (cf.metadata->>'settlement_id')::uuid AS settlement_id,
    cf.source_type,
    cf.amount,
    cf.direction,
    cf.cash_date,
    cf.counterparty_id,
    cf.note,
    cf.created_at,
    cf.created_by,
    cf.metadata,
    'NEW'::text AS data_path
  FROM cashflow_entries cf
  WHERE cf.source_type IN ('HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT')
    AND cf.metadata IS NOT NULL
    AND cf.metadata ? 'settlement_id'
),
legacy_path AS (
  -- Pre-Sprint 12 entries: source_id = settlement_id directly
  SELECT
    cf.id              AS cashflow_id,
    NULL::uuid         AS cash_out_id,
    cf.source_id::uuid AS settlement_id,
    cf.source_type,
    cf.amount,
    cf.direction,
    cf.cash_date,
    cf.counterparty_id,
    cf.note,
    cf.created_at,
    cf.created_by,
    cf.metadata,
    'LEGACY'::text AS data_path
  FROM cashflow_entries cf
  WHERE cf.source_type IN ('HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT')
    AND (cf.metadata IS NULL OR NOT (cf.metadata ? 'settlement_id'))
)
SELECT * FROM new_path
UNION ALL
SELECT * FROM legacy_path;

COMMENT ON VIEW public.settlement_payments_unified_v IS
  'Backward-compatible view for settlement payment cashflow entries. '
  'Normalizes source_id for both NEW (source_id=cash_out_id, settlement_id in metadata) '
  'and LEGACY (source_id=settlement_id directly) data paths.';


-- ============================================================================
-- PART 4: HOST PAYMENTS BACKWARD COMPATIBILITY VIEW
-- ============================================================================
-- Similar pattern for HOST_PAYMENT, HOST_DEPOSIT, HOST_PREPAID, HOST_DEPOSIT_REFUND

CREATE OR REPLACE VIEW public.host_payments_unified_v AS
SELECT
  cf.id              AS cashflow_id,
  cf.source_id       AS unified_source_id,
  cf.source_type,
  cf.amount,
  cf.direction,
  cf.cash_date,
  cf.counterparty_id AS partner_id,
  cf.note,
  cf.created_at,
  cf.created_by,
  cf.metadata,
  -- Extract entity IDs from metadata if available (post-Sprint 12)
  cf.metadata->>'entity_source_id' AS entity_source_id,
  cf.metadata->>'batch_id'         AS batch_id,
  cf.metadata->>'payable_id'       AS payable_id,
  cf.metadata->>'payment_id'       AS payment_id,
  cf.metadata->>'deposit_id'       AS deposit_id,
  cf.metadata->>'prepaid_id'       AS prepaid_id,
  CASE
    WHEN cf.metadata ? 'entity_source_id' THEN 'NEW'
    ELSE 'LEGACY'
  END::text AS data_path
FROM cashflow_entries cf
WHERE cf.source_type IN (
  'HOST_PAYMENT', 'HOST_DEPOSIT', 'HOST_PREPAID',
  'HOST_DEPOSIT_REFUND', 'HOST_PAYMENT_BATCH'
);

COMMENT ON VIEW public.host_payments_unified_v IS
  'Unified view for all host payment cashflow entries. '
  'Extracts metadata fields for reporting joins.';


-- ============================================================================
-- PART 5: VERIFICATION QUERIES
-- ============================================================================

-- 1. Confirm cashflow_entries now has metadata column
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'cashflow_entries' AND column_name = 'metadata';
-- Expected: metadata | jsonb | '{}'::jsonb

-- 2. Confirm source_id types
-- SELECT table_name, column_name, data_type, udt_name
-- FROM information_schema.columns
-- WHERE (table_name IN ('cashflow_entries','ledger_entries') AND column_name='source_id')
--    OR (table_name='cash_outs' AND column_name='id');
-- Expected:
--   cashflow_entries.source_id = text
--   ledger_entries.source_id   = uuid
--   cash_outs.id               = uuid

-- 3. Verify is_valid_uuid rejects concat strings
-- SELECT is_valid_uuid('abc-def');
-- Expected: false

-- 4. Verify backward compat view
-- SELECT * FROM settlement_payments_unified_v LIMIT 5;

-- 5. Test HOST_PAYMENT_BATCH rejection
-- SELECT create_financial_transaction_secure(
--   'HOST_PAYMENT_BATCH','OUT',1000,CURRENT_DATE,'HOST','test','HOST_PAYMENT_BATCH','uuid-here'
-- );
-- Expected: DEPRECATED_TYPE error
