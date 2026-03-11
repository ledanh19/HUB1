
-- Drop old 2-param signature before creating new 3-param version
DROP FUNCTION IF EXISTS public.backfill_deductions_to_ledger(INT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.backfill_deductions_to_ledger(
  p_limit INT DEFAULT 500,
  p_dry_run BOOLEAN DEFAULT true,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ded RECORD;
  v_recon_id UUID;
  v_existing_recon_id UUID;
  v_post_result JSONB;
  v_user_id UUID;
  v_created_count INT := 0;
  v_posted_count INT := 0;
  v_skipped_count INT := 0;
  v_errors JSONB := '[]'::jsonb;
  v_dry_items JSONB := '[]'::jsonb;
  v_direction TEXT;
  v_item_type TEXT;
  v_economic_date DATE;
  v_period_locked BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Must be authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user_id AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: Only super_admin can run backfill'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT p_dry_run AND (p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 10) THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Backfill reason must be at least 10 characters'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_ded IN
    SELECT d.id, d.payout_id, d.deduction_type, d.amount, d.reason_note,
           d.unified_booking_id, d.created_at, d.created_by,
           p.ota_source, p.payout_date, p.status AS payout_status
    FROM ota_payout_deductions d
    JOIN ota_payouts p ON p.id = d.payout_id
    WHERE d.is_deleted = false
    ORDER BY d.created_at ASC
    LIMIT p_limit
  LOOP
    IF v_ded.deduction_type = 'DECREASE' THEN
      v_direction := 'CREDIT';
      v_item_type := 'MANUAL_ADJUSTMENT';
    ELSIF v_ded.deduction_type = 'INCREASE' THEN
      v_direction := 'DEBIT';
      v_item_type := 'MANUAL_ADJUSTMENT';
    ELSE
      v_direction := 'CREDIT';
      v_item_type := 'OTHER';
    END IF;

    v_economic_date := COALESCE(v_ded.payout_date, v_ded.created_at::date);

    IF p_dry_run THEN
      SELECT id INTO v_existing_recon_id
      FROM ota_payout_reconciliation_items
      WHERE idempotency_key = 'deduction_' || v_ded.id::text;

      SELECT EXISTS (
        SELECT 1 FROM accounting_periods
        WHERE is_locked = true
          AND v_economic_date BETWEEN period_start::date AND period_end::date
      ) INTO v_period_locked;

      v_dry_items := v_dry_items || jsonb_build_object(
        'deduction_id', v_ded.id,
        'payout_id', v_ded.payout_id,
        'deduction_type', v_ded.deduction_type,
        'amount', ABS(v_ded.amount),
        'reason_note', v_ded.reason_note,
        'ota_source', v_ded.ota_source,
        'payout_date', v_ded.payout_date,
        'economic_date', v_economic_date,
        'already_bridged', v_existing_recon_id IS NOT NULL,
        'existing_recon_id', v_existing_recon_id,
        'period_locked', v_period_locked
      );
      v_created_count := v_created_count + 1;
    ELSE
      BEGIN
        SELECT EXISTS (
          SELECT 1 FROM accounting_periods
          WHERE is_locked = true
            AND v_economic_date BETWEEN period_start::date AND period_end::date
        ) INTO v_period_locked;

        IF v_period_locked THEN
          v_errors := v_errors || jsonb_build_object(
            'deduction_id', v_ded.id,
            'payout_id', v_ded.payout_id,
            'error', 'PERIOD_LOCK: Economic date ' || v_economic_date::text || ' is in locked period'
          );
          v_skipped_count := v_skipped_count + 1;
          CONTINUE;
        END IF;

        PERFORM 1 FROM ota_payouts WHERE id = v_ded.payout_id FOR UPDATE;

        SELECT id INTO v_existing_recon_id
        FROM ota_payout_reconciliation_items
        WHERE idempotency_key = 'deduction_' || v_ded.id::text;

        IF v_existing_recon_id IS NOT NULL THEN
          IF (SELECT ledger_entry_id FROM ota_payout_reconciliation_items WHERE id = v_existing_recon_id) IS NULL THEN
            v_post_result := post_ota_payout_adjustment_to_ledger_atomic(v_existing_recon_id);
            v_posted_count := v_posted_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
          CONTINUE;
        END IF;

        INSERT INTO ota_payout_reconciliation_items (
          payout_id, item_type, amount, note, direction,
          economic_date, deduction_id, idempotency_key, created_by
        ) VALUES (
          v_ded.payout_id,
          v_item_type,
          ABS(v_ded.amount),
          v_ded.reason_note,
          v_direction,
          v_economic_date,
          v_ded.id,
          'deduction_' || v_ded.id::text,
          COALESCE(v_ded.created_by, v_user_id)
        ) RETURNING id INTO v_recon_id;

        v_created_count := v_created_count + 1;

        PERFORM classify_ota_payout_adjustment(v_recon_id);

        v_post_result := post_ota_payout_adjustment_to_ledger_atomic(v_recon_id);
        v_posted_count := v_posted_count + 1;

      EXCEPTION WHEN OTHERS THEN
        v_skipped_count := v_skipped_count + 1;
        v_errors := v_errors || jsonb_build_object(
          'deduction_id', v_ded.id,
          'payout_id', v_ded.payout_id,
          'error', SQLERRM
        );
      END;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
    VALUES (
      'BACKFILL_PAYOUT_DEDUCTIONS',
      'SYSTEM_JOB',
      'backfill_deductions_' || now()::text,
      v_user_id,
      jsonb_build_object(
        'reason', TRIM(p_reason),
        'created_recon_items', v_created_count,
        'posted_to_ledger', v_posted_count,
        'skipped', v_skipped_count,
        'errors_count', jsonb_array_length(v_errors),
        'errors_sample', v_errors
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'total_deductions_processed', v_created_count + v_skipped_count,
    'created_recon_items', v_created_count,
    'posted_to_ledger', v_posted_count,
    'skipped', v_skipped_count,
    'errors', v_errors,
    'items', CASE WHEN p_dry_run THEN v_dry_items ELSE '[]'::jsonb END
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.backfill_deductions_to_ledger(INT, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.backfill_deductions_to_ledger IS
  'Sprint 16: Hardened backfill — super_admin only, period lock check, FOR UPDATE locking, reason audit trail. Idempotent.';
