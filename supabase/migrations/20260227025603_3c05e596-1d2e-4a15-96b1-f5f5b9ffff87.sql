
-- Fix: entry_date is DATE but p_received_at is TEXT
-- Cast p_received_at::DATE for ledger_entries and p_received_at::DATE for cashflow_entries

-- ============================================
-- FIX: create_multi_payout_cashin_atomic
-- ============================================
CREATE OR REPLACE FUNCTION public.create_multi_payout_cashin_atomic(
  p_payout_ids UUID[],
  p_amounts NUMERIC[],
  p_total_amount NUMERIC,
  p_cash_account_id UUID,
  p_received_at TEXT,
  p_payment_method TEXT,
  p_payment_channel TEXT DEFAULT NULL,
  p_bank_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_id UUID;
  v_ledger_entry_id UUID;
  v_account RECORD;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_payout RECORD;
  v_ota_source TEXT;
  v_i INT;
  v_sum_alloc NUMERIC := 0;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: Chỉ Kế toán hoặc Admin mới được ghi nhận tiền OTA về';
  END IF;
  
  IF array_length(p_payout_ids, 1) IS NULL OR array_length(p_payout_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Phải chọn ít nhất 1 payout';
  END IF;
  
  IF array_length(p_payout_ids, 1) != array_length(p_amounts, 1) THEN
    RAISE EXCEPTION 'Số lượng payout_ids và amounts không khớp';
  END IF;
  
  FOR v_i IN 1..array_length(p_amounts, 1) LOOP
    IF p_amounts[v_i] <= 0 THEN
      RAISE EXCEPTION 'Số tiền phân bổ phải > 0 (index %)', v_i;
    END IF;
    v_sum_alloc := v_sum_alloc + p_amounts[v_i];
  END LOOP;
  
  IF v_sum_alloc != p_total_amount THEN
    RAISE EXCEPTION 'Tổng phân bổ (%) không khớp tổng tiền (%)', v_sum_alloc, p_total_amount;
  END IF;
  
  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'cash_account_id là bắt buộc.';
  END IF;
  
  SELECT * INTO v_account FROM cash_accounts 
  WHERE id = p_cash_account_id AND is_archived = false AND is_active = true;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản không hoạt động: %', p_cash_account_id;
  END IF;
  
  IF is_period_locked(p_org_id, p_received_at::DATE) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa cho ngày %', p_received_at;
  END IF;
  
  -- Validate all payouts exist and belong to same OTA source
  v_ota_source := NULL;
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_ids[v_i];
    IF v_payout IS NULL THEN
      RAISE EXCEPTION 'OTA Payout không tồn tại: %', p_payout_ids[v_i];
    END IF;
    IF v_ota_source IS NULL THEN
      v_ota_source := v_payout.ota_source;
    ELSIF v_ota_source != v_payout.ota_source THEN
      RAISE EXCEPTION 'Tất cả payout phải cùng nguồn OTA';
    END IF;
  END LOOP;
  
  -- INSERT SINGLE HOTEL_COLLECTS
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method, payee_type, payer_type,
    related_type, collected_at, collected_by, collection_type,
    receipt, note, status
  )
  VALUES (
    'OTA-PAYOUT-' || LEFT(p_payout_ids[1]::TEXT, 8),
    p_total_amount,
    p_payment_method,
    'ROOMRISE',
    'OTA',
    'OTA_PAYOUT',
    p_received_at::TIMESTAMPTZ,
    v_user_id,
    'COLLECT',
    p_bank_reference,
    COALESCE(p_note, 'Tiền OTA ' || v_ota_source || ' về (' || array_length(p_payout_ids, 1) || ' payout)'),
    'COLLECTED'
  )
  RETURNING id INTO v_collection_id;
  
  -- INSERT ALLOCATION RECORDS
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    INSERT INTO collection_payout_allocations (collection_id, payout_id, allocated_amount)
    VALUES (v_collection_id, p_payout_ids[v_i], p_amounts[v_i]);
  END LOOP;
  
  -- INSERT LEDGER ENTRY - FIX: cast p_received_at::DATE
  INSERT INTO ledger_entries (
    org_id, entry_date, posting_at, source_type, source_id, entry_type,
    cash_account_id, account_snapshot, direction, amount, currency,
    counterparty_type, counterparty_id, counterparty_name, created_by, note
  )
  VALUES (
    p_org_id,
    p_received_at::DATE,
    now(),
    'OTA_PAYOUT',
    v_collection_id,
    'ORIGINAL',
    p_cash_account_id,
    jsonb_build_object(
      'code', v_account.account_code, 'name', v_account.account_name,
      'type', v_account.account_type, 'bank_name', v_account.bank_name,
      'account_number', v_account.account_number, 'selected_at', now()::TEXT,
      'selected_by', v_user_id::TEXT
    ),
    'DEBIT',
    p_total_amount,
    'VND',
    'OTA',
    v_ota_source,
    v_ota_source || ' Payout (' || array_length(p_payout_ids, 1) || ')',
    v_user_id,
    'OTA Payout Cash-In: ' || COALESCE(p_note, v_ota_source || ' x' || array_length(p_payout_ids, 1))
  )
  RETURNING id INTO v_ledger_entry_id;
  
  -- INSERT CASHFLOW ENTRY - FIX: cast p_received_at::DATE
  INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
  VALUES (p_received_at::DATE, p_total_amount, 'IN', 'OTA_PAYOUT_CASH_IN', v_collection_id::TEXT, 'OTA',
    'OTA ' || v_ota_source || ' payout x' || array_length(p_payout_ids, 1) || ' - ' || COALESCE(p_bank_reference, ''), v_user_id);
  
  -- UPDATE EACH PAYOUT STATUS
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    PERFORM recalculate_ota_payout_status_v2(p_payout_ids[v_i]);
  END LOOP;
  
  -- AUDIT LOG
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES ('OTA_MULTI_PAYOUT_CASHIN', 'hotel_collects', v_collection_id::TEXT, v_user_id,
    jsonb_build_object(
      'collection_id', v_collection_id,
      'ledger_entry_id', v_ledger_entry_id,
      'total_amount', p_total_amount,
      'cash_account_id', p_cash_account_id,
      'payout_count', array_length(p_payout_ids, 1),
      'payout_ids', to_jsonb(p_payout_ids),
      'amounts', to_jsonb(p_amounts),
      'ota_source', v_ota_source
    ));
  
  RETURN v_collection_id;
END;
$$;

-- ============================================
-- FIX: record_single_ota_payout_cashin (same TEXT→DATE bug)
-- ============================================
