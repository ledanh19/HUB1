-- ============================================================
-- PERMISSION SYSTEM v2.1 - COMBINED MIGRATION (with DROP)
-- ============================================================

-- DROP existing functions to allow return type change
DROP FUNCTION IF EXISTS public.get_user_page_permissions(UUID);
DROP FUNCTION IF EXISTS public.has_page_use_access(UUID, TEXT);
DROP FUNCTION IF EXISTS public.has_page_use_access(TEXT);

-- ============================================================
-- PART A: Add can_use column to user_page_permissions
-- ============================================================

ALTER TABLE public.user_page_permissions 
ADD COLUMN IF NOT EXISTS can_use BOOLEAN NOT NULL DEFAULT true;

-- Create function with new return type
CREATE OR REPLACE FUNCTION public.get_user_page_permissions(_user_id UUID)
RETURNS TABLE(page_path TEXT, can_use BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT page_path, can_use
    FROM public.user_page_permissions
    WHERE user_id = _user_id
$$;

-- 2-param version
CREATE OR REPLACE FUNCTION public.has_page_use_access(_user_id UUID, _page_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_page_permissions
        WHERE user_id = _user_id
          AND page_path = RTRIM(_page_path, '/')
          AND can_use = true
    )
$$;

CREATE INDEX IF NOT EXISTS idx_user_page_permissions_can_use 
ON public.user_page_permissions(user_id, page_path, can_use);

COMMENT ON COLUMN public.user_page_permissions.can_use IS 
'Permission to perform actions on the page. DEFAULT FALSE = view-only, TRUE = full action access.';

-- ============================================================
-- PART B: Fix can_use DEFAULT to FALSE
-- ============================================================

ALTER TABLE public.user_page_permissions 
ALTER COLUMN can_use SET DEFAULT false;

-- ============================================================
-- PART C: 1-param overload using auth.uid()
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_page_use_access(_page_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_page_permissions
        WHERE user_id = auth.uid()
          AND page_path = RTRIM(_page_path, '/')
          AND can_use = true
    )
$$;

COMMENT ON FUNCTION public.has_page_use_access(TEXT) IS 
'Check if CURRENT USER (auth.uid()) has can_use permission. Server-authoritative.';

-- ============================================================
-- PART D: Secure RPCs with fail-fast audit
-- ============================================================

-- 1. APPROVE PAYMENT REQUEST
CREATE OR REPLACE FUNCTION public.approve_payment_request_secure(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_request_status TEXT;
  v_request RECORD;
  v_audit_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập';
  END IF;

  v_has_permission := has_page_use_access('/payments/requests');

  IF NOT v_has_permission THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
    ) INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Không có quyền phê duyệt đề xuất thanh toán';
  END IF;

  SELECT status INTO v_request_status FROM payment_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đề xuất thanh toán';
  END IF;

  IF v_request_status != 'PENDING' THEN
    RAISE EXCEPTION 'Đề xuất không ở trạng thái chờ duyệt (status: %)', v_request_status;
  END IF;

  UPDATE payment_requests
  SET status = 'APPROVED', approved_by = v_user_id, approved_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES ('APPROVE_PAYMENT_REQUEST', 'payment_requests', p_request_id::TEXT, v_user_id, row_to_json(v_request))
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit log failed - transaction rolled back';
  END IF;

  RETURN p_request_id;
END;
$$;

-- 2. REJECT PAYMENT REQUEST
CREATE OR REPLACE FUNCTION public.reject_payment_request_secure(p_request_id UUID, p_rejection_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_request_status TEXT;
  v_request RECORD;
  v_audit_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

  v_has_permission := has_page_use_access('/payments/requests');

  IF NOT v_has_permission THEN
    SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'super_admin'))
    INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN
    RAISE EXCEPTION 'Không có quyền từ chối đề xuất thanh toán';
  END IF;

  SELECT status INTO v_request_status FROM payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đề xuất thanh toán'; END IF;
  IF v_request_status != 'PENDING' THEN RAISE EXCEPTION 'Đề xuất không ở trạng thái chờ duyệt (status: %)', v_request_status; END IF;

  UPDATE payment_requests
  SET status = 'REJECTED', rejected_by = v_user_id, rejected_at = NOW(), rejection_reason = p_rejection_reason
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES ('REJECT_PAYMENT_REQUEST', 'payment_requests', p_request_id::TEXT, v_user_id, row_to_json(v_request))
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN RAISE EXCEPTION 'Audit log failed - transaction rolled back'; END IF;

  RETURN p_request_id;
