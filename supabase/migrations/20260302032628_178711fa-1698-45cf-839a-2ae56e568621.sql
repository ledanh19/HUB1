
-- Drop existing view and functions first to avoid column rename errors
DROP VIEW IF EXISTS public.v_settlement_net_integrity CASCADE;
DROP FUNCTION IF EXISTS public.recompute_host_settlement_remaining_snapshot(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.backfill_host_settlement_manual_netting(boolean, int, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.backfill_host_settlement_manual_netting(boolean, int, uuid, uuid[], boolean);

-- 1) Integrity view v2
CREATE VIEW public.v_settlement_net_integrity AS
WITH base AS (
  SELECT
    hs.id AS settlement_id, hs.settlement_code, hs.partner_id,
    hs.period_from, hs.period_to, hs.status,
    hs.total_payable_amount, hs.total_host_collected,
    hs.total_deposits_applied, hs.total_prepaids_applied,
    hs.remaining_amount,
    (COALESCE(hs.total_payable_amount,0) - COALESCE(hs.total_host_collected,0) 
     - COALESCE(hs.total_deposits_applied,0) - COALESCE(hs.total_prepaids_applied,0)) AS header_recomputed_net
  FROM public.host_settlements hs WHERE hs.status <> 'VOID'
),
paid AS (
  SELECT source_id::uuid AS settlement_id,
    SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END) AS total_paid_cash_out
  FROM public.cashflow_entries
  WHERE source_type = 'HOST_SETTLEMENT_PAYMENT' AND source_id IS NOT NULL
  GROUP BY source_id::uuid
),
applied AS (
  SELECT settlement_id, SUM(amount) AS apply_events_total
  FROM public.host_settlement_apply_events GROUP BY settlement_id
),
latest_request AS (
  SELECT DISTINCT ON (pr.settlement_id)
    pr.settlement_id, pr.id AS payment_request_id, pr.request_code,
    pr.note, pr.difference_reason, pr.proposed_amount, pr.created_at
  FROM public.payment_requests pr WHERE pr.settlement_id IS NOT NULL
  ORDER BY pr.settlement_id, pr.created_at DESC
),
flags AS (
  SELECT b.*,
    COALESCE(p.total_paid_cash_out,0) AS total_paid_cash,
    COALESCE(a.apply_events_total,0) AS apply_events_total,
    (b.header_recomputed_net - COALESCE(a.apply_events_total,0)) AS recomputed_net
  FROM base b
  LEFT JOIN paid p ON p.settlement_id = b.settlement_id
  LEFT JOIN applied a ON a.settlement_id = b.settlement_id
)
SELECT
  f.settlement_id, f.settlement_code, f.partner_id,
  f.period_from, f.period_to, f.status,
  f.total_payable_amount, f.total_paid_cash,
  f.total_deposits_applied, f.total_prepaids_applied,
  f.remaining_amount AS remaining_amount_snapshot,
  f.header_recomputed_net, f.apply_events_total, f.recomputed_net,
  (COALESCE(f.remaining_amount,0) - f.recomputed_net) AS delta,
  GREATEST(f.recomputed_net - f.total_paid_cash, 0) AS remaining_effective,
  (f.total_paid_cash >= f.recomputed_net - 1000) AS is_effectively_fully_paid,
  lr.request_code, lr.note AS latest_payment_note, lr.difference_reason,
  CASE
    WHEN lr.note IS NULL AND lr.difference_reason IS NULL THEN NULL
    ELSE NULLIF(regexp_replace(COALESCE((regexp_match(
      lower(COALESCE(lr.difference_reason,'') || ' ' || COALESCE(lr.note,'')),
      '([0-9][0-9\\., ]{2,})'
    ))[1],''),'[^0-9]','','g'),'')::numeric
  END AS extracted_manual_netting_amount,
  public.is_period_locked('00000000-0000-0000-0000-000000000001'::uuid, f.period_to) AS period_locked,
  EXISTS (
    SELECT 1 FROM public.settlement_bookings sb
    JOIN public.host_deposits d ON d.unified_booking_id = sb.unified_booking_id
    WHERE sb.settlement_id = f.settlement_id AND d.partner_id = f.partner_id
  ) AS has_deposit_record,
  EXISTS (
    SELECT 1 FROM public.settlement_bookings sb
    JOIN public.host_prepaids pp ON pp.unified_booking_id = sb.unified_booking_id
    WHERE sb.settlement_id = f.settlement_id AND pp.partner_id = f.partner_id
  ) AS has_prepaid_record,
  (
    lower(COALESCE(lr.note,'')) ~ '(cọc|deposit|trả trước|prepaid|đã trừ|đã cấn|tru_coc|tru_prepaid|trừ cọc|cấn trừ)'
    OR lower(COALESCE(lr.difference_reason,'')) ~ '(cọc|deposit|trả trước|prepaid|đã trừ|đã cấn|tru_coc|tru_prepaid|trừ cọc|cấn trừ)'
  ) AS has_manual_netting_keywords
