-- ============================================================================
-- SPRINT 12 — SETTLEMENT PAYMENT BACKFILL
-- ============================================================================
-- Date: 2026-03-09
-- Purpose:
--   Backfill legacy settlement payment cashflow rows to unified model:
--   - Create cash_outs row (synthetic)
--   - Create ledger_entries row
--   - Update cashflow_entries.source_id → cash_out_id
--   - Store settlement_id in cashflow_entries.metadata
--   - Full idempotency, period lock respect, audit trail
--
-- NON-BREAKING. ADDITIVE ONLY.
-- ============================================================================


-- ============================================================================
-- PART 0: PREREQUISITES
-- ============================================================================

-- 0.1 cash_outs.payment_request_id nullable
-- Already handled in 20260309_sprint12_patch_schema_safety.sql (PART 0)
-- ALTER TABLE cash_outs ALTER COLUMN payment_request_id DROP NOT NULL;


-- 0.2 Backfill run log
CREATE TABLE IF NOT EXISTS public.backfill_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_by UUID,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB
);

ALTER TABLE public.backfill_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backfill runs viewable by authenticated"
  ON public.backfill_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Backfill runs insertable by authenticated"
  ON public.backfill_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Backfill runs updatable by authenticated"
  ON public.backfill_runs FOR UPDATE TO authenticated USING (true);


-- 0.3 Idempotency mapping table
CREATE TABLE IF NOT EXISTS public.legacy_settlement_payment_backfill_map (
  legacy_cashflow_id UUID PRIMARY KEY REFERENCES cashflow_entries(id),
  cash_out_id UUID NOT NULL REFERENCES cash_outs(id),
  ledger_entry_id UUID NOT NULL REFERENCES ledger_entries(id),
  settlement_id UUID NOT NULL,
  original_source_id TEXT NOT NULL,
  backfilled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  backfill_run_id UUID NOT NULL REFERENCES backfill_runs(id)
);

ALTER TABLE public.legacy_settlement_payment_backfill_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backfill map viewable by authenticated"
  ON public.legacy_settlement_payment_backfill_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Backfill map insertable by authenticated"
  ON public.legacy_settlement_payment_backfill_map FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_backfill_map_run
  ON legacy_settlement_payment_backfill_map(backfill_run_id);
CREATE INDEX IF NOT EXISTS idx_backfill_map_settlement
  ON legacy_settlement_payment_backfill_map(settlement_id);