END;
$$;

-- 3. FINALIZE SETTLEMENT
CREATE OR REPLACE FUNCTION public.finalize_settlement_secure(p_settlement_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_settlement RECORD;
  v_audit_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

  v_has_permission := has_page_use_access('/host-payables/settlement');

  IF NOT v_has_permission THEN
    SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'super_admin', 'ke_toan'))
    INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN RAISE EXCEPTION 'Không có quyền quyết toán Settlement'; END IF;

  SELECT * INTO v_settlement FROM host_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy Settlement'; END IF;
  IF v_settlement.status != 'DRAFT' THEN RAISE EXCEPTION 'Settlement không ở trạng thái DRAFT (status: %)', v_settlement.status; END IF;

  UPDATE host_settlements SET status = 'SETTLED', finalized_at = NOW(), finalized_by = v_user_id WHERE id = p_settlement_id;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES ('FINALIZE_SETTLEMENT', 'host_settlements', p_settlement_id::TEXT, v_user_id, row_to_json(v_settlement), jsonb_build_object('status', 'SETTLED', 'finalized_at', NOW(), 'finalized_by', v_user_id))
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN RAISE EXCEPTION 'Audit log failed - transaction rolled back'; END IF;

  RETURN p_settlement_id;
END;
$$;

-- 4. CLOSE SETTLEMENT
CREATE OR REPLACE FUNCTION public.close_settlement_secure(p_settlement_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_has_permission BOOLEAN;
  v_settlement RECORD;
  v_audit_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;

  v_has_permission := has_page_use_access('/host-payables/settlement');

  IF NOT v_has_permission THEN
    SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'super_admin', 'ke_toan'))
    INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN RAISE EXCEPTION 'Không có quyền đóng kỳ Settlement'; END IF;

  SELECT * INTO v_settlement FROM host_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy Settlement'; END IF;
  IF v_settlement.status != 'SETTLED' THEN RAISE EXCEPTION 'Settlement không ở trạng thái SETTLED (status: %)', v_settlement.status; END IF;

  UPDATE host_settlements SET status = 'CLOSED' WHERE id = p_settlement_id;

  INSERT INTO audit_logs (action, entity, entity_id, user_id, before_data, after_data)
  VALUES ('CLOSE_SETTLEMENT', 'host_settlements', p_settlement_id::TEXT, v_user_id, row_to_json(v_settlement), jsonb_build_object('status', 'CLOSED'))
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN RAISE EXCEPTION 'Audit log failed - transaction rolled back'; END IF;

  RETURN p_settlement_id;
END;
$$;