FROM flags f
LEFT JOIN latest_request lr ON lr.settlement_id = f.settlement_id;

GRANT SELECT ON public.v_settlement_net_integrity TO authenticated;

-- 2) Recompute snapshot function (respects period lock)
CREATE OR REPLACE FUNCTION public.recompute_host_settlement_remaining_snapshot(
  p_org_id uuid, p_settlement_id uuid, p_tolerance numeric DEFAULT 1000
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_locked boolean;
  v_row record;
  v_actor uuid := auth.uid();
BEGIN
  SELECT v.period_locked, v.remaining_effective, v.remaining_amount_snapshot
  INTO v_row FROM public.v_settlement_net_integrity v WHERE v.settlement_id = p_settlement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Settlement not found: %', p_settlement_id; END IF;

  v_locked := public.is_period_locked(p_org_id, (SELECT period_to FROM public.host_settlements WHERE id=p_settlement_id));
  IF v_locked THEN RETURN; END IF;

  IF abs(COALESCE(v_row.remaining_amount_snapshot,0) - COALESCE(v_row.remaining_effective,0)) > p_tolerance THEN
    UPDATE public.host_settlements SET remaining_amount = v_row.remaining_effective WHERE id = p_settlement_id;
    INSERT INTO public.audit_logs(user_id, action, entity, entity_id, before_data, after_data, is_sample_data, override_reason)
    VALUES (COALESCE(v_actor,'00000000-0000-0000-0000-000000000000'::uuid),
      'LEGACY_MANUAL_NETTING_FIX_SNAPSHOT_RECOMPUTE','host_settlements',p_settlement_id::text,
      jsonb_build_object('remaining_amount',v_row.remaining_amount_snapshot),
      jsonb_build_object('remaining_amount',v_row.remaining_effective), false, '[LEGACY_MANUAL_NETTING_FIX]');
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.recompute_host_settlement_remaining_snapshot(uuid,uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_host_settlement_remaining_snapshot(uuid,uuid,numeric) TO service_role;

-- 3) Backfill RPC v2 (skip locked default + recompute snapshot)
CREATE OR REPLACE FUNCTION public.backfill_host_settlement_manual_netting(
  p_dry_run boolean DEFAULT true, p_limit int DEFAULT 100,
  p_partner_id uuid DEFAULT NULL, p_settlement_ids uuid[] DEFAULT NULL,
  p_skip_locked boolean DEFAULT true
)
RETURNS TABLE (
  run_id uuid, settlement_id uuid, settlement_code text, action text,
  correction_type text, correction_amount numeric, period_locked boolean,
  source_ref_id text, note text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_run_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_org uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_period_locked boolean; v_apply_type text; v_source_ref text;
  v_event_id uuid; v_audit_id uuid; v_action text;
BEGIN
  IF v_actor IS NOT NULL AND NOT (
    public.has_role(v_actor,'admin'::public.app_role) OR public.has_role(v_actor,'ke_toan'::public.app_role)
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  FOR rec IN
    WITH s AS (
      SELECT v.settlement_id, v.settlement_code, v.partner_id, v.period_to, v.status,
        v.total_paid_cash, v.recomputed_net,
        (v.recomputed_net - COALESCE(v.total_paid_cash,0)) AS missing_apply_amount,
        v.period_locked, v.has_deposit_record, v.has_prepaid_record, v.has_manual_netting_keywords,
        v.request_code, v.latest_payment_note, v.difference_reason,
        (SELECT pr.id FROM public.payment_requests pr WHERE pr.settlement_id=v.settlement_id ORDER BY pr.created_at DESC LIMIT 1) AS source_payment_request_id,
        (SELECT co.id FROM public.cash_outs co JOIN public.payment_requests pr2 ON pr2.id=co.payment_request_id WHERE pr2.settlement_id=v.settlement_id ORDER BY co.paid_at DESC LIMIT 1) AS source_cash_out_id
      FROM public.v_settlement_net_integrity v
      WHERE v.status IN ('FINALIZED','CLOSED','SETTLED','PARTIALLY_PAID')
        AND (p_partner_id IS NULL OR v.partner_id=p_partner_id)
        AND (p_settlement_ids IS NULL OR v.settlement_id=ANY(p_settlement_ids))
        AND v.has_manual_netting_keywords=true
        AND (v.recomputed_net - COALESCE(v.total_paid_cash,0)) > 1000
      ORDER BY (v.recomputed_net - COALESCE(v.total_paid_cash,0)) DESC
      LIMIT GREATEST(1,LEAST(COALESCE(p_limit,100),1000))
    ) SELECT * FROM s
  LOOP
    v_period_locked := public.is_period_locked(v_org, rec.period_to);
    IF rec.has_prepaid_record THEN v_apply_type:='PREPAID_APPLY';
    ELSIF rec.has_deposit_record THEN v_apply_type:='DEPOSIT_APPLY';
    ELSE v_apply_type:='MANUAL_NETTING'; END IF;
    v_source_ref := COALESCE(rec.source_payment_request_id::text,'HS:'||rec.settlement_id::text||':LEGACY');

    -- Idempotent
    IF EXISTS (SELECT 1 FROM public.host_settlement_apply_events e WHERE e.settlement_id=rec.settlement_id AND e.apply_type=v_apply_type AND e.source_ref_id=v_source_ref) THEN
      v_action:='SKIPPED_ALREADY_APPLIED';
      INSERT INTO public.host_settlement_manual_netting_backfill_log(run_id,settlement_id,action,dry_run,result,created_by)
      VALUES(v_run_id,rec.settlement_id,v_action,p_dry_run,jsonb_build_object('amount',rec.missing_apply_amount,'apply_type',v_apply_type),v_actor);
      run_id:=v_run_id; settlement_id:=rec.settlement_id; settlement_code:=rec.settlement_code;
      action:=v_action; correction_type:=v_apply_type; correction_amount:=rec.missing_apply_amount;
      period_locked:=v_period_locked; source_ref_id:=v_source_ref; note:='Idempotent skip';
      RETURN NEXT; CONTINUE;
    END IF;

    -- Lock guard
    IF v_period_locked AND p_skip_locked THEN
      v_action:='SKIPPED_LOCKED_PERIOD';
      INSERT INTO public.host_settlement_manual_netting_backfill_log(run_id,settlement_id,action,dry_run,result,created_by)
      VALUES(v_run_id,rec.settlement_id,v_action,p_dry_run,jsonb_build_object('amount',rec.missing_apply_amount,'period_locked',true),v_actor);
      run_id:=v_run_id; settlement_id:=rec.settlement_id; settlement_code:=rec.settlement_code;
      action:=v_action; correction_type:=v_apply_type; correction_amount:=rec.missing_apply_amount;
      period_locked:=v_period_locked; source_ref_id:=v_source_ref; note:='Locked period';
      RETURN NEXT; CONTINUE;
    END IF;

    -- Dry run
    IF p_dry_run THEN
      v_action:='DRY_RUN_WILL_CREATE_EVENT';
      INSERT INTO public.host_settlement_manual_netting_backfill_log(run_id,settlement_id,action,dry_run,result,created_by)
      VALUES(v_run_id,rec.settlement_id,v_action,true,jsonb_build_object('amount',rec.missing_apply_amount,'apply_type',v_apply_type,
        'source_ref_id',v_source_ref,'request_code',rec.request_code,'period_locked',v_period_locked),v_actor);
      run_id:=v_run_id; settlement_id:=rec.settlement_id; settlement_code:=rec.settlement_code;
      action:=v_action; correction_type:=v_apply_type; correction_amount:=rec.missing_apply_amount;
      period_locked:=v_period_locked; source_ref_id:=v_source_ref; note:='Dry-run';
      RETURN NEXT; CONTINUE;
    END IF;

    -- Real apply
    INSERT INTO public.host_settlement_apply_events(org_id,settlement_id,partner_id,apply_type,amount,currency,
      source_table,source_id,source_payment_request_id,source_cash_out_id,source_ref_id,reason,reason_tag,metadata,is_legacy,created_by,backfill_run_id)
    VALUES(v_org,rec.settlement_id,rec.partner_id,v_apply_type,rec.missing_apply_amount,'VND',
      CASE WHEN rec.has_prepaid_record THEN 'host_prepaids' WHEN rec.has_deposit_record THEN 'host_deposits' ELSE 'manual_note' END,
      NULL,rec.source_payment_request_id,rec.source_cash_out_id,v_source_ref,
      '[LEGACY_MANUAL_NETTING_FIX]','[LEGACY_MANUAL_NETTING_FIX]',
      jsonb_build_object('request_code',rec.request_code,'difference_reason',rec.difference_reason,'paid_cash',rec.total_paid_cash,'amount',rec.missing_apply_amount),
      true,v_actor,v_run_id) RETURNING id INTO v_event_id;

    INSERT INTO public.audit_logs(user_id,action,entity,entity_id,before_data,after_data,is_sample_data,override_reason)
    VALUES(COALESCE(v_actor,'00000000-0000-0000-0000-000000000000'::uuid),'LEGACY_MANUAL_NETTING_FIX_APPLY','host_settlement_apply_events',rec.settlement_id::text,
      jsonb_build_object('settlement_code',rec.settlement_code,'amount',rec.missing_apply_amount),
      jsonb_build_object('apply_event_id',v_event_id,'apply_type',v_apply_type,'amount',rec.missing_apply_amount,'run_id',v_run_id),
      false,'[LEGACY_MANUAL_NETTING_FIX]') RETURNING id INTO v_audit_id;

    PERFORM public.recompute_host_settlement_remaining_snapshot(v_org,rec.settlement_id,1000);

    v_action:='APPLIED_EVENT';
    INSERT INTO public.host_settlement_manual_netting_backfill_log(run_id,settlement_id,action,dry_run,result,created_by)
    VALUES(v_run_id,rec.settlement_id,v_action,false,jsonb_build_object('apply_event_id',v_event_id,'audit_log_id',v_audit_id,'apply_type',v_apply_type,'amount',rec.missing_apply_amount),v_actor);
    run_id:=v_run_id; settlement_id:=rec.settlement_id; settlement_code:=rec.settlement_code;
    action:=v_action; correction_type:=v_apply_type; correction_amount:=rec.missing_apply_amount;
    period_locked:=v_period_locked; source_ref_id:=v_source_ref; note:='Applied';
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_host_settlement_manual_netting(boolean,int,uuid,uuid[],boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_host_settlement_manual_netting(boolean,int,uuid,uuid[],boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_host_settlement_manual_netting(boolean,int,uuid,uuid[],boolean) TO service_role;
