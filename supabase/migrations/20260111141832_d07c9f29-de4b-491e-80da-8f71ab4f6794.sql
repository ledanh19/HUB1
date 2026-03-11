-- Fix counterparty_type mapping in create_cash_out_atomic to match constraint
-- Constraint only allows: 'OTA', 'GUEST', 'HOST', 'SERVICE_PARTNER', 'OTHER'
-- Current RPC incorrectly maps to 'INTERNAL' and 'PAYMENT_REQUEST'

CREATE OR REPLACE FUNCTION create_cash_out_atomic(
  p_payment_request_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_paid_at TIMESTAMPTZ,
  p_bank_name TEXT DEFAULT NULL,
  p_account_number TEXT DEFAULT NULL,
  p_account_name TEXT DEFAULT NULL,
  p_transfer_reference TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_is_out_of_process BOOLEAN DEFAULT FALSE,
  p_out_of_process_reason TEXT DEFAULT NULL,
  p_receipt_image TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_total_paid NUMERIC;
  v_remaining NUMERIC;
  v_cash_out_id UUID;
  v_account_id UUID;
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_audit_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;
  
  -- Permission check using server-authoritative helper
  v_has_permission := has_page_use_access('/payments/cashout');

  -- Also allow admin/super_admin/ke_toan role without explicit permission
  IF NOT v_has_permission THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = v_user_id
        AND role IN ('admin', 'super_admin', 'ke_toan')
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Không có quyền ghi nhận chi tiền';
  END IF;
  
  -- Check period lock (if function exists)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_period_locked') THEN
    IF is_period_locked(v_org_id, p_paid_at::DATE) THEN
      RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể tạo chi tiền cho ngày %', p_paid_at::DATE;
    END IF;
  END IF;
  
  -- 1. Lock request row (FOR UPDATE)
  SELECT * INTO v_request
  FROM payment_requests
  WHERE id = p_payment_request_id
  FOR UPDATE;
  
  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Payment request not found: %', p_payment_request_id;
  END IF;
  
  IF v_request.status NOT IN ('APPROVED', 'PAID') THEN
    RAISE EXCEPTION 'Chỉ có thể chi tiền cho đề xuất đã được phê duyệt (current: %)', v_request.status;
  END IF;
  
  -- 2. Calculate remaining (atomic, inside lock)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM cash_outs
  WHERE payment_request_id = p_payment_request_id;
  
  v_remaining := v_request.proposed_amount - v_total_paid;
  
  -- 3. Validate amount (unless out of process)
  IF NOT p_is_out_of_process AND p_amount > v_remaining THEN
    RAISE EXCEPTION 'Số tiền chi (%) vượt quá số còn lại (%)', p_amount, v_remaining;
  END IF;
  
  -- 4. Insert cash_out
  INSERT INTO cash_outs (
    payment_request_id, amount, payment_method, paid_at,
    bank_name, bank_account_number, bank_account_name, transfer_reference,
    recipient_name, note, paid_by, is_out_of_process, out_of_process_reason,
    receipt_image, receipt_status
  )
  VALUES (
    p_payment_request_id, p_amount, p_payment_method, p_paid_at,
    p_bank_name, p_account_number, p_account_name, p_transfer_reference,
    p_recipient_name, p_note, v_user_id, p_is_out_of_process, p_out_of_process_reason,
    p_receipt_image, CASE WHEN p_receipt_image IS NOT NULL THEN 'UPLOADED' ELSE 'PENDING' END
  )
  RETURNING id INTO v_cash_out_id;
  
  -- 5. Resolve account + insert ledger (if functions exist)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_account_mapping') THEN
    v_account_id := resolve_account_mapping(
      'OUT', 'CASH_OUT', v_request.payment_type, p_payment_method, NULL
    );
    
    PERFORM post_ledger_entry_idempotent(
      'CASH_OUT', v_cash_out_id, v_account_id, 'CREDIT', p_amount,
      p_paid_at::DATE, 'PAYMENT_REQUEST', p_payment_request_id::TEXT, p_note
    );
  END IF;
  
  -- 6. Update request status if fully paid
  IF (v_total_paid + p_amount) >= v_request.proposed_amount THEN
    UPDATE payment_requests SET status = 'PAID' WHERE id = p_payment_request_id;
  END IF;
  
  -- 7. Insert cashflow_entries
  -- FIX: counterparty_type must be one of: 'OTA', 'GUEST', 'HOST', 'SERVICE_PARTNER', 'OTHER'
  INSERT INTO cashflow_entries (
    cash_date, source_type, source_id, direction,
    counterparty_type, counterparty_id, amount, created_by, note
  )
  VALUES (
    p_paid_at::DATE, 
    CASE 
      WHEN v_request.payment_type = 'HOST_PAYMENT' AND v_request.settlement_id IS NOT NULL THEN 'HOST_SETTLEMENT_PAYMENT'
      WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' AND v_request.settlement_id IS NOT NULL THEN 'SERVICE_SETTLEMENT_PAYMENT'
      ELSE 'CASH_OUT'
    END,
    CASE 
      WHEN v_request.settlement_id IS NOT NULL THEN v_request.settlement_id::TEXT
      ELSE v_cash_out_id::TEXT
    END,
    'OUT',
    -- FIX: Map to valid counterparty_type values
    CASE 
      WHEN v_request.payment_type = 'HOST_PAYMENT' THEN 'HOST'
      WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' THEN 'SERVICE_PARTNER'
      WHEN v_request.payment_type = 'OTA_COMMISSION' THEN 'OTA'
      ELSE 'OTHER'  -- INTERNAL_EXPENSE and unknown types map to OTHER
    END,
    COALESCE(v_request.partner_id::TEXT, v_request.expense_category),
    p_amount, v_user_id, p_note
  );
  
  -- 8. Audit log - FAIL FAST if insert fails
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES (
    'Ghi nhận chi tiền (atomic)',
    'cash_outs',
    v_cash_out_id::TEXT,
    v_user_id,
    jsonb_build_object(
      'amount', p_amount,
      'payment_method', p_payment_method,
      'request_code', v_request.request_code,
      'ledger_account_id', v_account_id
    )
  )
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit log failed - transaction rolled back';
  END IF;
  
  RETURN v_cash_out_id;
END;
$$;