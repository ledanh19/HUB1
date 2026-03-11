
-- ============================================================================
-- BACKFILL: Convert ota_payout_deductions → ota_payout_reconciliation_items → ledger
-- Idempotent: uses idempotency_key = 'deduction_' || deduction_id
-- ============================================================================

-- Enhanced backfill RPC that also bridges deductions to recon items
CREATE OR REPLACE FUNCTION public.backfill_deductions_to_ledger(
  p_limit INT DEFAULT 500,
  p_dry_run BOOLEAN DEFAULT true
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
BEGIN
  v_user_id := auth.uid();

  FOR v_ded IN
    SELECT d.id, d.payout_id, d.deduction_type, d.amount, d.reason_note,
           d.unified_booking_id, d.created_at, d.created_by,
           p.ota_source, p.payout_date, p.status AS payout_status
    FROM ota_payout_deductions d
    JOIN ota_payouts p ON p.id = d.payout_id
    ORDER BY d.created_at ASC
    LIMIT p_limit
  LOOP
    -- Determine direction and item_type from deduction_type
    IF v_ded.deduction_type = 'DECREASE' THEN
      v_direction := 'CREDIT';  -- money going out / reduction
      v_item_type := 'MANUAL_ADJUSTMENT';
    ELSIF v_ded.deduction_type = 'INCREASE' THEN
      v_direction := 'DEBIT';   -- money coming in / addition
      v_item_type := 'MANUAL_ADJUSTMENT';
    ELSE
      v_direction := 'CREDIT';
      v_item_type := 'OTHER';
    END IF;

    IF p_dry_run THEN
      -- Check if already bridged
      SELECT id INTO v_existing_recon_id
      FROM ota_payout_reconciliation_items
      WHERE idempotency_key = 'deduction_' || v_ded.id::text;

      v_dry_items := v_dry_items || jsonb_build_object(
        'deduction_id', v_ded.id,
        'payout_id', v_ded.payout_id,
        'deduction_type', v_ded.deduction_type,
        'amount', ABS(v_ded.amount),
        'reason_note', v_ded.reason_note,
        'ota_source', v_ded.ota_source,
        'payout_date', v_ded.payout_date,
        'already_bridged', v_existing_recon_id IS NOT NULL,
        'existing_recon_id', v_existing_recon_id
      );
      v_created_count := v_created_count + 1;
    ELSE
      BEGIN
        -- Check idempotency: skip if already bridged
        SELECT id INTO v_existing_recon_id
        FROM ota_payout_reconciliation_items
        WHERE idempotency_key = 'deduction_' || v_ded.id::text;

        IF v_existing_recon_id IS NOT NULL THEN
          -- Already bridged, just ensure it's posted to ledger
          IF (SELECT ledger_entry_id FROM ota_payout_reconciliation_items WHERE id = v_existing_recon_id) IS NULL THEN
            v_post_result := post_ota_payout_adjustment_to_ledger_atomic(v_existing_recon_id);
            v_posted_count := v_posted_count + 1;
          ELSE
            v_skipped_count := v_skipped_count + 1;
          END IF;
          CONTINUE;
        END IF;

        -- Create recon item from deduction
        INSERT INTO ota_payout_reconciliation_items (
          payout_id, item_type, amount, note, direction,
          idempotency_key, created_by
        ) VALUES (
          v_ded.payout_id,
          v_item_type,
          ABS(v_ded.amount),  -- recon items store positive amounts
          v_ded.reason_note,
          v_direction,
          'deduction_' || v_ded.id::text,
          COALESCE(v_ded.created_by, v_user_id)
        ) RETURNING id INTO v_recon_id;

        v_created_count := v_created_count + 1;

        -- Classify it
        PERFORM classify_ota_payout_adjustment(v_recon_id);

        -- Post to ledger
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

  -- Write audit log (real run only)
  IF NOT p_dry_run AND (v_created_count > 0 OR v_posted_count > 0) THEN
    INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
    VALUES (
      'BACKFILL_OTA_PAYOUT_ADJUSTMENTS',
      'SYSTEM_JOB',
      'backfill_deductions_' || now()::text,
      v_user_id,
      jsonb_build_object(
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

GRANT EXECUTE ON FUNCTION public.backfill_deductions_to_ledger(INT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.backfill_deductions_to_ledger IS
  'Backfill: bridges ota_payout_deductions → reconciliation_items → ledger_entries. Idempotent via idempotency_key.';
