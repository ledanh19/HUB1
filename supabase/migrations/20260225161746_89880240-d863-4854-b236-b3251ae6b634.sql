
-- ============================================
-- MULTI-PAYOUT SINGLE COLLECTION
-- ============================================

-- PART A: JUNCTION TABLE
CREATE TABLE IF NOT EXISTS public.collection_payout_allocations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID NOT NULL REFERENCES public.hotel_collects(id) ON DELETE CASCADE,
  payout_id UUID NOT NULL REFERENCES public.ota_payouts(id) ON DELETE CASCADE,
  allocated_amount NUMERIC NOT NULL CHECK (allocated_amount > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collection_id, payout_id)
);

CREATE INDEX IF NOT EXISTS idx_cpa_collection_id ON public.collection_payout_allocations(collection_id);
CREATE INDEX IF NOT EXISTS idx_cpa_payout_id ON public.collection_payout_allocations(payout_id);

COMMENT ON TABLE public.collection_payout_allocations IS 
'Junction table linking 1 hotel_collects (phiếu thu) to N ota_payouts with allocated amounts.';

ALTER TABLE public.collection_payout_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read allocations"
  ON public.collection_payout_allocations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert allocations"
  ON public.collection_payout_allocations FOR INSERT
  TO authenticated WITH CHECK (true);