-- 5. CREATE CASH OUT ATOMIC
CREATE OR REPLACE FUNCTION public.create_cash_out_atomic(
  p_payment_request_id UUID, p_amount NUMERIC, p_payment_method TEXT, p_paid_at TIMESTAMPTZ,
  p_bank_name TEXT DEFAULT NULL, p_account_number TEXT DEFAULT NULL, p_account_name TEXT DEFAULT NULL,
  p_transfer_reference TEXT DEFAULT NULL, p_recipient_name TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL,
  p_is_out_of_process BOOLEAN DEFAULT false, p_out_of_process_reason TEXT DEFAULT NULL, p_receipt_image TEXT DEFAULT NULL
) RETURNS UUID
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
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập'; END IF;
  
  v_has_permission := has_page_use_access('/payments/cashout');

  IF NOT v_has_permission THEN
    SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role IN ('admin', 'super_admin', 'ke_toan'))
    INTO v_has_permission;
  END IF;

  IF NOT v_has_permission THEN RAISE EXCEPTION 'Không có quyền ghi nhận chi tiền'; END IF;
  
  IF is_period_locked(v_org_id, p_paid_at::DATE) THEN
    RAISE EXCEPTION 'Kỳ kế toán đã khóa. Không thể tạo chi tiền cho ngày %', p_paid_at::DATE;
  END IF;
  
  SELECT * INTO v_request FROM payment_requests WHERE id = p_payment_request_id FOR UPDATE;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Payment request not found: %', p_payment_request_id; END IF;
  IF v_request.status NOT IN ('APPROVED', 'PAID') THEN RAISE EXCEPTION 'Chỉ có thể chi tiền cho đề xuất đã được phê duyệt (current: %)', v_request.status; END IF;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM cash_outs WHERE payment_request_id = p_payment_request_id;
  v_remaining := v_request.proposed_amount - v_total_paid;
  
  IF NOT p_is_out_of_process AND p_amount > v_remaining THEN
    RAISE EXCEPTION 'Số tiền chi (%) vượt quá số còn lại (%)', p_amount, v_remaining;
  END IF;
  
  INSERT INTO cash_outs (payment_request_id, amount, payment_method, paid_at, bank_name, bank_account_number, bank_account_name, transfer_reference, recipient_name, note, paid_by, is_out_of_process, out_of_process_reason, receipt_image, receipt_status)
  VALUES (p_payment_request_id, p_amount, p_payment_method, p_paid_at, p_bank_name, p_account_number, p_account_name, p_transfer_reference, p_recipient_name, p_note, v_user_id, p_is_out_of_process, p_out_of_process_reason, p_receipt_image, CASE WHEN p_receipt_image IS NOT NULL THEN 'UPLOADED' ELSE 'PENDING' END)
  RETURNING id INTO v_cash_out_id;
  
  v_account_id := resolve_account_mapping('OUT', 'CASH_OUT', v_request.payment_type, p_payment_method, NULL);
  PERFORM post_ledger_entry_idempotent('CASH_OUT', v_cash_out_id, v_account_id, 'CREDIT', p_amount, p_paid_at::DATE, 'PAYMENT_REQUEST', p_payment_request_id::TEXT, p_note);
  
  IF (v_total_paid + p_amount) >= v_request.proposed_amount THEN
    UPDATE payment_requests SET status = 'PAID' WHERE id = p_payment_request_id;
  END IF;
  
  INSERT INTO cashflow_entries (cash_date, source_type, source_id, direction, counterparty_type, counterparty_id, amount, created_by, note)
  VALUES (p_paid_at::DATE, 
    CASE WHEN v_request.payment_type = 'HOST_PAYMENT' AND v_request.settlement_id IS NOT NULL THEN 'HOST_SETTLEMENT_PAYMENT'
         WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' AND v_request.settlement_id IS NOT NULL THEN 'SERVICE_SETTLEMENT_PAYMENT'
         WHEN v_request.payment_type = 'INTERNAL_EXPENSE' THEN 'INTERNAL_EXPENSE'
         WHEN v_request.payment_type = 'OTA_COMMISSION' THEN 'OTA_COMMISSION'
         ELSE 'CASH_OUT' END,
    CASE WHEN v_request.settlement_id IS NOT NULL THEN v_request.settlement_id::TEXT ELSE v_cash_out_id::TEXT END,
    'OUT',
    CASE WHEN v_request.payment_type = 'HOST_PAYMENT' THEN 'HOST'
         WHEN v_request.payment_type = 'SERVICE_PARTNER_PAYMENT' THEN 'SERVICE_PARTNER'
         WHEN v_request.payment_type = 'INTERNAL_EXPENSE' THEN 'INTERNAL'
         WHEN v_request.payment_type = 'OTA_COMMISSION' THEN 'OTA'
         ELSE 'PAYMENT_REQUEST' END,
    COALESCE(v_request.partner_id::TEXT, v_request.expense_category), p_amount, v_user_id, p_note);
  
  INSERT INTO audit_logs (action, entity, entity_id, user_id, after_data)
  VALUES ('Ghi nhận chi tiền (atomic)', 'cash_outs', v_cash_out_id::TEXT, v_user_id, jsonb_build_object('amount', p_amount, 'payment_method', p_payment_method, 'request_code', v_request.request_code, 'ledger_account_id', v_account_id))
  RETURNING id INTO v_audit_id;
  
  IF v_audit_id IS NULL THEN RAISE EXCEPTION 'Audit log failed - transaction rolled back'; END IF;
  
  RETURN v_cash_out_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.approve_payment_request_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment_request_secure(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_settlement_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_settlement_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_page_use_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_page_use_access(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_page_permissions(UUID) TO authenticated;