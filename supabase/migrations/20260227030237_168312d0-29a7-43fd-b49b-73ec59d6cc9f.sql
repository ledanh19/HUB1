-- Drop the old overload (p_received_at date) that has bugs and is superseded by the text version
DROP FUNCTION IF EXISTS public.create_ota_payout_cashin_atomic(uuid, numeric, uuid, date, text, text, text, text, uuid);

-- Also fix create_multi_payout_cashin_atomic if it exists with same bug
-- Check and fix the multi version
CREATE OR REPLACE FUNCTION public.create_multi_payout_cashin_atomic(
  p_payout_ids UUID[],
  p_amounts NUMERIC[],
  p_cash_account_id UUID,
  p_received_at TEXT,
  p_payment_method TEXT,
  p_payment_channel TEXT DEFAULT NULL,
  p_bank_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_ids UUID[] := '{}';
  v_collection_id UUID;
  v_ledger_entry_id UUID;
  v_payout RECORD;
  v_account RECORD;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_i INT;
  v_amount NUMERIC;
  v_payout_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  IF array_length(p_payout_ids, 1) != array_length(p_amounts, 1) THEN
    RAISE EXCEPTION 'payout_ids and amounts arrays must have same length';
  END IF;
  
  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'cash_account_id là bắt buộc';
  END IF;
  
  SELECT * INTO v_account FROM cash_accounts
  WHERE id = p_cash_account_id AND is_archived = false AND is_active = true;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản không hoạt động: %', p_cash_account_id;
  END IF;
  
  IF is_period_locked(p_org_id, p_received_at::DATE) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa cho ngày %', p_received_at;
  END IF;
  
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    v_payout_id := p_payout_ids[v_i];
    v_amount := p_amounts[v_i];
    
    IF v_amount <= 0 THEN CONTINUE; END IF;
    
    SELECT * INTO v_payout FROM ota_payouts WHERE id = v_payout_id;
    IF v_payout IS NULL THEN
      RAISE EXCEPTION 'OTA Payout không tồn tại: %', v_payout_id;
    END IF;
    
    INSERT INTO hotel_collects (
      unified_booking_id, amount_collected, payment_method, payee_type, payer_type,
      related_type, collected_at, collected_by, collection_type,
      receipt, note, status
    ) VALUES (
      'OTA-PAYOUT-' || LEFT(v_payout_id::TEXT, 8), v_amount, p_payment_method, 'ROOMRISE', 'OTA',
      'OTA_PAYOUT', p_received_at::TIMESTAMPTZ, v_user_id, 'COLLECT',
      p_bank_reference, COALESCE(p_note, 'Tiền OTA ' || v_payout.ota_source || ' về'), 'COLLECTED'
    ) RETURNING id INTO v_collection_id;
    
    INSERT INTO collection_payout_allocations (collection_id, payout_id, allocated_amount)
    VALUES (v_collection_id, v_payout_id, v_amount);
    
    INSERT INTO ledger_entries (
      org_id, entry_date, posting_at, source_type, source_id, entry_type,
      cash_account_id, account_snapshot, direction, amount, currency,
      counterparty_type, counterparty_id, counterparty_name, created_by, note
    ) VALUES (
      p_org_id, p_received_at::DATE, now(), 'OTA_PAYOUT', v_collection_id, 'ORIGINAL',
      p_cash_account_id,
      jsonb_build_object('code', v_account.account_code, 'name', v_account.account_name,
        'type', v_account.account_type, 'bank_name', v_account.bank_name,
        'account_number', v_account.account_number, 'selected_at', now()::TEXT,
        'selected_by', v_user_id::TEXT),
      'DEBIT', v_amount, 'VND', 'OTA', v_payout.ota_source,
      v_payout.ota_source || ' Payout', v_user_id,
      'OTA Payout Cash-In: ' || COALESCE(p_note, v_payout.ota_source)
    ) RETURNING id INTO v_ledger_entry_id;
    
    INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
    VALUES (p_received_at::DATE, v_amount, 'IN', 'OTA_PAYOUT_CASH_IN', v_collection_id::TEXT, 'OTA',
      'OTA ' || v_payout.ota_source || ' payout - ' || COALESCE(p_bank_reference, ''), v_user_id);
    
    PERFORM recalculate_ota_payout_status_v2(v_payout_id);
    
    INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
    VALUES ('OTA_PAYOUT_CASHIN_ATOMIC', 'hotel_collects', v_collection_id::TEXT, v_user_id,
      jsonb_build_object('payout_id', v_payout_id, 'collection_id', v_collection_id,
        'ledger_entry_id', v_ledger_entry_id, 'amount', v_amount, 'cash_account_id', p_cash_account_id));
    
    v_collection_ids := v_collection_ids || v_collection_id;
  END LOOP;
  
  RETURN v_collection_ids;
END;
$$