-- PART B: BATCH RPC
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
  
  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Tổng số tiền phải lớn hơn 0';
  END IF;
  
  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'cash_account_id là bắt buộc. Vui lòng chọn tài khoản nhận tiền.';
  END IF;
  
  FOR v_i IN 1..array_length(p_amounts, 1) LOOP
    IF p_amounts[v_i] <= 0 THEN
      RAISE EXCEPTION 'Số tiền phân bổ cho mỗi payout phải lớn hơn 0';
    END IF;
    v_sum_alloc := v_sum_alloc + p_amounts[v_i];
  END LOOP;
  
  IF v_sum_alloc != p_total_amount THEN
    RAISE EXCEPTION 'Tổng phân bổ (%) không khớp tổng tiền nhận (%)', v_sum_alloc, p_total_amount;
  END IF;
  
  SELECT * INTO v_account FROM cash_accounts 
  WHERE id = p_cash_account_id AND is_archived = false AND is_active = true;
  
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản không tồn tại hoặc không hoạt động: %', p_cash_account_id;
  END IF;
  
  IF is_period_locked(p_org_id, p_received_at) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể ghi nhận tiền vào ngày %', p_received_at;
  END IF;
  
  SELECT ota_source INTO v_ota_source 
  FROM ota_payouts WHERE id = p_payout_ids[1];
  
  IF v_ota_source IS NULL THEN
    RAISE EXCEPTION 'OTA Payout không tồn tại: %', p_payout_ids[1];
  END IF;
  
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    IF NOT EXISTS (SELECT 1 FROM ota_payouts WHERE id = p_payout_ids[v_i]) THEN
      RAISE EXCEPTION 'OTA Payout không tồn tại: %', p_payout_ids[v_i];
    END IF;
  END LOOP;
  
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
  
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    INSERT INTO collection_payout_allocations (collection_id, payout_id, allocated_amount)
    VALUES (v_collection_id, p_payout_ids[v_i], p_amounts[v_i]);
  END LOOP;
  
  INSERT INTO ledger_entries (
    org_id, entry_date, posting_at, source_type, source_id, entry_type,
    cash_account_id, account_snapshot, direction, amount, currency,
    counterparty_type, counterparty_id, counterparty_name, created_by, note
  )
  VALUES (
    p_org_id,
    p_received_at,
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
  
  INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
  VALUES (p_received_at, p_total_amount, 'IN', 'OTA_PAYOUT_CASH_IN', v_collection_id::TEXT, 'OTA',
    'OTA ' || v_ota_source || ' payout x' || array_length(p_payout_ids, 1) || ' - ' || COALESCE(p_bank_reference, ''), v_user_id);
  
  FOR v_i IN 1..array_length(p_payout_ids, 1) LOOP
    PERFORM recalculate_ota_payout_status_v2(p_payout_ids[v_i]);
  END LOOP;
  
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

-- PART C: RECALCULATE STATUS
CREATE OR REPLACE FUNCTION public.recalculate_ota_payout_status_v2(
  p_payout_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout RECORD;
  v_total_received NUMERIC;
  v_expected_amount NUMERIC;
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
  
  IF v_payout IS NULL THEN
    RETURN;
  END IF;
  
  WITH voided_ids AS (
    SELECT related_collection_id 
    FROM hotel_collects 
    WHERE id IN (SELECT collection_id FROM collection_payout_allocations WHERE payout_id = p_payout_id)
    AND collection_type = 'VOID'
    AND related_collection_id IS NOT NULL
  )
  SELECT COALESCE(SUM(cpa.allocated_amount), 0)
  INTO v_total_received
  FROM collection_payout_allocations cpa
  INNER JOIN hotel_collects hc ON hc.id = cpa.collection_id
  WHERE cpa.payout_id = p_payout_id
    AND hc.collection_type = 'COLLECT'
    AND hc.id NOT IN (SELECT related_collection_id FROM voided_ids WHERE related_collection_id IS NOT NULL);
  
  v_expected_amount := COALESCE(v_payout.net_payout_amount, v_payout.total_amount, 0);
  
  IF v_total_received <= 0 THEN
    v_new_status := 'PENDING';
  ELSIF v_total_received >= v_expected_amount THEN
    v_new_status := 'RECEIVED';
  ELSE
    v_new_status := 'PARTIAL';
  END IF;
  
  UPDATE ota_payouts 
  SET 
    status = v_new_status,
    reconciled_at = CASE 
      WHEN v_new_status = 'RECEIVED' THEN COALESCE(reconciled_at, now())
      ELSE NULL 
    END
  WHERE id = p_payout_id;
END;
$$;

-- PART D: UPDATED REVERSE
CREATE OR REPLACE FUNCTION public.reverse_ota_payout_cashin(
  p_collection_id UUID,
  p_reason TEXT,
  p_org_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection RECORD;
  v_ledger_entry RECORD;
  v_reversal_id UUID;
  v_payout_id UUID;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_alloc RECORD;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: Chỉ Kế toán hoặc Admin mới được đảo bút toán';
  END IF;
  
  SELECT * INTO v_collection 
  FROM hotel_collects 
  WHERE id = p_collection_id 
    AND related_type = 'OTA_PAYOUT';
  
  IF v_collection IS NULL THEN
    RAISE EXCEPTION 'Thu tiền OTA Payout không tồn tại: %', p_collection_id;
  END IF;
  
  IF is_period_locked(p_org_id, v_collection.collected_at::DATE) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể đảo bút toán cho ngày %', v_collection.collected_at::DATE;
  END IF;
  
  SELECT * INTO v_ledger_entry 
  FROM ledger_entries 
  WHERE source_type = 'OTA_PAYOUT' 
    AND source_id = p_collection_id
    AND entry_type = 'ORIGINAL'
    AND is_reversed = false;
  
  IF v_ledger_entry IS NOT NULL THEN
    SELECT reverse_ledger_entry(v_ledger_entry.id, p_reason) INTO v_reversal_id;
  END IF;
  
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method, payee_type, payer_type,
    related_type, related_collection_id, collected_at, collected_by,
    collection_type, note, status
  )
  VALUES (
    v_collection.unified_booking_id, v_collection.amount_collected, v_collection.payment_method,
    v_collection.payee_type, v_collection.payer_type, v_collection.related_type,
    p_collection_id, now(), v_user_id,
    'VOID', 'VOID: ' || p_reason, 'VOIDED'
  );
  
  FOR v_alloc IN 
    SELECT payout_id FROM collection_payout_allocations WHERE collection_id = p_collection_id
  LOOP
    PERFORM recalculate_ota_payout_status_v2(v_alloc.payout_id);
  END LOOP;
  
  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES (
    'OTA_PAYOUT_CASHIN_REVERSED', 'hotel_collects', p_collection_id::TEXT, v_user_id,
    jsonb_build_object(
      'collection_id', p_collection_id,
      'original_amount', v_collection.amount_collected
    ),
    jsonb_build_object('reason', p_reason, 'reversal_ledger_id', v_reversal_id)
  );
  
  RETURN v_reversal_id;
END;
$$;

-- PART E: UPDATE OLD SINGLE-PAYOUT RPC
CREATE OR REPLACE FUNCTION public.create_ota_payout_cashin_atomic(
  p_payout_id UUID,
  p_amount NUMERIC,
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
AS $$
DECLARE
  v_collection_id UUID;
  v_ledger_entry_id UUID;
  v_payout RECORD;
  v_account RECORD;
  v_user_id UUID;
  v_has_permission BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'ke_toan')
  ) INTO v_has_permission;
  
  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Permission denied: Chỉ Kế toán hoặc Admin mới được ghi nhận tiền OTA về';
  END IF;
  
  SELECT * INTO v_payout FROM ota_payouts WHERE id = p_payout_id;
  IF v_payout IS NULL THEN RAISE EXCEPTION 'OTA Payout không tồn tại: %', p_payout_id; END IF;
  IF p_cash_account_id IS NULL THEN RAISE EXCEPTION 'cash_account_id là bắt buộc.'; END IF;
  
  SELECT * INTO v_account FROM cash_accounts 
  WHERE id = p_cash_account_id AND is_archived = false AND is_active = true;
  IF v_account IS NULL THEN RAISE EXCEPTION 'Tài khoản không hoạt động: %', p_cash_account_id; END IF;
  
  IF is_period_locked(p_org_id, p_received_at) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa cho ngày %', p_received_at;
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Số tiền phải > 0'; END IF;
  
  INSERT INTO hotel_collects (
    unified_booking_id, amount_collected, payment_method, payee_type, payer_type,
    related_type, collected_at, collected_by, collection_type,
    receipt, note, status
  ) VALUES (
    'OTA-PAYOUT-' || LEFT(p_payout_id::TEXT, 8), p_amount, p_payment_method, 'ROOMRISE', 'OTA',
    'OTA_PAYOUT', p_received_at::TIMESTAMPTZ, v_user_id, 'COLLECT',
    p_bank_reference, COALESCE(p_note, 'Tiền OTA ' || v_payout.ota_source || ' về'), 'COLLECTED'
  ) RETURNING id INTO v_collection_id;
  
  INSERT INTO collection_payout_allocations (collection_id, payout_id, allocated_amount)
  VALUES (v_collection_id, p_payout_id, p_amount);
  
  INSERT INTO ledger_entries (
    org_id, entry_date, posting_at, source_type, source_id, entry_type,
    cash_account_id, account_snapshot, direction, amount, currency,
    counterparty_type, counterparty_id, counterparty_name, created_by, note
  ) VALUES (
    p_org_id, p_received_at, now(), 'OTA_PAYOUT', v_collection_id, 'ORIGINAL',
    p_cash_account_id,
    jsonb_build_object('code', v_account.account_code, 'name', v_account.account_name,
      'type', v_account.account_type, 'bank_name', v_account.bank_name,
      'account_number', v_account.account_number, 'selected_at', now()::TEXT,
      'selected_by', v_user_id::TEXT),
    'DEBIT', p_amount, 'VND', 'OTA', v_payout.ota_source,
    v_payout.ota_source || ' Payout', v_user_id,
    'OTA Payout Cash-In: ' || COALESCE(p_note, v_payout.ota_source)
  ) RETURNING id INTO v_ledger_entry_id;
  
  INSERT INTO cashflow_entries (cash_date, amount, direction, source_type, source_id, counterparty_type, note, created_by)
  VALUES (p_received_at, p_amount, 'IN', 'OTA_PAYOUT_CASH_IN', v_collection_id::TEXT, 'OTA',
    'OTA ' || v_payout.ota_source || ' payout - ' || COALESCE(p_bank_reference, ''), v_user_id);
  
  PERFORM recalculate_ota_payout_status_v2(p_payout_id);
  
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES ('OTA_PAYOUT_CASHIN_ATOMIC', 'hotel_collects', v_collection_id::TEXT, v_user_id,
    jsonb_build_object('payout_id', p_payout_id, 'collection_id', v_collection_id,
      'ledger_entry_id', v_ledger_entry_id, 'amount', p_amount, 'cash_account_id', p_cash_account_id));
  
  RETURN v_collection_id;
END;
$$;

-- PART F: GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.create_multi_payout_cashin_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_ota_payout_status_v2 TO authenticated;

COMMENT ON FUNCTION public.create_multi_payout_cashin_atomic IS 
'Batch ghi nhận tiền OTA Payout về. Tạo 1 phiếu thu cho N payouts.';
