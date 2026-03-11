
-- Sprint 6-9 Part B: Atomic adjustment + Recon functions

CREATE OR REPLACE FUNCTION public.create_payout_adjustment_atomic(
  p_payout_id UUID, p_item_type TEXT, p_amount NUMERIC,
  p_direction TEXT DEFAULT 'DEBIT', p_note TEXT DEFAULT NULL,
  p_adj_category TEXT DEFAULT NULL, p_economic_date DATE DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID; v_payout RECORD; v_item_id UUID; v_ledger_id UUID; v_econ_date DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role IN ('admin','ke_toan','super_admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_item_id FROM public.ota_payout_reconciliation_items WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_item_id IS NOT NULL THEN RETURN v_item_id; END IF;
  END IF;
  SELECT * INTO v_payout FROM public.ota_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYOUT_NOT_FOUND'; END IF;
  IF v_payout.is_voided THEN RAISE EXCEPTION 'PAYOUT_VOIDED'; END IF;
  v_econ_date := COALESCE(p_economic_date, v_payout.payout_date::date, CURRENT_DATE);
  IF EXISTS (SELECT 1 FROM public.accounting_periods WHERE v_econ_date BETWEEN period_start::date AND period_end::date AND is_locked = true) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa cho ngày %', v_econ_date;
  END IF;
  INSERT INTO public.ota_payout_reconciliation_items (payout_id, item_type, amount, direction, note, adj_category, economic_date, idempotency_key, created_by)
  VALUES (p_payout_id, p_item_type, p_amount, p_direction, p_note, p_adj_category, v_econ_date, p_idempotency_key, v_user_id)
  RETURNING id INTO v_item_id;
  IF p_item_type = 'BANK_FEE' THEN
    UPDATE public.ota_payouts SET bank_fee_total = COALESCE(bank_fee_total,0) + p_amount WHERE id = p_payout_id;
  ELSIF p_item_type IN ('ADJUSTMENT','DEDUCTION') THEN
    UPDATE public.ota_payouts SET adjustment_total = COALESCE(adjustment_total,0) + CASE WHEN p_direction='CREDIT' THEN p_amount ELSE -p_amount END WHERE id = p_payout_id;
  END IF;
  INSERT INTO public.ledger_entries (entry_date, source_type, source_id, amount, direction, counterparty_type, note, created_by)
  VALUES (v_econ_date, 'OTA_PAYOUT_'||p_item_type, v_item_id, p_amount, p_direction, 'OTA', COALESCE(p_note, p_item_type||' for payout '||p_payout_id::text), v_user_id)
  RETURNING id INTO v_ledger_id;
  UPDATE public.ota_payout_reconciliation_items SET ledger_entry_id = v_ledger_id WHERE id = v_item_id;
  INSERT INTO public.audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES ('CREATE_PAYOUT_ADJUSTMENT','ota_payout_reconciliation_items', v_item_id::text, v_user_id,
    jsonb_build_object('payout_id',p_payout_id,'item_type',p_item_type,'amount',p_amount,'direction',p_direction,'ledger_entry_id',v_ledger_id));
  RETURN v_item_id;
END; $$;

CREATE OR REPLACE FUNCTION public.run_financial_reconciliation()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_run_id UUID; v_payout_count INT; v_mismatch_count INT := 0; v_payout RECORD; v_detail_sum NUMERIC;
BEGIN
  INSERT INTO public.recon_runs (status) VALUES ('RUNNING') RETURNING id INTO v_run_id;
  BEGIN
    SELECT COUNT(*) INTO v_payout_count FROM public.ota_payouts WHERE is_voided = false;
    FOR v_payout IN SELECT p.id, p.total_amount FROM public.ota_payouts p WHERE p.is_voided = false LOOP
      SELECT COALESCE(SUM(d.expected_amount),0) INTO v_detail_sum FROM public.ota_payout_details d WHERE d.payout_id = v_payout.id AND d.is_active = true;
      IF ABS(v_detail_sum - COALESCE(v_payout.total_amount,0)) > 1 THEN v_mismatch_count := v_mismatch_count + 1; END IF;
    END LOOP;
    UPDATE public.recon_runs SET status='COMPLETED', finished_at=now(), summary=jsonb_build_object('total_payouts',v_payout_count,'header_detail_mismatches',v_mismatch_count,'ran_at',now()::text) WHERE id = v_run_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.recon_runs SET status='FAILED', finished_at=now(), error_message=SQLERRM WHERE id = v_run_id;
  END;
  RETURN v_run_id;
END; $$;
