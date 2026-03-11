
-- Sprint 12C: Settlement payment backfill
-- Creates tracking table + idempotent backfill RPC

-- Backfill tracking table
CREATE TABLE IF NOT EXISTS public.backfill_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  rows_processed INT DEFAULT 0,
  rows_skipped INT DEFAULT 0,
  rows_failed INT DEFAULT 0,
  error_details JSONB DEFAULT NULL,
  metadata JSONB DEFAULT NULL
);

ALTER TABLE public.backfill_runs ENABLE ROW LEVEL SECURITY;

-- Backfill RPC: enriches cashflow_entries with settlement metadata
CREATE OR REPLACE FUNCTION public.run_settlement_payment_backfill_secure(
  p_batch_size INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_run_id UUID;
  v_processed INT := 0;
  v_skipped INT := 0;
  v_failed INT := 0;
  v_row RECORD;
  v_settlement_id UUID;
  v_settlement_code TEXT;
  v_is_locked BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Create run record
  INSERT INTO backfill_runs (run_type, metadata)
  VALUES ('settlement_payment_backfill', jsonb_build_object('batch_size', p_batch_size, 'user_id', v_user_id))
  RETURNING id INTO v_run_id;

  -- Process batch
  FOR v_row IN
    SELECT cf.id, cf.source_type, cf.source_id, cf.cash_date
    FROM cashflow_entries cf
    WHERE cf.source_type IN ('HOST_SETTLEMENT_PAYMENT', 'SERVICE_SETTLEMENT_PAYMENT')
      AND (cf.metadata IS NULL OR NOT (cf.metadata ? 'settlement_id'))
    ORDER BY cf.created_at ASC
    LIMIT p_batch_size
  LOOP
    BEGIN
      -- Check period lock
      SELECT EXISTS (
        SELECT 1 FROM accounting_periods ap
        WHERE ap.is_locked = true
          AND v_row.cash_date >= ap.period_start::DATE
          AND v_row.cash_date <= ap.period_end::DATE
      ) INTO v_is_locked;

      IF v_is_locked THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      -- Find settlement from source_id (which should be settlement UUID)
      -- Try host_settlements first
      IF v_row.source_type = 'HOST_SETTLEMENT_PAYMENT' THEN
        SELECT id, settlement_code INTO v_settlement_id, v_settlement_code
        FROM host_settlements WHERE id::TEXT = v_row.source_id;
      ELSIF v_row.source_type = 'SERVICE_SETTLEMENT_PAYMENT' THEN
        SELECT id, settlement_code INTO v_settlement_id, v_settlement_code
        FROM service_settlements WHERE id::TEXT = v_row.source_id;
      END IF;

      IF v_settlement_id IS NOT NULL THEN
        UPDATE cashflow_entries
        SET metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
          'settlement_id', v_settlement_id,
          'settlement_code', v_settlement_code,
          'backfilled_at', now()::TEXT,
          'backfill_run_id', v_run_id
        )
        WHERE id = v_row.id;

        v_processed := v_processed + 1;
      ELSE
        -- source_id might be cash_out id, try to find via cash_outs.settlement_id
        SELECT co.settlement_id INTO v_settlement_id
        FROM cash_outs co WHERE co.id::TEXT = v_row.source_id AND co.settlement_id IS NOT NULL;

        IF v_settlement_id IS NOT NULL THEN
          UPDATE cashflow_entries
          SET metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
            'settlement_id', v_settlement_id,
            'backfilled_at', now()::TEXT,
            'backfill_run_id', v_run_id
          )
          WHERE id = v_row.id;
          v_processed := v_processed + 1;
        ELSE
          v_failed := v_failed + 1;
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Update run record
  UPDATE backfill_runs
  SET completed_at = now(),
      rows_processed = v_processed,
      rows_skipped = v_skipped,
      rows_failed = v_failed
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'processed', v_processed,
    'skipped', v_skipped,
    'failed', v_failed,
    'status', 'OK'
  );
END;
$$;
