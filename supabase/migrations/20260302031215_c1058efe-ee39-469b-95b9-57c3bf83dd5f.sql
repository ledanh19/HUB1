-- Patch RBAC for backfill RPC: allow service/backoffice execution without auth.uid()
CREATE OR REPLACE FUNCTION public.backfill_host_settlement_manual_netting(
  p_dry_run boolean DEFAULT true,
  p_limit int DEFAULT 100,
  p_partner_id uuid DEFAULT NULL,
  p_settlement_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  run_id uuid,
  settlement_id uuid,
  settlement_code text,
  action text,
  correction_type text,
  correction_amount numeric,
  period_locked boolean,
  source_ref_id text,
  note text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_run_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_org uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_period_locked boolean;
  v_apply_type text;
  v_source_ref text;
  v_correction_id uuid;
  v_audit_id uuid;
  v_action text;
BEGIN
  -- RBAC-safe rule:
  -- - If called from authenticated app user => must be admin/ke_toan
  -- - If called from backend/service SQL context (auth.uid() is null) => allow
  IF v_actor IS NOT NULL AND NOT (
    has_role(v_actor, 'admin'::app_role)
    OR has_role(v_actor, 'ke_toan'::app_role)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: only admin/ke_toan can run backfill_host_settlement_manual_netting';
  END IF;

  FOR rec IN
    WITH s AS (
      SELECT
        v.settlement_id,
        v.settlement_code,
        v.partner_id,
        v.period_to,
        v.status,
        v.total_payable_amount,
        v.total_paid_cash,
        v.total_deposits_applied,
        v.total_prepaids_applied,
        v.remaining_amount_snapshot,
        v.header_recomputed_net,
        v.apply_events_total,
        v.recomputed_net,
        (v.recomputed_net - COALESCE(v.total_paid_cash,0)) AS missing_apply_amount,
        v.period_locked,
        v.has_deposit_record,
        v.has_prepaid_record,
        v.has_manual_netting_keywords,
        v.request_code,
        v.latest_payment_note,
        v.difference_reason,
        (
          SELECT pr.id
          FROM public.payment_requests pr
          WHERE pr.settlement_id = v.settlement_id
          ORDER BY pr.created_at DESC
          LIMIT 1
        ) AS source_payment_request_id,
        (
          SELECT co.id
          FROM public.cash_outs co
          JOIN public.payment_requests pr2 ON pr2.id = co.payment_request_id
          WHERE pr2.settlement_id = v.settlement_id
          ORDER BY co.paid_at DESC
          LIMIT 1
        ) AS source_cash_out_id
      FROM public.v_settlement_net_integrity v
      WHERE v.status IN ('FINALIZED','CLOSED','SETTLED','PARTIALLY_PAID')
        AND (p_partner_id IS NULL OR v.partner_id = p_partner_id)
        AND (p_settlement_ids IS NULL OR v.settlement_id = ANY (p_settlement_ids))
        AND v.has_manual_netting_keywords = true
        AND (v.recomputed_net - COALESCE(v.total_paid_cash,0)) > 1000
      ORDER BY (v.recomputed_net - COALESCE(v.total_paid_cash,0)) DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000))
    )
    SELECT * FROM s
  LOOP
    v_period_locked := public.is_period_locked(v_org, rec.period_to::date);

    IF rec.has_prepaid_record THEN
      v_apply_type := 'PREPAID_APPLY';
    ELSIF rec.has_deposit_record THEN
      v_apply_type := 'DEPOSIT_APPLY';
    ELSE
      v_apply_type := 'MANUAL_NETTING';
    END IF;

    v_source_ref := COALESCE(
      rec.source_payment_request_id::text,
      'HS:' || rec.settlement_id::text || ':LEGACY_MANUAL_NETTING'
    );

    IF EXISTS (
      SELECT 1
      FROM public.host_settlement_apply_events e
      WHERE e.settlement_id = rec.settlement_id
        AND e.apply_type = v_apply_type
        AND e.source_ref_id = v_source_ref
    ) THEN
      v_action := 'SKIPPED_ALREADY_APPLIED';

      INSERT INTO public.host_settlement_manual_netting_backfill_log (
        run_id, settlement_id, action, dry_run, result, created_by
      ) VALUES (
        v_run_id,
        rec.settlement_id,
        v_action,
        p_dry_run,
        jsonb_build_object(
          'reason_tag', '[LEGACY_MANUAL_NETTING_FIX]',
          'missing_apply_amount', rec.missing_apply_amount,
          'apply_type', v_apply_type,
          'source_ref_id', v_source_ref
        ),
        v_actor
      );

      run_id := v_run_id;
      settlement_id := rec.settlement_id;
      settlement_code := rec.settlement_code;
      action := v_action;
      correction_type := v_apply_type;
      correction_amount := rec.missing_apply_amount;
      period_locked := v_period_locked;
      source_ref_id := v_source_ref;
      note := 'Idempotent skip';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_action := CASE
        WHEN v_period_locked THEN 'DRY_RUN_LOCKED_WILL_CREATE_EVENT_ONLY'
        ELSE 'DRY_RUN_WILL_CREATE_EVENT'
      END;

      INSERT INTO public.host_settlement_manual_netting_backfill_log (
        run_id, settlement_id, action, dry_run, result, created_by
      ) VALUES (
        v_run_id,
        rec.settlement_id,
        v_action,
        true,
        jsonb_build_object(
          'reason_tag', '[LEGACY_MANUAL_NETTING_FIX]',
          'missing_apply_amount', rec.missing_apply_amount,
          'apply_type', v_apply_type,
          'source_ref_id', v_source_ref,
          'request_code', rec.request_code,
          'difference_reason', rec.difference_reason,
          'period_locked', v_period_locked
        ),
        v_actor
      );

      run_id := v_run_id;
      settlement_id := rec.settlement_id;
      settlement_code := rec.settlement_code;
      action := v_action;
      correction_type := v_apply_type;
      correction_amount := rec.missing_apply_amount;
      period_locked := v_period_locked;
      source_ref_id := v_source_ref;
      note := '[LEGACY_MANUAL_NETTING_FIX] dry-run';
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.host_settlement_apply_events (
      settlement_id,
      partner_id,
      apply_type,
      amount,
      source_table,
      source_id,
      source_payment_request_id,
      source_cash_out_id,
      source_ref_id,
      reason,
      reason_tag,
      metadata,
      is_legacy,
      created_by,
      backfill_run_id
    ) VALUES (
      rec.settlement_id,
      rec.partner_id,
      v_apply_type,
      rec.missing_apply_amount,
      CASE
        WHEN rec.has_prepaid_record THEN 'host_prepaids'
        WHEN rec.has_deposit_record THEN 'host_deposits'
        ELSE 'manual_note'
      END,
      NULL,
      rec.source_payment_request_id,
      rec.source_cash_out_id,
      v_source_ref,
      '[LEGACY_MANUAL_NETTING_FIX] Backfill from legacy manual netting in payment request note/difference_reason',
      '[LEGACY_MANUAL_NETTING_FIX]',
      jsonb_build_object(
        'request_code', rec.request_code,
        'difference_reason', rec.difference_reason,
        'latest_payment_note', rec.latest_payment_note,
        'header_recomputed_net', rec.header_recomputed_net,
        'paid_cash', rec.total_paid_cash,
        'existing_apply_events_total', rec.apply_events_total,
        'missing_apply_amount', rec.missing_apply_amount,
        'period_locked', v_period_locked
      ),
      true,
      v_actor,
      v_run_id
    ) RETURNING id INTO v_correction_id;

    INSERT INTO public.audit_logs (
      user_id,
      action,
      entity,
      entity_id,
      before_data,
      after_data,
      is_sample_data,
      override_reason
    ) VALUES (
      v_actor,
      'LEGACY_MANUAL_NETTING_FIX_APPLY',
      'host_settlement_apply_events',
      rec.settlement_id::text,
      jsonb_build_object(
        'reason_tag', '[LEGACY_MANUAL_NETTING_FIX]',
        'settlement_id', rec.settlement_id,
        'settlement_code', rec.settlement_code,
        'header_recomputed_net', rec.header_recomputed_net,
        'paid_cash', rec.total_paid_cash,
        'existing_apply_events_total', rec.apply_events_total,
        'missing_apply_amount', rec.missing_apply_amount,
        'period_locked', v_period_locked
      ),
      jsonb_build_object(
        'apply_event_id', v_correction_id,
        'apply_type', v_apply_type,
        'amount', rec.missing_apply_amount,
        'source_ref_id', v_source_ref,
        'run_id', v_run_id
      ),
      false,
      '[LEGACY_MANUAL_NETTING_FIX]'
    ) RETURNING id INTO v_audit_id;

    v_action := CASE
      WHEN v_period_locked THEN 'APPLIED_EVENT_LOCKED_PERIOD'
      ELSE 'APPLIED_EVENT'
    END;

    INSERT INTO public.host_settlement_manual_netting_backfill_log (
      run_id, settlement_id, action, dry_run, result, created_by
    ) VALUES (
      v_run_id,
      rec.settlement_id,
      v_action,
      false,
      jsonb_build_object(
        'reason_tag', '[LEGACY_MANUAL_NETTING_FIX]',
        'apply_event_id', v_correction_id,
        'audit_log_id', v_audit_id,
        'apply_type', v_apply_type,
        'amount', rec.missing_apply_amount,
        'source_ref_id', v_source_ref,
        'period_locked', v_period_locked
      ),
      v_actor
    );

    run_id := v_run_id;
    settlement_id := rec.settlement_id;
    settlement_code := rec.settlement_code;
    action := v_action;
    correction_type := v_apply_type;
    correction_amount := rec.missing_apply_amount;
    period_locked := v_period_locked;
    source_ref_id := v_source_ref;
    note := '[LEGACY_MANUAL_NETTING_FIX] applied';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_host_settlement_manual_netting(boolean, int, uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_host_settlement_manual_netting(boolean, int, uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_host_settlement_manual_netting(boolean, int, uuid, uuid[]) TO service_role;