-- ============================================================================
-- PART 1: SINGLE-ROW BACKFILL RPC (Idempotent + Atomic)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_settlement_payment_backfill_secure(
  p_legacy_cashflow_id UUID,
  p_backfill_run_id    UUID,
  p_reason             TEXT DEFAULT 'Sprint 12 legacy settlement payment backfill'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          UUID;
  v_org_id           UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_cf               RECORD;
  v_settlement_id    UUID;
  v_cash_out_id      UUID;
  v_ledger_entry_id  UUID;
  v_account_id       UUID;
  v_economic_date    DATE;
  v_existing         RECORD;
  v_before_snapshot  JSONB;
BEGIN
  -- ==============================
  -- 1. AUTH
  -- ==============================
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- RBAC: admin/super_admin only
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id
      AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/super_admin can run backfill';
  END IF;

  -- ==============================
  -- 2. IDEMPOTENCY CHECK
  -- ==============================
  SELECT * INTO v_existing
  FROM legacy_settlement_payment_backfill_map
  WHERE legacy_cashflow_id = p_legacy_cashflow_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ALREADY_DONE',
      'legacy_cashflow_id', p_legacy_cashflow_id,
      'cash_out_id', v_existing.cash_out_id,
      'ledger_entry_id', v_existing.ledger_entry_id,
      'settlement_id', v_existing.settlement_id
    );
  END IF;

  -- ==============================
  -- 3. LOCK & FETCH CASHFLOW ROW
  -- ==============================
  SELECT * INTO v_cf
  FROM cashflow_entries
  WHERE id = p_legacy_cashflow_id
  FOR UPDATE;

  IF v_cf IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'NOT_FOUND',
      'legacy_cashflow_id', p_legacy_cashflow_id
    );
  END IF;

  -- Validate: must be settlement payment type
  IF v_cf.source_type NOT IN ('HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT') THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_TYPE',
      'legacy_cashflow_id', p_legacy_cashflow_id,
      'source_type', v_cf.source_type
    );
  END IF;

  -- Validate: must be legacy (no settlement_id in metadata yet)
  IF v_cf.metadata IS NOT NULL AND (v_cf.metadata ? 'settlement_id') THEN
    RETURN jsonb_build_object(
      'status', 'ALREADY_MIGRATED',
      'legacy_cashflow_id', p_legacy_cashflow_id
    );
  END IF;

  -- Extract settlement_id from current source_id
  IF NOT is_valid_uuid(v_cf.source_id) THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_SOURCE_ID',
      'legacy_cashflow_id', p_legacy_cashflow_id,
      'source_id', v_cf.source_id,
      'message', 'source_id is not a valid UUID'
    );
  END IF;

  v_settlement_id := v_cf.source_id::UUID;

  -- ==============================
  -- 4. PERIOD LOCK CHECK
  -- ==============================
  v_economic_date := v_cf.cash_date;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_period_locked') THEN
    IF is_period_locked(v_org_id, v_economic_date) THEN
      RETURN jsonb_build_object(
        'status', 'SKIPPED_LOCKED',
        'legacy_cashflow_id', p_legacy_cashflow_id,
        'economic_date', v_economic_date,
        'message', 'Period is locked — skipping'
      );
    END IF;
  END IF;

  -- Save before snapshot
  v_before_snapshot := jsonb_build_object(
    'source_id', v_cf.source_id,
    'source_type', v_cf.source_type,
    'metadata', v_cf.metadata,
    'amount', v_cf.amount,
    'direction', v_cf.direction,
    'cash_date', v_cf.cash_date
  );

  -- ==============================
  -- 5. CREATE SYNTHETIC CASH_OUT
  -- ==============================
  INSERT INTO cash_outs (
    payment_request_id,
    amount,
    payment_method,
    paid_at,
    note,
    paid_by
  )
  VALUES (
    NULL,  -- Synthetic: no payment request
    ABS(v_cf.amount),
    'BANK_TRANSFER',
    (v_economic_date::TEXT || 'T12:00:00+07:00')::TIMESTAMPTZ,
    format('Backfill settlement payment — %s → %s', v_cf.source_type, v_settlement_id),
    v_user_id
  )
  RETURNING id INTO v_cash_out_id;

  -- ==============================
  -- 6. CREATE LEDGER ENTRY
  -- ==============================
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_account_mapping') THEN
    v_account_id := resolve_account_mapping(
      'OUT',
      v_cf.source_type,
      'BANK_TRANSFER',
      COALESCE(v_cf.counterparty_type, 'HOST')
    );

    v_ledger_entry_id := post_ledger_entry_idempotent(
      v_cf.source_type,          -- source_type
      v_cash_out_id,             -- source_id = cash_out_id (unified rule)
      v_account_id,              -- cash_account_id
      'CREDIT',                  -- direction (OUT = CREDIT)
      ABS(v_cf.amount),          -- amount
      v_economic_date,           -- entry_date
      COALESCE(v_cf.counterparty_type, 'HOST'),
      v_cf.counterparty_id,
      format('Backfill: %s settlement=%s', v_cf.source_type, v_settlement_id),
      v_org_id
    );

    IF v_ledger_entry_id IS NULL THEN
      RAISE EXCEPTION 'LEDGER_FAILED: Could not create ledger entry for backfill of cashflow %',
        p_legacy_cashflow_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'MISSING_FUNCTION: resolve_account_mapping not available';
  END IF;

  -- ==============================
  -- 7. UPDATE CASHFLOW ENTRY IN-PLACE
  -- ==============================
  UPDATE cashflow_entries
  SET
    source_id = v_cash_out_id::TEXT,
    metadata = COALESCE(metadata, '{}'::jsonb)
      || jsonb_build_object(
           'settlement_id', v_settlement_id,
           'legacy_cashflow_id', p_legacy_cashflow_id,
           'backfill_run_id', p_backfill_run_id,
           'unified_source_id', v_cash_out_id,
           'reason', p_reason,
           'original_source_id', v_cf.source_id,
           'backfilled_at', now()::TEXT
         )
  WHERE id = p_legacy_cashflow_id;

  -- ==============================
  -- 8. INSERT MAPPING ROW
  -- ==============================
  INSERT INTO legacy_settlement_payment_backfill_map (
    legacy_cashflow_id,
    cash_out_id,
    ledger_entry_id,
    settlement_id,
    original_source_id,
    backfill_run_id
  )
  VALUES (
    p_legacy_cashflow_id,
    v_cash_out_id,
    v_ledger_entry_id,
    v_settlement_id,
    v_cf.source_id,
    p_backfill_run_id
  );

  -- ==============================
  -- 9. AUDIT LOG
  -- ==============================
  INSERT INTO audit_logs (
    event_time,
    user_id,
    action,
    entity,
    entity_id,
    before_data,
    after_data
  )
  VALUES (
    now(),
    v_user_id,
    'SETTLEMENT_PAYMENT_BACKFILLED',
    'cashflow_entries',
    p_legacy_cashflow_id::TEXT,
    v_before_snapshot,
    jsonb_build_object(
      'source_id', v_cash_out_id,
      'settlement_id', v_settlement_id,
      'cash_out_id', v_cash_out_id,
      'ledger_entry_id', v_ledger_entry_id,
      'backfill_run_id', p_backfill_run_id,
      'reason', p_reason,
      'economic_date', v_economic_date
    )
  );

  -- ==============================
  -- 10. RETURN
  -- ==============================
  RETURN jsonb_build_object(
    'status', 'SUCCESS',
    'legacy_cashflow_id', p_legacy_cashflow_id,
    'settlement_id', v_settlement_id,
    'cash_out_id', v_cash_out_id,
    'ledger_entry_id', v_ledger_entry_id,
    'economic_date', v_economic_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_settlement_payment_backfill_secure(UUID, UUID, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.create_settlement_payment_backfill_secure IS
  'Backfill a single legacy settlement payment cashflow row to unified model. '
  'Creates: cash_out + ledger_entry, updates cashflow source_id + metadata. '
  'Idempotent, period-lock aware, audit-logged. Admin only.';


-- ============================================================================
-- PART 2: BATCH RUNNER RPC (Chunked, admin-only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_settlement_payment_backfill_secure(
  p_limit           INT     DEFAULT 50,
  p_backfill_run_id UUID    DEFAULT NULL,
  p_reason          TEXT    DEFAULT 'Sprint 12 batch backfill'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID;
  v_run_id        UUID;
  v_row           RECORD;
  v_result        JSONB;
  v_processed     INT := 0;
  v_success       INT := 0;
  v_skipped_locked INT := 0;
  v_already_done  INT := 0;
  v_failed        INT := 0;
  v_invalid       INT := 0;
  v_results       JSONB[] := ARRAY[]::JSONB[];
BEGIN
  -- AUTH
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- RBAC: admin/super_admin only
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id
      AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only admin/super_admin can run backfill';
  END IF;

  -- Create or use backfill run
  IF p_backfill_run_id IS NOT NULL THEN
    v_run_id := p_backfill_run_id;
  ELSE
    INSERT INTO backfill_runs (name, created_by, params)
    VALUES (
      'settlement_payment_backfill',
      v_user_id,
      jsonb_build_object('limit', p_limit, 'reason', p_reason)
    )
    RETURNING id INTO v_run_id;
  END IF;

  -- Find legacy rows (not yet backfilled)
  FOR v_row IN
    SELECT cf.id AS legacy_cashflow_id
    FROM cashflow_entries cf
    LEFT JOIN legacy_settlement_payment_backfill_map m
      ON m.legacy_cashflow_id = cf.id
    WHERE cf.source_type IN ('HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT')
      AND (cf.metadata IS NULL OR NOT (cf.metadata ? 'settlement_id'))
      AND is_valid_uuid(cf.source_id)
      AND m.legacy_cashflow_id IS NULL
    ORDER BY cf.created_at ASC
    LIMIT p_limit
  LOOP
    v_processed := v_processed + 1;

    BEGIN
      v_result := create_settlement_payment_backfill_secure(
        v_row.legacy_cashflow_id,
        v_run_id,
        p_reason
      );

      CASE v_result->>'status'
        WHEN 'SUCCESS' THEN
          v_success := v_success + 1;
        WHEN 'SKIPPED_LOCKED' THEN
          v_skipped_locked := v_skipped_locked + 1;
        WHEN 'ALREADY_DONE', 'ALREADY_MIGRATED' THEN
          v_already_done := v_already_done + 1;
        WHEN 'INVALID_TYPE', 'INVALID_SOURCE_ID', 'NOT_FOUND' THEN
          v_invalid := v_invalid + 1;
        ELSE
          v_failed := v_failed + 1;
      END CASE;

      v_results := array_append(v_results, v_result);

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'status', 'ERROR',
        'legacy_cashflow_id', v_row.legacy_cashflow_id,
        'error', SQLERRM
      ));
    END;
  END LOOP;

  -- Update run record
  UPDATE backfill_runs
  SET
    finished_at = now(),
    result = jsonb_build_object(
      'processed', v_processed,
      'success', v_success,
      'skipped_locked', v_skipped_locked,
      'already_done', v_already_done,
      'invalid', v_invalid,
      'failed', v_failed
    )
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'backfill_run_id', v_run_id,
    'processed', v_processed,
    'success', v_success,
    'skipped_locked', v_skipped_locked,
    'already_done', v_already_done,
    'invalid', v_invalid,
    'failed', v_failed,
    'details', to_jsonb(v_results)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_settlement_payment_backfill_secure(INT, UUID, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.run_settlement_payment_backfill_secure IS
  'Batch runner for settlement payment backfill. Processes up to p_limit rows per call. '
  'Admin only. Creates backfill_run record. Returns summary counts.';


-- ============================================================================
-- PART 3: DIAGNOSTIC QUERIES (Run after backfill)
-- ============================================================================

-- 3.1 Count remaining legacy rows
-- SELECT COUNT(*) AS remaining_legacy
-- FROM cashflow_entries cf
-- LEFT JOIN legacy_settlement_payment_backfill_map m ON m.legacy_cashflow_id = cf.id
-- WHERE cf.source_type IN ('HOST_SETTLEMENT_PAYMENT','SERVICE_SETTLEMENT_PAYMENT')
--   AND (cf.metadata IS NULL OR NOT (cf.metadata ? 'settlement_id'))
--   AND m.legacy_cashflow_id IS NULL;
-- Expected: 0 (or only locked-period rows)

-- 3.2 Triple-entry consistency for backfilled rows
-- SELECT
--   COUNT(*) AS total_backfilled,
--   COUNT(*) FILTER (WHERE co.id IS NOT NULL) AS has_cash_out,
--   COUNT(*) FILTER (WHERE le.id IS NOT NULL) AS has_ledger,
--   COUNT(*) FILTER (WHERE co.id IS NOT NULL AND le.id IS NOT NULL) AS fully_consistent
-- FROM legacy_settlement_payment_backfill_map m
-- LEFT JOIN cash_outs co ON co.id = m.cash_out_id
-- LEFT JOIN ledger_entries le ON le.id = m.ledger_entry_id;
-- Expected: total = has_cash_out = has_ledger = fully_consistent

-- 3.3 Ledger vs cashflow net for settlement payments (post-backfill)
-- SELECT
--   (SELECT COALESCE(SUM(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END),0)
--    FROM ledger_entries
--    WHERE source_type IN ('HOST_SETTLEMENT_PAYMENT','SERVICE_SETTLEMENT_PAYMENT')) AS ledger_net,
--   (SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END),0)
--    FROM cashflow_entries
--    WHERE source_type IN ('HOST_SETTLEMENT_PAYMENT','SERVICE_SETTLEMENT_PAYMENT')) AS cashflow_net;
-- Expected: ledger_net = cashflow_net (for post-backfill entries)

-- 3.4 Verify backfill run summary
-- SELECT * FROM backfill_runs ORDER BY started_at DESC LIMIT 5;
